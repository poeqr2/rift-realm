// /projects/sandbox/rift-realm/client/src/audio.js
// Synthetic SFX + simple ambient BGM via Web Audio API.
// No audio assets required — sounds are generated procedurally.

let ctx = null;
let masterGain = null;
let sfxGain = null;
let musicGain = null;

let bgmPlaying = false;
let bgmTimer = null;

const STORAGE_KEY = "rr_audio_v1";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { master: 0.7, sfx: 0.7, music: 0.35, muted: false };
    return { master: 0.7, sfx: 0.7, music: 0.35, muted: false, ...JSON.parse(raw) };
  } catch (_) { return { master: 0.7, sfx: 0.7, music: 0.35, muted: false }; }
}

let prefs = loadPrefs();

function savePrefs() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (_) {}
}

function ensureCtx() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  sfxGain = ctx.createGain();
  musicGain = ctx.createGain();
  sfxGain.connect(masterGain);
  musicGain.connect(masterGain);
  masterGain.connect(ctx.destination);
  applyVolumes();
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const m = prefs.muted ? 0 : prefs.master;
  masterGain.gain.value = m;
  sfxGain.gain.value = prefs.sfx;
  musicGain.gain.value = prefs.music;
}

export function getPrefs() { return { ...prefs }; }
export function setPrefs(next) {
  prefs = { ...prefs, ...next };
  savePrefs();
  applyVolumes();
}
export function toggleMute() { setPrefs({ muted: !prefs.muted }); return prefs.muted; }

// Browsers require a user gesture to resume the AudioContext.
export async function unlock() {
  ensureCtx();
  if (ctx && ctx.state === "suspended") {
    try { await ctx.resume(); } catch (_) {}
  }
}

// ── Tone helpers ───────────────────────────────────────────────────────────
function tone({ freq = 440, type = "sine", duration = 0.12, volume = 0.4, attack = 0.005, release = 0.08, slideTo = null, dest = sfxGain }) {
  if (!ensureCtx()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  if (slideTo != null) {
    osc.frequency.linearRampToValueAtTime(slideTo, t0 + duration);
  }
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(volume, t0 + attack);
  g.gain.setValueAtTime(volume, t0 + duration - release);
  g.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(g); g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst({ duration = 0.15, volume = 0.35, hp = 800, lp = 4000, dest = sfxGain }) {
  if (!ensureCtx()) return;
  const t0 = ctx.currentTime;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hpNode = ctx.createBiquadFilter(); hpNode.type = "highpass"; hpNode.frequency.value = hp;
  const lpNode = ctx.createBiquadFilter(); lpNode.type = "lowpass"; lpNode.frequency.value = lp;
  const g = ctx.createGain(); g.gain.value = volume;
  src.connect(hpNode); hpNode.connect(lpNode); lpNode.connect(g); g.connect(dest);
  src.start(t0);
}

// ── SFX library ────────────────────────────────────────────────────────────
export const sfx = {
  click()    { tone({ freq: 540, type: "square", duration: 0.05, volume: 0.18 }); },
  hover()    { tone({ freq: 700, type: "sine",   duration: 0.04, volume: 0.10 }); },
  attack()   { tone({ freq: 380, type: "triangle", duration: 0.06, volume: 0.18, slideTo: 220 });
               noiseBurst({ duration: 0.06, volume: 0.10, hp: 1500, lp: 5000 }); },
  crit()     { tone({ freq: 880, type: "sawtooth", duration: 0.13, volume: 0.30, slideTo: 220 });
               noiseBurst({ duration: 0.10, volume: 0.20, hp: 800, lp: 6000 }); },
  cast()     { tone({ freq: 480, type: "sine",   duration: 0.18, volume: 0.22, slideTo: 760 });
               tone({ freq: 240, type: "sine",   duration: 0.18, volume: 0.18, slideTo: 380 }); },
  heal()     { tone({ freq: 560, type: "sine", duration: 0.16, volume: 0.22 });
               tone({ freq: 880, type: "sine", duration: 0.20, volume: 0.18 }); },
  shield()   { tone({ freq: 320, type: "triangle", duration: 0.16, volume: 0.20, slideTo: 540 }); },
  death()    { tone({ freq: 220, type: "sawtooth", duration: 0.30, volume: 0.30, slideTo: 60 }); },
  revive()   { tone({ freq: 480, type: "sine", duration: 0.30, volume: 0.30, slideTo: 880 });
               tone({ freq: 720, type: "sine", duration: 0.30, volume: 0.20, slideTo: 1320 }); },
  victory()  {
    const t0 = ctx?.currentTime ?? 0;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => setTimeout(() => tone({ freq: f, type: "triangle", duration: 0.18, volume: 0.30 }), i * 110));
  },
  defeat()   {
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => setTimeout(() => tone({ freq: f, type: "triangle", duration: 0.20, volume: 0.30 }), i * 130));
  },
  starUp()   {
    const notes = [659.25, 783.99, 988.0];
    notes.forEach((f, i) => setTimeout(() => tone({ freq: f, type: "triangle", duration: 0.12, volume: 0.30 }), i * 80));
  },
  pickup()   { tone({ freq: 880, type: "sine", duration: 0.08, volume: 0.18 });
               tone({ freq: 1320, type: "sine", duration: 0.08, volume: 0.14 }); },
  notify()   { tone({ freq: 660, type: "sine", duration: 0.10, volume: 0.22, slideTo: 880 }); },
  scout()    { tone({ freq: 220, type: "triangle", duration: 0.18, volume: 0.22, slideTo: 440 });
               setTimeout(() => tone({ freq: 440, type: "triangle", duration: 0.18, volume: 0.18, slideTo: 660 }), 100); },
  matchFound() {
    const notes = [523.25, 659.25, 880];
    notes.forEach((f, i) => setTimeout(() => tone({ freq: f, type: "triangle", duration: 0.16, volume: 0.30 }), i * 100));
  },
};

