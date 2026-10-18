/* Angry TNT: the game. Screens, input (mouse, touch, keys), the side-on camera, the brothers (waiting in line, hopping
   onto the slingshot, curled into a ball in flight, standing up to celebrate), the powers, the zombie heads, the HUD,
   the companion (the other brother, called in with T or his button) and the window.game test hooks.
   The rules live in sim.js and the physics in physics.js; this file only draws them and reacts to their events. */
(function () {
  'use strict';
  const T = THREE;
  const People = Kit.people;
  const R = Kit.roster;
  const TITLE = window.TNT_TITLE;
  const LEVELS = window.LEVELS, WORLDS = window.WORLDS;

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------- saved progress
  const SAVE_KEY = 'angryTnt.save.v1';
  const save = (() => {
    const d = { stars: {}, best: {}, player: 'teddy', easy: true, played: false };
    try { return Object.assign(d, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { return d; }
  })();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } };

  // ---------------------------------------------------------------- game state
  const G = {
    screen: 'title', // title | levels | play | won | lost | paused
    li: 0, level: null, s: null, demo: false,
    cam: { x: 8, y: 6, d: 40 }, camMode: 'aim', introT: 0, shake: 0,
    drag: null, kb: { on: false, angle: 38, pull: 0.8 },
    time: 0, hold: false, autoPause: true, winT: -1, lostT: -1,
    blocksV: new Map(), headsV: new Map(), staticsV: [], bros: new Map(), followKey: null,
  };
  const buddyId = () => R.buddyFor(save.player);
  const NAME = (id) => R.get(id).name;

  // ---------------------------------------------------------------- the brothers
  const STAND = { teddy: 0.92, tommy: 0.78 }; // standing size
  // people face -z and the camera is on +z; all three angles sit on one side, so turning around faces the camera
  const FACE_RIGHT = -Math.PI / 2, FACE_LEFT = -1.5 * Math.PI, FACE_CAM = -Math.PI;
  const LINE_X = -2.0, LINE_GAP = 1.25, LINE_Z = 0.9;
  const curl = {}; // per brother: scale and centre of the curled-up model, so it fits his physics ball

  // Curled into a ball: the kit's roll pose, tucked tighter (knees to chest, arms hugging them, chin down).
  function ballPose(p, k) {
    People.pose(p, 0, 'roll', k);
    const to = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
    to(p.legL.rotation, 'x', 2.7);
    to(p.legR.rotation, 'x', 2.7);
    to(p.armL.rotation, 'x', 0.9);
    to(p.armR.rotation, 'x', 0.9);
    to(p.armL.rotation, 'z', 0.25);
    to(p.armR.rotation, 'z', -0.25);
    to(p.hips.rotation, 'x', -1.15);
    to(p.head.rotation, 'x', 0.75);
  }

  function curlFit(who, r) {
    const key = who + r;
    if (curl[key]) return curl[key];
    const p = People.build(R.get(who).look);
    ballPose(p, 1);
    p.root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(p.root);
    const c = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    const diam = Math.max(size.y, size.z);
    const sc = (2 * r * 1.12) / diam;
    p.root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); } });
    return (curl[key] = { sc, cx: c.x, cy: c.y, cz: c.z });
  }

  function makeBro(who, key, opts = {}) {
    const entry = R.get(who);
    const p = People.build(entry.look);
    p.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // root: position (no rotation, so the name tag stays upright); spin: the ball's roll; inner: which way he faces
    const root = new T.Group(), spin = new T.Group(), inner = new T.Group();
    inner.rotation.y = -Math.PI / 2;
    inner.add(p.root);
    spin.add(inner);
    root.add(spin);
    Scene.scene.add(root);
    const b = {
      who, key, p, root, spin, inner, mode: 'line', x: opts.x ?? -12, y: 0, z: LINE_Z, t: 0, ph: rnd(0, 6), face: -Math.PI / 2,
      r: opts.mini ? Sim.MINI_R : Sim.BROS[who].r, mini: !!opts.mini, curled: 0, hop: null, shot: null, tag: null,
      special: null, specialT: 0, cheer: 0, jumpT: 0, slot: 0,
    };
    if (opts.tag) {
      b.tag = Kit.gfx.nameTag(entry.name, entry.tag || '#ffb02e');
      b.tag.scale.multiplyScalar(1.5);
      root.add(b.tag);
    }
    G.bros.set(key ?? Symbol('bro'), b);
    return b;
  }

  function disposeBro(b) {
    Scene.scene.remove(b.root);
    b.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    if (b.tag) b.tag.material.map.dispose(), b.tag.material.dispose();
    for (const [k, v] of G.bros) if (v === b) G.bros.delete(k);
    if (b.emoji) b.emoji.life = 0;
  }

  // Place a brother: standing (curled = 0) means x, y are his feet; curled (1) means x, y are his ball's centre.
  function placeBro(b, x, y, z, spin = 0) {
    const s = STAND[b.who] * (b.mini ? 0.8 : 1);
    const c = curlFit(b.who, b.r);
    const k = b.curled;
    const sc = lerp(s, c.sc, k);
    b.p.root.scale.setScalar(sc);
    // standing: feet at the origin of root shifted down by the waist height; curled: ball centre at the origin
    b.p.root.position.set(lerp(0, -c.cx * c.sc, k), lerp(-0.55 * s, -c.cy * c.sc, k), lerp(0, -c.cz * c.sc, k));
    b.root.position.set(x, y + lerp(0.55 * s, 0, k), z);
    b.spin.rotation.z = spin;
    if (b.tag) b.tag.position.set(0, lerp(1.9 * s / 0.8, b.r + 0.8, k), 0.3);
  }

  const pouch = { x: Sim.SLING.x, y: Sim.SLING.y };

  // Where everyone in the queue should be: the first one in the pouch while aiming, the rest in line.
  function layoutQueue(dt) {
    const s = G.s;
    if (!s) return;
    const aiming = s.phase === 'aim';
    s.queue.forEach((q, i) => {
      const b = G.bros.get(q.key);
      if (!b || b.mode === 'visit') return;
      const wantPouch = aiming && i === 0;
      const slot = aiming ? i - 1 : i;
      // the next one hops in once he's close (latecomers run up first)
      if (wantPouch && b.mode === 'line' && Math.abs(b.x - pouch.x) < 3.5) hopTo(b, 'pouch', pouch.x, pouch.y, 0);
      else if (!wantPouch && b.mode === 'pouch') hopTo(b, 'line', LINE_X - slot * LINE_GAP, 0, LINE_Z);
      b.slot = slot;
    });
  }

  function hopTo(b, mode, x, y, z) {
    const d = Math.hypot(x - b.x, y - b.y);
    b.hop = { mode, x0: b.x, y0: b.y, z0: b.z, x1: x, y1: y, z1: z, t: 0, dur: 0.42 + d * 0.025, h: 1.4 + d * 0.06, c0: b.curled };
    b.mode = 'hop';
    SFX.hop();
  }

  const READY = () => {
    const s = G.s;
    if (!s || G.screen !== 'play' || s.phase !== 'aim' || !s.queue.length || G.demo) return false;
    const b = G.bros.get(s.queue[0].key);
    return !!(b && b.mode === 'pouch');
  };

  function updateBro(b, dt) {
    b.t += dt;
    let mode = 'idle', ph = b.ph, k = damp(14, dt), faceTo = FACE_RIGHT, spin = 0;
    if (b.mode === 'line') {
      const tx = LINE_X - b.slot * LINE_GAP;
      const dx = tx - b.x;
      if (Math.abs(dx) > 0.06) {
        b.x += Math.sign(dx) * Math.min(Math.abs(dx), (Math.abs(dx) > 3 ? 10 : 6) * dt);
        b.ph += dt * 11;
        mode = 'run';
        faceTo = dx > 0 ? FACE_RIGHT : FACE_LEFT;
      } else {
        mode = G.demo || G.winT >= 0 || b.cheer > 0 ? R.signature(R.get(b.who), Math.floor(b.t / 2.4) % 2 ? 'goodbye' : 'hello') : 'idle';
        if (mode !== 'idle') faceTo = FACE_CAM;
        b.ph += dt * (mode === 'boxing' ? 6 : 4);
      }
      b.y = 0;
      b.z = lerp(b.z, LINE_Z, damp(6, dt));
      b.curled = lerp(b.curled, 0, damp(10, dt));
      b.cheer = Math.max(0, b.cheer - dt);
    } else if (b.mode === 'hop') {
      const h = b.hop;
      h.t += dt / h.dur;
      const u = Math.min(1, h.t);
      b.x = lerp(h.x0, h.x1, u);
      b.y = lerp(h.y0, h.y1, u) + Math.sin(u * Math.PI) * h.h;
      b.z = lerp(h.z0, h.z1, u);
      const toPouch = h.mode === 'pouch';
      b.curled = toPouch ? clamp(u * 1.6, h.c0, 1) : lerp(h.c0, 0, Math.min(1, u * 2));
      mode = toPouch && u > 0.4 ? 'roll' : 'jump';
      spin = toPouch ? -u * Math.PI * 2 * 0.0 : 0;
      faceTo = h.x1 >= h.x0 ? FACE_RIGHT : FACE_LEFT;
      if (u >= 1) {
        b.mode = h.mode;
        b.hop = null;
        if (b.mode === 'pouch') SFX.land();
      }
    } else if (b.mode === 'pouch') {
      b.x = pouch.x;
      b.y = pouch.y;
      b.z = 0;
      b.curled = 1;
      mode = 'roll';
      spin = Math.sin(b.t * 2) * 0.08;
    } else if (b.mode === 'ball') {
      const sh = b.shot, body = sh.body;
      b.x = body.x;
      b.y = body.y;
      b.z = 0;
      spin = body.a;
      if (sh.punch) {
        // Teddy's dash: uncurled, fist first
        mode = 'straight';
        b.curled = lerp(b.curled, 0.35, damp(20, dt));
        spin = Math.atan2(sh.punch.dy, sh.punch.dx) - 0.25;
        b.ph = 0;
      } else if (b.specialT > 0) {
        // Tommy's Y pose as he splits
        b.specialT -= dt;
        mode = 'peace';
        faceTo = FACE_CAM;
        b.curled = lerp(b.curled, 0.3, damp(20, dt));
        spin = 0;
      } else {
        mode = 'roll';
        b.curled = lerp(b.curled, 1, damp(16, dt));
      }
      k = damp(24, dt);
    } else if (b.mode === 'stand') {
      // landed: he stands up, does his signature move, then pops off in a puff
      b.curled = lerp(b.curled, 0, damp(10, dt));
      b.standT += dt;
      mode = b.standT < 0.35 ? 'jump' : R.signature(R.get(b.who), b.mini ? 'hello' : 'goodbye');
      if (mode === 'jumpshot' && b.who === 'teddy') mode = 'boxing';
      faceTo = FACE_CAM;
      b.ph += dt * (mode === 'boxing' ? 6 : 4);
      if (b.standT > 2.1) {
        FX.emit(b.x, b.y + 0.8, 18, { color: ['#ffffff', '#ffd400'], speed: 3, up: 1.5, life: 0.6, size: 0.4 });
        SFX.poof();
        disposeBro(b);
        return;
      }
    } else if (b.mode === 'visit') {
      updateVisit(b, dt);
      return;
    } else if (b.mode === 'leave') {
      b.x -= 8 * dt;
      b.ph += dt * 11;
      mode = 'run';
      faceTo = FACE_LEFT;
      b.curled = lerp(b.curled, 0, damp(10, dt));
      if (b.x < G.cam.x - 60) { disposeBro(b); return; }
    }
    if (b.jumpT > 0) {
      b.jumpT -= dt;
      mode = 'jump';
    }
    b.face = lerp(b.face, faceTo, damp(10, dt));
    b.inner.rotation.y = b.face;
    if (mode === 'roll') ballPose(b.p, k);
    else People.pose(b.p, b.ph, mode, k);
    if (b.mode === 'line' && mode !== 'run' && mode !== 'idle') {
      // standing celebrations: settle the legs (the kit's peace / wave poses stride)
      b.p.legL.rotation.x *= 0.35;
      b.p.legR.rotation.x *= 0.35;
    }
    let hopY = 0;
    if (b.jumpT > 0) hopY = Math.sin((b.jumpT / 0.5) * Math.PI) * 1.2;
    if (b.mode === 'line' && mode === 'idle') hopY = Math.abs(Math.sin(b.t * 3 + b.ph)) * 0.06;
    placeBro(b, b.x, b.y + hopY, b.z, spin);
  }

  // ---------------------------------------------------------------- level setup and teardown

  function clearLevel() {
    for (const m of G.blocksV.values()) { Scene.scene.remove(m); m.geometry.dispose(); }
    for (const h of G.headsV.values()) { Scene.scene.remove(h); Scene.disposeGroup(h); }
    for (const m of G.staticsV) { Scene.scene.remove(m); Scene.disposeGroup(m); }
    for (const b of [...G.bros.values()]) disposeBro(b);
    G.blocksV.clear();
    G.headsV.clear();
    G.staticsV = [];
    G.bros.clear();
    FX.clear();
    endVisit(true);
    G.drag = null;
    G.kb.on = false;
    G.winT = G.lostT = -1;
    G.followKey = null;
    G.lastTrail = null;
  }

  function startLevel(i, opts = {}) {
    clearLevel();
    G.li = clamp(i, 0, LEVELS.length - 1);
    const L = (G.level = LEVELS[G.li]);
    G.demo = !!opts.demo;
    Scene.setWorld(L.world);
    G.s = Sim.create(L, { first: save.player, easy: save.easy });
    G.s.buddy = buddyId();
    for (const b of G.s.blocks) {
      const m = Scene.makeBlock(b);
      Scene.scene.add(m);
      G.blocksV.set(b, m);
    }
    for (const h of G.s.heads) {
      const g = Scene.makeHead(h.look, h.size);
      Scene.scene.add(g);
      G.headsV.set(h, g);
    }
    for (const st of L.statics) {
      const m = Scene.makeStatic(st);
      Scene.scene.add(m);
      G.staticsV.push(m);
    }
    G.s.queue.forEach((q, n) => {
      const b = makeBro(q.who, q.key, { x: LINE_X - n * LINE_GAP });
      b.slot = n;
    });
    syncVisuals(0);
    G.camMode = G.demo ? 'aim' : 'intro';
    G.introT = 0;
    const v = G.demo ? aimView() : structureView();
    Object.assign(G.cam, v);
    applyCamera(0);
    if (!G.demo) {
      setScreen('play');
      toast(`${L.id} ${L.name.toUpperCase()}`, 'big');
      Kit.sound.music('play');
    }
    G.hintOn = !G.demo && (!save.played || G.li === 0);
    updateHudStatic();
  }

  // ---------------------------------------------------------------- camera

  // frame a rectangle, leaving room on the right for the buddy button (bottom right) on narrow screens
  function framed(x0, x1, y0, y1) {
    const pad = clamp(120 / Math.max(320, innerWidth || 800), 0.04, 0.2);
    const v = Scene.frame(x0, x1 + (x1 - x0) * pad, y0, y1);
    // portrait: the action sits a little below the middle instead of at the very bottom under a tall sky
    if (Scene.camera.aspect < 1) v.y = Math.min(v.y, (y0 + y1) / 2 + 3);
    return v;
  }
  function aimView() {
    const L = G.level;
    return framed(-7, L.right + 3, -1.6, Math.max(L.top + 2.5, 9));
  }
  function structureView() {
    const L = G.level;
    return framed(Math.min(L.left - 5, L.right - 18), L.right + 3, -1.6, Math.max(L.top + 2.5, 9));
  }
  function followView() {
    const s = G.s, L = G.level;
    const live = s.shots.filter((sh) => !sh.done);
    if (!live.length) return structureView();
    let x = 0, y = 0;
    for (const sh of live) { x += sh.body.x; y += sh.body.y; }
    x /= live.length;
    y /= live.length;
    const aim = aimView();
    const halfW = Math.min(11, (L.right + 10) / 2);
    let x0 = x - halfW * 0.8, x1 = x + halfW * 1.2;
    if (x0 < -7) { x1 += -7 - x0; x0 = -7; }
    if (x1 > L.right + 6) { x0 -= x1 - (L.right + 6); x1 = L.right + 6; }
    const v = framed(x0, x1, -1.6, Math.max(L.top + 2.5, 9, y + 3));
    return v.d > aim.d ? aim : v;
  }

  function cameraTarget() {
    if (G.screen === 'title' || G.screen === 'levels' || G.demo) return aimView();
    switch (G.camMode) {
      case 'intro': return G.introT < 1.3 ? structureView() : aimView();
      case 'follow': return followView();
      case 'settle': return structureView();
      default: return aimView();
    }
  }

  function applyCamera(dt) {
    const tgt = G.look || cameraTarget();
    const k = dt ? damp(G.camMode === 'follow' ? 4 : 2.6, dt) : 1;
    G.cam.x = lerp(G.cam.x, tgt.x, k);
    G.cam.y = lerp(G.cam.y, tgt.y, k);
    G.cam.d = lerp(G.cam.d, tgt.d, k);
    const sh = G.shake > 0 ? G.shake * 0.35 : 0;
    Scene.camera.position.set(G.cam.x + rnd(-sh, sh), G.cam.y + rnd(-sh, sh), G.cam.d);
    Scene.camera.rotation.set(0, 0, 0);
    Scene.camera.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- aiming

  const maxDragPx = () => clamp(Math.min(innerWidth, innerHeight) * 0.24, 90, 210);

  function setPull(dx, dy) {
    const d = Math.hypot(dx, dy), max = Sim.MAX_PULL;
    if (d > max) { dx *= max / d; dy *= max / d; }
    dx = Math.min(dx, 0.5); // you can't push the pouch forward through the fork
    pouch.x = Sim.SLING.x + dx;
    pouch.y = Math.max(0.8, Sim.SLING.y + dy);
    return { dx: pouch.x - Sim.SLING.x, dy: pouch.y - Sim.SLING.y };
  }

  function currentPull() {
    return { dx: pouch.x - Sim.SLING.x, dy: pouch.y - Sim.SLING.y };
  }

  function fire() {
    const { dx, dy } = currentPull();
    if (Math.hypot(dx, dy) < 0.45) return false;
    const shot = Sim.launchFromPull(G.s, dx, dy);
    if (!shot) return false;
    save.played = true;
    persist();
    G.hintOn = false;
    return true;
  }

  function releasePouch() {
    pouch.x = Sim.SLING.x;
    pouch.y = Sim.SLING.y;
  }

  function guidePoints() {
    const { dx, dy } = currentPull();
    const d = Math.hypot(dx, dy);
    if (d < 0.3) return null;
    const v = Sim.launchVelocity(dx, dy);
    const pts = [];
    for (let i = 1; i < 60; i++) {
      const t = i * 0.055, x = pouch.x + v.vx * t, y = pouch.y + v.vy * t - 5 * t * t;
      if (y < -0.5 || x > G.level.right + 12) break;
      pts.push([x, y]);
    }
    return pts;
  }

  // ---------------------------------------------------------------- input

  const canvas = $('game');
  let lastStretch = 0;

  function onDown(e) {
    Kit.sound.init();
    if (G.screen !== 'play' || G.demo) return;
    if (G.camMode === 'intro') G.camMode = 'aim';
    const s = G.s;
    if (s.phase === 'fly') {
      tryPower();
      return;
    }
    if (!READY() || G.drag) return;
    G.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY };
    G.kb.on = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events have no pointer */ }
  }

  function onMove(e) {
    if (!G.drag || e.pointerId !== G.drag.id) return;
    const k = Sim.MAX_PULL / maxDragPx();
    const p = setPull((e.clientX - G.drag.sx) * k, -(e.clientY - G.drag.sy) * k);
    const amt = Math.hypot(p.dx, p.dy) / Sim.MAX_PULL;
    if (Math.abs(amt - lastStretch) > 0.12) {
      SFX.stretch(amt);
      lastStretch = amt;
    }
    G.hintOn = false;
  }

  function onUp(e) {
    if (!G.drag || (e && e.pointerId !== G.drag.id)) return;
    G.drag = null;
    lastStretch = 0;
    if (READY()) fire();
    releasePouch();
  }

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function tryPower() {
    if (!G.s || !Sim.canPower(G.s)) return false;
    return Sim.power(G.s);
  }

  function kbAim() {
    G.kb.on = true;
    const a = (G.kb.angle * Math.PI) / 180, d = G.kb.pull * Sim.MAX_PULL;
    setPull(-Math.cos(a) * d, -Math.sin(a) * d);
  }

  window.addEventListener('keydown', (e) => {
    Kit.sound.init();
    const k = e.key;
    if (k === 'm' || k === 'M') return toggleMute();
    if (G.screen === 'title') {
      if (k === 'Enter' || k === ' ') { e.preventDefault(); openLevels(); }
      else if (k === 'ArrowLeft' || k === 'ArrowRight') pickPlayer(save.player === 'teddy' ? 'tommy' : 'teddy');
      return;
    }
    if (G.screen === 'levels') {
      if (k === 'Escape') setScreen('title');
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); startLevel(nextUnplayed()); }
      return;
    }
    if (G.screen === 'won') {
      if (k === 'Enter' || k === ' ' || k === 'n' || k === 'N') { e.preventDefault(); nextLevel(); }
      else if (k === 'r' || k === 'R') startLevel(G.li);
      else if (k === 'Escape') openLevels();
      else if (k === 't' || k === 'T') callBuddy();
      return;
    }
    if (G.screen === 'lost') {
      if (k === 'Enter' || k === ' ' || k === 'r' || k === 'R') { e.preventDefault(); startLevel(G.li); }
      else if (k === 't' || k === 'T') callBuddy();
      else if (k === 'Escape') openLevels();
      return;
    }
    if (G.screen === 'paused') {
      if (k === 'Escape' || k === 'p' || k === 'P' || k === 'Enter' || k === ' ') { e.preventDefault(); resume(); }
      return;
    }
    if (G.screen !== 'play') return;
    if (k === 'Escape' || k === 'p' || k === 'P') return pause();
    if (k === 'r' || k === 'R') return startLevel(G.li);
    if (k === 't' || k === 'T') return callBuddy();
    if (G.camMode === 'intro' && (k === ' ' || k === 'Enter' || k.startsWith('Arrow'))) G.camMode = 'aim';
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      if (!READY()) return;
      G.kb.angle = clamp(G.kb.angle + (k === 'ArrowUp' ? 3 : -3), -10, 80);
      kbAim();
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      if (!READY()) return;
      G.kb.pull = clamp(G.kb.pull + (k === 'ArrowLeft' ? 0.06 : -0.06), 0.3, 1);
      kbAim();
    } else if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (G.s.phase === 'fly') return tryPower();
      if (!READY()) return;
      if (!G.kb.on) return kbAim();
      if (fire()) releasePouch();
      G.kb.on = false;
    }
  });

  // ---------------------------------------------------------------- sim events -> effects

  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE BOX'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  let lastOuch = 0;

  function handleEvents() {
    const s = G.s;
    if (!s) return;
    const evs = s.events.splice(0);
    for (const ev of evs) {
      switch (ev.type) {
        case 'launch': {
          const b = G.bros.get(ev.shot.key);
          if (b) {
            b.mode = 'ball';
            b.shot = ev.shot;
            b.hop = null;
            b.curled = 1;
          }
          G.followKey = ev.shot.key;
          G.camMode = 'follow';
          G.lastTrail = ev.shot.trail;
          if (!G.demo) SFX.launch();
          FX.emit(ev.shot.body.x, ev.shot.body.y, 10, { color: '#ffffff', speed: 2, up: 0.5, life: 0.4, size: 0.3 });
          break;
        }
        case 'punch': {
          const b = G.bros.get(ev.shot.key);
          SFX.punch();
          FX.burst('POW!', ev.shot.body.x + 1, ev.shot.body.y + 0.6, '#ff5a5a', 2.2);
          if (b) attachEmoji(b, '💥', 1.1, 0.2, 0.6);
          G.shake = Math.max(G.shake, 0.4);
          break;
        }
        case 'punchEnd': {
          const b = G.bros.get(ev.shot.key);
          if (b && b.emoji) b.emoji.life = 0;
          break;
        }
        case 'split': {
          const main = G.bros.get(ev.shot.key);
          SFX.split();
          FX.emit(ev.shot.body.x, ev.shot.body.y, 22, { color: ['#c3d6cf', '#ffffff', '#ffd400'], speed: 4, up: 1, life: 0.6, size: 0.4 });
          if (main) {
            main.specialT = 0.45;
            attachEmoji(main, '✌️', 0, 0.95, 0.7);
          }
          for (const mini of ev.minis) {
            const b = makeBro(mini.who, mini.key, { mini: true, x: mini.body.x });
            b.mode = 'ball';
            b.shot = mini;
            b.curled = 0.3;
            b.specialT = 0.45;
            attachEmoji(b, '✌️', 0, 0.8, 0.55);
          }
          break;
        }
        case 'break': {
          const m = G.blocksV.get(ev.block);
          if (m) { Scene.scene.remove(m); m.geometry.dispose(); G.blocksV.delete(ev.block); }
          FX.debris(ev.mat, ev.x, ev.y, ev.w, ev.h, ev.a, Math.round(clamp(ev.w * ev.h * 7, 4, 12)));
          FX.emit(ev.x, ev.y, 10, { color: ev.mat === 'ice' ? '#e9fbff' : ev.mat === 'stone' ? '#c9ced6' : '#e8c79e', speed: 2.5, up: 1, life: 0.7, size: 0.6, gravity: 1 });
          if (!G.demo) SFX.break(ev.mat);
          if (ev.cause === 'punch') {
            FX.burst(ev.mat === 'stone' ? 'SMASH!' : 'POW!', ev.x - 0.3, ev.y + 0.2, '#ff8a1f', 2.0);
            FX.popup(ev.points, ev.x + 0.6, ev.y + 1.6, '#ffffff', 0.8);
            SFX.smash();
            G.shake = Math.max(G.shake, 0.5);
          } else FX.popup(ev.points, ev.x, ev.y + 0.4, '#ffffff', 0.8);
          break;
        }
        case 'pop': {
          const g = G.headsV.get(ev.head);
          if (g) { Scene.scene.remove(g); Scene.disposeGroup(g); G.headsV.delete(ev.head); }
          FX.popHead(ev.x, ev.y, ev.head.size);
          FX.popup(ev.points, ev.x, ev.y + 1.2, '#ffd400', 1.1);
          if (!G.demo) SFX.pop();
          G.shake = Math.max(G.shake, 0.25);
          if (BUD.on && BUD.m && BUD.m.mode !== 'ball') BUD.m.jumpT = 0.5;
          break;
        }
        case 'hit':
          if (!G.demo) SFX.hit(ev.mat, ev.e);
          if (ev.e > 8) FX.emit(ev.x, ev.y, 4, { color: '#ffffff', speed: 1.5, up: 0.5, life: 0.4, size: 0.4, gravity: 1 });
          break;
        case 'ouch': {
          const g = G.headsV.get(ev.head);
          if (g) g.userData.squash = 0.3;
          if (performance.now() - lastOuch > 150) { SFX.ouch(); lastOuch = performance.now(); }
          break;
        }
        case 'bump':
          SFX.bump(ev.e);
          break;
        case 'shotDone': {
          const b = G.bros.get(ev.shot.key);
          if (!b) break;
          if (b.emoji) b.emoji.life = 0;
          if (ev.out) { disposeBro(b); break; }
          b.mode = 'stand';
          b.standT = 0;
          b.shot = null;
          b.x = ev.x;
          b.y = Math.max(0, ev.y - b.r);
          b.z = 0.3;
          break;
        }
        case 'turn':
          G.camMode = 'aim';
          break;
        case 'addShot':
          if (!G.bros.has(ev.q.key)) {
            const b = makeBro(ev.q.who, ev.q.key, { tag: ev.q.bonus, x: -11 });
            b.slot = 0;
          }
          break;
        case 'saved':
          toast(`${NAME(s.buddy)} SAVED YOU!`, 'buddy');
          SFX.arrive();
          G.camMode = 'aim';
          break;
        case 'won':
          onWon(ev);
          break;
        case 'lost':
          G.lostT = 0;
          SFX.lose();
          break;
      }
    }
    if (s.phase === 'settle' && G.camMode === 'follow') G.camMode = 'settle';
  }

  // an emoji that rides along with a brother
  function attachEmoji(b, e, ox, oy, size) {
    const p = FX.emoji(e, b.x, b.y, { life: 60, size });
    if (!p) return;
    p.target = b.root.position;
    p.ox = ox;
    p.oy = oy;
    b.emoji = p;
  }

  // ---------------------------------------------------------------- the companion (the other brother)
  // Tap his button or T: he runs in with a name tag, says hi with his signature move, hands over a treat, then hops
  // onto the slingshot as a bonus shot. While he's here (about 10 s, the bar with his face in the HUD) a level that
  // would be lost for want of shots gives you one more instead: "TOMMY SAVED YOU!". Tapping again brings another
  // treat. From the "SO CLOSE!" screen, calling him brings one more shot too.

  const VISIT = 10;
  const BUD = { on: false, t: 0, m: null, given: false, hopped: false, lastTreat: -9, revived: false, treat: null };

  function callBuddy() {
    Kit.sound.init();
    if (G.screen === 'lost') return reviveWithBuddy();
    if (G.screen !== 'play' || G.demo || !G.s) return;
    if (G.s.phase === 'won' || G.s.phase === 'lost') return;
    if (!BUD.on) return summon();
    if (BUD.t - BUD.lastTreat > 0.7) giveTreat();
  }

  function summon(revive) {
    const who = buddyId();
    const m = makeBro(who, null, { tag: true, x: -11 });
    m.mode = 'visit';
    m.z = 1.3;
    Object.assign(BUD, { on: true, t: 0, m, given: false, hopped: false, lastTreat: -9, revived: !!revive });
    G.s.guard = true;
    G.s.buddy = who;
    toast(`${NAME(who)}'S HERE!`, 'buddy');
    SFX.arrive();
    return m;
  }

  function reviveWithBuddy() {
    if (!G.s || G.s.phase !== 'lost') return;
    const who = buddyId();
    setScreen('play');
    G.lostT = -1;
    const m = summon(true);
    // the revive adds the shot right away; he is that shot once he has said hi
    Sim.revive(G.s, who);
    const q = G.s.queue[0];
    G.bros.delete([...G.bros].find(([, v]) => v === m)[0]);
    G.bros.set(q.key, m);
    m.key = q.key;
    BUD.preKey = q.key;
    G.camMode = 'aim';
    Kit.sound.music('play');
  }

  function updateVisit(m, dt) {
    const t = BUD.t;
    let mode = 'run', faceTo = FACE_RIGHT;
    const tx = 2.3;
    if (Math.abs(tx - m.x) > 0.1 && t < 3.2) {
      m.x += Math.sign(tx - m.x) * Math.min(Math.abs(tx - m.x), 11 * dt);
      m.ph += dt * 12;
    } else if (t < 3.0 || !BUD.given) {
      mode = R.signature(R.get(m.who), 'hello');
      faceTo = FACE_CAM;
      m.ph += dt * (mode === 'boxing' ? 6 : 4);
      if (!BUD.given && t > 2.4) giveTreat();
    } else {
      mode = 'idle';
      faceTo = FACE_CAM;
    }
    if (!BUD.hopped && BUD.given && t > 3.3) hopOn();
    m.y = 0;
    m.curled = 0;
    m.face = lerp(m.face, faceTo, damp(10, dt));
    m.inner.rotation.y = m.face;
    People.pose(m.p, m.ph, mode, damp(14, dt));
    if (mode !== 'run') { m.p.legL.rotation.x *= 0.35; m.p.legR.rotation.x *= 0.35; }
    let hopY = 0;
    if (m.jumpT > 0) { m.jumpT -= dt; hopY = Math.sin((m.jumpT / 0.5) * Math.PI) * 1.0; }
    placeBro(m, m.x, hopY, m.z, 0);
  }

  // He hops onto the slingshot: a bonus shot. If you're pulling the pouch right now he waits his turn behind it.
  function hopOn() {
    BUD.hopped = true;
    const s = G.s, m = BUD.m;
    if (!s || s.phase === 'won' || s.phase === 'lost') { m.mode = 'leave'; return; }
    if (!BUD.preKey) {
      const index = s.phase === 'aim' && (G.drag || G.kb.on) ? 1 : 0;
      const q = Sim.addShot(s, m.who, { bonus: true, index });
      for (const [k, v] of G.bros) if (v === m) G.bros.delete(k);
      G.bros.set(q.key, m);
      m.key = q.key;
      toast(`+1 SHOT! ${NAME(m.who)} HOPS ON!`, 'buddy');
    }
    BUD.preKey = null;
    m.mode = 'line';
    m.slot = 0;
  }

  function giveTreat() {
    BUD.given = true;
    BUD.lastTreat = BUD.t;
    const [emoji, label] = TREATS[Math.floor(Math.random() * TREATS.length)];
    const from = BUD.m;
    // to whoever is up next (not the buddy himself)
    let to = null;
    for (const q of G.s ? G.s.queue : []) {
      const b = G.bros.get(q.key);
      if (b && b !== from) { to = b; break; }
    }
    if (!to) to = [...G.bros.values()].find((b) => b !== from && b.mode !== 'ball') || null;
    const fx = from.root.position.x, fy = from.root.position.y + 0.6;
    const tx = to ? to.root.position.x : fx - 3, ty = to ? to.root.position.y + 0.4 : fy;
    const dur = 0.8, g = 9;
    const p = FX.emoji(emoji, fx, fy, { vx: (tx - fx) / dur, vy: (ty - fy) / dur + 0.5 * g * dur, gravity: g, life: dur, size: 1.5, spin: -4 });
    BUD.treat = { t: 0, dur, to, emoji: p };
    toast(`${emoji} ${label} FROM ${NAME(from.who)}!`, 'buddy');
    SFX.treat();
  }

  function updateBuddy(dt) {
    if (BUD.treat) {
      BUD.treat.t += dt;
      if (BUD.treat.t >= BUD.treat.dur) {
        const to = BUD.treat.to;
        if (to && G.bros.has(to.key) && to.root.parent) {
          FX.emit(to.root.position.x, to.root.position.y + 0.5, 16, { color: ['#ffffff', '#ffd400', '#ff9ec4'], speed: 3, up: 2, life: 0.6, size: 0.35 });
          if (to.mode === 'line') to.jumpT = 0.5;
          FX.popup('YUM!', to.root.position.x, to.root.position.y + 1.2, '#ff9ec4', 0.8);
        }
        BUD.treat = null;
      }
    }
    if (!BUD.on) return;
    BUD.t += dt;
    if (BUD.t >= VISIT) endVisit(false);
  }

  function endVisit(silent) {
    if (!BUD.on) return;
    BUD.on = false;
    if (G.s) G.s.guard = false;
    const m = BUD.m;
    BUD.m = null;
    if (silent || !m) return;
    toast(`BYE, ${NAME(m.who)}! 👋`, 'buddy');
    if (m.mode === 'visit') m.mode = 'leave';
    else if (m.mode === 'line') m.cheer = 2.4; // still waiting his turn: he waves from the line
  }

  // ---------------------------------------------------------------- winning and losing

  function onWon(ev) {
    G.winT = 0;
    G.winEv = ev;
    G.camMode = 'aim';
    G.bonusQueue = ev.bonuses.slice();
    G.bonusT = 0.9;
    SFX.win();
    toast('ALL ZOMBIES BONKED!', 'big');
    for (const b of G.bros.values()) b.cheer = 30;
    endVisit(true);
    const id = G.level.id;
    G.newBest = ev.score > (save.best[id] || 0);
    save.best[id] = Math.max(save.best[id] || 0, ev.score);
    save.stars[id] = Math.max(save.stars[id] || 0, ev.stars);
    persist();
  }

  function updateEnd(dt) {
    if (G.winT >= 0 && G.screen === 'play') {
      G.winT += dt;
      // each brother you didn't need jumps for a bonus
      G.bonusT -= dt;
      if (G.bonusT <= 0 && G.bonusQueue.length) {
        const bq = G.bonusQueue.shift();
        const b = G.bros.get(bq.key);
        if (b) {
          b.jumpT = 0.5;
          FX.popup(bq.points, b.root.position.x, b.root.position.y + 1.6, '#58d36a', 1);
          FX.emit(b.root.position.x, b.root.position.y + 1, 14, { color: ['#ffd400', '#ffffff'], speed: 3, up: 2, life: 0.6 });
        }
        SFX.bonus(5 - G.bonusQueue.length);
        G.bonusT = 0.55;
      }
      if (!G.bonusQueue.length && G.bonusT < -0.8) showWon();
    }
    if (G.lostT >= 0 && G.screen === 'play') {
      G.lostT += dt;
      if (G.lostT > 1.0) showLost();
    }
  }

  function showWon() {
    const ev = G.winEv;
    setScreen('won');
    G.winT = -1;
    const last = G.li === LEVELS.length - 1;
    $('wonTitle').textContent = last ? 'YOU BEAT THE KING!' : 'LEVEL CLEAR!';
    $('wonNext').textContent = last ? '🏰 LEVELS' : 'NEXT ▶';
    $('wonScore').textContent = ev.score.toLocaleString();
    $('newBest').classList.toggle('hidden', !G.newBest);
    const stars = $('stars').children;
    for (const st of stars) st.classList.remove('on');
    for (let i = 0; i < ev.stars; i++) {
      setTimeout(() => {
        if (G.screen !== 'won') return;
        stars[i].classList.add('on');
        SFX.star(i);
      }, 350 + i * 420);
    }
  }

  function showLost() {
    G.lostT = -1;
    setScreen('lost');
    Kit.sound.music('over');
  }

  function nextLevel() {
    if (G.li >= LEVELS.length - 1) return openLevels();
    startLevel(G.li + 1);
  }

  const nextUnplayed = () => {
    const i = LEVELS.findIndex((L) => !save.stars[L.id]);
    return i < 0 ? 0 : i;
  };

  // ---------------------------------------------------------------- visuals from the sim

  function syncVisuals(dt) {
    const s = G.s;
    if (!s) return;
    for (const [b, m] of G.blocksV) {
      const body = b.body;
      m.position.set(body.x, body.y, 0);
      m.rotation.z = body.a;
      const f = b.hp / b.maxHp;
      Scene.setBlockStage(m, f > 0.66 ? 0 : f > 0.33 ? 1 : 2);
    }
    for (const [h, g] of G.headsV) {
      const body = h.body;
      g.position.set(body.x, body.y, 0);
      g.rotation.z = body.a;
      const u = g.userData;
      u.squash = Math.max(0, (u.squash || 0) - dt);
      const sq = Math.sin((u.squash / 0.3) * Math.PI) * 0.18;
      u.inner.scale.set(1 + sq, 1 - sq, 1 + sq).multiplyScalar(h.size / 0.5);
      // idle: a little wobble; dizzy when hurt
      const hurt = h.hp < h.maxHp * 0.5;
      u.inner.rotation.y = Math.sin(G.time * (hurt ? 5 : 1.6) + h.id * 1.7) * (hurt ? 0.3 : 0.12);
      u.inner.rotation.z = hurt ? Math.sin(G.time * 4 + h.id) * 0.1 : 0;
    }
  }

  // ---------------------------------------------------------------- HUD

  const ui = {};
  const hudCache = {};
  const setText = (el, key, v) => { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } };
  let thumbs = {};

  function toast(text, cls) {
    if (G.demo) return;
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    ui.toasts.appendChild(el);
    setTimeout(() => el.remove(), 1650);
    while (ui.toasts.children.length > 3) ui.toasts.firstChild.remove();
  }

  function updateHudStatic() {
    const L = G.level;
    if (!L) return;
    setText(ui.lvlName, 'lvl', `${L.id} ${L.name.toUpperCase()}`);
    setText(ui.best, 'best', `BEST ${(save.best[L.id] || 0).toLocaleString()}`);
    const bid = buddyId();
    ui.buddyFace.src = ui.pwFace.src = ui.saveFace.src = thumbs[bid];
    setText(ui.buddyName, 'bname', NAME(bid));
    ui.buddyBtn.title = `Call ${NAME(bid)} (T)`;
    setText(ui.saveTxt, 'save', `CALL ${NAME(bid)}: +1 SHOT!`);
  }

  function updateHud() {
    const s = G.s;
    if (!s || G.demo) return;
    setText(ui.score, 'score', s.score.toLocaleString());
    const left = Sim.headsLeft(s);
    setText(ui.heads, 'heads', `🧟 × ${left}`);
    const qkey = s.queue.map((q) => q.key + (q.bonus ? 'b' : '') + q.who).join(',') + s.phase;
    if (hudCache.queue !== qkey) {
      hudCache.queue = qkey;
      ui.queue.innerHTML = '';
      s.queue.forEach((q, i) => {
        const d = document.createElement('div');
        d.className = `q ${q.who}${q.bonus ? ' bonus' : ''}${i === 0 && s.phase === 'aim' ? ' now' : ''}`;
        const img = document.createElement('img');
        img.src = thumbs[q.who];
        img.alt = q.who;
        d.appendChild(img);
        ui.queue.appendChild(d);
      });
    }
    const canP = Sim.canPower(s);
    ui.power.classList.toggle('on', canP);
    if (canP) {
      const m = s.shots.find((sh) => sh.main && !sh.done);
      setText(ui.power, 'power', m && m.power === 'punch' ? '👊 PUNCH!' : '✌️ SPLIT!');
    }
    ui.pwBuddy.classList.toggle('on', BUD.on);
    ui.buddyBtn.classList.toggle('guarding', BUD.on);
    if (BUD.on) {
      ui.pwFill.style.transform = `scaleX(${clamp(1 - BUD.t / VISIT, 0, 1)})`;
      setText(ui.pwLbl, 'pwl', `${NAME(BUD.m ? BUD.m.who : buddyId())} HAS YOUR BACK`);
    }
    // the "pull back" hint sits by the slingshot
    const showHint = G.hintOn && READY() && !G.drag && !G.kb.on && G.camMode !== 'intro';
    ui.hint.classList.toggle('hidden', !showHint);
    if (showHint) {
      const v = new T.Vector3(Sim.SLING.x, Sim.SLING.y + 1.2, 0).project(Scene.camera);
      ui.hint.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      ui.hint.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    }
    ui.rotate.classList.toggle('on', G.screen === 'play' && innerHeight > innerWidth);
  }

  // ---------------------------------------------------------------- screens

  function setScreen(name) {
    G.screen = name;
    for (const id of ['title', 'levels', 'won', 'lost', 'paused']) $(id).classList.toggle('hidden', id !== name);
    ui.hud.classList.toggle('hidden', !(name === 'play' || name === 'paused') || G.demo);
    if (name === 'title' || name === 'levels') Kit.sound.music('title');
  }

  function pickPlayer(id) {
    save.player = id;
    persist();
    for (const c of ui.pick.children) c.classList.toggle('on', c.dataset.id === id);
    SFX.click();
    if (G.s) G.s.buddy = buddyId();
    updateHudStatic();
  }

  function setEasy(on) {
    save.easy = on;
    persist();
    for (const b of $('diff').children) b.classList.toggle('on', (b.dataset.easy === '1') === on);
  }

  function openLevels() {
    SFX.click();
    if (!G.demo) startLevel(0, { demo: true });
    buildLevelGrid();
    setScreen('levels');
  }

  function buildLevelGrid() {
    const box = $('worlds');
    box.innerHTML = '';
    let total = 0;
    for (const w of WORLDS) {
      const div = document.createElement('div');
      div.className = 'world';
      const ls = LEVELS.map((L, i) => [L, i]).filter(([L]) => L.world === w.id);
      const got = ls.reduce((n, [L]) => n + (save.stars[L.id] || 0), 0);
      total += got;
      div.innerHTML = `<h3>${w.emoji} ${w.name} <span>⭐ ${got}/${ls.length * 3}</span></h3>`;
      const grid = document.createElement('div');
      grid.className = 'lvls';
      for (const [L, i] of ls) {
        const b = document.createElement('button');
        b.className = `lv ${w.id}`;
        const st = save.stars[L.id] || 0;
        b.innerHTML = `<b>${L.id}</b><i>${L.name}</i><span class="st">${'<em>★</em>'.repeat(st)}${'★'.repeat(3 - st)}</span>`;
        b.addEventListener('click', () => { Kit.sound.init(); SFX.click(); startLevel(i); });
        grid.appendChild(b);
      }
      div.appendChild(grid);
      box.appendChild(div);
    }
    $('totalStars').textContent = `⭐ ${total} / ${LEVELS.length * 3}`;
  }

  function pause() {
    if (G.screen !== 'play') return;
    setScreen('paused');
    Kit.sound.music('pause');
  }
  function resume() {
    if (G.screen !== 'paused') return;
    setScreen('play');
    Kit.sound.music('play');
  }
  function goHome() {
    startLevel(0, { demo: true });
    setScreen('title');
  }

  function toggleMute() {
    const m = Kit.sound.toggleMute();
    ui.sound.textContent = m ? '🔇' : '🔊';
  }

  function bindUi() {
    Object.assign(ui, {
      hud: $('hud'), toasts: $('toasts'), lvlName: $('lvlName'), heads: $('headsLeft'), score: $('score'), best: $('best'),
      queue: $('queue'), power: $('powerBtn'), buddyBtn: $('buddyBtn'), buddyFace: $('buddyFace'), buddyName: $('buddyName'),
      pwBuddy: $('pwBuddy'), pwFace: $('pwBuddyFace'), pwFill: document.querySelector('#pwBuddy b'), pwLbl: $('pwBuddyLbl'),
      hint: $('hint'), sound: $('soundBtn'), pick: $('pick'), saveFace: $('saveFace'), saveTxt: $('saveTxt'), rotate: $('rotateHint'),
    });
    ui.sound.textContent = Kit.sound.isMuted() ? '🔇' : '🔊';
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { Kit.sound.init(); e.stopPropagation(); fn(); e.currentTarget.blur(); });
    for (const id of ['teddy', 'tommy']) {
      const c = document.createElement('button');
      c.className = 'card';
      c.dataset.id = id;
      c.innerHTML = `<img src="${thumbs[id]}" alt=""><b>${NAME(id)}</b><small>${id === 'teddy' ? '👊 punch power' : '✌️ split power'}</small>`;
      c.addEventListener('click', () => { Kit.sound.init(); pickPlayer(id); });
      ui.pick.appendChild(c);
    }
    pickPlayer(save.player);
    for (const b of $('diff').children) b.addEventListener('click', () => { Kit.sound.init(); SFX.click(); setEasy(b.dataset.easy === '1'); });
    setEasy(save.easy);
    tap('playBtn', openLevels);
    tap('levelsBack', () => { SFX.click(); setScreen('title'); });
    tap('pauseBtn', pause);
    tap('restartBtn', () => startLevel(G.li));
    tap('soundBtn', toggleMute);
    tap('powerBtn', tryPower);
    tap('buddyBtn', callBuddy);
    tap('resumeBtn', resume);
    tap('pausedRestart', () => startLevel(G.li));
    tap('pausedLevels', openLevels);
    tap('pausedHome', goHome);
    tap('wonLevels', openLevels);
    tap('wonAgain', () => startLevel(G.li));
    tap('wonNext', nextLevel);
    tap('lostLevels', openLevels);
    tap('lostAgain', () => startLevel(G.li));
    tap('saveBtn', callBuddy);
    // the power button and the buddy button shouldn't also start a drag on the canvas
    for (const id of ['powerBtn', 'buddyBtn']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (G.autoPause) pause();
        Kit.sound.suspend();
      } else Kit.sound.resume();
    });
  }

  // ---------------------------------------------------------------- main loop

  function tick(dt) {
    G.time += dt;
    const s = G.s;
    const playing = G.screen === 'play' && s;
    if (playing || (G.demo && s)) {
      if (G.camMode === 'intro') {
        G.introT += dt;
        if (G.introT > 2.6) G.camMode = 'aim';
      }
      if (!G.demo) Sim.step(s, dt);
      handleEvents();
      layoutQueue(dt);
      updateBuddy(dt);
      updateEnd(dt);
    }
    if (G.screen !== 'paused') {
      for (const b of [...G.bros.values()]) updateBro(b, dt);
      // the pouch follows the drag, or eases back after a launch
      const loaded = s && s.phase === 'aim' && READY();
      if (!G.drag && !G.kb.on) {
        pouch.x = lerp(pouch.x, Sim.SLING.x, damp(18, dt));
        pouch.y = lerp(pouch.y, Sim.SLING.y, damp(18, dt));
      }
      const r = loaded ? G.bros.get(s.queue[0].key).r : 0.5;
      Scene.slingshot.setPouch(pouch.x, pouch.y, r);
      FX.setGuide(loaded && (G.drag || G.kb.on) ? guidePoints() : null, save.easy ? 46 : 9);
      FX.setTrail(G.lastTrail && s && s.phase !== 'won' ? G.lastTrail : null);
      syncVisuals(dt);
      FX.update(dt);
      Scene.animate(G.time);
    }
    G.shake = Math.max(0, G.shake - dt * 1.6);
    applyCamera(dt);
    updateHud();
  }

  let lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
    lastT = now;
    resize();
    if (!G.hold) tick(dt); // held (tests): only game.step() moves time, but keep drawing so screenshots are fresh
    Scene.render();
  }

  let lastW = 0, lastH = 0;
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (w === lastW && h === lastH) return;
    if (!w || !h) return;
    lastW = w;
    lastH = h;
    Scene.resize(w, h);
  }

  // ---------------------------------------------------------------- English / 中文
  // Page text translates itself (kit/lang.js + js/zh.js). Words painted on textures are redrawn here: the subway's
  // signs and posters, and the train cars in this level. Bursts and popups pick up the language the next time they pop.
  function relang() {
    Scene.relang();
    if (!G.level) return;
    for (const m of G.staticsV) { Scene.scene.remove(m); Scene.disposeGroup(m); }
    G.staticsV = G.level.statics.map((st) => {
      const m = Scene.makeStatic(st);
      Scene.scene.add(m);
      return m;
    });
  }

  // ---------------------------------------------------------------- boot

  function boot() {
    Scene.init(canvas);
    FX.init(Scene.scene);
    thumbs = Kit.portraits([R.get('teddy'), R.get('tommy')], { size: 152 });
    bindUi();
    if (Kit.lang) Kit.lang.onChange(relang);
    resize();
    startLevel(0, { demo: true });
    setScreen('title');
    document.title = `${TITLE} · Teddy & Tommy`;
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- test hooks (the hidden pane throttles rAF)

  window.game = {
    G, BUD, save,
    // advance the game by `seconds` in 1/60 s ticks and draw one frame
    step(seconds = 1 / 60) {
      resize();
      const n = Math.max(1, Math.round(seconds * 60));
      for (let i = 0; i < n; i++) tick(1 / 60);
      Scene.render();
      return this.state();
    },
    hold(on = true) { G.hold = on; G.autoPause = !on; return on; },
    start(id, opts = {}) {
      if (opts.player) save.player = opts.player;
      if (opts.easy !== undefined) save.easy = !!opts.easy;
      const i = typeof id === 'number' ? id : LEVELS.findIndex((L) => L.id === id);
      startLevel(i < 0 ? 0 : i);
      if (opts.skipIntro !== false) G.camMode = 'aim';
      return this.state();
    },
    // wait until the loaded brother is in the pouch, then fire at angle (degrees) and pull (0..1)
    shoot(angle, pull = 1) {
      for (let i = 0; i < 300 && !READY(); i++) tick(1 / 60);
      if (!READY()) return false;
      const a = (angle * Math.PI) / 180, d = pull * Sim.MAX_PULL;
      setPull(-Math.cos(a) * d, -Math.sin(a) * d);
      const ok = fire();
      releasePouch();
      return ok;
    },
    // pull back and hold (to screenshot the guide)
    aim(angle, pull = 1) {
      for (let i = 0; i < 300 && !READY(); i++) tick(1 / 60);
      G.kb.on = true;
      const a = (angle * Math.PI) / 180, d = pull * Sim.MAX_PULL;
      setPull(-Math.cos(a) * d, -Math.sin(a) * d);
      return READY();
    },
    // point the camera at (x, y) from distance d (for close-up screenshots); look() goes back to normal
    look(x, y, d) {
      G.look = x == null ? null : { x, y, d };
      if (G.look) Object.assign(G.cam, G.look);
      applyCamera(0);
      Scene.render();
      return G.look;
    },
    power: () => tryPower(),
    buddy: () => callBuddy(),
    // run until the turn is over (or the level ends)
    settle(max = 30) {
      let t = 0;
      while (G.s && (G.s.phase === 'fly' || G.s.phase === 'settle') && t < max) { tick(1 / 60); t += 1 / 60; }
      return this.state();
    },
    state() {
      const s = G.s;
      return s && {
        screen: G.screen, level: G.level.id, phase: s.phase, score: s.score, headsLeft: Sim.headsLeft(s),
        queue: s.queue.map((q) => q.who + (q.bonus ? '+' : '')), ready: READY(), cam: G.camMode,
        shots: s.shots.filter((sh) => !sh.done).map((sh) => ({ who: sh.who, x: +sh.body.x.toFixed(1), y: +sh.body.y.toFixed(1), punch: !!sh.punch })),
        buddy: { on: BUD.on, t: +BUD.t.toFixed(1), mode: BUD.m && BUD.m.mode }, guard: s.guard, bros: G.bros.size,
      };
    },
    screen: (name) => setScreen(name),
    // headless check in the page: every level (or the given ids) must be winnable
    check(ids) {
      const out = [];
      for (const L of LEVELS) {
        if (ids && !ids.includes(L.id)) continue;
        for (const first of ['teddy', 'tommy']) {
          const r = Solver.solve(L, { first });
          out.push(`${r.won ? 'PASS' : 'FAIL'} ${L.id} ${first} ${r.shotsUsed}/${r.shots} stuck ${r.stuck}`);
        }
      }
      return out;
    },
    soak: (n = 30) => Solver.soak(LEVELS, n),
  };

  boot();
})();
