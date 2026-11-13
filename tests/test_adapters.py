"""Tests for Cross-Repo Strategy Adapter Hub, AuditJournal, Lookahead & Overfitting Guards."""
from __future__ import annotations

from src.quant.adapters import (
    EXECUTION_MODE,
    GoldBrainLadderAdapter,
    GoldEventChainAdapter,
    MemeRiskGateAdapter,
    PredictionMarketArbAdapter,
    run_unified_desk_pipeline,
)
from src.quant.journal import AuditJournal
from src.quant.overfit import build_overfit_report


def test_audit_journal_hash_chain_and_idempotency() -> None:
    j = AuditJournal()
    e1 = j.append("desk_a", "signal", {"x": 1}, idempotency_key="k1")
    e1_dup = j.append("desk_a", "signal", {"x": 999}, idempotency_key="k1")
    assert e1.event_hash == e1_dup.event_hash
    assert len(j) == 1
    j.append("desk_b", "gate", {"ok": True}, idempotency_key="k2")
    assert j.verify_chain() is True

    # Tamper payload directly to verify chain detection
    object.__setattr__(j._events[0], "payload", {"x": 999})
    assert j.verify_chain() is False


def test_arbitrage_max_disagreement_and_fee_filter() -> None:
    j = AuditJournal()
    pairs = [
        {"kalshi_bid": 0.45, "kalshi_ask": 0.46, "poly_bid": 0.59, "poly_ask": 0.60},
        {"kalshi_bid": 0.10, "kalshi_ask": 0.12, "poly_bid": 0.88, "poly_ask": 0.90},
    ]
    stream = PredictionMarketArbAdapter(entry_edge=0.02).evaluate_books(pairs, j)
    assert stream.n_signals_accepted == 1
    assert stream.n_signals_rejected == 1


def test_goldfarm_strict_no_lookahead_invariant() -> None:
    j = AuditJournal()
    events = [
        {
            "t_formed": "2026-01-05T10:00:00+00:00",
            "t_confirmed": "2026-01-05T10:15:00+00:00",
            "decision_time": "2026-01-05T10:30:00+00:00",
            "gross_pnl_r": 2.0,
        },
        {
            "t_formed": "2026-01-06T10:00:00+00:00",
            "t_confirmed": "2026-01-06T10:45:00+00:00",  # AFTER decision_time -> MUST block!
            "decision_time": "2026-01-06T10:30:00+00:00",
            "gross_pnl_r": 5.0,
        },
    ]
    stream = GoldEventChainAdapter().evaluate_events(events, j)
    assert stream.n_signals_accepted == 1
    assert stream.n_signals_rejected == 1
    assert stream.daily_returns[1] == 0.0


def test_meme_fail_closed_kill_switch_and_missing_stop() -> None:
    j = AuditJournal()
    cands = [
        {"entry_price": 1.0, "stop_price": None, "realized_return": 0.10},
        {"entry_price": 1.0, "stop_price": 0.95, "kill_switch": True, "realized_return": 0.10},
        {"entry_price": 1.0, "stop_price": 0.95, "realized_return": 0.04},
    ]
    stream = MemeRiskGateAdapter().evaluate_signals(cands, j)
    assert stream.n_signals_rejected == 2
    assert stream.n_signals_accepted == 1


def test_goldbrain_seasonal_and_timemachine_filter() -> None:
    assert GoldBrainLadderAdapter.seasonal_factor("2026-01-10") == 0.5
    assert GoldBrainLadderAdapter.seasonal_factor("2026-05-10") == 1.0
    j = AuditJournal()
    sessions = [
        {"date": "2026-05-10", "rr_target": 2.0, "tm_target_first_prob": 0.42, "outcome_r": 2.0},
        {"date": "2026-05-11", "rr_target": 2.0, "tm_target_first_prob": 0.20, "outcome_r": 2.0},
    ]
    stream = GoldBrainLadderAdapter().evaluate_sessions(sessions, j)
    assert stream.n_signals_accepted == 1
    assert stream.n_signals_rejected == 1


def test_unified_desk_pipeline_and_overfit_report() -> None:
    report, mat = run_unified_desk_pipeline(n_days=252, seed=42)
    assert report.execution_mode == EXECUTION_MODE
    assert len(report.streams) == 5
    assert mat.shape == (252, 5)
    assert report.audit_chain_valid is True
    assert report.audit_event_count > 0

    overfit = build_overfit_report(mat[:, 0], n_trials=10, trial_matrix=mat)
    assert 0.0 <= overfit.deflated_sharpe_ratio <= 1.0
    assert overfit.pbo is not None and 0.0 <= overfit.pbo <= 1.0
