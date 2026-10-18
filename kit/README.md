# Claude Games kit

Shared pieces for the Teddy & Tommy games in `~/claude-games/`: the blocky characters (Teddy, Tommy and friends), their poses, menu portraits, synth sound, and the single-page build tool. It was extracted from Metro Surfer.

Everything is plain JavaScript on Three.js r149 using classic `<script>` tags. There are no modules, no npm and no asset files, so every game works by double-click, offline.

## Using it in a game

```bash
python3 ../kit/tools/sync.py .
```

```bash
python3 kit/tools/bundle.py . --name my-game
```

The first command, run from the game folder, copies the kit into `./kit/` so the game stays self-contained. The second builds `dist/my-game.html`, one file with everything inlined.

Load the scripts in this order in `index.html`, then your own:

```html
<script src="kit/three.min.js"></script>
<script src="kit/gfx.js"></script>
<script src="kit/people.js"></script>
<script src="kit/roster.js"></script>
<script src="kit/portraits.js"></script>
<script src="kit/sound.js"></script>
<script src="kit/help.js"></script>
```

`help.js` goes last of the kit and before the game's own scripts, so it hears keys and taps first. The game's `js/keys.js` (its `Kit.help.setup` call) can load at the very end.

**Edit the kit here, in `~/claude-games/kit`, never in a game's `kit/` copy**, then re-run `sync.py` in each game that should get the change. A game that needs something new (a pose, a helper) can write it in its own JS first, and move it here when a second game wants it too.

## `Kit.people`: characters

- `Kit.people.build(look)` returns `{ root, rig, hips, head, armL, armR, legL, legR, fingers }`.
  - The person is about 2 m tall, made of boxes, feet at y = 0, and faces **-z**. Turn `root.rotation.y` to face elsewhere: `±Math.PI / 2` for side-on, `Math.PI` toward a camera on +z.
  - `rig` pivots at the waist (spin it for rolls). Arms pivot at the shoulder and legs at the hip: `rotation.x` swings forward or back, `rotation.z` swings out sideways. `hips.rotation.y` twists the upper body.
- `Kit.people.pose(p, phase, mode, k)` eases the limbs toward a pose. `phase` is a running angle in radians that drives cycles (use something like `time * speed`). `k` in 0..1 is how far to move this frame: `1 - Math.exp(-20 * dt)` is smooth, `1` snaps. The modes:

  | Mode | What it does |
  |---|---|
  | `run`, `walk` | stride cycles |
  | `jump`, `roll`, `jet`, `fall` | in the air, a tumble, flying, knocked back |
  | `grab`, `give` | arms reaching forward |
  | `wave` | right hand waving |
  | `peace` | **Tommy's signature**: both arms up in a Y with peace fingers (比耶) |
  | `guard`, `jab`, `straight` | **Teddy's boxing**, Mike Tyson peek-a-boo style |
  | `boxing` | jab, guard, straight, guard, one beat per quarter turn of `phase` |
  | `jumpshot` | **Teddy's** basketball shot: both hands overhead. Add the jump and the 🏀 yourself. |
  | anything else | standing |

  A zombie's arms always reach forward.
- `Kit.people.handWorld(p, side, out?)` gives the world position of a hand (`-1` left, `1` right), for holding or throwing props. It needs an up-to-date `matrixWorld`.
- **Look options** (the `look` object):
  - `head`: `human` / `robot` / `bear`.
  - `hair`: `spiky` / `short` / `ponytail`, plus `hairColor`.
  - `hat`: `cap` / `capBack`, plus `hatColor` and `badge`.
  - `shirt`: `tee` / `hoodie` / `jacket`, plus `top`.
  - `print` on the shirt front: `bricks` / `ufo` / `bolt` / `star` / `panel` / `paw` / `torn`.
  - Colours and shape: `skin`, `bottom`, `shorts`, `shoes`, `pack`, `packPocket`, `headphones`, `belly`.
  - Face: `brows`, `smile`, `mustache`, `zombie`, `eyes` (robot), `muzzle` (bear), `peace` (adds the peace fingers).

## `Kit.roster`: who's who

- `Kit.roster.list` holds `teddy` and `tommy`, both modelled on their photos, then `zoom`, `luna`, `bolt` (robot), `bruno` (bear) and `zombie`.
  - Each entry has `{ id, name, look }`, and optionally `pose` (its menu-portrait pose), `signature`, `buddyScale` (size when tagging along) and `tag` (name-tag colour).
  - `signature` is the list of celebration poses: Teddy has `['boxing', 'jumpshot']`, Tommy has `['peace']`.
  - The zombie has `scare: true`.
- `Kit.roster.get(id)` returns one entry.
- `Kit.roster.buddyFor(id)` returns the buddy who tags along: the other brother. That's Tommy for everyone, and Teddy when Tommy is the one playing.
- `Kit.roster.signature(entry, 'hello' | 'goodbye')` returns which celebration pose to use. Characters without a signature wave.

## `Kit.portraits`: pictures for menus

