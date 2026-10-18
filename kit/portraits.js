/* Claude Games kit: render characters to PNG data URLs for menus, cards and HUDs, using a throwaway WebGL
   renderer. Load after roster.js. Exposes window.Kit.portraits(entries, opts) and Kit.portraits.frames(look, opts). */
(function () {
  'use strict';
  const T = THREE;
  const Kit = window.Kit;

  function withRenderer(w, h, fn) {
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(w, h, false);
    r.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight('#ffffff', '#8a6e58', 0.9));
    const key = new T.DirectionalLight('#fff4e0', 1.1);
    key.position.set(-1.5, 3, -3);
    scene.add(key);
    try {
      return fn(r, scene);
    } finally {
      r.dispose();
      r.forceContextLoss();
    }
  }

  // Head-and-shoulders portraits, facing the camera, transparent background: { id: 'data:image/png;...' }.
  // Each entry needs { id, look } and may have `pose` (its favourite pose, e.g. Tommy's Y; the camera pulls back
  // so raised hands fit). opts.size: square size in pixels (default 152).
  function portraits(entries, opts = {}) {
    const size = opts.size || 152;
    return withRenderer(size, size, (r, scene) => {
      const cam = new T.PerspectiveCamera(30, 1, 0.1, 20);
      const out = {};
      for (const e of entries) {
        const p = Kit.people.build(e.look);
        Kit.people.pose(p, 0, e.pose || 'idle', 1);
        p.hips.rotation.x = 0;
        scene.add(p.root);
        if (e.pose) cam.position.set(0.6, 1.95, -3.6), cam.lookAt(0, 1.8, 0);
        else cam.position.set(0.8, 1.95, -2.6), cam.lookAt(0, 1.68, 0);
        r.render(scene, cam);
        out[e.id] = r.domElement.toDataURL('image/png');
        scene.remove(p.root);
      }
      return out;
    });
  }

  // Full-body animation frames (a flipbook) of one character: an array of PNG data URLs.
  // opts: mode (pose, default 'walk'), count (default 4), width/height (default 300x400),
  // tint (hemisphere light colour for a mood, e.g. '#c8ffb0' for the zombie).
  portraits.frames = function (look, opts = {}) {
    const w = opts.width || 300, h = opts.height || 400, count = opts.count || 4;
    return withRenderer(w, h, (r, scene) => {
      if (opts.tint) scene.add(new T.HemisphereLight(opts.tint, '#20301a', 0.6));
      const cam = new T.PerspectiveCamera(35, w / h, 0.1, 20);
      cam.position.set(0, 1.25, -4.4);
      cam.lookAt(0, 1.05, 0);
      const p = Kit.people.build(look);
      scene.add(p.root);
      const frames = [];
      for (let i = 0; i < count; i++) {
        const ph = (i * Math.PI * 2) / count;
        Kit.people.pose(p, ph, opts.mode || 'walk', 1);
        p.root.rotation.y = Math.sin(ph) * 0.15;
        r.render(scene, cam);
        frames.push(r.domElement.toDataURL('image/png'));
      }
      return frames;
    });
  };

  Kit.portraits = portraits;
})();
