# Autonomous Development & Self-Correction Rules

After implementing any code changes:

1. Execute `npm run verify` (runs `tsx scripts/verify-valuation.ts`) and `npm run build` in the terminal.
2. If any compilation error or assertion failure occurs, inspect the error output, fix the root cause, and re-run.
3. Do NOT hand over to the user until both commands exit with code 0.

## Valuation guardrails (do not regress)

- Never use hardcoded dummy financials (no `fcf = 500M`, `shares = 1000M`, `dps = 0.10`).
- Gordon DDM: `dps <= 0`/missing → not applicable (`Gordon DDM N/A (No Dividend Distributed)`).
- P/E band: `eps <= 0` → not applicable (loss-making).
- Denominator safety floor in DDM and DCF: `(r - g) >= 0.02`.
- Discount rate: dynamic CAPM `r = 0.035 + beta × 0.05`, clamped at minimum 6.0%.
- Sector routing: Financial Services / Utilities / Real Estate → DDM primary; others → DCF primary.
