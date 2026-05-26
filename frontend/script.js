/* ─── Dados base da Nintendo (NTDOY) ─────────────────────────────────────────
   Fonte: dados históricos reais aproximados para fins educacionais.
   A função tryFetchLiveData() tenta buscar dados ao vivo via proxy CORS.
──────────────────────────────────────────────────────────────────────────── */
const BASE_DATA = {
  symbol:        'NTDOY',
  name:          'Nintendo Co., Ltd.',
  price:         13.45,
  change:        0.23,
  changePercent: 1.74,
  open:          13.22,
  high:          13.58,
  low:           13.18,
  volume:        1_234_567,
  avgVolume:     987_654,
  marketCap:     17_800_000_000,
  pe:            18.5,
  eps:           0.73,
  dividendYield: 2.1,
  week52High:    16.89,
  week52Low:     10.12,
  history: [
    11.20, 11.45, 11.30, 11.80, 12.10, 11.90, 12.30, 12.50,
    12.20, 12.80, 13.00, 12.70, 13.10, 13.30, 13.00, 13.20,
    13.50, 13.30, 13.70, 13.40, 13.60, 13.20, 13.40, 13.10,
    13.30, 13.50, 13.20, 13.40, 13.22, 13.45
  ]
};

let currentData = { ...BASE_DATA, history: [...BASE_DATA.history] };
let coinCount   = 0;
let hudTimer    = 400;
let audioCtx    = null;

/* ─── Áudio 8-bit ────────────────────────────────────────────────────────── */
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playNote(ctx, freq, startTime, duration, volume = 0.22) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    const now = ctx.currentTime;

    if (type === 'coin') {
      // Moeda Mario clássica: B5 → E6
      playNote(ctx, 988,  now,       0.12);
      playNote(ctx, 1319, now + 0.1, 0.25);
    }

    if (type === 'powerup') {
      // Power-up: escala ascendente C5-E5-G5-C6
      [523, 659, 784, 1047].forEach((f, i) =>
        playNote(ctx, f, now + i * 0.08, 0.18)
      );
    }

    if (type === 'warning') {
      // Aviso: E5-C5-Ab4 descendente
      [659, 523, 415].forEach((f, i) =>
        playNote(ctx, f, now + i * 0.1, 0.2)
      );
    }

    if (type === 'achievement') {
      // Jingle curto de conquista
      [523, 659, 784, 659, 784, 1047].forEach((f, i) =>
        playNote(ctx, f, now + i * 0.07, 0.15)
      );
    }
  } catch (e) {
    // Áudio não disponível (política de autoplay)
  }
}

/* ─── Formatadores ───────────────────────────────────────────────────────── */
function fmt$(n)   { return '$' + Math.abs(n).toFixed(2); }
function fmtSign(n){ return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2); }

function fmtVol(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
  return n.toString();
}

function fmtCap(n) {
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n / 1e9).toFixed(1)  + 'B';
  return '$' + (n / 1e6).toFixed(0) + 'M';
}

function nowTime() {
  return new Date().toLocaleTimeString('pt-BR');
}

/* ─── Renderização de preço ──────────────────────────────────────────────── */
function renderPrice(d) {
  document.getElementById('price-display').textContent = fmt$(d.price);
  document.getElementById('hud-price').textContent     = fmt$(d.price);

  const up  = d.change >= 0;
  const el  = document.getElementById('price-change');
  el.textContent = `${up ? '▲' : '▼'} ${fmtSign(d.change)} (${up ? '+' : ''}${d.changePercent.toFixed(2)}%)`;
  el.className   = 'price-change ' + (up ? 'positive' : 'negative');

  document.getElementById('s-open').textContent   = fmt$(d.open);
  document.getElementById('s-high').textContent   = fmt$(d.high);
  document.getElementById('s-low').textContent    = fmt$(d.low);
  document.getElementById('s-volume').textContent = fmtVol(d.volume);
}

