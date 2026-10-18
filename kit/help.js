/* Kit.help: press ? (Shift + /) in any game, or tap the round ? button, to see that game's keys.

   The game freezes while the panel is open, without the game having to know:
   - its animation frames are held back, and the clock skips the time the panel was open (performance.now() and the
     frame timestamps both), so nothing moves and no timer runs out;
   - the sound pauses;
   - keys and taps go to the panel, never to the game.
   Any key (or a tap anywhere) closes it, and the game carries on from the exact frame it stopped on. Typing in a text
   box (Magic 8's question) never opens it.

   Load it last of the kit scripts, before the game's own, so it hears keys and taps first. Then, in the game:

     Kit.help.setup({
       title: 'Metro Surfer',
       cols: ['Player 1', 'Player 2'],                   // optional column heads, for 2-player games
       keys: [
         ['move', 'W A S D', '← ↑ ↓ →'],                  // what it does, then the keys for each column
         ['call your brother', 'T', 'Enter'],
       ],
       note: 'In 1 player both sets of keys work.',       // optional line under the keys
       touch: 'Swipe to move, tap to jump.',              // optional: how it plays on a phone or tablet
       button: { top: '12px', right: '60px' },            // where the ? button sits (CSS; default: middle of the left edge), or false
     });

   A key string is split at spaces. Each piece becomes a keycap, except lowercase words ("or", "hold", "click",
   "tap", "swipe", "double-tap") and "+", "·", "," and "–", which stay plain text. Write keys as A, Space, Enter, Esc,
   Shift, Tab, ←, ↑, → and ↓. */
