"use client";

import React, { useEffect, useState } from "react";
import { Activity, Moon, RefreshCw, ShieldCheck, Sun } from "lucide-react";
import {
  fetchTerminalOverview,
  postCohorts,
  postDcf,
  postMonteCarlo,
  postOptimizePortfolio,
} from "@/lib/api";
import type { TerminalOverview } from "@/lib/types";
import { AuditTrailPanel } from "./AuditTrailPanel";
import { FinOpsCohortDcfPanel } from "./FinOpsCohortDcfPanel";
import { FrontierChart } from "./FrontierChart";
import { MonteCarloFanChart } from "./MonteCarloFanChart";
import { StrategyDeskHub } from "./StrategyDeskHub";

interface QuantTerminalProps {
  initialOverview?: TerminalOverview | null;
}

export function QuantTerminal({ initialOverview = null }: QuantTerminalProps) {
  const [data, setData] = useState<TerminalOverview | null>(initialOverview);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const [maxWeight, setMaxWeight] = useState(0.6);
  const [sigmaStress, setSigmaStress] = useState(0.26);
  const [wacc, setWacc] = useState(0.115);
  const [terminalGrowth, setTerminalGrowth] = useState(0.03);
  const [monthlyChurn, setMonthlyChurn] = useState(0.032);

  const [optLoading, setOptLoading] = useState(false);
  const [mcLoading, setMcLoading] = useState(false);
  const [finopsLoading, setFinopsLoading] = useState(false);

  useEffect(() => {
    if (initialOverview) return;
    let active = true;
    fetchTerminalOverview()
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load FastAPI telemetry");
        }
      });
    return () => {
      active = false;
    };
  }, [initialOverview]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", next === "light");
      document.documentElement.classList.toggle("dark", next === "dark");
    }
  };

  const handleReoptimize = async () => {
    if (!data) return;
    setOptLoading(true);
    try {
      const updated = await postOptimizePortfolio({
        risk_free_ann: 0.04,
        cvar_alpha: 0.95,
        max_weight: maxWeight,
      });
      setData({ ...data, desk_report: updated });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setOptLoading(false);
    }
  };

  const handleRunStress = async () => {
    if (!data) return;
    setMcLoading(true);
    try {
      const updated = await postMonteCarlo({
        initial_capital: 250000,
        horizon_days: 252,
        n_sims: 3000,
        mu_calm_ann: Math.max(0.08, data.desk_report.frontier.max_sharpe.expected_return_ann),
        sigma_calm_ann: Math.max(0.06, data.desk_report.frontier.max_sharpe.volatility_ann),
        mu_stress_ann: -0.08,
        sigma_stress_ann: sigmaStress,
      });
      setData({ ...data, monte_carlo_regime: updated });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Monte Carlo stress failed");
    } finally {
      setMcLoading(false);
    }
  };

  const handleUpdateFinOps = async () => {
    if (!data) return;
    setFinopsLoading(true);
    try {
      const [cohorts, dcf] = await Promise.all([
        postCohorts({
          arpa_monthly_usd: 195,
          gross_margin: 0.78,
          cac_usd: 1150,
          monthly_logo_churn: monthlyChurn,
          arr_growth_rate: 0.48,
          fcf_margin: 0.08,
        }),
        postDcf({
          base_revenue_usd: 4200000,
          wacc,
          terminal_growth: terminalGrowth,
          exit_ebitda_multiple: 14.0,
        }),
      ]);
      setData({ ...data, cohorts, dcf });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "FinOps recalculation failed");
    } finally {
      setFinopsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
      <header className="terminal-card mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">
                Quant &amp; FinOps Desk
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                5 REPOS UNIFIED · PAPER ONLY
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Markowitz / CVaR Optimizer · Regime-Switching Monte Carlo · Multi-Strategy Risk Hub · SaaS Cohorts &amp; DCF
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle color theme"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium transition hover:border-sky-500/60"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            type="button"
            onClick={() => {
              fetchTerminalOverview().then(setData).catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium transition hover:border-sky-500/60"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          FastAPI Backend Notice: {error}
        </div>
      )}

      {!data ? (
        <div className="terminal-card flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
          Connecting to FastAPI Quant &amp; FinOps Engine...
        </div>
      ) : (
        <main className="space-y-4">
          {/* Top KPI Ribbon */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <div className="terminal-card p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Tangency Sharpe</div>
              <div className="tabular-nums mt-1 text-lg font-bold text-amber-400">
                {data.desk_report.frontier.max_sharpe.sharpe_ratio.toFixed(2)}
              </div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Min-CVaR₉₅ (Daily)</div>
              <div className="tabular-nums mt-1 text-lg font-bold text-purple-400">
                {(data.desk_report.frontier.min_cvar.cvar_daily * 100).toFixed(2)}%
              </div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[11px] text-[var(--text-muted)]">Treasury Median (1Y)</div>
              <div className="tabular-nums mt-1 text-lg font-bold text-sky-400">
                ${(data.monte_carlo_regime.terminal_p50 / 1000).toFixed(1)}k
              </div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[11px] text-[var(--text-muted)]">MC 95% Max DD</div>
              <div className="tabular-nums mt-1 text-lg font-bold text-emerald-400">
                {(data.monte_carlo_regime.dd_p95 * 100).toFixed(1)}%
              </div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[11px] text-[var(--text-muted)]">SaaS LTV / CAC</div>
              <div className="tabular-nums mt-1 text-lg font-bold text-emerald-400">
                {data.cohorts.ltv_to_cac.toFixed(2)}x
              </div>
            </div>
            <div className="terminal-card p-3">
              <div className="text-[11px] text-[var(--text-muted)]">5Y DCF Enterprise Val</div>
              <div className="tabular-nums mt-1 text-lg font-bold text-amber-400">
                ${(data.dcf.enterprise_value_gordon / 1e6).toFixed(2)}M
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FrontierChart
              frontier={data.desk_report.frontier}
              streams={data.desk_report.streams}
              maxWeight={maxWeight}
              onMaxWeightChange={setMaxWeight}
              onReoptimize={handleReoptimize}
              loading={optLoading}
            />
            <MonteCarloFanChart
              mcRegime={data.monte_carlo_regime}
              mcBootstrap={data.monte_carlo_bootstrap}
              sigmaStress={sigmaStress}
              onSigmaStressChange={setSigmaStress}
              onRunStress={handleRunStress}
              loading={mcLoading}
            />
          </div>

          <StrategyDeskHub
            streams={data.desk_report.streams}
            frontier={data.desk_report.frontier}
          />

          <FinOpsCohortDcfPanel
            cohorts={data.cohorts}
            dcf={data.dcf}
            wacc={wacc}
            terminalGrowth={terminalGrowth}
            monthlyChurn={monthlyChurn}
            onWaccChange={setWacc}
            onTerminalGrowthChange={setTerminalGrowth}
            onMonthlyChurnChange={setMonthlyChurn}
            onUpdateFinOps={handleUpdateFinOps}
            loading={finopsLoading}
          />

          <AuditTrailPanel
            chainValid={data.desk_report.audit_chain_valid}
            totalEvents={data.desk_report.audit_event_count}
            events={data.desk_report.audit_sample_events}
          />
        </main>
      )}
    </div>
  );
}
