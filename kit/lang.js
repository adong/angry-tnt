/* Kit.lang: every game in English or 中文.

   - The choice is remembered under one localStorage key ('claudeGames.lang'), shared by every game and the dashboard on
     the same site, so switching on the dashboard switches the games too. The first visit follows the browser's language.
   - A small 中文 / EN button sits under the ? button (and the ? panel has one too). Switching is live: no reload.
   - Page text translates by itself. A dictionary (English -> 中文) is checked against every text node and every
     placeholder, title and aria-label, now and whenever the game changes the page later (a MutationObserver), so a
     game that sets `el.textContent = 'TOMMY SAVED YOU!'` needs no code change, just a dictionary entry.
   - Text with numbers or names in it ("TEDDY'S BEST", "3 HITS!") uses rules: a regex and a replacement.
   - Text the game draws on a canvas (3D word bursts, signs) never reaches the page, so wrap it: Kit.lang.t('POW!').
   - An element whose HTML needs a different word order in Chinese can carry the whole translation: data-zh="...".
     The element's English HTML is kept, and swapped back when switching to English.
   - data-no-lang on an element keeps its text (and its children's) as it is.

   In a game, load kit/lang.js right after kit/sound.js (before kit/help.js), and put the game's words in js/zh.js:

     Kit.lang.add({ 'PLAY': '开始', 'TOMMY SAVED YOU!': 'TOMMY 救了你！' });
     Kit.lang.rule(/^(\w+)'S BEST$/, '$1 的最高分');
     Kit.lang.keep(['TEDDY', 'TOMMY']);            // names that stay as they are
     Kit.lang.onChange((lang) => rebuildSigns());  // only for canvas text made once and kept

   Kit.lang.untranslated() lists the English still showing on the page (and canvas text asked for through t() with no
   entry): switch to 中文, visit every screen, and run it until it comes back empty. */
