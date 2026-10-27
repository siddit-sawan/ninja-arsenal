// Procedural sound effects and a koto + taiko soundtrack (Web Audio, no files).
let ctx = null, master, sfxBus, musBus, noiseBuf;
let sfxOn = true, musOn = true, muted = false;

function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return !!ctx; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = 0.55; musBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  apply();
  return true;
}
function apply() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : 0.9, t, 0.03);
  sfxBus.gain.setTargetAtTime(sfxOn ? 1 : 0, t, 0.03);
  musBus.gain.setTargetAtTime(musOn ? 0.55 : 0, t, 0.05);
}
export const audio = {
  unlock: ensure,
  set(sfx, mus, mute) { sfxOn = sfx; musOn = mus; muted = mute; apply(); },
};

const now = () => ctx.currentTime;
function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function noise(t, dur, type, f0, f1, q, vol, out = sfxBus) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.008, vol, dur);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, type, f0, f1, dur, vol, a = 0.005, out = sfxBus) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, a, vol, dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + a + dur + 0.05);
}
const ok = () => ctx && sfxOn && !muted;

export const sfx = {
  swish(p = 1) { if (!ok()) return; const t = now(); noise(t, 0.16, 'bandpass', 700 * p, 3200 * p, 1.6, 0.35); },
  slice(big = 1) {
    if (!ok()) return; const t = now();
    noise(t, 0.12, 'bandpass', 1800, 5200, 2, 0.4);
    [2350, 3480, 5100].forEach((f, i) => tone(t, 'sine', f * (0.97 + Math.random() * 0.06), f, 0.35 + i * 0.05, 0.05 / (i + 1)));
    noise(t + 0.01, 0.18 * big, 'lowpass', 900, 200, 0.7, 0.45 * big);
    tone(t, 'sine', 160, 55, 0.18, 0.35 * big);
  },
  clang() {
    if (!ok()) return; const t = now();
    [523, 1240, 1870, 2730, 3950].forEach((f, i) => tone(t, i % 2 ? 'triangle' : 'sine', f, f * 0.99, 0.6 - i * 0.08, 0.09));
    noise(t, 0.05, 'highpass', 3000, 6000, 0.7, 0.4);
  },
  thud(v = 1) { if (!ok()) return; const t = now(); tone(t, 'sine', 110, 45, 0.16, 0.3 * v); noise(t, 0.08, 'lowpass', 600, 150, 0.7, 0.15 * v); },
  throwS() { if (!ok()) return; const t = now(); noise(t, 0.1, 'bandpass', 2000, 6000, 2.5, 0.28); },
  hurt() {
    if (!ok()) return; const t = now();
    tone(t, 'sawtooth', 140, 50, 0.35, 0.3); noise(t, 0.3, 'lowpass', 1400, 120, 0.8, 0.5); tone(t, 'sine', 70, 35, 0.4, 0.5);
  },
  coin() { if (!ok()) return; const t = now(); tone(t, 'square', 1320, 1320, 0.06, 0.05); tone(t + 0.06, 'square', 1980, 1980, 0.12, 0.05); },
  click() { if (!ok()) return; const t = now(); tone(t, 'triangle', 900, 600, 0.06, 0.12); },
  warn() { if (!ok()) return; const t = now(); tone(t, 'sine', 2600, 2600, 0.12, 0.06); tone(t + 0.09, 'sine', 3100, 3100, 0.15, 0.05); },
  roar() {
    if (!ok()) return; const t = now();
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(60, t + 1.3);
    const l = ctx.createOscillator(); l.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = 18; l.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = ctx.createGain(); env(g, t, 0.08, 0.5, 1.3);
    o.connect(f); f.connect(g); g.connect(sfxBus); o.start(t); l.start(t); o.stop(t + 1.5); l.stop(t + 1.5);
    noise(t, 1.2, 'lowpass', 500, 120, 1, 0.3);
  },
  ult() {
    if (!ok()) return; const t = now();
    noise(t, 0.9, 'bandpass', 300, 6000, 3, 0.4); tone(t, 'sawtooth', 110, 880, 0.9, 0.12);
    [0.95, 1.1, 1.25].forEach(d => this.sliceAt(t + d));
  },
  sliceAt(t) { if (!ok()) return; noise(t, 0.14, 'bandpass', 1500, 6000, 2, 0.45); tone(t, 'sine', 3300, 3300, 0.4, 0.05); },
  win() {
    if (!ok()) return; const t = now();
    [587, 698, 880, 1175].forEach((f, i) => { pluck(t + i * 0.11, f, 0.25, sfxBus); });
  },
  lose() { if (!ok()) return; const t = now(); [440, 349, 294, 220].forEach((f, i) => pluck(t + i * 0.18, f, 0.25, sfxBus)); },
};

// koto-like pluck
function pluck(t, f, vol, out) {
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(f * 1.012, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.003;
  const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 8, t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.8);
  const g = ctx.createGain(); env(g, t, 0.004, vol, 1.2);
  const g2 = ctx.createGain(); g2.gain.value = 0.35;
  o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(out);
  o.start(t); o2.start(t); o.stop(t + 1.3); o2.stop(t + 1.3);
}
function taiko(t, vol, pitch = 1) {
  tone(t, 'sine', 95 * pitch, 42 * pitch, 0.45, vol, 0.003, musBus);
  noise(t, 0.08, 'lowpass', 1200, 300, 0.8, vol * 0.5, musBus);
}
function rim(t, vol) { noise(t, 0.04, 'highpass', 2500, 4000, 1, vol, musBus); }

// In-scale (Japanese) on D: D Eb G A Bb
const SCALE = [0, 1, 5, 7, 8];
const note = (deg, oct) => 146.83 * Math.pow(2, (SCALE[((deg % 5) + 5) % 5] + 12 * (oct + Math.floor(deg / 5))) / 12);
let mode = 'off', step = 0, nextT = 0, timer = 0, phrase = [];
function newPhrase() { phrase = []; let d = 0; for (let i = 0; i < 16; i++) { d += [-2, -1, 1, 1, 2, 0][Math.floor(Math.random() * 6)]; d = Math.max(-2, Math.min(9, d)); phrase.push(Math.random() < (mode === 'menu' ? 0.38 : 0.5) ? d : null); } }
function tick() {
  if (!ctx || mode === 'off') return;
  const bpm = mode === 'boss' ? 132 : mode === 'battle' ? 112 : 76;
  const sp = 60 / bpm / 2;
  while (nextT < ctx.currentTime + 0.2) {
    const s = step % 16, t = nextT;
    if (musOn && !muted) {
      if (s === 0 && step % 64 === 0) newPhrase();
      const n = phrase[s];
      if (n !== null && n !== undefined) pluck(t, note(n, 1), mode === 'menu' ? 0.09 : 0.07, musBus);
      if (s % 8 === 0) pluck(t, note(0, 0), 0.08, musBus);
      if (mode !== 'menu') {
        const pat = mode === 'boss' ? [0, 3, 4, 6, 8, 10, 11, 12, 14] : [0, 6, 8, 11, 12];
        if (pat.includes(s)) taiko(t, s === 0 || s === 8 ? 0.42 : 0.28, s % 4 === 0 ? 1 : 1.3);
        if (s % 2 === 1) rim(t, 0.045);
      }
    }
    nextT += sp; step++;
  }
}
export function music(m) {
  if (!ensure()) return;
  if (m === mode) return;
  mode = m;
  if (!timer) timer = setInterval(tick, 50);
  nextT = ctx.currentTime + 0.05; step = 0; newPhrase();
}