// ── Ambient BGM ────────────────────────────────────────────────────────────
// Looping arpeggio over a deep drone. Uses musicGain bus.
const SCALE = [261.63, 329.63, 392.0, 493.88, 587.33, 659.25]; // C minor pentatonic-ish
let droneOsc1 = null, droneOsc2 = null, droneGain = null;

function startDrone() {
  if (!ensureCtx()) return;
  if (droneOsc1) return;
  droneOsc1 = ctx.createOscillator(); droneOsc1.type = "sine"; droneOsc1.frequency.value = 65.41; // C2
  droneOsc2 = ctx.createOscillator(); droneOsc2.type = "triangle"; droneOsc2.frequency.value = 98.0; // G2
  droneGain = ctx.createGain(); droneGain.gain.value = 0.06;
  droneOsc1.connect(droneGain); droneOsc2.connect(droneGain);
  droneGain.connect(musicGain);
  droneOsc1.start(); droneOsc2.start();
}

function stopDrone() {
  if (droneOsc1) { try { droneOsc1.stop(); } catch (_) {} droneOsc1.disconnect(); droneOsc1 = null; }
  if (droneOsc2) { try { droneOsc2.stop(); } catch (_) {} droneOsc2.disconnect(); droneOsc2 = null; }
  if (droneGain) { droneGain.disconnect(); droneGain = null; }
}

function playArpNote() {
  if (!ensureCtx() || !bgmPlaying) return;
  const note = SCALE[Math.floor(Math.random() * SCALE.length)];
  tone({ freq: note, type: "triangle", duration: 0.45, volume: 0.06, attack: 0.04, release: 0.30, dest: musicGain });
  bgmTimer = setTimeout(playArpNote, 400 + Math.random() * 400);
}

export function startBGM() {
  if (!ensureCtx() || bgmPlaying) return;
  bgmPlaying = true;
  startDrone();
  bgmTimer = setTimeout(playArpNote, 200);
}

export function stopBGM() {
  bgmPlaying = false;
  if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; }
  stopDrone();
}

// Play a built-in SFX by name; safe no-op if name missing or audio unsupported.
export function play(name) {
  if (prefs.muted) return;
  const fn = sfx[name];
  if (typeof fn === "function") { ensureCtx(); fn(); }
}

// Map server FX events to client SFX. Used by BattleArena.
export function playFromFx(ev) {
  if (prefs.muted) return;
  switch (ev.t) {
    case "atk":   play(ev.crit ? "crit" : "attack"); break;
    case "cast":  play("cast"); break;
    case "heal":  play("heal"); break;
    case "shield":
    case "shieldGain": play("shield"); break;
    case "death": play("death"); break;
    case "revive": play("revive"); break;
    default: break;
  }
}
