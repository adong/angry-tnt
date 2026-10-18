/* Claude Games kit: blocky cartoon people built from boxes, and the poses that animate them.
   Load after gfx.js. Exposes window.Kit.people: build(look), pose(p, phase, mode, k), handWorld(p, side). */
(function () {
  'use strict';
  const T = THREE;
  const Kit = window.Kit;
  const { makeCanvas, toTexture, shade, roundRect, std, mesh } = Kit.gfx;

  // Shirt prints, painted on the front of the torso.
  const printCache = {};
  function printTexture(kind, base, skin) {
    const key = kind + base + skin;
    if (printCache[key]) return printCache[key];
    const [c, g] = makeCanvas(128, 128);
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    if (kind === 'bricks') {
      // a brick wall, a row of brown blocks, and a little winged buddy peeking over the wall
      g.strokeStyle = shade(base, -0.45);
      g.lineWidth = 2.5;
      for (let y = 72, r = 0; y < 112; y += 10, r++) {
        for (let x = 4 + (r % 2 ? 9 : 0); x < 124; x += 18) g.strokeRect(x, y, 18, 10);
      }
      g.fillStyle = '#8a4b22';
      for (let x = 4; x < 124; x += 20) g.fillRect(x, 113, 18, 13);
      g.fillStyle = '#d63a2f';
      g.beginPath(); g.arc(104, 80, 13, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#ffd83a';
      g.beginPath(); g.arc(88, 60, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(112, 56, 7, 12, 0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(84, 56, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111111';
      g.beginPath(); g.arc(83, 57, 2, 0, Math.PI * 2); g.fill();
    } else if (kind === 'bolt') {
      g.fillStyle = '#ffd400';
      g.beginPath();
      g.moveTo(74, 14); g.lineTo(40, 70); g.lineTo(62, 70); g.lineTo(50, 116); g.lineTo(90, 54); g.lineTo(68, 54);
      g.closePath();
      g.fill();
    } else if (kind === 'star') {
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 16 : 38, a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(64 + Math.cos(a) * r, 62 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    } else if (kind === 'panel') {
      g.fillStyle = '#24232b';
      roundRect(g, 26, 22, 76, 76, 12);
      g.fill();
      const gr = g.createRadialGradient(64, 60, 2, 64, 60, 24);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.4, '#5ef2ff');
      gr.addColorStop(1, 'rgba(94,242,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(64, 60, 24, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5ef2ff';
      for (let i = 0; i < 3; i++) g.fillRect(36 + i * 22, 88, 14, 4);
    } else if (kind === 'torn') {
      // rips with skin showing through, and a few stitches
      for (const [x, y, w, h] of [[22, 30, 26, 20], [74, 64, 34, 22], [36, 92, 22, 18]]) {
        g.fillStyle = skin;
        g.beginPath();
        g.moveTo(x, y + h / 2);
        for (let i = 1; i <= 6; i++) g.lineTo(x + (w * i) / 6, y + (i % 2 ? 0 : h * 0.3));
        for (let i = 6; i >= 0; i--) g.lineTo(x + (w * i) / 6, y + h - (i % 2 ? 0 : h * 0.3));
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 2;
        g.stroke();
      }
      g.strokeStyle = '#2b2233';
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(84, 18); g.lineTo(84, 44); g.stroke();
      for (let y = 22; y < 44; y += 6) { g.beginPath(); g.moveTo(79, y); g.lineTo(89, y); g.stroke(); }
    } else if (kind === 'ufo') {
      const ink = '#555c5e';
      g.fillStyle = 'rgba(240,226,140,0.75)'; // beam
      g.beginPath(); g.moveTo(84, 30); g.lineTo(98, 30); g.lineTo(122, 120); g.lineTo(64, 120); g.closePath(); g.fill();
      g.fillStyle = ink;
      g.beginPath(); g.ellipse(91, 24, 26, 8, 0, 0, Math.PI * 2); g.fill(); // saucer
      g.fillStyle = '#8a9294';
      g.beginPath(); g.arc(91, 18, 9, Math.PI, 0); g.fill(); // dome
      g.fillStyle = '#ffe066';
      for (const x of [72, 84, 98, 110]) { g.beginPath(); g.arc(x, 25, 2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = ink;
      g.beginPath(); g.arc(36, 52, 15, 0, Math.PI * 2); g.fill(); // planets
      g.beginPath(); g.arc(52, 22, 6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(94, 98, 15, 11, -0.3, 0, Math.PI * 2); g.fill(); // dinosaur
      g.beginPath(); g.ellipse(100, 74, 6, 12, 0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(82, 102); g.lineTo(58, 118); g.lineTo(86, 108); g.closePath(); g.fill();
      g.fillRect(88, 106, 5, 12);
      g.fillRect(98, 106, 5, 12);
    } else if (kind === 'paw') {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(64, 74, 22, 18, 0, 0, Math.PI * 2); g.fill();
      for (const [x, y] of [[38, 46], [54, 34], [74, 34], [90, 46]]) {
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      }
    }
    return (printCache[key] = toTexture(c));
  }

  // Spiky hair tufts: [x, z, height, lean forward/back, lean sideways]. The last one is the tuft that sticks up.
  const SPIKES = [
    [-0.18, -0.13, 0.17, -0.5, 0.35], [-0.06, -0.17, 0.2, -0.6, 0.1], [0.07, -0.16, 0.19, -0.55, -0.15], [0.19, -0.12, 0.16, -0.4, -0.4],
    [-0.17, 0.03, 0.19, 0.05, 0.45], [0.0, -0.02, 0.22, -0.1, 0.0], [0.16, 0.04, 0.19, 0.1, -0.45],
    [-0.1, 0.16, 0.17, 0.5, 0.25], [0.1, 0.17, 0.17, 0.55, -0.25], [-0.03, -0.08, 0.38, -0.3, 0.4],
  ];

  // A blocky cartoon person facing -z. `rig` pivots near the waist so rolls spin around the body's middle.
  // c.head: 'human' | 'robot' | 'bear';  c.hair: 'spiky' | 'short' | 'ponytail';  c.hat: 'cap' | 'capBack';
  // c.shirt: 'tee' | 'hoodie' | 'jacket';  c.print: 'bricks' | 'bolt' | 'star' | 'panel' | 'paw'.
  function build(c) {
    const root = new T.Group();
    const rig = new T.Group();
    rig.position.y = 0.55;
    root.add(rig);
    const hipY = 0.88 - 0.55;
    const hips = new T.Group();
    hips.position.y = hipY;
    rig.add(hips);
    const m = (col, o) => std(col, Object.assign({ roughness: 0.7 }, o));
    const skin = c.head === 'robot' ? m(c.skin, { metalness: 0.5, roughness: 0.35 }) : m(c.skin);
    const top = m(c.top), bottom = m(c.bottom), dark = m('#1b1a22'), white = m('#f4f4f4');
    const box = (w, h, d, mat, x, y, z, parent) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);

    // torso: the print goes on the front face (-z)
    const tw = c.belly ? 0.74 : 0.62, td = c.belly ? 0.46 : 0.36;
    const front = c.print ? m('#ffffff', { map: printTexture(c.print, c.top, c.skin) }) : top;
    box(tw, 0.66, td, [top, top, top, top, top, front], 0, 0.33, 0, hips);
    box(tw + 0.02, 0.1, td + 0.02, bottom, 0, 0.04, 0, hips);
    if (c.shirt === 'hoodie') box(0.5, 0.16, 0.14, top, 0, 0.62, 0.17, hips);

    const head = new T.Group();
    head.position.y = 0.93;
    hips.add(head);
    if (c.head === 'robot') robotHead(c, head, box, skin, dark, m);
    else if (c.head === 'bear') bearHead(c, head, box, skin, dark, m);
    else humanHead(c, head, box, skin, dark, white, m);

    const limb = (x, y, parts) => {
      const g = new T.Group();
      g.position.set(x, y, 0);
      hips.add(g);
      parts.forEach(([w, h, d, mat, py, pz]) => box(w, h, d, mat, 0, py, pz || 0, g));
      return g;
    };
    const armParts = c.shirt === 'tee'
      ? [[0.21, 0.26, 0.23, top, -0.11], [0.15, 0.38, 0.16, skin, -0.42], [0.16, 0.14, 0.17, skin, -0.65]]
      : [[0.18, 0.6, 0.2, top, -0.28], [0.16, 0.14, 0.17, skin, -0.63]];
    const shoes = m(c.shoes);
    const legParts = c.shorts
      ? [[0.26, 0.34, 0.28, bottom, -0.17], [0.19, 0.4, 0.2, skin, -0.48], [0.28, 0.16, 0.42, shoes, -0.74, -0.06], [0.3, 0.06, 0.44, white, -0.82, -0.06]]
      : [[0.24, 0.7, 0.26, bottom, -0.35], [0.28, 0.16, 0.42, shoes, -0.74, -0.06], [0.3, 0.06, 0.44, white, -0.82, -0.06]];
    const armL = limb(-(tw / 2 + 0.1), 0.6, armParts);
    const armR = limb(tw / 2 + 0.1, 0.6, armParts);
    const fingers = [];
    if (c.peace) {
      for (const arm of [armL, armR]) {
        for (const side of [-1, 1]) {
          const f = mesh(new T.BoxGeometry(0.04, 0.14, 0.045).translate(0, -0.07, 0), skin, side * 0.03, -0.71, 0, arm);
          f.rotation.z = side * 0.28;
          f.visible = false;
          fingers.push(f);
        }
      }
    }
    const legL = limb(-0.16, 0, legParts);
    const legR = limb(0.16, 0, legParts);

    if (c.pack) {
      box(0.48, 0.52, 0.22, m(c.pack), 0, 0.36, 0.3, hips);
      box(0.34, 0.2, 0.06, m(c.packPocket || '#ffffff'), 0, 0.24, 0.43, hips);
    }
    return { root, rig, hips, head, armL, armR, legL, legR, hipY, fingers, zombie: !!c.zombie };
  }

  // Dark sockets, mismatched glowing pupils, a snaggle-toothed mouth and a stitched scar: spooky, not gory.
  function zombieFace(head, box, dark, white, m) {
    box(0.13, 0.11, 0.03, dark, -0.11, 0.04, -0.235, head);
    box(0.13, 0.11, 0.03, dark, 0.11, 0.04, -0.235, head);
    const glow = new T.MeshBasicMaterial({ color: '#f6ff7a' });
    box(0.045, 0.045, 0.02, glow, -0.1, 0.03, -0.252, head);
    box(0.05, 0.05, 0.02, glow, 0.12, 0.055, -0.252, head);
    box(0.26, 0.09, 0.02, m('#3a1d1d'), 0, -0.12, -0.232, head);
    for (const x of [-0.08, 0.0, 0.07]) box(0.045, 0.045, 0.03, white, x, -0.095, -0.236, head);
    box(0.17, 0.025, 0.03, dark, 0.06, 0.17, -0.236, head);
    for (const x of [0.0, 0.05, 0.1]) box(0.015, 0.06, 0.035, dark, x, 0.17, -0.236, head);
  }

  function humanHead(c, head, box, skin, dark, white, m) {
    box(0.5, 0.48, 0.46, skin, 0, 0, 0, head);
    const hair = m(c.hairColor || '#2a1a12');
    if (c.zombie) zombieFace(head, box, dark, white, m);
    else {
      const eyeH = c.smile ? 0.065 : 0.1;
      box(0.08, eyeH, 0.03, dark, -0.11, 0.04, -0.235, head);
      box(0.08, eyeH, 0.03, dark, 0.11, 0.04, -0.235, head);
      if (c.brows) {
        box(0.12, 0.03, 0.03, hair, -0.11, 0.12, -0.235, head);
        box(0.12, 0.03, 0.03, hair, 0.11, 0.12, -0.235, head);
      }
      if (c.mustache) box(0.3, 0.07, 0.04, m('#3b2516'), 0, -0.1, -0.24, head);
      else if (c.smile) {
        box(0.25, 0.1, 0.02, m('#6b2a22'), 0, -0.12, -0.232, head); // open grin
        box(0.2, 0.045, 0.03, white, 0, -0.095, -0.236, head); // teeth
      } else box(0.16, 0.04, 0.03, m('#8a3b2e'), 0, -0.12, -0.235, head);
    }
    box(0.07, 0.14, 0.12, skin, -0.28, 0, 0, head);
    box(0.07, 0.14, 0.12, skin, 0.28, 0, 0, head);

    if (c.hat) {
      box(0.52, 0.24, 0.12, hair, 0, 0.04, 0.19, head);
      const hat = m(c.hatColor);
      box(0.54, 0.16, 0.5, hat, 0, 0.3, 0, head);
      const back = c.hat === 'capBack';
      box(0.46, 0.05, 0.3, back ? hat : dark, 0, 0.24, back ? 0.37 : -0.37, head);
      if (c.badge) box(0.12, 0.1, 0.03, m('#ffd400'), 0, 0.3, -0.26, head);
    } else {
      box(0.54, 0.1, 0.5, hair, 0, 0.27, 0, head); // crown
      box(0.53, c.hair === 'ponytail' ? 0.44 : 0.36, 0.08, hair, 0, c.hair === 'ponytail' ? 0.02 : 0.08, 0.22, head); // back
      box(0.05, 0.2, 0.42, hair, -0.27, 0.15, 0.02, head); // sides above the ears
      box(0.05, 0.2, 0.42, hair, 0.27, 0.15, 0.02, head);
      if (c.hair === 'spiky') {
        for (const [x, z, h, lx, lz] of SPIKES) {
          const s = mesh(new T.BoxGeometry(0.11, h, 0.11).translate(0, h / 2, 0), hair, x, 0.29, z, head);
          s.rotation.set(lx, 0, lz);
        }
      } else if (c.hair === 'ponytail') {
        box(0.5, 0.08, 0.06, hair, 0, 0.2, -0.22, head); // fringe
        box(0.2, 0.08, 0.1, m(c.top), 0, 0.2, 0.3, head); // hair tie
        const tail = mesh(new T.BoxGeometry(0.16, 0.46, 0.14).translate(0, -0.23, 0), hair, 0, 0.2, 0.32, head);
        tail.rotation.x = 0.35;
      } else {
        box(0.5, 0.07, 0.06, hair, 0, 0.21, -0.22, head);
      }
    }
    if (c.headphones) {
      const phones = m(c.headphones);
      const band = new T.Mesh(new T.TorusGeometry(0.3, 0.035, 6, 18, Math.PI), phones);
      band.position.y = 0.06;
      head.add(band);
      box(0.08, 0.18, 0.18, phones, -0.3, 0.02, 0, head);
      box(0.08, 0.18, 0.18, phones, 0.3, 0.02, 0, head);
    }
  }

  function robotHead(c, head, box, metal, dark, m) {
    box(0.54, 0.46, 0.48, metal, 0, 0.01, 0, head);
    box(0.46, 0.2, 0.03, dark, 0, 0.05, -0.245, head); // visor
    const glow = new T.MeshBasicMaterial({ color: c.eyes || '#5ef2ff' });
    box(0.1, 0.07, 0.02, glow, -0.11, 0.05, -0.262, head);
    box(0.1, 0.07, 0.02, glow, 0.11, 0.05, -0.262, head);
    box(0.16, 0.03, 0.02, glow, 0, -0.13, -0.245, head);
    box(0.04, 0.2, 0.04, dark, 0, 0.33, 0, head); // antenna
    mesh(new T.SphereGeometry(0.06, 10, 8), new T.MeshBasicMaterial({ color: '#ff3d3d' }), 0, 0.46, 0, head, false);
    box(0.06, 0.16, 0.16, m(c.top), -0.29, 0, 0, head);
    box(0.06, 0.16, 0.16, m(c.top), 0.29, 0, 0, head);
  }

  function bearHead(c, head, box, fur, dark, m) {
    box(0.54, 0.48, 0.48, fur, 0, 0, 0, head);
    const pink = m('#f2a3a3');
    for (const x of [-0.2, 0.2]) {
      box(0.15, 0.15, 0.1, fur, x, 0.29, 0.02, head);
      box(0.08, 0.08, 0.02, pink, x, 0.29, -0.035, head);
    }
    box(0.26, 0.17, 0.1, m(c.muzzle || '#d9b48a'), 0, -0.09, -0.26, head);
    box(0.1, 0.06, 0.04, dark, 0, -0.04, -0.315, head);
    box(0.08, 0.02, 0.02, dark, 0, -0.13, -0.312, head);
    box(0.07, 0.08, 0.03, dark, -0.12, 0.07, -0.245, head);
    box(0.07, 0.08, 0.03, dark, 0.12, 0.07, -0.245, head);
  }

  const MODES = ['run', 'walk', 'jump', 'roll', 'jet', 'fall', 'grab', 'wave', 'give', 'peace', 'guard', 'jab', 'straight', 'boxing', 'jumpshot'];

  // Ease a person's limbs toward a named pose. `ph` is a running phase in radians that drives cycles (strides,
  // waves, the boxing combo); `k` in 0..1 is how far to move this frame (1 snaps). Unknown modes stand still.
  // Arms pivot at the shoulder and legs at the hip: rotation.x swings forward/back, rotation.z swings out sideways.
  function pose(p, ph, mode, k) {
    const s = Math.sin(ph), c = Math.cos(ph);
    let ll = 0, rl = 0, la = 0, ra = 0, az = 0, laz = null, raz = null, lean = -0.12, bob = 0, head = 0, twist = 0, sc = 1;
    if (mode === 'boxing') {
      // shadow-boxing: jab, guard, straight, guard, one beat per quarter turn of the phase
      const beat = Math.floor((((ph / (Math.PI * 2)) % 1) + 1) % 1 * 4);
      mode = beat === 0 ? 'jab' : beat === 2 ? 'straight' : 'guard';
    }
    switch (mode) {
      case 'run': ll = s * 0.95; rl = -s * 0.95; la = -s * 0.85; ra = s * 0.85; bob = Math.abs(c) * 0.09; break;
      case 'walk': ll = s * 0.45; rl = -s * 0.45; la = -s * 0.3; ra = s * 0.3; bob = Math.abs(c) * 0.05; lean = -0.05; break;
      case 'jump': ll = 0.8; rl = -0.4; la = 2.5; ra = 2.1; az = 0.3; lean = -0.05; break;
      case 'roll': ll = rl = 2.0; la = ra = 1.3; lean = -0.6; head = 0.4; sc = 0.8; break;
      case 'jet': ll = 0.2 + s * 0.08; rl = -0.1 - s * 0.08; la = ra = 0.35; az = 0.25; lean = -0.4; break;
      case 'fall': ll = 1.0; rl = 0.6; la = ra = 2.7; az = 0.6; lean = 0.55; head = -0.3; break;
      case 'grab': ll = 0.15; rl = -0.15; la = ra = 1.45; lean = -0.1; break;
      case 'wave': ll = s * 0.95; rl = -s * 0.95; la = -s * 0.85; ra = 2.9; raz = 0.35 + Math.sin(ph * 2.5) * 0.35; bob = Math.abs(c) * 0.09; break;
      case 'give': ll = s * 0.95; rl = -s * 0.95; la = -s * 0.85; ra = 1.55; raz = -0.5; bob = Math.abs(c) * 0.09; break;
      // Tommy's favourite: both arms up in a Y with peace fingers (比耶)
      case 'peace': ll = s * 0.95; rl = -s * 0.95; la = ra = 0.15; az = 2.6 + Math.sin(ph * 2) * 0.1; bob = Math.abs(c) * 0.09; lean = 0; head = -0.1; break;
      // Teddy's boxing, Mike Tyson style: peek-a-boo guard with fists by the chin, then jab (lead hand) and straight (rear hand)
      case 'guard': ll = 0.45; rl = -0.25; la = ra = 2.15; az = -0.38; lean = -0.28; head = 0.15; bob = Math.abs(s) * 0.04 - 0.06; break;
      case 'jab': ll = 0.45; rl = -0.25; la = 1.62; laz = 0.05; ra = 2.15; raz = -0.38; lean = -0.25; twist = -0.3; head = 0.15; bob = -0.06; break;
      case 'straight': ll = 0.5; rl = -0.4; la = 2.15; laz = 0.38; ra = 1.62; raz = -0.05; lean = -0.32; twist = 0.4; head = 0.15; bob = -0.06; break;
      // Teddy's basketball jump shot: both hands up and forward in the shooting motion, eyes on the hoop
      // (the game adds the jump and the ball)
      case 'jumpshot': ll = rl = 0.25; la = 2.45; ra = 2.6; az = -0.2; lean = 0.05; head = -0.3; break;
    }
    if (p.zombie && mode !== 'roll' && mode !== 'fall') {
      la = 1.5 + s * 0.08;
      ra = 1.38 - s * 0.08;
      az = 0;
      laz = raz = null;
      head = 0.15 + s * 0.06;
    }
    const to = (o, prop, v) => { o[prop] += (v - o[prop]) * k; };
    to(p.legL.rotation, 'x', ll);
    to(p.legR.rotation, 'x', rl);
    to(p.armL.rotation, 'x', la);
    to(p.armR.rotation, 'x', ra);
    to(p.armL.rotation, 'z', laz === null ? -az : laz);
    to(p.armR.rotation, 'z', raz === null ? az : raz);
    to(p.hips.rotation, 'x', lean);
    to(p.hips.rotation, 'y', twist);
    to(p.head.rotation, 'x', head);
    p.hips.position.y = p.hipY + bob;
    if (p.fingers) for (const f of p.fingers) f.visible = mode === 'peace';
    p.rig.scale.setScalar(p.rig.scale.x + (sc - p.rig.scale.x) * k);
  }

  // World position of a hand (side -1 = left, 1 = right), e.g. to hold or throw a prop. Needs an up-to-date
  // matrixWorld (after a render, or call p.root.updateMatrixWorld(true) first).
  function handWorld(p, side, out = new T.Vector3()) {
    return (side < 0 ? p.armL : p.armR).localToWorld(out.set(0, -0.7, 0));
  }

  Kit.people = { build, pose, handWorld, MODES };
})();
