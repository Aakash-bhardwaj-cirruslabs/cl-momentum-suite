import { generateBtcOhlcv } from './data';
import { computeIndicator, type IndicatorRow, type OHLCV } from './indicator';

// ── Colour palette (mirrors Pine Script) ─────────────────────────────────────
const C = {
  long:      '#26a69a',
  short:     '#ef5350',
  ema21:     '#26a69a',
  ema55:     'rgba(38,166,154,0.55)',
  rsiLine:   '#7b61ff',
  bg:        '#131722',
  panel:     '#1e222d',
  text:      '#d1d4dc',
  textMuted: '#787b86',
  border:    '#2a2e39',
  up:        '#26a69a',
  down:      '#ef5350',
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const bars: OHLCV[]        = generateBtcOhlcv(500);
const rows: IndicatorRow[] = computeIndicator(bars);

// ── DOM ───────────────────────────────────────────────────────────────────────
const root = document.getElementById('app')!;
root.innerHTML = `
  <div id="header">
    <span class="logo">CL·MS</span>
    <span class="title">CirrusLabs Momentum Suite</span>
    <span class="subtitle">BTC/USDT · 4H · EMA 21/55 + RSI(14) + ATR Gate</span>
    <div id="stats"></div>
  </div>
  <div id="chart-wrap">
    <canvas id="price-canvas"></canvas>
    <canvas id="rsi-canvas"></canvas>
  </div>
  <div id="legend"></div>
  <div id="signal-log"></div>
`;

// ── Stats bar ─────────────────────────────────────────────────────────────────
const longs  = rows.filter(r => r.longSignal).length;
const shorts = rows.filter(r => r.shortSignal).length;
const last   = rows[rows.length - 1];
const lastSig = rows.reduceRight(
  (acc, r) => acc || (r.longSignal ? '▲ LONG' : r.shortSignal ? '▼ SHORT' : null),
  null as string | null
) ?? '—';
const lastSigColor = lastSig === '▲ LONG' ? C.long : lastSig === '▼ SHORT' ? C.short : C.textMuted;

document.getElementById('stats')!.innerHTML = `
  <span class="stat">EMA21 <b>${last.ema21.toFixed(0)}</b></span>
  <span class="stat">EMA55 <b>${last.ema55.toFixed(0)}</b></span>
  <span class="stat">RSI <b style="color:${last.rsi >= 50 ? C.long : C.short}">${last.rsi.toFixed(1)}</b></span>
  <span class="stat">ATR <b style="color:${last.atr > last.atrSma ? C.long : C.short}">${last.atr.toFixed(0)}</b></span>
  <span class="stat">Signals <b style="color:${C.long}">▲${longs}</b> <b style="color:${C.short}">▼${shorts}</b></span>
  <span class="stat">Last <b style="color:${lastSigColor}">${lastSig}</b></span>
`;

// ── Legend ────────────────────────────────────────────────────────────────────
document.getElementById('legend')!.innerHTML = `
  <span class="leg"><span class="dot" style="background:${C.long}"></span>EMA 21</span>
  <span class="leg"><span class="dot" style="background:${C.ema55}"></span>EMA 55</span>
  <span class="leg"><span class="dot" style="background:${C.long}"></span>▲ Long signal</span>
  <span class="leg"><span class="dot" style="background:${C.short}"></span>▼ Short signal</span>
  <span class="leg"><span class="dot" style="background:${C.rsiLine}"></span>RSI(14)</span>
  <span class="leg"><span class="dot" style="background:rgba(123,97,255,0.7)"></span>ATR gate</span>
`;

// ── Signal log ────────────────────────────────────────────────────────────────
const signalRows = rows.filter(r => r.longSignal || r.shortSignal);
document.getElementById('signal-log')!.innerHTML = `
  <div class="log-header">Signal Log — ${signalRows.length} signals fired</div>
  <table>
    <thead><tr><th>Date (UTC)</th><th>Type</th><th>Close</th><th>EMA21</th><th>EMA55</th><th>RSI</th><th>ATR</th><th>Vol Gate</th></tr></thead>
    <tbody>
      ${signalRows.map(r => {
        const d  = new Date(r.time * 1000);
        const dt = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
        const bar = bars.find(b => b.time === r.time)!;
        const isLong = r.longSignal;
        return `<tr class="${isLong ? 'long-row' : 'short-row'}">
          <td>${dt}</td>
          <td><span class="badge ${isLong ? 'badge-long' : 'badge-short'}">${isLong ? '▲ LONG' : '▼ SHORT'}</span></td>
          <td>${bar.close.toFixed(0)}</td>
          <td>${r.ema21.toFixed(0)}</td>
          <td>${r.ema55.toFixed(0)}</td>
          <td style="color:${r.rsi >= 50 ? C.long : C.short}">${r.rsi.toFixed(1)}</td>
          <td>${r.atr.toFixed(0)}</td>
          <td><span class="badge ${r.atr > r.atrSma ? 'badge-long' : 'badge-short'}">${r.atr > r.atrSma ? 'ACTIVE' : 'QUIET'}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
`;

// ═══════════════════════════════════════════════════════════════════════════════
// Pure Canvas 2D chart renderer — no third-party lib, no locale dependencies
// ═══════════════════════════════════════════════════════════════════════════════

// ── Viewport state ────────────────────────────────────────────────────────────
let viewStart = Math.max(0, bars.length - 120); // show last 120 bars by default
let viewEnd   = bars.length;

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
  return `${mo} ${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

function mapY(v: number, lo: number, hi: number, top: number, bot: number): number {
  return top + (1 - (v - lo) / (hi - lo)) * (bot - top);
}

// ── Canvas setup ──────────────────────────────────────────────────────────────
const priceCanvas = document.getElementById('price-canvas') as HTMLCanvasElement;
const rsiCanvas   = document.getElementById('rsi-canvas')   as HTMLCanvasElement;
const pCtx = priceCanvas.getContext('2d')!;
const rCtx = rsiCanvas.getContext('2d')!;

// ── Draw price chart ──────────────────────────────────────────────────────────
function drawPrice() {
  const W = priceCanvas.width;
  const H = priceCanvas.height;
  if (W < 10 || H < 10) return;

  const PAD_L = 10, PAD_R = 70, PAD_T = 16, PAD_B = 32;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  pCtx.clearRect(0, 0, W, H);
  pCtx.fillStyle = C.bg;
  pCtx.fillRect(0, 0, W, H);

  const slice = bars.slice(viewStart, viewEnd);
  const rSlice = rows.slice(viewStart, viewEnd);
  if (!slice.length) return;

  const lo = Math.min(...slice.map(b => b.low))  * 0.998;
  const hi = Math.max(...slice.map(b => b.high)) * 1.002;

  const n    = slice.length;
  const barW = Math.max(1, Math.floor(plotW / n));
  const gap  = Math.max(0, Math.floor(barW * 0.15));
  const body = Math.max(1, barW - gap * 2);

  // ── Grid ──────────────────────────────────────────────────────────────────
  pCtx.strokeStyle = C.border;
  pCtx.lineWidth   = 0.5;
  const priceSteps = 6;
  for (let i = 0; i <= priceSteps; i++) {
    const v = lo + (hi - lo) * (i / priceSteps);
    const y = Math.round(mapY(v, lo, hi, PAD_T, PAD_T + plotH)) + 0.5;
    pCtx.beginPath(); pCtx.moveTo(PAD_L, y); pCtx.lineTo(W - PAD_R, y); pCtx.stroke();
    pCtx.fillStyle = C.textMuted;
    pCtx.font = '10px monospace';
    pCtx.textAlign = 'left';
    pCtx.fillText(v >= 1000 ? v.toFixed(0) : v.toFixed(2), W - PAD_R + 4, y + 3);
  }

  // ── Time axis ─────────────────────────────────────────────────────────────
  const timeStep = Math.ceil(n / 6);
  pCtx.fillStyle  = C.textMuted;
  pCtx.font       = '10px monospace';
  pCtx.textAlign  = 'center';
  for (let i = 0; i < n; i += timeStep) {
    const x = PAD_L + i * barW + barW / 2;
    pCtx.fillText(fmtDate(slice[i].time), x, H - 6);
  }

  // ── Candles ───────────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const b  = slice[i];
    const x  = PAD_L + i * barW;
    const cx = x + barW / 2;
    const isUp = b.close >= b.open;
    const col  = isUp ? C.up : C.down;

    const yHigh  = mapY(b.high,  lo, hi, PAD_T, PAD_T + plotH);
    const yLow   = mapY(b.low,   lo, hi, PAD_T, PAD_T + plotH);
    const yOpen  = mapY(b.open,  lo, hi, PAD_T, PAD_T + plotH);
    const yClose = mapY(b.close, lo, hi, PAD_T, PAD_T + plotH);

    pCtx.strokeStyle = col;
    pCtx.lineWidth   = 1;
    pCtx.beginPath();
    pCtx.moveTo(Math.round(cx), Math.round(yHigh));
    pCtx.lineTo(Math.round(cx), Math.round(yLow));
    pCtx.stroke();

    pCtx.fillStyle = col;
    const bodyTop = Math.min(yOpen, yClose);
    const bodyH   = Math.max(1, Math.abs(yClose - yOpen));
    pCtx.fillRect(Math.round(x + gap), Math.round(bodyTop), body, Math.ceil(bodyH));
  }

  // ── EMA lines ─────────────────────────────────────────────────────────────
  function drawLine(vals: number[], color: string, dash: number[]) {
    pCtx.strokeStyle = color;
    pCtx.lineWidth   = 1.5;
    pCtx.setLineDash(dash);
    pCtx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (isNaN(vals[i])) continue;
      const x = PAD_L + i * barW + barW / 2;
      const y = mapY(vals[i], lo, hi, PAD_T, PAD_T + plotH);
      if (!started) { pCtx.moveTo(x, y); started = true; }
      else pCtx.lineTo(x, y);
    }
    pCtx.stroke();
    pCtx.setLineDash([]);
  }

  drawLine(rSlice.map(r => r.ema21), C.ema21, []);
  drawLine(rSlice.map(r => r.ema55), C.ema55, [4, 3]);

  // ── Signal markers ────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const r = rSlice[i];
    if (!r.longSignal && !r.shortSignal) continue;
    const b  = slice[i];
    const x  = PAD_L + i * barW + barW / 2;
    const isLong = r.longSignal;
    const markerY = isLong
      ? mapY(b.low,  lo, hi, PAD_T, PAD_T + plotH) + 12
      : mapY(b.high, lo, hi, PAD_T, PAD_T + plotH) - 12;

    pCtx.fillStyle = isLong ? C.long : C.short;
    pCtx.font      = '14px sans-serif';
    pCtx.textAlign = 'center';
    pCtx.fillText(isLong ? '▲' : '▼', x, markerY);
  }

  // ── Chart title ───────────────────────────────────────────────────────────
  pCtx.fillStyle  = C.text;
  pCtx.font       = 'bold 11px sans-serif';
  pCtx.textAlign  = 'left';
  pCtx.fillText('BTC/USDT · 4H', PAD_L + 4, PAD_T + 12);
}

