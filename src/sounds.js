// Toy sounds, synthesized with Web Audio so there are no audio files to ship.
// Cats hear high pitches well, so most of these sit in the 2–6 kHz range.
//
// Browsers keep audio muted until someone clicks or taps the page once, so
// the TV shows a prompt until `unlockAudio()` has run from a user gesture.

let ctx = null;

export function getAudioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

export function unlockAudio() {
  const c = getAudioContext();
  if (c.state !== "running") c.resume();
}

// For useSyncExternalStore: is audio allowed to play right now?
export function subscribeAudioState(cb) {
  const c = getAudioContext();
  c.addEventListener("statechange", cb);
  return () => c.removeEventListener("statechange", cb);
}
export const audioRunning = () => getAudioContext().state === "running";

const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// Short tone with a quick attack and exponential decay.
function tone(c, out, { type = "sine", t, dur, freqs, peak = 1 }) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqs[0], t);
  freqs
    .slice(1)
    .forEach((f, i) =>
      osc.frequency.linearRampToValueAtTime(
        f,
        t + (dur * (i + 1)) / (freqs.length - 1)
      )
    );
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.01, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBuffer(c) {
  const buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

const RECIPES = {
  // A few quick rising-then-falling squeaks.
  squeak(c, out, t) {
    const n = Math.floor(rand(1, 4));
    for (let i = 0; i < n; i++) {
      const base = rand(2800, 3600);
      tone(c, out, {
        t: t + i * rand(0.12, 0.2),
        dur: rand(0.06, 0.1),
        freqs: [base, base * 1.45, base * 1.1],
        peak: 0.5,
      });
    }
  },

  // Fast downward chirps, like a small songbird.
  chirp(c, out, t) {
    const n = Math.floor(rand(3, 6));
    for (let i = 0; i < n; i++) {
      tone(c, out, {
        t: t + i * rand(0.08, 0.12),
        dur: 0.06,
        freqs: [rand(5200, 6200), rand(2600, 3200)],
        peak: 0.4,
      });
    }
  },

  // Quick warble between two notes, like a trilling bird.
  trill(c, out, t) {
    const lo = rand(3000, 3400);
    const n = Math.floor(rand(8, 13));
    for (let i = 0; i < n; i++) {
      const f = i % 2 ? lo * 1.26 : lo;
      tone(c, out, { t: t + i * 0.045, dur: 0.04, freqs: [f, f], peak: 0.35 });
    }
  },

  // Pulsed high tone in short bursts.
  cricket(c, out, t) {
    for (let burst = 0; burst < 3; burst++) {
      for (let p = 0; p < 4; p++) {
        tone(c, out, {
          t: t + burst * 0.22 + p * 0.025,
          dur: 0.018,
          freqs: [4600, 4600],
          peak: 0.35,
        });
      }
    }
  },

  // Small jingle bell: inharmonic partials that ring out.
  bell(c, out, t) {
    const strikes = Math.floor(rand(2, 4));
    for (let s = 0; s < strikes; s++) {
      const st = t + s * rand(0.07, 0.14);
      for (const [f, peak] of [
        [2100, 0.3],
        [2870, 0.2],
        [4230, 0.15],
      ]) {
        tone(c, out, { t: st, dur: 0.5, freqs: [f, f], peak });
      }
    }
  },

  // Wobbly insect buzz.
  buzz(c, out, t) {
    const dur = rand(0.6, 1);
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const filter = c.createBiquadFilter();
    const g = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = rand(200, 260);
    lfo.frequency.value = rand(6, 11);
    lfoGain.gain.value = 25;
    filter.type = "lowpass";
    filter.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.08);
    g.gain.setValueAtTime(0.25, t + dur - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lfo.connect(lfoGain).connect(osc.frequency);
    osc.connect(filter).connect(g).connect(out);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur);
    lfo.stop(t + dur);
  },

  // Crinkly-bag crackle: lots of tiny filtered noise bursts.
  crinkle(c, out, t) {
    const buf = noiseBuffer(c);
    const n = Math.floor(rand(18, 30));
    for (let i = 0; i < n; i++) {
      const src = c.createBufferSource();
      const bp = c.createBiquadFilter();
      const g = c.createGain();
      const st = t + rand(0, 0.6);
      const dur = rand(0.01, 0.035);
      src.buffer = buf;
      bp.type = "bandpass";
      bp.frequency.value = rand(2500, 7000);
      bp.Q.value = 1.5;
      g.gain.setValueAtTime(rand(0.3, 0.8), st);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      src.connect(bp).connect(g).connect(out);
      src.start(st, rand(0, 0.4), dur + 0.01);
    }
  },
};

// Plays one burst of sound `id` at `volume` (0–100). No-op for "none".
export function playSound(id, volume) {
  const recipe = RECIPES[id];
  if (!recipe || volume <= 0) return;
  const c = getAudioContext();
  if (c.state !== "running") return;
  const out = c.createGain();
  out.gain.value = (volume / 100) ** 2; // perceptual-ish curve
  out.connect(c.destination);
  recipe(c, out, c.currentTime + 0.01);
}
