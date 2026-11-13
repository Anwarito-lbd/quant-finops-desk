"""Markowitz Mean-Variance & Rockafellar-Uryasev CVaR Portfolio Optimizers.

Mathematical formulations:
1. Markowitz Mean-Variance (with ridge/Ledoit-style shrinkage regularization):
   min_w  w^T Sigma w   s.t.   sum(w) = 1, w_min <= w_i <= w_max, mu^T w >= target_return
   and Tangency (Max-Sharpe):
   max_w  (mu^T w - r_f) / sqrt(w^T Sigma w)

2. Rockafellar-Uryasev (2000) Conditional Value-at-Risk (CVaR) LP:
   min_{w, zeta, u >= 0}  zeta + 1 / ((1 - alpha) * S) * sum_{s=1}^S u_s
   s.t.  u_s >= -r_s^T w - zeta,  sum(w) = 1,  w_min <= w_i <= w_max,  mu^T w >= target_return
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import linprog, minimize

TRADING_DAYS_PER_YEAR = 252


@dataclass(frozen=True)
class PortfolioPoint:
    """Evaluated risk-return coordinates and weights for one portfolio allocation."""

    weights: dict[str, float]
    expected_return_ann: float
    volatility_ann: float
    sharpe_ratio: float
    var_daily: float
    cvar_daily: float
    cvar_ann: float


@dataclass(frozen=True)
class FrontierResult:
    """Complete Mean-Variance & Mean-CVaR optimization outputs."""

    assets: list[str]
    min_variance: PortfolioPoint
    max_sharpe: PortfolioPoint
    min_cvar: PortfolioPoint
    mv_frontier: list[PortfolioPoint]
    cvar_frontier: list[PortfolioPoint]
    correlation_matrix: dict[str, dict[str, float]]


def _validate_inputs(
    returns: np.ndarray,
    asset_names: list[str],
    min_weight: float,
    max_weight: float,
) -> tuple[np.ndarray, int, int]:
    r = np.asarray(returns, dtype=float)
    if r.ndim != 2:
        raise ValueError("returns matrix must be 2-dimensional (T x N)")
    t_obs, n_assets = r.shape
    if n_assets < 2 or t_obs < 10:
        raise ValueError("require at least 2 assets and 10 observations")
    if len(asset_names) != n_assets:
        raise ValueError("asset_names length must match returns.shape[1]")
    if not np.all(np.isfinite(r)):
        raise ValueError("returns matrix contains NaN or Inf")
    if min_weight * n_assets > 1.0 + 1e-9 or max_weight * n_assets < 1.0 - 1e-9:
        raise ValueError("weight bounds are infeasible for sum(w) == 1")
    return r, t_obs, n_assets


def shrunk_covariance(returns: np.ndarray, shrinkage: float = 0.10) -> np.ndarray:
    """Compute sample covariance blended toward scaled identity to ensure PSD stability."""
    sample_cov = np.cov(returns, rowvar=False, ddof=1)
    n = sample_cov.shape[0]
    avg_var = float(np.trace(sample_cov)) / n
    target = avg_var * np.eye(n)
    cov = (1.0 - shrinkage) * sample_cov + shrinkage * target
    # Symmetrize against floating-point asymmetry
    return np.asarray(0.5 * (cov + cov.T), dtype=float)


def portfolio_tail_risk(
    weights: np.ndarray,
    returns: np.ndarray,
    alpha: float = 0.95,
) -> tuple[float, float]:
    """Compute empirical daily VaR_alpha and CVaR_alpha (positive loss convention)."""
    if not 0.5 < alpha < 1.0:
        raise ValueError("alpha must be in (0.5, 1.0)")
    losses = -(returns @ weights)
    var = float(np.quantile(losses, alpha))
    tail = losses[losses >= var - 1e-12]
    cvar = float(tail.mean()) if tail.size > 0 else var
    return max(0.0, var), max(0.0, cvar)


def evaluate_weights(
    weights: np.ndarray,
    asset_names: list[str],
    returns: np.ndarray,
    cov_daily: np.ndarray,
    risk_free_ann: float = 0.04,
    alpha: float = 0.95,
    periods_per_year: int = TRADING_DAYS_PER_YEAR,
) -> PortfolioPoint:
    """Evaluate annualized return, volatility, Sharpe, daily VaR, and daily/annualized CVaR."""
    w = np.asarray(weights, dtype=float)
    w = w / np.sum(w)
    mu_daily = returns.mean(axis=0)
    ret_ann = float(mu_daily @ w) * periods_per_year
    vol_daily = float(np.sqrt(max(1e-16, float(w @ cov_daily @ w))))
    vol_ann = vol_daily * np.sqrt(periods_per_year)
    sharpe = (ret_ann - risk_free_ann) / vol_ann if vol_ann > 1e-12 else 0.0
    var_d, cvar_d = portfolio_tail_risk(w, returns, alpha=alpha)
    cvar_ann = cvar_d * np.sqrt(periods_per_year)
    return PortfolioPoint(
        weights={name: round(float(val), 6) for name, val in zip(asset_names, w)},
        expected_return_ann=round(ret_ann, 6),
        volatility_ann=round(vol_ann, 6),
        sharpe_ratio=round(sharpe, 4),
        var_daily=round(var_d, 6),
        cvar_daily=round(cvar_d, 6),
        cvar_ann=round(cvar_ann, 6),
    )


class PortfolioOptimizer:
    """Unified Markowitz Mean-Variance & Rockafellar-Uryasev CVaR Optimizer."""

    def __init__(
        self,
        returns: np.ndarray,
        asset_names: list[str],
        *,
        risk_free_ann: float = 0.04,
        alpha: float = 0.95,
        min_weight: float = 0.0,
        max_weight: float = 0.65,
        cov_shrinkage: float = 0.10,
        periods_per_year: int = TRADING_DAYS_PER_YEAR,
    ) -> None:
        r, t_obs, n_assets = _validate_inputs(returns, asset_names, min_weight, max_weight)
        self.returns = r
        self.t_obs = t_obs
        self.n_assets = n_assets
        self.asset_names = list(asset_names)
        self.risk_free_ann = risk_free_ann
        self.alpha = alpha
        self.min_weight = min_weight
        self.max_weight = max_weight
        self.periods_per_year = periods_per_year
        self.mu_daily = r.mean(axis=0)
        self.mu_ann = self.mu_daily * periods_per_year
        self.cov_daily = shrunk_covariance(r, shrinkage=cov_shrinkage)
        self.bounds = [(min_weight, max_weight) for _ in range(n_assets)]

    def _eval(self, w: np.ndarray) -> PortfolioPoint:
        return evaluate_weights(
            w,
            self.asset_names,
            self.returns,
            self.cov_daily,
            risk_free_ann=self.risk_free_ann,
            alpha=self.alpha,
            periods_per_year=self.periods_per_year,
        )

    def solve_min_variance(self, target_return_ann: float | None = None) -> PortfolioPoint:
        """Solve quadratic program for minimum variance (with optional return target)."""
        n = self.n_assets
        w0 = np.full(n, 1.0 / n)
        constraints: list[dict] = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
        if target_return_ann is not None:
            constraints.append(
                {
                    "type": "ineq",
                    "fun": lambda w, tr=target_return_ann: float(self.mu_ann @ w) - tr,
                }
            )
        res = minimize(
            lambda w: float(w @ self.cov_daily @ w),
            w0,
            method="SLSQP",
            bounds=self.bounds,
            constraints=constraints,
            options={"ftol": 1e-12, "maxiter": 500},
        )
        if not res.success:
            raise RuntimeError(f"MV optimization failed: {res.message}")
        return self._eval(res.x)

    def solve_max_sharpe(self) -> PortfolioPoint:
        """Solve tangency portfolio maximizing annualized Sharpe ratio."""
        n = self.n_assets
        w0 = np.full(n, 1.0 / n)
        rf_daily = self.risk_free_ann / self.periods_per_year

        def neg_sharpe(w: np.ndarray) -> float:
            ret = float(self.mu_daily @ w) - rf_daily
            vol = float(np.sqrt(max(1e-16, float(w @ self.cov_daily @ w))))
            return -ret / vol

        res = minimize(
            neg_sharpe,
            w0,
            method="SLSQP",
            bounds=self.bounds,
            constraints=[{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}],
            options={"ftol": 1e-12, "maxiter": 500},
        )
        if not res.success:
            raise RuntimeError(f"Max-Sharpe optimization failed: {res.message}")
        return self._eval(res.x)

    def solve_min_cvar(self, target_return_ann: float | None = None) -> PortfolioPoint:
        """Solve exact Rockafellar-Uryasev (2000) LP minimizing daily CVaR_alpha.

        Decision vector x = [w_1..w_N, zeta, u_1..u_S].
        """
        n, s = self.n_assets, self.t_obs
        coef = 1.0 / ((1.0 - self.alpha) * s)
        # Objective: 0*w + 1*zeta + coef * sum(u_s)
        c = np.concatenate([np.zeros(n), np.array([1.0]), np.full(s, coef)])

        # Inequality 1: -r_s^T w - zeta - u_s <= 0  for s = 0..S-1
        a_ub = np.zeros((s, n + 1 + s))
        a_ub[:, :n] = -self.returns
        a_ub[:, n] = -1.0
        a_ub[:, n + 1 :] = -np.eye(s)
        b_ub = np.zeros(s)

        # Optional Inequality 2: -mu_ann^T w <= -target_return_ann
        if target_return_ann is not None:
            row = np.zeros((1, n + 1 + s))
            row[0, :n] = -self.mu_ann
            a_ub = np.vstack([a_ub, row])
            b_ub = np.concatenate([b_ub, np.array([-target_return_ann])])

        # Equality: sum(w) = 1
        a_eq = np.zeros((1, n + 1 + s))
        a_eq[0, :n] = 1.0
        b_eq = np.array([1.0])

        bounds = (
            [(self.min_weight, self.max_weight) for _ in range(n)]
            + [(None, None)]
            + [(0.0, None) for _ in range(s)]
        )

        res = linprog(c, A_ub=a_ub, b_ub=b_ub, A_eq=a_eq, b_eq=b_eq, bounds=bounds, method="highs")
        if not res.success:
            raise RuntimeError(f"CVaR LP failed: {res.message}")
        return self._eval(res.x[:n])

    def _feasible_max_return(self) -> float:
        """Find maximum achievable annualized return under weight bounds."""
        c = -self.mu_ann
        a_eq = np.ones((1, self.n_assets))
        b_eq = np.array([1.0])
        res = linprog(c, A_eq=a_eq, b_eq=b_eq, bounds=self.bounds, method="highs")
        if not res.success:
            raise RuntimeError(f"Max-return LP failed: {res.message}")
        return float(self.mu_ann @ res.x)

    def build_frontiers(self, n_points: int = 18) -> FrontierResult:
        """Compute key portfolios plus Mean-Variance and Mean-CVaR efficient frontiers."""
        min_var = self.solve_min_variance()
        max_sharpe = self.solve_max_sharpe()
        min_cvar = self.solve_min_cvar()
        max_ret = self._feasible_max_return()

        mv_targets = np.linspace(min_var.expected_return_ann, max_ret * 0.995, n_points)
        mv_frontier = [self.solve_min_variance(float(tr)) for tr in mv_targets]

        cvar_targets = np.linspace(min_cvar.expected_return_ann, max_ret * 0.995, n_points)
        cvar_frontier = [self.solve_min_cvar(float(tr)) for tr in cvar_targets]

        corr = np.corrcoef(self.returns, rowvar=False)
        corr_dict = {
            a: {b: round(float(corr[i, j]), 4) for j, b in enumerate(self.asset_names)}
            for i, a in enumerate(self.asset_names)
        }
        return FrontierResult(
            assets=self.asset_names,
            min_variance=min_var,
            max_sharpe=max_sharpe,
            min_cvar=min_cvar,
            mv_frontier=mv_frontier,
            cvar_frontier=cvar_frontier,
            correlation_matrix=corr_dict,
        )
