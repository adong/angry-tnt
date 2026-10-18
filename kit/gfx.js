/* Claude Games kit: canvas, texture and material helpers shared by every game.
   Load after three.min.js. Exposes window.Kit.gfx. Turns on THREE.ColorManagement, so games should set
   renderer.outputEncoding = THREE.sRGBEncoding. */
(function () {
  'use strict';
  const T = THREE;
  if (T.ColorManagement && 'legacyMode' in T.ColorManagement) T.ColorManagement.legacyMode = false;
  const Kit = (window.Kit = window.Kit || {});

  const FONT = '"Bungee", "Arial Black", Impact, sans-serif';
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  }

  function toTexture(c, repeat) {
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
    return t;
  }

  // Mix a #rrggbb colour toward white (amt > 0) or black (amt < 0).
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), to = amt < 0 ? 0 : 255, k = Math.abs(amt);
    const ch = (v) => Math.round(v + (to - v) * k);
    return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const std = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0 }, o));

  function mesh(geo, mat, x, y, z, parent, shadow = true) {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  }

  // Scale a box's UVs so a repeating texture keeps the same size on boxes of any size (one tile per `unit`).
  function boxUV(geo, X, Y, Z, unit) {
    const uv = geo.attributes.uv;
    const faces = [[Z, Y], [Z, Y], [X, Z], [X, Z], [X, Y], [X, Y]]; // px nx py ny pz nz
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, (uv.getX(k) * faces[f][0]) / unit, (uv.getY(k) * faces[f][1]) / unit);
      }
    }
  }

  function radialTexture(size, stops) {
    const [c, g] = makeCanvas(size, size);
    const h = size / 2;
    const gr = g.createRadialGradient(h, h, 0, h, h, h);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return toTexture(c);
  }

  // Soft white glow (for additive sprites) and a round particle dot. Made once, on first use.
  let glow = null, dot = null;
  const glowTexture = () => glow || (glow = radialTexture(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]));
  const dotTexture = () => dot || (dot = radialTexture(64, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]));

  const emojiCache = {};
  function emojiTexture(emoji) {
    if (emojiCache[emoji]) return emojiCache[emoji];
    const [c, g] = makeCanvas(128, 128);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `100px ${EMOJI_FONT}`;
    g.fillText(emoji, 64, 70);
    return (emojiCache[emoji] = toTexture(c));
  }

  // A pill-shaped name label sprite, about 1.3 m wide. Put it above a character's head.
  function nameTag(text, color) {
    const [c, g] = makeCanvas(256, 80);
    g.fillStyle = color;
    roundRect(g, 6, 6, 244, 68, 34);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#14121f';
    g.stroke();
    g.font = `40px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#14121f';
    g.fillText(text, 128, 44);
    const s = new T.Sprite(new T.SpriteMaterial({ map: toTexture(c), depthWrite: false }));
    s.scale.set(1.3, 0.41, 1);
    return s;
  }

  Kit.gfx = {
    FONT, EMOJI_FONT, rand, randi, pick,
    makeCanvas, toTexture, shade, roundRect, std, mesh, boxUV, radialTexture,
    glowTexture, dotTexture, emojiTexture, nameTag,
  };
})();
