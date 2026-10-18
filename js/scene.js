/* Angry TNT: what you see. The renderer and side-on camera, the three worlds (backyard, subway, castle) with their
   skies and props, the blocks (wood, ice, stone, with cracks as they take damage), the cartoon zombie heads, the
   fixed platforms and the slingshot. Every texture is painted on a canvas. Exposes window.Scene. */
(function () {
  'use strict';
  const T = THREE;
  const G = Kit.gfx;
  const { makeCanvas, toTexture, shade, std, boxUV } = G;

  // a seeded random, so painted textures look the same every time
  let seed = 7;
  const srand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sr = (a, b) => a + srand() * (b - a);

  const BLOCK_DEPTH = 1.2;
  const tr = (s) => (Kit.lang ? Kit.lang.t(s) : s); // words painted on signs, in the player's language (kit/lang.js)
  const S = { renderer: null, scene: null, camera: null, world: null, backdrop: null, sun: null, hemi: null, animated: [] };

  function init(canvas) {
    const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = T.sRGBEncoding;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    S.renderer = r;
    S.scene = new T.Scene();
    S.camera = new T.PerspectiveCamera(30, 1, 0.5, 600);
    S.hemi = new T.HemisphereLight('#ffffff', '#6b8a4a', 0.75);
    S.scene.add(S.hemi);
    const sun = new T.DirectionalLight('#fff2dc', 1.05);
    sun.position.set(-18, 34, 26);
    sun.target.position.set(14, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -30; sc.right = 34; sc.top = 24; sc.bottom = -14; sc.near = 5; sc.far = 110;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    S.scene.add(sun, sun.target);
    S.sun = sun;
    S.slingshot = buildSlingshot();
    S.scene.add(S.slingshot.group);
    return S;
  }

  function resize(w, h) {
    if (!w || !h) return; // the pane can report 0x0 while hidden
    S.renderer.setSize(w, h, false);
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ camera framing
  // The camera looks straight down -z at the play plane (z = 0), so framing is simple trigonometry.
  const halfH = (d) => d * Math.tan((S.camera.fov * Math.PI) / 360);

  // Distance and centre that show the rectangle x0..x1, y0..y1, keeping the ground (y0) at the bottom edge and
  // x0 at the left edge when the screen's shape leaves room to spare.
  function frame(x0, x1, y0, y1, out = {}) {
    const a = S.camera.aspect || 1.6;
    const t = Math.tan((S.camera.fov * Math.PI) / 360);
    const d = Math.max((x1 - x0) / 2 / (t * a), (y1 - y0) / 2 / t);
    const hh = d * t, hw = hh * a;
    out.d = d;
    out.x = x0 + hw;
    out.y = y0 + hh;
    return out;
  }

  // screen pixel -> point on the play plane
  function toWorld(px, py, w, h, out = {}) {
    const c = S.camera, hh = halfH(c.position.z), hw = hh * c.aspect;
    out.x = c.position.x + ((px / w) * 2 - 1) * hw;
    out.y = c.position.y + (1 - (py / h) * 2) * hh;
    return out;
  }
  const pxPerMetre = (h) => h / (2 * halfH(S.camera.position.z));

  // ------------------------------------------------------------------ painted textures

  function crack(g, n, color, width) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      let x = sr(10, 118), y = sr(10, 118);
      g.beginPath();
      g.moveTo(x, y);
      const ang = sr(0, Math.PI * 2);
      for (let s = 0; s < 5; s++) {
        x += Math.cos(ang + sr(-0.9, 0.9)) * sr(8, 18);
        y += Math.sin(ang + sr(-0.9, 0.9)) * sr(8, 18);
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }

  const texCache = {};
  // stage 0 = whole, 1 = cracked, 2 = badly cracked; vertical = grain runs up (posts)
  function blockTexture(mat, stage, vertical) {
    const key = mat + stage + (vertical ? 'v' : 'h');
    if (texCache[key]) return texCache[key];
    seed = 11 + stage * 31 + (mat === 'ice' ? 5 : mat === 'stone' ? 9 : 0);
    const [c, g] = makeCanvas(128, 128);
    if (mat === 'wood') {
      g.fillStyle = '#cf9150';
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = `rgba(120,70,25,${sr(0.15, 0.4)})`;
        g.lineWidth = sr(1, 3);
        const y = sr(0, 128);
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 128; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * sr(1, 3));
        g.stroke();
      }
      g.fillStyle = 'rgba(110,60,20,0.55)';
      g.beginPath(); g.ellipse(sr(30, 100), sr(30, 100), 7, 4, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7d4a1d';
      g.lineWidth = 6;
      g.strokeRect(3, 3, 122, 122);
      g.fillStyle = 'rgba(255,230,190,0.25)';
      g.fillRect(6, 6, 116, 5);
      if (stage) crack(g, stage * 3, '#4a2a0e', 3);
    } else if (mat === 'ice') {
      const gr = g.createLinearGradient(0, 0, 128, 128);
      gr.addColorStop(0, '#e8fbff');
      gr.addColorStop(1, '#9fdcf5');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 4;
      for (let i = 0; i < 4; i++) {
        const x = sr(-20, 100);
        g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 40, 0); g.stroke();
      }
      g.strokeStyle = '#ffffff';
      g.lineWidth = 6;
      g.strokeRect(3, 3, 122, 122);
      if (stage) crack(g, stage * 3, 'rgba(60,140,190,0.9)', 2.5);
    } else {
      g.fillStyle = '#a3a9b2';
      g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = srand() < 0.5 ? 'rgba(80,86,96,0.18)' : 'rgba(230,234,240,0.18)';
        g.beginPath(); g.arc(sr(0, 128), sr(0, 128), sr(3, 12), 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = '#646b75';
      g.lineWidth = 7;
      g.strokeRect(3.5, 3.5, 121, 121);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(7, 7, 114, 5);
      if (stage) crack(g, stage * 3, '#3d424a', 3.5);
    }
    const t = toTexture(c, true);
    t.userData.keep = true;
    if (vertical) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }
    return (texCache[key] = t);
  }

  const matCache = {};
  function blockMaterial(mat, stage, vertical) {
    const key = mat + stage + (vertical ? 'v' : 'h');
    if (matCache[key]) return matCache[key];
    const map = blockTexture(mat, stage, vertical);
    let m;
    if (mat === 'ice') m = std('#ffffff', { map, roughness: 0.2, transparent: true, opacity: 0.86, emissive: '#5fc8ee', emissiveIntensity: 0.18 });
    else if (mat === 'stone') m = std('#ffffff', { map, roughness: 0.9 });
    else m = std('#ffffff', { map, roughness: 0.75 });
    return (matCache[key] = m);
  }

  function makeBlock(b) {
    const geo = new T.BoxGeometry(b.w, b.h, BLOCK_DEPTH);
    boxUV(geo, b.w, b.h, BLOCK_DEPTH, 1);
    const vertical = b.h > b.w * 1.5;
    const m = new T.Mesh(geo, blockMaterial(b.mat, 0, vertical));
    m.castShadow = m.receiveShadow = true;
    m.userData = { mat: b.mat, vertical, stage: 0 };
    return m;
  }

  function setBlockStage(mesh, stage) {
    const u = mesh.userData;
    if (u.stage === stage) return;
    u.stage = stage;
    mesh.material = blockMaterial(u.mat, stage, u.vertical);
  }

  // ------------------------------------------------------------------ zombie heads

  const ZOMBIE = Kit.roster.get('zombie').look;
  const HEAD_LOOKS = {
    zombie: ZOMBIE,
    cap: Object.assign({}, ZOMBIE, { hat: 'capBack', hatColor: '#ff3d7f', headphones: '#2a2733' }),
    helmet: Object.assign({}, ZOMBIE, { hat: 'cap', hatColor: '#aab3bf' }),
    king: Object.assign({}, ZOMBIE, { hat: 'cap', hatColor: '#ffd400', badge: true }),
  };

  // A head on its own: the kit's zombie head, detached from its body, turned to face the camera and sized so its
  // face fills the physics box (size wide, 1.1 x size tall).
  function makeHead(kind, size) {
    const p = Kit.people.build(HEAD_LOOKS[kind] || ZOMBIE);
    const head = p.head;
    head.parent.remove(head);
    head.position.set(0, -0.04, 0);
    head.rotation.set(0, Math.PI, 0);
    const k = size / 0.5;
    const g = new T.Group();
    const inner = new T.Group();
    inner.scale.setScalar(k);
    inner.add(head);
    g.add(inner);
    if (kind === 'king') {
      // a little gold crown on the cap
      const gold = std('#ffd400', { metalness: 0.4, roughness: 0.35, emissive: '#7a5a00', emissiveIntensity: 0.3 });
      for (const x of [-0.18, 0, 0.18]) {
        const pt = new T.Mesh(new T.BoxGeometry(0.09, 0.14, 0.09), gold);
        pt.position.set(x, 0.44, 0);
        pt.rotation.z = Math.PI / 4;
        inner.add(pt);
      }
    }
    if (kind === 'helmet') {
      // a visor strip so the grey cap reads as a knight's helmet
      const v = new T.Mesh(new T.BoxGeometry(0.5, 0.05, 0.04), std('#6f7884', { metalness: 0.5, roughness: 0.4 }));
      v.position.set(0, 0.2, 0.26);
      inner.add(v);
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData = { inner };
    return g;
  }

  // ------------------------------------------------------------------ fixed ground pieces

  function paint(w, h, fn, repeat) {
    const [c, g] = makeCanvas(w, h);
    fn(g, w, h);
    return toTexture(c, repeat);
  }

  const lawnTop = () => paint(256, 256, (g) => {
    seed = 3;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#6fc24a' : '#7dd156';
      g.fillRect(i * 32, 0, 32, 256);
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = srand() < 0.5 ? 'rgba(40,110,30,0.35)' : 'rgba(180,240,140,0.3)';
      g.fillRect(sr(0, 256), sr(0, 256), 2, sr(3, 7));
    }
  }, true);

  const soilSide = (grass) => paint(128, 128, (g) => {
    seed = 5;
    g.fillStyle = '#8a5a34';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = srand() < 0.5 ? 'rgba(60,35,15,0.4)' : 'rgba(190,140,90,0.35)';
      g.beginPath(); g.arc(sr(0, 128), sr(0, 128), sr(2, 6), 0, Math.PI * 2); g.fill();
    }
    if (grass) {
      g.fillStyle = '#6cc046';
      g.fillRect(0, 0, 128, 18);
      for (let x = 0; x < 128; x += 8) {
        g.beginPath(); g.moveTo(x, 18); g.lineTo(x + 4, 28); g.lineTo(x + 8, 18); g.fill();
      }
    }
  }, true);

  const tiles = (base, line, size = 32, stripe) => paint(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = line;
    g.lineWidth = 2;
    for (let i = 0; i <= 128; i += size) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
    }
    if (stripe) {
      g.fillStyle = stripe;
      g.fillRect(0, 0, 128, 14);
    }
  }, true);

  const bricks = (base, mortar) => paint(128, 128, (g) => {
    seed = 21;
    g.fillStyle = mortar;
    g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 4; r++) {
      for (let i = -1; i < 3; i++) {
        const x = i * 64 + (r % 2 ? 32 : 0);
        g.fillStyle = shade(base, sr(-0.12, 0.12));
        g.fillRect(x + 2, r * 32 + 2, 60, 28);
      }
    }
  }, true);

  function texturedBox(w, h, d, mats, unit = 1) {
    const geo = new T.BoxGeometry(w, h, d);
    boxUV(geo, w, h, d, unit);
    const m = new T.Mesh(geo, mats);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  let staticTex = null;
  function staticTextures() {
    if (staticTex) return staticTex;
    staticTex = {
      grassTop: lawnTop(),
      soil: soilSide(true),
      concrete: tiles('#b9bcc4', '#9a9ea8', 64, '#ffd400'),
      concreteSide: tiles('#8f939c', '#7a7e87', 64),
      step: paint(64, 64, (g) => {
        g.fillStyle = '#5b606b';
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#777d89';
        for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 4, 64);
        g.fillStyle = '#ffd400';
        g.fillRect(0, 0, 64, 6);
      }, true),
      rock: bricks('#9aa1ab', '#6c727c'),
      train: paint(512, 128, paintTrain),
    };
    for (const t of Object.values(staticTex)) t.userData.keep = true;
    return staticTex;
  }

  // the side of a T&T Line train car: stripes, windows and the line's name
  function paintTrain(g) {
    g.fillStyle = '#e9edf2';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#18b4ff';
    g.fillRect(0, 84, 512, 16);
    g.fillStyle = '#ff3d7f';
    g.fillRect(0, 100, 512, 6);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = '#2b3550';
      G.roundRect(g, 20 + i * 82, 22, 56, 46, 8);
      g.fill();
      g.fillStyle = 'rgba(160,220,255,0.55)';
      G.roundRect(g, 26 + i * 82, 26, 22, 18, 4);
      g.fill();
    }
    g.font = `bold 18px ${G.FONT}`;
    g.fillStyle = '#18b4ff';
    g.fillText(tr('T&T LINE'), 380, 120);
  }

  // The language changed: repaint the words on signs (the train's line name, the subway's station signs and posters).
  function relang() {
    if (staticTex) {
      const c = staticTex.train.image;
      paintTrain(c.getContext('2d'));
      staticTex.train.needsUpdate = true;
    }
    if (S.world) {
      const w = S.world;
      S.world = null;
      setWorld(w);
    }
  }

  // a fixed ground piece; physics box w x h centred at x, y
  function makeStatic(st) {
    const tx = staticTextures();
    const d = st.look === 'train' ? 3.4 : 4;
    let m;
    if (st.look === 'platform') {
      const top = std('#ffffff', { map: tx.concrete }), side = std('#ffffff', { map: tx.concreteSide });
      m = texturedBox(st.w, st.h, d, [side, side, top, side, side, side]);
    } else if (st.look === 'train') {
      const side = tx.train.clone();
      side.needsUpdate = true;
      side.wrapS = T.RepeatWrapping;
      const front = std('#ffffff', { map: side, roughness: 0.4, metalness: 0.2 });
      const body = std('#dfe4ea', { roughness: 0.4, metalness: 0.25 });
      const geo = new T.BoxGeometry(st.w, st.h, d);
      m = new T.Mesh(geo, [body, body, std('#b9c0c9', { roughness: 0.5 }), body, front, body]);
      m.castShadow = m.receiveShadow = true;
      // wheels
      for (const x of [-st.w / 2 + 1.4, -st.w / 2 + 2.6, st.w / 2 - 2.6, st.w / 2 - 1.4]) {
        const wh = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.3, 14), std('#2a2d35', { metalness: 0.5 }));
        wh.rotation.x = Math.PI / 2;
        wh.position.set(x, -st.h / 2 + 0.1, d / 2 - 0.1);
        m.add(wh);
      }
    } else if (st.look === 'step') {
      const s = std('#ffffff', { map: tx.step, roughness: 0.6, metalness: 0.2 });
      m = texturedBox(st.w, st.h, d, [s, s, s, s, std('#6b717d', { roughness: 0.6 }), s]);
    } else if (st.look === 'rock') {
      const r = std('#ffffff', { map: tx.rock });
      m = texturedBox(st.w, st.h, d, r);
    } else {
      // a grassy hill: one tile of soil (with its grass lip) from top to bottom of the side
      const top = std('#ffffff', { map: tx.grassTop }), side = std('#ffffff', { map: tx.soil });
      m = texturedBox(st.w, st.h, d, [side, side, top, side, side, side], st.h);
    }
    m.position.set(st.x, st.y, 0);
    return m;
  }

  // ------------------------------------------------------------------ the slingshot

  function buildSlingshot() {
    const group = new T.Group();
    const wood = std('#8b5a2b', { roughness: 0.8 });
    const dark = std('#5e3a18', { roughness: 0.8 });
    const box = (w, h, d, m, x, y, z, rz = 0) => {
      const b = new T.Mesh(new T.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.rotation.z = rz;
      b.castShadow = true;
      group.add(b);
      return b;
    };
    box(0.42, 2.3, 0.42, wood, 0, 1.15, 0);
    box(0.3, 1.5, 0.32, wood, -0.33, 2.85, -0.3, 0.36);
    box(0.3, 1.5, 0.32, wood, 0.33, 2.85, 0.3, -0.36);
    box(0.5, 0.18, 0.5, dark, 0, 2.2, 0);
    box(0.36, 0.14, 0.36, dark, -0.56, 3.45, -0.3, 0.36);
    box(0.36, 0.14, 0.36, dark, 0.56, 3.45, 0.3, -0.36);
    const tipBack = new T.Vector3(-0.6, 3.45, -0.3), tipFront = new T.Vector3(0.6, 3.45, 0.3);
    const bandMat = std('#4a2a1a', { roughness: 0.6 });
    const band = () => {
      const m = new T.Mesh(new T.BoxGeometry(1, 0.13, 0.13), bandMat);
      m.castShadow = true;
      group.add(m);
      return m;
    };
    const back = band(), front = band();
    const pouch = new T.Mesh(new T.BoxGeometry(0.34, 0.75, 0.75), std('#3b2416', { roughness: 0.7 }));
    pouch.castShadow = true;
    group.add(pouch);
    const tmp = new T.Vector3();
    const stretch = (m, a, b) => {
      tmp.subVectors(b, a);
      const len = tmp.length();
      m.position.copy(a).addScaledVector(tmp, 0.5);
      m.scale.x = Math.max(0.01, len);
      m.rotation.set(0, Math.atan2(-tmp.z, tmp.x), Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), 'YZX');
    };
    const pBack = new T.Vector3(), pFront = new T.Vector3();
    // put the pouch at (x, y): the back of a ball of radius r sitting in it
    function setPouch(x, y, r = 0.55) {
      const dx = x - 0, dy = y - 3.3;
      const len = Math.hypot(dx, dy);
      const ux = len > 0.05 ? dx / len : -1, uy = len > 0.05 ? dy / len : 0;
      const px = x + ux * r * 0.85, py = y + uy * r * 0.85;
      pouch.position.set(px, py, 0);
      pouch.rotation.z = Math.atan2(uy, ux);
      pBack.set(px, py, -0.22);
      pFront.set(px, py, 0.22);
      stretch(back, tipBack, pBack);
      stretch(front, tipFront, pFront);
    }
    setPouch(0, 3.3);
    return { group, setPouch, pouch };
  }

  // ------------------------------------------------------------------ the three worlds

  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        if (m.map && !m.map.userData.keep) m.map.dispose();
        m.dispose();
      });
    });
  }

  function gradientTexture(stops) {
    const [c, g] = makeCanvas(4, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    return toTexture(c);
  }

  function cloudTexture() {
    return paint(256, 128, (g) => {
      g.fillStyle = '#ffffff';
      for (const [x, y, r] of [[70, 80, 34], [115, 62, 44], [165, 78, 36], [200, 90, 24], [40, 94, 22]]) {
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
      g.fillRect(40, 90, 170, 26);
    });
  }

  function plane(w, h, mat, x, y, z, parent) {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function groundSlab(group, top, side) {
    const geo = new T.BoxGeometry(260, 60, 70);
    boxUV(geo, 260, 60, 70, 8);
    const m = new T.Mesh(geo, [side, side, top, side, side, side]);
    m.position.set(40, -30, -27);
    m.receiveShadow = true;
    group.add(m);
  }

  function backyard(g) {
    S.scene.background = gradientTexture([[0, '#3d9bf0'], [0.55, '#8fd0ff'], [1, '#d8f1ff']]);
    S.scene.fog = new T.Fog('#cdeeff', 150, 400);
    S.hemi.color.set('#ffffff');
    S.hemi.groundColor.set('#6b8a4a');
    S.hemi.intensity = 0.75;
    S.sun.color.set('#fff2dc');
    S.sun.intensity = 1.05;
    // far hills
    plane(700, 90, new T.MeshBasicMaterial({ map: paint(1024, 256, (c) => {
      seed = 4;
      for (const [col, base, amp] of [['#9bd37a', 150, 40], ['#7cc55e', 185, 30]]) {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, 256);
        for (let x = 0; x <= 1024; x += 16) c.lineTo(x, base - Math.sin(x * 0.012 + base) * amp - Math.sin(x * 0.031) * 12);
        c.lineTo(1024, 256);
        c.fill();
      }
      for (let i = 0; i < 40; i++) {
        const x = sr(0, 1024), y = sr(165, 210);
        c.fillStyle = '#4f9a3c';
        c.beginPath(); c.arc(x, y, sr(6, 12), 0, Math.PI * 2); c.fill();
      }
    }), transparent: true, fog: false }), 60, 30, -190, g);
    // clouds
    const ct = cloudTexture();
    for (let i = 0; i < 9; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: ct, fog: false, opacity: 0.95 }));
      s.scale.set(28, 14, 1);
      s.position.set(-60 + i * 26 + sr(-8, 8), 34 + sr(-6, 14), -120 - sr(0, 40));
      s.userData.drift = sr(0.3, 0.8);
      g.add(s);
      S.animated.push((t) => { s.position.x = ((s.position.x + 120 + s.userData.drift * 0.016) % 300) - 120; });
    }
    groundSlab(g, std('#ffffff', { map: lawnTop() }), std('#ffffff', { map: soilSide(false) }));
    // picket fence
    const picket = new T.BoxGeometry(0.22, 1.5, 0.08);
    const n = 260;
    const fence = new T.InstancedMesh(picket, std('#ffffff', { roughness: 0.7 }), n);
    const mtx = new T.Matrix4();
    for (let i = 0; i < n; i++) {
      mtx.makeTranslation(-40 + i * 0.5, 0.75, -9);
      fence.setMatrixAt(i, mtx);
    }
    fence.castShadow = fence.receiveShadow = true;
    g.add(fence);
    for (const y of [0.45, 1.15]) {
      const rail = new T.Mesh(new T.BoxGeometry(130, 0.14, 0.06), std('#f2f2f2'));
      rail.position.set(25, y, -9.08);
      g.add(rail);
    }
    // the house
    const house = new T.Group();
    const wall = new T.Mesh(new T.BoxGeometry(10, 6, 7), std('#ffcf6b', { roughness: 0.85 }));
    wall.position.y = 3;
    house.add(wall);
    const roofMat = std('#d6453a', { roughness: 0.7 });
    for (const side of [-1, 1]) {
      const r = new T.Mesh(new T.BoxGeometry(6.3, 0.35, 7.6), roofMat);
      r.position.set(side * 2.55, 7.45, 0);
      r.rotation.z = -side * 0.62;
      house.add(r);
    }
    const gable = new T.Mesh(new T.CylinderGeometry(0, 5.2, 3, 4, 1), std('#ffcf6b', { roughness: 0.85 }));
    gable.rotation.y = Math.PI / 4;
    gable.scale.set(1, 1, 0.66);
    gable.position.y = 7.5;
    house.add(gable);
    const win = std('#bfe8ff', { emissive: '#7fc8ff', emissiveIntensity: 0.25 });
    for (const x of [-2.6, 2.6]) {
      const w = new T.Mesh(new T.BoxGeometry(1.8, 1.6, 0.1), win);
      w.position.set(x, 3.6, 3.52);
      house.add(w);
    }
    const door = new T.Mesh(new T.BoxGeometry(1.4, 2.6, 0.1), std('#6a3d1e'));
    door.position.set(0, 1.3, 3.52);
    house.add(door);
    house.position.set(-16, 0, -18);
    house.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    g.add(house);
    // trees
    const trunk = std('#7a4a22'), leaf = std('#4fae3c', { roughness: 0.9 }), leaf2 = std('#62c24a', { roughness: 0.9 });
    for (const [x, z, s] of [[7, -14, 1], [34, -16, 1.2], [48, -13, 0.9], [-30, -15, 1.1], [62, -18, 1.3]]) {
      const t = new T.Group();
      const tk = new T.Mesh(new T.BoxGeometry(0.8, 4, 0.8), trunk);
      tk.position.y = 2;
      t.add(tk);
      for (const [dx, dy, dz, sz, m] of [[0, 5, 0, 3.4, leaf], [-1.2, 4.2, 0.6, 2.2, leaf2], [1.3, 4.4, -0.4, 2.4, leaf2], [0.2, 6.4, 0.2, 2, leaf2]]) {
        const c = new T.Mesh(new T.BoxGeometry(sz, sz, sz), m);
        c.position.set(dx, dy, dz);
        t.add(c);
      }
      t.scale.setScalar(s);
      t.position.set(x, 0, z);
      t.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.add(t);
    }
    // flowers along the front
    const petal = [std('#ff6fa8'), std('#ffd400'), std('#ffffff'), std('#b57bff')];
    for (let i = 0; i < 60; i++) {
      const f = new T.Mesh(new T.BoxGeometry(0.22, 0.22, 0.22), petal[i % 4]);
      f.position.set(-20 + i * 1.3 + sr(-0.4, 0.4), 0.18, sr(1.5, 5));
      g.add(f);
    }
  }

  function subway(g) {
    S.scene.background = new T.Color('#1d2a44');
    S.scene.fog = new T.Fog('#2a3a58', 120, 280);
    S.hemi.color.set('#e8f2ff');
    S.hemi.groundColor.set('#545a6a');
    S.hemi.intensity = 0.9;
    S.sun.color.set('#fff7ea');
    S.sun.intensity = 0.85;
    groundSlab(g, std('#ffffff', { map: tiles('#c9ccd3', '#aeb2bb', 32) }), std('#ffffff', { map: tiles('#8f939c', '#7a7e87', 64) }));
    // the platform edge line
    const edge = new T.Mesh(new T.BoxGeometry(260, 0.02, 0.5), std('#ffd400', { emissive: '#806a00', emissiveIntensity: 0.2 }));
    edge.position.set(40, 0.01, 6.2);
    g.add(edge);
    // tiled back wall with a stripe, the station name and posters
    const wallTex = tiles('#f4f1e8', '#d6d2c6', 16);
    wallTex.repeat.set(70, 8);
    plane(280, 16, std('#ffffff', { map: wallTex, roughness: 0.5 }), 40, 8, -14, g);
    const stripe = plane(280, 1.1, std('#18b4ff', { roughness: 0.4 }), 40, 4.2, -13.95, g);
    stripe.receiveShadow = true;
    const name = paint(512, 96, (c) => {
      c.fillStyle = '#14121f';
      G.roundRect(c, 4, 4, 504, 88, 16);
      c.fill();
      c.font = `48px ${G.FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffffff';
      c.fillText(tr('T&T STATION'), 256, 52);
    });
    for (const x of [-12, 26, 64]) plane(9, 1.7, new T.MeshBasicMaterial({ map: name }), x, 6.6, -13.9, g);
    const posterArt = ['🚇', '🍦', '⭐', '🏀', '🦖'];
    posterArt.forEach((e, i) => {
      const tex = paint(192, 256, (c) => {
        c.fillStyle = ['#ff3d7f', '#ffd400', '#18d4ff', '#ff8a1f', '#6fd36f'][i];
        c.fillRect(0, 0, 192, 256);
        c.fillStyle = '#ffffff';
        c.fillRect(10, 10, 172, 236);
        c.font = `110px ${G.EMOJI_FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(e, 96, 120);
        c.font = `22px ${G.FONT}`;
        c.fillStyle = '#14121f';
        c.fillText(tr(['RIDE!', 'YUM!', 'SHINE!', 'SWISH!', 'RAWR!'][i]), 96, 215);
      });
      plane(2.4, 3.2, new T.MeshBasicMaterial({ map: tex }), -4 + i * 13, 8.8, -13.9, g);
    });
    // pillars and ceiling lights
    const pillarMat = std('#2f6fd6', { roughness: 0.5 });
    for (let x = -30; x < 110; x += 12) {
      const p = new T.Mesh(new T.BoxGeometry(1, 16, 1), pillarMat);
      p.position.set(x, 8, -7);
      p.castShadow = true;
      g.add(p);
      const lamp = new T.Mesh(new T.BoxGeometry(4, 0.25, 0.8), new T.MeshBasicMaterial({ color: '#fffbe8' }));
      lamp.position.set(x + 6, 15.4, -4);
      g.add(lamp);
    }
    const ceil = plane(280, 40, std('#3a4660'), 40, 16, -10, g);
    ceil.rotation.x = Math.PI / 2;
    // a train waiting at the far track
    const livery = staticTextures().train.clone();
    livery.needsUpdate = true;
    livery.wrapS = T.RepeatWrapping;
    livery.repeat.set(4, 1);
    const train = new T.Mesh(new T.BoxGeometry(60, 3.4, 3), [std('#dfe4ea'), std('#dfe4ea'), std('#b9c0c9'), std('#dfe4ea'), std('#ffffff', { map: livery }), std('#dfe4ea')]);
    train.position.set(-28, 1.8, -11);
    train.castShadow = true;
    g.add(train);
  }

  function castle(g) {
    S.scene.background = gradientTexture([[0, '#5d8fe8'], [0.5, '#ffb88a'], [1, '#ffe2a8']]);
    S.scene.fog = new T.Fog('#ffd9b0', 150, 400);
    S.hemi.color.set('#fff0dc');
    S.hemi.groundColor.set('#7a6a52');
    S.hemi.intensity = 0.75;
    S.sun.color.set('#ffd9a8');
    S.sun.intensity = 1.1;
    plane(700, 100, new T.MeshBasicMaterial({ map: paint(1024, 256, (c) => {
      seed = 9;
      for (const [col, base, amp] of [['#9b8cc7', 120, 70], ['#7d76b0', 175, 45]]) {
        c.fillStyle = col;
        c.beginPath();
        c.moveTo(0, 256);
        let y = base;
        for (let x = 0; x <= 1024; x += 32) {
          y = base - Math.abs(Math.sin(x * 0.009 + base)) * amp;
          c.lineTo(x, y);
        }
        c.lineTo(1024, 256);
        c.fill();
      }
    }), transparent: true, fog: false }), 60, 34, -200, g);
    const grass = paint(256, 256, (c) => {
      seed = 13;
      c.fillStyle = '#86b94e';
      c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 400; i++) {
        c.fillStyle = srand() < 0.5 ? 'rgba(60,110,30,0.35)' : 'rgba(200,230,140,0.3)';
        c.fillRect(sr(0, 256), sr(0, 256), 2, sr(3, 7));
      }
    }, true);
    groundSlab(g, std('#ffffff', { map: grass }), std('#ffffff', { map: soilSide(false) }));
    // the castle wall behind, with merlons, towers, roofs and flags
    const stone = std('#ffffff', { map: bricks('#b7aa95', '#8b7f6c') });
    const wall = new T.Mesh(new T.BoxGeometry(220, 7, 2), stone);
    boxUV(wall.geometry, 220, 7, 2, 2);
    wall.position.set(40, 3.5, -20);
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);
    const merlon = new T.InstancedMesh(new T.BoxGeometry(1.2, 1.2, 2), std('#b7aa95', { roughness: 0.9 }), 92);
    const mtx = new T.Matrix4();
    for (let i = 0; i < 92; i++) {
      mtx.makeTranslation(-70 + i * 2.4, 7.6, -20);
      merlon.setMatrixAt(i, mtx);
    }
    g.add(merlon);
    const roof = std('#c9413a', { roughness: 0.7 });
    for (const x of [-26, 6, 42, 76]) {
      const t = new T.Mesh(new T.CylinderGeometry(2.6, 2.8, 13, 12), stone);
      t.position.set(x, 6.5, -21);
      t.castShadow = true;
      g.add(t);
      const cone = new T.Mesh(new T.ConeGeometry(3.3, 4.5, 12), roof);
      cone.position.set(x, 15.2, -21);
      g.add(cone);
      const pole = new T.Mesh(new T.BoxGeometry(0.12, 2.4, 0.12), std('#5a4a3a'));
      pole.position.set(x, 18.5, -21);
      g.add(pole);
      const flagTex = paint(128, 80, (c) => {
        c.fillStyle = x % 2 ? '#2f6fd6' : '#ffd400';
        c.fillRect(0, 0, 128, 80);
        c.font = `44px ${G.FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = x % 2 ? '#ffffff' : '#14121f';
        c.fillText('T', 64, 44);
      });
      const flag = new T.Mesh(new T.PlaneGeometry(2, 1.25, 8, 1), new T.MeshStandardMaterial({ map: flagTex, side: T.DoubleSide }));
      flag.position.set(x + 1.05, 19.0, -21);
      g.add(flag);
      const pos = flag.geometry.attributes.position, base = pos.array.slice();
      S.animated.push((time) => {
        for (let i = 0; i < pos.count; i++) {
          const px = base[i * 3];
          pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(time * 4 + px * 3) * 0.12 * (px + 1);
        }
        pos.needsUpdate = true;
      });
    }
    // banners on the wall
    for (let x = -14; x < 100; x += 14) {
      const b = paint(64, 160, (c) => {
        c.fillStyle = '#b52f4a';
        c.beginPath(); c.moveTo(0, 0); c.lineTo(64, 0); c.lineTo(64, 160); c.lineTo(32, 136); c.lineTo(0, 160); c.fill();
        c.fillStyle = '#ffd400';
        c.beginPath(); c.arc(32, 56, 16, 0, Math.PI * 2); c.fill();
      });
      plane(1.6, 4, new T.MeshBasicMaterial({ map: b, transparent: true }), x, 4.4, -18.95, g);
    }
  }

  function setWorld(id) {
    if (S.world === id) return;
    if (S.backdrop) {
      S.scene.remove(S.backdrop);
      disposeGroup(S.backdrop);
    }
    S.animated = [];
    S.world = id;
    const g = new T.Group();
    if (id === 'subway') subway(g);
    else if (id === 'castle') castle(g);
    else backyard(g);
    S.backdrop = g;
    S.scene.add(g);
  }

  function animate(t) {
    for (const f of S.animated) f(t);
  }

  function render() {
    S.renderer.render(S.scene, S.camera);
  }

  window.Scene = Object.assign(S, {
    init, resize, frame, toWorld, pxPerMetre, makeBlock, setBlockStage, makeHead, makeStatic, setWorld, relang, animate, render,
    BLOCK_DEPTH, disposeGroup,
  });
})();
