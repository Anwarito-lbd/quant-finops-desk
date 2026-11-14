"use client";

import React, { useId, useState } from "react";
import type { MonteCarloResult } from "@/lib/types";

interface MonteCarloFanChartProps {
  mcRegime: MonteCarloResult;
  mcBootstrap: MonteCarloResult;
  sigmaStress: number;
  pStayStress?: number;
  horizonDays?: number;
  onSigmaStressChange: (val: number) => void;
  onPStayStressChange?: (val: number) => void;
  onHorizonDaysChange?: (val: number) => void;
  onRunStress: () => void;
  loading: boolean;
  expanded?: boolean;
}

export function MonteCarloFanChart({
  mcRegime,
  mcBootstrap,
  sigmaStress,
  pStayStress = 0.88,
  horizonDays = 252,
  onSigmaStressChange,
  onPStayStressChange,
  onHorizonDaysChange,
  onRunStress,
  loading,
  expanded = false,
}: MonteCarloFanChartProps) {
  const [inspectIdx, setInspectIdx] = useState<number | null>(null);
  const sigmaId = useId();
  const stayId = useId();
  const horizonId = useId();

  const width = 620;
  const height = expanded ? 320 : 270;
  const pad = { top: 22, right: 20, bottom: 38, left: 58 };
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

  const activeIdx = inspectIdx ?? mcRegime.fan_days.length - 1;
  const activeDay = mcRegime.fan_days[activeIdx] ?? maxDay;

  return (
    <div className="space-y-4">
      <section className="workstation-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              Monte Carlo Treasury &amp; Drawdown Stress ({mcRegime.n_sims.toLocaleString()} Paths)
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              2-State Markov Regime-Switching GBM vs. Empirical Block Bootstrap (10% Skip-Fill)
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              mcRegime.passes_dd95_gate
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/15 text-rose-400"
            }`}
          >
            {mcRegime.passes_dd95_gate ? "DD₉₅ < 25% GATE PASS" : "DD₉₅ GATE BREACH"}
          </span>
        </div>

        {/* Trajectory Readout Strip */}
        <div className="workstation-subcard mb-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <span className="font-medium text-[var(--text-secondary)]">Day {activeDay} Quantiles</span>
          <div className="font-mono-num flex flex-wrap items-center gap-3 text-[11px]">
            <span>
              P5 <strong className="text-rose-400">${((mcRegime.fan_p5[activeIdx] ?? 0) / 1000).toFixed(1)}k</strong>
            </span>
            <span>
              P50 <strong className="text-amber-400">${((mcRegime.fan_p50[activeIdx] ?? 0) / 1000).toFixed(1)}k</strong>
            </span>
            <span>
              P95 <strong className="text-emerald-400">${((mcRegime.fan_p95[activeIdx] ?? 0) / 1000).toFixed(1)}k</strong>
            </span>
            <span>
              Ruin Prob <strong className="text-[var(--text-primary)]">{(mcRegime.p_ruin * 100).toFixed(2)}%</strong>
            </span>
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full select-none"
            role="img"
            aria-label="Monte Carlo treasury equity fan chart"
          >
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

            <path d={makeBand(mcRegime.fan_p95, mcRegime.fan_p5)} fill="#38bdf8" opacity="0.15" />
            <path d={makeBand(mcRegime.fan_p75, mcRegime.fan_p25)} fill="#0ea5e9" opacity="0.28" />

            {mcRegime.sample_paths.slice(0, 8).map((path, idx) => {
              const d = mcRegime.fan_days
                .map((day, i) => `${i === 0 ? "M" : "L"} ${sx(day).toFixed(1)} ${sy(path[i]).toFixed(1)}`)
                .join(" ");
              return <path key={`p-${idx}`} d={d} fill="none" stroke="#38bdf8" strokeWidth="0.9" opacity="0.22" />;
            })}

            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={sy(mcRegime.ruin_threshold)}
              y2={sy(mcRegime.ruin_threshold)}
              stroke="#f43f5e"
              strokeDasharray="5 4"
              strokeWidth="1.4"
            />

            <path d={medianLine} fill="none" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" />

            {/* Interactive vertical slice targets */}
            {mcRegime.fan_days.map((d, idx) => (
              <rect
                key={`slice-${d}`}
                x={sx(d) - plotW / (mcRegime.fan_days.length * 2)}
                y={pad.top}
                width={plotW / Math.max(1, mcRegime.fan_days.length)}
                height={plotH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setInspectIdx(idx)}
                onMouseLeave={() => setInspectIdx(null)}
              />
            ))}

            {inspectIdx !== null && (
              <line
                x1={sx(activeDay)}
                x2={sx(activeDay)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="var(--text-muted)"
                strokeDasharray="2 2"
              />
            )}

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

        <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-[0.9fr_0.9fr_1.15fr_1.45fr]">
          <div className="workstation-subcard px-3 py-2">
            <div className="text-[var(--text-muted)]">Median Terminal</div>
            <div className="font-mono-num mt-0.5 font-semibold text-amber-400">
              ${(mcRegime.terminal_p50 / 1000).toFixed(1)}k
            </div>
          </div>
          <div className="workstation-subcard px-3 py-2">
            <div className="text-[var(--text-muted)]">95% CVaR Loss</div>
            <div className="font-mono-num mt-0.5 font-semibold text-rose-400">
              ${(mcRegime.cvar_95_loss / 1000).toFixed(1)}k
            </div>
          </div>
          <div className="workstation-subcard px-3 py-2">
            <div className="text-[var(--text-muted)]">DD₉₅ (Regime / Boot)</div>
            <div className="font-mono-num mt-0.5 font-semibold">
              {(mcRegime.dd_p95 * 100).toFixed(1)}% / {(mcBootstrap.dd_p95 * 100).toFixed(1)}%
            </div>
          </div>
          <div className="workstation-subcard flex flex-col justify-between gap-1.5 px-3 py-2">
            <label htmlFor={sigmaId} className="block whitespace-nowrap text-[var(--text-muted)]">
              Stress σ: <span className="font-mono-num font-semibold text-[var(--text-primary)]">{(sigmaStress * 100).toFixed(0)}%</span>
            </label>
            <div className="flex items-center justify-between gap-2">
              <input
                id={sigmaId}
                type="range"
                min="0.14"
                max="0.50"
                step="0.02"
                value={sigmaStress}
                onChange={(e) => onSigmaStressChange(parseFloat(e.target.value))}
                className="w-full min-w-[60px] accent-purple-400"
              />
              <button
                type="button"
                onClick={onRunStress}
                disabled={loading}
                className="touch-target min-h-[28px] shrink-0 rounded-md bg-purple-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:opacity-50"
              >
                {loading ? "…" : "Stress"}
              </button>
            </div>
          </div>
        </div>

        {expanded && onPStayStressChange && onHorizonDaysChange && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-2">
            <div className="workstation-subcard flex items-center justify-between px-3 py-2">
              <label htmlFor={stayId} className="text-[var(--text-muted)]">
                Crisis Persistence P(Stress→Stress):{" "}
                <strong className="font-mono-num text-[var(--text-primary)]">{(pStayStress * 100).toFixed(0)}%</strong>
              </label>
              <input
                id={stayId}
                type="range"
                min="0.60"
                max="0.96"
                step="0.02"
                value={pStayStress}
                onChange={(e) => onPStayStressChange(parseFloat(e.target.value))}
                className="w-28 accent-purple-400"
              />
            </div>
            <div className="workstation-subcard flex items-center justify-between px-3 py-2">
              <label htmlFor={horizonId} className="text-[var(--text-muted)]">
                Horizon (Trading Days):{" "}
                <strong className="font-mono-num text-[var(--text-primary)]">{horizonDays}d</strong>
              </label>
              <input
                id={horizonId}
                type="range"
                min="63"
                max="504"
                step="21"
                value={horizonDays}
                onChange={(e) => onHorizonDaysChange(parseInt(e.target.value, 10))}
                className="w-28 accent-sky-400"
              />
            </div>
          </div>
        )}
      </section>

      {expanded && (
        <section className="workstation-card p-4 sm:p-5">
          <h3 className="mb-1 text-sm font-semibold">Regime-Switching GBM vs. Empirical Bootstrap Comparison</h3>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Parametric Markov-chain tail stress compared against historical 5-day block bootstrap with 10% missed fills
          </p>
          <div className="overflow-x-auto">
            <table className="font-mono-num w-full min-w-[540px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <th className="py-2 pr-3 font-medium">Simulation Model</th>
                  <th className="py-2 pr-3 text-right font-medium">P5 Terminal</th>
                  <th className="py-2 pr-3 text-right font-medium">P50 Terminal</th>
                  <th className="py-2 pr-3 text-right font-medium">P95 Terminal</th>
                  <th className="py-2 pr-3 text-right font-medium">VaR₉₅ Loss</th>
                  <th className="py-2 pr-3 text-right font-medium">DD₉₅</th>
                  <th className="py-2 text-right font-medium">P(Kill ≥ 20%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {[
                  { label: "Regime-Switching GBM", m: mcRegime },
                  { label: "Block Bootstrap (10% Skip)", m: mcBootstrap },
                ].map(({ label, m }) => (
                  <tr key={label}>
                    <td className="py-2.5 pr-3 font-sans font-semibold text-[var(--text-primary)]">{label}</td>
                    <td className="py-2.5 pr-3 text-right">${(m.terminal_p5 / 1000).toFixed(1)}k</td>
                    <td className="py-2.5 pr-3 text-right text-amber-400">${(m.terminal_p50 / 1000).toFixed(1)}k</td>
                    <td className="py-2.5 pr-3 text-right text-emerald-400">${(m.terminal_p95 / 1000).toFixed(1)}k</td>
                    <td className="py-2.5 pr-3 text-right text-rose-400">${(m.var_95_loss / 1000).toFixed(1)}k</td>
                    <td className="py-2.5 pr-3 text-right">{(m.dd_p95 * 100).toFixed(2)}%</td>
                    <td className="py-2.5 text-right">{(m.p_hit_kill_20pct * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
