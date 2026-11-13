import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuantTerminal } from "@/components/QuantTerminal";
import type { TerminalOverview } from "@/lib/types";

const MOCK_OVERVIEW: TerminalOverview = {
  execution_mode: "paper_analytical_only",
  desk_report: {
    execution_mode: "paper_analytical_only",
    audit_chain_valid: true,
    audit_event_count: 216,
    audit_sample_events: [
      {
        seq: 1,
        observed_at: "2026-11-13T00:00:00+00:00",
        desk_id: "prediction_arb",
        event_type: "arb_locked_paper",
        payload: { edge: 0.025 },
        previous_hash: "GENESIS",
        event_hash: "abc123def45678901234567890",
      },
    ],
    streams: [
      {
        desk_id: "prediction_arb",
        source_repo: "arbitrage-",
        asset_class: "Prediction Markets (YES/NO)",
        execution_mode: "paper_analytical_only",
        n_periods: 252,
        n_signals_total: 252,
        n_signals_accepted: 167,
        n_signals_rejected: 85,
        annualized_return: 0.1014,
        annualized_vol: 0.035,
        sharpe_ratio: 1.75,
        max_drawdown: 0.0165,
        win_rate: 0.65,
        fee_slippage_drag_ann: 0.012,
        gate_passed: true,
        gate_notes: ["MAX_DISAGREEMENT=0.50"],
        daily_returns: [0.001, 0.002],
      },
      {
        desk_id: "meme_risk_gate",
        source_repo: "meme-flight-recorder",
        asset_class: "Spot Crypto (Fail-Closed)",
        execution_mode: "paper_analytical_only",
        n_periods: 252,
        n_signals_total: 252,
        n_signals_accepted: 222,
        n_signals_rejected: 30,
        annualized_return: 0.1206,
        annualized_vol: 0.1033,
        sharpe_ratio: 0.78,
        max_drawdown: 0.0814,
        win_rate: 0.54,
        fee_slippage_drag_ann: 0.025,
        gate_passed: true,
        gate_notes: ["Spot-only notional cap enforced"],
        daily_returns: [0.002, -0.001],
      },
      {
        desk_id: "gold_event_chain",
        source_repo: "goldfarm",
        asset_class: "XAUUSD Spot Gold (Structure)",
        execution_mode: "paper_analytical_only",
        n_periods: 252,
        n_signals_total: 252,
        n_signals_accepted: 246,
        n_signals_rejected: 6,
        annualized_return: 0.0082,
        annualized_vol: 0.0709,
        sharpe_ratio: -0.45,
        max_drawdown: 0.0508,
        win_rate: 0.49,
        fee_slippage_drag_ann: 0.015,
        gate_passed: true,
        gate_notes: ["t_confirmed <= decision_time enforced"],
        daily_returns: [0.0, 0.001],
      },
      {
        desk_id: "goldea_validator",
        source_repo: "goldea",
        asset_class: "XAUUSD Systematic EA",
        execution_mode: "paper_analytical_only",
        n_periods: 252,
        n_signals_total: 252,
        n_signals_accepted: 252,
        n_signals_rejected: 0,
        annualized_return: -0.0169,
        annualized_vol: 0.0719,
        sharpe_ratio: -0.79,
        max_drawdown: 0.121,
        win_rate: 0.47,
        fee_slippage_drag_ann: 0.0115,
        gate_passed: true,
        gate_notes: ["DSR=0.81, PBO=0.18"],
        daily_returns: [-0.001, 0.001],
      },
      {
        desk_id: "goldbrain_ladder",
        source_repo: "goldbrain-workspace",
        asset_class: "NQ/MNQ Futures (SMC Ladder)",
        execution_mode: "paper_analytical_only",
        n_periods: 252,
        n_signals_total: 252,
        n_signals_accepted: 243,
        n_signals_rejected: 9,
        annualized_return: 0.243,
        annualized_vol: 0.082,
        sharpe_ratio: 2.48,
        max_drawdown: 0.0289,
        win_rate: 0.42,
        fee_slippage_drag_ann: 0.0075,
        gate_passed: true,
        gate_notes: ["Benjamin Ladder=(250, 150, 75)"],
        daily_returns: [0.003, -0.001],
      },
    ],
    frontier: {
      assets: ["prediction_arb", "meme_risk_gate", "gold_event_chain", "goldea_validator", "goldbrain_ladder"],
      min_variance: {
        weights: { prediction_arb: 0.5, meme_risk_gate: 0.1, gold_event_chain: 0.15, goldea_validator: 0.15, goldbrain_ladder: 0.1 },
        expected_return_ann: 0.086,
        volatility_ann: 0.0286,
        sharpe_ratio: 1.62,
        var_daily: 0.0022,
        cvar_daily: 0.0028,
        cvar_ann: 0.044,
      },
      max_sharpe: {
        weights: { prediction_arb: 0.5, meme_risk_gate: 0.09, gold_event_chain: 0, goldea_validator: 0, goldbrain_ladder: 0.41 },
        expected_return_ann: 0.1613,
        volatility_ann: 0.04,
        sharpe_ratio: 3.03,
        var_daily: 0.0027,
        cvar_daily: 0.0035,
        cvar_ann: 0.056,
      },
      min_cvar: {
        weights: { prediction_arb: 0.52, meme_risk_gate: 0.05, gold_event_chain: 0.17, goldea_validator: 0.1, goldbrain_ladder: 0.16 },
        expected_return_ann: 0.098,
        volatility_ann: 0.029,
        sharpe_ratio: 1.99,
        var_daily: 0.0022,
        cvar_daily: 0.0027,
        cvar_ann: 0.042,
      },
      mv_frontier: [
        { weights: {}, expected_return_ann: 0.086, volatility_ann: 0.0286, sharpe_ratio: 1.62, var_daily: 0.002, cvar_daily: 0.0028, cvar_ann: 0.04 },
        { weights: {}, expected_return_ann: 0.1613, volatility_ann: 0.04, sharpe_ratio: 3.03, var_daily: 0.0027, cvar_daily: 0.0035, cvar_ann: 0.056 },
      ],
      cvar_frontier: [
        { weights: {}, expected_return_ann: 0.098, volatility_ann: 0.029, sharpe_ratio: 1.99, var_daily: 0.0022, cvar_daily: 0.0027, cvar_ann: 0.042 },
        { weights: {}, expected_return_ann: 0.1613, volatility_ann: 0.04, sharpe_ratio: 3.03, var_daily: 0.0027, cvar_daily: 0.0035, cvar_ann: 0.056 },
      ],
      correlation_matrix: {},
    },
  },
  monte_carlo_regime: {
    mode: "regime_switching_gbm",
    n_sims: 3000,
    horizon_days: 252,
    initial_capital: 250000,
    ruin_threshold: 187500,
    terminal_p5: 214566,
    terminal_p25: 252000,
    terminal_p50: 276402,
    terminal_p75: 305000,
    terminal_p95: 350710,
    var_95_loss: 35434,
    cvar_95_loss: 50388,
    dd_p50: 0.09,
    dd_p95: 0.247,
    dd_p99: 0.31,
    p_hit_kill_20pct: 0.08,
    p_ruin: 0.0213,
    passes_dd95_gate: true,
    fan_days: [0, 126, 252],
    fan_p5: [250000, 230000, 214566],
    fan_p25: [250000, 251000, 252000],
    fan_p50: [250000, 263000, 276402],
    fan_p75: [250000, 278000, 305000],
    fan_p95: [250000, 298000, 350710],
    sample_paths: [[250000, 260000, 275000]],
  },
  monte_carlo_bootstrap: {
    mode: "bootstrap_skip_stress",
    n_sims: 3000,
    horizon_days: 252,
    initial_capital: 250000,
    ruin_threshold: 187500,
    terminal_p5: 272358,
    terminal_p25: 280000,
    terminal_p50: 289009,
    terminal_p75: 298000,
    terminal_p95: 307061,
    var_95_loss: 0,
    cvar_95_loss: 0,
    dd_p50: 0.01,
    dd_p95: 0.0208,
    dd_p99: 0.03,
    p_hit_kill_20pct: 0,
    p_ruin: 0,
    passes_dd95_gate: true,
    fan_days: [0, 126, 252],
    fan_p5: [250000, 261000, 272358],
    fan_p25: [250000, 265000, 280000],
    fan_p50: [250000, 269000, 289009],
    fan_p75: [250000, 274000, 298000],
    fan_p95: [250000, 278000, 307061],
    sample_paths: [[250000, 270000, 289000]],
  },
  cohorts: {
    cohort_labels: ["2025-01", "2025-02"],
    month_offsets: [0, 1],
    logo_retention_matrix: [
      [1.0, 0.95],
      [1.0, null],
    ],
    revenue_retention_matrix: [
      [1.0, 0.96],
      [1.0, null],
    ],
    avg_retention_curve: [1.0, 0.95],
    ndr_12m: 0.7734,
    ltv_usd: 5850,
    cac_usd: 1150,
    ltv_to_cac: 5.09,
    cac_payback_months: 7.56,
    burn_multiple: 0.72,
    rule_of_40_pct: 56,
    monthly_gross_profit_per_customer: 152.1,
  },
  dcf: {
    schedule: [],
    sum_pv_ufcf: 3571000,
    terminal_value_gordon: 26670000,
    pv_terminal_value_gordon: 15478000,
    enterprise_value_gordon: 19049459,
    equity_value_gordon: 20149459,
    implied_share_price_gordon: 20.15,
    tv_share_of_ev_pct: 81.25,
    enterprise_value_exit_multiple: 32951787,
    wacc_axis: [0.095, 0.105, 0.115, 0.125, 0.135],
    tg_axis: [0.02, 0.025, 0.03, 0.035, 0.04],
    sensitivity_ev_grid: [
      [22840000, 24300000, 25990000, 27950000, 30270000],
      [19730000, 20820000, 22050000, 23450000, 25070000],
      [17290000, 18120000, 19049459, 20100000, 21280000],
      [15320000, 15970000, 16700000, 17500000, 18400000],
      [13700000, 14230000, 14800000, 15430000, 16130000],
    ],
  },
};

describe("QuantTerminal Dashboard", () => {
  it("renders all 5 integrated trading desks, KPIs, FinOps heatmaps, and audit hash chain", () => {
    render(<QuantTerminal initialOverview={MOCK_OVERVIEW} />);

    expect(screen.getByText(/Quant & FinOps Desk/i)).toBeInTheDocument();
    expect(screen.getAllByText(/arbitrage-/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/meme-flight-recorder/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/goldfarm/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/goldea/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/goldbrain-workspace/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/HASH CHAIN VERIFIED/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$19\.05M/i).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/5\.09x/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/DD₉₅ < 25% GATE PASS/i)).toBeInTheDocument();
  });

  it("switches between Mean-Variance and Mean-CVaR frontier views and toggles theme", () => {
    render(<QuantTerminal initialOverview={MOCK_OVERVIEW} />);

    fireEvent.click(screen.getByRole("button", { name: "Mean-CVaR" }));
    expect(screen.getByText(/Rockafellar-Uryasev CVaR/i)).toBeInTheDocument();

    const themeBtn = screen.getByRole("button", { name: /Toggle color theme/i });
    fireEvent.click(themeBtn);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });
});
