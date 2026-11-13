"""SaaS / Ecommerce Cohort Retention, LTV/CAC, Payback Period, Burn Multiple & Rule of 40."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import numpy as np


@dataclass(frozen=True)
class CohortInputs:
    """Operating unit-economics assumptions for cohort retention modeling."""

    n_cohorts: int = 12
    initial_customers_per_cohort: int = 120
    arpa_monthly_usd: float = 195.0
    gross_margin: float = 0.78
    cac_usd: float = 1150.0
    monthly_logo_churn: float = 0.032
    monthly_expansion_rate: float = 0.012
    net_burn_annual_usd: float = 680_000.0
    net_new_arr_usd: float = 950_000.0
    arr_growth_rate: float = 0.48
    fcf_margin: float = 0.08
    cohort_improvement_per_month: float = 0.0015  # slight retention improvement in newer cohorts


@dataclass(frozen=True)
class CohortAnalysisResult:
    """Computed cohort retention matrix and SaaS/Ecommerce FinOps KPIs."""

    cohort_labels: list[str]
    month_offsets: list[int]
    logo_retention_matrix: list[list[float | None]]
    revenue_retention_matrix: list[list[float | None]]
    avg_retention_curve: list[float]
    ndr_12m: float
    ltv_usd: float
    cac_usd: float
    ltv_to_cac: float
    cac_payback_months: float
    burn_multiple: float
    rule_of_40_pct: float
    monthly_gross_profit_per_customer: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def compute_cohort_analysis(inputs: CohortInputs | None = None) -> CohortAnalysisResult:
    """Generate cohort retention matrix and derive unit-economics metrics."""
    p = inputs or CohortInputs()
    if not (0.0 < p.monthly_logo_churn < 1.0):
        raise ValueError("monthly_logo_churn must be in (0, 1)")
    if not (0.0 < p.gross_margin <= 1.0):
        raise ValueError("gross_margin must be in (0, 1]")
    if p.cac_usd <= 0 or p.arpa_monthly_usd <= 0:
        raise ValueError("cac_usd and arpa_monthly_usd must be positive")

    m = p.n_cohorts
    logo_mat: list[list[float | None]] = []
    rev_mat: list[list[float | None]] = []
    cohort_labels = [f"2025-{(i + 1):02d}" for i in range(m)]
    month_offsets = list(range(m))

    for c_idx in range(m):
        # Newer cohorts retain slightly better due to product/onboarding improvements
        eff_churn = max(0.008, p.monthly_logo_churn - c_idx * p.cohort_improvement_per_month)
        logo_row: list[float | None] = []
        rev_row: list[float | None] = []
        max_age = m - c_idx
        for age in range(m):
            if age >= max_age:
                logo_row.append(None)
                rev_row.append(None)
                continue
            # Slight early-month hazard decay stabilizing over tenure
            logo_ret = ((1.0 - eff_churn) ** age) * (1.0 - 0.015 * min(age, 2) if age > 0 else 1.0)
            logo_ret = float(np.clip(logo_ret, 0.0, 1.0))
            rev_ret = logo_ret * ((1.0 + p.monthly_expansion_rate) ** age)
            logo_row.append(round(logo_ret, 4))
            rev_row.append(round(float(rev_ret), 4))
        logo_mat.append(logo_row)
        rev_mat.append(rev_row)

    avg_curve: list[float] = []
    for age in range(m):
        vals: list[float] = []
        for row in logo_mat:
            cell = row[age]
            if cell is not None:
                vals.append(cell)
        avg_curve.append(round(float(np.mean(vals)), 4) if vals else 0.0)

    # 12-month Net Dollar Retention from oldest cohort trajectory
    r0_vals = [v for v in rev_mat[0] if v is not None]
    ndr_12m = float(r0_vals[-1]) if r0_vals else 1.0

    # Standard SaaS LTV = (ARPA * Gross Margin) / Monthly Churn (with net churn floor)
    net_monthly_decay = max(0.005, p.monthly_logo_churn - 0.5 * p.monthly_expansion_rate)
    monthly_gp = p.arpa_monthly_usd * p.gross_margin
    ltv = monthly_gp / net_monthly_decay
    ltv_cac = ltv / p.cac_usd
    payback = p.cac_usd / monthly_gp
    burn_mult = p.net_burn_annual_usd / max(1.0, p.net_new_arr_usd)
    rule_40 = (p.arr_growth_rate + p.fcf_margin) * 100.0

    return CohortAnalysisResult(
        cohort_labels=cohort_labels,
        month_offsets=month_offsets,
        logo_retention_matrix=logo_mat,
        revenue_retention_matrix=rev_mat,
        avg_retention_curve=avg_curve,
        ndr_12m=round(ndr_12m, 4),
        ltv_usd=round(ltv, 2),
        cac_usd=round(p.cac_usd, 2),
        ltv_to_cac=round(ltv_cac, 2),
        cac_payback_months=round(payback, 2),
        burn_multiple=round(burn_mult, 2),
        rule_of_40_pct=round(rule_40, 2),
        monthly_gross_profit_per_customer=round(monthly_gp, 2),
    )
