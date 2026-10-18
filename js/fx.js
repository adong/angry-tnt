/* Angry TNT: effects. Sparkle particles, flying chunks when a block breaks, comic starbursts with a word in them
   (BONK!, POW!), floating score numbers, emoji sprites (⭐ ✌️ 🍦) and the dotted aiming guide and flight trail.
   All pooled, so nothing is allocated during play. Exposes window.FX. */
(function () {
  'use strict';
  const T = THREE;
  const G = Kit.gfx;
  const FRONT = 0.75; // z of effects: just in front of the blocks' faces

  let scene = null;
  const parts = [], chunks = {}, bursts = [], pops = [], emojis = [], guide = [], trail = [];
  const rnd = (a, b) => a + Math.random() * (b - a);

  function sprite(map, opts = {}) {
    const s = new T.Sprite(new T.SpriteMaterial(Object.assign({ map, transparent: true, depthWrite: false }, opts)));
    s.visible = false;
    scene.add(s);
    return s;
  }

  function init(sc) {
    scene = sc;
    const dot = G.dotTexture();
    for (let i = 0; i < 220; i++) parts.push({ s: sprite(dot), life: 0 });
    for (const [mat, color, extra] of [['wood', '#c98b48', {}], ['ice', '#d4f6ff', { transparent: true, opacity: 0.85 }], ['stone', '#9ca3ad', {}]]) {
      const im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), G.std(color, extra), 70);
      im.castShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      scene.add(im);
      chunks[mat] = { im, list: [] };
    }
    for (let i = 0; i < 14; i++) bursts.push({ s: sprite(null), life: 0 });
    for (let i = 0; i < 16; i++) pops.push({ s: sprite(null), life: 0 });
    for (let i = 0; i < 50; i++) emojis.push({ s: sprite(null), life: 0 });
    for (let i = 0; i < 46; i++) guide.push(sprite(dot, { color: '#ffffff' }));
    for (let i = 0; i < 160; i++) trail.push(sprite(dot, { color: '#ffffff', opacity: 0.75 }));
  }

  // o: { color, spread, speed, up, life, size, gravity, z }
  function emit(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const p = parts.find((q) => q.life <= 0);
      if (!p) return;
      const a = rnd(0, Math.PI * 2), sp = rnd(0.3, 1) * (o.speed ?? 4);
      p.x = x + rnd(-1, 1) * (o.spread ?? 0.3);
      p.y = y + rnd(-1, 1) * (o.spread ?? 0.3);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp + (o.up ?? 1.5);
      p.g = o.gravity ?? 6;
      p.life = p.max = rnd(0.6, 1) * (o.life ?? 0.8);
      p.size = (o.size ?? 0.35) * rnd(0.6, 1.2);
      p.z = o.z ?? FRONT;
      p.s.material.color.set(Array.isArray(o.color) ? o.color[i % o.color.length] : o.color || '#ffffff');
      p.s.visible = true;
    }
  }

  // a block breaks: chunks of it tumble out from where it was
  function debris(mat, x, y, w, h, a, n) {
    const c = chunks[mat];
    if (!c) return;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < n; i++) {
      if (c.list.length >= 70) c.list.shift();
      const lx = rnd(-0.5, 0.5) * w, ly = rnd(-0.5, 0.5) * h;
      c.list.push({
        x: x + ca * lx - sa * ly, y: y + sa * lx + ca * ly, z: rnd(-0.4, 0.4),
        vx: rnd(-3.5, 3.5), vy: rnd(1, 6), vz: rnd(-1.5, 1.5),
        r: new T.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)), spin: rnd(-9, 9),
        s: rnd(0.14, 0.38) * (mat === 'stone' ? 1.15 : 1), life: rnd(1.1, 1.7),
      });
    }
  }

  const burstCache = {};
  function burstTexture(word, color) {
    const key = word + color;
    if (burstCache[key]) return burstCache[key];
    const [c, g] = G.makeCanvas(256, 256);
    g.translate(128, 128);
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const r = i % 2 ? 78 : 118, a = (i * Math.PI) / 12;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = color;
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = '#14121f';
    g.stroke();
    g.rotate(-0.12);
    g.font = `${word.length > 5 ? 40 : 52}px ${G.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 9;
    g.strokeStyle = '#14121f';
    g.strokeText(word, 0, 4);
    g.fillStyle = '#ffffff';
    g.fillText(word, 0, 4);
    return (burstCache[key] = G.toTexture(c));
  }

  function burst(word, x, y, color = '#ffd400', size = 2.4) {
    const b = bursts.find((q) => q.life <= 0) || bursts[0];
    b.s.material.map = burstTexture(word, color);
    b.s.material.needsUpdate = true;
    b.s.material.rotation = rnd(-0.25, 0.25);
    b.x = x; b.y = y; b.size = size;
    b.life = b.max = 0.9;
    b.s.visible = true;
  }

  const popCache = {};
  function popTexture(text, color) {
    const key = text + color;
    if (popCache[key]) return popCache[key];
    const [c, g] = G.makeCanvas(256, 96);
    g.font = `56px ${G.FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#14121f';
    g.strokeText(text, 128, 52);
    g.fillStyle = color;
    g.fillText(text, 128, 52);
    return (popCache[key] = G.toTexture(c));
  }

  function popup(text, x, y, color = '#ffffff', size = 1) {
    const p = pops.find((q) => q.life <= 0) || pops[0];
    p.s.material.map = popTexture(String(text), color);
    p.s.material.needsUpdate = true;
    p.x = x; p.y = y; p.size = size;
    p.life = p.max = 1.3;
    p.s.visible = true;
  }

  // o: { vx, vy, life, size, gravity, spin }
  function emoji(e, x, y, o = {}) {
    const p = emojis.find((q) => q.life <= 0);
    if (!p) return null;
    p.s.material.map = G.emojiTexture(e);
    p.s.material.needsUpdate = true;
    p.x = x; p.y = y;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.g = o.gravity ?? 0;
    p.life = p.max = o.life ?? 1;
    p.size = o.size ?? 0.8;
    p.spin = o.spin ?? 0;
    p.s.material.rotation = 0;
    p.s.visible = true;
    return p;
  }

  // a zombie head pops: a BONK! burst and a fountain of stars
  function popHead(x, y, size = 1) {
    burst('BONK!', x, y + 0.3, '#ffd400', 2.6 * size);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      emoji(i % 2 ? '⭐' : '✨', x, y, { vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2 + 3, gravity: 7, life: 1.1, size: 0.6 + Math.random() * 0.3, spin: rnd(-4, 4) });
    }
    emit(x, y, 26, { color: ['#b6f27a', '#ffffff', '#ffd400'], speed: 5, up: 2, life: 0.8, size: 0.4 });
  }

  // dotted guide: pts = [[x, y], ...]; fade = how many dots to show before they fade out
  function setGuide(pts, fade) {
    for (let i = 0; i < guide.length; i++) {
      const s = guide[i];
      if (!pts || i >= pts.length || i >= fade) { s.visible = false; continue; }
      s.visible = true;
      s.position.set(pts[i][0], pts[i][1], FRONT + 0.1);
      const k = 1 - i / fade;
      s.material.opacity = 0.35 + 0.6 * Math.min(1, k * 2);
      s.scale.setScalar(0.3 * (0.6 + 0.4 * k));
    }
  }

  function setTrail(pts) {
    for (let i = 0; i < trail.length; i++) {
      const s = trail[i];
      if (!pts || i >= pts.length) { s.visible = false; continue; }
      s.visible = true;
      s.position.set(pts[i][0], pts[i][1], -0.2);
      s.scale.setScalar(i % 3 === 0 ? 0.26 : 0.16);
    }
  }

  const mtx = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3();
  function update(dt) {
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.vy -= p.g * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.s.position.set(p.x, p.y, p.z);
      const k = p.life / p.max;
      p.s.scale.setScalar(p.size * (0.4 + 0.6 * k));
      p.s.material.opacity = Math.min(1, k * 1.6);
    }
    for (const mat in chunks) {
      const c = chunks[mat];
      let n = 0;
      for (let i = c.list.length - 1; i >= 0; i--) {
        const d = c.list[i];
        d.life -= dt;
        if (d.life <= 0) { c.list.splice(i, 1); continue; }
        d.vy -= 14 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        if (d.y < d.s / 2) { d.y = d.s / 2; d.vy *= -0.3; d.vx *= 0.6; d.spin *= 0.6; }
        d.r.x += d.spin * dt; d.r.z += d.spin * 0.7 * dt;
      }
      for (const d of c.list) {
        const s = d.s * Math.min(1, d.life * 2);
        q.setFromEuler(d.r);
        mtx.compose(v.set(d.x, d.y, d.z), q, sc.set(s, s, s));
        c.im.setMatrixAt(n++, mtx);
      }
      c.im.count = n;
      c.im.instanceMatrix.needsUpdate = true;
    }
    for (const b of bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.s.visible = false; continue; }
      const u = 1 - b.life / b.max;
      const pop = u < 0.15 ? u / 0.15 * 1.2 : u < 0.25 ? 1.2 - (u - 0.15) * 2 : 1;
      b.s.scale.setScalar(b.size * pop);
      b.s.position.set(b.x, b.y + u * 0.6, FRONT + 0.4);
      b.s.material.opacity = u > 0.7 ? (1 - u) / 0.3 : 1;
    }
    for (const p of pops) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const u = 1 - p.life / p.max;
      p.s.position.set(p.x, p.y + u * 1.4, FRONT + 0.5);
      p.s.scale.set(2.4 * p.size, 0.9 * p.size, 1);
      p.s.material.opacity = u > 0.65 ? (1 - u) / 0.35 : 1;
    }
    for (const e of emojis) {
      if (e.life <= 0) continue;
      e.life -= dt;
      if (e.life <= 0 || e.follow === false) { e.s.visible = false; e.life = 0; continue; }
      if (e.target) {
        e.x = e.target.x + (e.ox || 0);
        e.y = e.target.y + (e.oy || 0);
      } else {
        e.vy -= e.g * dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
      e.s.material.rotation += e.spin * dt;
      e.s.position.set(e.x, e.y, FRONT + 0.3);
      const k = e.life / e.max;
      e.s.scale.setScalar(e.size * (e.target ? 1 : 0.5 + 0.5 * Math.min(1, k * 3)));
      e.s.material.opacity = e.target ? 1 : Math.min(1, k * 3);
    }
  }

  function clear() {
    for (const p of [...parts, ...bursts, ...pops, ...emojis]) {
      p.life = 0;
      p.target = null;
      p.s.visible = false;
    }
    for (const mat in chunks) {
      chunks[mat].list.length = 0;
      chunks[mat].im.count = 0;
    }
    setGuide(null, 0);
    setTrail(null);
  }

  window.FX = { init, emit, debris, burst, popup, emoji, popHead, setGuide, setTrail, update, clear };
})();