(function () {
  const Kit = (window.Kit = window.Kit || {});
  const KEY = 'claudeGames.lang';

  let lang = '';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) { /* storage blocked */ }
  if (lang !== 'en' && lang !== 'zh') lang = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';

  const dict = new Map();
  const rules = [];
  const kept = new Set();
  const askedMissing = new Set();
  const listeners = [];

  // Words every game shares: the ? panel, menus, buttons. A game's own js/zh.js can override any of them.
  const COMMON = {
    '? KEYS': '? 按键', 'these keys': '看按键', 'or tap the round': '或点圆形', 'button': '按钮',
    'or': '或', 'then': '然后', 'hold': '按住', 'tap': '点', 'click': '点击', 'swipe': '滑动', 'drag': '拖动',
    'double-tap': '连按两下', 'and': '和', 'longer': '更久', 'Space': '空格', 'Enter': '回车',
    'Player 1': '玩家 1', 'Player 2': '玩家 2', 'Teddy': 'Teddy', 'Tommy': 'Tommy',
    'move': '移动', 'walk': '走', 'run': '跑', 'jump': '跳', 'pause': '暂停', 'sound on / off': '声音 开 / 关',
    'pause · sound': '暂停 · 声音', 'call your brother': '叫兄弟来帮忙', 'call your brother · high five': '叫兄弟 · 击掌',
    'easy mode (title)': '简单模式（标题页）', 'In 1 player both sets of keys work.': '单人时两套按键都能用。',
    'PLAY': '开始', '▶ PLAY': '▶ 开始', 'PAUSED': '暂停中', 'RESUME': '继续', '▶ RESUME': '▶ 继续', 'MENU': '菜单',
    'EASY': '简单', 'NORMAL': '普通', '1 PLAYER': '单人', '2 PLAYERS': '双人', 'BEST': '最高分', 'SCORE': '得分',
    'GAME OVER': '游戏结束', 'PLAY AGAIN': '再玩一次', 'NEXT': '下一关', 'BACK': '返回', 'HOME': '主页', 'GO!': '开始！',
    'READY?': '准备好了吗？', 'YOU WIN!': '你赢了！', 'TAP ME!': '点我！', 'built with': '制作工具：',
    'Keys (?)': '按键 (?)', 'Show the keys': '看按键',
  };
  for (const k in COMMON) dict.set(k, COMMON[k]);

  // ---------- translating one string ----------
  const looksEnglish = (s) => /[A-Za-z]{2,}/.test(s);
  function lookup(key) {
    if (dict.has(key)) return dict.get(key);
    for (const [re, rep] of rules) if (re.test(key)) return key.replace(re, rep);
    return null;
  }
  // t('POW!') -> '砰！' in 中文 (from the dictionary), t('Score', '得分') -> an inline pair. Spaces around the words stay.
  function t(en, zh) {
    if (zh !== undefined) return lang === 'zh' ? zh : en;
    if (lang !== 'zh' || en == null) return en;
    const s = String(en), key = s.trim();
    if (!key || kept.has(key)) return s;
    const out = lookup(key);
    if (out == null) { if (looksEnglish(key)) askedMissing.add(key); return s; }
    return s.replace(key, out);
  }

  // ---------- the page ----------
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE']);
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const enText = new WeakMap(); // text node -> its English
  const ourText = new WeakMap(); // text node -> what we last wrote into it

  function skipped(el) {
    return !el || SKIP.has(el.nodeName) || (el.closest && el.closest('[data-no-lang],[data-zh],#kit-help'));
  }
  function doText(n) {
    if (skipped(n.parentNode)) return;
    const cur = n.nodeValue;
    let en = enText.get(n);
    if (en === undefined || cur !== ourText.get(n)) { en = cur; enText.set(n, en); } // new, or the game rewrote it
    const out = lang === 'zh' ? t(en) : en;
    ourText.set(n, out);
    if (out !== cur) n.nodeValue = out;
  }
  function doElement(el) {
    if (el.hasAttribute('data-zh')) {
      if (!el.hasAttribute('data-en')) el.setAttribute('data-en', el.innerHTML);
      const html = lang === 'zh' ? el.getAttribute('data-zh') : el.getAttribute('data-en');
      if (el.innerHTML !== html) el.innerHTML = html;
    }
    if (skipped(el)) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const store = 'data-en-' + a;
      if (!el.hasAttribute(store) || el.getAttribute(a) !== el.getAttribute('data-out-' + a)) el.setAttribute(store, el.getAttribute(a));
      const out = lang === 'zh' ? t(el.getAttribute(store)) : el.getAttribute(store);
      el.setAttribute('data-out-' + a, out);
      if (el.getAttribute(a) !== out) el.setAttribute(a, out);
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) doElement(root);
    if (root.nodeType === 1 && SKIP.has(root.nodeName)) return;
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) (n.nodeType === 3 ? doText(n) : doElement(n));
  }
  // Our own writes come back here too (observers report later), and stop at once: the text matches what we wrote.
  const observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doElement(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  });

  function applyAll() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';
    document.documentElement.classList.toggle('lang-zh', lang === 'zh');
    if (document.body) walk(document.body);
    if (btn) btn.textContent = lang === 'zh' ? 'EN' : '中文';
  }

  // ---------- switching ----------
  function set(l) {
    if (l !== 'en' && l !== 'zh') return lang;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* storage blocked */ }
    applyAll();
    for (const cb of listeners) { try { cb(lang); } catch (e) { console.error(e); } }
    return lang;
  }
  const toggle = () => set(lang === 'zh' ? 'en' : 'zh');

  // ---------- the 中文 / EN button, under the ? button ----------
  let btn = null, btnOpts = {};
  const CSS = `
#kit-lang-btn { position: fixed; z-index: 2147482000; min-width: 40px; height: 28px; padding: 0 6px; border-radius: 14px;
  border: 3px solid #fff; background: rgba(20, 18, 31, 0.62); color: #fff; cursor: pointer;
  font: 800 12px/22px 'Rubik', system-ui, -apple-system, sans-serif; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.45);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
#kit-lang-btn:hover { background: #ffd400; color: #14121f; border-color: #14121f; }`;
  function placeButton() {
    if (btnOpts.button === false) { if (btn) btn.style.display = 'none'; return; }
    if (!btn) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      btn = document.createElement('button');
      btn.id = 'kit-lang-btn';
      btn.type = 'button';
      btn.setAttribute('data-no-lang', '');
      btn.setAttribute('aria-label', 'English / 中文');
      document.body.appendChild(btn);
    }
    const pos = Object.assign({ top: 'calc(50% + 28px)', left: 'max(10px, env(safe-area-inset-left))' }, btnOpts.button || {});
    for (const side of ['top', 'right', 'bottom', 'left']) btn.style[side] = pos[side] == null ? '' : pos[side];
    btn.style.display = '';
    btn.textContent = lang === 'zh' ? 'EN' : '中文';
  }
  // Taps on the button never reach the game (like the ? button): one click switches the language.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick']) {
    window.addEventListener(type, (e) => {
      if (!btn || !btn.contains(e.target)) return;
      e.stopImmediatePropagation();
      if (e.type === 'click') toggle();
    }, { capture: true, passive: false });
  }

  // ---------- start ----------
  function start() {
    applyAll();
    placeButton();
    observer.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });

  // ---------- for the game, and for checking ----------
  // Judged by each text's English original against the dictionary as it is now, so strings asked for before the
  // game's js/zh.js loaded, and translations that keep a name ("Claude 自动驾驶"), don't show up.
  const needs = (s) => !!s && !kept.has(s) && looksEnglish(s) && lookup(s) == null;
  function untranslated() {
    const found = new Set([...askedMissing].filter(needs));
    if (document.body) {
      const it = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let n;
      while ((n = it.nextNode())) {
        if (n.nodeType === 1) {
          if (skipped(n)) continue;
          for (const a of ATTRS) {
            const en = (n.getAttribute('data-en-' + a) || n.getAttribute(a) || '').trim();
            if (n.hasAttribute(a) && needs(en)) found.add(en);
          }
          continue;
        }
        const en = (enText.get(n) ?? n.nodeValue).trim();
        if (skipped(n.parentNode) || !needs(en)) continue;
        found.add(en);
      }
    }
    return [...found];
  }

  Kit.lang = {
    get: () => lang,
    is: (l) => lang === l,
    set,
    toggle,
    t,
    add(d) { for (const k in d) dict.set(k.trim(), d[k]); if (document.body) applyAll(); },
    rule(re, rep) { rules.push([re, rep]); if (document.body) applyAll(); },
    keep(list) { for (const s of list) kept.add(String(s).trim()); },
    onChange(cb) { listeners.push(cb); },
    setup(o) { btnOpts = o || {}; if (document.body) placeButton(); },
    apply: applyAll,
    untranslated,
    button: () => btn,
  };
})();