(function () {
  const Kit = (window.Kit = window.Kit || {});

  let opts = { title: document.title, keys: [] };
  let isOpen = false, root = null, btn = null;

  // ---------- the freeze ----------
  const rafReal = window.requestAnimationFrame.bind(window);
  const nowReal = performance.now.bind(performance);
  let frozenAt = 0, offset = 0, lastT = 0, held = [], soundWasOn = false;

  performance.now = () => (isOpen ? frozenAt : nowReal()) - offset;
  window.requestAnimationFrame = (cb) => {
    if (isOpen) { held.push(cb); return 0; }
    return rafReal((t) => {
      lastT = Math.max(lastT, t - offset); // never backwards, so no game ever sees a negative dt
      cb(lastT);
    });
  };

  function freeze() {
    frozenAt = nowReal();
    const s = Kit.sound;
    soundWasOn = !!(s && s.isRunning && s.isRunning()); // only wake it again if it was playing when we stopped it
    if (soundWasOn) s.suspend();
  }
  function thaw() {
    offset += nowReal() - frozenAt;
    const cbs = held;
    held = [];
    for (const cb of cbs) window.requestAnimationFrame(cb);
    if (soundWasOn && Kit.sound.resume) Kit.sound.resume();
  }

  // ---------- open / close ----------
  function open() {
    if (isOpen) return;
    build();
    render();
    freeze();
    isOpen = true;
    root.classList.add('on');
    if (btn) btn.classList.add('on');
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove('on');
    if (btn) btn.classList.remove('on');
    thaw();
  }

  // ---------- keys and taps: the panel hears them first ----------
  const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'FnLock', 'OS', 'Hyper', 'Super']);
  function typing(e) {
    const t = e.target;
    return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''));
  }
  function swallow(e) {
    e.stopImmediatePropagation();
    if (!e.metaKey && !e.ctrlKey) e.preventDefault(); // leave browser shortcuts (reload, zoom) alone
  }
  window.addEventListener('keydown', (e) => {
    if (isOpen) {
      swallow(e);
      if (!e.repeat && !MODIFIERS.has(e.key)) close();
      return;
    }
    const isQ = e.key === '?' || (e.code === 'Slash' && e.shiftKey); // Shift + / on any keyboard layout
    if (isQ && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      swallow(e); // also keeps the / key from firing in games that use it (Tank TT, Snow TT Bros)
      if (!e.repeat) open();
    }
  }, true);
  window.addEventListener('keypress', (e) => { if (isOpen) swallow(e); }, true);
  // keyup always reaches the game, so a key held down when the panel opened is never stuck afterwards

  const POINTER = ['pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'mousedown', 'mouseup', 'mousemove',
    'touchstart', 'touchmove', 'touchend', 'touchcancel', 'click', 'dblclick', 'contextmenu', 'wheel'];
  function onPointer(e) {
    const onBtn = btn && btn.contains(e.target);
    if (!isOpen && !onBtn) return;
    e.stopImmediatePropagation(); // no preventDefault on touches: a phone would then never send the click
    if (e.type === 'contextmenu') e.preventDefault();
    if (e.type !== 'click') return; // pointerdown and pointerup are swallowed, so one tap is one click
    if (isOpen && Kit.lang && e.target.closest && e.target.closest('#kit-help .kh-lang')) Kit.lang.toggle(); // stays open
    else (isOpen ? close() : open());
  }
  for (const t of POINTER) window.addEventListener(t, onPointer, { capture: true, passive: false });

  // ---------- the panel ----------
  const CSS = `
#kit-help { position: fixed; inset: 0; z-index: 2147483000; display: none; align-items: center; justify-content: center;
  padding: 16px; background: rgba(12, 10, 24, 0.62); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
  font-family: 'Rubik', system-ui, -apple-system, sans-serif; color: #fff; cursor: pointer; }
#kit-help.on { display: flex; }
#kit-help .kh-card { width: min(560px, 100%); max-height: 100%; overflow-y: auto; padding: 18px 20px 16px;
  border-radius: 22px; background: rgba(20, 18, 31, 0.94); border: 3px solid #fff; box-shadow: 0 8px 0 #000, 0 18px 40px rgba(0, 0, 0, 0.45);
  animation: kh-pop 0.22s cubic-bezier(.2, 1.5, .4, 1); }
@keyframes kh-pop { from { transform: scale(0.85); } } /* no fade: the card shows even where animations don't run */
#kit-help .kh-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#kit-help .kh-tag { font-size: 12px; font-weight: 800; letter-spacing: 2px; color: #18d4ff; }
#kit-help .kh-lang { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 34px; height: 34px; padding: 0; border-radius: 50%; border: 2px solid #fff; background: transparent; color: #fff;
  cursor: pointer; }
#kit-help .kh-lang svg { width: 18px; height: 18px; }
#kit-help .kh-lang:hover { background: #ffd400; color: #14121f; border-color: #14121f; }
#kit-help h2 { margin: 2px 0 12px; font-family: 'Rubik', system-ui, sans-serif; font-weight: 800; /* not Bungee: it's all caps and would lose the TT in FlaTTy */
  font-size: clamp(24px, 5vw, 32px); line-height: 1.05; color: #ffd400; text-shadow: 0 3px 0 #000; }
#kit-help table { width: 100%; border-collapse: collapse; }
#kit-help th { padding: 0 6px 6px; font-size: 12px; font-weight: 800; letter-spacing: 1px; text-align: left; color: #8cc2ff; }
#kit-help th + th { color: #ffb02e; }
#kit-help td { padding: 5px 6px; vertical-align: middle; font-size: 15px; font-weight: 700; border-top: 1px solid rgba(255, 255, 255, 0.12); }
#kit-help td:first-child { width: 40%; color: #ffe9a8; }
#kit-help td.kh-k { white-space: normal; line-height: 2; font-weight: 600; font-size: 13px; color: #d9d6e8; }
#kit-help kbd { display: inline-block; min-width: 26px; height: 26px; padding: 0 7px; margin: 0 2px; border-radius: 7px;
  background: #fff; color: #14121f; font: 800 13px/26px 'Rubik', system-ui, sans-serif; text-align: center;
  box-shadow: 0 3px 0 #7d7a90; vertical-align: middle; }
#kit-help .kh-note { margin-top: 10px; font-size: 14px; font-weight: 700; line-height: 1.4; color: #ffe9a8; }
#kit-help .kh-touch { margin-top: 10px; font-size: 14px; font-weight: 700; line-height: 1.4; color: #c3f0d6; }
#kit-help .kh-foot { margin-top: 12px; font-size: 13px; font-weight: 700; text-align: center; opacity: 0.8; }
#kit-help-btn { position: fixed; z-index: 2147482000; width: 40px; height: 40px; padding: 0; border-radius: 50%;
  border: 3px solid #fff; background: rgba(20, 18, 31, 0.62); color: #fff; cursor: pointer;
  font: 800 22px/34px 'Rubik', system-ui, sans-serif; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.45);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
#kit-help-btn:hover, #kit-help-btn.on { background: #ffd400; color: #14121f; border-color: #14121f; }
@media (max-height: 520px) { #kit-help td { padding: 3px 6px; } #kit-help h2 { margin-bottom: 6px; } }
`;
  function build() {
    if (root) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    root = document.createElement('div');
    root.id = 'kit-help';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Keys');
    document.body.appendChild(root);
  }

  const PLAIN = new Set(['+', '·', ',', '–']);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // English or 中文 through Kit.lang (kit/lang.js) when the game loads it: t(text) uses the game's dictionary,
  // t(en, zh) is an inline pair for the panel's own words.
  const t = (en, zh) => (Kit.lang ? Kit.lang.t(en, zh) : en);
  const plain = (w) => /^[a-z][a-z-]+$/.test(w) || PLAIN.has(w);
  function keycaps(str) {
    if (!str) return '';
    const words = String(str).split(/\s+/).filter(Boolean);
    if (words.every(plain)) return ` ${esc(t(String(str)))} `; // all words ("hold the mouse button and drag"): translate as one
    return words.map((w) => (plain(w) ? ` ${esc(t(w))} ` : `<kbd>${esc(t(w))}</kbd>`)).join('');
  }
  function render() {
    const o = opts;
    const cols = o.cols || [];
    const zh = Kit.lang && Kit.lang.is('zh');
    let html = `<div class="kh-card"><div class="kh-top"><div class="kh-tag">${t('? KEYS', '? 按键')}</div>`;
    if (Kit.lang) html += `<button type="button" class="kh-lang" title="${zh ? 'English' : '中文'}" aria-label="English / 中文">${Kit.lang.icon}</button>`;
    html += `</div><h2>${esc(t(o.title || ''))}</h2><table>`;
    if (cols.length) html += `<tr><th></th>${cols.map((c) => `<th>${esc(t(c))}</th>`).join('')}</tr>`;
    for (const row of o.keys || []) {
      const [label, ...ks] = row;
      html += `<tr><td>${esc(t(label))}</td>${ks.map((k) => `<td class="kh-k">${keycaps(k)}</td>`).join('')}</tr>`;
    }
    html += `<tr><td>${t('these keys', '看按键')}</td><td class="kh-k" colspan="${Math.max(1, cols.length)}">${keycaps('?')} ${t('or tap the round', '或点圆形')} ${keycaps('?')} ${t('button', '按钮')}</td></tr>`;
    html += '</table>';
    if (o.note) html += `<div class="kh-note">${esc(t(o.note))}</div>`;
    if (o.touch) html += `<div class="kh-touch">👆 ${esc(t(o.touch))}</div>`;
    html += `<div class="kh-foot">⏸ ${t('The game waits for you. Press any key or tap to play on.', '游戏在等你。按任意键或点一下，继续玩。')}</div></div>`;
    root.innerHTML = html;
  }
  if (Kit.lang) Kit.lang.onChange(() => { if (isOpen) render(); });

  function placeButton() {
    if (opts.button === false) { if (btn) btn.style.display = 'none'; return; }
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'kit-help-btn';
      btn.type = 'button';
      btn.textContent = '?';
      btn.title = 'Keys (?)';
      btn.setAttribute('aria-label', 'Show the keys');
      build();
      document.body.appendChild(btn);
    }
    // The same spot in every game, the middle of the left edge: corners hold scores, pause buttons and touch pads.
    const pos = Object.assign({ top: 'calc(50% - 20px)', left: 'max(10px, env(safe-area-inset-left))' }, opts.button || {});
    for (const side of ['top', 'right', 'bottom', 'left']) btn.style[side] = pos[side] == null ? '' : pos[side];
    btn.style.display = '';
  }

  function setup(o) {
    opts = Object.assign({ title: document.title, keys: [] }, o || {});
    const go = () => { placeButton(); if (isOpen) render(); };
    if (document.body) go();
    else document.addEventListener('DOMContentLoaded', go, { once: true });
  }

  Kit.help = { setup, open, close, toggle: () => (isOpen ? close() : open()), isOpen: () => isOpen, button: () => btn };
})();
