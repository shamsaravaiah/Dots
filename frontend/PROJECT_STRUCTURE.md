# Project Structure

This document outlines the recommended project structure for the Dots application.

## Directory Structure

```
frontend/
├── public/                    # Static assets served directly
│   ├── logo.svg
│   └── favicon.ico
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── common/          # Common/shared components
│   │   │   ├── Button/     # Button component with variants
│   │   │   ├── Input/      # Input component
│   │   │   └── Logo/       # Logo component
│   │   ├── layout/          # Layout components
│   │   │   ├── Header/     # Site header
│   │   │   ├── Footer/     # Site footer
│   │   │   └── Navigation/ # Navigation components
│   │   └── features/       # Feature-specific components
│   │       ├── HomePage/   # Homepage-specific components
│   │       ├── FlowCanvas/ # Flow canvas components
│   │       └── NodeEditor/ # Node editing components
│   ├── pages/               # Page components (route components)
│   │   ├── HomePage.jsx    # Landing page
│   │   ├── FlowPage.jsx    # Flow canvas page
│   │   └── AboutPage.jsx   # About page
│   ├── hooks/               # Custom React hooks
│   │   ├── useFlow.js      # Flow-related hooks
│   │   └── usePrompt.js    # Prompt-related hooks
│   ├── utils/               # Utility functions
│   │   ├── constants.js    # App constants
│   │   ├── helpers.js      # Helper functions
│   │   └── api.js          # API utilities
│   ├── styles/              # Global styles
│   │   ├── globals.css     # Global styles
│   │   ├── variables.css   # CSS variables
│   │   └── components/      # Component-specific styles
│   ├── assets/              # Static assets
│   │   ├── images/         # Image files
│   │   ├── icons/          # Icon files
│   │   └── fonts/          # Font files
│   ├── context/             # React Context providers
│   │   ├── FlowContext.js  # Flow state management
│   │   └── ThemeContext.js # Theme management
│   ├── services/            # API calls and external services
│   │   ├── api.js          # API service
│   │   └── storage.js      # Local storage utilities
│   ├── App.jsx             # Main app component with routing
│   ├── main.jsx            # App entry point
│   └── index.css           # Main CSS imports
├── package.json
└── README.md
```

## Component Organization

### Common Components
- **Button**: Reusable button with variants (primary, secondary, floating)
- **Input**: Styled input component
- **Logo**: Application logo component

### Layout Components
- **Header**: Site header with navigation
- **Footer**: Site footer
- **Navigation**: Navigation menu components

### Feature Components
- **HomePage**: Landing page components
- **FlowCanvas**: ReactFlow canvas components
- **NodeEditor**: Node editing and manipulation components

## Routing Structure

- `/` - HomePage (landing page with prompt input)
- `/flow` - FlowPage (ReactFlow canvas)
- `/about` - AboutPage (future)

## Styling Approach

- **CSS Variables**: Centralized color and spacing variables
- **Component Styles**: Each component has its own CSS file
- **Global Styles**: Base styles and resets
- **Responsive Design**: Mobile-first approach

## State Management

- **React Context**: For global state (flow data, theme)
- **Local State**: Component-specific state with useState
- **Custom Hooks**: Reusable state logic

## Development Guidelines

1. **Component Structure**: Each component should have its own directory with JSX and CSS files
2. **Naming Convention**: Use PascalCase for components, camelCase for functions
3. **Props Interface**: Define clear prop interfaces for components
4. **Styling**: Use CSS modules or styled-components for component isolation
5. **Testing**: Each component should have corresponding test files

## Future Enhancements

- Add TypeScript support
- Implement component testing with Jest/React Testing Library
- Add Storybook for component documentation
- Implement state management with Redux Toolkit (if needed)
- Add internationalization support
