/* Angry TNT: the levels. Three worlds (the backyard, the subway, the castle) of five levels each.
   Built with a few helpers that stack pieces from the ground up, so every piece starts exactly touching the one
   below. x is metres from the slingshot, y is height above the ground. The level check (tools/check-levels.js)
   proves every level settles without anything falling and can be cleared with the shots it gives you.
   Exposes window.LEVELS (or module.exports in Node). */
(function (root) {
  'use strict';

  const HEAD_SIZE = { zombie: 1.0, cap: 1.0, helmet: 1.0, king: 1.45 };

  function builder() {
    const k = { blocks: [], heads: [], statics: [] };
    // a standing post (bottom at y0), returns its top
    k.post = (x, y0, h, mat = 'wood', t = 0.4) => (k.blocks.push({ mat, x, y: y0 + h / 2, w: t, h }), y0 + h);
    // a lying plank
    k.beam = (x, y0, w, mat = 'wood', t = 0.4) => (k.blocks.push({ mat, x, y: y0 + t / 2, w, h: t }), y0 + t);
    k.cube = (x, y0, s = 1, mat = 'wood') => (k.blocks.push({ mat, x, y: y0 + s / 2, w: s, h: s }), y0 + s);
    // a little hut: two posts and a plank on top (room for a head inside when w >= 2.2 and h >= 1.3)
    k.hut = (x, y0, w, h, postMat = 'wood', beamMat = postMat, t = 0.4) => {
      k.post(x - w / 2 + t / 2, y0, h, postMat, t);
      k.post(x + w / 2 - t / 2, y0, h, postMat, t);
      return k.beam(x, y0 + h, w, beamMat);
    };
    // a pile of cubes: n on the bottom row, one fewer on each row up
    k.pyramid = (x, y0, n, s = 1, mat = 'wood') => {
      for (let row = 0; row < n; row++) {
        for (let i = 0; i < n - row; i++) k.cube(x + (i - (n - row - 1) / 2) * s, y0 + row * s, s, mat);
      }
      return y0 + n * s;
    };
    k.head = (x, y0, kind = 'zombie') => {
      const s = HEAD_SIZE[kind];
      k.heads.push({ x, y: y0 + (s * 1.1) / 2, kind });
      return y0 + s * 1.1;
    };
    // fixed ground pieces: a hill, a subway platform, a train car, castle rock...
    k.fixed = (x, y0, w, h, look = 'hill') => (k.statics.push({ x, y: y0 + h / 2, w, h, look }), y0 + h);
    return k;
  }

  function level(id, name, world, shots, build, extra = {}) {
    const k = builder();
    build(k);
    let right = 0, left = Infinity, top = 0;
    for (const b of [...k.blocks, ...k.statics]) {
      right = Math.max(right, b.x + b.w / 2);
      left = Math.min(left, b.x - b.w / 2);
      top = Math.max(top, b.y + b.h / 2);
    }
    for (const h of k.heads) {
      right = Math.max(right, h.x + 0.8);
      top = Math.max(top, h.y + 0.8);
    }
    return Object.assign({ id, name, world, shots, blocks: k.blocks, heads: k.heads, statics: k.statics, right, left, top }, extra);
  }

  const WORLDS = [
    { id: 'backyard', name: 'THE BACKYARD', emoji: '🏡' },
    { id: 'subway', name: 'THE SUBWAY', emoji: '🚇' },
    { id: 'castle', name: 'THE CASTLE', emoji: '🏰' },
  ];

  const LEVELS = [
    // ------------------------------------------------------------------ the backyard: wood and ice
    level('1-1', 'Hello, Zombies!', 'backyard', 3, (k) => {
      const top = k.hut(18, 0, 2.6, 1.4);
      k.head(18, 0);
      k.head(18, top);
    }),
    level('1-2', 'Two Huts', 'backyard', 3, (k) => {
      const t1 = k.hut(17, 0, 2.6, 1.4);
      k.head(17, 0);
      k.head(17, t1);
      const t2 = k.hut(21.5, 0, 2.6, 1.4, 'wood', 'ice');
      k.head(21.5, 0);
      k.cube(20.7, t2, 0.8, 'ice');
      k.cube(22.3, t2, 0.8, 'ice');
    }),
    level('1-3', 'Ice Cream Tower', 'backyard', 3, (k) => {
      let y = k.hut(20, 0, 3.0, 1.4);
      k.head(20, 0);
      const y2 = k.hut(20, y, 3.0, 1.4, 'ice');
      k.head(20, y);
      y = k.hut(20, y2, 2.2, 1.2, 'ice', 'wood');
      k.head(20, y);
    }),
    level('1-4', 'Picnic Table', 'backyard', 4, (k) => {
      k.post(16.2, 0, 1.4);
      k.post(19, 0, 1.4);
      k.post(21.8, 0, 1.4);
      const y = k.beam(19, 1.4, 6.4);
      k.head(17.6, 0);
      k.head(20.4, 0);
      k.cube(16.6, y, 0.9, 'ice');
      k.cube(16.6, y + 0.9, 0.9, 'ice');
      k.head(19, y);
      k.cube(21.4, y, 0.9, 'ice');
      k.cube(21.4, y + 0.9, 0.9, 'ice');
      const p = k.pyramid(26, 0, 3, 0.9);
      k.head(26, p);
    }),
    level('1-5', 'Tree House', 'backyard', 4, (k) => {
      const g = k.fixed(23, 0, 7, 2, 'hill');
      let y = k.hut(23, g, 3.0, 1.4);
      k.head(23, g);
      const y2 = k.hut(23, y, 3.0, 1.4, 'wood', 'ice');
      k.head(23, y);
      y = k.hut(23, y2, 2.2, 1.2, 'ice', 'wood');
      k.head(23, y);
      const t = k.hut(16.5, 0, 2.6, 1.4);
      k.head(16.5, 0);
      k.cube(16.5, t, 0.8, 'ice');
    }),

    // ------------------------------------------------------------------ the subway: stone, ice and platforms
    level('2-1', 'Mind the Gap', 'subway', 3, (k) => {
      const p = k.fixed(23, 0, 9, 1.6, 'platform');
      k.post(19.1, p, 1.6, 'stone', 0.5);
      let y = k.hut(22, p, 2.6, 1.4, 'wood', 'ice');
      k.head(22, p, 'cap');
      k.head(22, y, 'cap');
      y = k.hut(25.4, p, 2.6, 1.4, 'ice', 'wood');
      k.head(25.4, p, 'cap');
    }),
    level('2-2', 'Turnstiles', 'subway', 4, (k) => {
      for (const x of [16.5, 20, 23.5]) {
        const y = k.hut(x, 0, 2.6, 1.4, 'stone', 'ice');
        k.head(x, 0, 'cap');
        k.cube(x, y, 0.8, 'ice');
      }
      k.head(20, 2.6, 'cap');
    }),
    level('2-3', 'Train Roof', 'subway', 3, (k) => {
      const r = k.fixed(23, 0, 11, 2.6, 'train');
      let y = k.hut(20, r, 2.6, 1.4);
      k.head(20, r, 'cap');
      k.cube(20, y, 0.8, 'ice');
      y = k.hut(25.5, r, 3.0, 1.4, 'stone', 'wood');
      k.head(25.5, r, 'cap');
      k.head(25.5, y, 'cap');
    }),
    level('2-4', 'Escalator', 'subway', 4, (k) => {
      const s1 = k.fixed(17, 0, 3, 1, 'step');
      const s2 = k.fixed(20, 0, 3, 2, 'step');
      const s3 = k.fixed(23, 0, 3, 3, 'step');
      k.cube(16.1, s1, 0.8, 'stone');
      k.head(17.3, s1, 'cap');
      k.post(19.0, s2, 1.4, 'ice', 0.5);
      k.head(20.3, s2, 'cap');
      k.post(22.0, s3, 1.4, 'stone', 0.5);
      k.head(23.3, s3, 'cap');
      const y = k.hut(27, 0, 2.6, 1.4, 'wood', 'stone');
      k.head(27, 0, 'cap');
      k.cube(27, y, 0.8, 'ice');
    }),
    level('2-5', 'Rush Hour', 'subway', 4, (k) => {
      let y = k.hut(19, 0, 2.8, 1.4, 'stone', 'stone');
      k.head(19, 0, 'cap');
      let y2 = k.hut(22, 0, 2.8, 1.4, 'stone', 'stone');
      k.head(22, 0, 'cap');
      k.beam(20.5, y, 5.8, 'wood');
      y += 0.4;
      y2 = k.hut(19, y, 2.6, 1.3, 'wood', 'ice');
      k.head(19, y, 'cap');
      k.hut(22, y, 2.6, 1.3, 'ice', 'ice');
      k.head(22, y, 'cap');
      k.head(20.5, y2, 'cap');
    }),

    // ------------------------------------------------------------------ the castle: stone, helmets and a king
    level('3-1', 'Gatehouse', 'castle', 4, (k) => {
      let a = k.hut(17, 0, 2.4, 1.4, 'stone', 'stone');
      k.head(17, 0, 'helmet');
      a = k.hut(17, a, 2.4, 1.4, 'stone', 'wood');
      let b = k.hut(23, 0, 2.4, 1.4, 'stone', 'stone');
      k.head(23, 0, 'helmet');
      b = k.hut(23, b, 2.4, 1.4, 'stone', 'wood');
      k.beam(20, a, 8.4, 'wood');
      k.head(20, a + 0.4, 'helmet');
      k.head(17, 1.8, 'helmet');
    }),
    level('3-2', 'Castle Wall', 'castle', 4, (k) => {
      for (let i = 0; i < 4; i++) k.cube(16, i * 1.0, 1.0, 'stone');
      let y = k.hut(20.5, 0, 2.6, 1.4);
      k.head(20.5, 0, 'helmet');
      k.head(20.5, y, 'helmet');
      y = k.hut(24.5, 0, 2.6, 1.4, 'wood', 'ice');
      k.head(24.5, 0, 'helmet');
      k.cube(24.5, y, 0.8, 'wood');
    }),
    level('3-3', 'The Keep', 'castle', 4, (k) => {
      let y = 0;
      const floors = [['stone', 'stone'], ['wood', 'wood'], ['stone', 'wood'], ['ice', 'ice']];
      for (const [pm, bm] of floors) {
        const y2 = k.hut(22, y, 2.8, 1.4, pm, bm);
        k.head(22, y, 'helmet');
        y = y2;
      }
      k.head(22, y, 'helmet');
    }),
    level('3-4', 'Twin Towers', 'castle', 4, (k) => {
      for (const x of [18, 25]) {
        let y = k.hut(x, 0, 2.6, 1.4, 'stone', 'wood');
        k.head(x, 0, 'helmet');
        y = k.hut(x, y, 2.6, 1.4, 'wood', 'stone');
        y = k.hut(x, y, 2.2, 1.3, 'stone', 'wood');
        k.head(x, y - 1.7, 'helmet');
        k.head(x, y, 'helmet');
      }
    }),
    level('3-5', "The King's Castle", 'castle', 5, (k) => {
      const g = k.fixed(24, 0, 9, 1.5, 'rock');
      // side towers
      for (const x of [16, 31]) {
        const y = k.hut(x, 0, 2.4, 1.4, 'stone', 'wood');
        k.head(x, 0, 'helmet');
        k.cube(x, y, 0.8, 'stone');
      }
      // the keep, with the king on top
      let y = k.hut(24, g, 4.0, 1.4, 'stone', 'stone');
      k.head(23.2, g, 'helmet');
      k.head(24.8, g, 'helmet');
      const floor = y;
      y = k.hut(24, y, 3.2, 2.1, 'wood', 'wood');
      k.head(24, floor, 'king');
      k.cube(22.8, y, 0.8, 'ice');
      k.cube(25.2, y, 0.8, 'ice');
      k.head(24, y, 'helmet');
    }),
  ];

  const out = { LEVELS, WORLDS, HEAD_SIZE };
  if (typeof module !== 'undefined' && module.exports) module.exports = out;
  else root.LEVELS = LEVELS, root.WORLDS = WORLDS;
})(typeof window !== 'undefined' ? window : globalThis);
