# Ninja Arsenal: Slice Storm

A 3D third-person ninja arena slicing game in a sumi-e ink-wash style for [CrazyGames](https://www.crazygames.com/), built with three.js (bundled locally, no build step).
You move freely around a walled shrine arena while enemies pour in through four torii gates, and you cut them apart with real-time mesh slicing: every cut splits the 3D model along your swipe plane, caps the wound, and sends the halves flying. Halves can be sliced again in mid-air.

## Controls
| | Desktop | Mobile |
|---|---|---|
| Move | WASD (arrows turn) | left-thumb joystick (up/down move, left/right turn) |
| Look | mouse (pointer lock; right-drag if lock is unavailable) | joystick turn |
| Slice | hold left click + drag ("blade mode": camera freezes, mouse draws the cut); quick click = fast slash | swipe on the right side |
| Jump / flip | Space (again in the air = front flip) | JUMP button |
| Dash / dodge | Shift | DASH button |
| Weapons | 1-5 or mouse wheel | weapon bar |
| Blade Storm | Q / E / F | STORM button |
| Finisher (crippled enemy nearby) | Q | FINISH button |

Melee enemies wind up before striking (red `!`). Step out of range or dash to dodge. Red arrows at the screen edge show enemies you can't see.

## Art style: ink on parchment
- **Characters:** black ink silhouettes with a single accent each. The hero has long red headband tails that stream behind them, a topknot, and a scabbard across the back. Spearmen wear horned kabuto helmets.
- **World:** painted on paper. Parchment sky with a rough ink-bleed sun or moon, ink-grey bamboo and pagodas that fade into the paper with distance, painted mountain silhouettes, a plaster-walled arena, and vermilion torii.
- **Blood and effects:** blood is red ink splatter. Slashes leave dry-brush ink strokes, and the swipe trail is a wet brush stroke with a red blade edge.
- **Overlay and UI:** a paper grain plus burnt-edge vignette sits on top. Brush font (Permanent Marker, Apache 2.0, bundled in `vendor/fonts`), ink buttons, red seal accents.
- **Rendering:** neutral tone mapping keeps the paper colors true.

## Bodies, ragdolls & gore
- **Characters:** built from rounded, smooth-shaded parts (capsule limbs, a curved torso shell, sphere heads, rounded hands and tabi feet). Every part can be sliced.
- **Cut faces:** a red rim with a bone-white center in limbs, darker meat in torsos, or ink colors with Blood off.
- **Ragdoll (`js/ragdoll.js`):** each kill becomes an articulated body with 16 joints, a torso frame, and elbow/knee limits so limbs can't fold flat. Joints have contact radii, so bodies settle onto the ground instead of floating.
- **Cutting the dead:** a cut severs every connection it crosses and leaves a stump on each side. Every mesh piece re-attaches to the nearest bone on its side, and disconnected parts become separate ragdolls. Corpses stay on the ground for the whole stage and can be sliced again with any blade or thrown weapon.
- **Loose pieces:** pieces with no bone and dropped weapons are rigid bodies with impulse contact and friction, so they topple and lie flat.
- **Blood:** stumps keep spurting briefly, and settled bodies leave pools.
- **Performance:** sleeping bodies merge into one mesh per material. Past 34 bodies / 60 pieces, the oldest slowly sink away.

## Movement & flips
- **Space:** jump. Press it again in the air for a front flip, a camera roll in first person or a full tucked flip on the hero. Jumping over a strike dodges it.
- **Air kills:** kills while airborne give **AERIAL KILL** bonus coins and slow motion.
- **Dash:** zooms the camera with speed lines. Landing kicks up dust and dips the camera.
- **Hits:** kills briefly freeze the action for impact.
- **Enemies:** half of the light ninjas vault over the arena wall with a flip. Runners (and sometimes grunts) close in with a flying flip into an attack, and archers backflip away if you rush them.

## Wounds and finishers
A killing blow that only clips an enemy's legs (a low cut) or an arm (a glancing side cut) cripples them instead: they drop to their knees, bleeding and unable to attack. Walk up and press **Q** (or tap **FINISH**) for a slow-motion execution that pays bonus coins, score and Storm charge. Any other hit kills a crippled enemy outright; left alone, they bleed out after 20 s. Bosses and training dummies can't be crippled.

## Camera modes
Press **C** (or the camera button, or Settings â†’ Camera) to switch views. The choice is saved.
- **Third person:** the default. An over-the-shoulder view of your hero ninja, who animates each slash and throw.
- **First person:** your hands and weapon are on screen.
- **Wide action:** a higher, pulled-back view for crowd control.

Slicing, throwing, and the kusarigama work in every mode. Cuts always follow the line you draw on screen.

## Tutorial
The first time you press Play you get the **Training Grounds**, an interactive 12-step tutorial: look, move, dash, slice, quick slash, air slice, throwing weapons, dodging a real attack, crippling and finishing an enemy, Blade Storm, and camera views. Each step ticks off when you do it. You take no damage during training. Finishing it the first time pays 150 coins and leads into the shop guide, then stage 1. You can replay it from the menu, or skip it from the pause menu.

## Shop (Arsenal)
Each weapon shows Power, Range, and Speed with exact values, plus green previews of the next upgrade. It also shows its perk (e.g. stars per throw and pierce count), its level (x / 5), and the unlock or upgrade price. A guided **shop tour** covers coins, stats, perks, levels, buying, ad trials, and Vitality. It runs the first time you open the Arsenal (or after the tutorial) and can be replayed with the **?** button.

## Weapons
| # | Weapon | Input | Behaviour |
|---|---|---|---|
| 1 | Katana | swipe | Close-range slicing along the exact swipe line, mid-air re-cuts |
| 2 | Shuriken | tap / hold | Spinning stars that pierce and cut horizontally (multi-throw at higher levels) |
| 3 | Kunai | tap / hold | Heavy knives that split top to bottom and cut through samurai armor |
| 4 | Kusarigama | swipe + release | Chained sickle flung across the whole battlefield along the arc |
| 5 | Naginata | swipe | One huge edge-to-edge sweep per stroke |
| Q | Blade Storm | button / Q / Space | Ultimate: slow motion, every enemy on screen is sliced |

Enemies: ninja grunts, zig-zag runners, shuriken-throwing archers (swipe their stars to block), armored samurai (3 HP, from stage 4), club-wielding brutes (2 HP, ground-shaking slams, from stage 4) and assassins who vanish in smoke and reappear behind you (from stage 6). Every stage brings more enemies (15 on stage 1, ~50 by stage 10, ~100 by stage 20) and more of them on the field at once (6, rising to 16).

Bosses rotate every 5th stage and get tougher each time round:
- **Oni Warlord** (stage 5, 20, ...): huge, slow, crushing club; summons grunts.
- **Shogun General** (stage 10, 25, ...): telegraphed charging rush across the arena (dash or jump to dodge); summons samurai and archers.
- **Shadow Master** (stage 15, 30, ...): teleports beside you mid-fight and conjures shadow clones.

There are 4 times of day (Dusk, Moonlit, Sakura Dawn, Blood Moon), and stages go on endlessly with rising difficulty.

Ads: a midgame ad plays at most every 3rd stage and never within 3 minutes of the previous ad (rewarded ads count).

Progression: coins â†’ unlock and upgrade 5 weapons (5 levels each) + Vitality (extra hearts). Combos, multi-slice bonuses, air slices, 3-star results.

## CrazyGames SDK v3 (`js/sdk.js`)
- `init`, `loadingStart/Stop` around the procedural asset build
- `gameplayStart/Stop` (deduplicated; stopped on pause, menus, results, game over, ad start)
- `happytime` when the Oni boss is slain
- Midgame ad on *Next stage* / *Retry* / *Restart*
- Rewarded ads: **Revive** (once per stage), **Double coins** on results, **Try a locked weapon for 1 stage**. Rewards are given only on `adFinished`. Ad offers are hidden for the session on `adsDisabled` / `adblock`. Audio is muted only while an ad actually plays
- `game.settings.muteAudio` + settings listener (overrides the in-game sound toggles)
- `user.systemInfo` device type â†’ mobile defaults to Low graphics
- `data` module for saves (localStorage fallback); the auth listener reloads progress when the account changes
- Space/arrow keys don't scroll the page, the context menu is disabled, and the game auto-pauses on blur or tab switch

## Run locally
Serve the folder over HTTP (ES modules don't load from `file://`):
```
python -m http.server 8010 --directory .
```
Open http://localhost:8010/. Test switches: `?devads` simulates ads, `?muteAudio=true` simulates the platform mute.
Dev-only switches (localhost only): `?test=play&stage=5`, `&spawn=shogun,brute`, `?test=storm`, `?test=finish&go`, `&near`, `&auto`, `&w=naginata`, `&sim=600`, `&dbg`.

## Upload to CrazyGames
Run `build.ps1`. It creates `dist/ninja-arsenal.zip` (index.html + js/ + vendor/). Upload that zip in the Developer Portal and run the QA tool.

## Licenses
three.js r169 (MIT), see `vendor/THREE-LICENSE.txt`. Character body: Mixamo "Soldier" (Vanguard) (Adobe Mixamo, royalty-free for use in games; not for redistribution as a standalone asset), stripped of animations, textures and visor into `models/body.glb`. All other models, textures, and audio are generated in code.
