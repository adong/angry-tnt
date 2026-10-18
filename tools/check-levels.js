#!/usr/bin/env node
/* Angry TNT level check: every level must stand still on its own, be clearable with the shots it gives you
   (starting with Teddy and starting with Tommy, on NORMAL), and every simulated turn must end.
   Each level runs in its own process, in parallel.
     node tools/check-levels.js            all levels, then a random soak
     node tools/check-levels.js 2-3 3-5    just these
     node tools/check-levels.js --fail     proves the check can fail: gives every level one shot */
'use strict';
const path = require('path');
const { fork } = require('child_process');
const os = require('os');

const js = (f) => path.join(__dirname, '..', 'js', f);

if (process.argv[2] === '--worker') {
  const Solver = require(js('solver.js'));
  const { LEVELS } = require(js('levels.js'));
  process.on('message', ({ id, first, oneShot }) => {
    const L = Object.assign({}, LEVELS.find((l) => l.id === id));
    if (oneShot) L.shots = 1;
    const t0 = Date.now();
    const r = Solver.solve(L, { first });
    r.first = first;
    r.ms = Date.now() - t0;
    process.send(r);
  });
  return;
}

const { LEVELS } = require(js('levels.js'));
const args = process.argv.slice(2);
const oneShot = args.includes('--fail');
const ids = args.filter((a) => !a.startsWith('--'));
const jobs = [];
for (const L of LEVELS) {
  if (ids.length && !ids.includes(L.id)) continue;
  for (const first of ['teddy', 'tommy']) jobs.push({ id: L.id, first, oneShot });
}

const results = [];
let running = 0;
const t0 = Date.now();
const width = Math.max(1, Math.min(os.cpus().length - 1, jobs.length));

function next() {
  if (!jobs.length) {
    if (!running) report();
    return;
  }
  const job = jobs.shift();
  running++;
  const w = fork(__filename, ['--worker']);
  w.on('message', (r) => {
    results.push(r);
    const plan = r.plan.map((p) => `${p.who[1]}${p.angle}°×${p.pull}${p.powerX != null ? '!' : ''}→${p.heads}`).join(' ');
    console.log(`${r.won ? 'PASS' : 'FAIL'} ${r.id} ${r.first.padEnd(5)} ${r.shotsUsed}/${r.shots} shots ${'★'.repeat(r.stars).padEnd(3)} ${String(r.score).padStart(6)}  stuck ${r.stuck}  longest turn ${r.maxTurn}s  ${r.unstable.length ? 'UNSTABLE ' + JSON.stringify(r.unstable) : ''}  [${plan}]  ${(r.ms / 1000).toFixed(1)}s`);
    w.kill();
    running--;
    next();
  });
  w.send(job);
}

function report() {
  results.sort((a, b) => (a.id + a.first).localeCompare(b.id + b.first));
  const failed = results.filter((r) => !r.won || r.stuck || r.unstable.length);
  console.log(`\n${results.length - failed.length}/${results.length} runs passed in ${((Date.now() - t0) / 1000).toFixed(0)}s` +
    `, ${results.reduce((n, r) => n + r.turns, 0)} turns simulated, ${results.reduce((n, r) => n + r.stuck, 0)} stuck.`);
  if (!ids.length && !oneShot) {
    const Solver = require(js('solver.js'));
    const soak = Solver.soak(LEVELS, 150);
    console.log(`random soak: ${soak.games} games, ${soak.won} won, ${soak.lost} lost, ${soak.stuck} stuck, ${soak.nan} NaN`);
    if (soak.stuck || soak.nan) process.exitCode = 1;
  }
  if (failed.length) {
    console.log('FAILED: ' + failed.map((r) => `${r.id}/${r.first}`).join(', '));
    process.exitCode = 1;
  }
}

for (let i = 0; i < width; i++) next();