/* ─── Barra de 52 semanas (Mario runner) ─────────────────────────────────── */
function renderRange(d) {
  document.getElementById('r-low').textContent  = 'MIN ' + fmt$(d.week52Low);
  document.getElementById('r-high').textContent = 'MAX ' + fmt$(d.week52High);

  const raw      = (d.price - d.week52Low) / (d.week52High - d.week52Low) * 100;
  const clamped  = Math.max(2, Math.min(94, raw));

  document.getElementById('mario-fill').style.width   = clamped + '%';
  document.getElementById('mario-runner').style.left  = `calc(${clamped}% - 21px)`;
  document.getElementById('range-pct').textContent    = Math.round(raw);

  // Cor da barra reflete desempenho no ano
  const fill = document.getElementById('mario-fill');
  if (raw < 33)      fill.style.backgroundColor = '#e74c3c'; // vermelho – baixo no ano
  else if (raw < 66) fill.style.backgroundColor = '#e67e22'; // laranja – médio
  else               fill.style.backgroundColor = '#27ae60'; // verde – alto no ano
}

/* ─── RSI simples ────────────────────────────────────────────────────────── */
function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains  += diff;
    else          losses += Math.abs(diff);
  }
  const avg  = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avg / avgL);
}

/* ─── Renderização do sinal de análise ───────────────────────────────────── */
function renderSignal(d) {
  const ma   = d.history.reduce((a, b) => a + b, 0) / d.history.length;
  const vsMA = ((d.price - ma) / ma) * 100;
  const rsi  = calcRSI(d.history);

  document.getElementById('ind-ma').textContent  = fmt$(ma);
  document.getElementById('ind-rsi').textContent = Math.round(rsi);

  const vsEl = document.getElementById('ind-vs');
  vsEl.textContent  = (vsMA >= 0 ? '+' : '') + vsMA.toFixed(1) + '%';
  vsEl.style.color  = vsMA >= 0 ? '#27ae60' : '#e74c3c';

  // Lógica de sinal
  let signal, desc;
  if (d.changePercent > 0 && rsi < 65 && vsMA > 2) {
    signal = 'BUY';
    desc   = '★ MARIO ENCONTROU UMA ESTRELA! Momentum positivo, RSI saudável e acima da média histórica. Cenário favorável para entrada!';
  } else if (d.changePercent < -1.5 || rsi > 75 || vsMA < -5) {
    signal = 'SELL';
    desc   = '⚠ CUIDADO COM O BOWSER! Sinais de sobrecompra ou queda acentuada. Avalie reduzir exposição e proteger seus cogumelos!';
  } else {
    signal = 'HOLD';
    desc   = '○ O MARIO ESTÁ AVALIANDO O MAPA. Condições neutras — aguarde mais informações antes de avançar para o próximo mundo.';
  }

  const badge = document.getElementById('signal-badge');
  badge.textContent = signal;
  badge.className   = 'signal-badge ' + signal;
  document.getElementById('signal-desc').textContent = desc;
}

