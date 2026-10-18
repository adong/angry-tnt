/* Angry TNT: the level check. A greedy bot plays each level: for every shot it tries a fan of launch angles and
   pulls, with and without the brother's power at a few moments, on copies of the level (Sim.clone), and keeps the
   shot that pops the most heads. A level passes when the bot clears it with the shots the level gives you.
   It also checks that every turn it simulates ends (nothing gets stuck) and that no level falls over on its own.
   Runs headless in Node (tools/check-levels.js) and in the browser (game.check()). Exposes window.Solver. */
(function (root) {
  'use strict';
  const Sim = root.Sim || (typeof require !== 'undefined' ? require('./sim.js') : null);

  const ANGLES = [];
  for (let a = 0; a <= 76; a += 4) ANGLES.push((a * Math.PI) / 180);
  const PULLS = [0.55, 0.7, 0.85, 1];
  const TURN_LIMIT = 40; // seconds of game time a turn may take before it counts as stuck

  // Play one turn on s (mutates it): launch at angle/pull, fire the power when the shot passes x = powerX.
  function playTurn(s, angle, pull, powerX, stats) {
    const d = pull * Sim.MAX_PULL;
    if (!Sim.launchFromPull(s, -Math.cos(angle) * d, -Math.sin(angle) * d)) return s;
    let t = 0;
    while (s.phase === 'fly' || s.phase === 'settle') {
      Sim.step(s, Sim.DT);
      t += Sim.DT;
      if (powerX != null && Sim.canPower(s)) {
        const m = s.shots.find((sh) => sh.main && !sh.done);
        if (m && m.body.x >= powerX) Sim.power(s);
      }
      if (t > TURN_LIMIT) {
        if (stats) stats.stuck++;
        s.stuck = true;
        break;
      }
    }
    if (stats) {
      stats.turns++;
      stats.maxTurn = Math.max(stats.maxTurn, t);
    }
    s.events.length = 0;
    return s;
  }

  const value = (s) => (s.phase === 'won' ? 1e9 : 0) + (s.heads.length - Sim.headsLeft(s)) * 1e6 + s.score;

  // The x positions to try the power at: a few metres before the first block or head.
  function powerSpots(s, who) {
    let first = Infinity;
    for (const b of s.blocks) if (!b.broken) first = Math.min(first, b.body.x - b.w / 2);
    for (const h of s.heads) if (!h.popped) first = Math.min(first, h.body.x - 0.5);
    if (!isFinite(first)) return [null];
    return who === 'teddy' ? [null, first - 5, first - 2.5] : [null, first - 9, first - 5];
  }

  // Greedy search: returns { won, shotsUsed, plan, stars, score, stuck, turns, unstable }.
  function solve(level, opts = {}) {
    const stats = { stuck: 0, turns: 0, maxTurn: 0 };
    let s = Sim.create(level, opts);
    const unstable = s.unstable;
    const plan = [];
    while (s.phase === 'aim' && s.queue.length) {
      const who = s.queue[0].who;
      let best = null, bestV = -1, bestMove = null;
      for (const powerX of powerSpots(s, who)) {
        for (const angle of ANGLES) {
          for (const pull of PULLS) {
            const s2 = playTurn(Sim.clone(s), angle, pull, powerX, stats);
            const v = value(s2);
            if (v > bestV) {
              bestV = v;
              best = s2;
              bestMove = { who, angle: Math.round((angle * 180) / Math.PI), pull, powerX: powerX == null ? null : +powerX.toFixed(1) };
            }
          }
        }
        if (best && best.phase === 'won') break;
      }
      bestMove.heads = best.heads.length - Sim.headsLeft(best);
      plan.push(bestMove);
      s = best;
    }
    return {
      id: level.id, won: s.phase === 'won', shotsUsed: plan.length, shots: level.shots, plan, stars: s.stars || 0,
      score: s.score, stuck: stats.stuck, turns: stats.turns, maxTurn: +stats.maxTurn.toFixed(1), unstable,
    };
  }

  // Random play: n full games of random shots and random power taps. Every one must end in won or lost.
  function soak(levels, n, seed = 1) {
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    const out = { games: 0, won: 0, lost: 0, stuck: 0, nan: 0 };
    for (let g = 0; g < n; g++) {
      const level = levels[g % levels.length];
      const s = Sim.create(level, { first: rnd() < 0.5 ? 'teddy' : 'tommy', easy: rnd() < 0.5 });
      let t = 0;
      while (s.phase !== 'won' && s.phase !== 'lost' && t < 300) {
        if (s.phase === 'aim') {
          const a = rnd() * 1.4 - 0.1, p = (0.3 + rnd() * 0.7) * Sim.MAX_PULL;
          Sim.launchFromPull(s, -Math.cos(a) * p, -Math.sin(a) * p);
        }
        Sim.step(s, 1 / 30);
        t += 1 / 30;
        if (rnd() < 0.02) Sim.power(s);
        for (const b of s.world.bodies) if (!isFinite(b.x + b.y + b.a)) { out.nan++; t = 1e9; break; }
        s.events.length = 0;
      }
      out.games++;
      if (s.phase === 'won') out.won++;
      else if (s.phase === 'lost') out.lost++;
      else out.stuck++;
    }
    return out;
  }

  const Solver = { solve, soak, playTurn };
  if (typeof module !== 'undefined' && module.exports) module.exports = Solver;
  else root.Solver = Solver;
})(typeof window !== 'undefined' ? window : globalThis);
