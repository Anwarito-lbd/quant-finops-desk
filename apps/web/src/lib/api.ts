import type {
  CohortAnalysisResult,
  DCFResult,
  DeskReport,
  MonteCarloResult,
  TerminalOverview,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export function fetchTerminalOverview(): Promise<TerminalOverview> {
  return requestJson<TerminalOverview>("/api/v1/terminal/overview");
}

export function postOptimizePortfolio(payload: {
  risk_free_ann: number;
  cvar_alpha: number;
  max_weight: number;
}): Promise<DeskReport> {
  return requestJson<DeskReport>("/api/v1/quant/optimize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postMonteCarlo(payload: {
  initial_capital: number;
  horizon_days: number;
  n_sims: number;
  mu_calm_ann: number;
  sigma_calm_ann: number;
  mu_stress_ann: number;
  sigma_stress_ann: number;
}): Promise<MonteCarloResult> {
  return requestJson<MonteCarloResult>("/api/v1/quant/montecarlo", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postCohorts(payload: {
  arpa_monthly_usd: number;
  gross_margin: number;
  cac_usd: number;
  monthly_logo_churn: number;
  arr_growth_rate: number;
  fcf_margin: number;
}): Promise<CohortAnalysisResult> {
  return requestJson<CohortAnalysisResult>("/api/v1/finops/cohorts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function postDcf(payload: {
  base_revenue_usd: number;
  wacc: number;
  terminal_growth: number;
  exit_ebitda_multiple: number;
}): Promise<DCFResult> {
  return requestJson<DCFResult>("/api/v1/finops/dcf", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
