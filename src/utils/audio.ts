/*
  Match-night sound design, synthesised with Web Audio (no audio files to load).

  Signal chain: every voice -> dry bus + a short stadium reverb -> gentle compressor
  -> master volume. The compressor keeps stacked layers (knock + fanfare + crowd)
  from clipping on laptop and projector speakers.

  Cues:
    playerReveal  whoosh across the stereo field, sub impact, bright broadcast sting
    playBid       clean pluck that climbs a pentatonic scale as a lot heats up
    playOutbid    two soft falling notes (only on the phone that lost the lead)
    playSold      wooden gavel knock, brass fanfare, a swell of applause
    playUnsold    muted, low two-note mallet
*/

const STORAGE_KEY = 'ipl_auction_sound';
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Settings {
  muted: boolean;
  volume: number;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { muted: !!s.muted, volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : 0.8 };
    }
  } catch {
    // Storage can be unavailable (private mode); fall back to defaults.
  }
  return { muted: false, volume: 0.8 };
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private settings: Settings = typeof window === 'undefined' ? { muted: false, volume: 0.8 } : loadSettings();
  private listeners = new Set<() => void>();

  constructor() {
    // Browsers only allow audio after a user gesture; wake the context on the first one.
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.ensure();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    }
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  get isMuted() {
    return this.settings.muted;
  }
  set isMuted(value: boolean) {
    this.update({ muted: value });
  }
  get volume() {
    return this.settings.volume;
  }
  set volume(value: number) {
    this.update({ volume: Math.min(1, Math.max(0, value)) });
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private update(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Non-critical.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.outputLevel(), this.ctx.currentTime, 0.02);
    this.listeners.forEach((fn) => fn());
  }

  private outputLevel() {
    return this.settings.muted ? 0 : this.settings.volume * 0.9;
  }

  // ─── Graph ─────────────────────────────────────────────────────────────────

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 12;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;

      const master = ctx.createGain();
      master.gain.value = this.outputLevel();
      comp.connect(master).connect(ctx.destination);

      const dry = ctx.createGain();
      dry.connect(comp);

      const reverb = ctx.createConvolver();
      reverb.buffer = this.impulse(ctx, 2.2, 3.2);
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      wet.connect(reverb).connect(comp);

      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.dry = dry;
      this.wet = wet;
      this.noise = noise;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // Stereo decaying-noise impulse: a small, bright hall.
  private impulse(ctx: AudioContext, seconds: number, decay: number) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  // Route a node to the dry bus plus some reverb, optionally panned.
  private out(node: AudioNode, reverb = 0.2, pan = 0) {
    const ctx = this.ctx!;
    let tail: AudioNode = node;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      tail = p;
    }
    tail.connect(this.dry!);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      tail.connect(send).connect(this.wet!);
    }
  }

  private ready(): AudioContext | null {
    if (this.settings.muted) return null;
    try {
      return this.ensure();
    } catch {
      return null;
    }
  }

  // One enveloped oscillator voice.
  private tone(
    t: number,
    freq: number,
    dur: number,
    opts: { wave?: OscillatorType; gain?: number; attack?: number; glideTo?: number; lowpass?: number; reverb?: number; pan?: number } = {},
  ) {
    const ctx = this.ctx!;
    const { wave = 'sine', gain = 0.2, attack = 0.005, glideTo, lowpass, reverb = 0.15, pan = 0 } = opts;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc.connect(env);
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node = node.connect(f);
    }
    this.out(node, reverb, pan);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // Filtered noise burst (whooshes, knocks, claps).
  private burst(
    t: number,
    dur: number,
    opts: { type?: BiquadFilterType; freq?: number; freqTo?: number; q?: number; gain?: number; attack?: number; reverb?: number; pan?: number; panTo?: number } = {},
  ) {
    const ctx = this.ctx!;
    const { type = 'bandpass', freq = 1000, freqTo, q = 1, gain = 0.3, attack = 0.002, reverb = 0.1, pan = 0, panTo } = opts;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const node: AudioNode = src.connect(f).connect(env);
    if (panTo !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(pan, t);
      p.pan.linearRampToValueAtTime(panTo, t + dur);
      node.connect(p);
      this.out(p, reverb);
    } else {
      this.out(node, reverb, pan);
    }
    src.start(t, Math.random() * 1.2);
    src.stop(t + dur + 0.05);
  }

  // Brass-like chord: detuned saws through a filter that opens on the attack.
  private brass(t: number, midis: number[], dur: number, gain = 0.05) {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(3200, t + 0.06);
    filter.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.03);
    env.gain.setTargetAtTime(0.55, t + 0.08, 0.15);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    filter.connect(env);
    this.out(env, 0.35);
    for (const m of midis) {
      for (const cents of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = hz(m);
        osc.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = gain;
        osc.connect(g).connect(filter);
        osc.start(t);
        osc.stop(t + dur + 0.05);
      }
    }
  }

  // ─── Cues ──────────────────────────────────────────────────────────────────

  /** A new player walks onto the stage. */
  playerReveal() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    // Whoosh sweeping left to right, with a rising undertone.
    this.burst(t, 0.55, { freq: 350, freqTo: 4200, q: 1.4, gain: 0.32, attack: 0.3, reverb: 0.2, pan: -0.7, panTo: 0.7 });
    this.tone(t, 180, 0.5, { gain: 0.05, attack: 0.35, glideTo: 360, reverb: 0 });
    // Impact.
    const hit = t + 0.5;
    this.tone(hit, 95, 0.55, { gain: 0.55, attack: 0.004, glideTo: 42, reverb: 0 });
    this.burst(hit, 0.12, { type: 'lowpass', freq: 900, gain: 0.25, reverb: 0.2 });
    // Sting: D major with an added 9th, bright and short.
    this.brass(hit, [62, 69, 74, 76, 78], 1.1, 0.035);
    this.tone(hit, hz(86), 0.9, { wave: 'triangle', gain: 0.05, reverb: 0.5 });
  }

  /** A bid lands. `step` is how many bids this lot has had; the pitch climbs with it. */
  playBid(step = 1) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const note = 74 + PENTATONIC[Math.min(Math.max(step - 1, 0), PENTATONIC.length - 1)];
    this.tone(t, hz(note), 0.22, { wave: 'triangle', gain: 0.22, attack: 0.003, reverb: 0.12 });
    this.tone(t, hz(note + 12), 0.12, { gain: 0.07, attack: 0.002, reverb: 0.1 });
    this.burst(t, 0.018, { type: 'highpass', freq: 3500, gain: 0.08, reverb: 0 });
  }

  /** Your team just lost the lead. */
  playOutbid() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    this.tone(t, hz(76), 0.2, { gain: 0.16, lowpass: 2400 });
    this.tone(t + 0.13, hz(72), 0.32, { gain: 0.16, lowpass: 2000 });
  }

  /** Hammer down. */
  playSold() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    // Gavel: wood crack + body thump.
    this.burst(t, 0.06, { freq: 1900, q: 4, gain: 0.7, reverb: 0.25 });
    this.tone(t, 820, 0.05, { wave: 'triangle', gain: 0.25, reverb: 0.2 });
    this.tone(t, 170, 0.28, { gain: 0.5, glideTo: 70, reverb: 0.15 });
    // Fanfare: V -> I.
    this.brass(t + 0.14, [67, 71, 74], 0.22, 0.04);
    this.brass(t + 0.36, [60, 64, 67, 72, 76], 1.6, 0.04);
    this.tone(t + 0.36, hz(84), 1.2, { wave: 'triangle', gain: 0.05, reverb: 0.5 });
    // Applause: randomised hand claps that swell and fade.
    const start = t + 0.3;
    const length = 2.4;
    for (let i = 0; i < 170; i++) {
      const at = start + Math.pow(Math.random(), 1.6) * length;
      const swell = Math.sin(Math.min(1, (at - start) / length) * Math.PI);
      this.burst(at, 0.012 + Math.random() * 0.01, {
        freq: 900 + Math.random() * 1600,
        q: 1.2,
        gain: 0.03 + 0.07 * swell * Math.random(),
        reverb: 0.3,
        pan: Math.random() * 1.6 - 0.8,
      });
    }
  }

  /** No bids. */
  playUnsold() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    this.burst(t, 0.08, { type: 'lowpass', freq: 500, gain: 0.2, reverb: 0.1 });
    this.tone(t, hz(55), 0.45, { wave: 'triangle', gain: 0.22, lowpass: 900, reverb: 0.25 });
    this.tone(t + 0.22, hz(51), 0.7, { wave: 'triangle', gain: 0.2, lowpass: 800, reverb: 0.3 });
  }

  /** Clock tick for the last seconds of a lot. Brighter and louder as it nears 1. */
  playTick(secondsLeft: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    const urgency = Math.min(1, Math.max(0, (6 - secondsLeft) / 5)); // 0 at 6s+, 1 at 1s
    // Wooden tick: short filtered click plus a tuned body that rises with urgency.
    this.burst(t, 0.02, { freq: 2600 + urgency * 1800, q: 6, gain: 0.12 + urgency * 0.14, reverb: 0.05 });
    this.tone(t, hz(81 + Math.round(urgency * 7)), 0.06, { wave: 'triangle', gain: 0.05 + urgency * 0.08, attack: 0.002, reverb: 0.05 });
    if (secondsLeft <= 1) this.tone(t, hz(93), 0.12, { gain: 0.06, attack: 0.002, reverb: 0.2 });
  }

  /** Auctioneer's call: "going once" (stage 1) / "going twice" (stage 2). */
  playGoing(stage: 1 | 2) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    // A falling two-tone chime, a step higher and a touch louder for "twice".
    const root = stage === 2 ? 79 : 76;
    const gain = stage === 2 ? 0.2 : 0.16;
    this.tone(t, hz(root), 0.28, { wave: 'triangle', gain, attack: 0.004, reverb: 0.3 });
    this.tone(t, hz(root + 12), 0.2, { gain: gain * 0.3, attack: 0.003, reverb: 0.3 });
    this.tone(t + 0.16, hz(root - 5), 0.5, { wave: 'triangle', gain: gain * 0.9, attack: 0.004, reverb: 0.35 });
    // Soft wood knock underneath, a preview of the gavel.
    this.burst(t, 0.03, { freq: 1500, q: 3, gain: 0.12 + stage * 0.04, reverb: 0.15 });
  }

  /** Personal cue on the buyer's phone: warmer and more intimate than the stadium sold cue. */
  playYouBought() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    // Rising major arpeggio (C E G C) on a bell-like voice.
    [72, 76, 79, 84].forEach((m, i) => {
      this.tone(t + i * 0.085, hz(m), 0.7 - i * 0.08, { wave: 'triangle', gain: 0.17, attack: 0.004, reverb: 0.35 });
      this.tone(t + i * 0.085, hz(m + 12), 0.3, { gain: 0.05, attack: 0.003, reverb: 0.3 });
    });
    // Warm pad under the last note, plus a sparkle.
    this.brass(t + 0.26, [60, 67, 72, 76], 1.3, 0.028);
    this.burst(t + 0.26, 0.5, { type: 'highpass', freq: 6000, gain: 0.05, attack: 0.05, reverb: 0.5 });
  }
}

export const sounds = new SoundManager();
