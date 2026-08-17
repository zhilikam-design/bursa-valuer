# BursaValuer · 马股估值器

Bursa Malaysia stock valuation — interactive, bilingual (中文/English), with three valuation models and live slider recalculation.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn-style UI + Recharts**.

## Features

- **Three valuation models**, auto-selected by sector:
  - **DCF** (Discounted Cash Flow) — general/industrial
  - **Gordon DDM** — banks & REITs (Maybank, Public Bank, CIMB…)
  - **Normalized PE Band** — tech & consumer (Inari, Nestlé Malaysia…)
- **Bursa Malaysia localization**:
  - Currency `RM` (MYR)
  - Risk-free rate = Malaysia **MGS 10Y = 3.80%**
  - Equity risk premium = **5.40%** → baseline discount rate = **9.20%**
  - Corporate tax = **24%**
- **Ticker normalization**: accepts `1155`, `0166`, `1155.KL`, `klse:1155` → `1155.KL`
- **Live data** from Yahoo Finance (`.KL`) with **offline demo defaults** fallback
- Bilingual UI toggle (中文 / English)
- Fair-value comparison + sensitivity charts (Recharts)
- Instant recalculation as sliders move (no server round-trip)

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000/stock/1155
```

Or build for production:

```bash
npm run build
npm start
```

## Data sources

`lib/data/yahoo.ts` fetches quotes from Yahoo Finance's public chart endpoint
(`query1.finance.yahoo.com`) with a 60-second revalidation, plus a manual
**refresh price** button (⚡) on the stock page that hits `/api/quote/[ticker]`
for an instant no-cache refresh.

Optional second source: set `FMP_API_KEY` (see `.env.example`,
<https://financialmodelingprep.com>) to also pull EPS / P/E / dividend yield
from Financial Modeling Prep. When multiple sources contribute, `lib/data/arbitrate.ts`
takes the **median** and flags agreement (`多源一致` / `数据不一致` / `单一来源`)
in the stock header.

When the network is unavailable, the app falls back to `lib/data/seed.ts` —
approximate demo figures for well-known Bursa counters — so the valuation UI
always renders. Unknown tickers render a generic profile where you can type
manual inputs.

## Project structure

```
app/
  page.tsx                 # landing + ticker search
  stock/[ticker]/page.tsx  # server page → fetches data → renders dashboard
  api/quote/[ticker]/route.ts  # live quote endpoint (refresh button)
components/
  ui/                      # shadcn-style primitives (button, card, slider, tabs, badge)
  valuation/               # ValuationDashboard, sliders, model cards, charts
  LandingPage.tsx, LangToggle.tsx
lib/
  bursa.ts                 # market assumptions + ticker normalization + sector presets
  i18n.tsx                 # en/zh dictionaries + LangProvider
  format.ts                # RM / percent formatting
  valuation/               # dcf.ts, ddm.ts, pe-band.ts, index.ts (orchestrator)
  data/                    # yahoo.ts + fmp.ts (fetch), arbitrate.ts (merge), seed.ts (offline defaults)
```

## Adapted from open source

- **DariusLukasukas/stocks** — Next.js 14 + shadcn + Tailwind + Yahoo Finance
  architecture (app/stock route, `lib/yahoo-finance`, `lib/utils` `cn`).
- **920linjerry-stack/capital-studio** — bilingual (中文/English) DCF/LBO
  modeling (`modeling/dcf_calculator.py`, `trading_comps.py`); DCF + comps math reference.
- **olivercarmont/kynos** — Next.js + shadcn charts stock picker.
- **OpenBB Terminal** — canonical `dcf()` / `ddm()` formulas.

## Disclaimer

Educational estimate only. Not investment advice.
