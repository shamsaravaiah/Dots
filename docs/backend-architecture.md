# Backend Architecture Blueprint

This document outlines the proposed backend architecture to support multi-tenant chat canvases with persisted node graphs, Google authentication, and LLM-driven conversations. The goal is to keep the frontend (React/Vite) largely unchanged while introducing a scalable, secure services layer.

---

## 1. Recommended Tech Stack

| Concern | Recommendation | Rationale |
| --- | --- | --- |
| Runtime & Framework | **TypeScript + Node.js (NestJS)** | Strong alignment with the existing frontend stack, first-class TypeScript support, built-in structure for modules, authentication guards, and validation. |
| ORM & Migrations | **Prisma** (or TypeORM) | Schema-first workflow, typed client for Node, simple migrations, supports PostgreSQL + Prisma Studio for quick data inspection. |
| Database | **PostgreSQL** (managed, e.g., AWS RDS / Neon / Supabase) | Relational data with strong consistency guarantees, JSONB for flexible node metadata, mature ecosystem, easy to scale vertically & horizontally. |
| Caching / Session Store | **Redis** (managed) | Fast session storage, request throttling counters, caching of recent node graphs for snappy loads. |
| Object Storage | **S3-compatible storage** | For any future attachments, exports, or backups of graph states. |
| Message Queue (optional) | **BullMQ (Redis-backed)** | Run background jobs (e.g., LLM calls, audit logging, analytics) without blocking API requests. |
| Authentication broker | **Google OAuth 2.0** via `passport-google-oauth20` (NestJS Passport integration) | Secure, widely adopted, easy to manage multi-tenancy by mapping Google accounts to users. |
| API Transport | REST (JSON) for core CRUD + optional WebSocket (Socket.IO) for collaborative real-time updates | REST keeps integration simple with the existing frontend. WebSocket layer is optional for future live collaboration / presence indicators. |

> **Alternative**: A Python FastAPI service is also viable, especially if you want to reuse existing Gemini proxy code. However, aligning the backend with the frontend’s TypeScript skillset generally reduces operational overhead.

---

## 2. Data Model & Schema

Below is a relational schema that supports multi-tenancy, chat history, node persistence, and canvas layouts. All timestamps use UTC.

### Core Tables

| Table | Key Columns | Notes |
| --- | --- | --- |
| `users` | `id` (UUID, PK) – internal identifier<br>`google_sub` (unique) – Google account subject<br>`email`, `display_name`, `avatar_url` | Stores identity details; `google_sub` links to OAuth profile. |
| `workspaces` (optional, for future teams) | `id` (UUID, PK)<br>`name`<br>`owner_id` (FK → `users.id`) | Enables grouping multiple users (multi-tenancy). For single-tenant-per-user, you can omit this and treat `users` as workspace owners. |
| `workspace_members` | `workspace_id` (FK)<br>`user_id` (FK)<br>`role` (enum: owner, editor, viewer) | Manages access within a workspace. |
| `chat_sessions` | `id` (UUID, PK)<br>`workspace_id` (FK → `workspaces.id` or nullable `user_id` if no workspaces)<br>`title`<br>`created_by` (FK → `users.id`)<br>`created_at` | Represents a single canvas / conversation. |
| `session_participants` | `session_id` (FK)<br>`user_id` (FK)<br>`last_opened_at` | Tracks which users have access to the session and when they last viewed it. |

### Graph Storage

| Table | Key Columns | Notes |
| --- | --- | --- |
| `nodes` | `id` (UUID, PK)<br>`session_id` (FK → `chat_sessions.id`)<br>`type` (enum: qa, suggestion, input, etc.)<br>`question`<br>`answer` (nullable)<br>`state` (enum: loading, answer, suggestion, archived)<br>`position_x`, `position_y` (float)<br>`width`, `height` (optional, for responsive layouts)<br>`metadata` (JSONB) | Every node belongs to exactly one session. Coordinates are persisted for layout restores. `metadata` can hold UI state (e.g., collapsed/expanded, styling preferences). |
| `edges` | `id` (UUID, PK)<br>`session_id` (FK)<br>`source_node_id`, `target_node_id` (FK → `nodes.id`)<br>`kind` (enum: follow_up, suggestion, manual)<br>`style` (JSONB) | Explicit edges allow for hierarchical reconstruction and future analytics. |
| `node_versions` (optional) | `node_id` (FK)<br>`version` (int, auto)<br>`payload` (JSONB)<br>`created_at` | Keeps historical snapshots if you need undo/history beyond LLM logs. |

### Conversation History & LLM Logs

