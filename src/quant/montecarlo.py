"""Monte Carlo Treasury & Drawdown Stress Tester.

Supports:
1. 2-State Markov Regime-Switching Geometric Brownian Motion (Calm vs. Stress volatility).
2. Stationary / Block Empirical Bootstrap over portfolio return history.
3. Trade-Order Shuffle & Skip-Fill Perturbation (synthesizing goldea's montecarlo.py stress gate).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

KILL_DRAWDOWN_THRESHOLD = 0.20  # From goldea validation/montecarlo.py
PASS_DD_95_LIMIT = 0.25


@dataclass(frozen=True)
class RegimeParams:
    """Annualized drift/volatility and Markov transition probabilities."""

    mu_calm_ann: float = 0.14
    sigma_calm_ann: float = 0.10
    mu_stress_ann: float = -0.06
    sigma_stress_ann: float = 0.28
    p_stay_calm: float = 0.96
    p_stay_stress: float = 0.88


@dataclass(frozen=True)
class MonteCarloResult:
    """Summary risk & fan-chart statistics across simulated treasury paths."""

    mode: str
    n_sims: int
    horizon_days: int
    initial_capital: float
    ruin_threshold: float
    terminal_p5: float
    terminal_p25: float
    terminal_p50: float
    terminal_p75: float
    terminal_p95: float
    var_95_loss: float
    cvar_95_loss: float
    dd_p50: float
    dd_p95: float
    dd_p99: float
    p_hit_kill_20pct: float
    p_ruin: float
    passes_dd95_gate: bool
    fan_days: list[int]
    fan_p5: list[float]
    fan_p25: list[float]
    fan_p50: list[float]
    fan_p75: list[float]
    fan_p95: list[float]
    sample_paths: list[list[float]]


def _summarize_paths(
    equity_paths: np.ndarray,
    mode: str,
    initial_capital: float,
    ruin_fraction: float,
    sample_count: int = 24,
) -> MonteCarloResult:
    n_sims, n_cols = equity_paths.shape
    horizon = n_cols - 1
    ruin_level = initial_capital * ruin_fraction

    peaks = np.maximum.accumulate(equity_paths, axis=1)
    drawdowns = np.where(peaks > 0, (peaks - equity_paths) / peaks, 1.0)
    max_dd = drawdowns.max(axis=1)

    terminal = equity_paths[:, -1]
    losses = initial_capital - terminal
    var_95 = float(np.quantile(losses, 0.95))
    tail_losses = losses[losses >= var_95 - 1e-12]
    cvar_95 = float(tail_losses.mean()) if tail_losses.size > 0 else var_95

    dd_p95 = float(np.percentile(max_dd, 95))
    step = max(1, horizon // 36)
    idx = list(range(0, horizon + 1, step))
    if idx[-1] != horizon:
        idx.append(horizon)

    fan_slice = equity_paths[:, idx]
    return MonteCarloResult(
        mode=mode,
        n_sims=n_sims,
        horizon_days=horizon,
        initial_capital=round(initial_capital, 2),
        ruin_threshold=round(ruin_level, 2),
        terminal_p5=round(float(np.percentile(terminal, 5)), 2),
        terminal_p25=round(float(np.percentile(terminal, 25)), 2),
        terminal_p50=round(float(np.percentile(terminal, 50)), 2),
        terminal_p75=round(float(np.percentile(terminal, 75)), 2),
        terminal_p95=round(float(np.percentile(terminal, 95)), 2),
        var_95_loss=round(max(0.0, var_95), 2),
        cvar_95_loss=round(max(0.0, cvar_95), 2),
        dd_p50=round(float(np.percentile(max_dd, 50)), 4),
        dd_p95=round(dd_p95, 4),
        dd_p99=round(float(np.percentile(max_dd, 99)), 4),
        p_hit_kill_20pct=round(float((max_dd >= KILL_DRAWDOWN_THRESHOLD).mean()), 4),
        p_ruin=round(float((equity_paths.min(axis=1) <= ruin_level).mean()), 4),
        passes_dd95_gate=bool(dd_p95 < PASS_DD_95_LIMIT),
        fan_days=idx,
        fan_p5=[round(float(x), 2) for x in np.percentile(fan_slice, 5, axis=0)],
        fan_p25=[round(float(x), 2) for x in np.percentile(fan_slice, 25, axis=0)],
        fan_p50=[round(float(x), 2) for x in np.percentile(fan_slice, 50, axis=0)],
        fan_p75=[round(float(x), 2) for x in np.percentile(fan_slice, 75, axis=0)],
        fan_p95=[round(float(x), 2) for x in np.percentile(fan_slice, 95, axis=0)],
        sample_paths=[
            [round(float(v), 2) for v in equity_paths[i, idx]]
            for i in range(min(sample_count, n_sims))
        ],
    )


def simulate_regime_switching_gbm(
    *,
    initial_capital: float = 100_000.0,
    horizon_days: int = 252,
    n_sims: int = 4000,
    params: RegimeParams | None = None,
    ruin_fraction: float = 0.70,
    seed: int = 42,
) -> MonteCarloResult:
    """Simulate 2-state Markov Regime-Switching GBM paths for corporate/desk treasury."""
    if initial_capital <= 0 or horizon_days < 5 or n_sims < 50:
        raise ValueError("invalid simulation parameters")
    p = params or RegimeParams()
    rng = np.random.default_rng(seed)
    dt = 1.0 / 252.0

    # Stationary probability of starting in Stress regime
    p01 = 1.0 - p.p_stay_calm
    p10 = 1.0 - p.p_stay_stress
    pi_stress = p01 / max(1e-9, p01 + p10)

    regimes = np.zeros((n_sims, horizon_days), dtype=np.int8)
    regimes[:, 0] = (rng.random(n_sims) < pi_stress).astype(np.int8)
    u = rng.random((n_sims, horizon_days))
    for t in range(1, horizon_days):
        prev = regimes[:, t - 1]
        stay_prob = np.where(prev == 0, p.p_stay_calm, p.p_stay_stress)
        regimes[:, t] = np.where(u[:, t] < stay_prob, prev, 1 - prev)

    mu = np.where(regimes == 0, p.mu_calm_ann, p.mu_stress_ann)
    sigma = np.where(regimes == 0, p.sigma_calm_ann, p.sigma_stress_ann)
    z = rng.standard_normal((n_sims, horizon_days))
    log_rets = (mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * z

    equity = np.empty((n_sims, horizon_days + 1), dtype=float)
    equity[:, 0] = initial_capital
    equity[:, 1:] = initial_capital * np.exp(np.cumsum(log_rets, axis=1))
    return _summarize_paths(equity, "regime_switching_gbm", initial_capital, ruin_fraction)


def simulate_block_bootstrap(
    portfolio_returns: np.ndarray,
    *,
    initial_capital: float = 100_000.0,
    horizon_days: int = 252,
    n_sims: int = 4000,
    block_size: int = 5,
    skip_prob: float = 0.0,
    ruin_fraction: float = 0.70,
    seed: int = 42,
) -> MonteCarloResult:
    """Empirical circular block bootstrap (optionally with skip-fill execution stress)."""
    r = np.asarray(portfolio_returns, dtype=float)
    if r.ndim != 1 or r.size < 10:
        raise ValueError("portfolio_returns must be 1D with at least 10 observations")
    if block_size < 1:
        raise ValueError("block_size must be >= 1")

    rng = np.random.default_rng(seed)
    t_len = r.size
    n_blocks = int(np.ceil(horizon_days / block_size))
    starts = rng.integers(0, t_len, size=(n_sims, n_blocks))
    offsets = np.arange(block_size)
    indices = (starts[:, :, None] + offsets[None, None, :]) % t_len
    sampled = r[indices].reshape(n_sims, n_blocks * block_size)[:, :horizon_days]

    if skip_prob > 0.0:
        keep_mask = rng.random(sampled.shape) >= skip_prob
        sampled = np.where(keep_mask, sampled, 0.0)

    equity = np.empty((n_sims, horizon_days + 1), dtype=float)
    equity[:, 0] = initial_capital
    equity[:, 1:] = initial_capital * np.cumprod(1.0 + np.clip(sampled, -0.99, None), axis=1)
    mode = "bootstrap_skip_stress" if skip_prob > 0 else "empirical_block_bootstrap"
    return _summarize_paths(equity, mode, initial_capital, ruin_fraction)
