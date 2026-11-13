"""FastAPI backend exposing Quant Portfolio, Monte Carlo, Multi-Desk & FinOps endpoints."""
from __future__ import annotations

from dataclasses import asdict

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.finops.cohorts import CohortInputs, compute_cohort_analysis
from src.finops.dcf import DCFInputs, compute_dcf_valuation
from src.quant.adapters import EXECUTION_MODE, run_unified_desk_pipeline
from src.quant.montecarlo import (
    RegimeParams,
    simulate_block_bootstrap,
    simulate_regime_switching_gbm,
)

from .schemas import (
    CohortRequest,
    DCFRequest,
    HealthResponse,
    MonteCarloRequest,
    OptimizeRequest,
    TerminalOverviewResponse,
)

app = FastAPI(
    title="Quant & FinOps Desk API",
    version="0.1.0",
    description=(
        "Unified Engineering Management, Quantitative Strategy Aggregation, "
        "Monte Carlo Treasury Stress Testing, and Corporate FinOps API. "
        "Strictly paper/analytical — zero live order routing."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        execution_mode=EXECUTION_MODE,
        desks_integrated=[
            "arbitrage-",
            "meme-flight-recorder",
            "goldfarm",
            "goldea",
            "goldbrain-workspace",
        ],
    )


@app.get("/api/v1/terminal/overview", response_model=TerminalOverviewResponse)
def terminal_overview() -> TerminalOverviewResponse:
    desk_report, ret_matrix = run_unified_desk_pipeline()
    max_sharpe_w = np.array(
        [desk_report.frontier.max_sharpe.weights[name] for name in desk_report.frontier.assets],
        dtype=float,
    )
    port_rets = ret_matrix @ max_sharpe_w

    mc_regime = simulate_regime_switching_gbm(
        initial_capital=250_000.0,
        horizon_days=252,
        n_sims=3000,
        params=RegimeParams(
            mu_calm_ann=max(0.08, desk_report.frontier.max_sharpe.expected_return_ann),
            sigma_calm_ann=max(0.06, desk_report.frontier.max_sharpe.volatility_ann),
        ),
        ruin_fraction=0.75,
    )
    mc_boot = simulate_block_bootstrap(
        port_rets,
        initial_capital=250_000.0,
        horizon_days=252,
        n_sims=3000,
        block_size=5,
        skip_prob=0.10,
        ruin_fraction=0.75,
    )
    cohorts = compute_cohort_analysis()
    dcf = compute_dcf_valuation()

    return TerminalOverviewResponse(
        execution_mode=EXECUTION_MODE,
        desk_report=desk_report.to_dict(),
        monte_carlo_regime=asdict(mc_regime),
        monte_carlo_bootstrap=asdict(mc_boot),
        cohorts=cohorts.to_dict(),
        dcf=dcf.to_dict(),
    )


@app.post("/api/v1/quant/optimize")
def optimize_portfolio(req: OptimizeRequest) -> dict:
    try:
        desk_report, _ = run_unified_desk_pipeline(
            n_days=req.n_days,
            seed=req.seed,
            risk_free_ann=req.risk_free_ann,
            cvar_alpha=req.cvar_alpha,
            max_weight=req.max_weight,
        )
        return desk_report.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/v1/quant/montecarlo")
def run_monte_carlo(req: MonteCarloRequest) -> dict:
    try:
        res = simulate_regime_switching_gbm(
            initial_capital=req.initial_capital,
            horizon_days=req.horizon_days,
            n_sims=req.n_sims,
            params=RegimeParams(
                mu_calm_ann=req.mu_calm_ann,
                sigma_calm_ann=req.sigma_calm_ann,
                mu_stress_ann=req.mu_stress_ann,
                sigma_stress_ann=req.sigma_stress_ann,
                p_stay_calm=req.p_stay_calm,
                p_stay_stress=req.p_stay_stress,
            ),
            ruin_fraction=req.ruin_fraction,
            seed=req.seed,
        )
        return asdict(res)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/v1/finops/cohorts")
def run_cohorts(req: CohortRequest) -> dict:
    try:
        res = compute_cohort_analysis(
            CohortInputs(
                n_cohorts=req.n_cohorts,
                arpa_monthly_usd=req.arpa_monthly_usd,
                gross_margin=req.gross_margin,
                cac_usd=req.cac_usd,
                monthly_logo_churn=req.monthly_logo_churn,
                monthly_expansion_rate=req.monthly_expansion_rate,
                net_burn_annual_usd=req.net_burn_annual_usd,
                net_new_arr_usd=req.net_new_arr_usd,
                arr_growth_rate=req.arr_growth_rate,
                fcf_margin=req.fcf_margin,
            )
        )
        return res.to_dict()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/v1/finops/dcf")
def run_dcf(req: DCFRequest) -> dict:
    if req.wacc <= req.terminal_growth + 0.002:
        raise HTTPException(status_code=422, detail="WACC must strictly exceed terminal_growth")
    res = compute_dcf_valuation(
        DCFInputs(
            base_revenue_usd=req.base_revenue_usd,
            revenue_growth_rates=req.revenue_growth_rates,
            ebit_margins=req.ebit_margins,
            tax_rate=req.tax_rate,
            wacc=req.wacc,
            terminal_growth=req.terminal_growth,
            exit_ebitda_multiple=req.exit_ebitda_multiple,
            cash_usd=req.cash_usd,
            debt_usd=req.debt_usd,
            diluted_shares=req.diluted_shares,
        )
    )
    return res.to_dict()
