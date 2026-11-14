"use client";

import React, { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Lock, ShieldAlert, X } from "lucide-react";
import type { AuditEvent, FrontierResult, StrategyStream } from "@/lib/types";

interface StrategyDeskHubProps {
  streams: StrategyStream[];
  frontier: FrontierResult;
  chainValid: boolean;
  totalEvents: number;
  auditEvents: AuditEvent[];
}

export function StrategyDeskHub({
  streams,
  frontier,
  chainValid,
  totalEvents,
  auditEvents,
}: StrategyDeskHubProps) {
  const [expandedDesk, setExpandedDesk] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <section className="workstation-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Cross-Repo Strategy Adapter Hub (5 Trading Architectures)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Select any desk row to inspect no-lookahead gates &amp; invariant enforcement; strictly paper/analytical
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="touch-target inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-sky-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Lock className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            Audit Journal ({totalEvents})
          </button>
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-400">
            Paper / Analytical Only
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[740px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              <th className="py-2 pr-3 font-medium">Source Repository</th>
              <th className="py-2 pr-3 font-medium">Asset Class</th>
              <th className="py-2 pr-3 font-medium">Gate</th>
              <th className="py-2 pr-3 text-right font-medium">Accept / Rej</th>
              <th className="py-2 pr-3 text-right font-medium">Ann. Ret</th>
              <th className="py-2 pr-3 text-right font-medium">Ann. Vol</th>
              <th className="py-2 pr-3 text-right font-medium">Sharpe</th>
              <th className="py-2 pr-3 text-right font-medium">Max DD</th>
              <th className="py-2 pr-3 text-right font-medium">Sharpe Wt</th>
              <th className="py-2 text-right font-medium">CVaR Wt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {streams.map((s) => {
              const isOpen = expandedDesk === s.desk_id;
              const wSharpe = (frontier.max_sharpe.weights[s.desk_id] ?? 0) * 100;
              const wCvar = (frontier.min_cvar.weights[s.desk_id] ?? 0) * 100;
              return (
                <React.Fragment key={s.desk_id}>
                  <tr className="transition-colors hover:bg-[var(--bg-hover)]/60">
                    <td className="py-2.5 pr-3">
                      <button
                        type="button"
                        onClick={() => setExpandedDesk(isOpen ? null : s.desk_id)}
                        aria-expanded={isOpen}
                        className="flex items-center gap-1.5 text-left font-semibold text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                        )}
                        <span>{s.source_repo}</span>
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 text-[var(--text-muted)]">{s.asset_class}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          s.gate_passed
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        {s.gate_passed ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        )}
                        {s.gate_passed ? "Pass" : "Fail"}
                      </span>
                    </td>
                    <td className="font-mono-num py-2.5 pr-3 text-right">
                      <span className="text-emerald-400">{s.n_signals_accepted}</span>
                      {" / "}
                      <span className="text-amber-400">{s.n_signals_rejected}</span>
                    </td>
                    <td
                      className={`font-mono-num py-2.5 pr-3 text-right font-medium ${
                        s.annualized_return >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(s.annualized_return * 100).toFixed(2)}%
                    </td>
                    <td className="font-mono-num py-2.5 pr-3 text-right">
                      {(s.annualized_vol * 100).toFixed(2)}%
                    </td>
                    <td className="font-mono-num py-2.5 pr-3 text-right font-medium">
                      {s.sharpe_ratio.toFixed(2)}
                    </td>
                    <td className="font-mono-num py-2.5 pr-3 text-right text-rose-400">
                      {(s.max_drawdown * 100).toFixed(2)}%
                    </td>
                    <td className="font-mono-num py-2.5 pr-3 text-right font-semibold text-amber-400">
                      {wSharpe.toFixed(1)}%
                    </td>
                    <td className="font-mono-num py-2.5 text-right font-semibold text-purple-400">
                      {wCvar.toFixed(1)}%
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-[var(--bg-elevated)]/70">
                      <td colSpan={10} className="px-4 py-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="font-semibold text-[var(--text-primary)]">
                              Enforced Invariants ({s.desk_id})
                            </div>
                            <ul className="list-disc pl-4 text-[var(--text-secondary)]">
                              {s.gate_notes.map((note) => (
                                <li key={note}>{note}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="font-mono-num flex flex-wrap gap-4 text-[11px] text-[var(--text-muted)]">
                            <span>Win Rate: {(s.win_rate * 100).toFixed(1)}%</span>
                            <span>Fee/Slippage Drag: {(s.fee_slippage_drag_ann * 100).toFixed(2)}%/yr</span>
                            <span>Periods: {s.n_periods}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Expandable SHA-256 Audit Journal Drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="SHA-256 Hash-Chained Audit Journal"
        >
          <div className="flex h-full w-full max-w-2xl flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-2xl overscroll-contain">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  SHA-256 Hash-Chained Risk &amp; Gate Journal
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Tamper-evident ledger verifying every lookahead block, spread filter &amp; fail-closed gate
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close audit journal drawer"
                className="touch-target rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mb-3 flex items-center justify-between text-xs">
              <span
                className={`rounded-full px-2.5 py-1 font-semibold ${
                  chainValid ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {chainValid ? "HASH CHAIN VERIFIED" : "CHAIN INTEGRITY FAILURE"}
              </span>
              <span className="font-mono-num text-[var(--text-muted)]">{totalEvents} immutable events</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                    <th className="py-2 pr-2 font-medium">Seq</th>
                    <th className="py-2 pr-2 font-medium">Desk</th>
                    <th className="py-2 pr-2 font-medium">Event</th>
                    <th className="py-2 font-medium">SHA-256</th>
                  </tr>
                </thead>
                <tbody className="font-mono-num divide-y divide-[var(--border-subtle)] text-[11px]">
                  {auditEvents.map((ev) => (
                    <tr key={ev.event_hash}>
                      <td className="py-2 pr-2 text-[var(--text-muted)]">#{ev.seq}</td>
                      <td className="py-2 pr-2 text-sky-400">{ev.desk_id}</td>
                      <td className="py-2 pr-2">
                        <div className="text-amber-400">{ev.event_type}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{JSON.stringify(ev.payload)}</div>
                      </td>
                      <td className="py-2 text-emerald-400">{ev.event_hash.slice(0, 16)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
