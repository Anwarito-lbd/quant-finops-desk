"""Tamper-Evident SHA-256 Hash-Chained Audit Journal (synthesized from meme-flight-recorder).

Every strategy gate evaluation, risk override, and paper allocation decision is recorded
with deterministic canonical JSON hashing (`GENESIS` -> H_1 -> H_2 -> ...) and idempotency keys.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any


@dataclass(frozen=True)
class AuditEvent:
    """Single immutable record in the hash-chained risk journal."""

    seq: int
    observed_at: str
    desk_id: str
    event_type: str
    payload: dict[str, Any]
    previous_hash: str
    event_hash: str


class AuditJournal:
    """Append-only SHA-256 hash-chained audit trail with idempotent event ingestion."""

    GENESIS_HASH = "GENESIS"

    def __init__(self) -> None:
        self._events: list[AuditEvent] = []
        self._idempotency: dict[str, str] = {}

    @staticmethod
    def _compute_hash(
        seq: int,
        observed_at: str,
        desk_id: str,
        event_type: str,
        payload_json: str,
        previous_hash: str,
    ) -> str:
        raw = f"{seq}|{observed_at}|{desk_id}|{event_type}|{payload_json}|{previous_hash}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def append(
        self,
        desk_id: str,
        event_type: str,
        payload: dict[str, Any],
        *,
        idempotency_key: str | None = None,
        observed_at: datetime | None = None,
    ) -> AuditEvent:
        if idempotency_key is not None and idempotency_key in self._idempotency:
            target = self._idempotency[idempotency_key]
            for ev in self._events:
                if ev.event_hash == target:
                    return ev

        seq = len(self._events) + 1
        ts = (observed_at or datetime.now(UTC)).isoformat()
        prev_hash = self._events[-1].event_hash if self._events else self.GENESIS_HASH
        payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        ev_hash = self._compute_hash(seq, ts, desk_id, event_type, payload_json, prev_hash)
        ev = AuditEvent(
            seq=seq,
            observed_at=ts,
            desk_id=desk_id,
            event_type=event_type,
            payload=json.loads(payload_json),
            previous_hash=prev_hash,
            event_hash=ev_hash,
        )
        self._events.append(ev)
        if idempotency_key is not None:
            self._idempotency[idempotency_key] = ev_hash
        return ev

    def verify_chain(self) -> bool:
        """Return True iff every event hash matches recomputation and links to previous_hash."""
        expected_prev = self.GENESIS_HASH
        for i, ev in enumerate(self._events, start=1):
            if ev.seq != i or ev.previous_hash != expected_prev:
                return False
            payload_json = json.dumps(ev.payload, sort_keys=True, separators=(",", ":"))
            recomputed = self._compute_hash(
                ev.seq, ev.observed_at, ev.desk_id, ev.event_type, payload_json, ev.previous_hash
            )
            if recomputed != ev.event_hash:
                return False
            expected_prev = ev.event_hash
        return True

    def events(self) -> list[dict[str, Any]]:
        return [asdict(ev) for ev in self._events]

    def __len__(self) -> int:
        return len(self._events)
