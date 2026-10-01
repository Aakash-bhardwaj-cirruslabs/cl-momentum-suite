/** Exact port of the CirrusLabs Momentum Suite Pine Script v5 logic */

export interface OHLCV {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorRow {
  time: number;
  ema21: number;
  ema55: number;
  rsi: number;
  atr: number;
  atrSma: number;
  isBull: boolean;
  longSignal: boolean;
  shortSignal: boolean;
}

// ── EMA ──────────────────────────────────────────────────────────────────────
// Pine's ta.ema uses the standard Wilder/exponential multiplier: k = 2/(len+1)
// Seed: first value is the SMA of the first `len` bars (Pine default).
export function calcEma(closes: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out: number[] = new Array(closes.length).fill(NaN);
  // Find first full window
  let seedSum = 0;
  for (let i = 0; i < len; i++) seedSum += closes[i];
  out[len - 1] = seedSum / len;
  for (let i = len; i < closes.length; i++) {
    out[i] = closes[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// ── RSI ───────────────────────────────────────────────────────────────────────
// Pine's ta.rsi uses Wilder smoothing (RMA = EMA with k=1/len).
export function calcRsi(closes: number[], len: number): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < len + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;

  // Seed with simple average of first `len` changes
  for (let i = 1; i <= len; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= len;
  avgLoss /= len;

  const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  out[len] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  // Wilder smoothing for the rest
  for (let i = len + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (len - 1) + gain) / len;
    avgLoss = (avgLoss * (len - 1) + loss) / len;
    const rs2 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs2);
  }
  return out;
}

// ── ATR ───────────────────────────────────────────────────────────────────────
// Pine's ta.atr uses RMA (Wilder smoothing) of true range.
export function calcAtr(bars: OHLCV[], len: number): number[] {
  const n = bars.length;
  const out: number[] = new Array(n).fill(NaN);
  if (n < 2) return out;

  // True range series
  const tr: number[] = new Array(n).fill(NaN);
  tr[0] = bars[0].high - bars[0].low;
  for (let i = 1; i < n; i++) {
    const hl = bars[i].high - bars[i].low;
    const hc = Math.abs(bars[i].high - bars[i - 1].close);
    const lc = Math.abs(bars[i].low - bars[i - 1].close);
    tr[i] = Math.max(hl, hc, lc);
  }

  // Seed: simple average of first `len` TR values
  let seed = 0;
  for (let i = 0; i < len; i++) seed += tr[i];
  out[len - 1] = seed / len;

  // Wilder smoothing
  for (let i = len; i < n; i++) {
    out[i] = (out[i - 1] * (len - 1) + tr[i]) / len;
  }
  return out;
}

// ── SMA ───────────────────────────────────────────────────────────────────────
export function calcSma(values: number[], len: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = len - 1; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - len + 1; j <= i; j++) {
      if (!isNaN(values[j])) { sum += values[j]; count++; }
    }
    if (count === len) out[i] = sum / len;
  }
  return out;
}

// ── CROSSOVER / CROSSUNDER ────────────────────────────────────────────────────
// Pine: crossover(a,b) = a[0]>b[0] and a[1]<=b[1]
function crossover(a: number[], b: number[], i: number): boolean {
  if (i < 1) return false;
  return a[i] > b[i] && a[i - 1] <= b[i - 1];
}
function crossunder(a: number[], b: number[], i: number): boolean {
  if (i < 1) return false;
  return a[i] < b[i] && a[i - 1] >= b[i - 1];
}

// ── MAIN INDICATOR ────────────────────────────────────────────────────────────
export interface IndicatorOptions {
  emaFastLen?: number;   // default 21
  emaSlowLen?: number;   // default 55
  rsiLen?: number;       // default 14
  rsiMidline?: number;   // default 50
  atrLen?: number;       // default 14
  atrSmaLen?: number;    // default 20
  useRsiFilter?: boolean; // default true
  useAtrFilter?: boolean; // default true
}

export function computeIndicator(
  bars: OHLCV[],
  opts: IndicatorOptions = {}
): IndicatorRow[] {
  const {
    emaFastLen = 21,
    emaSlowLen = 55,
    rsiLen = 14,
    rsiMidline = 50,
    atrLen = 14,
    atrSmaLen = 20,
    useRsiFilter = true,
    useAtrFilter = true,
  } = opts;

  const closes = bars.map((b) => b.close);
  const ema21 = calcEma(closes, emaFastLen);
  const ema55 = calcEma(closes, emaSlowLen);
  const rsi = calcRsi(closes, rsiLen);
  const atr = calcAtr(bars, atrLen);
  const atrSma = calcSma(atr, atrSmaLen);

  const result: IndicatorRow[] = [];

  for (let i = 0; i < bars.length; i++) {
    const e21 = ema21[i];
    const e55 = ema55[i];
    const r = rsi[i];
    const a = atr[i];
    const as = atrSma[i];

    if (isNaN(e21) || isNaN(e55) || isNaN(r) || isNaN(a) || isNaN(as)) {
      result.push({
        time: bars[i].time,
        ema21: e21, ema55: e55, rsi: r, atr: a, atrSma: as,
        isBull: false, longSignal: false, shortSignal: false,
      });
      continue;
    }

    const isBull = e21 > e55;
    const rawLong = crossover(ema21, ema55, i);
    const rawShort = crossunder(ema21, ema55, i);

    const rsiLongOk = useRsiFilter ? r >= rsiMidline : true;
    const rsiShortOk = useRsiFilter ? r <= rsiMidline : true;
    const atrOk = useAtrFilter ? a > as : true;

    const longSignal = rawLong && rsiLongOk && atrOk;
    const shortSignal = rawShort && rsiShortOk && atrOk;

    result.push({ time: bars[i].time, ema21: e21, ema55: e55, rsi: r, atr: a, atrSma: as, isBull, longSignal, shortSignal });
  }

  return result;
}
