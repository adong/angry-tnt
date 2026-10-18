/* 中文 for Angry TNT: the words on the page, the toasts, the canvas words (bursts, popups, subway signs) and the ?
   panel, through Kit.lang (kit/lang.js). The kids' names and the logo stay in English on purpose. */
(function () {
  const L = Kit.lang;
  L.keep(['TEDDY', 'TOMMY', 'Teddy', 'Tommy', 'Angry TNT', 'ANGRY', 'TNT', 'Esc']);

  // level and world names, as the level select shows them and as the HUD and toasts shout them
  const LEVEL_NAMES = {
    'Hello, Zombies!': '你好，僵尸！', 'Two Huts': '两间小屋', 'Ice Cream Tower': '冰淇淋塔', 'Picnic Table': '野餐桌',
    'Tree House': '树屋', 'Mind the Gap': '小心空隙', 'Turnstiles': '检票闸机', 'Train Roof': '列车车顶',
    'Escalator': '自动扶梯', 'Rush Hour': '高峰时间', 'Gatehouse': '城门楼', 'Castle Wall': '城墙', 'The Keep': '主塔',
    'Twin Towers': '双塔', "The King's Castle": '国王的城堡',
  };
  const names = {};
  for (const en in LEVEL_NAMES) {
    names[en] = LEVEL_NAMES[en];
    names[en.toUpperCase()] = LEVEL_NAMES[en];
  }
  L.add(names);

  L.add({
    // title screen
    'Teddy & Tommy vs. the cartoon zombies! Who are you?': 'Teddy 和 Tommy 大战卡通僵尸！你是谁？',
    '👊 punch power': '👊 重拳超能力', '✌️ split power': '✌️ 分身超能力',
    '🐣 EASY': '🐣 简单', '🔥 NORMAL': '🔥 普通',
    // level select
    '◀ BACK': '◀ 返回', '🏡 THE BACKYARD': '🏡 后院', '🚇 THE SUBWAY': '🚇 地铁站', '🏰 THE CASTLE': '🏰 城堡',
    // the HUD and its tooltips
    'Pause (P)': '暂停 (P)', 'Restart (R)': '重新开始 (R)', 'Sound (M)': '声音 (M)',
    'Call Tommy (T)': '叫 Tommy (T)', 'Call Teddy (T)': '叫 Teddy (T)', 'TAP · T': '点我 · T',
    '👊 PUNCH!': '👊 重拳！', '✌️ SPLIT!': '✌️ 分身！', 'PULL BACK, LET GO!': '往后拉，再松手！',
    '↻ Turn sideways for a bigger view': '↻ 横过来，看得更清楚',
    // toasts
    'ALL ZOMBIES BONKED!': '僵尸全被敲飞啦！',
    // results and pause
    'LEVEL CLEAR!': '过关啦！', 'YOU BEAT THE KING!': '你打败了僵尸国王！', 'NEW BEST!': '新纪录！',
    '☰ LEVELS': '☰ 选关', '🏰 LEVELS': '🏰 选关', '↻ AGAIN': '↻ 再玩一次', 'NEXT ▶': '下一关 ▶',
    'SO CLOSE!': '差一点点！', 'The zombies are still there. Try again!': '僵尸还在呢，再试一次！',
    '↻ TRY AGAIN': '↻ 再试一次', '↻ RESTART': '↻ 重新开始', '🏠 HOME': '🏠 主页',
    // words drawn on the canvas: bursts, popups, subway signs and posters
    'BONK!': '咚！', 'POW!': '砰！', 'SMASH!': '粉碎！', 'YUM!': '好吃！',
    'T&T STATION': 'T&T 车站', 'T&T LINE': 'T&T 线', 'RIDE!': '出发！', 'SHINE!': '闪亮！', 'SWISH!': '唰！进球！',
    'RAWR!': '嗷呜！',
    // the ? panel (js/keys.js)
    'aim the slingshot': '瞄准弹弓', 'launch': '发射', 'power in flight (👊 / ✌️)': '飞行中放超能力（👊 / ✌️）',
    'restart the level': '重玩这一关', 'next level (after a win)': '下一关（过关后）',
    "Press anywhere, pull back and let go. Tap while you fly for the power. Your brother's button is bottom right.":
      '在哪里按住都行，往后拉，再松手。飞的时候点一下放超能力。兄弟的按钮在右下角。',
  });

  const TREAT = { 'ICE CREAM': '冰淇淋', WATER: '水', 'JUICE BOX': '果汁', COOKIE: '饼干', WATERMELON: '西瓜', BANANA: '香蕉' };
  L.rule(/^(\d-\d) (.+)$/, (m, id, name) => `${id} ${L.t(name)}`); // "1-3 ICE CREAM TOWER"
  L.rule(/^BEST ([\d,]+)$/, '最高分 $1');
  L.rule(/^Call (.+) \(T\)$/, '叫 $1 (T)');
  L.rule(/^(.+)'S HERE!?$/, '$1 来啦！');
  L.rule(/^(.+) HAS YOUR BACK$/, '$1 在保护你');
  L.rule(/^(.+) SAVED YOU!$/, '$1 救了你！');
  L.rule(/^\+1 SHOT! (.+) HOPS ON!$/, '+1 次！$1 跳上弹弓啦！');
  L.rule(/^BYE, (.+)! 👋$/, '$1 拜拜！👋');
  L.rule(/^CALL (.+): \+1 SHOT!$/, '叫 $1 来帮忙：+1 次！');
  L.rule(/^(\S+) (ICE CREAM|WATER|JUICE BOX|COOKIE|WATERMELON|BANANA) FROM (.+)!$/, (m, emoji, item, who) => `${emoji} ${who} 送来的${TREAT[item]}！`);
})();
