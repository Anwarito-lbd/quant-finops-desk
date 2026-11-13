export interface PortfolioPoint {
  weights: Record<string, number>;
  expected_return_ann: number;
  volatility_ann: number;
  sharpe_ratio: number;
  var_daily: number;
  cvar_daily: number;
  cvar_ann: number;
}

export interface FrontierResult {
  assets: string[];
  min_variance: PortfolioPoint;
  max_sharpe: PortfolioPoint;
  min_cvar: PortfolioPoint;
  mv_frontier: PortfolioPoint[];
  cvar_frontier: PortfolioPoint[];
  correlation_matrix: Record<string, Record<string, number>>;
}

export interface StrategyStream {
  desk_id: string;
  source_repo: string;
  asset_class: string;
  execution_mode: string;
  n_periods: number;
  n_signals_total: number;
  n_signals_accepted: number;
  n_signals_rejected: number;
  annualized_return: number;
  annualized_vol: number;
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  fee_slippage_drag_ann: number;
  gate_passed: boolean;
  gate_notes: string[];
  daily_returns: number[];
}

export interface AuditEvent {
  seq: number;
  observed_at: string;
  desk_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  previous_hash: string;
  event_hash: string;
}

export interface DeskReport {
  execution_mode: string;
  streams: StrategyStream[];
  frontier: FrontierResult;
  audit_chain_valid: boolean;
  audit_event_count: number;
  audit_sample_events: AuditEvent[];
}

export interface MonteCarloResult {
  mode: string;
  n_sims: number;
  horizon_days: number;
  initial_capital: number;
  ruin_threshold: number;
  terminal_p5: number;
  terminal_p25: number;
  terminal_p50: number;
  terminal_p75: number;
  terminal_p95: number;
  var_95_loss: number;
  cvar_95_loss: number;
  dd_p50: number;
  dd_p95: number;
  dd_p99: number;
  p_hit_kill_20pct: number;
  p_ruin: number;
  passes_dd95_gate: boolean;
  fan_days: number[];
  fan_p5: number[];
  fan_p25: number[];
  fan_p50: number[];
  fan_p75: number[];
  fan_p95: number[];
  sample_paths: number[][];
}

export interface CohortAnalysisResult {
  cohort_labels: string[];
  month_offsets: number[];
  logo_retention_matrix: (number | null)[][];
  revenue_retention_matrix: (number | null)[][];
  avg_retention_curve: number[];
  ndr_12m: number;
  ltv_usd: number;
  cac_usd: number;
  ltv_to_cac: number;
  cac_payback_months: number;
  burn_multiple: number;
  rule_of_40_pct: number;
  monthly_gross_profit_per_customer: number;
}

export interface DCFYearRow {
  year: number;
  revenue: number;
  ebit: number;
  nopat: number;
  da: number;
  capex: number;
  delta_nwc: number;
  ufcf: number;
  discount_factor: number;
  pv_ufcf: number;
}

export interface DCFResult {
  schedule: DCFYearRow[];
  sum_pv_ufcf: number;
  terminal_value_gordon: number;
  pv_terminal_value_gordon: number;
  enterprise_value_gordon: number;
  equity_value_gordon: number;
  implied_share_price_gordon: number;
  tv_share_of_ev_pct: number;
  enterprise_value_exit_multiple: number;
  wacc_axis: number[];
  tg_axis: number[];
  sensitivity_ev_grid: number[][];
}

export interface TerminalOverview {
  execution_mode: string;
  desk_report: DeskReport;
  monte_carlo_regime: MonteCarloResult;
  monte_carlo_bootstrap: MonteCarloResult;
  cohorts: CohortAnalysisResult;
  dcf: DCFResult;
}
