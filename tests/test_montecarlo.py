"""Tests for Regime-Switching GBM and Block Bootstrap Monte Carlo Treasury Stress."""
from __future__ import annotations

import numpy as np

from src.quant.montecarlo import (
    RegimeParams,
    simulate_block_bootstrap,
    simulate_regime_switching_gbm,
)


def test_regime_switching_determinism_and_quantiles() -> None:
    r1 = simulate_regime_switching_gbm(initial_capital=100_000.0, n_sims=600, seed=99)
    r2 = simulate_regime_switching_gbm(initial_capital=100_000.0, n_sims=600, seed=99)
    assert r1.terminal_p50 == r2.terminal_p50
    assert r1.terminal_p5 <= r1.terminal_p25 <= r1.terminal_p50 <= r1.terminal_p75 <= r1.terminal_p95
    assert r1.cvar_95_loss >= r1.var_95_loss - 1e-6
    assert r1.dd_p50 <= r1.dd_p95 <= r1.dd_p99


def test_stress_regime_increases_drawdown_risk() -> None:
    calm = simulate_regime_switching_gbm(
        n_sims=800,
        params=RegimeParams(sigma_calm_ann=0.06, sigma_stress_ann=0.08, p_stay_calm=0.99),
        seed=42,
    )
    stressed = simulate_regime_switching_gbm(
        n_sims=800,
        params=RegimeParams(
            mu_calm_ann=0.04,
            sigma_calm_ann=0.14,
            mu_stress_ann=-0.22,
            sigma_stress_ann=0.42,
            p_stay_calm=0.80,
            p_stay_stress=0.95,
        ),
        seed=42,
    )
    assert stressed.dd_p95 > calm.dd_p95
    assert stressed.cvar_95_loss > calm.cvar_95_loss


def test_block_bootstrap_and_skip_stress() -> None:
    rng = np.random.default_rng(17)
    rets = rng.normal(0.0005, 0.007, size=252)
    res = simulate_block_bootstrap(rets, initial_capital=50_000.0, n_sims=500, block_size=5, skip_prob=0.15)
    assert res.mode == "bootstrap_skip_stress"
    assert len(res.fan_days) == len(res.fan_p50)
    assert res.fan_p5[0] == 50_000.0