| Table | Key Columns | Notes |
| --- | --- | --- |
| `messages` | `id` (UUID, PK)<br>`session_id` (FK)<br>`node_id` (FK, nullable) – message tied to node<br>`sender_type` (enum: user, assistant, system)<br>`content` (text / JSONB)<br>`latency_ms`<br>`created_at` | Stores the chronological chat transcript. Messages can reference nodes to reconstruct the dialog tree. |
| `llm_invocations` | `id` (UUID, PK)<br>`session_id` (FK)<br>`node_id` (FK, nullable)<br>`model`<br>`prompt` (text)<br>`response` (JSONB)<br>`duration_ms`<br>`status` (enum: success, error)<br>`created_at` | Audit log for LLM requests, valuable for debugging, cost tracking, and analytics. |

### Additional Tables for Authentication & Settings

| Table | Key Columns | Notes |
| --- | --- | --- |
| `user_sessions` | `id` (UUID, PK – session token)<br>`user_id` (FK)<br>`refresh_token` (hashed)<br>`expires_at`<br>`created_at` | Persist server-side sessions, especially if you issue refresh tokens for long-lived logins. |
| `api_keys` (optional) | `id` (UUID, PK)<br>`workspace_id` (FK)<br>`key_hash`<br>`scopes`<br>`created_at` | For future integrations or webhooks. |
| `event_logs` | `id` (UUID, PK)<br>`workspace_id` (FK)<br>`user_id` (FK)<br>`action` (enum)<br>`payload` (JSONB)<br>`created_at` | Auditing and analytics. |

> **Indexing tips**: Index `nodes(session_id)`, `edges(session_id)`, `messages(session_id, created_at)`, and `chat_sessions(workspace_id, created_at DESC)` for efficient loading. Consider a `GIN` index on JSONB columns storing metadata for filtering.

---

## 3. Authentication & Authorization Workflow

1. **Google OAuth Flow**
   - Frontend redirects users to the backend’s `/auth/google` endpoint (NestJS Passport `GoogleStrategy`).
   - Google redirects back with an authorization code; backend exchanges it for tokens.
   - The backend retrieves profile info (`sub`, `email`, `name`, `picture`).
   - If `google_sub` already exists, fetch the user; otherwise, create a new user record (and optionally a default workspace).
   - Issue a signed HTTP-only session cookie (JWT with short TTL) along with a refresh token stored in `user_sessions`.

2. **Session Handling**
   - Access tokens (JWT) embed `user_id`, `workspace_ids`, `roles`, and expire quickly (e.g., 15 minutes).
   - Refresh tokens (rotated) allow silent session renewal via `/auth/refresh`.
   - Store session metadata in Redis for quick revocation and to support single sign-on.

3. **Authorization**
   - NestJS guards check for valid JWT and required scopes (e.g., `session:read`, `session:write`).
   - Multi-tenancy enforced by verifying that `session.workspace_id` belongs to the authenticated user’s workspace membership.
   - Use role-based access control (RBAC) with `workspace_members.role` to gate editing vs read-only.

4. **Logout & Revocation**
   - `/auth/logout` deletes refresh tokens and session entries from Redis and the `user_sessions` table.
   - Support Google token revocation when users disconnect their account.

---

## 4. API Surface (REST-first)

### Authentication
- `POST /auth/google` – Initiate OAuth flow (or redirect helper).
- `GET /auth/google/callback` – Handle Google callback, issue tokens.
- `POST /auth/refresh` – Refresh access token using refresh token.
- `POST /auth/logout` – Invalidate session.

### Workspace / Session Management
- `GET /workspaces` – List workspaces the user can access.
- `POST /workspaces` – Create workspace (optional for multi-user).
- `GET /workspaces/:id/sessions` – Paginated list of chat sessions.
- `POST /workspaces/:id/sessions` – Create a new session (canvas) with initial prompt.
- `GET /sessions/:id` – Load session metadata, participants, last opened.
- `PATCH /sessions/:id` – Rename, archive, or update settings.

### Graph Operations
- `GET /sessions/:id/nodes` – Fetch all nodes + edges in a single payload (`{ nodes: [...], edges: [...] }`). Accept ETag for caching.
- `POST /sessions/:id/nodes` – Create node (user-entered question, suggestion stub, etc.).
- `PUT /sessions/:id/nodes/:nodeId` – Update question/answer/state/position metadata.
- `DELETE /sessions/:id/nodes/:nodeId` – Soft-delete node (mark `state = archived`).
- `POST /sessions/:id/edges` / `DELETE /sessions/:id/edges/:edgeId` – Manage edges when manual connections are introduced.
- `PATCH /sessions/:id/layout` – Bulk update node positions after drag operations (accept array of `{ nodeId, x, y }`).

### Conversation & LLM
- `POST /sessions/:id/messages` – Append a message; when sender = `user`, enqueue LLM job.
- `GET /sessions/:id/messages` – Load transcript (support pagination or streaming for large histories).
- `POST /sessions/:id/llm/generate` – Force a new LLM call (if not using queue pattern).

