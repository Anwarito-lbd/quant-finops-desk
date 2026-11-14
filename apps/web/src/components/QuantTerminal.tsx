"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Layers,
  Lock,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  TrendingUp,
} from "lucide-react";
import {
  fetchTerminalOverview,
  postCohorts,
  postDcf,
  postMonteCarlo,
  postOptimizePortfolio,
} from "@/lib/api";
import type { TerminalOverview } from "@/lib/types";
import { FinOpsCohortDcfPanel } from "./FinOpsCohortDcfPanel";
import { FrontierChart } from "./FrontierChart";
import { MonteCarloFanChart } from "./MonteCarloFanChart";
import { StrategyDeskHub } from "./StrategyDeskHub";

type WorkspaceTab = "synthesis" | "frontier" | "montecarlo" | "finops";

const TABS: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "synthesis", label: "Cross-Desk Synthesis", icon: Layers },
  { id: "frontier", label: "Markowitz & CVaR Frontier", icon: TrendingUp },
  { id: "montecarlo", label: "Monte Carlo Stress", icon: Activity },
  { id: "finops", label: "SaaS Cohorts & DCF", icon: BarChart3 },
];

interface QuantTerminalProps {
  initialOverview?: TerminalOverview | null;
}

export function QuantTerminal({ initialOverview = null }: QuantTerminalProps) {
  const [data, setData] = useState<TerminalOverview | null>(initialOverview);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("synthesis");

  const [maxWeight, setMaxWeight] = useState(0.6);
  const [riskFree, setRiskFree] = useState(0.04);
  const [cvarAlpha, setCvarAlpha] = useState(0.95);
  const [sigmaStress, setSigmaStress] = useState(0.26);
  const [pStayStress, setPStayStress] = useState(0.88);
  const [horizonDays, setHorizonDays] = useState(252);
  const [wacc, setWacc] = useState(0.115);
  const [terminalGrowth, setTerminalGrowth] = useState(0.03);
  const [monthlyChurn, setMonthlyChurn] = useState(0.032);

  const [optLoading, setOptLoading] = useState(false);
  const [mcLoading, setMcLoading] = useState(false);
  const [finopsLoading, setFinopsLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("tab") as WorkspaceTab | null;
      if (param && TABS.some((t) => t.id === param)) {
        setActiveTab(param);
      }
    }
  }, []);

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
          setError(err instanceof Error ? err.message : "Failed to connect to FastAPI telemetry");
        }
      });
    return () => {
      active = false;
    };
  }, [initialOverview]);

  const selectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  };

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
    setStatusMessage("Solving Markowitz & CVaR frontiers…");
    try {
      const updated = await postOptimizePortfolio({
        risk_free_ann: riskFree,
        cvar_alpha: cvarAlpha,
        max_weight: maxWeight,
      });
      setData({ ...data, desk_report: updated });
      setStatusMessage("Frontier optimization updated.");
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
    setStatusMessage("Simulating 3,000 regime-switching Monte Carlo paths…");
    try {
      const updated = await postMonteCarlo({
        initial_capital: 250000,
        horizon_days: horizonDays,
        n_sims: 3000,
        mu_calm_ann: Math.max(0.08, data.desk_report.frontier.max_sharpe.expected_return_ann),
        sigma_calm_ann: Math.max(0.06, data.desk_report.frontier.max_sharpe.volatility_ann),
        mu_stress_ann: -0.08,
        sigma_stress_ann: sigmaStress,
        p_stay_stress: pStayStress,
      });
      setData({ ...data, monte_carlo_regime: updated });
      setStatusMessage("Monte Carlo stress paths updated.");
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
    setStatusMessage("Recalculating cohort LTV/CAC and 5-year DCF…");
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
      setStatusMessage("Corporate FinOps valuation updated.");
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "FinOps recalculation failed");
    } finally {
      setFinopsLoading(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <a
        href="#workstation-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-sky-500 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-slate-950"
      >
        Skip to workstation content
      </a>

      {/* Sticky 56px Command Topbar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
              <Activity className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-bold tracking-tight sm:text-base">
                  Quant &amp; FinOps Desk
                </h1>
                {data && (
                  <span
                    className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline-flex ${
                      data.desk_report.audit_chain_valid
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-rose-500/15 text-rose-400"
                    }`}
                  >
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    SHA-256 Verified · {data.desk_report.audit_event_count}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span className="hidden items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-400 md:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              5 Repos · Paper Only
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle color theme"
              className="touch-target inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-sky-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {theme === "dark" ? (
                <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusMessage("Refreshing live telemetry…");
                fetchTerminalOverview()
                  .then((res) => {
                    setData(res);
                    setStatusMessage("Telemetry refreshed.");
                  })
                  .catch(() => {});
              }}
              aria-label="Refresh telemetry"
              className="touch-target inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-sky-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* 4-Workspace Navigation Rail */}
        <nav
          aria-label="Workstation modules"
          className="mx-auto max-w-7xl border-t border-[var(--border-subtle)] px-3 sm:px-6"
        >
          <div
            role="tablist"
            aria-label="Quant and FinOps Views"
            className="flex items-center gap-1 overflow-x-auto py-1.5 no-scrollbar"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectTab(tab.id)}
                  className={`touch-target inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    selected
                      ? "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/40"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="sr-only" aria-live="polite">
        {statusMessage}
      </div>

      <div id="workstation-main" className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-5">
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300"
          >
            FastAPI Backend Error: {error}. Verify uvicorn is running on port 8000 and click Refresh.
          </div>
        )}

        {!data ? (
          <div className="workstation-card flex h-64 items-center justify-center text-sm text-[var(--text-muted)]">
            Connecting to FastAPI Quant &amp; FinOps Engine…
          </div>
        ) : (
          <main className="space-y-4">
            {/* Compact Executive KPI Strip */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <div className="workstation-card p-3">
                <div className="text-[11px] text-[var(--text-muted)]">Tangency Sharpe</div>
                <div className="font-mono-num mt-1 text-lg font-bold text-amber-400">
                  {data.desk_report.frontier.max_sharpe.sharpe_ratio.toFixed(2)}
                </div>
              </div>
              <div className="workstation-card p-3">
                <div className="text-[11px] text-[var(--text-muted)]">Min-CVaR₉₅ (Daily)</div>
                <div className="font-mono-num mt-1 text-lg font-bold text-purple-400">
                  {(data.desk_report.frontier.min_cvar.cvar_daily * 100).toFixed(2)}%
                </div>
              </div>
              <div className="workstation-card p-3">
                <div className="text-[11px] text-[var(--text-muted)]">Treasury P50 (1Y)</div>
                <div className="font-mono-num mt-1 text-lg font-bold text-sky-400">
                  ${(data.monte_carlo_regime.terminal_p50 / 1000).toFixed(1)}k
                </div>
              </div>
              <div className="workstation-card p-3">
                <div className="text-[11px] text-[var(--text-muted)]">MC 95% Max DD</div>
                <div className="font-mono-num mt-1 text-lg font-bold text-emerald-400">
                  {(data.monte_carlo_regime.dd_p95 * 100).toFixed(1)}%
                </div>
              </div>
              <div className="workstation-card p-3">
                <div className="text-[11px] text-[var(--text-muted)]">SaaS LTV / CAC</div>
                <div className="font-mono-num mt-1 text-lg font-bold text-emerald-400">
                  {data.cohorts.ltv_to_cac.toFixed(2)}x
                </div>
              </div>
              <div className="workstation-card p-3">
                <div className="text-[11px] text-[var(--text-muted)]">5Y DCF Ent. Value</div>
                <div className="font-mono-num mt-1 text-lg font-bold text-amber-400">
                  ${(data.dcf.enterprise_value_gordon / 1e6).toFixed(2)}M
                </div>
              </div>
            </div>

            {activeTab === "synthesis" && (
              <div className="space-y-4">
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
                  chainValid={data.desk_report.audit_chain_valid}
                  totalEvents={data.desk_report.audit_event_count}
                  auditEvents={data.desk_report.audit_sample_events}
                />
              </div>
            )}

            {activeTab === "frontier" && (
              <FrontierChart
                frontier={data.desk_report.frontier}
                streams={data.desk_report.streams}
                maxWeight={maxWeight}
                riskFree={riskFree}
                cvarAlpha={cvarAlpha}
                onMaxWeightChange={setMaxWeight}
                onRiskFreeChange={setRiskFree}
                onCvarAlphaChange={setCvarAlpha}
                onReoptimize={handleReoptimize}
                loading={optLoading}
                expanded
              />
            )}

            {activeTab === "montecarlo" && (
              <MonteCarloFanChart
                mcRegime={data.monte_carlo_regime}
                mcBootstrap={data.monte_carlo_bootstrap}
                sigmaStress={sigmaStress}
                pStayStress={pStayStress}
                horizonDays={horizonDays}
                onSigmaStressChange={setSigmaStress}
                onPStayStressChange={setPStayStress}
                onHorizonDaysChange={setHorizonDays}
                onRunStress={handleRunStress}
                loading={mcLoading}
                expanded
              />
            )}

            {activeTab === "finops" && (
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
            )}
          </main>
        )}
      </div>
    </div>
  );
}
