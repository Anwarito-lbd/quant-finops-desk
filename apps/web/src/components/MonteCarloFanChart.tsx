"use client";

import React from "react";
import type { MonteCarloResult } from "@/lib/types";

interface MonteCarloFanChartProps {
  mcRegime: MonteCarloResult;
  mcBootstrap: MonteCarloResult;
  sigmaStress: number;
  onSigmaStressChange: (val: number) => void;
  onRunStress: () => void;
  loading: boolean;
}

export function MonteCarloFanChart({
  mcRegime,
  mcBootstrap,
  sigmaStress,
  onSigmaStressChange,
  onRunStress,
  loading,
}: MonteCarloFanChartProps) {
  const width = 580;
  const height = 280;
  const pad = { top: 20, right: 20, bottom: 36, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const allVals = [...mcRegime.fan_p5, ...mcRegime.fan_p95, mcRegime.ruin_threshold];
  const minY = Math.min(...allVals) * 0.94;
  const maxY = Math.max(...allVals) * 1.04;
  const maxDay = mcRegime.fan_days[mcRegime.fan_days.length - 1] || 252;

  const sx = (d: number) => pad.left + (d / Math.max(1, maxDay)) * plotW;
  const sy = (v: number) => pad.top + plotH - ((v - minY) / Math.max(1, maxY - minY)) * plotH;

  const makeBand = (upper: number[], lower: number[]) => {
    const topPts = mcRegime.fan_days.map((d, i) => `${sx(d).toFixed(1)},${sy(upper[i]).toFixed(1)}`);
    const botPts = [...mcRegime.fan_days]
      .reverse()
      .map((d, idx) => {
        const origIdx = mcRegime.fan_days.length - 1 - idx;
        return `${sx(d).toFixed(1)},${sy(lower[origIdx]).toFixed(1)}`;
      });
    return `M ${topPts.join(" L ")} L ${botPts.join(" L ")} Z`;
  };

  const medianLine = mcRegime.fan_days
    .map((d, i) => `${i === 0 ? "M" : "L"} ${sx(d).toFixed(1)} ${sy(mcRegime.fan_p50[i]).toFixed(1)}`)
    .join(" ");

  return (
    <section className="terminal-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Monte Carlo Treasury &amp; Drawdown Stress ({mcRegime.n_sims.toLocaleString()} Paths)
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            2-State Markov Regime-Switching GBM vs. Block Bootstrap (10% Skip-Fill Stress)
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            mcRegime.passes_dd95_gate
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-rose-500/15 text-rose-400"
          }`}
        >
          {mcRegime.passes_dd95_gate ? "DD₉₅ < 25% GATE PASS" : "DD₉₅ GATE BREACH"}
        </span>
      </div>

      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full select-none">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const gy = pad.top + t * plotH;
            const val = maxY - t * (maxY - minY);
            return (
              <g key={`mc-y-${t}`}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={gy}
                  y2={gy}
                  stroke="var(--border-subtle)"
                  strokeDasharray="3 3"
                />
                <text x={pad.left - 8} y={gy + 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">
                  ${(val / 1000).toFixed(0)}k
                </text>
              </g>
            );
          })}

          <path d={makeBand(mcRegime.fan_p95, mcRegime.fan_p5)} fill="#38bdf8" opacity="0.16" />
          <path d={makeBand(mcRegime.fan_p75, mcRegime.fan_p25)} fill="#0ea5e9" opacity="0.28" />

          {mcRegime.sample_paths.slice(0, 8).map((path, idx) => {
            const d = mcRegime.fan_days
              .map((day, i) => `${i === 0 ? "M" : "L"} ${sx(day).toFixed(1)} ${sy(path[i]).toFixed(1)}`)
              .join(" ");
            return <path key={`p-${idx}`} d={d} fill="none" stroke="#38bdf8" strokeWidth="0.9" opacity="0.24" />;
          })}

          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={sy(mcRegime.ruin_threshold)}
            y2={sy(mcRegime.ruin_threshold)}
            stroke="#ef4444"
            strokeDasharray="5 4"
            strokeWidth="1.4"
          />

          <path d={medianLine} fill="none" stroke="#facc15" strokeWidth="2.6" />

          <text
            x={pad.left + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            fontSize="10.5"
            fill="var(--text-muted)"
          >
            Trading Horizon (Days 0 → {maxDay}) · Dashed Red = Ruin Floor (${(mcRegime.ruin_threshold / 1000).toFixed(0)}k)
          </text>
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
          <div className="text-[var(--text-muted)]">Median Terminal</div>
          <div className="tabular-nums mt-0.5 font-semibold text-amber-400">
            ${(mcRegime.terminal_p50 / 1000).toFixed(1)}k
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
          <div className="text-[var(--text-muted)]">95% CVaR Loss</div>
          <div className="tabular-nums mt-0.5 font-semibold text-rose-400">
            ${(mcRegime.cvar_95_loss / 1000).toFixed(1)}k
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
          <div className="text-[var(--text-muted)]">DD₉₅ (Regime / Boot)</div>
          <div className="tabular-nums mt-0.5 font-semibold">
            {(mcRegime.dd_p95 * 100).toFixed(1)}% / {(mcBootstrap.dd_p95 * 100).toFixed(1)}%
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
          <div>
            <div className="text-[var(--text-muted)]">Stress σ: {(sigmaStress * 100).toFixed(0)}%</div>
            <input
              aria-label="Stress Regime Volatility"
              type="range"
              min="0.14"
              max="0.50"
              step="0.02"
              value={sigmaStress}
              onChange={(e) => onSigmaStressChange(parseFloat(e.target.value))}
              className="mt-1 w-20 accent-purple-400"
            />
          </div>
          <button
            type="button"
            onClick={onRunStress}
            disabled={loading}
            className="rounded-md bg-purple-500 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-purple-400 disabled:opacity-50"
          >
            {loading ? "..." : "Stress"}
          </button>
        </div>
      </div>
    </section>
  );
}
