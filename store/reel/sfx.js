// Sound effects of the reel, synthesized offline (OfflineAudioContext), same palette as the Whozic reel.
// The instants tied to the edit come from the constants of reel.html (CHECKS, SEEN, STEPS, R_MAX,
// B_LUFF, ROLL), loaded before this file.
;(() => {
  const SR = 48000, DUR = 15
  // The compressor starts cold: without this pre-roll, the first impact comes out 10 dB under the next ones.
  const PRE = 0.5

  /** Instant the roll shows its k-th name (same curve as S4). */
  const rollAt = (k) => 7.55 + (R_MAX - 7.55) * (1 - (1 - k / ROLL) ** (1 / 2.4))

  const EVENTS = [
    ['hit', 0.0, { f: 130.81 }], ['hit', 0.6, { f: 164.81 }], ['hit', 1.2, { f: 196 }],
    ['riser', 1.25, { dur: 0.55 }],
    ['boom', 1.8], ['hit', 1.95, { f: 220, g: 0.6 }], ['hit', 2.15, { f: 261.63, g: 0.8 }],
    ['pop', 2.4, { g: 1.6 }], ['hit', 2.4, { f: 329.63, g: 0.7 }],
    ['whoosh', 2.75, { dur: 0.45, pan: 0.3 }], ['thud', 3.3, { g: 0.6 }],
    ['whoosh', 3.62, { dur: 0.35, pan: -0.3 }],
    ['pop', 3.95, { g: 0.7 }], ['pop', 4.03, { g: 0.7 }], ['pop', 4.11, { g: 0.7 }],
    ...CHECKS.map((t) => ['tap', t]), ...CHECKS.map((t, i) => ['pop', t, { g: 0.8 + 0.2 * i }]), ['ding', CHECKS[2] + 0.03],
    ['whoosh', 4.95, { dur: 0.4, pan: 0.5 }],
    ...SEEN.map((t) => ['pop', t]), ...STEPS.map((t) => ['tick', t]),
    ['stamp', 7.15], ['ding', 7.45],
    ['drumroll', 7.49, { n: 17 }],
    ...Array.from({ length: 10 }, (_, j) => ['tap', rollAt(ROLL - 10 + j)]),
    ['boom', R_MAX], ['reveal', R_MAX + 0.02],
    ['sting', B_LUFF], ['boom', B_LUFF, { g: 0.6 }],
    ['whoosh', 10.42, { dur: 0.4 }], ['thud', 10.85, { g: 1.3 }], ['thud', 11.0, { g: 0.4 }],
    ['swish', 11.35], ['swish', 12.2],
    ['whoosh', 12.25, { dur: 0.45, pan: -0.2 }], ['thud', 12.7, { g: 0.9 }], ['reveal', 12.72],
    ['shimmer', 13.05],
  ]

  function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

  window.__audio = async () => {
    const c = new OfflineAudioContext(2, SR * (DUR + PRE), SR)
    const R = rng(11)
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2
    const master = c.createGain(); master.gain.value = 0.9
    // high-pass: nothing under 55 Hz, room for a music bed under the effects
    const hpf = c.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = 55
    master.connect(hpf); hpf.connect(comp); comp.connect(c.destination)
    // a small shared reverb
    const verb = c.createConvolver()
    {
      const len = SR * 1.6, ir = c.createBuffer(2, len, SR)
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, 3) }
      verb.buffer = ir
    }
    const wet = c.createGain(); wet.gain.value = 0.22
    verb.connect(wet); wet.connect(master)
    function out(node, pan = 0, send = 0.5) {
      const p = c.createStereoPanner(); p.pan.value = pan
      node.connect(p); p.connect(master)
      const s = c.createGain(); s.gain.value = send; p.connect(s); s.connect(verb)
    }
    function tone({ freq, at = 0, dur = 0.2, type = 'triangle', gain = 0.1, glideTo, attack = 0.012, pan = 0, send = 0.5 }) {
      const osc = c.createOscillator(), g = c.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, at)
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur)
      if (attack > 0.05) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack) } else { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack) }
      g.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(dur, attack + 0.02))
      osc.connect(g); out(g, pan, send)
      osc.start(at); osc.stop(at + dur + 0.05)
    }
    function noise({ at = 0, dur = 0.08, gain = 0.06, filterFreq = 3000, filterType = 'bandpass', sweepTo, q = 1, attack = 0, pan = 0, send = 0.5 }) {
      const len = Math.ceil(SR * (dur + 0.05)), buf = c.createBuffer(1, len, SR), d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = R() * 2 - 1
      const src = c.createBufferSource(); src.buffer = buf
      const f = c.createBiquadFilter(); f.type = filterType; f.Q.value = q
      f.frequency.setValueAtTime(filterFreq, at)
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur)
      const g = c.createGain()
      if (attack) { g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + attack) } else g.gain.setValueAtTime(gain, at)
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      src.connect(f); f.connect(g); out(g, pan, send)
      src.start(at)
    }
    function kick(at, g = 1, from = 150, to = 42, dur = 0.38) {
      const osc = c.createOscillator(), gn = c.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(from, at); osc.frequency.exponentialRampToValueAtTime(to, at + 0.16)
      gn.gain.setValueAtTime(0.0001, at); gn.gain.exponentialRampToValueAtTime(0.9 * g, at + 0.004); gn.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      osc.connect(gn); out(gn, 0, 0.1)
      osc.start(at); osc.stop(at + dur + 0.05)
    }
    // presence in the mids: that is what cuts through laptop speakers
    function snap(at, g = 1) { noise({ at, dur: 0.06, gain: 1.4 * g, filterFreq: 2200, q: 0.7, send: 0.2 }) }
    const S = {
      hit(at, { f = 196, g = 1 }) {
        kick(at, g)
        snap(at, g)
        noise({ at, dur: 0.05, gain: 0.25 * g, filterFreq: 5000, filterType: 'highpass' })
        tone({ freq: f * 2, at, dur: 0.2, gain: 0.09 * g, type: 'sawtooth', send: 0.8 })
        tone({ freq: f * 3, at, dur: 0.18, gain: 0.05 * g, type: 'triangle', send: 0.8 })
        tone({ freq: f * 4, at, dur: 0.15, gain: 0.04 * g, type: 'sine', send: 0.8 })
      },
      boom(at, { g = 1 } = {}) {
        kick(at, 1.1 * g, 120, 32, 0.8)
        snap(at, 1.3 * g)
        noise({ at, dur: 0.9, gain: 0.22 * g, filterFreq: 900, filterType: 'lowpass', sweepTo: 120 })
        noise({ at, dur: 0.06, gain: 0.3 * g, filterFreq: 4000, filterType: 'highpass' })
      },
      riser(at, { dur = 0.5 }) {
        noise({ at, dur, gain: 0.35, filterFreq: 400, sweepTo: 6000, q: 1.2, attack: dur * 0.95, send: 0.4 })
        tone({ freq: 220, glideTo: 880, at, dur: dur + 0.03, type: 'sawtooth', gain: 0.05, attack: dur * 0.95, send: 0.4 })
      },
      whoosh(at, { dur = 0.35, pan = 0 }) {
        noise({ at, dur, gain: 0.5, filterFreq: 400, sweepTo: 4000, q: 0.8, attack: dur * 0.6, pan, send: 0.5 })
      },
      swish(at) {
        noise({ at: at - 0.03, dur: 0.24, gain: 0.4, filterFreq: 900, sweepTo: 5000, q: 1, attack: 0.1, send: 0.5 })
        tone({ freq: 1568, at: at + 0.2, dur: 0.12, type: 'sine', gain: 0.04 })
      },
      thud(at, { g = 1 } = {}) { kick(at, 0.8 * g, 110, 40, 0.3); snap(at, 0.6 * g); noise({ at, dur: 0.08, gain: 0.12 * g, filterFreq: 1500, filterType: 'lowpass' }) },
      stamp(at) { kick(at, 0.8, 130, 45, 0.28); snap(at, 0.8); noise({ at, dur: 0.12, gain: 0.18, filterFreq: 1400, q: 0.8 }) },
      tap(at) { tone({ freq: 2200, at, dur: 0.03, type: 'sine', gain: 0.06, send: 0.1 }); noise({ at, dur: 0.025, gain: 0.08, filterFreq: 6000, filterType: 'highpass', send: 0.1 }) },
      ding(at) { tone({ freq: 1046.5, at, dur: 0.5, type: 'sine', gain: 0.07 }); tone({ freq: 1568, at: at + 0.04, dur: 0.45, type: 'sine', gain: 0.045 }) },
      shimmer(at) { [1318.5, 1568, 2093, 2637].forEach((f, i) => tone({ freq: f, at: at + i * 0.05, dur: 0.9, type: 'sine', gain: 0.035, send: 1 })) },
      reveal(at) { [523.25, 659.25, 783.99].forEach((freq, i) => tone({ freq, at: at + i * 0.09, dur: 0.22, gain: 0.12 })) },
      // the bad news: a minor arpeggio, where the Whozic bluff went major
      sting(at) {
        ;[392, 466.16, 587.33].forEach((freq, i) => tone({ freq, at: at + i * 0.08, dur: 0.16, gain: 0.13 }))
        tone({ freq: 783.99, at: at + 0.26, dur: 0.7, gain: 0.14 })
        tone({ freq: 932.33, at: at + 0.26, dur: 0.7, gain: 0.07, type: 'sine' })
      },
      tick(at) { tone({ freq: 1050, at, dur: 0.05, type: 'square', gain: 0.07, send: 0.2 }) },
      pop(at, { g = 1 } = {}) {
        tone({ freq: 420, glideTo: 680, at, dur: 0.09, type: 'sine', gain: 0.14 * g, send: 0.3 })
        tone({ freq: 840, glideTo: 1360, at, dur: 0.07, type: 'sine', gain: 0.07 * g, send: 0.3 })
      },
      drumroll(at, { n = 26 } = {}) {
        for (let i = 0; i < n; i++) noise({ at: at + i * 0.055, dur: 0.05, gain: 0.12 + i * 0.014, filterFreq: 1600, q: 0.9, pan: i % 2 ? 0.15 : -0.15, send: 0.3 })
        const end = at + n * 0.055
        noise({ at: end, dur: 1.1, gain: 0.16, filterFreq: 6500, filterType: 'highpass', send: 0.8 })
      },
    }
    for (const [name, at, opts] of EVENTS) S[name](at + PRE, opts || {})
    const buf = await c.startRendering()
    const L = buf.getChannelData(0).subarray(SR * PRE), Rt = buf.getChannelData(1).subarray(SR * PRE)
    const pcm = new Int16Array(L.length * 2)
    for (let i = 0; i < L.length; i++) {
      pcm[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767
      pcm[2 * i + 1] = Math.max(-1, Math.min(1, Rt[i])) * 32767
    }
    const bytes = new Uint8Array(pcm.buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  }
})()
