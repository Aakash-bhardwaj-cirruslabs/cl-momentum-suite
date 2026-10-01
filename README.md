# CirrusLabs Momentum Suite — Web Visualiser

Interactive candlestick chart that re-implements the `CirrusLabs_Momentum_Suite` Pine Script v5 indicator in TypeScript/Canvas2D.

## Signal logic (mirrors the `.pine` file exactly)

| Layer | What | Toggle |
|---|---|---|
| **Trigger** | EMA 21 crosses over/under EMA 55 | always on |
| **Confirmation** | RSI(14) ≥ 50 (long) / ≤ 50 (short) | `useRsiFilter` |
| **Volatility gate** | ATR(14) > SMA(ATR, 20) | `useAtrFilter` |

All three must agree before a signal fires.

## Stack

- **Vite 5** + **TypeScript** — zero runtime dependencies
- **Canvas 2D API** — candlesticks, EMA lines, RSI panel, ATR histogram
- Realistic BTC/USDT 4H OHLCV data (120 bars, generated with seeded deterministic noise)

## Quick start

```bash
npm install
npm run dev        # dev server (hot reload)
npm run build      # production bundle → dist/
npm run preview    # serve the production build
```

## Project layout

```
src/
  data.ts        — OHLCV generator (seeded, deterministic)
  indicator.ts   — EMA, RSI, ATR, signal logic
  main.ts        — Canvas renderer + DOM wiring
  style.css      — TradingView-dark theme
index.html
vite.config.ts
tsconfig.json
```

## Related

- `CirrusLabs_Momentum_Suite.pine` — the original Pine Script v5 indicator (copy-paste into TradingView)
