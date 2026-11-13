"""FastAPI endpoint integration tests."""
from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app)


def test_health_and_overview() -> None:
    r_health = client.get("/health")
    assert r_health.status_code == 200
    body = r_health.json()
    assert body["status"] == "ok"
    assert body["execution_mode"] == "paper_analytical_only"
    assert len(body["desks_integrated"]) == 5

    r_ov = client.get("/api/v1/terminal/overview")
    assert r_ov.status_code == 200
    ov = r_ov.json()
    assert len(ov["desk_report"]["streams"]) == 5
    assert ov["desk_report"]["audit_chain_valid"] is True
    assert ov["dcf"]["enterprise_value_gordon"] > 0
    assert ov["cohorts"]["ltv_to_cac"] > 1.0


def test_post_endpoints_and_validation() -> None:
    r_opt = client.post(
        "/api/v1/quant/optimize",
        json={"risk_free_ann": 0.045, "cvar_alpha": 0.95, "max_weight": 0.55, "n_days": 180},
    )
    assert r_opt.status_code == 200
    assert len(r_opt.json()["frontier"]["mv_frontier"]) == 18

    r_mc = client.post(
        "/api/v1/quant/montecarlo",
        json={"initial_capital": 500000, "horizon_days": 126, "n_sims": 500},
    )
    assert r_mc.status_code == 200
    assert r_mc.json()["initial_capital"] == 500000.0

    r_dcf_bad = client.post(
        "/api/v1/finops/dcf",
        json={"wacc": 0.04, "terminal_growth": 0.05},
    )
    assert r_dcf_bad.status_code == 422
