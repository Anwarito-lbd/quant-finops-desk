"""Tests for Corporate FinOps Cohort Unit Economics & 5-Year DCF Engine."""
from __future__ import annotations

import pytest

from src.finops.cohorts import CohortInputs, compute_cohort_analysis
from src.finops.dcf import DCFInputs, compute_dcf_valuation


def test_cohort_identities_and_monotonic_retention() -> None:
    res = compute_cohort_analysis(CohortInputs())
    assert len(res.logo_retention_matrix) == 12
    assert res.logo_retention_matrix[0][0] == 1.0
    # Retention decreases monotonically along a cohort row
    row0 = [v for v in res.logo_retention_matrix[0] if v is not None]
    assert all(row0[i] >= row0[i + 1] for i in range(len(row0) - 1))
    assert res.ltv_to_cac == round(res.ltv_usd / res.cac_usd, 2)
    assert res.cac_payback_months > 0
    assert res.burn_multiple > 0
    assert res.rule_of_40_pct == pytest.approx((0.48 + 0.08) * 100.0, abs=0.01)


def test_dcf_pv_identity_and_sensitivity_monotonicity() -> None:
    res = compute_dcf_valuation(DCFInputs())
    assert len(res.schedule) == 5
    assert abs(sum(r.pv_ufcf for r in res.schedule) - res.sum_pv_ufcf) < 1.0
    assert abs(res.sum_pv_ufcf + res.pv_terminal_value_gordon - res.enterprise_value_gordon) < 1.0
    assert res.equity_value_gordon == pytest.approx(
        res.enterprise_value_gordon + 1_450_000.0 - 350_000.0, abs=1.0
    )

    # Higher WACC -> strictly lower Enterprise Value (same g)
    col_mid = 2
    evs_by_wacc = [row[col_mid] for row in res.sensitivity_ev_grid]
    assert all(evs_by_wacc[i] > evs_by_wacc[i + 1] for i in range(len(evs_by_wacc) - 1))

    # Higher terminal growth -> strictly higher Enterprise Value (same WACC)
    row_mid = res.sensitivity_ev_grid[2]
    assert all(row_mid[j] < row_mid[j + 1] for j in range(len(row_mid) - 1))


def test_dcf_rejects_invalid_wacc_vs_growth() -> None:
    with pytest.raises(ValueError):
        compute_dcf_valuation(DCFInputs(wacc=0.03, terminal_growth=0.04))
