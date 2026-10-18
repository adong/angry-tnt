/* Angry TNT: sound effects, built on Kit.sound (tone / hiss synth, no audio files). Exposes window.SFX. */
(function () {
  'use strict';
  const S = Kit.sound;
  const tone = (o) => S.tone(o), hiss = (o) => S.hiss(o);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let lastHit = 0;

  window.SFX = {
    // rubber band creak while pulling, k = 0..1 how far
    stretch(k) { tone({ type: 'triangle', f: 150 + k * 260, dur: 0.05, vol: 0.035, lp: 1400 }); },
    launch() {
      S.swish();
      tone({ type: 'sine', f: 200, to: 560, dur: 0.2, vol: 0.18 });
      hiss({ f: 1100, to: 3400, dur: 0.28, vol: 0.12, q: 0.8 });
    },
    hit(mat, e) {
      const now = performance.now();
      if (now - lastHit < 45) return; // a pile landing at once shouldn't be a wall of noise
      lastHit = now;
      const v = Math.min(1, 0.25 + e / 60);
      if (mat === 'ice') {
        tone({ type: 'sine', f: rnd(1900, 2300), to: 1700, dur: 0.12, vol: 0.09 * v });
        tone({ type: 'sine', f: 3150, dur: 0.07, vol: 0.05 * v, at: 0.015 });
      } else if (mat === 'stone') {
        tone({ type: 'square', f: rnd(100, 125), to: 65, dur: 0.12, vol: 0.12 * v, lp: 500 });
        hiss({ filter: 'lowpass', f: 700, dur: 0.1, vol: 0.18 * v });
      } else {
        tone({ type: 'triangle', f: rnd(170, 210), to: 105, dur: 0.11, vol: 0.2 * v });
        hiss({ filter: 'lowpass', f: 1000, dur: 0.07, vol: 0.12 * v });
      }
    },
    break(mat) {
      if (mat === 'ice') {
        for (let i = 0; i < 5; i++) tone({ type: 'sine', f: rnd(1700, 3600), dur: 0.12, vol: 0.06, at: i * 0.028 });
        hiss({ filter: 'highpass', f: 3500, dur: 0.3, vol: 0.16 });
      } else if (mat === 'stone') {
        hiss({ filter: 'lowpass', f: 600, to: 160, dur: 0.5, vol: 0.38 });
        tone({ type: 'sine', f: 95, to: 42, dur: 0.35, vol: 0.3 });
      } else {
        hiss({ f: 750, to: 280, q: 1.2, dur: 0.32, vol: 0.32 });
        tone({ type: 'triangle', f: 150, to: 60, dur: 0.2, vol: 0.2 });
      }
    },
    // a zombie head pops into stars: bonk, boing, twinkle
    pop() {
      tone({ type: 'triangle', f: 640, to: 300, dur: 0.12, vol: 0.24 });
      tone({ type: 'sine', f: 260, to: 820, dur: 0.24, vol: 0.16, at: 0.05 });
      tone({ type: 'sine', f: 1568, dur: 0.14, vol: 0.07, at: 0.13 });
      tone({ type: 'sine', f: 2093, dur: 0.2, vol: 0.06, at: 0.19 });
    },
    ouch() { tone({ type: 'sine', f: 420, to: 300, dur: 0.12, vol: 0.08 }); },
    punch() {
      S.punch();
      hiss({ f: 900, to: 2600, dur: 0.26, vol: 0.18, q: 0.7 });
    },
    smash() {
      tone({ type: 'square', f: 95, to: 45, dur: 0.2, vol: 0.22, lp: 700 });
      hiss({ filter: 'lowpass', f: 1500, to: 300, dur: 0.3, vol: 0.32 });
    },
    split() {
      [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.14, vol: 0.11, at: i * 0.05 }));
      S.swish();
    },
    bump(e) { tone({ type: 'sine', f: 190, to: 120, dur: 0.1, vol: Math.min(0.18, 0.04 + e / 300) }); },
    star(i) {
      tone({ type: 'triangle', f: [1047, 1319, 1568][i] || 1568, dur: 0.38, vol: 0.17 });
      tone({ type: 'sine', f: ([1047, 1319, 1568][i] || 1568) * 2, dur: 0.25, vol: 0.05, at: 0.02 });
    },
    win() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => {
        tone({ type: 'square', f, dur: i === 5 ? 0.5 : 0.16, vol: 0.06, lp: 2600, at: i * 0.12 });
        tone({ type: 'triangle', f, dur: i === 5 ? 0.5 : 0.16, vol: 0.12, at: i * 0.12 });
      });
    },
    // gentle, not sad: a little "oh well" slide
    lose() {
      [392, 370, 349].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.26, vol: 0.12, at: i * 0.22 }));
      tone({ type: 'triangle', f: 330, to: 300, dur: 0.6, vol: 0.12, at: 0.66 });
    },
    hop() { S.jump(); },
    land() { S.land(); },
    treat() { S.powerup(); },
    bonus(n) { S.coin(n); },
    poof() {
      hiss({ f: 1600, q: 1, dur: 0.2, vol: 0.1 });
      tone({ type: 'sine', f: 900, to: 1500, dur: 0.12, vol: 0.05 });
    },
    click() { S.click(); },
    arrive() {
      [659, 880].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.16, vol: 0.12, at: i * 0.09 }));
    },
  };
})();
