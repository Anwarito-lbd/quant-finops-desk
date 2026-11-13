"""Statistical Overfitting Guards (synthesized from goldea/validation/overfit.py).

Implements:
1. Deflated Sharpe Ratio (Bailey & Lopez de Prado, 2014).
2. Probability of Backtest Overfitting via CSCV (Bailey, Borwein, Lopez de Prado & Zhu, 2017).
"""
from __future__ import annotations

import itertools
import math
from dataclasses import dataclass

import numpy as np
from scipy import stats

EULER_GAMMA = 0.5772156649015329


@dataclass(frozen=True)
class OverfitReport:
    """Overfitting diagnostics for a strategy or multi-trial sweep."""

    non_annualized_sr: float
    annualized_sr: float
    sr_benchmark_expected_max: float
    deflated_sharpe_ratio: float
    dsr_significant: bool
    pbo: float | None
    pbo_verdict: str


def non_annualized_sr(returns: np.ndarray) -> float:
    r = np.asarray(returns, dtype=float)
    r = r[np.isfinite(r)]
    if r.size < 2:
        return 0.0
    sd = float(r.std(ddof=1))
    return float(r.mean() / sd) if sd > 1e-12 else 0.0


def expected_max_sr(n_trials: int, sr_variance: float) -> float:
    """Expected maximum non-annualized Sharpe among N independent unskilled trials."""
    if n_trials <= 1 or sr_variance <= 0:
        return 0.0
    z = stats.norm.ppf
    return float(
        math.sqrt(sr_variance)
        * (
            (1.0 - EULER_GAMMA) * z(1.0 - 1.0 / n_trials)
            + EULER_GAMMA * z(1.0 - 1.0 / (n_trials * math.e))
        )
    )


def deflated_sharpe_ratio(
    returns: np.ndarray,
    *,
    n_trials: int = 10,
    sr_variance: float | None = None,
    periods_per_year: int = 252,
) -> tuple[float, float, float, float]:
    """Return (dsr, sr_hat, sr_ann, sr0) correcting for non-normality and trial selection."""
    r = np.asarray(returns, dtype=float)
    r = r[np.isfinite(r)]
    t_obs = r.size
    if t_obs < 10:
        return 0.0, 0.0, 0.0, 0.0
    sr_hat = non_annualized_sr(r)
    sr_ann = sr_hat * math.sqrt(periods_per_year)
    skew = float(stats.skew(r, bias=False))
    kurt = float(stats.kurtosis(r, fisher=False, bias=False))  # non-excess (normal = 3)
    var_sr = sr_variance if sr_variance is not None else (1.0 / max(1, t_obs - 1))
    sr0 = expected_max_sr(n_trials, var_sr)
    denom = 1.0 - skew * sr_hat + ((kurt - 1.0) / 4.0) * (sr_hat**2)
    if denom <= 1e-12:
        return 0.0, sr_hat, sr_ann, sr0
    z_score = (sr_hat - sr0) * math.sqrt(t_obs - 1) / math.sqrt(denom)
    return float(stats.norm.cdf(z_score)), sr_hat, sr_ann, sr0


def probability_of_backtest_overfitting(trial_matrix: np.ndarray, n_blocks: int = 8) -> float:
    """CSCV PBO over a (T x N) matrix of trial return series."""
    m = np.asarray(trial_matrix, dtype=float)
    if m.ndim != 2 or m.shape[1] < 2:
        raise ValueError("trial_matrix must be (T x N) with N >= 2")
    if n_blocks % 2 != 0 or n_blocks < 4:
        raise ValueError("n_blocks must be an even integer >= 4")
    usable = (m.shape[0] // n_blocks) * n_blocks
    if usable < n_blocks:
        raise ValueError("insufficient observations for CSCV blocks")
    blocks = np.array_split(m[:usable], n_blocks, axis=0)
    half = n_blocks // 2
    n_trials = m.shape[1]
    overfit_count = 0
    total = 0

    for train_idx in itertools.combinations(range(n_blocks), half):
        test_idx = [i for i in range(n_blocks) if i not in train_idx]
        is_mat = np.vstack([blocks[i] for i in train_idx])
        oos_mat = np.vstack([blocks[i] for i in test_idx])

        is_sd = is_mat.std(axis=0, ddof=1)
        is_sr = np.where(is_sd > 1e-12, is_mat.mean(axis=0) / is_sd, -1e9)
        best_col = int(np.argmax(is_sr))

        oos_sd = oos_mat.std(axis=0, ddof=1)
        oos_sr = np.where(oos_sd > 1e-12, oos_mat.mean(axis=0) / oos_sd, -1e9)
        # Relative OOS rank in (0, 1)
        rank = float(np.sum(oos_sr <= oos_sr[best_col])) / (n_trials + 1.0)
        logit = math.log(max(1e-6, rank) / max(1e-6, 1.0 - rank))
        if logit <= 0.0:
            overfit_count += 1
        total += 1
    return float(overfit_count / max(1, total))


def build_overfit_report(
    returns: np.ndarray,
    *,
    n_trials: int = 12,
    trial_matrix: np.ndarray | None = None,
    periods_per_year: int = 252,
) -> OverfitReport:
    dsr, sr_hat, sr_ann, sr0 = deflated_sharpe_ratio(
        returns, n_trials=n_trials, periods_per_year=periods_per_year
    )
    pbo_val: float | None = None
    verdict = "dsr_only"
    if trial_matrix is not None and trial_matrix.shape[1] >= 2:
        pbo_val = round(probability_of_backtest_overfitting(trial_matrix), 4)
        verdict = "robust" if pbo_val < 0.20 else ("caution" if pbo_val < 0.50 else "overfit_risk")
    return OverfitReport(
        non_annualized_sr=round(sr_hat, 4),
        annualized_sr=round(sr_ann, 4),
        sr_benchmark_expected_max=round(sr0, 4),
        deflated_sharpe_ratio=round(dsr, 4),
        dsr_significant=bool(dsr >= 0.95),
        pbo=pbo_val,
        pbo_verdict=verdict,
    )
