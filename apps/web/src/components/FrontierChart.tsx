"use client";

import React, { useState } from "react";
import type { FrontierResult, StrategyStream } from "@/lib/types";

interface FrontierChartProps {
  frontier: FrontierResult;
  streams: StrategyStream[];
  maxWeight: number;
  onMaxWeightChange: (val: number) => void;
  onReoptimize: () => void;
  loading: boolean;
}

export function FrontierChart({
  frontier,
  streams,
  maxWeight,
  onMaxWeightChange,
  onReoptimize,
  loading,
}: FrontierChartProps) {
  const [mode, setMode] = useState<"mv" | "cvar">("mv");

  const width = 580;
  const height = 280;
  const pad = { top: 20, right: 24, bottom: 38, left: 52 };
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
  const maxX = Math.max(...xValues) * 1.1 + 0.2;
  const minY = Math.min(...yValues) - 2.0;
  const maxY = Math.max(...yValues) + 2.5;

  const sx = (x: number) => pad.left + ((x - minX) / Math.max(1e-6, maxX - minX)) * plotW;
  const sy = (y: number) => pad.top + plotH - ((y - minY) / Math.max(1e-6, maxY - minY)) * plotH;

  const pathD = curvePts
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${sx(getX(pt)).toFixed(1)} ${sy(getY(pt)).toFixed(1)}`)
    .join(" ");

  const anchorPt = mode === "mv" ? frontier.min_variance : frontier.min_cvar;

  return (
    <section className="terminal-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {mode === "mv" ? "Markowitz Mean-Variance Frontier" : "Rockafellar-Uryasev CVaR₉₅ Frontier"}
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            {mode === "mv"
              ? "SLSQP variance minimization vs. individual strategy desks"
              : "Exact HiGHS LP minimizing 95% Daily Expected Shortfall"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("mv")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                mode === "mv" ? "bg-sky-500 text-slate-950" : "text-[var(--text-muted)]"
              }`}
            >
              Mean-Variance
            </button>
            <button
              type="button"
              onClick={() => setMode("cvar")}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                mode === "cvar" ? "bg-purple-500 text-white" : "text-[var(--text-muted)]"
              }`}
            >
              Mean-CVaR
            </button>
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full select-none">
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
                <text
                  x={pad.left - 8}
                  y={gy + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="var(--text-muted)"
                >
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
            strokeWidth="2.8"
          />

          {mode === "mv" &&
            streams.map((s) => {
              const cx = sx(s.annualized_vol * 100);
              const cy = sy(s.annualized_return * 100);
              const alignEnd = cx > width - 140;
              return (
                <g key={s.desk_id}>
                  <circle cx={cx} cy={cy} r="4.5" fill="#94a3b8" opacity="0.85" />
                  <text
                    x={alignEnd ? cx - 7 : cx + 6}
                    y={cy - 4}
                    textAnchor={alignEnd ? "end" : "start"}
                    fontSize="9.5"
                    fill="var(--text-muted)"
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
            fill="#22c55e"
            stroke="#090d16"
            strokeWidth="1.5"
          />
          <circle
            cx={sx(getX(frontier.max_sharpe))}
            cy={sy(getY(frontier.max_sharpe))}
            r="7"
            fill="#facc15"
            stroke="#090d16"
            strokeWidth="1.5"
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

      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs sm:grid-cols-3">
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
          <div className="text-[var(--text-muted)]">Max-Sharpe Tangency</div>
          <div className="tabular-nums mt-0.5 font-semibold text-amber-400">
            SR {frontier.max_sharpe.sharpe_ratio.toFixed(2)} · Ret{" "}
            {(frontier.max_sharpe.expected_return_ann * 100).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
          <div className="text-[var(--text-muted)]">
            {mode === "mv" ? "Min-Variance Anchor" : "Min-CVaR₉₅ Anchor"}
          </div>
          <div className="tabular-nums mt-0.5 font-semibold text-emerald-400">
            {mode === "mv"
              ? `Vol ${(frontier.min_variance.volatility_ann * 100).toFixed(2)}%`
              : `CVaR ${(frontier.min_cvar.cvar_daily * 100).toFixed(2)}%/d`}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-elevated)] px-3 py-2">
          <div>
            <div className="text-[var(--text-muted)]">Max Weight Cap: {(maxWeight * 100).toFixed(0)}%</div>
            <input
              aria-label="Max Weight Cap"
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
            className="rounded-md bg-sky-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50"
          >
            {loading ? "..." : "Solve"}
          </button>
        </div>
      </div>
    </section>
  );
}