### Realtime (Optional)
- WebSocket namespace `/ws/sessions/:id` for broadcasting node updates, new suggestions, and presence indicators.

**API Standards**
- JSON responses with consistent envelope (`{ data, meta }`).
- Use `zod` / `class-validator` for DTO validation.
- Enable rate limiting per user (e.g., `60 req/min`) via NestJS throttler + Redis counters.

---

## 5. Infrastructure & DevOps Plan

| Layer | Recommendation | Notes |
| --- | --- | --- |
| Containerization | Docker images for API + worker | Define multi-stage build for NestJS (install deps, build TS, run `node dist/main`). |
| Environment Management | `.env` + secrets manager (AWS Secrets Manager) | Store API keys, DB credentials, OAuth secrets securely. |
| Hosting | AWS ECS Fargate or Render.com | ECS with Fargate gives autoscaling without managing servers. Render is simpler for MVP. |
| Database | AWS RDS (PostgreSQL) w/ automated backups | Choose db.t3.small or better; enable automated snapshots, multi-AZ in production. |
| Cache / Queue | AWS ElastiCache (Redis) | Powers session store, rate limiting, BullMQ queues. |
| Object Storage | AWS S3 bucket | For exports/backups. |
| CI/CD | GitHub Actions | Pipeline: lint → unit tests → integration tests → docker build → deploy to ECS. |
| Observability | AWS CloudWatch (logs + metrics), plus Sentry for application errors | Collect API latency, queue depth, LLM latency. |
| Secrets | AWS Parameter Store / Secrets Manager | Rotate Google client secrets, LLM API keys. |
| Infrastructure as Code | Terraform or AWS CDK | Reproducible infrastructure, track changes in Git. |

### Local Development
- Use Docker Compose with services: `api`, `worker`, `postgres`, `redis`.
- Seed scripts to create demo users and sample chat sessions.
- Provide `.env.example` with required variables (Google keys, DB connection, Gemini API key).
- Add `npm run dev` command to run NestJS in watch mode.

---

## 6. Testing & Quality Strategy

| Layer | Approach |
| --- | --- |
| Unit tests | Jest for service/business logic (nodes, layout updates, LLM request formatting). |
| Integration tests | Spin up ephemeral Postgres/Redis containers; test API endpoints end-to-end (e.g., create session, add node, update layout). |
| Contract tests | Validate frontend DTOs using shared TypeScript interfaces or OpenAPI schemas. |
| Security tests | Verify OAuth flows, enforce HTTPS, test token revocation, run OWASP ZAP scans. |
| Load tests | k6 or Artillery to simulate concurrent session loads and LLM bursts. |
| Observability checks | Synthetic monitors hitting `/healthz`, dashboard alerts on high latency or queue backlog. |

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| **Race conditions on node updates** | Overwritten positions or answers when multiple clients edit simultaneously. | Use optimistic locking via `updated_at` timestamps or version numbers; emit WebSocket broadcasts to sync clients. |
| **Large canvases causing slow loads** | Clients fetching thousands of nodes at once. | Implement pagination or chunked loading, introduce `updated_since` filters, cache recent session graphs in Redis. |
| **LLM latency / failures** | Poor UX when Gemini/other providers throttle. | Queue requests with retry strategy, surface progress UI, support fallback models. |
| **Token leakage** | Compromised refresh tokens or OAuth secrets. | Store refresh tokens hashed, rotate regularly, use HTTPS only cookies, lock secrets in secrets manager. |
| **Multi-tenancy data leaks** | Users accessing other workspaces’ data. | Enforce workspace scoping on every query via Prisma middleware, add integration tests covering tenant isolation. |
| **Cost overruns** | LLM calls and cloud resources. | Track per-session LLM cost metrics, enforce request quotas, set CloudWatch billing alarms. |

---

## 8. Implementation Roadmap (High Level)

1. **Bootstrap NestJS project** – configure linting, Prisma, environment variables, logging.
2. **Implement Google OAuth module** – Passport strategy, session issuance, refresh logic.
3. **Model the database** – write Prisma schema, run migrations, seed demo data.
4. **Build session & graph APIs** – CRUD endpoints, validation, tests.
5. **Integrate LLM service** – wrap existing Gemini proxy (or migrate into NestJS) with job queue handling.
6. **Add real-time updates** (optional milestone) – Socket.IO gateway for live node edits.
7. **Set up CI/CD & infrastructure** – Terraform, GitHub Actions, deploy to staging.
8. **Observability & hardening** – add monitoring dashboards, error tracking, load tests.

This blueprint satisfies the previously defined plan and provides a practical path to implement a production-ready backend while maintaining flexibility for future features (collaboration, analytics, custom models).