// ── Draw RSI chart ────────────────────────────────────────────────────────────
function drawRsi() {
  const W = rsiCanvas.width;
  const H = rsiCanvas.height;
  if (W < 10 || H < 10) return;

  const PAD_L = 10, PAD_R = 70, PAD_T = 8, PAD_B = 28;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  rCtx.clearRect(0, 0, W, H);
  rCtx.fillStyle = C.bg;
  rCtx.fillRect(0, 0, W, H);

  const slice  = bars.slice(viewStart, viewEnd);
  const rSlice = rows.slice(viewStart, viewEnd);
  if (!slice.length) return;

  const n    = slice.length;
  const barW = Math.max(1, Math.floor(plotW / n));

  const RSI_LO = 0, RSI_HI = 100;

  // ── Grid lines at 30 / 50 / 70 ────────────────────────────────────────────
  [[30, 'rgba(38,166,154,0.3)'], [50, 'rgba(255,255,255,0.2)'], [70, 'rgba(239,83,80,0.3)']].forEach(([v, col]) => {
    const y = Math.round(mapY(v as number, RSI_LO, RSI_HI, PAD_T, PAD_T + plotH)) + 0.5;
    rCtx.strokeStyle = col as string;
    rCtx.lineWidth   = 0.8;
    rCtx.setLineDash([4, 3]);
    rCtx.beginPath(); rCtx.moveTo(PAD_L, y); rCtx.lineTo(W - PAD_R, y); rCtx.stroke();
    rCtx.setLineDash([]);
    rCtx.fillStyle  = C.textMuted;
    rCtx.font       = '10px monospace';
    rCtx.textAlign  = 'left';
    rCtx.fillText(String(v), W - PAD_R + 4, y + 3);
  });

  // ── ATR histogram (scaled to RSI panel height, bottom 30%) ────────────────
  const atrVals = rSlice.map(r => r.atr).filter(v => !isNaN(v));
  const atrMax  = Math.max(...atrVals) * 1.05;
  const atrPanelTop = PAD_T + plotH * 0.72;

  for (let i = 0; i < n; i++) {
    const r = rSlice[i];
    if (isNaN(r.atr)) continue;
    const x   = PAD_L + i * barW;
    const pct = r.atr / atrMax;
    const bH  = Math.max(1, pct * (H - atrPanelTop - PAD_B));
    rCtx.fillStyle = r.atr > r.atrSma ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.3)';
    rCtx.fillRect(Math.round(x), Math.round(H - PAD_B - bH), Math.max(1, barW - 1), Math.ceil(bH));
  }

  // ── RSI line ──────────────────────────────────────────────────────────────
  rCtx.strokeStyle = C.rsiLine;
  rCtx.lineWidth   = 1.5;
  rCtx.beginPath();
  let started = false;
  for (let i = 0; i < n; i++) {
    const r = rSlice[i];
    if (isNaN(r.rsi)) continue;
    const x = PAD_L + i * barW + barW / 2;
    const y = mapY(r.rsi, RSI_LO, RSI_HI, PAD_T, PAD_T + plotH);
    if (!started) { rCtx.moveTo(x, y); started = true; }
    else rCtx.lineTo(x, y);
  }
  rCtx.stroke();

  // ── Signal dots on RSI ────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const r = rSlice[i];
    if (!r.longSignal && !r.shortSignal) continue;
    const x = PAD_L + i * barW + barW / 2;
    const y = mapY(r.rsi, RSI_LO, RSI_HI, PAD_T, PAD_T + plotH);
    rCtx.beginPath();
    rCtx.arc(x, y, 4, 0, Math.PI * 2);
    rCtx.fillStyle = r.longSignal ? C.long : C.short;
    rCtx.fill();
  }

  // ── Time axis ─────────────────────────────────────────────────────────────
  const timeStep = Math.ceil(n / 6);
  rCtx.fillStyle  = C.textMuted;
  rCtx.font       = '10px monospace';
  rCtx.textAlign  = 'center';
  for (let i = 0; i < n; i += timeStep) {
    const x = PAD_L + i * barW + barW / 2;
    rCtx.fillText(fmtDate(slice[i].time), x, H - 6);
  }

  // ── Panel label ───────────────────────────────────────────────────────────
  rCtx.fillStyle  = C.text;
  rCtx.font       = 'bold 10px sans-serif';
  rCtx.textAlign  = 'left';
  rCtx.fillText('RSI(14)  ATR gate', PAD_L + 4, PAD_T + 10);
}

