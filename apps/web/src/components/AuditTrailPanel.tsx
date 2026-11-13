"use client";

import React from "react";
import type { AuditEvent } from "@/lib/types";

interface AuditTrailPanelProps {
  chainValid: boolean;
  totalEvents: number;
  events: AuditEvent[];
}

export function AuditTrailPanel({ chainValid, totalEvents, events }: AuditTrailPanelProps) {
  return (
    <section className="terminal-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            SHA-256 Hash-Chained Risk &amp; Gate Audit Journal
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Tamper-evident event ledger (meme-flight-recorder pattern) recording every lookahead, spread &amp; risk rejection
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-0.5 font-semibold ${
              chainValid ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
            }`}
          >
            {chainValid ? "HASH CHAIN VERIFIED" : "CHAIN INVALID"}
          </span>
          <span className="tabular-nums text-[var(--text-muted)]">{totalEvents} events logged</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              <th className="py-2 pr-3 font-medium">Seq</th>
              <th className="py-2 pr-3 font-medium">Desk</th>
              <th className="py-2 pr-3 font-medium">Event Type</th>
              <th className="py-2 pr-3 font-medium">Payload</th>
              <th className="py-2 font-medium">Event SHA-256</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
            {events.slice(0, 6).map((ev) => (
              <tr key={ev.event_hash} className="hover:bg-[var(--bg-elevated)]/50">
                <td className="py-2 pr-3 tabular-nums text-[var(--text-muted)]">#{ev.seq}</td>
                <td className="py-2 pr-3 text-sky-400">{ev.desk_id}</td>
                <td className="py-2 pr-3 text-amber-300">{ev.event_type}</td>
                <td className="py-2 pr-3 text-[var(--text-muted)]">{JSON.stringify(ev.payload)}</td>
                <td className="py-2 text-emerald-400">{ev.event_hash.slice(0, 18)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
