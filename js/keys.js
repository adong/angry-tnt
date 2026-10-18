/* The keys the ? panel shows. Press ? (Shift + /) in the game, or tap the round ? button.
   The panel and the freeze live in the shared kit: kit/help.js (Kit.help). */
Kit.help.setup({
  title: "Angry TNT",
  keys: [
    ["aim the slingshot", "Space then ↑ ↓ ← →"],
    ["launch", "Space"],
    ["power in flight (👊 / ✌️)", "Space"],
    ["call your brother", "T"],
    ["restart the level", "R"],
    ["next level (after a win)", "Enter or N"],
    ["pause", "P or Esc"],
    ["sound on / off", "M"],
  ],
  touch: "Press anywhere, pull back and let go. Tap while you fly for the power. Your brother's button is bottom right.",
});