// ── Resize canvases to fill their containers ──────────────────────────────────
function sizeCanvases() {
  // Use the actual viewport height minus the fixed chrome so we always get a
  // concrete, non-zero height even before the flex layout has settled.
  // Fixed chrome: 48px header + 28px legend + 200px signal-log = 276px
  const FIXED_H = 48 + 28 + 200;
  const W       = window.innerWidth;
  const totalH  = Math.max(window.innerHeight - FIXED_H, 300);

  const priceH = Math.round(totalH * 0.68);
  const rsiH   = totalH - priceH;

  priceCanvas.width  = W;
  priceCanvas.height = priceH;
  priceCanvas.style.width  = W + 'px';
  priceCanvas.style.height = priceH + 'px';

  rsiCanvas.width  = W;
  rsiCanvas.height = rsiH;
  rsiCanvas.style.width  = W + 'px';
  rsiCanvas.style.height = rsiH + 'px';
}

function redraw() { drawPrice(); drawRsi(); }

function init() {
  sizeCanvases();
  redraw();
}

// ── Scroll / zoom via mouse wheel ─────────────────────────────────────────────
priceCanvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  const n = viewEnd - viewStart;
  if (e.ctrlKey || e.metaKey) {
    // zoom
    const delta = Math.round(n * 0.1 * Math.sign(e.deltaY));
    const newN  = clamp(n + delta, 20, bars.length);
    const diff  = newN - n;
    viewStart = clamp(viewStart - Math.round(diff / 2), 0, bars.length - 20);
    viewEnd   = clamp(viewStart + newN, 20, bars.length);
  } else {
    // pan
    const step = Math.round(n * 0.1 * Math.sign(e.deltaY));
    viewStart  = clamp(viewStart + step, 0, bars.length - n);
    viewEnd    = clamp(viewEnd   + step, n, bars.length);
  }
  redraw();
}, { passive: false });

window.addEventListener('resize', () => { sizeCanvases(); redraw(); });

// ── Boot ──────────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
window.addEventListener('load', () => { if (!priceCanvas.width) init(); });