- `Kit.portraits(entries, { size })` returns `{ id: pngDataURL }`: head-and-shoulders portraits on a transparent background. Entries with a `pose` (Tommy's Y) are framed wider.
- `Kit.portraits.frames(look, { mode, count, width, height, tint })` returns full-body animation frames for a flipbook (Metro Surfer's zombie scare uses `{ mode: 'walk', tint: '#c8ffb0' }`).

Both use a throwaway WebGL renderer, so call them once at startup and keep the results.

## `Kit.gfx`: helpers

- **Canvas and textures:** `makeCanvas(w, h)` returns `[canvas, ctx]`. `toTexture(canvas, repeat?)` makes an sRGB CanvasTexture. `radialTexture(size, stops)`, `glowTexture()` and `dotTexture()` make soft round sprites, for glows and particles.
- **Colour:** `shade(hex, amt)` lightens (amt > 0) or darkens (amt < 0) a colour.
- **Drawing:** `roundRect(ctx, x, y, w, h, r)` traces a rounded rectangle on a canvas.
- **Materials and meshes:** `std(color, opts)` makes a MeshStandardMaterial. `mesh(geo, mat, x, y, z, parent, castShadow = true)` makes and places a mesh. `boxUV(geo, X, Y, Z, unit)` keeps repeating textures the same size on boxes of any size.
- **Labels:** `emojiTexture('🏀')` turns an emoji into a texture, for sprites and props. `nameTag(text, color)` makes a pill-shaped name-label sprite.
- **Fonts and randomness:** `FONT` (Bungee, then Arial Black), `EMOJI_FONT`, `rand`, `randi`, `pick`.

`gfx.js` switches THREE.ColorManagement on, so set `renderer.outputEncoding = THREE.sRGBEncoding`.

## `Kit.sound`: synth audio

- **Starting:** call `Kit.sound.init()` from the first user gesture. Before that, every effect is a silent no-op.
- **Controls:** `toggleMute()`, `isMuted()` (remembered in localStorage), and `suspend()` / `resume()` / `isRunning()` for when the tab is hidden.
- **Music:** `music('play' | 'title' | 'over' | 'pause')` fades the built-in Am-F-C-G loop to the right level.
- **Effects:** `coin(streak)`, `jump`, `roll`, `swipe`, `land`, `bump`, `stumble`, `crash`, `powerup`, `board`, `boardBreak`, `horn(vol)`, `jet`, `click`, `groan` (the zombie, with a "BOO" sting at 2.45 s), `punch`, `swish`.
- **Your own sounds:** `tone({ f, to, type, dur, vol, at, lp })` and `hiss({ f, to, filter, q, dur, vol, at })`.

## `Kit.help`: the ? keys panel

Press **?** (Shift + /) in any game, or tap the round **?** button in the middle of the left edge, to see that game's keys.

- **The game freezes while the panel is open, without any game code:**
  - its animation frames are held back;
  - the clock skips the open time: `performance.now()` and the frame timestamps both leave it out, so no timer runs down;
  - the sound pauses;
  - keys and taps go to the panel, never to the game.
- **Closing:** any key (not Shift alone) or a tap anywhere closes it, and the game carries on from the frame it stopped on.
- **Typing** in a text box (Magic 8's question) never opens it.
- **The `/` key:** the panel swallows the `?` press, so games that use `/` as a fire key (Tank TT, Snow TT Bros) don't fire.
- **Each game** describes its controls in `js/keys.js`:

  ```js
  Kit.help.setup({
    title: 'King of Bonk!',
    cols: ['Player 1', 'Player 2'],        // optional, for 2-player games
    keys: [['walk', 'A D', '← →'], ['call your brother', 'T', 'Enter']],
    note: 'In 1 player both sets of keys work.',
    touch: 'The pad on the left, buttons on the right.',
    button: { top: '12px', right: '60px' },  // optional: move the ? button, or false for none
  });
  ```

- **Key strings** are split at spaces into keycaps. Lowercase words ("or", "hold", "double-tap") and `+ · , –` stay plain text.
- **API:** `Kit.help.open()`, `close()`, `toggle()` and `isOpen()` are there for tests.
- **Sound:** `Kit.sound.isRunning()` tells it whether to wake the sound again on close.

## Testing tips

- **Preview:** the Browser pane can't drive `file://` pages. Serve `~/claude-games` with `python3 -m http.server` and open `/<game>/`.
- **Hidden pane:** while the pane is hidden, `requestAnimationFrame` is throttled. Expose a `step(seconds)` hook that ticks and renders synchronously so screenshots still work.
  - To test something that needs real frames (like the ? panel's freeze), copy the game's `dist` page and put a timer-driven `requestAnimationFrame` in a `<script>` right after `<head>`.

## Games using it

- `metro-surfer`: the Subway Surfers-style runner, where it all started.
- `flappy-teddy` (FlaTTy Birds), `fruit-teddy` (FruiTTy Kids), `kof-teddy` (King of Bonk!).
- Twenty more, all listed on the dashboard (`games-for-teddy-tommy`). All 24 have the ? keys panel.
