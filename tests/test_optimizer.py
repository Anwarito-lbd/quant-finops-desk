"""Mathematical invariant tests for Markowitz Mean-Variance & Rockafellar-Uryasev CVaR."""
from __future__ import annotations

import numpy as np
import pytest

from src.quant.optimizer import PortfolioOptimizer, portfolio_tail_risk


def _sample_returns(seed: int = 7, t_obs: int = 260, n_assets: int = 4) -> np.ndarray:
    rng = np.random.default_rng(seed)
    cov_factor = rng.normal(0.0, 0.004, size=(t_obs, 1))
    idio = rng.normal(0.0004, 0.009, size=(t_obs, n_assets))
    return cov_factor + idio


def test_min_variance_beats_equal_weight_variance() -> None:
    r = _sample_returns()
    names = ["A", "B", "C", "D"]
    opt = PortfolioOptimizer(r, names, min_weight=0.0, max_weight=0.8)
    mv = opt.solve_min_variance()
    eq = np.full(4, 0.25)
    eq_vol = float(np.sqrt(eq @ opt.cov_daily @ eq) * np.sqrt(252))
    assert mv.volatility_ann <= eq_vol + 1e-6
    assert abs(sum(mv.weights.values()) - 1.0) < 1e-5
    assert all(0.0 - 1e-6 <= w <= 0.8 + 1e-6 for w in mv.weights.values())


def test_cvar_lp_dominates_equal_weight_and_obeys_var_inequality() -> None:
    r = _sample_returns(seed=11)
    names = ["A", "B", "C", "D"]
    opt = PortfolioOptimizer(r, names, alpha=0.95, min_weight=0.0, max_weight=0.75)
    mc = opt.solve_min_cvar()
    eq = np.full(4, 0.25)
    eq_var, eq_cvar = portfolio_tail_risk(eq, r, alpha=0.95)
    assert mc.cvar_daily <= eq_cvar + 1e-6
    assert mc.cvar_daily >= mc.var_daily - 1e-9
    assert eq_cvar >= eq_var - 1e-9


def test_cvar_convexity_subadditivity() -> None:
    r = _sample_returns(seed=19)
    w1 = np.array([0.7, 0.2, 0.1, 0.0])
    w2 = np.array([0.0, 0.1, 0.3, 0.6])
    lam = 0.4
    w_mix = lam * w1 + (1.0 - lam) * w2
    _, c1 = portfolio_tail_risk(w1, r, alpha=0.95)
    _, c2 = portfolio_tail_risk(w2, r, alpha=0.95)
    _, c_mix = portfolio_tail_risk(w_mix, r, alpha=0.95)
    assert c_mix <= lam * c1 + (1.0 - lam) * c2 + 1e-9


def test_frontiers_and_validation_errors() -> None:
    r = _sample_returns()
    names = ["A", "B", "C", "D"]
    opt = PortfolioOptimizer(r, names)
    res = opt.build_frontiers(n_points=10)
    assert len(res.mv_frontier) == 10
    assert len(res.cvar_frontier) == 10
    assert res.max_sharpe.sharpe_ratio >= res.min_variance.sharpe_ratio - 1e-4

    with pytest.raises(ValueError):
        PortfolioOptimizer(r, ["only_one"])
    with pytest.raises(ValueError):
        PortfolioOptimizer(r, names, min_weight=0.4, max_weight=0.5)
