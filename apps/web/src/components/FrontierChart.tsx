"use client";

import React, { useId, useState } from "react";
import type { FrontierResult, PortfolioPoint, StrategyStream } from "@/lib/types";

interface FrontierChartProps {
  frontier: FrontierResult;
  streams: StrategyStream[];
  maxWeight: number;
  riskFree?: number;
  cvarAlpha?: number;
  onMaxWeightChange: (val: number) => void;
  onRiskFreeChange?: (val: number) => void;
  onCvarAlphaChange?: (val: number) => void;
  onReoptimize: () => void;
  loading: boolean;
  expanded?: boolean;
}

export function FrontierChart({
  frontier,
  streams,
  maxWeight,
  riskFree = 0.04,
  cvarAlpha = 0.95,
  onMaxWeightChange,
  onRiskFreeChange,
  onCvarAlphaChange,
  onReoptimize,
  loading,
  expanded = false,
}: FrontierChartProps) {
  const [mode, setMode] = useState<"mv" | "cvar">("mv");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxWtId = useId();
  const rfId = useId();
  const alphaId = useId();

  const width = 620;
  const height = expanded ? 320 : 270;
  const pad = { top: 22, right: 24, bottom: 40, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const curvePts = mode === "mv" ? frontier.mv_frontier : frontier.cvar_frontier;
  const getX = (p: { volatility_ann: number; cvar_daily: number }) =>
    mode === "mv" ? p.volatility_ann * 100 : p.cvar_daily * 100;
  const getY = (p: { expected_return_ann: number }) => p.expected_return_ann * 100;

  const xValues = [
    ...curvePts.map(getX),
    ...(mode === "mv" ? streams.map((s) => s.annualized_vol * 100) : []),
    getX(frontier.max_sharpe),
  ];
  const yValues = [
    ...curvePts.map(getY),
    ...(mode === "mv" ? streams.map((s) => s.annualized_return * 100) : []),
    getY(frontier.max_sharpe),
  ];

  const minX = Math.max(0, Math.min(...xValues) * 0.85);
  const maxX = Math.max(...xValues) * 1.1 + 0.25;
  const minY = Math.min(...yValues) - 2.2;
  const maxY = Math.max(...yValues) + 2.8;

  const sx = (x: number) => pad.left + ((x - minX) / Math.max(1e-6, maxX - minX)) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - minY) / Math.max(1e-6, maxY - minY)) * plotH;

  const pathD = curvePts
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${sx(getX(pt)).toFixed(1)} ${sy(getY(pt)).toFixed(1)}`)
    .join(" ");

  const anchorPt = mode === "mv" ? frontier.min_variance : frontier.min_cvar;
  const inspectedPt: PortfolioPoint =
    hoveredIdx !== null && curvePts[hoveredIdx] ? curvePts[hoveredIdx] : frontier.max_sharpe;

  const corrAssets = Object.keys(frontier.correlation_matrix ?? {});

  return (
    <div className="space-y-4">
      <section className="workstation-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
              {mode === "mv" ? "Markowitz Mean-Variance Frontier" : "Rockafellar-Uryasev CVaR₉₅ Frontier"}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {mode === "mv"
                ? "SLSQP variance minimization with 10% covariance shrinkage vs. individual desks"
                : "Exact HiGHS LP minimizing 95% daily Expected Shortfall across scenarios"}
            </p>
          </div>

          <div
            className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5 text-xs"
            role="group"
            aria-label="Frontier solver view"
          >
            <button
              type="button"
              onClick={() => {
                setMode("mv");
                setHoveredIdx(null);
              }}
              className={`touch-target min-h-[34px] rounded-md px-3 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                mode === "mv"
                  ? "bg-sky-500 text-slate-950"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Mean-Variance
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("cvar");
                setHoveredIdx(null);
              }}
              className={`touch-target min-h-[34px] rounded-md px-3 py-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                mode === "cvar"
                  ? "bg-purple-500 text-white"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Mean-CVaR
            </button>
          </div>
        </div>

        {/* Live Inspected Node Readout */}
        <div className="workstation-subcard mb-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
          <span className="font-medium text-[var(--text-secondary)]">
            {hoveredIdx !== null ? `Frontier Node #${hoveredIdx + 1}` : "Tangency Portfolio (Max-Sharpe)"}
          </span>
          <div className="font-mono-num flex flex-wrap items-center gap-3 text-[11px]">
            <span>
              Ret <strong className="text-emerald-400">{(inspectedPt.expected_return_ann * 100).toFixed(2)}%</strong>
            </span>
            <span>
              Vol <strong className="text-sky-400">{(inspectedPt.volatility_ann * 100).toFixed(2)}%</strong>
            </span>
            <span>
              Sharpe <strong className="text-amber-400">{inspectedPt.sharpe_ratio.toFixed(2)}</strong>
            </span>
            <span>
              CVaR₉₅ <strong className="text-purple-400">{(inspectedPt.cvar_daily * 100).toFixed(2)}%/d</strong>
            </span>
          </div>
        </div>

        <div className="w-full overflow-hidden">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto w-full select-none"
            role="img"
            aria-label={mode === "mv" ? "Markowitz efficient frontier chart" : "Mean CVaR efficient frontier chart"}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const gy = pad.top + t * plotH;
              const label = maxY - t * (maxY - minY);
              return (
                <g key={`y-${t}`}>
                  <line
                    x1={pad.left}
                    x2={width - pad.right}
                    y1={gy}
                    y2={gy}
                    stroke="var(--border-subtle)"
                    strokeDasharray="3 3"
                  />
                  <text x={pad.left - 8} y={gy + 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">
                    {label.toFixed(1)}%
                  </text>
                </g>
              );
            })}

            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const gx = pad.left + t * plotW;
              const label = minX + t * (maxX - minX);
              return (
                <g key={`x-${t}`}>
                  <line
                    x1={gx}
                    x2={gx}
                    y1={pad.top}
                    y2={height - pad.bottom}
                    stroke="var(--border-subtle)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={gx}
                    y={height - pad.bottom + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--text-muted)"
                  >
                    {label.toFixed(2)}%
                  </text>
                </g>
              );
            })}

            <path
              d={pathD}
              fill="none"
              stroke={mode === "mv" ? "#38bdf8" : "#a855f7"}
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            {curvePts.map((pt, idx) => {
              const cx = sx(getX(pt));
              const cy = sy(getY(pt));
              const active = hoveredIdx === idx;
              return (
                <circle
                  key={`node-${idx}`}
                  cx={cx}
                  cy={cy}
                  r={active ? 6 : 3.4}
                  fill={active ? "#f59e0b" : mode === "mv" ? "#38bdf8" : "#a855f7"}
                  opacity={active ? 1 : 0.7}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => setHoveredIdx(idx === hoveredIdx ? null : idx)}
                />
              );
            })}

            {mode === "mv" &&
              streams.map((s) => {
                const cx = sx(s.annualized_vol * 100);
                const cy = sy(s.annualized_return * 100);
                const alignEnd = cx > width - 155;
                return (
                  <g key={s.desk_id}>
                    <circle cx={cx} cy={cy} r="4.5" fill="var(--text-muted)" opacity="0.85" />
                    <text
                      x={alignEnd ? cx - 7 : cx + 7}
                      y={cy - 5}
                      textAnchor={alignEnd ? "end" : "start"}
                      fontSize="9.5"
                      fill="var(--text-secondary)"
                    >
                      {s.source_repo}
                    </text>
                  </g>
                );
              })}

            <circle
              cx={sx(getX(anchorPt))}
              cy={sy(getY(anchorPt))}
              r="6.5"
              fill="#10b981"
              stroke="var(--bg-surface)"
              strokeWidth="2"
            />
            <circle
              cx={sx(getX(frontier.max_sharpe))}
              cy={sy(getY(frontier.max_sharpe))}
              r="7.5"
              fill="#f59e0b"
              stroke="var(--bg-surface)"
              strokeWidth="2"
            />

            <text
              x={pad.left + plotW / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize="10.5"
              fill="var(--text-muted)"
            >
              {mode === "mv" ? "Annualized Volatility (%)" : "Daily 95% CVaR Loss (%)"}
            </text>
          </svg>
        </div>

        {/* Solver Controls Footer */}
        <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-3">
          <div className="workstation-subcard px-3 py-2">
            <div className="text-[var(--text-muted)]">Max-Sharpe Tangency</div>
            <div className="font-mono-num mt-0.5 font-semibold text-amber-400">
              SR {frontier.max_sharpe.sharpe_ratio.toFixed(2)} · Ret {(frontier.max_sharpe.expected_return_ann * 100).toFixed(1)}%
            </div>
          </div>
          <div className="workstation-subcard px-3 py-2">
            <div className="text-[var(--text-muted)]">{mode === "mv" ? "Min-Variance Anchor" : "Min-CVaR₉₅ Anchor"}</div>
            <div className="font-mono-num mt-0.5 font-semibold text-emerald-400">
              {mode === "mv"
                ? `Vol ${(frontier.min_variance.volatility_ann * 100).toFixed(2)}%`
                : `CVaR ${(frontier.min_cvar.cvar_daily * 100).toFixed(2)}%/d`}
            </div>
          </div>
          <div className="workstation-subcard flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <label htmlFor={maxWtId} className="block text-[var(--text-muted)]">
                Max Weight Cap: <span className="font-mono-num text-[var(--text-primary)]">{(maxWeight * 100).toFixed(0)}%</span>
              </label>
              <input
                id={maxWtId}
                type="range"
                min="0.30"
                max="0.90"
                step="0.05"
                value={maxWeight}
                onChange={(e) => onMaxWeightChange(parseFloat(e.target.value))}
                className="mt-1 w-24 accent-sky-400"
              />
            </div>
            <button
              type="button"
              onClick={onReoptimize}
              disabled={loading}
              className="touch-target min-h-[36px] shrink-0 rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
            >
              {loading ? "Solving…" : "Solve"}
            </button>
          </div>
        </div>

        {expanded && onRiskFreeChange && onCvarAlphaChange && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-2">
            <div className="workstation-subcard flex items-center justify-between px-3 py-2">
              <label htmlFor={rfId} className="text-[var(--text-muted)]">
                Risk-Free Rate: <strong className="font-mono-num text-[var(--text-primary)]">{(riskFree * 100).toFixed(2)}%</strong>
              </label>
              <input
                id={rfId}
                type="range"
                min="0.00"
                max="0.08"
                step="0.005"
                value={riskFree}
                onChange={(e) => onRiskFreeChange(parseFloat(e.target.value))}
                className="w-32 accent-sky-400"
              />
            </div>
            <div className="workstation-subcard flex items-center justify-between px-3 py-2">
              <label htmlFor={alphaId} className="text-[var(--text-muted)]">
                CVaR Confidence α: <strong className="font-mono-num text-[var(--text-primary)]">{(cvarAlpha * 100).toFixed(1)}%</strong>
              </label>
              <input
                id={alphaId}
                type="range"
                min="0.90"
                max="0.99"
                step="0.01"
                value={cvarAlpha}
                onChange={(e) => onCvarAlphaChange(parseFloat(e.target.value))}
                className="w-32 accent-purple-400"
              />
            </div>
          </div>
        )}
      </section>

      {expanded && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Optimal Allocation Comparison */}
          <section className="workstation-card p-4 sm:p-5">
            <h3 className="mb-1 text-sm font-semibold">Optimal Desk Weights by Regime</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Comparison between Max-Sharpe Tangency (amber) and Min-CVaR₉₅ (violet)
            </p>
            <div className="space-y-3">
              {streams.map((s) => {
                const wMs = (frontier.max_sharpe.weights[s.desk_id] ?? 0) * 100;
                const wCv = (frontier.min_cvar.weights[s.desk_id] ?? 0) * 100;
                return (
                  <div key={s.desk_id} className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--text-primary)]">{s.source_repo}</span>
                      <span className="font-mono-num text-[11px] text-[var(--text-muted)]">
                        Sharpe {wMs.toFixed(1)}% · CVaR {wCv.toFixed(1)}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, wMs)}%` }} />
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                        <div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.min(100, wCv)}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Cross-Desk Correlation Matrix */}
          <section className="workstation-card p-4 sm:p-5">
            <h3 className="mb-1 text-sm font-semibold">Cross-Desk Return Correlation Matrix</h3>
            <p className="mb-3 text-xs text-[var(--text-muted)]">
              Low cross-strategy correlation enables variance and tail-risk reduction
            </p>
            <div className="overflow-x-auto">
              <table className="font-mono-num w-full min-w-[380px] border-collapse text-center text-[11px]">
                <thead>
                  <tr className="text-[var(--text-muted)]">
                    <th className="py-1 pr-2 text-left font-medium">Desk</th>
                    {corrAssets.map((a) => (
                      <th key={a} className="px-1.5 py-1 font-medium">
                        {a.split("_")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corrAssets.map((rowKey) => (
                    <tr key={rowKey}>
                      <td className="py-1 pr-2 text-left font-medium text-[var(--text-secondary)]">
                        {rowKey.split("_")[0]}
                      </td>
                      {corrAssets.map((colKey) => {
                        const val = frontier.correlation_matrix[rowKey]?.[colKey] ?? 0;
                        const absV = Math.min(1, Math.abs(val));
                        const bg =
                          rowKey === colKey
                            ? "rgba(56, 189, 248, 0.25)"
                            : val >= 0
                              ? `rgba(16, 185, 129, ${(0.08 + 0.35 * absV).toFixed(2)})`
                              : `rgba(244, 63, 94, ${(0.08 + 0.35 * absV).toFixed(2)})`;
                        return (
                          <td key={colKey} className="p-0.5">
                            <div className="rounded py-1.5 text-[var(--text-primary)]" style={{ backgroundColor: bg }}>
                              {val.toFixed(2)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
