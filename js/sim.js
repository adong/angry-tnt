/* Angry TNT: the rules. Loads a level into the physics world, launches the brothers, runs their powers
   (Teddy's punch dash, Tommy's three-way split), breaks blocks by impact strength, pops zombie heads, keeps score
   and decides when a turn is over and whether the level is won or lost.
   No Three.js here: the game draws whatever this state says, and the Node level check runs the same code.
   Exposes window.Sim (or module.exports in Node). */
(function (root) {
  'use strict';
  const Phys = root.Phys || (typeof require !== 'undefined' ? require('./physics.js') : null);

  const DT = 1 / 120; // physics step
  const SLING = { x: 0, y: 3.3 }; // where the pouch rests
  const MAX_PULL = 2.3; // metres the pouch can be pulled back
  const MAX_SPEED = 23; // launch speed at full pull, m/s
  const GROUND_Y = 0;

  // Building materials: density (kg/m²), friction, bounce, toughness (joules of impact per m² of block) and points.
  const MATS = {
    wood: { density: 1.0, friction: 0.7, rest: 0.05, tough: 55, points: 500 },
    ice: { density: 0.9, friction: 0.15, rest: 0.05, tough: 20, points: 300 },
    stone: { density: 2.4, friction: 0.8, rest: 0.02, tough: 210, points: 800 },
  };
  // Zombie heads: hit points (joules) and size by kind. They pop into stars, never anything else.
  const HEADS = {
    zombie: { size: 1.0, hp: 7 },
    cap: { size: 1.0, hp: 8 },
    helmet: { size: 1.0, hp: 11 },
    king: { size: 1.45, hp: 22 },
  };
  const HEAD_POINTS = 5000, SHOT_POINTS = 10000;
  // The brothers, curled into balls. Teddy is bigger and heavier; Tommy splits into three.
  const BROS = {
    teddy: { r: 0.6, density: 3.6, power: 'punch' },
    tommy: { r: 0.52, density: 3.6, power: 'split' },
  };
  const MINI_R = 0.42;
  const PUNCH = { speed: 27, time: 0.55, budget: 3, cost: { stone: 1, wood: 0.5, ice: 0.34 }, maxUp: 0.35, maxDown: 0.6 };
  const SPLIT = { spread: 0.2, gap: 1.05 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ creating a level

  function create(level, opts = {}) {
    const s = {
      level,
      easy: !!opts.easy,
      dmgMul: opts.easy ? 1.35 : 1,
      world: new Phys.World({ gravity: -10, iterations: 10 }),
      blocks: [],
      heads: [],
      shots: [],
      queue: [],
      score: 0,
      phase: 'aim',
      t: 0,
      phaseT: 0,
      acc: 0,
      events: [],
      guard: false, // the companion is here: a level that would be lost gives one more shot instead
      guardAtLaunch: false,
      shotsFired: 0,
      unstable: [],
      blockPoints: 0,
      nextShotId: 1,
    };
    s.world.preSolve = (arb) => preSolve(s, arb);
    // the ground, and any fixed platforms or hills the level has
    s.world.add(new Phys.Body({ isStatic: true, w: 600, h: 4, x: 100, y: GROUND_Y - 2, friction: 0.9, data: { kind: 'ground' } }));
    for (const g of level.statics || []) {
      s.world.add(new Phys.Body({ isStatic: true, w: g.w, h: g.h, x: g.x, y: g.y, a: g.a || 0, friction: 0.9, data: { kind: 'ground', look: g.look || 'hill' } }));
    }
    for (const b of level.blocks) addBlock(s, b);
    for (const h of level.heads) addHead(s, h);
    s.blockPoints = s.blocks.reduce((n, b) => n + b.points, 0);
    // the queue: the chosen brother first, then taking turns
    const first = opts.first === 'tommy' ? 'tommy' : 'teddy';
    const other = first === 'teddy' ? 'tommy' : 'teddy';
    for (let i = 0; i < level.shots; i++) s.queue.push({ who: i % 2 ? other : first, bonus: false, key: s.nextShotId++ });
    settle(s);
    const H = s.heads.length * HEAD_POINTS, B = 0.25 * s.blockPoints;
    const par = level.par ?? level.shots - 1;
    s.stars2 = Math.round(H + SHOT_POINTS * Math.max(0, level.shots - par - 1) + B);
    s.stars3 = Math.round(H + SHOT_POINTS * (level.shots - par) + B);
    return s;
  }

  function addBlock(s, d) {
    const m = MATS[d.mat];
    const body = s.world.add(new Phys.Body({
      w: d.w, h: d.h, x: d.x, y: d.y, a: d.a || 0, density: m.density, friction: m.friction, rest: m.rest,
    }));
    const hp = m.tough * Math.max(0.35, d.w * d.h);
    const b = { kind: 'block', mat: d.mat, w: d.w, h: d.h, body, hp, maxHp: hp, points: m.points, id: s.blocks.length };
    body.data = b;
    s.blocks.push(b);
    return b;
  }

  function addHead(s, d) {
    const k = HEADS[d.kind || 'zombie'];
    const size = k.size;
    const body = s.world.add(new Phys.Body({
      w: size, h: size * 1.1, x: d.x, y: d.y, density: 1.0, friction: 0.6, rest: 0.1,
    }));
    const h = { kind: 'head', look: d.kind || 'zombie', size, body, hp: k.hp, maxHp: k.hp, id: s.heads.length, popped: false };
    body.data = h;
    s.heads.push(h);
    return h;
  }

  // Let the level settle before anyone sees it (no damage), then put it to sleep. Anything that moved a lot is a
  // level-design mistake, listed in s.unstable for the level check.
  function settle(s) {
    const start = s.world.bodies.map((b) => [b, b.x, b.y, b.a]);
    for (let i = 0; i < 180; i++) s.world.step(DT);
    for (const [b, x, y, a] of start) {
      if (b.isStatic) continue;
      const d = Math.hypot(b.x - x, b.y - y) + Math.abs(b.a - a);
      if (d > 0.1) s.unstable.push({ kind: b.data.kind, mat: b.data.mat, x: +x.toFixed(2), y: +y.toFixed(2), moved: +d.toFixed(3) });
    }
    for (const b of s.world.bodies) {
      if (b.isStatic) continue;
      b.awake = false;
      b.vx = b.vy = b.w = 0;
    }
  }

  // ------------------------------------------------------------------ shots

  const loaded = (s) => s.queue[0] || null;

  // Launch velocity for a pull of (dx, dy) metres away from the pouch's rest position.
  function launchVelocity(dx, dy) {
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return { vx: 0, vy: 0 };
    const k = (Math.min(d, MAX_PULL) / MAX_PULL) * MAX_SPEED / d;
    return { vx: -dx * k, vy: -dy * k };
  }

  function makeShot(s, who, x, y, vx, vy, opt = {}) {
    const bro = BROS[who];
    const r = opt.mini ? MINI_R : bro.r;
    const body = s.world.add(new Phys.Body({
      shape: 'circle', r, x, y, vx, vy, density: bro.density, friction: 0.6, rest: 0.3, linDamp: 0, angDamp: 0,
    }));
    const shot = {
      kind: 'shot', who, body, r, mini: !!opt.mini, main: !opt.mini, key: opt.key || s.nextShotId++, bonus: !!opt.bonus,
      power: opt.mini ? null : bro.power, powerUsed: !!opt.mini, touched: false, t: 0, slowT: 0, done: false, punch: null,
      trail: [],
    };
    body.data = shot;
    s.shots.push(shot);
    return shot;
  }

  // Fire the loaded brother from (x, y) (default: the pouch's rest position). Returns the shot, or null when
  // nobody is loaded or it isn't time to shoot.
  function launch(s, vx, vy, x = SLING.x, y = SLING.y) {
    if (s.phase !== 'aim' || !s.queue.length) return null;
    const q = s.queue.shift();
    const shot = makeShot(s, q.who, x, y, vx, vy, { key: q.key, bonus: q.bonus });
    shot.body.w = -Math.hypot(vx, vy) * 0.45; // tumbling forward
    s.shotsFired++;
    s.guardAtLaunch = s.guard; // the companion was here when you fired: his save still counts if the turn ends later
    setPhase(s, 'fly');
    s.events.push({ type: 'launch', shot });
    return shot;
  }

  // Fire from a pull of (dx, dy) metres away from the pouch's rest position, the way the player does it.
  function launchFromPull(s, dx, dy) {
    const d = Math.hypot(dx, dy), k = d > MAX_PULL ? MAX_PULL / d : 1;
    const v = launchVelocity(dx, dy);
    return launch(s, v.vx, v.vy, SLING.x + dx * k, SLING.y + dy * k);
  }

  // The power of the brother in flight: Teddy's punch dash or Tommy's split. Only before he first hits something.
  function canPower(s) {
    const m = s.shots.find((sh) => sh.main && !sh.done);
    return !!(m && s.phase === 'fly' && !m.powerUsed && !m.touched && m.t > 0.08);
  }

  function power(s) {
    if (!canPower(s)) return false;
    const m = s.shots.find((sh) => sh.main && !sh.done);
    m.powerUsed = true;
    const b = m.body;
    if (m.power === 'punch') {
      // a boxing dash: straight ahead (a little up or down at most), ignoring gravity, smashing through blocks
      let ang = Math.atan2(b.vy, b.vx);
      if (b.vx < 0) ang = Math.PI - ang;
      ang = clamp(ang, -PUNCH.maxDown, PUNCH.maxUp);
      const dx = Math.cos(ang), dy = Math.sin(ang);
      m.punch = { t: PUNCH.time, budget: PUNCH.budget * (s.easy ? 1.35 : 1), dx, dy, smashed: 0 };
      b.gScale = 0;
      b.vx = dx * PUNCH.speed;
      b.vy = dy * PUNCH.speed;
      b.w = -12;
      s.events.push({ type: 'punch', shot: m });
    } else {
      // Y pose: two more Tommies fan out above and below
      const sp = Math.hypot(b.vx, b.vy) * 1.03;
      const ang = Math.atan2(b.vy, b.vx);
      const px = -Math.sin(ang), py = Math.cos(ang);
      const minis = [];
      for (const side of [1, -1]) {
        const a = ang + side * SPLIT.spread;
        const mini = makeShot(s, m.who, b.x + px * side * SPLIT.gap, b.y + py * side * SPLIT.gap, Math.cos(a) * sp, Math.sin(a) * sp, { mini: true });
        mini.t = m.t;
        minis.push(mini);
      }
      b.vx = Math.cos(ang) * sp;
      b.vy = Math.sin(ang) * sp;
      s.events.push({ type: 'split', shot: m, minis });
    }
    return true;
  }

  function endPunch(s, sh) {
    if (!sh.punch) return;
    sh.punch = null;
    sh.body.gScale = 1;
    sh.body.vx *= 0.55;
    sh.body.vy *= 0.55;
    s.events.push({ type: 'punchEnd', shot: sh });
  }

  // Called by the physics for each touching pair before solving: shots note their first touch, and Teddy's punch
  // goes straight through blocks (each costs some of its budget) and heads.
  function preSolve(s, arb) {
    const d1 = arb.b1.data, d2 = arb.b2.data;
    const sh = d1 && d1.kind === 'shot' ? d1 : d2 && d2.kind === 'shot' ? d2 : null;
    if (!sh) return true;
    const other = sh === d1 ? d2 : d1;
    if (other && other.kind === 'shot') return true;
    if (sh.punch && other) {
      if (other.kind === 'head') {
        popHead(s, other, 'punch');
        return false;
      }
      if (other.kind === 'block') {
        const cost = PUNCH.cost[other.mat];
        if (sh.punch.budget >= cost * 0.999) {
          sh.punch.budget -= cost;
          sh.punch.smashed++;
          breakBlock(s, other, 'punch');
          shockwave(s, other.body.x, other.body.y, sh.punch.dx, sh.punch.dy);
          return false;
        }
      }
      endPunch(s, sh);
    }
    sh.touched = true;
    return true;
  }

  // a smash knocks nearby blocks along the punch
  function shockwave(s, x, y, dx, dy) {
    for (const b of s.world.bodies) {
      if (b.isStatic || b.removed || (b.data && b.data.kind === 'shot')) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d > 2.4) continue;
      const k = 1 - d / 2.4;
      b.wake();
      b.vx += dx * 5 * k;
      b.vy += dy * 5 * k + 1.5 * k;
    }
  }

  // ------------------------------------------------------------------ damage

  function breakBlock(s, b, cause) {
    if (b.broken) return;
    b.broken = true;
    const body = b.body;
    s.world.remove(body);
    s.score += b.points;
    s.events.push({ type: 'break', block: b, mat: b.mat, x: body.x, y: body.y, a: body.a, w: b.w, h: b.h, points: b.points, cause });
  }

  function popHead(s, h, cause) {
    if (h.popped) return;
    h.popped = true;
    s.world.remove(h.body);
    s.score += HEAD_POINTS;
    s.events.push({ type: 'pop', head: h, x: h.body.x, y: h.body.y, points: HEAD_POINTS, cause });
  }

  function applyImpacts(s) {
    for (const im of s.world.impacts) {
      const d1 = im.b1.data, d2 = im.b2.data;
      const shotHit = (d1 && d1.kind === 'shot') || (d2 && d2.kind === 'shot');
      const e = im.e * s.dmgMul * (shotHit ? 1.25 : 1);
      for (const d of [d1, d2]) {
        if (!d) continue;
        if (d.kind === 'block' && !d.broken) {
          d.hp -= e;
          if (d.hp <= 0) breakBlock(s, d, shotHit ? 'shot' : 'crash');
          else if (im.e > 2) s.events.push({ type: 'hit', mat: d.mat, e: im.e, x: im.x, y: im.y });
        } else if (d.kind === 'head' && !d.popped) {
          d.hp -= e;
          if (d.hp <= 0) popHead(s, d, shotHit ? 'shot' : 'crash');
          else if (im.e > 1) s.events.push({ type: 'ouch', head: d, e: im.e, x: im.x, y: im.y });
        } else if (d.kind === 'shot' && im.e > 3) {
          s.events.push({ type: 'bump', shot: d, e: im.e, x: im.x, y: im.y });
        }
      }
    }
  }

  // ------------------------------------------------------------------ stepping

  function setPhase(s, p) {
    s.phase = p;
    s.phaseT = 0;
  }

  const headsLeft = (s) => s.heads.filter((h) => !h.popped).length;

  // Advance the game by dt seconds (any size; the physics runs in fixed 1/120 s steps).
  function step(s, dt) {
    if (s.phase === 'won' || s.phase === 'lost') return;
    s.acc = Math.min(s.acc + dt, 0.25);
    while (s.acc >= DT) {
      s.acc -= DT;
      tick(s);
      if (s.phase === 'won' || s.phase === 'lost') { s.acc = 0; break; }
    }
  }

  function tick(s) {
    s.t += DT;
    s.phaseT += DT;
    const L = s.level;
    for (const sh of s.shots) {
      if (sh.done) continue;
      sh.t += DT;
      const b = sh.body;
      if (sh.punch) {
        sh.punch.t -= DT;
        b.vx = sh.punch.dx * PUNCH.speed;
        b.vy = sh.punch.dy * PUNCH.speed;
        if (sh.punch.t <= 0 || sh.punch.budget < 0.3) endPunch(s, sh);
      }
    }
    s.world.step(DT);
    applyImpacts(s);

    // shots: done when they stop, leave the level, or have been going too long
    for (const sh of s.shots) {
      if (sh.done) continue;
      const b = sh.body;
      if (sh.t % 0.05 < DT) sh.trail.push([b.x, b.y]);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 0.6 && Math.abs(b.w) < 1.5) sh.slowT += DT;
      else sh.slowT = 0;
      const out = b.x < -25 || b.x > L.right + 30 || b.y < -15;
      if (out || !b.awake || sh.slowT > 0.6 || sh.t > 14) {
        sh.done = true;
        endPunch(s, sh);
        s.world.remove(b);
        s.events.push({ type: 'shotDone', shot: sh, x: b.x, y: b.y, out });
      }
    }
    // bodies that fell off the world
    for (const b of s.world.bodies.slice()) {
      if (b.isStatic || b.removed || (b.y > -12 && b.x > -30 && b.x < L.right + 40)) continue;
      const d = b.data;
      if (d && d.kind === 'head') popHead(s, d, 'fall');
      else if (d && d.kind === 'block') { d.broken = true; s.world.remove(b); }
    }

    if (s.phase === 'fly') {
      if (s.shots.every((sh) => sh.done)) setPhase(s, 'settle');
    } else if (s.phase === 'settle') {
      const quiet = s.world.allAsleep();
      const allPopped = headsLeft(s) === 0;
      if ((quiet && s.phaseT > 0.4) || s.phaseT > (allPopped ? 2.5 : 6)) endTurn(s);
    }
  }

  function endTurn(s) {
    s.shots = s.shots.filter((sh) => !sh.done);
    if (headsLeft(s) === 0) return win(s);
    if (s.queue.length) {
      setPhase(s, 'aim');
      s.events.push({ type: 'turn' });
      return;
    }
    if (s.guard || s.guardAtLaunch) {
      // the companion steps in: one more shot instead of losing
      s.guard = s.guardAtLaunch = false;
      s.events.push({ type: 'saved' });
      addShot(s, s.buddy || 'tommy', { bonus: true });
      setPhase(s, 'aim');
      s.events.push({ type: 'turn' });
      return;
    }
    setPhase(s, 'lost');
    s.events.push({ type: 'lost', score: s.score });
  }

  function win(s) {
    // every brother left over (not counting the companion's bonus shots) is worth a bonus
    const left = s.queue.filter((q) => !q.bonus);
    const bonuses = left.map((q) => ({ who: q.who, key: q.key, points: SHOT_POINTS }));
    s.score += bonuses.length * SHOT_POINTS;
    const stars = s.score >= s.stars3 ? 3 : s.score >= s.stars2 ? 2 : 1;
    s.stars = stars;
    setPhase(s, 'won');
    s.events.push({ type: 'won', score: s.score, stars, bonuses });
  }

  // The companion hops onto the slingshot: an extra shot at the front of the queue (or at opt.index).
  function addShot(s, who, opt = {}) {
    const q = { who, bonus: opt.bonus !== false, key: s.nextShotId++ };
    s.queue.splice(Math.min(opt.index || 0, s.queue.length), 0, q);
    s.events.push({ type: 'addShot', q });
    return q;
  }

  // A second chance from the "you lost" screen (calling the companion there).
  function revive(s, who) {
    if (s.phase !== 'lost') return false;
    addShot(s, who, { bonus: true });
    setPhase(s, 'aim');
    s.events.push({ type: 'turn' });
    return true;
  }

  // ------------------------------------------------------------------ cloning (for the level check's search)

  function clone(s) {
    const map = new Map();
    const w2 = new Phys.World({ gravity: s.world.gravity, iterations: s.world.iterations });
    w2.stepCount = s.world.stepCount;
    const copyData = new Map();
    const cd = (d) => {
      if (!d) return d;
      if (!copyData.has(d)) copyData.set(d, Object.assign({}, d));
      return copyData.get(d);
    };
    for (const b of s.world.bodies) {
      const nb = Object.assign(Object.create(Phys.Body.prototype), b);
      nb.data = cd(b.data);
      if (nb.data && nb.data.body) nb.data.body = nb;
      map.set(b, nb);
      w2.bodies.push(nb);
    }
    for (const [k, arb] of s.world.arbiters) {
      const na = Object.assign(Object.create(Object.getPrototypeOf(arb)), arb);
      na.b1 = map.get(arb.b1);
      na.b2 = map.get(arb.b2);
      na.contacts = arb.contacts.map((c) => Object.assign({}, c));
      w2.arbiters.set(k, na);
    }
    const s2 = Object.assign({}, s, { world: w2, events: [] });
    w2.preSolve = (arb) => preSolve(s2, arb);
    const fix = (d) => {
      const n = cd(d);
      if (n.body && !map.has(d.body)) n.body = Object.assign(Object.create(Phys.Body.prototype), d.body); // removed body
      if (n.trail) n.trail = n.trail.slice();
      if (n.punch) n.punch = Object.assign({}, n.punch);
      return n;
    };
    s2.blocks = s.blocks.map(fix);
    s2.heads = s.heads.map(fix);
    s2.shots = s.shots.map(fix);
    s2.queue = s.queue.map((q) => Object.assign({}, q));
    return s2;
  }

  const Sim = {
    DT, SLING, MAX_PULL, MAX_SPEED, MATS, HEADS, BROS, MINI_R, PUNCH, HEAD_POINTS, SHOT_POINTS,
    create, step, launch, launchFromPull, launchVelocity, power, canPower, addShot, revive, loaded, headsLeft, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
