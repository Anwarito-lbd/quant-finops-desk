"""Typed Pydantic v2 request/response schemas for Quant & FinOps Desk OpenAPI."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class OptimizeRequest(BaseModel):
    risk_free_ann: float = Field(default=0.04, ge=0.0, le=0.20)
    cvar_alpha: float = Field(default=0.95, gt=0.50, lt=0.999)
    max_weight: float = Field(default=0.60, ge=0.25, le=1.0)
    n_days: int = Field(default=252, ge=60, le=1000)
    seed: int = Field(default=42, ge=1, le=99999)


class MonteCarloRequest(BaseModel):
    initial_capital: float = Field(default=250_000.0, gt=1000.0)
    horizon_days: int = Field(default=252, ge=20, le=756)
    n_sims: int = Field(default=3000, ge=100, le=10000)
    mu_calm_ann: float = Field(default=0.16, ge=-0.50, le=1.0)
    sigma_calm_ann: float = Field(default=0.09, gt=0.005, le=1.0)
    mu_stress_ann: float = Field(default=-0.08, ge=-0.80, le=0.50)
    sigma_stress_ann: float = Field(default=0.26, gt=0.01, le=1.5)
    p_stay_calm: float = Field(default=0.96, ge=0.5, le=0.999)
    p_stay_stress: float = Field(default=0.88, ge=0.5, le=0.999)
    ruin_fraction: float = Field(default=0.75, gt=0.1, lt=0.99)
    seed: int = Field(default=42, ge=1, le=99999)


class CohortRequest(BaseModel):
    n_cohorts: int = Field(default=12, ge=4, le=24)
    arpa_monthly_usd: float = Field(default=195.0, gt=1.0)
    gross_margin: float = Field(default=0.78, gt=0.05, le=1.0)
    cac_usd: float = Field(default=1150.0, gt=1.0)
    monthly_logo_churn: float = Field(default=0.032, gt=0.002, lt=0.50)
    monthly_expansion_rate: float = Field(default=0.012, ge=0.0, le=0.25)
    net_burn_annual_usd: float = Field(default=680_000.0, ge=0.0)
    net_new_arr_usd: float = Field(default=950_000.0, gt=1.0)
    arr_growth_rate: float = Field(default=0.48, ge=-0.5, le=3.0)
    fcf_margin: float = Field(default=0.08, ge=-1.0, le=0.8)


class DCFRequest(BaseModel):
    base_revenue_usd: float = Field(default=4_200_000.0, gt=10_000.0)
    revenue_growth_rates: tuple[float, float, float, float, float] = (0.38, 0.32, 0.26, 0.21, 0.17)
    ebit_margins: tuple[float, float, float, float, float] = (0.06, 0.11, 0.16, 0.20, 0.23)
    tax_rate: float = Field(default=0.23, ge=0.0, le=0.55)
    wacc: float = Field(default=0.115, gt=0.03, lt=0.35)
    terminal_growth: float = Field(default=0.03, ge=-0.01, lt=0.10)
    exit_ebitda_multiple: float = Field(default=14.0, gt=2.0, le=50.0)
    cash_usd: float = Field(default=1_450_000.0, ge=0.0)
    debt_usd: float = Field(default=350_000.0, ge=0.0)
    diluted_shares: float = Field(default=1_000_000.0, gt=1.0)


class HealthResponse(BaseModel):
    status: str
    execution_mode: str
    desks_integrated: list[str]


class TerminalOverviewResponse(BaseModel):
    execution_mode: str
    desk_report: dict[str, Any]
    monte_carlo_regime: dict[str, Any]
    monte_carlo_bootstrap: dict[str, Any]
    cohorts: dict[str, Any]
    dcf: dict[str, Any]
