"""Cross-Repo Strategy Adapter Hub (Strictly Paper / Analytical — Zero Live Orders).

Synthesizes normalized return streams, gate diagnostics, and risk attribution across
all 5 trading architectures in Anwar's portfolio:
  1. `arbitrage-`           -> PredictionMarketArbAdapter (YES/NO fee-adjusted spread engine)
  2. `meme-flight-recorder` -> MemeRiskGateAdapter (fail-closed spot-only risk & hash journal)
  3. `goldfarm`             -> GoldEventChainAdapter (deterministic t_formed/t_confirmed no-lookahead)
  4. `goldea`               -> GoldEARiskValidatorAdapter (DSR, CSCV PBO & Monte Carlo DD95 gate)
  5. `goldbrain-workspace`  -> GoldBrainLadderAdapter (Benjamin risk ladder, consistency cap & Time Machine)
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import numpy as np

from .journal import AuditJournal
from .montecarlo import KILL_DRAWDOWN_THRESHOLD, PASS_DD_95_LIMIT, simulate_block_bootstrap
from .optimizer import FrontierResult, PortfolioOptimizer
from .overfit import build_overfit_report

EXECUTION_MODE = "paper_analytical_only"


@dataclass(frozen=True)
class StrategyStream:
    """Normalized strategy performance & risk-gate telemetry for portfolio aggregation."""

    desk_id: str
    source_repo: str
    asset_class: str
    execution_mode: str
    n_periods: int
    n_signals_total: int
    n_signals_accepted: int
    n_signals_rejected: int
    annualized_return: float
    annualized_vol: float
    sharpe_ratio: float
    max_drawdown: float
    win_rate: float
    fee_slippage_drag_ann: float
    gate_passed: bool
    gate_notes: list[str]
    daily_returns: list[float]


def _stream_metrics(returns: np.ndarray, periods_per_year: int = 252) -> tuple[float, float, float, float, float]:
    r = np.asarray(returns, dtype=float)
    ann_ret = float(r.mean()) * periods_per_year
    vol_d = float(r.std(ddof=1)) if r.size > 1 else 0.0
    ann_vol = vol_d * np.sqrt(periods_per_year)
    sharpe = (ann_ret - 0.04) / ann_vol if ann_vol > 1e-12 else 0.0
    equity = np.cumprod(1.0 + np.clip(r, -0.99, None))
    peak = np.maximum.accumulate(np.insert(equity, 0, 1.0))
    dd = (peak[1:] - equity) / np.where(peak[1:] > 0, peak[1:], 1.0)
    max_dd = float(dd.max()) if dd.size else 0.0
    nonzero = r[np.abs(r) > 1e-12]
    win_rate = float((nonzero > 0).mean()) if nonzero.size else 0.0
    return ann_ret, ann_vol, sharpe, max_dd, win_rate


class PredictionMarketArbAdapter:
    """Adapter for `arbitrage-`: cross-venue Kalshi/Polymarket YES/NO fee-adjusted spread."""

    MAX_DISAGREEMENT = 0.50

    def __init__(
        self, entry_edge: float = 0.02, kalshi_fee_rate: float = 0.007, poly_fee_rate: float = 0.002
    ) -> None:
        self.entry_edge = entry_edge
        self.kalshi_fee_rate = kalshi_fee_rate
        self.poly_fee_rate = poly_fee_rate

    def evaluate_books(self, pairs: list[dict[str, float]], journal: AuditJournal) -> StrategyStream:
        accepted_rets: list[float] = []
        rejected = 0
        total_fees = 0.0

        for idx, p in enumerate(pairs):
            k_bid, k_ask = p["kalshi_bid"], p["kalshi_ask"]
            p_bid, p_ask = p["poly_bid"], p["poly_ask"]
            k_mid = 0.5 * (k_bid + k_ask)
            p_mid = 0.5 * (p_bid + p_ask)

            if abs(k_mid - p_mid) > self.MAX_DISAGREEMENT:
                rejected += 1
                accepted_rets.append(0.0)
                journal.append(
                    "prediction_arb",
                    "pair_rejected_disagreement",
                    {"idx": idx, "disagreement": round(abs(k_mid - p_mid), 4)},
                    idempotency_key=f"arb-{idx}",
                )
                continue

            # Direction 1: YES Kalshi + NO Polymarket (NO ask = 1 - p_bid)
            fee1 = k_ask * self.kalshi_fee_rate + (1.0 - p_bid) * self.poly_fee_rate
            edge1 = 1.0 - (k_ask + (1.0 - p_bid)) - fee1
            # Direction 2: YES Polymarket + NO Kalshi (NO ask = 1 - k_bid)
            fee2 = p_ask * self.poly_fee_rate + (1.0 - k_bid) * self.kalshi_fee_rate
            edge2 = 1.0 - (p_ask + (1.0 - k_bid)) - fee2

            best_edge, best_fee, best_cost = (
                (edge1, fee1, k_ask + (1.0 - p_bid))
                if edge1 >= edge2
                else (edge2, fee2, p_ask + (1.0 - k_bid))
            )

            if best_edge >= self.entry_edge and best_cost > 0:
                # Capital-allocated daily return scaled conservatively (2.5% book allocation per arb)
                daily_ret = (best_edge / best_cost) * 0.025 + float(p.get("mark_noise", 0.0))
                accepted_rets.append(daily_ret)
                total_fees += best_fee
                journal.append(
                    "prediction_arb",
                    "arb_locked_paper",
                    {"idx": idx, "edge": round(best_edge, 4), "fee": round(best_fee, 4)},
                    idempotency_key=f"arb-{idx}",
                )
            else:
                rejected += 1
                accepted_rets.append(0.0)

        arr = np.asarray(accepted_rets, dtype=float)
        ann_ret, ann_vol, sharpe, max_dd, win_rate = _stream_metrics(arr)
        fee_drag = (total_fees / max(1, len(pairs))) * 252 * 0.025
        return StrategyStream(
            desk_id="prediction_arb",
            source_repo="arbitrage-",
            asset_class="Prediction Markets (YES/NO)",
            execution_mode=EXECUTION_MODE,
            n_periods=len(pairs),
            n_signals_total=len(pairs),
            n_signals_accepted=len(pairs) - rejected,
            n_signals_rejected=rejected,
            annualized_return=round(ann_ret, 6),
            annualized_vol=round(ann_vol, 6),
            sharpe_ratio=round(sharpe, 4),
            max_drawdown=round(max_dd, 4),
            win_rate=round(win_rate, 4),
            fee_slippage_drag_ann=round(fee_drag, 6),
            gate_passed=True,
            gate_notes=[f"MAX_DISAGREEMENT={self.MAX_DISAGREEMENT}, entry_edge>={self.entry_edge}"],
            daily_returns=[round(float(x), 6) for x in arr],
        )


class MemeRiskGateAdapter:
    """Adapter for `meme-flight-recorder`: fail-closed spot-only risk gate & hash journal."""

    def __init__(
        self,
        daily_loss_limit_pct: float = 3.0,
        consecutive_loss_limit: int = 3,
        max_open_positions: int = 4,
        max_aggregate_open_risk_pct: float = 6.0,
        risk_per_trade_pct: float = 1.25,
    ) -> None:
        self.daily_loss_limit_pct = daily_loss_limit_pct
        self.consecutive_loss_limit = consecutive_loss_limit
        self.max_open_positions = max_open_positions
        self.max_aggregate_open_risk_pct = max_aggregate_open_risk_pct
        self.risk_per_trade_pct = risk_per_trade_pct

    def evaluate_signals(self, candidates: list[dict[str, Any]], journal: AuditJournal) -> StrategyStream:
        equity = 100_000.0
        consecutive_losses = 0
        rets: list[float] = []
        rejected = 0

        for idx, c in enumerate(candidates):
            kill_switch = bool(c.get("kill_switch", False))
            entry_px = float(c["entry_price"])
            stop_px = c.get("stop_price")
            open_pos = int(c.get("open_positions", 0))
            agg_risk_pct = float(c.get("aggregate_open_risk_pct", 0.0))
            daily_pnl_pct = float(c.get("daily_realized_pnl_pct", 0.0))

            reason: str | None = None
            if kill_switch:
                reason = "kill_switch_active"
            elif daily_pnl_pct <= -self.daily_loss_limit_pct:
                reason = "daily_loss_limit_reached"
            elif consecutive_losses >= self.consecutive_loss_limit:
                reason = "consecutive_loss_limit_reached"
            elif open_pos >= self.max_open_positions:
                reason = "maximum_open_positions_reached"
            elif stop_px is None or not (0.0 < float(stop_px) < entry_px):
                reason = "invalid_or_missing_stop"
            elif agg_risk_pct + self.risk_per_trade_pct > self.max_aggregate_open_risk_pct:
                reason = "aggregate_open_risk_exceeded"

            if reason is not None:
                rejected += 1
                rets.append(0.0)
                if reason == "consecutive_loss_limit_reached":
                    # Reset streak on next trading day cooldown
                    consecutive_losses = 0
                journal.append(
                    "meme_risk_gate",
                    "signal_rejected_fail_closed",
                    {"idx": idx, "reason": reason},
                    idempotency_key=f"meme-{idx}",
                )
                continue

            assert stop_px is not None
            stop_pct = (entry_px - float(stop_px)) / entry_px
            risk_usd = equity * (self.risk_per_trade_pct / 100.0)
            # Spot-only invariant from meme-flight-recorder/risk.py: never leveraged notional
            position_usd = min(risk_usd / stop_pct, equity)
            trade_ret_on_pos = float(c["realized_return"]) - float(c.get("slippage_cost", 0.002))
            port_ret = (position_usd / equity) * trade_ret_on_pos
            equity *= 1.0 + port_ret
            rets.append(port_ret)
            consecutive_losses = consecutive_losses + 1 if port_ret < 0 else 0

        arr = np.asarray(rets, dtype=float)
        ann_ret, ann_vol, sharpe, max_dd, win_rate = _stream_metrics(arr)
        return StrategyStream(
            desk_id="meme_risk_gate",
            source_repo="meme-flight-recorder",
            asset_class="Spot Crypto (Fail-Closed)",
            execution_mode=EXECUTION_MODE,
            n_periods=len(candidates),
            n_signals_total=len(candidates),
            n_signals_accepted=len(candidates) - rejected,
            n_signals_rejected=rejected,
            annualized_return=round(ann_ret, 6),
            annualized_vol=round(ann_vol, 6),
            sharpe_ratio=round(sharpe, 4),
            max_drawdown=round(max_dd, 4),
            win_rate=round(win_rate, 4),
            fee_slippage_drag_ann=round(
                float(np.mean([c.get("slippage_cost", 0.002) for c in candidates])) * 25, 6
            ),
            gate_passed=journal.verify_chain(),
            gate_notes=["Spot-only notional cap enforced", f"Fail-closed rejections={rejected}"],
            daily_returns=[round(float(x), 6) for x in arr],
        )


class GoldEventChainAdapter:
    """Adapter for `goldfarm`: deterministic t_formed/t_confirmed no-lookahead event engine."""

    def evaluate_events(self, events: list[dict[str, Any]], journal: AuditJournal) -> StrategyStream:
        rets: list[float] = []
        rejected = 0
        total_cost = 0.0
        risk_per_trade = 0.005  # 0.5% risk per gold structure setup

        for idx, ev in enumerate(events):
            t_formed = datetime.fromisoformat(ev["t_formed"])
            t_confirmed = datetime.fromisoformat(ev["t_confirmed"])
            decision_time = datetime.fromisoformat(ev["decision_time"])

            # Strict no-lookahead invariant from goldfarm SPEC.md §1.1
            if t_confirmed < t_formed or t_confirmed > decision_time:
                rejected += 1
                rets.append(0.0)
                journal.append(
                    "gold_event_chain",
                    "lookahead_violation_blocked",
                    {"idx": idx, "t_confirmed": ev["t_confirmed"], "decision_time": ev["decision_time"]},
                    idempotency_key=f"gf-{idx}",
                )
                continue

            gross_r = float(ev["gross_pnl_r"])
            cost_r = (
                float(ev.get("spread_r", 0.06))
                + float(ev.get("slippage_r", 0.03))
                + float(ev.get("commission_r", 0.02))
            )
            net_r = gross_r - cost_r
            rets.append(net_r * risk_per_trade)
            total_cost += cost_r * risk_per_trade

        arr = np.asarray(rets, dtype=float)
        ann_ret, ann_vol, sharpe, max_dd, win_rate = _stream_metrics(arr)
        return StrategyStream(
            desk_id="gold_event_chain",
            source_repo="goldfarm",
            asset_class="XAUUSD Spot Gold (Structure)",
            execution_mode=EXECUTION_MODE,
            n_periods=len(events),
            n_signals_total=len(events),
            n_signals_accepted=len(events) - rejected,
            n_signals_rejected=rejected,
            annualized_return=round(ann_ret, 6),
            annualized_vol=round(ann_vol, 6),
            sharpe_ratio=round(sharpe, 4),
            max_drawdown=round(max_dd, 4),
            win_rate=round(win_rate, 4),
            fee_slippage_drag_ann=round((total_cost / max(1, len(events))) * 252, 6),
            gate_passed=True,
            gate_notes=[f"t_confirmed <= decision_time enforced; blocked={rejected}"],
            daily_returns=[round(float(x), 6) for x in arr],
        )


class GoldEARiskValidatorAdapter:
    """Adapter for `goldea`: DSR, CSCV PBO & Monte Carlo DD95 < 25% validator."""

    def evaluate_ea_stream(
        self,
        daily_returns: list[float],
        trial_matrix: np.ndarray,
        journal: AuditJournal,
    ) -> StrategyStream:
        arr = np.asarray(daily_returns, dtype=float)
        overfit = build_overfit_report(arr, n_trials=trial_matrix.shape[1], trial_matrix=trial_matrix)
        mc = simulate_block_bootstrap(
            arr, n_sims=1000, horizon_days=len(arr), block_size=1, skip_prob=0.15, seed=42
        )
        passed = mc.passes_dd95_gate and (overfit.pbo is None or overfit.pbo < 0.50)

        journal.append(
            "goldea_validator",
            "ea_validation_complete",
            {"dsr": overfit.deflated_sharpe_ratio, "pbo": overfit.pbo, "mc_dd_p95": mc.dd_p95, "passed": passed},
            idempotency_key="goldea-eval",
        )
        ann_ret, ann_vol, sharpe, max_dd, win_rate = _stream_metrics(arr)
        return StrategyStream(
            desk_id="goldea_validator",
            source_repo="goldea",
            asset_class="XAUUSD Systematic EA",
            execution_mode=EXECUTION_MODE,
            n_periods=len(arr),
            n_signals_total=len(arr),
            n_signals_accepted=len(arr),
            n_signals_rejected=0,
            annualized_return=round(ann_ret, 6),
            annualized_vol=round(ann_vol, 6),
            sharpe_ratio=round(sharpe, 4),
            max_drawdown=round(max_dd, 4),
            win_rate=round(win_rate, 4),
            fee_slippage_drag_ann=0.0115,
            gate_passed=passed,
            gate_notes=[
                f"DSR={overfit.deflated_sharpe_ratio:.3f}, PBO={overfit.pbo}",
                (
                    f"MC skip-15% DD95={mc.dd_p95:.2%} "
                    f"(gate < {PASS_DD_95_LIMIT:.0%}, kill={KILL_DRAWDOWN_THRESHOLD:.0%})"
                ),
            ],
            daily_returns=[round(float(x), 6) for x in arr],
        )


class GoldBrainLadderAdapter:
    """Adapter for `goldbrain-workspace`: Benjamin sizing ladder, consistency cap & Time Machine odds."""

    LADDER_50K = (250.0, 150.0, 75.0)
    DAY_PROFIT_CAP_FRACTION = 0.44
    TARGET_PROFIT_50K = 3000.0

    @staticmethod
    def seasonal_factor(iso_date: str) -> float:
        md = iso_date[5:10]
        return 0.5 if (md >= "12-01" or md <= "02-15") else 1.0

    def evaluate_sessions(self, sessions: list[dict[str, Any]], journal: AuditJournal) -> StrategyStream:
        rets: list[float] = []
        rejected = 0
        account_size = 50_000.0
        day_cap_usd = self.TARGET_PROFIT_50K * self.DAY_PROFIT_CAP_FRACTION
        loss_streak = 0

        for idx, s in enumerate(sessions):
            rr = float(s["rr_target"])
            tm_target_prob = float(s["tm_target_first_prob"])
            breakeven = 1.0 / (1.0 + rr) if rr > 0 else 0.5
            # Time Machine guard: reject plans worse than break-even minus 3% tolerance
            if tm_target_prob < breakeven - 0.03:
                rejected += 1
                rets.append(0.0)
                journal.append(
                    "goldbrain_ladder",
                    "timemachine_odds_rejected",
                    {"idx": idx, "tm_prob": tm_target_prob, "breakeven": round(breakeven, 4)},
                    idempotency_key=f"gb-{idx}",
                )
                continue

            rung_usd = self.LADDER_50K[min(loss_streak, len(self.LADDER_50K) - 1)]
            scaled_risk = rung_usd * self.seasonal_factor(s["date"])
            gross_usd = float(s["outcome_r"]) * scaled_risk - 1.50
            capped_usd = min(gross_usd, day_cap_usd)
            rets.append(capped_usd / account_size)
            loss_streak = loss_streak + 1 if gross_usd < 0 else 0

        arr = np.asarray(rets, dtype=float)
        ann_ret, ann_vol, sharpe, max_dd, win_rate = _stream_metrics(arr)
        return StrategyStream(
            desk_id="goldbrain_ladder",
            source_repo="goldbrain-workspace",
            asset_class="NQ/MNQ Futures (SMC Ladder)",
            execution_mode=EXECUTION_MODE,
            n_periods=len(sessions),
            n_signals_total=len(sessions),
            n_signals_accepted=len(sessions) - rejected,
            n_signals_rejected=rejected,
            annualized_return=round(ann_ret, 6),
            annualized_vol=round(ann_vol, 6),
            sharpe_ratio=round(sharpe, 4),
            max_drawdown=round(max_dd, 4),
            win_rate=round(win_rate, 4),
            fee_slippage_drag_ann=0.0075,
            gate_passed=True,
            gate_notes=[
                f"Benjamin Ladder={self.LADDER_50K}, Consistency Cap={self.DAY_PROFIT_CAP_FRACTION:.0%}",
                f"Time Machine rejected={rejected}",
            ],
            daily_returns=[round(float(x), 6) for x in arr],
        )


def generate_deterministic_desk_inputs(n_days: int = 252, seed: int = 42) -> dict[str, Any]:
    """Generate deterministic paper-analytical research inputs for all 5 trading desks."""
    rng = np.random.default_rng(seed)
    start_dt = datetime(2025, 1, 2, 14, 0, tzinfo=UTC)

    # Common macro volatility factor so desks exhibit realistic low-to-moderate cross-correlation
    macro = rng.normal(0.0, 1.0, n_days)

    arb_pairs = []
    for i in range(n_days):
        base = float(np.clip(0.45 + 0.25 * np.sin(i / 15.0) + 0.04 * rng.normal(), 0.15, 0.85))
        disagree = 0.56 if i % 61 == 0 else 0.0
        spread_edge = 0.028 if i % 3 != 0 else 0.012
        k_ask = round(min(0.95, base), 4)
        k_bid = round(max(0.05, k_ask - 0.01), 4)
        p_bid = round(min(0.95, max(0.05, 1.0 - (1.0 - k_ask - spread_edge) + disagree)), 4)
        p_ask = round(min(0.96, p_bid + 0.01), 4)
        arb_pairs.append(
            {
                "kalshi_bid": k_bid,
                "kalshi_ask": k_ask,
                "poly_bid": p_bid,
                "poly_ask": p_ask,
                "mark_noise": float(0.0022 * rng.normal()),
            }
        )

    meme_candidates = []
    for i in range(n_days):
        stop_pct = float(rng.uniform(0.05, 0.09))
        entry = 1.0
        ret = float(0.005 + 0.036 * rng.normal() - 0.010 * macro[i])
        meme_candidates.append(
            {
                "entry_price": entry,
                "stop_price": None if i % 29 == 0 else round(entry * (1.0 - stop_pct), 4),
                "open_positions": 4 if i % 37 == 0 else int(rng.integers(0, 3)),
                "aggregate_open_risk_pct": float(rng.uniform(1.0, 4.5)),
                "daily_realized_pnl_pct": -3.2 if i % 53 == 0 else 0.4,
                "realized_return": ret,
                "slippage_cost": 0.0025,
                "kill_switch": False,
            }
        )

    goldfarm_events = []
    for i in range(n_days):
        dt = start_dt + timedelta(days=i)
        t_formed = (dt - timedelta(minutes=30)).isoformat()
        # Inject deliberate lookahead rows every 45th sample to prove detector blocks them
        offset_min = 45 if i % 45 == 0 else -10
        t_confirmed = (dt + timedelta(minutes=offset_min)).isoformat()
        decision_time = dt.isoformat()
        gross_r = float(0.24 + 0.92 * rng.normal() + 0.14 * macro[i])
        goldfarm_events.append(
            {
                "t_formed": t_formed,
                "t_confirmed": t_confirmed,
                "decision_time": decision_time,
                "gross_pnl_r": gross_r,
                "spread_r": 0.06,
                "slippage_r": 0.03,
                "commission_r": 0.02,
            }
        )

    ea_returns = (0.00048 + 0.0046 * rng.normal(size=n_days) + 0.0010 * macro).tolist()
    trial_matrix = np.column_stack(
        [0.0001 + 0.0055 * rng.normal(size=n_days) + 0.001 * macro for _ in range(9)]
        + [np.asarray(ea_returns)]
    )

    gb_sessions = []
    for i in range(n_days):
        day_iso = (start_dt + timedelta(days=i)).date().isoformat()
        rr = 2.0
        tm_prob = 0.25 if i % 31 == 0 else 0.41
        outcome_r = 2.0 if rng.random() < 0.40 else -1.0
        gb_sessions.append(
            {
                "date": day_iso,
                "rr_target": rr,
                "tm_target_first_prob": tm_prob,
                "outcome_r": outcome_r,
            }
        )

    return {
        "arb_pairs": arb_pairs,
        "meme_candidates": meme_candidates,
        "goldfarm_events": goldfarm_events,
        "ea_returns": ea_returns,
        "ea_trial_matrix": trial_matrix,
        "gb_sessions": gb_sessions,
    }


@dataclass(frozen=True)
class UnifiedDeskReport:
    """Aggregated Cross-Repo Strategy Hub + Markowitz/CVaR Frontier + Audit Journal."""

    execution_mode: str
    streams: list[StrategyStream]
    frontier: FrontierResult
    audit_chain_valid: bool
    audit_event_count: int
    audit_sample_events: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def run_unified_desk_pipeline(
    n_days: int = 252,
    seed: int = 42,
    risk_free_ann: float = 0.04,
    cvar_alpha: float = 0.95,
    max_weight: float = 0.60,
) -> tuple[UnifiedDeskReport, np.ndarray]:
    """Run all 5 cross-repo strategy adapters and solve Markowitz + CVaR frontiers."""
    data = generate_deterministic_desk_inputs(n_days=n_days, seed=seed)
    journal = AuditJournal()

    streams = [
        PredictionMarketArbAdapter().evaluate_books(data["arb_pairs"], journal),
        MemeRiskGateAdapter().evaluate_signals(data["meme_candidates"], journal),
        GoldEventChainAdapter().evaluate_events(data["goldfarm_events"], journal),
        GoldEARiskValidatorAdapter().evaluate_ea_stream(
            data["ea_returns"], data["ea_trial_matrix"], journal
        ),
        GoldBrainLadderAdapter().evaluate_sessions(data["gb_sessions"], journal),
    ]

    ret_matrix = np.column_stack([np.asarray(s.daily_returns, dtype=float) for s in streams])
    names = [s.desk_id for s in streams]

    opt = PortfolioOptimizer(
        ret_matrix,
        names,
        risk_free_ann=risk_free_ann,
        alpha=cvar_alpha,
        min_weight=0.0,
        max_weight=max_weight,
    )
    frontier = opt.build_frontiers(n_points=18)

    report = UnifiedDeskReport(
        execution_mode=EXECUTION_MODE,
        streams=streams,
        frontier=frontier,
        audit_chain_valid=journal.verify_chain(),
        audit_event_count=len(journal),
        audit_sample_events=journal.events()[:12],
    )
    return report, ret_matrix
