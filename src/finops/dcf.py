"""5-Year Unlevered DCF Valuation Engine with WACC x Terminal Growth Sensitivity Heatmap."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class DCFInputs:
    """Financial projection & capital structure inputs for 5-year DCF."""

    base_revenue_usd: float = 4_200_000.0
    revenue_growth_rates: tuple[float, float, float, float, float] = (0.38, 0.32, 0.26, 0.21, 0.17)
    ebit_margins: tuple[float, float, float, float, float] = (0.06, 0.11, 0.16, 0.20, 0.23)
    tax_rate: float = 0.23
    da_pct_revenue: float = 0.035
    capex_pct_revenue: float = 0.045
    nwc_pct_delta_rev: float = 0.04
    wacc: float = 0.115
    terminal_growth: float = 0.03
    exit_ebitda_multiple: float = 14.0
    cash_usd: float = 1_450_000.0
    debt_usd: float = 350_000.0
    diluted_shares: float = 1_000_000.0


@dataclass(frozen=True)
class DCFYearRow:
    """Single projection year in the 5-year unlevered cash flow schedule."""

    year: int
    revenue: float
    ebit: float
    nopat: float
    da: float
    capex: float
    delta_nwc: float
    ufcf: float
    discount_factor: float
    pv_ufcf: float


@dataclass(frozen=True)
class DCFResult:
    """Complete 5-year DCF output + WACC x Terminal Growth sensitivity grid."""

    schedule: list[DCFYearRow]
    sum_pv_ufcf: float
    terminal_value_gordon: float
    pv_terminal_value_gordon: float
    enterprise_value_gordon: float
    equity_value_gordon: float
    implied_share_price_gordon: float
    tv_share_of_ev_pct: float
    enterprise_value_exit_multiple: float
    wacc_axis: list[float]
    tg_axis: list[float]
    sensitivity_ev_grid: list[list[float]]  # rows = WACC, cols = terminal growth

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _evaluate_dcf_ev(
    ufcfs: list[float],
    wacc: float,
    terminal_growth: float,
) -> tuple[float, float, float]:
    """Return (sum_pv_ufcf, pv_terminal_value, enterprise_value) for given WACC and g."""
    if wacc <= terminal_growth + 1e-6:
        raise ValueError("WACC must strictly exceed terminal_growth")
    sum_pv = 0.0
    for idx, cf in enumerate(ufcfs, start=1):
        sum_pv += cf / ((1.0 + wacc) ** idx)
    tv = ufcfs[-1] * (1.0 + terminal_growth) / (wacc - terminal_growth)
    pv_tv = tv / ((1.0 + wacc) ** len(ufcfs))
    return sum_pv, pv_tv, sum_pv + pv_tv


def compute_dcf_valuation(inputs: DCFInputs | None = None) -> DCFResult:
    """Run 5-year unlevered DCF valuation and compute WACC x g sensitivity matrix."""
    p = inputs or DCFInputs()
    if p.wacc <= p.terminal_growth + 1e-4:
        raise ValueError("WACC must strictly exceed terminal_growth")
    if p.diluted_shares <= 0:
        raise ValueError("diluted_shares must be positive")

    schedule: list[DCFYearRow] = []
    ufcfs: list[float] = []
    prev_rev = p.base_revenue_usd

    for yr_idx in range(5):
        rev = prev_rev * (1.0 + p.revenue_growth_rates[yr_idx])
        ebit = rev * p.ebit_margins[yr_idx]
        nopat = ebit * (1.0 - p.tax_rate) if ebit > 0 else ebit
        da = rev * p.da_pct_revenue
        capex = rev * p.capex_pct_revenue
        delta_nwc = (rev - prev_rev) * p.nwc_pct_delta_rev
        ufcf = nopat + da - capex - delta_nwc
        df = 1.0 / ((1.0 + p.wacc) ** (yr_idx + 1))
        pv_ufcf = ufcf * df
        ufcfs.append(ufcf)
        schedule.append(
            DCFYearRow(
                year=yr_idx + 1,
                revenue=round(rev, 2),
                ebit=round(ebit, 2),
                nopat=round(nopat, 2),
                da=round(da, 2),
                capex=round(capex, 2),
                delta_nwc=round(delta_nwc, 2),
                ufcf=round(ufcf, 2),
                discount_factor=round(df, 6),
                pv_ufcf=round(pv_ufcf, 2),
            )
        )
        prev_rev = rev

    sum_pv, pv_tv, ev_gordon = _evaluate_dcf_ev(ufcfs, p.wacc, p.terminal_growth)
    tv_gordon = pv_tv * ((1.0 + p.wacc) ** 5)
    eq_gordon = ev_gordon + p.cash_usd - p.debt_usd
    share_px = eq_gordon / p.diluted_shares

    yr5_ebitda = schedule[-1].ebit + schedule[-1].da
    tv_mult = yr5_ebitda * p.exit_ebitda_multiple
    ev_mult = sum_pv + tv_mult / ((1.0 + p.wacc) ** 5)

    wacc_axis = [round(p.wacc + d, 4) for d in (-0.02, -0.01, 0.0, 0.01, 0.02)]
    tg_axis = [round(p.terminal_growth + d, 4) for d in (-0.01, -0.005, 0.0, 0.005, 0.01)]
    grid: list[list[float]] = []
    for w in wacc_axis:
        row: list[float] = []
        for g in tg_axis:
            if w <= g + 0.005:
                row.append(0.0)
            else:
                _, _, ev_cell = _evaluate_dcf_ev(ufcfs, w, g)
                row.append(round(ev_cell, 2))
        grid.append(row)

    return DCFResult(
        schedule=schedule,
        sum_pv_ufcf=round(sum_pv, 2),
        terminal_value_gordon=round(tv_gordon, 2),
        pv_terminal_value_gordon=round(pv_tv, 2),
        enterprise_value_gordon=round(ev_gordon, 2),
        equity_value_gordon=round(eq_gordon, 2),
        implied_share_price_gordon=round(share_px, 2),
        tv_share_of_ev_pct=round((pv_tv / ev_gordon) * 100.0 if ev_gordon > 0 else 0.0, 2),
        enterprise_value_exit_multiple=round(ev_mult, 2),
        wacc_axis=wacc_axis,
        tg_axis=tg_axis,
        sensitivity_ev_grid=grid,
    )
