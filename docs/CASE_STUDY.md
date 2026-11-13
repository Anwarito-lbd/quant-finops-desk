# Engineering & Quantitative Case Study: Quant & FinOps Desk

## 1. Problem Statement & Motivation

Systematic trading research and corporate financial planning often fail in production for the same reason: **fragmented risk accounting**. Strategy prototypes live in isolated notebooks or single-asset scripts without a unified covariance matrix, tail-risk budget, lookahead enforcement, or treasury runway model.

Across five specialized trading repositories in Anwar's research portfolio:
1. **`arbitrage-`**: Cross-venue Kalshi/Polymarket prediction market YES/NO pair pricing.
2. **`meme-flight-recorder`**: Spot-only crypto research recorder with fail-closed risk gates and a SHA-256 hash-chained SQLite journal.
3. **`goldfarm`**: Deterministic XAUUSD market-structure event engine enforcing `t_formed` / `t_confirmed` no-lookahead boundaries.
4. **`goldea`**: XAUUSD Expert Advisor validation framework implementing Deflated Sharpe Ratio (DSR), CSCV Probability of Backtest Overfitting (PBO), and trade-order shuffle/skip Monte Carlo stress gates.
5. **`goldbrain-workspace`**: NQ/MNQ futures workspace enforcing Benjamin's risk-management ladder, seasonal scaling, consistency caps, and Time Machine conditional break-even verification.

`quant-finops-desk` unifies these five heterogeneous trading architectures under **one analytical risk engine** and bridges trading desk capital allocation with **corporate FinOps** (SaaS cohort unit economics and 5-year unlevered DCF valuation).

---

## 2. Architectural Design & Key Engineering Decisions

### 2.1 Normalized Cross-Repo Strategy Adapter Hub (`src/quant/adapters.py`)

Rather than copying strategy-specific I/O or broker logic (and strictly forbidding live execution), each repository is represented by a deterministic adapter class that maps raw domain payloads into a unified `StrategyStream` contract:

- **Prediction Market Arbitrage (`PredictionMarketArbAdapter`)**: Reconstructs implied NO ask prices via $p_{\text{NO,ask}} = 1 - p_{\text{YES,bid}}$, blocks mismatched propositions exceeding `MAX_DISAGREEMENT = 0.50`, deducts venue taker fees, and filters for positive net resolution edge ($\ge 2\%$). In the 252-period benchmark, **167 of 252 pairs** passed (`85` rejected).
- **Fail-Closed Crypto Risk Gate (`MemeRiskGateAdapter`)**: Enforces the spot-only invariant $V_{\text{pos}} = \min(\text{risk} / \text{stop\_pct}, E)$, rejects missing stops, kill-switch triggers, daily loss limits ($-3\%$), and consecutive loss streaks. In the benchmark, **222 passed** and **30 were blocked** fail-closed.
- **No-Lookahead Event Engine (`GoldEventChainAdapter`)**: Validates $t_{\text{formed}} \le t_{\text{confirmed}} \le t_{\text{decision}}$ on every market-structure event. Deliberately injected lookahead violations (6 out of 252 events) were blocked (`daily_return = 0.0`) and logged to the audit chain.
- **Overfitting & Path Perturbation Validator (`GoldEARiskValidatorAdapter`)**: Evaluates the candidate return stream against 10 parameter trials via DSR and CSCV PBO, then runs a 1,000-path 15%-skip bootstrap confirming $\text{DD}_{95} < 25\%$.
- **Risk Ladder & Time Machine (`GoldBrainLadderAdapter`)**: Applies the `[250, 150, 75]` step-down ladder on consecutive losses, halves risk between December 1 and February 15, caps single-day P&L at `44%` of the evaluation target, and rejects trades where Time Machine target-first probability falls below $\frac{1}{1+R} - 3\%$.

### 2.2 Why Both Mean-Variance (SLSQP) and Rockafellar-Uryasev CVaR (HiGHS LP)?

Sample covariance portfolios suffer from two classical weaknesses:
1. **Estimation Error Amplification**: Small eigenvalues in $\hat{\Sigma}$ cause extreme weights. We apply a 10% shrinkage toward the scaled identity matrix $\frac{\operatorname{tr}(\hat{\Sigma})}{N}I_N$ plus box constraints $w_i \in [0, 0.60]$.
2. **Symmetric Variance Penalty**: Mean-Variance penalizes upside outliers equally with downside crashes. `PortfolioOptimizer.solve_min_cvar()` solves the Rockafellar-Uryasev linear program via `scipy.optimize.linprog(method="highs")`, directly minimizing expected shortfall in the worst $(1-\alpha)=5\%$ tail.

Observed trade-off on the 5-desk return matrix:
- **Max-Sharpe Tangency**: Concentrates in `prediction_arb` (`50.1%`), `goldbrain_ladder` (`41.1%`), and `meme_risk_gate` (`8.8%`) for **Sharpe `3.03`** (`16.13%` return, `4.00%` vol, `0.35%` daily CVaR₉₅).
- **Min-CVaR₉₅**: Retains diversifying weights across all five desks (`52.0%` / `4.9%` / `16.7%` / `10.0%` / `16.4%`) to push daily 95% CVaR down to **`0.27%`** (`Sharpe 1.99`).

### 2.3 Tamper-Evident Auditability (`src/quant/journal.py`)

Adapted from `meme-flight-recorder`, every gate rejection and paper lock is appended with canonical JSON serialization (`sort_keys=True, separators=(",", ":")`) chained via SHA-256 (`previous_hash` -> `event_hash`), plus idempotency keys preventing duplicate writes across retries. In the benchmark run, **216 events** were recorded with `verify_chain() == True`.

### 2.4 Bridging Trading Treasury to Corporate FinOps (`src/finops/`)

Capital generated or buffered by systematic desks supports operating SaaS/ecommerce units. `src/finops/` provides:
- **Cohort Engine (`cohorts.py`)**: 12-month logo and net-dollar retention matrices, gross-margin-adjusted LTV (`$5,850`), CAC (`$1,150`), LTV/CAC (`5.09x`), Payback (`7.56 months`), Burn Multiple (`0.72x`), and Rule of 40 (`56.0%`).
- **5-Year DCF Engine (`dcf.py`)**: Projects NOPAT, D&A, CapEx, and $\Delta\text{NWC}$ into UFCF, solving both Gordon Growth (`$19.05M` EV, `$20.15M` Equity Value, `$20.15`/share) and Exit EBITDA Multiple (`14.0x` -> `$32.95M` EV) across a $5 \times 5$ WACC ($9.5\%\text{–}13.5\%$) $\times$ Terminal Growth ($2.0\%\text{–}4.0\%$) grid.

---

## 3. Verification & Safety Guarantees

1. **Zero Live Order Paths**: No broker SDKs, private keys, or signing modules exist anywhere in `src/` or `apps/`.
2. **Mathematical Invariant Tests**: `pytest` verifies Markowitz variance dominance, CVaR convexity ($c(\lambda w_1 + (1-\lambda)w_2) \le \lambda c(w_1) + (1-\lambda)c(w_2)$), $\text{CVaR} \ge \text{VaR}$, Monte Carlo quantile monotonicity, hash-chain tamper detection, lookahead rejection, and DCF sensitivity monotonicity.
3. **Full-Stack Live Verification**: FastAPI (`uvicorn`) and Next.js (`next start`) were exercised end-to-end by headless Chromium (Playwright) across `1440×900` desktop and `390×844` mobile viewports with zero horizontal overflow and zero browser console errors.
