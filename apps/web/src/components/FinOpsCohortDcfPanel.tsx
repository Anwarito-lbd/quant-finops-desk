"use client";

import React, { useId, useState } from "react";
import type { CohortAnalysisResult, DCFResult } from "@/lib/types";

interface FinOpsCohortDcfPanelProps {
  cohorts: CohortAnalysisResult;
  dcf: DCFResult;
  wacc: number;
  terminalGrowth: number;
  monthlyChurn: number;
  onWaccChange: (val: number) => void;
  onTerminalGrowthChange: (val: number) => void;
  onMonthlyChurnChange: (val: number) => void;
  onUpdateFinOps: () => void;
  loading: boolean;
}

export function FinOpsCohortDcfPanel({
  cohorts,
  dcf,
  wacc,
  terminalGrowth,
  monthlyChurn,
  onWaccChange,
  onTerminalGrowthChange,
  onMonthlyChurnChange,
  onUpdateFinOps,
  loading,
}: FinOpsCohortDcfPanelProps) {
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
  const churnId = useId();
  const waccId = useId();
  const tgId = useId();

  const flatEvs = dcf.sensitivity_ev_grid.flat().filter((v) => v > 0);
  const minEv = Math.min(...flatEvs);
  const maxEv = Math.max(...flatEvs);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* SaaS Cohort Retention & Unit Economics */}
        <section className="workstation-card p-4 sm:p-5">
          <div className="mb-3">
            <h2 className="text-base font-semibold tracking-tight">
              SaaS &amp; Ecommerce Cohort Retention &amp; Unit Economics
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              12-month logo retention triangle, Gross-Margin LTV/CAC, Payback, Burn Multiple &amp; Rule of 40
            </p>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">LTV / CAC</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-emerald-400">
                {cohorts.ltv_to_cac.toFixed(2)}x
              </div>
            </div>
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">CAC Payback</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold">
                {cohorts.cac_payback_months.toFixed(1)} mo
              </div>
            </div>
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">Burn Multiple</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-sky-400">
                {cohorts.burn_multiple.toFixed(2)}x
              </div>
            </div>
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">Rule of 40</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-amber-400">
                {cohorts.rule_of_40_pct.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="font-mono-num w-full min-w-[480px] border-collapse text-center text-[10px]">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="py-1 pr-2 text-left font-medium">Cohort</th>
                  {cohorts.month_offsets.slice(0, 10).map((m) => (
                    <th key={m} className="px-1 py-1 font-medium">
                      M{m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.cohort_labels.slice(0, 10).map((label, rIdx) => (
                  <tr key={label}>
                    <td className="py-0.5 pr-2 text-left font-medium text-[var(--text-muted)]">{label}</td>
                    {cohorts.logo_retention_matrix[rIdx].slice(0, 10).map((val, cIdx) => {
                      if (val === null) return <td key={cIdx} className="p-0.5" />;
                      const pct = val * 100;
                      const alpha = Math.max(0.2, Math.min(0.9, (pct - 55) / 50));
                      return (
                        <td key={cIdx} className="p-0.5">
                          <div
                            className="rounded py-1 font-medium text-white"
                            style={{ backgroundColor: `rgba(14, 165, 233, ${alpha.toFixed(2)})` }}
                            title={`${label} M${cIdx}: ${pct.toFixed(1)}% retained`}
                          >
                            {pct.toFixed(0)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <label htmlFor={churnId}>
                Monthly Churn: <strong className="font-mono-num text-[var(--text-primary)]">{(monthlyChurn * 100).toFixed(1)}%</strong>
              </label>
              <input
                id={churnId}
                type="range"
                min="0.015"
                max="0.075"
                step="0.002"
                value={monthlyChurn}
                onChange={(e) => onMonthlyChurnChange(parseFloat(e.target.value))}
                className="w-24 accent-sky-400"
              />
            </div>
            <span className="font-mono-num text-[var(--text-muted)]">
              LTV ${cohorts.ltv_usd.toLocaleString()} · 12M NDR {(cohorts.ndr_12m * 100).toFixed(1)}%
            </span>
          </div>
        </section>

        {/* 5-Year DCF Valuation & Sensitivity Grid */}
        <section className="workstation-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                5-Year Unlevered DCF Valuation &amp; Sensitivity Grid
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Gordon Growth vs. Exit EBITDA Multiple · WACC × Terminal Growth Heatmap
              </p>
            </div>
            <button
              type="button"
              onClick={onUpdateFinOps}
              disabled={loading}
              className="touch-target min-h-[36px] rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
            >
              {loading ? "Updating…" : "Recalculate FinOps"}
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">Enterprise Value</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-emerald-400">
                ${(dcf.enterprise_value_gordon / 1e6).toFixed(2)}M
              </div>
            </div>
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">Equity Value</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold">
                ${(dcf.equity_value_gordon / 1e6).toFixed(2)}M
              </div>
            </div>
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">Implied Share Px</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-amber-400">
                ${dcf.implied_share_price_gordon.toFixed(2)}
              </div>
            </div>
            <div className="workstation-subcard px-3 py-2">
              <div className="text-[var(--text-muted)]">Exit Mult. EV</div>
              <div className="font-mono-num mt-0.5 text-sm font-bold text-purple-400">
                ${(dcf.enterprise_value_exit_multiple / 1e6).toFixed(2)}M
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="font-mono-num w-full min-w-[460px] border-collapse text-center text-[11px]">
              <thead>
                <tr className="text-[var(--text-muted)]">
                  <th className="py-1 pr-2 text-left font-medium">WACC \ g</th>
                  {dcf.tg_axis.map((g) => (
                    <th key={g} className="px-1.5 py-1 font-medium">
                      {(g * 100).toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dcf.wacc_axis.map((w, rIdx) => (
                  <tr key={w}>
                    <td className="py-1 pr-2 text-left font-medium text-[var(--text-muted)]">
                      {(w * 100).toFixed(1)}%
                    </td>
                    {dcf.sensitivity_ev_grid[rIdx].map((evCell, cIdx) => {
                      const norm = maxEv > minEv ? (evCell - minEv) / (maxEv - minEv) : 0.5;
                      const alpha = (0.22 + 0.65 * Math.max(0, Math.min(1, norm))).toFixed(2);
                      const isBase = rIdx === 2 && cIdx === 2;
                      const isSelected = selectedCell?.r === rIdx && selectedCell?.c === cIdx;
                      return (
                        <td key={cIdx} className="p-0.5">
                          <button
                            type="button"
                            onClick={() => setSelectedCell({ r: rIdx, c: cIdx })}
                            className={`w-full rounded py-1.5 font-semibold text-white transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                              isSelected
                                ? "ring-2 ring-sky-400"
                                : isBase
                                  ? "ring-2 ring-amber-400"
                                  : ""
                            }`}
                            style={{ backgroundColor: `rgba(16, 185, 129, ${alpha})` }}
                          >
                            ${(evCell / 1e6).toFixed(2)}M
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 text-xs">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <label htmlFor={waccId}>
                WACC: <strong className="font-mono-num text-[var(--text-primary)]">{(wacc * 100).toFixed(1)}%</strong>
              </label>
              <input
                id={waccId}
                type="range"
                min="0.075"
                max="0.165"
                step="0.005"
                value={wacc}
                onChange={(e) => onWaccChange(parseFloat(e.target.value))}
                className="w-24 accent-emerald-400"
              />
            </div>
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <label htmlFor={tgId}>
                Terminal g: <strong className="font-mono-num text-[var(--text-primary)]">{(terminalGrowth * 100).toFixed(1)}%</strong>
              </label>
              <input
                id={tgId}
                type="range"
                min="0.015"
                max="0.045"
                step="0.005"
                value={terminalGrowth}
                onChange={(e) => onTerminalGrowthChange(parseFloat(e.target.value))}
                className="w-24 accent-emerald-400"
              />
            </div>
          </div>
        </section>
      </div>

      {/* 5-Year Cash Flow Schedule Table */}
      {dcf.schedule.length > 0 && (
        <section className="workstation-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">5-Year Unlevered Free Cash Flow (UFCF) Schedule</h3>
              <p className="text-xs text-[var(--text-muted)]">
                Terminal Value represents {dcf.tv_share_of_ev_pct.toFixed(1)}% of Gordon Growth Enterprise Value
              </p>
            </div>
            <span className="font-mono-num text-xs text-emerald-400">
              Sum PV(UFCF): ${(dcf.sum_pv_ufcf / 1e6).toFixed(2)}M
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="font-mono-num w-full min-w-[600px] border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  <th className="py-2 pr-3 text-left font-medium">Year</th>
                  <th className="py-2 pr-3 font-medium">Revenue</th>
                  <th className="py-2 pr-3 font-medium">EBIT</th>
                  <th className="py-2 pr-3 font-medium">NOPAT</th>
                  <th className="py-2 pr-3 font-medium">D&amp;A</th>
                  <th className="py-2 pr-3 font-medium">CapEx</th>
                  <th className="py-2 pr-3 font-medium">UFCF</th>
                  <th className="py-2 font-medium">PV(UFCF)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {dcf.schedule.map((row) => (
                  <tr key={row.year} className="hover:bg-[var(--bg-hover)]/50">
                    <td className="py-2 pr-3 text-left font-semibold text-[var(--text-primary)]">Year {row.year}</td>
                    <td className="py-2 pr-3">${(row.revenue / 1e6).toFixed(2)}M</td>
                    <td className="py-2 pr-3">${(row.ebit / 1e6).toFixed(2)}M</td>
                    <td className="py-2 pr-3">${(row.nopat / 1e6).toFixed(2)}M</td>
                    <td className="py-2 pr-3 text-[var(--text-muted)]">${(row.da / 1e3).toFixed(0)}k</td>
                    <td className="py-2 pr-3 text-[var(--text-muted)]">${(row.capex / 1e3).toFixed(0)}k</td>
                    <td className="py-2 pr-3 font-semibold text-sky-400">${(row.ufcf / 1e6).toFixed(2)}M</td>
                    <td className="py-2 font-semibold text-emerald-400">${(row.pv_ufcf / 1e6).toFixed(2)}M</td>
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
