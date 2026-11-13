"""Generate publication-grade matplotlib proof charts from real engine runs."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.finops.cohorts import CohortInputs, compute_cohort_analysis  # noqa: E402
from src.finops.dcf import DCFInputs, compute_dcf_valuation  # noqa: E402
from src.quant.adapters import run_unified_desk_pipeline  # noqa: E402
from src.quant.montecarlo import (  # noqa: E402
    RegimeParams,
    simulate_block_bootstrap,
    simulate_regime_switching_gbm,
)

PROOF_DIR = ROOT / "docs" / "proof"
PROOF_DIR.mkdir(parents=True, exist_ok=True)

plt.rcParams.update(
    {
        "figure.facecolor": "#0B0F17",
        "axes.facecolor": "#111827",
        "axes.edgecolor": "#263248",
        "axes.labelcolor": "#E2E8F0",
        "text.color": "#E2E8F0",
        "xtick.color": "#94A3B8",
        "ytick.color": "#94A3B8",
        "grid.color": "#1F2937",
        "grid.linestyle": "--",
        "grid.alpha": 0.65,
        "font.size": 10,
    }
)


def plot_efficient_frontier(report: object) -> None:
    from src.quant.adapters import UnifiedDeskReport

    assert isinstance(report, UnifiedDeskReport)
    f = report.frontier
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.5, 5.6), dpi=160)

    # Panel 1: Mean-Variance Frontier
    mv_x = [p.volatility_ann * 100 for p in f.mv_frontier]
    mv_y = [p.expected_return_ann * 100 for p in f.mv_frontier]
    ax1.plot(mv_x, mv_y, color="#38BDF8", lw=2.4, label="Markowitz Mean-Variance Frontier")

    for s in report.streams:
        ax1.scatter(s.annualized_vol * 100, s.annualized_return * 100, s=68, zorder=5, color="#94A3B8")
        ax1.annotate(
            s.source_repo,
            (s.annualized_vol * 100, s.annualized_return * 100),
            textcoords="offset points",
            xytext=(6, 4),
            fontsize=8.5,
            color="#CBD5E1",
        )

    ax1.scatter(
        f.min_variance.volatility_ann * 100,
        f.min_variance.expected_return_ann * 100,
        s=140,
        marker="D",
        color="#22C55E",
        zorder=6,
        label=f"Min-Variance (Sharpe {f.min_variance.sharpe_ratio:.2f})",
    )
    ax1.scatter(
        f.max_sharpe.volatility_ann * 100,
        f.max_sharpe.expected_return_ann * 100,
        s=180,
        marker="*",
        color="#FACC15",
        zorder=7,
        label=f"Max-Sharpe Tangency (Sharpe {f.max_sharpe.sharpe_ratio:.2f})",
    )
    ax1.set_title("Markowitz Mean-Variance Efficient Frontier", fontweight="bold", pad=10)
    ax1.set_xlabel("Annualized Volatility (%)")
    ax1.set_ylabel("Annualized Expected Return (%)")
    ax1.grid(True)
    ax1.legend(loc="upper left", frameon=True, facecolor="#0F172A", edgecolor="#334155", fontsize=8.5)

    # Panel 2: Rockafellar-Uryasev Mean-CVaR Frontier
    cv_x = [p.cvar_daily * 100 for p in f.cvar_frontier]
    cv_y = [p.expected_return_ann * 100 for p in f.cvar_frontier]
    ax2.plot(cv_x, cv_y, color="#A855F7", lw=2.4, label="Rockafellar-Uryasev CVaR95 Frontier")
    ax2.scatter(
        f.min_cvar.cvar_daily * 100,
        f.min_cvar.expected_return_ann * 100,
        s=140,
        marker="s",
        color="#34D399",
        zorder=6,
        label=f"Min-CVaR95 (Daily CVaR {f.min_cvar.cvar_daily * 100:.2f}%)",
    )
    ax2.scatter(
        f.max_sharpe.cvar_daily * 100,
        f.max_sharpe.expected_return_ann * 100,
        s=180,
        marker="*",
        color="#FACC15",
        zorder=7,
        label=f"Max-Sharpe (Daily CVaR {f.max_sharpe.cvar_daily * 100:.2f}%)",
    )
    ax2.set_title("Mean-CVaR (95% Expected Shortfall) Frontier", fontweight="bold", pad=10)
    ax2.set_xlabel("Daily 95% CVaR Loss (%)")
    ax2.set_ylabel("Annualized Expected Return (%)")
    ax2.grid(True)
    ax2.legend(loc="lower right", frameon=True, facecolor="#0F172A", edgecolor="#334155", fontsize=8.5)

    fig.suptitle(
        "Cross-Repo Multi-Strategy Portfolio Optimization (Paper / Analytical)",
        fontsize=12.5,
        fontweight="bold",
        y=1.01,
    )
    fig.tight_layout()
    fig.savefig(PROOF_DIR / "efficient_frontier_cvar.png", bbox_inches="tight")
    plt.close(fig)


def plot_monte_carlo(mc_regime: object, mc_boot: object) -> None:
    from src.quant.montecarlo import MonteCarloResult

    assert isinstance(mc_regime, MonteCarloResult) and isinstance(mc_boot, MonteCarloResult)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.5, 5.5), dpi=160)

    days = mc_regime.fan_days
    for path in mc_regime.sample_paths[:15]:
        ax1.plot(days, [v / 1000 for v in path], color="#38BDF8", alpha=0.14, lw=1.0)
    ax1.fill_between(
        days,
        [v / 1000 for v in mc_regime.fan_p5],
        [v / 1000 for v in mc_regime.fan_p95],
        color="#38BDF8",
        alpha=0.15,
        label="5th–95th Percentile Band",
    )
    ax1.fill_between(
        days,
        [v / 1000 for v in mc_regime.fan_p25],
        [v / 1000 for v in mc_regime.fan_p75],
        color="#0EA5E9",
        alpha=0.28,
        label="25th–75th Interquartile Band",
    )
    ax1.plot(days, [v / 1000 for v in mc_regime.fan_p50], color="#FACC15", lw=2.4, label="Median Trajectory (P50)")
    ax1.axhline(
        mc_regime.ruin_threshold / 1000,
        color="#EF4444",
        ls="--",
        lw=1.5,
        label=f"Ruin Floor (${mc_regime.ruin_threshold / 1000:.0f}k)",
    )
    ax1.set_title("Regime-Switching GBM Treasury Fan Chart (3,000 Paths)", fontweight="bold", pad=10)
    ax1.set_xlabel("Trading Days")
    ax1.set_ylabel("Treasury Equity ($k)")
    ax1.grid(True)
    ax1.legend(loc="upper left", frameon=True, facecolor="#0F172A", edgecolor="#334155", fontsize=8.5)

    labels = ["P5 Terminal", "P50 Terminal", "P95 Terminal"]
    reg_vals = [mc_regime.terminal_p5 / 1000, mc_regime.terminal_p50 / 1000, mc_regime.terminal_p95 / 1000]
    boot_vals = [mc_boot.terminal_p5 / 1000, mc_boot.terminal_p50 / 1000, mc_boot.terminal_p95 / 1000]
    x = np.arange(len(labels))
    w = 0.35
    b1 = ax2.bar(x - w / 2, reg_vals, width=w, color="#38BDF8", label="Regime-Switching GBM")
    b2 = ax2.bar(x + w / 2, boot_vals, width=w, color="#A855F7", label="Block Bootstrap (10% Skip Stress)")
    for bars in (b1, b2):
        for bar in bars:
            h = bar.get_height()
            ax2.text(bar.get_x() + bar.get_width() / 2, h + 3, f"${h:.0f}k", ha="center", va="bottom", fontsize=8.5)

    ax2.set_xticks(x)
    ax2.set_xticklabels(labels)
    ax2.set_ylabel("Terminal Equity ($k)")
    ax2.set_title(
        f"Terminal Wealth & Tail Stress (Regime DD95={mc_regime.dd_p95:.1%}, Boot DD95={mc_boot.dd_p95:.1%})",
        fontweight="bold",
        pad=10,
    )
    ax2.grid(True, axis="y")
    ax2.legend(loc="upper left", frameon=True, facecolor="#0F172A", edgecolor="#334155", fontsize=8.5)

    fig.tight_layout()
    fig.savefig(PROOF_DIR / "monte_carlo_treasury.png", bbox_inches="tight")
    plt.close(fig)


def plot_dcf_and_cohorts(cohorts: object, dcf: object) -> None:
    from src.finops.cohorts import CohortAnalysisResult
    from src.finops.dcf import DCFResult

    assert isinstance(cohorts, CohortAnalysisResult) and isinstance(dcf, DCFResult)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.8, 5.8), dpi=160)

    # Panel 1: Cohort Retention Matrix Heatmap
    mat = np.full((len(cohorts.cohort_labels), len(cohorts.month_offsets)), np.nan)
    for i, row in enumerate(cohorts.logo_retention_matrix):
        for j, val in enumerate(row):
            if val is not None:
                mat[i, j] = val * 100.0

    im1 = ax1.imshow(mat, cmap="YlGnBu", aspect="auto", vmin=55, vmax=100)
    ax1.set_xticks(range(len(cohorts.month_offsets)))
    ax1.set_xticklabels([f"M{m}" for m in cohorts.month_offsets], fontsize=8)
    ax1.set_yticks(range(len(cohorts.cohort_labels)))
    ax1.set_yticklabels(cohorts.cohort_labels, fontsize=8)
    for i in range(mat.shape[0]):
        for j in range(mat.shape[1]):
            if not np.isnan(mat[i, j]):
                color = "#0B0F17" if mat[i, j] > 82 else "#F8FAFC"
                ax1.text(j, i, f"{mat[i, j]:.0f}", ha="center", va="center", color=color, fontsize=7.5)
    ax1.set_title(
        f"SaaS Cohort Retention (%) | LTV/CAC={cohorts.ltv_to_cac:.1f}x, Payback={cohorts.cac_payback_months:.1f}m",
        fontweight="bold",
        pad=10,
    )
    ax1.set_xlabel("Cohort Tenure (Months)")
    ax1.set_ylabel("Acquisition Cohort")
    fig.colorbar(im1, ax=ax1, fraction=0.046, pad=0.04)

    # Panel 2: DCF WACC x Terminal Growth Sensitivity Heatmap
    ev_mat = np.array(dcf.sensitivity_ev_grid, dtype=float) / 1e6
    im2 = ax2.imshow(ev_mat, cmap="viridis", aspect="auto")
    ax2.set_xticks(range(len(dcf.tg_axis)))
    ax2.set_xticklabels([f"{g * 100:.1f}%" for g in dcf.tg_axis], fontsize=9)
    ax2.set_yticks(range(len(dcf.wacc_axis)))
    ax2.set_yticklabels([f"{w * 100:.1f}%" for w in dcf.wacc_axis], fontsize=9)
    for i in range(ev_mat.shape[0]):
        for j in range(ev_mat.shape[1]):
            color = "#0B0F17" if ev_mat[i, j] > np.median(ev_mat) else "#F8FAFC"
            ax2.text(j, i, f"${ev_mat[i, j]:.2f}M", ha="center", va="center", color=color, fontsize=8.5)
    ax2.set_title(
        f"5-Year DCF Enterprise Value (USD M) | Base EV = USD {dcf.enterprise_value_gordon / 1e6:.2f}M",
        fontweight="bold",
        pad=10,
    )
    ax2.set_xlabel("Terminal Growth Rate (g)")
    ax2.set_ylabel("Discount Rate (WACC)")
    fig.colorbar(im2, ax=ax2, fraction=0.046, pad=0.04)

    fig.tight_layout()
    fig.savefig(PROOF_DIR / "dcf_cohort_heatmap.png", bbox_inches="tight")
    plt.close(fig)


def plot_multi_desk_attribution(report: object, ret_matrix: np.ndarray) -> None:
    from src.quant.adapters import UnifiedDeskReport

    assert isinstance(report, UnifiedDeskReport)
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.8, 5.6), dpi=160)

    colors = ["#38BDF8", "#A855F7", "#F59E0B", "#10B981", "#F43F5E"]
    for idx, s in enumerate(report.streams):
        eq = np.cumprod(1.0 + np.asarray(s.daily_returns)) * 100.0
        ax1.plot(eq, lw=1.7, color=colors[idx], alpha=0.85, label=f"{s.source_repo} (SR {s.sharpe_ratio:.2f})")

    w_sharpe = np.array([report.frontier.max_sharpe.weights[a] for a in report.frontier.assets])
    blend_eq = np.cumprod(1.0 + (ret_matrix @ w_sharpe)) * 100.0
    ax1.plot(blend_eq, lw=2.8, color="#FACC15", label=f"Max-Sharpe Blend (SR {report.frontier.max_sharpe.sharpe_ratio:.2f})")
    ax1.set_title("Normalized Equity Curves Across 5 Trading Desks (Base = 100)", fontweight="bold", pad=10)
    ax1.set_xlabel("Trading Days")
    ax1.set_ylabel("Indexed Equity (Base 100)")
    ax1.grid(True)
    ax1.legend(loc="upper left", frameon=True, facecolor="#0F172A", edgecolor="#334155", fontsize=8)

    repos = [s.source_repo for s in report.streams]
    w_mv = [report.frontier.min_variance.weights[s.desk_id] * 100 for s in report.streams]
    w_ms = [report.frontier.max_sharpe.weights[s.desk_id] * 100 for s in report.streams]
    w_cv = [report.frontier.min_cvar.weights[s.desk_id] * 100 for s in report.streams]

    y = np.arange(len(repos))
    h = 0.26
    ax2.barh(y - h, w_mv, height=h, color="#22C55E", label="Min-Variance")
    ax2.barh(y, w_ms, height=h, color="#FACC15", label="Max-Sharpe")
    ax2.barh(y + h, w_cv, height=h, color="#A855F7", label="Min-CVaR95")
    ax2.set_yticks(y)
    ax2.set_yticklabels(repos, fontsize=9)
    ax2.set_xlabel("Optimal Allocation Weight (%)")
    ax2.set_title("Cross-Repo Capital Allocation by Optimizer Regime", fontweight="bold", pad=10)
    ax2.grid(True, axis="x")
    ax2.legend(loc="upper right", frameon=True, facecolor="#0F172A", edgecolor="#334155", fontsize=8.5)

    fig.tight_layout()
    fig.savefig(PROOF_DIR / "multi_desk_attribution.png", bbox_inches="tight")
    plt.close(fig)


def main() -> None:
    report, ret_matrix = run_unified_desk_pipeline()
    max_sharpe_w = np.array([report.frontier.max_sharpe.weights[a] for a in report.frontier.assets])
    port_rets = ret_matrix @ max_sharpe_w

    mc_regime = simulate_regime_switching_gbm(
        initial_capital=250_000.0,
        horizon_days=252,
        n_sims=3000,
        params=RegimeParams(
            mu_calm_ann=max(0.08, report.frontier.max_sharpe.expected_return_ann),
            sigma_calm_ann=max(0.06, report.frontier.max_sharpe.volatility_ann),
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
    cohorts = compute_cohort_analysis(CohortInputs())
    dcf = compute_dcf_valuation(DCFInputs())

    plot_efficient_frontier(report)
    plot_monte_carlo(mc_regime, mc_boot)
    plot_dcf_and_cohorts(cohorts, dcf)
    plot_multi_desk_attribution(report, ret_matrix)

    summary = {
        "streams": [
            {
                "desk_id": s.desk_id,
                "source_repo": s.source_repo,
                "accepted": s.n_signals_accepted,
                "rejected": s.n_signals_rejected,
                "ann_ret_pct": round(s.annualized_return * 100, 2),
                "ann_vol_pct": round(s.annualized_vol * 100, 2),
                "sharpe": s.sharpe_ratio,
                "max_dd_pct": round(s.max_drawdown * 100, 2),
                "gate_passed": s.gate_passed,
            }
            for s in report.streams
        ],
        "frontier": {
            "min_variance": report.frontier.min_variance,
            "max_sharpe": report.frontier.max_sharpe,
            "min_cvar": report.frontier.min_cvar,
        },
        "audit": {
            "valid": report.audit_chain_valid,
            "events": report.audit_event_count,
        },
        "mc_regime": {
            "p5": mc_regime.terminal_p5,
            "p50": mc_regime.terminal_p50,
            "p95": mc_regime.terminal_p95,
            "var_95": mc_regime.var_95_loss,
            "cvar_95": mc_regime.cvar_95_loss,
            "dd_p95": mc_regime.dd_p95,
            "p_ruin": mc_regime.p_ruin,
        },
        "mc_boot": {
            "p5": mc_boot.terminal_p5,
            "p50": mc_boot.terminal_p50,
            "p95": mc_boot.terminal_p95,
            "dd_p95": mc_boot.dd_p95,
            "p_ruin": mc_boot.p_ruin,
        },
        "cohorts": {
            "ltv_usd": cohorts.ltv_usd,
            "cac_usd": cohorts.cac_usd,
            "ltv_to_cac": cohorts.ltv_to_cac,
            "payback_months": cohorts.cac_payback_months,
            "ndr_12m": cohorts.ndr_12m,
            "burn_multiple": cohorts.burn_multiple,
            "rule_of_40_pct": cohorts.rule_of_40_pct,
        },
        "dcf": {
            "ev_gordon": dcf.enterprise_value_gordon,
            "equity_gordon": dcf.equity_value_gordon,
            "share_price": dcf.implied_share_price_gordon,
            "tv_share_pct": dcf.tv_share_of_ev_pct,
            "ev_exit_mult": dcf.enterprise_value_exit_multiple,
        },
    }
    print(json.dumps(summary, default=lambda o: o.__dict__, indent=2))


if __name__ == "__main__":
    main()