/* ─── Gráfico Canvas estilo pixel ────────────────────────────────────────── */
function drawChart(d) {
  const canvas = document.getElementById('stock-chart');
  const ctx    = canvas.getContext('2d');

  canvas.width  = canvas.offsetWidth  || 580;
  canvas.height = 160;

  const W   = canvas.width;
  const H   = canvas.height;
  const PAD = { top: 20, right: 16, bottom: 28, left: 52 };

  const prices = d.history;
  const minP   = Math.min(...prices) * 0.996;
  const maxP   = Math.max(...prices) * 1.004;

  const toX = i => PAD.left + (i / (prices.length - 1)) * (W - PAD.left - PAD.right);
  const toY = p => PAD.top  + ((maxP - p) / (maxP - minP)) * (H - PAD.top - PAD.bottom);

  // Fundo
  ctx.fillStyle = 'rgba(0, 0, 40, 0.6)';
  ctx.fillRect(0, 0, W, H);

  // Grid horizontal
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.12)';
  ctx.lineWidth   = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (i / 4) * (H - PAD.top - PAD.bottom);
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(W - PAD.right, y);
    ctx.stroke();

    const label = '$' + (maxP - (i / 4) * (maxP - minP)).toFixed(2);
    ctx.fillStyle  = 'rgba(255, 255, 255, 0.45)';
    ctx.font       = '7px "Press Start 2P", monospace';
    ctx.textAlign  = 'right';
    ctx.fillText(label, PAD.left - 4, y + 3);
  }

  // Área preenchida sob a linha
  ctx.fillStyle = 'rgba(255, 215, 0, 0.07)';
  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = Math.round(toX(i));
    const y = Math.round(toY(p));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(toX(prices.length - 1), H - PAD.bottom);
  ctx.lineTo(PAD.left, H - PAD.bottom);
  ctx.closePath();
  ctx.fill();

  // Linha de preço (estilo pixel — pixelated)
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  prices.forEach((p, i) => {
    const x = Math.round(toX(i));
    const y = Math.round(toY(p));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Linha de preço atual (tracejada verde)
  const curY = Math.round(toY(d.price));
  ctx.strokeStyle = 'rgba(39, 174, 96, 0.55)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(PAD.left, curY);
  ctx.lineTo(W - PAD.right, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Ponto final (preço atual)
  const lastX = toX(prices.length - 1);
  ctx.fillStyle   = '#27ae60';
  ctx.strokeStyle = '#000';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.arc(Math.round(lastX), curY, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Rótulos do eixo X
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font      = '6px "Press Start 2P", monospace';
  ctx.textAlign = 'center';

  for (let i = 0; i < prices.length; i += 5) {
    ctx.fillText('-' + (prices.length - 1 - i) + 'd', Math.round(toX(i)), H - 8);
  }
  ctx.fillText('HOJE', Math.round(toX(prices.length - 1)), H - 8);
}

/* ─── Blocos ? ───────────────────────────────────────────────────────────── */
function hitBlock(el, label, value, desc) {
  if (el.classList.contains('hit')) return;

  el.classList.add('bumping');
  setTimeout(() => el.classList.remove('bumping'), 420);

  spawnFlyingCoin(el);
  playSound('coin');

  coinCount++;
  updateCoinHUD();

  setTimeout(() => {
    el.classList.add('hit');
    el.querySelector('.qblock-q').style.display  = 'none';
    const rev = el.querySelector('.qblock-reveal');
    rev.style.display = 'flex';

    checkAllBlocksHit();
  }, 290);
}

function spawnFlyingCoin(blockEl) {
  const rect = blockEl.getBoundingClientRect();
  const coin = document.createElement('div');
  coin.className    = 'flying-coin';
  coin.style.left   = (rect.left + rect.width / 2 - 10) + 'px';
  coin.style.top    = (rect.top + window.scrollY) + 'px';
  document.body.appendChild(coin);
  setTimeout(() => coin.remove(), 800);
}

function checkAllBlocksHit() {
  const blocks = document.querySelectorAll('.qblock');
  const allHit = [...blocks].every(b => b.classList.contains('hit'));
  if (allHit) {
    setTimeout(() => {
      playSound('achievement');
      showAchievement(
        'TODOS OS BLOCOS REVELADOS! Você descobriu todos os segredos do Reino Mushroom da Nintendo!'
      );
    }, 350);
  }
}

function updateCoinHUD() {
  document.getElementById('hud-coins').textContent = String(coinCount).padStart(2, '0');
}

/* ─── Conquistas ─────────────────────────────────────────────────────────── */
function showAchievement(text) {
  const popup = document.getElementById('ach-popup');
  document.getElementById('ach-text').textContent = text;
  popup.style.display = 'block';
  popup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => { popup.style.display = 'none'; }, 6000);
}

/* ─── Atualização de dados (simulação ao vivo) ───────────────────────────── */
function refreshData() {
  const btn = document.querySelector('.btn');
  btn.textContent = '⏳ CARREGANDO...';
  btn.disabled    = true;

  setTimeout(() => {
    const variation   = (Math.random() - 0.46) * 0.035; // leve viés positivo
    const newPrice    = parseFloat((currentData.price * (1 + variation)).toFixed(2));
    const newChange   = parseFloat((newPrice - currentData.open).toFixed(2));
    const newChgPct   = parseFloat(((newChange / currentData.open) * 100).toFixed(2));

    currentData = {
      ...currentData,
      price:         newPrice,
      change:        newChange,
      changePercent: newChgPct,
      high:          Math.max(currentData.high, newPrice),
      low:           Math.min(currentData.low,  newPrice),
      volume:        Math.round(currentData.avgVolume * (0.7 + Math.random() * 0.9)),
      history:       [...currentData.history.slice(1), newPrice]
    };

    renderPrice(currentData);
    renderRange(currentData);
    renderSignal(currentData);
    drawChart(currentData);

    document.getElementById('upd-time').textContent = nowTime();

    // Coins extras por atualização
    coinCount += Math.floor(Math.random() * 4) + 1;
    updateCoinHUD();

    // Som direcional
    if (newChange >= 0) playSound('powerup');
    else                playSound('warning');

    // Conquista em movimentos expressivos
    if (Math.abs(newChgPct) > 2) {
      const msg = newChgPct > 0
        ? `POWER UP! Nintendo subiu ${newChgPct.toFixed(2)}% — Mario coletou uma estrela!`
        : `ATENÇÃO! Nintendo caiu ${Math.abs(newChgPct).toFixed(2)}% — Bowser está atacando!`;
      showAchievement(msg);
    }

    btn.textContent = '▶ ATUALIZAR DADOS';
    btn.disabled    = false;
  }, 900);
}

/* ─── Fonte 1: Backend local (FastAPI em localhost:8000) ─────────────────── */
async function tryFetchFromBackend() {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 4000);

  try {
    const resp = await fetch('http://localhost:8000/api/stock/NTDOY', { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const d = await resp.json();
    if (!d.price) throw new Error('Resposta inválida');

    currentData = {
      ...BASE_DATA,
      ...d,
      history: d.history?.length >= 5 ? d.history : BASE_DATA.history,
    };

    setBadge('● BACKEND LOCAL', '#2438C0');
    console.info('[Nintendo Stock Quest] Backend local conectado.');
    return true;
  } catch (e) {
    clearTimeout(tid);
    console.info('[Nintendo Stock Quest] Backend local indisponível —', e.message);
    return false;
  }
}

/* ─── Fonte 2: Yahoo Finance via proxy CORS (fallback) ───────────────────── */
async function tryFetchLiveData() {
  const targetUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/NTDOY?interval=1d&range=1mo&includePrePost=false';
  const proxyUrl  = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 6000);

  try {
    const resp = await fetch(proxyUrl, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    const json   = await resp.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error('Formato inesperado');

    const meta      = result.meta;
    const closes    = result.indicators?.quote?.[0]?.close ?? [];
    const clean     = closes.filter(v => v != null);
    const prevClose = meta.chartPreviousClose || meta.previousClose || BASE_DATA.open;
    const price     = meta.regularMarketPrice ?? BASE_DATA.price;

    currentData = {
      ...BASE_DATA,
      price,
      change:        parseFloat((price - prevClose).toFixed(2)),
      changePercent: parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)),
      open:          meta.regularMarketOpen       ?? BASE_DATA.open,
      high:          meta.regularMarketDayHigh    ?? BASE_DATA.high,
      low:           meta.regularMarketDayLow     ?? BASE_DATA.low,
      volume:        meta.regularMarketVolume     ?? BASE_DATA.volume,
      avgVolume:     meta.averageDailyVolume10Day ?? BASE_DATA.avgVolume,
      week52High:    meta.fiftyTwoWeekHigh        ?? BASE_DATA.week52High,
      week52Low:     meta.fiftyTwoWeekLow         ?? BASE_DATA.week52Low,
      history:       clean.length >= 5 ? clean.slice(-30) : BASE_DATA.history,
    };

    setBadge('● DADOS AO VIVO', '#27ae60');
    console.info('[Nintendo Stock Quest] Proxy CORS conectado.');
    return true;
  } catch (e) {
    clearTimeout(tid);
    console.info('[Nintendo Stock Quest] Proxy indisponível — usando dados simulados.');
    setBadge('○ DADOS SIMULADOS', '#e67e22');
    return false;
  }
}

function setBadge(text, color) {
  const el = document.getElementById('live-badge');
  if (el) { el.textContent = text; el.style.color = color; }
}

/* ─── HUD Timer (contador regressivo estilo Mario) ───────────────────────── */
function startHUDTimer() {
  setInterval(() => {
    hudTimer = hudTimer > 0 ? hudTimer - 1 : 400;
    document.getElementById('hud-time').textContent = String(hudTimer).padStart(3, '0');
  }, 1000);
}

/* ─── Inicialização ──────────────────────────────────────────────────────── */
async function init() {
  renderPrice(currentData);
  renderRange(currentData);
  renderSignal(currentData);
  document.getElementById('upd-time').textContent = nowTime();

  startHUDTimer();
  setTimeout(() => drawChart(currentData), 120);

  // Ordem de prioridade:
  //   1. Backend local (FastAPI) — dados reais sem CORS
  //   2. Proxy CORS (Yahoo Finance)
  //   3. Dados simulados (fallback final)
  const gotData = (await tryFetchFromBackend()) || (await tryFetchLiveData());

  if (gotData) {
    renderPrice(currentData);
    renderRange(currentData);
    renderSignal(currentData);
    drawChart(currentData);
    document.getElementById('upd-time').textContent = nowTime();
  }

  setInterval(refreshData, 60_000);
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', () => drawChart(currentData));
