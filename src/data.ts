/**
 * Generates 500 bars of realistic BTC/USDT 4H synthetic OHLCV data.
 * Uses a seeded geometric Brownian motion with realistic vol/drift parameters
 * so the indicator fires a handful of signals — enough for a meaningful demo.
 */
import type { OHLCV } from './indicator';

// Mulberry32 — fast, seedable PRNG
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller transform → standard normal
function boxMuller(rand: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u, v, s;
    do { u = rand() * 2 - 1; v = rand() * 2 - 1; s = u * u + v * v; }
    while (s >= 1 || s === 0);
    const mul = Math.sqrt(-2 * Math.log(s) / s);
    spare = v * mul;
    return u * mul;
  };
}

export function generateBtcOhlcv(numBars = 500): OHLCV[] {
  const rand = mulberry32(0xdeadbeef);
  const randn = boxMuller(rand);

  // BTC 4H realistic parameters
  const annualDrift = 0.60;          // 60% annual drift (bull market)
  const annualVol   = 0.80;          // 80% annual vol
  const barsPerYear = 365 * 6;       // 4H bars per year
  const dt          = 1 / barsPerYear;
  const mu          = (annualDrift - 0.5 * annualVol ** 2) * dt;
  const sigma       = annualVol * Math.sqrt(dt);

  // Start near a realistic BTC price
  let price = 42_000;

  // 4H bars starting 2024-01-01 00:00 UTC
  const startTime = 1704067200; // 2024-01-01T00:00:00Z
  const barSeconds = 4 * 3600;

  const bars: OHLCV[] = [];

  for (let i = 0; i < numBars; i++) {
    const logReturn = mu + sigma * randn();
    const nextClose = price * Math.exp(logReturn);

    // Intrabar noise: high/low spread proportional to vol
    const spread = price * annualVol * Math.sqrt(dt) * (1 + rand() * 2);
    const high = Math.max(price, nextClose) + spread * rand();
    const low  = Math.min(price, nextClose) - spread * rand();

    bars.push({
      time:   startTime + i * barSeconds,
      open:   +price.toFixed(2),
      high:   +high.toFixed(2),
      low:    +low.toFixed(2),
      close:  +nextClose.toFixed(2),
      volume: +(1000 + rand() * 4000).toFixed(2),
    });

    price = nextClose;
  }

  return bars;
}
