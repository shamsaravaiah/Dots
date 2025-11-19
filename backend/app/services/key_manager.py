"""API key rotation utilities for external LLM services."""

from __future__ import annotations

import itertools
import threading
import time
from dataclasses import dataclass
from typing import Iterable, List


@dataclass
class KeySlot:
    value: str
    disabled_until: float = 0.0
    failure_count: int = 0

    def is_available(self) -> bool:
        return time.time() >= self.disabled_until

    def mark_failure(self, cooldown_seconds: int) -> None:
        self.failure_count += 1
        self.disabled_until = time.time() + cooldown_seconds

    def mark_success(self) -> None:
        self.failure_count = 0
        self.disabled_until = 0.0


class KeyManager:
    """Simple round-robin key manager with exponential backoff."""

    def __init__(
        self,
        keys: Iterable[str],
        cooldown_seconds: int = 600,
    ) -> None:
        unique_keys = [key for key in dict.fromkeys(keys) if key]
        if not unique_keys:
            raise ValueError("At least one API key must be provided.")

        self._slots: List[KeySlot] = [
            KeySlot(value=key) for key in unique_keys
        ]
        self._cooldown_seconds = cooldown_seconds
        self._lock = threading.Lock()
        self._cycle = itertools.cycle(range(len(self._slots)))

    def acquire(self) -> KeySlot:
        """Return the next available key slot, respecting cooldowns."""
        with self._lock:
            for _ in range(len(self._slots)):
                index = next(self._cycle)
                slot = self._slots[index]
                if slot.is_available():
                    return slot
            # All keys are cooling down; select the earliest available one.
            soonest_slot = min(self._slots, key=lambda s: s.disabled_until)
            wait = max(soonest_slot.disabled_until - time.time(), 0)
            if wait > 0:
                time.sleep(wait)
            return soonest_slot

    def record_failure(self, slot: KeySlot) -> None:
        slot.mark_failure(self._cooldown_seconds)

    def record_success(self, slot: KeySlot) -> None:
        slot.mark_success()

    @property
    def active_keys(self) -> List[str]:
        return [slot.value for slot in self._slots if slot.is_available()]

    @property
    def total_keys(self) -> int:
        return len(self._slots)
