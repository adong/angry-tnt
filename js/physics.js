/* Angry TNT: a small 2D rigid-body engine for boxes and circles.
   It follows Erin Catto's Box2D-Lite (sequential impulses with warm starting and contact feature ids, so stacks
   settle without jitter), plus circles, restitution, island sleeping and impact energies for breakable blocks.
   No Three.js here: the same file runs in the game and in the Node level check (tools/check-levels.js).
   Units are metres, kilograms and seconds; y is up. Exposes window.Phys (or module.exports in Node). */
(function (root) {
  'use strict';

  const ALLOWED_PEN = 0.01; // metres of overlap left alone, so resting contacts stay touching
  const BIAS = 0.2; // how much of the overlap to push out per step
  const MAX_BIAS = 4; // m/s cap on that push, so deep overlaps don't explode
  const REST_MIN = 1.0; // m/s: slower approaches don't bounce
  const IMPACT_MIN = 1.2; // m/s: slower approaches do no damage
  const SLEEP_LIN = 0.06, SLEEP_ANG = 0.06, SLEEP_TIME = 0.5;

  let nextId = 1;

  class Body {
    // o: { shape: 'box'|'circle', w, h | r, x, y, a, density, friction, rest, isStatic, data }
    constructor(o) {
      this.id = nextId++;
      this.shape = o.shape || 'box';
      this.hw = (o.w || 1) / 2;
      this.hh = (o.h || 1) / 2;
      this.r = o.r || 0.5;
      this.x = o.x || 0;
      this.y = o.y || 0;
      this.a = o.a || 0;
      this.c = Math.cos(this.a);
      this.s = Math.sin(this.a);
      this.vx = o.vx || 0;
      this.vy = o.vy || 0;
      this.w = o.w0 || 0;
      this.friction = o.friction ?? 0.6;
      this.rest = o.rest ?? 0;
      this.gScale = 1;
      this.linDamp = o.linDamp ?? 0.05;
      this.angDamp = o.angDamp ?? 0.1;
      this.rollDamp = o.rollDamp ?? (this.shape === 'circle' ? 1.2 : 0); // extra slow-down while touching something
      this.touch = 0; // step number of the last contact
      this.isStatic = !!o.isStatic;
      this.awake = !this.isStatic;
      this.sleepT = 0;
      this.removed = false;
      this.data = o.data || null;
      this.minX = this.minY = this.maxX = this.maxY = 0;
      if (this.isStatic) {
        this.m = this.invM = this.I = this.invI = 0;
      } else {
        const d = o.density ?? 1;
        if (this.shape === 'circle') {
          this.m = d * Math.PI * this.r * this.r;
          this.I = (this.m * this.r * this.r) / 2;
        } else {
          const w = this.hw * 2, h = this.hh * 2;
          this.m = d * w * h;
          this.I = (this.m * (w * w + h * h)) / 12;
        }
        this.invM = 1 / this.m;
        this.invI = 1 / this.I;
      }
    }

    setAngle(a) {
      this.a = a;
      this.c = Math.cos(a);
      this.s = Math.sin(a);
    }

    wake() {
      if (this.isStatic) return;
      this.awake = true;
      this.sleepT = 0;
    }

    aabb() {
      if (this.shape === 'circle') {
        this.minX = this.x - this.r; this.maxX = this.x + this.r;
        this.minY = this.y - this.r; this.maxY = this.y + this.r;
      } else {
        const ex = this.hw * Math.abs(this.c) + this.hh * Math.abs(this.s);
        const ey = this.hw * Math.abs(this.s) + this.hh * Math.abs(this.c);
        this.minX = this.x - ex; this.maxX = this.x + ex;
        this.minY = this.y - ey; this.maxY = this.y + ey;
      }
    }

    // world corners of a box, counter-clockwise (for drawing and tests)
    corners() {
      const out = [];
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = sx * this.hw, ly = sy * this.hh;
        out.push([this.x + this.c * lx - this.s * ly, this.y + this.s * lx + this.c * ly]);
      }
      return out;
    }
  }

  // ------------------------------------------------------------------ narrow phase
  // Each collide function fills `out` with contacts { x, y, nx, ny, sep, feature }; the normal points from the
  // first body to the second, and sep < 0 means overlap.

  function clipSegment(vIn, nx, ny, offset, clipEdge) {
    const v0 = vIn[0], v1 = vIn[1];
    const d0 = nx * v0.x + ny * v0.y - offset;
    const d1 = nx * v1.x + ny * v1.y - offset;
    const out = [];
    if (d0 <= 0) out.push(v0);
    if (d1 <= 0) out.push(v1);
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      const v = { x: v0.x + t * (v1.x - v0.x), y: v0.y + t * (v1.y - v0.y) };
      if (d0 > 0) {
        v.in1 = clipEdge; v.out1 = v0.out1; v.in2 = 0; v.out2 = v0.out2;
      } else {
        v.in1 = v1.in1; v.out1 = clipEdge; v.in2 = v1.in2; v.out2 = 0;
      }
      out.push(v);
    }
    return out;
  }

  // The edge of a box (half extents hx, hy at px, py, rotated c, s) most anti-parallel to the normal.
  function incidentEdge(hx, hy, px, py, c, s, fnx, fny) {
    const nx = -(c * fnx + s * fny), ny = -(-s * fnx + c * fny);
    let a, b;
    if (Math.abs(nx) > Math.abs(ny)) {
      if (nx >= 0) {
        a = { x: hx, y: -hy, in1: 0, out1: 0, in2: 3, out2: 4 };
        b = { x: hx, y: hy, in1: 0, out1: 0, in2: 4, out2: 1 };
      } else {
        a = { x: -hx, y: hy, in1: 0, out1: 0, in2: 1, out2: 2 };
        b = { x: -hx, y: -hy, in1: 0, out1: 0, in2: 2, out2: 3 };
      }
    } else if (ny >= 0) {
      a = { x: hx, y: hy, in1: 0, out1: 0, in2: 4, out2: 1 };
      b = { x: -hx, y: hy, in1: 0, out1: 0, in2: 1, out2: 2 };
    } else {
      a = { x: -hx, y: -hy, in1: 0, out1: 0, in2: 2, out2: 3 };
      b = { x: hx, y: -hy, in1: 0, out1: 0, in2: 3, out2: 4 };
    }
    for (const v of [a, b]) {
      const lx = v.x, ly = v.y;
      v.x = px + c * lx - s * ly;
      v.y = py + s * lx + c * ly;
    }
    return [a, b];
  }

  function collideBoxes(A, B, out) {
    const hAx = A.hw, hAy = A.hh, hBx = B.hw, hBy = B.hh;
    const cA = A.c, sA = A.s, cB = B.c, sB = B.s;
    const dpx = B.x - A.x, dpy = B.y - A.y;
    const dAx = cA * dpx + sA * dpy, dAy = -sA * dpx + cA * dpy;
    const dBx = cB * dpx + sB * dpy, dBy = -sB * dpx + cB * dpy;
    // C = RotA^T * RotB
    const C11 = cA * cB + sA * sB, C12 = -cA * sB + sA * cB, C21 = -sA * cB + cA * sB, C22 = sA * sB + cA * cB;
    const a11 = Math.abs(C11), a12 = Math.abs(C12), a21 = Math.abs(C21), a22 = Math.abs(C22);
    const faceAx = Math.abs(dAx) - hAx - (a11 * hBx + a12 * hBy);
    const faceAy = Math.abs(dAy) - hAy - (a21 * hBx + a22 * hBy);
    if (faceAx > 0 || faceAy > 0) return;
    const faceBx = Math.abs(dBx) - (a11 * hAx + a21 * hAy) - hBx;
    const faceBy = Math.abs(dBy) - (a12 * hAx + a22 * hAy) - hBy;
    if (faceBx > 0 || faceBy > 0) return;

    let axis = 0, sep = faceAx, nx, ny;
    if (dAx > 0) { nx = cA; ny = sA; } else { nx = -cA; ny = -sA; }
    const relTol = 0.95, absTol = 0.01;
    if (faceAy > relTol * sep + absTol * hAy) {
      axis = 1; sep = faceAy;
      if (dAy > 0) { nx = -sA; ny = cA; } else { nx = sA; ny = -cA; }
    }
    if (faceBx > relTol * sep + absTol * hBx) {
      axis = 2; sep = faceBx;
      if (dBx > 0) { nx = cB; ny = sB; } else { nx = -cB; ny = -sB; }
    }
    if (faceBy > relTol * sep + absTol * hBy) {
      axis = 3; sep = faceBy;
      if (dBy > 0) { nx = -sB; ny = cB; } else { nx = sB; ny = -cB; }
    }

    let fnx, fny, front, snx, sny, negSide, posSide, negEdge, posEdge, inc;
    if (axis === 0) {
      fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAx;
      snx = -sA; sny = cA;
      const side = A.x * snx + A.y * sny;
      negSide = -side + hAy; posSide = side + hAy; negEdge = 3; posEdge = 1;
      inc = incidentEdge(hBx, hBy, B.x, B.y, cB, sB, fnx, fny);
    } else if (axis === 1) {
      fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAy;
      snx = cA; sny = sA;
      const side = A.x * snx + A.y * sny;
      negSide = -side + hAx; posSide = side + hAx; negEdge = 2; posEdge = 4;
      inc = incidentEdge(hBx, hBy, B.x, B.y, cB, sB, fnx, fny);
    } else if (axis === 2) {
      fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBx;
      snx = -sB; sny = cB;
      const side = B.x * snx + B.y * sny;
      negSide = -side + hBy; posSide = side + hBy; negEdge = 3; posEdge = 1;
      inc = incidentEdge(hAx, hAy, A.x, A.y, cA, sA, fnx, fny);
    } else {
      fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBy;
      snx = cB; sny = sB;
      const side = B.x * snx + B.y * sny;
      negSide = -side + hBx; posSide = side + hBx; negEdge = 2; posEdge = 4;
      inc = incidentEdge(hAx, hAy, A.x, A.y, cA, sA, fnx, fny);
    }

    const cp1 = clipSegment(inc, -snx, -sny, negSide, negEdge);
    if (cp1.length < 2) return;
    const cp2 = clipSegment(cp1, snx, sny, posSide, posEdge);
    if (cp2.length < 2) return;
    const flip = axis >= 2;
    for (let i = 0; i < 2; i++) {
      const v = cp2[i];
      const s = fnx * v.x + fny * v.y - front;
      if (s <= 0) {
        const f = flip
          ? v.in2 | (v.out2 << 3) | (v.in1 << 6) | (v.out1 << 9)
          : v.in1 | (v.out1 << 3) | (v.in2 << 6) | (v.out2 << 9);
        out.push({ x: v.x - s * fnx, y: v.y - s * fny, nx, ny, sep: s, feature: f });
      }
    }
  }

  // circle C against box B; the normal points from the circle to the box
  function collideCircleBox(C, B, out) {
    const dx = C.x - B.x, dy = C.y - B.y;
    const lx = B.c * dx + B.s * dy, ly = -B.s * dx + B.c * dy;
    const hx = B.hw, hy = B.hh;
    let px, py, nlx, nly, sep;
    if (Math.abs(lx) <= hx && Math.abs(ly) <= hy) {
      // centre inside the box: push out through the nearest face
      const ex = hx - Math.abs(lx), ey = hy - Math.abs(ly);
      if (ex < ey) {
        nlx = lx < 0 ? -1 : 1; nly = 0; px = nlx * hx; py = ly; sep = -(ex + C.r);
      } else {
        nlx = 0; nly = ly < 0 ? -1 : 1; px = lx; py = nly * hy; sep = -(ey + C.r);
      }
    } else {
      px = Math.max(-hx, Math.min(hx, lx));
      py = Math.max(-hy, Math.min(hy, ly));
      const ddx = lx - px, ddy = ly - py;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 > C.r * C.r) return;
      const d = Math.sqrt(d2) || 1e-9;
      nlx = ddx / d; nly = ddy / d;
      sep = d - C.r;
    }
    // box-to-circle normal in world space, then flip so it points circle -> box
    const wnx = B.c * nlx - B.s * nly, wny = B.s * nlx + B.c * nly;
    out.push({ x: B.x + B.c * px - B.s * py, y: B.y + B.s * px + B.c * py, nx: -wnx, ny: -wny, sep, feature: 1 });
  }

  function collideCircles(A, B, out) {
    const dx = B.x - A.x, dy = B.y - A.y;
    const rr = A.r + B.r;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) return;
    const d = Math.sqrt(d2) || 1e-9;
    const nx = dx / d, ny = dy / d;
    out.push({ x: A.x + nx * A.r, y: A.y + ny * A.r, nx, ny, sep: d - rr, feature: 1 });
  }

  function collide(b1, b2, out) {
    if (b1.shape === 'box') {
      if (b2.shape === 'box') collideBoxes(b1, b2, out);
      else {
        collideCircleBox(b2, b1, out);
        for (const c of out) { c.nx = -c.nx; c.ny = -c.ny; }
      }
    } else if (b2.shape === 'box') collideCircleBox(b1, b2, out);
    else collideCircles(b1, b2, out);
  }

  // ------------------------------------------------------------------ arbiters (contact pairs)

  class Arbiter {
    constructor(b1, b2) {
      this.b1 = b1;
      this.b2 = b2;
      this.contacts = [];
      this.friction = Math.sqrt(b1.friction * b2.friction);
      this.rest = Math.max(b1.rest, b2.rest);
      this.stamp = 0;
      this.enabled = true;
    }

    // keep the accumulated impulses of contacts that persist (same feature), for warm starting
    update(fresh) {
      for (const c of fresh) {
        c.Pn = 0; c.Pt = 0;
        for (const o of this.contacts) {
          if (o.feature === c.feature) { c.Pn = o.Pn; c.Pt = o.Pt; break; }
        }
      }
      this.contacts = fresh;
    }

    preStep(invDt) {
      const b1 = this.b1, b2 = this.b2;
      for (const c of this.contacts) {
        const r1x = c.x - b1.x, r1y = c.y - b1.y, r2x = c.x - b2.x, r2y = c.y - b2.y;
        c.r1x = r1x; c.r1y = r1y; c.r2x = r2x; c.r2y = r2y;
        const rn1 = r1x * c.nx + r1y * c.ny, rn2 = r2x * c.nx + r2y * c.ny;
        const kN = b1.invM + b2.invM + b1.invI * (r1x * r1x + r1y * r1y - rn1 * rn1) + b2.invI * (r2x * r2x + r2y * r2y - rn2 * rn2);
        c.massN = 1 / kN;
        const tx = c.ny, ty = -c.nx;
        const rt1 = r1x * tx + r1y * ty, rt2 = r2x * tx + r2y * ty;
        const kT = b1.invM + b2.invM + b1.invI * (r1x * r1x + r1y * r1y - rt1 * rt1) + b2.invI * (r2x * r2x + r2y * r2y - rt2 * rt2);
        c.massT = 1 / kT;
        c.bias = Math.min(MAX_BIAS, -BIAS * invDt * Math.min(0, c.sep + ALLOWED_PEN));
        // bounce
        const dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
        const dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
        const vn = dvx * c.nx + dvy * c.ny;
        if (vn < -REST_MIN && this.rest > 0) c.bias = Math.max(c.bias, -this.rest * vn);
        // warm start
        const Px = c.Pn * c.nx + c.Pt * tx, Py = c.Pn * c.ny + c.Pt * ty;
        b1.vx -= b1.invM * Px; b1.vy -= b1.invM * Py; b1.w -= b1.invI * (r1x * Py - r1y * Px);
        b2.vx += b2.invM * Px; b2.vy += b2.invM * Py; b2.w += b2.invI * (r2x * Py - r2y * Px);
      }
    }

    applyImpulse() {
      const b1 = this.b1, b2 = this.b2;
      for (const c of this.contacts) {
        const r1x = c.r1x, r1y = c.r1y, r2x = c.r2x, r2y = c.r2y;
        let dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
        let dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
        const vn = dvx * c.nx + dvy * c.ny;
        let dPn = c.massN * (-vn + c.bias);
        const Pn0 = c.Pn;
        c.Pn = Math.max(Pn0 + dPn, 0);
        dPn = c.Pn - Pn0;
        let Px = dPn * c.nx, Py = dPn * c.ny;
        b1.vx -= b1.invM * Px; b1.vy -= b1.invM * Py; b1.w -= b1.invI * (r1x * Py - r1y * Px);
        b2.vx += b2.invM * Px; b2.vy += b2.invM * Py; b2.w += b2.invI * (r2x * Py - r2y * Px);

        dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
        dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
        const tx = c.ny, ty = -c.nx;
        const vt = dvx * tx + dvy * ty;
        let dPt = c.massT * -vt;
        const maxPt = this.friction * c.Pn;
        const Pt0 = c.Pt;
        c.Pt = Math.max(-maxPt, Math.min(maxPt, Pt0 + dPt));
        dPt = c.Pt - Pt0;
        Px = dPt * tx; Py = dPt * ty;
        b1.vx -= b1.invM * Px; b1.vy -= b1.invM * Py; b1.w -= b1.invI * (r1x * Py - r1y * Px);
        b2.vx += b2.invM * Px; b2.vy += b2.invM * Py; b2.w += b2.invI * (r2x * Py - r2y * Px);
      }
    }
  }

  // ------------------------------------------------------------------ world

  class World {
    constructor(o = {}) {
      this.gravity = o.gravity ?? -10;
      this.iterations = o.iterations ?? 10;
      this.bodies = [];
      this.arbiters = new Map();
      this.stepCount = 0;
      this.impacts = []; // filled each step: { b1, b2, e (joules), speed, x, y }
      this.preSolve = null; // optional hook(arbiter) -> false to ignore that contact this step
    }

    add(b) {
      this.bodies.push(b);
      return b;
    }

    // Take a body out. Everything it was touching wakes up, so towers fall when a block breaks.
    remove(b) {
      if (b.removed) return;
      b.removed = true;
      for (const [k, arb] of this.arbiters) {
        if (arb.b1 === b || arb.b2 === b) {
          arb.b1.wake();
          arb.b2.wake();
          this.arbiters.delete(k);
        }
      }
      const i = this.bodies.indexOf(b);
      if (i >= 0) this.bodies.splice(i, 1);
    }

    wakeAll() {
      for (const b of this.bodies) b.wake();
    }

    allAsleep() {
      for (const b of this.bodies) if (b.awake && !b.isStatic) return false;
      return true;
    }

    broadPhase() {
      const bs = this.bodies, n = bs.length, stamp = this.stepCount;
      for (const b of bs) b.aabb();
      // sweep and prune along x; the array stays nearly sorted between steps, so insertion sort is cheap
      for (let i = 1; i < n; i++) {
        const b = bs[i];
        let j = i - 1;
        while (j >= 0 && bs[j].minX > b.minX) { bs[j + 1] = bs[j]; j--; }
        bs[j + 1] = b;
      }
      const tmp = [];
      for (let i = 0; i < n; i++) {
        const a = bs[i];
        const aActive = a.awake;
        for (let j = i + 1; j < n; j++) {
          const b = bs[j];
          if (b.minX > a.maxX) break;
          if (!aActive && !b.awake) continue; // static or sleeping on both sides: nothing changes
          if (b.minY > a.maxY || b.maxY < a.minY) continue;
          const b1 = a.id < b.id ? a : b, b2 = a.id < b.id ? b : a;
          tmp.length = 0;
          collide(b1, b2, tmp);
          const key = b1.id * 100000 + b2.id;
          if (tmp.length) {
            let arb = this.arbiters.get(key);
            if (!arb) this.arbiters.set(key, (arb = new Arbiter(b1, b2)));
            arb.update(tmp.slice());
            arb.stamp = stamp;
            arb.enabled = true;
          }
        }
      }
      // drop pairs that stopped touching (pairs between two sleeping bodies keep their warm-start impulses)
      for (const [k, arb] of this.arbiters) {
        if (arb.stamp === stamp) continue;
        if (arb.b1.awake || arb.b2.awake) this.arbiters.delete(k);
      }
    }

    // A sleeping body touched by an awake one wakes up, and so does the rest of its pile.
    wakeTouching() {
      for (let pass = 0; pass < 32; pass++) {
        let changed = false;
        for (const arb of this.arbiters.values()) {
          const b1 = arb.b1, b2 = arb.b2;
          if (b1.isStatic || b2.isStatic || b1.awake === b2.awake) continue;
          (b1.awake ? b2 : b1).wake();
          changed = true;
        }
        if (!changed) break;
      }
    }

    step(dt) {
      this.stepCount++;
      const invDt = 1 / dt, g = this.gravity;
      this.impacts.length = 0;
      this.broadPhase();
      if (this.preSolve) {
        for (const arb of this.arbiters.values()) {
          if (arb.stamp === this.stepCount) arb.enabled = this.preSolve(arb) !== false;
        }
        // the hook may have removed bodies
        for (const [k, arb] of this.arbiters) if (arb.b1.removed || arb.b2.removed) this.arbiters.delete(k);
      }
      this.wakeTouching();

      for (const b of this.bodies) {
        if (!b.awake) continue;
        b.vy += dt * g * b.gScale;
        b.vx /= 1 + dt * b.linDamp;
        b.vy /= 1 + dt * b.linDamp;
        b.w /= 1 + dt * b.angDamp;
      }

      const active = [];
      for (const arb of this.arbiters.values()) {
        if (!arb.enabled || (!arb.b1.awake && !arb.b2.awake)) continue;
        active.push(arb);
        this.measureImpact(arb);
      }
      for (const arb of active) {
        arb.b1.touch = arb.b2.touch = this.stepCount;
        arb.preStep(invDt);
      }
      for (let i = 0; i < this.iterations; i++) {
        for (const arb of active) arb.applyImpulse();
      }

      for (const b of this.bodies) {
        if (!b.awake) continue;
        if (b.rollDamp && b.touch === this.stepCount) {
          const k = 1 / (1 + dt * b.rollDamp);
          b.vx *= k; b.vy *= k; b.w *= k;
        }
        b.x += dt * b.vx;
        b.y += dt * b.vy;
        if (b.w) b.setAngle(b.a + dt * b.w);
      }
      this.updateSleep(dt);
    }

    // How hard two bodies hit: the kinetic energy of the approach along the contact normal, using the pair's
    // reduced mass (all of the moving body's mass against something static).
    measureImpact(arb) {
      const b1 = arb.b1, b2 = arb.b2;
      let vmin = 0, cx = 0, cy = 0;
      for (const c of arb.contacts) {
        const r1x = c.x - b1.x, r1y = c.y - b1.y, r2x = c.x - b2.x, r2y = c.y - b2.y;
        const dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
        const dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
        const vn = dvx * c.nx + dvy * c.ny;
        if (vn < vmin) { vmin = vn; cx = c.x; cy = c.y; }
      }
      const speed = -vmin;
      if (speed <= IMPACT_MIN) return;
      const mEff = b1.invM && b2.invM ? 1 / (b1.invM + b2.invM) : 1 / (b1.invM || b2.invM);
      const e = 0.5 * mEff * (speed * speed - IMPACT_MIN * IMPACT_MIN);
      this.impacts.push({ b1, b2, e, speed, x: cx, y: cy });
    }

    // Box2D-style island sleeping: a pile goes to sleep when every body in it has been still for SLEEP_TIME.
    updateSleep(dt) {
      const bs = this.bodies;
      const parent = new Map();
      const find = (b) => {
        let r = b;
        while (parent.get(r) !== r) r = parent.get(r);
        let c = b;
        while (c !== r) { const n = parent.get(c); parent.set(c, r); c = n; }
        return r;
      };
      for (const b of bs) {
        if (b.isStatic || !b.awake) continue;
        parent.set(b, b);
        const v2 = b.vx * b.vx + b.vy * b.vy;
        if (v2 > SLEEP_LIN * SLEEP_LIN || b.w * b.w > SLEEP_ANG * SLEEP_ANG) b.sleepT = 0;
        else b.sleepT += dt;
      }
      for (const arb of this.arbiters.values()) {
        const b1 = arb.b1, b2 = arb.b2;
        if (!parent.has(b1) || !parent.has(b2)) continue;
        const r1 = find(b1), r2 = find(b2);
        if (r1 !== r2) parent.set(r1, r2);
      }
      const minT = new Map();
      for (const b of parent.keys()) {
        const r = find(b);
        minT.set(r, Math.min(minT.has(r) ? minT.get(r) : Infinity, b.sleepT));
      }
      for (const b of parent.keys()) {
        if (minT.get(find(b)) >= SLEEP_TIME) {
          b.awake = false;
          b.vx = b.vy = b.w = 0;
        }
      }
    }
  }

  const Phys = { Body, World, collide, IMPACT_MIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = Phys;
  else root.Phys = Phys;
})(typeof window !== 'undefined' ? window : globalThis);
