"use client";

import React from "react";
import type { FrontierResult, StrategyStream } from "@/lib/types";

interface StrategyDeskHubProps {
  streams: StrategyStream[];
  frontier: FrontierResult;
}

export function StrategyDeskHub({ streams, frontier }: StrategyDeskHubProps) {
  return (
    <section className="terminal-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Cross-Repo Strategy Adapter Hub (5 Trading Architectures)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Normalized paper-only telemetry ingested from arbitrage-, meme-flight-recorder, goldfarm, goldea &amp; goldbrain-workspace
          </p>
        </div>
        <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-400">
          PAPER / ANALYTICAL ONLY
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
              <th className="py-2 pr-3 font-medium">Source Repo</th>
              <th className="py-2 pr-3 font-medium">Asset Class</th>
              <th className="py-2 pr-3 text-right font-medium">Accepted / Rej</th>
              <th className="py-2 pr-3 text-right font-medium">Ann. Ret</th>
              <th className="py-2 pr-3 text-right font-medium">Ann. Vol</th>
              <th className="py-2 pr-3 text-right font-medium">Sharpe</th>
              <th className="py-2 pr-3 text-right font-medium">Max DD</th>
              <th className="py-2 pr-3 text-right font-medium">Max-Sharpe Wt</th>
              <th className="py-2 text-right font-medium">Min-CVaR Wt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)] tabular-nums">
            {streams.map((s) => {
              const wSharpe = (frontier.max_sharpe.weights[s.desk_id] ?? 0) * 100;
              const wCvar = (frontier.min_cvar.weights[s.desk_id] ?? 0) * 100;
              return (
                <tr key={s.desk_id} className="hover:bg-[var(--bg-elevated)]/60">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-[var(--text-primary)]">{s.source_repo}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{s.gate_notes[0]}</div>
                  </td>
                  <td className="py-2.5 pr-3 text-[var(--text-muted)]">{s.asset_class}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className="text-emerald-400">{s.n_signals_accepted}</span>
                    {" / "}
                    <span className="text-amber-400">{s.n_signals_rejected}</span>
                  </td>
                  <td
                    className={`py-2.5 pr-3 text-right font-medium ${
                      s.annualized_return >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {(s.annualized_return * 100).toFixed(2)}%
                  </td>
                  <td className="py-2.5 pr-3 text-right">{(s.annualized_vol * 100).toFixed(2)}%</td>
                  <td className="py-2.5 pr-3 text-right font-medium">{s.sharpe_ratio.toFixed(2)}</td>
                  <td className="py-2.5 pr-3 text-right text-rose-400">
                    {(s.max_drawdown * 100).toFixed(2)}%
                  </td>
                  <td className="py-2.5 pr-3 text-right font-semibold text-amber-400">
                    {wSharpe.toFixed(1)}%
                  </td>
                  <td className="py-2.5 text-right font-semibold text-purple-400">
                    {wCvar.toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
