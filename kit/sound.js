/* Claude Games kit: sound. Every effect and the music loop are synthesised with the Web Audio API, so there are
   no audio files. Exposes window.Kit.sound. Call Kit.sound.init() from the first user gesture (a tap or key);
   effects called before that are silent no-ops. Mute state is remembered in localStorage. */
(function () {
  'use strict';

  let ctx = null, master, sfx, music, noiseBuf, timer = null;
  let muted = false;
  try { muted = localStorage.getItem('claudeGames.muted') === '1'; } catch (e) { /* storage blocked */ }

  const now = () => ctx.currentTime;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(comp);
    sfx = ctx.createGain();
    sfx.gain.value = 0.85;
    sfx.connect(master);
    music = ctx.createGain();
    music.gain.value = 0;
    music.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    nextT = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 25);
  }

  function envelope(g, t0, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  // One oscillator note with an optional pitch glide and low-pass filter.
  function tone(o) {
    if (!ctx) return;
    const t0 = o.when !== undefined ? o.when : now() + (o.at || 0);
    const dur = o.dur || 0.15;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const g = ctx.createGain();
    envelope(g, t0, o.vol || 0.2, o.attack || 0.004, dur);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.out || sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // Filtered white noise: whooshes, hats, snares, crashes.
  function hiss(o) {
    if (!ctx) return;
    const t0 = o.when !== undefined ? o.when : now() + (o.at || 0);
    const dur = o.dur || 0.2;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const g = ctx.createGain();
    envelope(g, t0, o.vol || 0.2, o.attack || 0.004, dur);
    src.connect(f);
    f.connect(g);
    g.connect(o.out || sfx);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.03);
  }

  // ---- music: a 4-bar Am–F–C–G loop with drums, bass and a little square-wave lead ----
  const BPM = 118, STEP = 60 / BPM / 4;
  const CHORDS = [
    { root: 110.0, notes: [440.0, 523.25, 659.25] }, // Am
    { root: 87.31, notes: [349.23, 440.0, 523.25] }, // F
    { root: 130.81, notes: [392.0, 523.25, 659.25] }, // C
    { root: 98.0, notes: [392.0, 493.88, 587.33] }, // G
  ];
  const LEAD = [0, -1, 1, 2, -1, 1, 0, -1, 2, -1, 1, -1, 2, 1, 0, -1];
  const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
  let step = 0, nextT = 0;

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < now() - 0.2) nextT = now() + 0.05; // fell behind (tab was hidden): resync
    while (nextT < now() + 0.12) {
      playStep(step++, nextT);
      nextT += STEP;
    }
  }

  function playStep(i, t) {
    const s = i % 16;
    const ch = CHORDS[Math.floor(i / 16) % 4];
    const phrase = Math.floor(i / 64) % 2;
    if (s % 4 === 0) tone({ when: t, f: 150, to: 42, dur: 0.24, vol: 0.9, out: music });
    if (s === 4 || s === 12) {
      hiss({ when: t, f: 1900, dur: 0.16, vol: 0.4, q: 0.7, out: music });
      tone({ when: t, type: 'triangle', f: 200, to: 140, dur: 0.08, vol: 0.25, out: music });
    }
    if (s % 2 === 1) hiss({ when: t, filter: 'highpass', f: 7500, dur: 0.04, vol: s % 4 === 3 ? 0.14 : 0.07, out: music });
    if (BASS[s]) tone({ when: t, type: 'sawtooth', f: ch.root * (s === 6 || s === 13 ? 2 : 1), dur: STEP * 1.7, vol: 0.3, lp: 600, out: music });
    const n = LEAD[s];
    if (n >= 0 && (phrase === 1 || s < 8)) tone({ when: t, type: 'square', f: ch.notes[n], dur: STEP * 1.1, vol: 0.045, lp: 2600, out: music });
  }

  const MUSIC_LEVEL = { play: 0.26, title: 0.18, over: 0.1, pause: 0.05 };

  const Kit = (window.Kit = window.Kit || {});
  Kit.sound = {
    init,
    tone, // tone({ f, to, type, dur, vol, at, lp }) - one synth note, for game-specific effects
    hiss, // hiss({ f, to, filter, q, dur, vol, at }) - filtered noise
    isMuted: () => muted,
    toggleMute: () => setMuted(!muted),
    setMuted,
    onMute(cb) { muteListeners.push(cb); }, // cb(muted), whoever flipped it: the game, the kit button or the ? panel
    setup(o) { btnOpts = o || {}; if (document.body) placeButton(); },
    button: () => btn,
    music(mode) {
      if (ctx) music.gain.setTargetAtTime(MUSIC_LEVEL[mode] ?? 0.2, now(), 0.25);
    },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    isRunning: () => !!ctx && ctx.state === 'running',

    coin(streak) {
      const k = Math.pow(2, Math.min(streak, 14) / 24); // each coin in a streak rings a little higher
      tone({ type: 'square', f: 988 * k, dur: 0.07, vol: 0.05, lp: 4000 });
      tone({ type: 'triangle', f: 1319 * k, at: 0.055, dur: 0.22, vol: 0.16 });
    },
    jump() {
      tone({ type: 'square', f: 260, to: 620, dur: 0.16, vol: 0.06, lp: 2200 });
      hiss({ f: 900, to: 3000, dur: 0.18, vol: 0.08, q: 0.7 });
    },
    roll() { hiss({ filter: 'lowpass', f: 2400, to: 300, dur: 0.3, vol: 0.2 }); },
    swipe() { hiss({ f: 2600, to: 900, dur: 0.12, vol: 0.12, q: 1.2 }); },
    land() { tone({ f: 140, to: 55, dur: 0.1, vol: 0.22 }); },
    bump() { tone({ f: 110, to: 70, dur: 0.12, vol: 0.25 }); },
    stumble() {
      tone({ f: 180, to: 60, dur: 0.25, vol: 0.35 });
      tone({ type: 'square', f: 520, to: 260, dur: 0.22, vol: 0.06, at: 0.04 });
    },
    crash() {
      hiss({ filter: 'lowpass', f: 4000, to: 150, dur: 0.7, vol: 0.5 });
      tone({ type: 'sawtooth', f: 150, to: 38, dur: 0.6, vol: 0.3, lp: 900 });
    },
    powerup() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, at: i * 0.06, dur: 0.18, vol: 0.13 }));
    },
    board() {
      tone({ type: 'sawtooth', f: 200, to: 900, dur: 0.35, vol: 0.08, lp: 1800 });
      hiss({ f: 1500, to: 5000, dur: 0.35, vol: 0.08 });
    },
    boardBreak() {
      hiss({ filter: 'highpass', f: 3000, dur: 0.4, vol: 0.25 });
      tone({ type: 'square', f: 700, to: 120, dur: 0.4, vol: 0.08 });
    },
    horn(vol) {
      [311, 370].forEach((f) => tone({ type: 'sawtooth', f, dur: 0.9, vol: 0.05 * vol, attack: 0.04, lp: 1400 }));
    },
    jet() { hiss({ filter: 'lowpass', f: 600, to: 2400, dur: 0.8, vol: 0.25, attack: 0.1 }); },
    click() { tone({ type: 'square', f: 880, dur: 0.05, vol: 0.05 }); },
    // A cartoon "bonk" for a landed punch or kick.
    punch() {
      tone({ f: 260, to: 90, dur: 0.12, vol: 0.4 });
      hiss({ filter: 'lowpass', f: 1800, to: 300, dur: 0.1, vol: 0.25 });
    },
    // A basketball swishing through the net.
    swish() { hiss({ filter: 'highpass', f: 2500, to: 6000, dur: 0.35, vol: 0.18, attack: 0.05 }); },
    // A wobbling zombie groan, then a "BOO!" sting timed to the scare animation.
    groan() {
      if (!ctx) return;
      const t0 = now(), dur = 1.8;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, t0);
      osc.frequency.linearRampToValueAtTime(68, t0 + dur);
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 7;
      depth.gain.value = 12;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 650;
      f.Q.value = 6;
      const g = ctx.createGain();
      envelope(g, t0, 0.35, 0.3, dur);
      osc.connect(f);
      f.connect(g);
      g.connect(sfx);
      osc.start(t0);
      lfo.start(t0);
      osc.stop(t0 + dur + 0.05);
      lfo.stop(t0 + dur + 0.05);
      hiss({ f: 500, to: 300, q: 2, dur: 1.5, vol: 0.12, attack: 0.3 });
      tone({ type: 'square', f: 230, to: 110, at: 2.45, dur: 0.35, vol: 0.12, lp: 1500 });
      hiss({ filter: 'lowpass', f: 3000, to: 400, at: 2.45, dur: 0.4, vol: 0.3 });
    },
  };

  // ---------- mute: one switch for the whole page ----------
  const muteListeners = [];
  function setMuted(m) {
    m = !!m;
    if (m === muted) return muted;
    muted = m;
    try { localStorage.setItem('claudeGames.muted', muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.03);
    for (const cb of muteListeners) { try { cb(muted); } catch (e) { console.error(e); } }
    return muted;
  }

  // ---------- the sound button, under the language button and the same size ----------
  // Every game has its own 🔊 button, but often only while playing. This one shows whenever the game's own isn't on
  // screen (title, menus, results), so sound can always be switched off with one tap, and never doubles up with it.
  // Icons: Lucide's "volume-2" and "volume-x". Lucide is ISC licensed: Copyright (c) Lucide Contributors 2022.
  // Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby
  // granted, provided that the above copyright notice and this permission notice appear in all copies.
  // THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES.
  const SPEAKER = '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>';
  const svg = (inner) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" ' +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SPEAKER}${inner}</svg>`;
  const ICON_ON = svg('<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/>');
  const ICON_OFF = svg('<line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>');
  Kit.sound.icon = () => (muted ? ICON_OFF : ICON_ON);

  let btn = null, btnOpts = {}, styled = false;
  const CSS = `
#kit-sound-btn { position: fixed; z-index: 2147482000; width: 40px; height: 40px; padding: 0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 3px solid #fff; background: rgba(20, 18, 31, 0.62); color: #fff; cursor: pointer;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.45);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
#kit-sound-btn:hover { background: #ffd400; color: #14121f; border-color: #14121f; }
#kit-sound-btn.off { background: rgba(120, 20, 40, 0.75); }
`;

  // The game's own sound buttons: just 🔊 or 🔇 (Spot TT Animals' settings say "🔊 ON"). Word Pop's "hear the word"
  // button also starts with 🔊 but has more text, so it isn't one.
  const GAME_BTN = /^(🔊|🔇)(\s*(ON|OFF|开|关))?$/;
  const isGameBtn = (b) => b !== btn && GAME_BTN.test((b.textContent || '').trim());
  const WORD = { ON: ['ON', 'OFF'], OFF: ['ON', 'OFF'], 开: ['开', '关'], 关: ['开', '关'] };
  function onScreen(el) {
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit)); // not hidden behind a menu or a fade
  }
  function syncGameButtons() {
    for (const b of document.querySelectorAll('button')) {
      if (!isGameBtn(b)) continue;
      const word = (b.textContent.match(/ON|OFF|开|关/) || [])[0];
      b.textContent = (muted ? '🔇' : '🔊') + (word ? ' ' + WORD[word][muted ? 1 : 0] : '');
      if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
  }

  function placeButton() {
    if (!styled) {
      styled = true;
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'kit-sound-btn';
      btn.type = 'button';
      btn.title = 'Sound on / off';
      btn.setAttribute('aria-label', 'Sound on / off');
      btn.style.display = 'none';
      document.body.appendChild(btn);
    }
    paint();
    refresh();
  }
  function paint() {
    if (!btn) return;
    btn.innerHTML = Kit.sound.icon();
    btn.classList.toggle('off', muted);
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  // Show it only when the game's own sound button isn't on screen, right under the language button (or the ? button),
  // wherever the game has moved those.
  function refresh() {
    if (!btn) return;
    const own = [...document.querySelectorAll('button')].some((b) => isGameBtn(b) && onScreen(b));
    if (btnOpts.button === false || own) { btn.style.display = 'none'; return; }
    if (btnOpts.button) {
      for (const side of ['top', 'right', 'bottom', 'left']) btn.style[side] = btnOpts.button[side] == null ? '' : btnOpts.button[side];
    } else {
      const above = ['kit-lang-btn', 'kit-help-btn'].map((id) => document.getElementById(id))
        .find((b) => b && b.style.display !== 'none' && b.getBoundingClientRect().width > 0);
      let top = innerHeight / 2 + 76, left = 10;
      if (above) {
        const r = above.getBoundingClientRect();
        top = r.bottom + 8;
        left = r.left;
        if (top + 44 > innerHeight) top = Math.max(4, r.top - 48 * (above.id === 'kit-lang-btn' ? 2 : 1)); // short screen: go above the ? instead
      }
      btn.style.top = top + 'px';
      btn.style.left = left + 'px';
      btn.style.right = btn.style.bottom = '';
    }
    btn.style.display = '';
  }
  muteListeners.push(() => { paint(); syncGameButtons(); });

  // Taps on the button never reach the game (like the ? and language buttons): one click switches the sound.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick']) {
    window.addEventListener(type, (e) => {
      if (!btn || !btn.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (e.type === 'click') { init(); setMuted(!muted); }
    }, { capture: true, passive: false });
  }
  function start() { placeButton(); setInterval(refresh, 400); addEventListener('resize', refresh); }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
