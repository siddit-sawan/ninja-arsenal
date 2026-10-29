# Ninja Arsenal: Slice Storm

A 3D third-person ninja arena slicing game with a realistic look (or the original sumi-e ink-wash style) and five explorable maps, for [CrazyGames](https://www.crazygames.com/), built with three.js (bundled locally, no build step).
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
| Finisher (crippled enemy nearby; in the air = aerial finisher) | Q | FINISH button |

Melee enemies wind up before striking (red `!`). Step out of range or dash to dodge. Red arrows at the screen edge show enemies you can't see.

## Art style: realistic, or ink on parchment
Settings → **Style** switches between two looks (saved; Realistic is the default):
- **Realistic:** a cloudy sky with a real sun or moon, sunlight and shadows that follow you across the whole map, ACES tone mapping, painted stone, grass, moss, snow, gravel, timber, plaster and tile surfaces, rippling reflective water, and characters in dyed indigo, hemp and lacquer garb with real skin tones (the Oni is red-skinned in a tiger hide). Times of day: Golden Dawn, Moonlit Night, Spring Day and Blood Moon.
- **Ink:** the original sumi-e look described below. Every map works in both.

- **Characters:** black ink silhouettes with a single accent each. The hero has long red headband tails that stream behind them, a topknot, and a scabbard across the back. Spearmen wear horned kabuto helmets.
- **World:** painted on paper. Parchment sky with a rough ink-bleed sun or moon, ink-grey bamboo and pagodas that fade into the paper with distance, painted mountain silhouettes, a plaster-walled arena, and vermilion torii.
- **Blood and effects:** with Blood on, blood is red ink splatter; in family mode (Blood off, the default) hits throw sakura petals and paper confetti. Slashes leave dry-brush ink strokes, and the swipe trail is a wet brush stroke with a red blade edge.
- **Overlay and UI:** a paper grain plus burnt-edge vignette sits on top. Brush font (Permanent Marker, Apache 2.0, bundled in `vendor/fonts`), ink buttons, red seal accents.
- **Rendering:** neutral tone mapping keeps the paper colors true.

## Bodies, ragdolls & gore
- **Characters:** built from rounded, smooth-shaded parts (capsule limbs, a curved torso shell, sphere heads, rounded hands and tabi feet). Every part can be sliced.
- **Cut faces:** a red rim with a bone-white center in limbs, darker meat in torsos, or ink colors with Blood off.
- **Ragdoll (`js/ragdoll.js`):** each kill becomes an articulated body with 16 joints, a torso frame, and elbow/knee limits so limbs can't fold flat. Joints have contact radii, so bodies settle onto the ground instead of floating.
- **Cutting the dead:** a cut severs every connection it crosses and leaves a stump on each side. Every mesh piece re-attaches to the nearest bone on its side, and disconnected parts become separate ragdolls. Corpses stay on the ground for the whole stage and can be sliced again with any blade or thrown weapon.
- **Loose pieces:** pieces with no bone and dropped weapons are rigid bodies with impulse contact and friction, so they topple and lie flat.
- **Blood:** with Blood on, stumps keep spurting briefly and settled bodies leave pools. In family mode there is no spurting or pooling, and every body vanishes in a puff of ink smoke a few seconds after it settles.
- **Performance:** sleeping bodies merge into one mesh per material. Past 34 bodies / 60 pieces, the oldest slowly sink away.

## Movement & flips
- **Space:** jump. Press it again in the air for a front flip, a camera roll in first person or a full tucked flip on the hero. Jumping over a strike dodges it.
- **Air kills:** kills while airborne give **AERIAL KILL** bonus coins and slow motion.
- **Dash:** zooms the camera with speed lines. Landing kicks up dust and dips the camera.
- **Hits:** kills briefly freeze the action for impact.
- **Animation:** the hero breathes in a guard stance at rest, counter-swings the shoulders while running, leans into strafes, tucks on the way up and reaches for the ground on the way down, absorbs landings in a crouch and flinches when hit. Slashes whip from the hips with an eased follow-through, and weapon swaps draw the new blade. In first person the weapon bobs with the stride, dips on landing and rises from below on a swap.
- **Enemy animation:** enemies breathe and shift their weight, counter-rotate while running, coil back before a strike (with a tremor just before it lands) and lunge into it, snap back with whiplash when hit, crouch after leaping, and crippled ones clutch their wounds and keep trying to rise.
- **Enemies:** half of the light ninjas vault over the arena wall with a flip. Runners (and sometimes grunts) close in with a flying flip into an attack, and archers backflip away if you rush them.

## Family mode
The game is family-friendly by default: **Blood** is off (Settings can turn it back on), hits throw petals instead of blood, nothing spurts or pools, defeated bodies vanish in ink smoke, crippled enemies get circling stars instead of bleeding, and no finisher beheads. Existing saves are switched to family mode once; turning Blood on again is remembered.

## Wounds and finishers
A killing blow that only clips an enemy's legs (a low cut) or an arm (a glancing side cut) cripples them instead: they drop to their knees, bleeding (or seeing stars in family mode) and unable to attack. Walk up and press **Q** (or tap **FINISH**) for a slow-motion finisher that pays bonus coins, score and Storm charge. There are four, picked at random (never the same twice in a row): **Kabutowari** (overhead helmet-splitter that cleaves him top to bottom), **Iaigiri** (crouched quick-draw across the chest that dashes past; he falls a beat later), **Kesagiri** (diagonal shoulder-to-hip cleave) and **Jumonji** (two crossing cuts burn in, then he falls apart in four). **Aerial finishers:** jump (or flip) and press **Q** / **FINISH** while airborne to finish a crippled enemy from up to 7.5 m away (twice the ground range). They pay double coins, +500 score and more Storm charge. Three play at random: **Hien** (front flip to the top of the arc, then a straight dive that splits him in two), **Raijin Otoshi** (high backflip, then a corkscrew fall that carves three cuts; he falls in four pieces) and **Tengu Gaeshi** (vault over him upside down, cutting on the way past; he falls at the click of the sheath). Any other hit kills a crippled enemy outright; left alone, they collapse and vanish in a puff of smoke after 20 s. Bosses and training dummies can't be crippled.

## Blade Storm
When the Storm gauge is full, press **Q** (or tap STORM) for a cutscene: your ninja kneels into a draw stance, the blade flashes out and every enemy in range is marked with glowing cut lines. He holds the follow-through while they stand frozen, then sheathes his sword and they all fall apart on the click.

**Sky Storm** (天嵐) is the aerial variant: trigger the Storm while airborne and your ninja soars high with a backflip, draws in a whirlwind spin at the top that marks every enemy below, floats down holding the follow-through, lands, and they fall apart when he sheathes.

## Playable ninja
Pick your ninja from **Ninja** on the main menu (coins unlock them): **Kage** (balanced, free), **Hana** the kunoichi (+15% run speed, dash recharges 35% faster, 900), **Tetsu** the ronin (+1 heart, 5% slower, 1,800) and **Raiden** in the oni mask (Storm charges 30% faster, 3,200).

## Maps
Five maps, each a round arena (enemies come in through its gates) set inside a larger area you can explore:
| Map | Arena | Around it |
|---|---|---|
| **Shrine Courtyard** 神社 | stone courtyard, plaster wall, 4 torii gates, stone lanterns | bamboo forest, main hall, two pagodas, koi pond, wayside shrine |
| **Bamboo Grove** 竹林 | mossy clearing, bamboo fence, 3 trails, bamboo clumps and boulders as cover | dense bamboo, a pond, a hidden shrine with a small torii, a stone circle, autumn maples |
| **Mountain Village** 山村 | dirt square ringed by timber and thatched houses, 4 streets; a well, ox cart, barrels and crates | streets lined with houses, rice paddies, a turning water mill, trees |
| **Snowy Pass** 雪峠 | packed-snow plateau ringed by boulders, 3 trails; rocks and pines as cover; falling snow | pine forest, a frozen lake, a mountain hut, a half-buried torii |
| **Castle Grounds** 城 | raked gravel inside stone-based castle walls, 4 roofed gatehouses; pines in planters | a moat with red-railed bridges, the five-tier keep, a park with sakura and pines, a tea house |

Map *i* unlocks when you reach stage *i* + 1. By default stages rotate through the maps; the menu's map selector (under the stage selector) can pin one map for every stage instead. Each map is laid out from a fixed seed, so it is the same every visit.

## Explore mode
**Explore** on the main menu opens the selected map (the one the selected stage would use) for free roaming: no waves, walls and moats only open at their gates and bridges, and buildings, trees and rocks are solid. Each map hides **8 charms** (glowing red omamori) worth 25 coins each, plus 150 for finding all of them; found charms are remembered per map. Practice dummies stand in the arena and get back up a few seconds after you slice them, and the Storm gauge starts full. A minimap (top right) shows the layout, the charms you haven't found yet and where you are. Pause → Main menu leaves.

**Endless maps:** every map is a square tile (twice its explore radius across) that repeats forever in every direction, so you can walk any way without reaching an edge; forests, paths and paddies run seamlessly from one copy into the next. The 3x3 block of tiles round the camera is drawn (static scenery is merged per material to keep that cheap), the sun's shadows, ground, mountains and particles follow you, collisions wrap across tile edges, and charms are counted per map (each copy shows the ones you haven't found yet). The minimap is centred on you and repeats with the world.

**Rival ninjas:** about twenty wandering ninjas (twelve on low graphics) share the map with you, coming and going as you travel. Each has a name, a clan, a rank (1 Novice to 5 Grandmaster, which sets how they fight: grunt, runner or archer, assassin, samurai, brute) and a temper (kind, proud, gruff or wise) that shapes what they say. Name tags and speech bubbles float over nearby rivals, and they show on the minimap (blue, green once beaten, red while duelling). Walk up to one:
- **T / Talk:** a dialogue (pick replies with 1-5 or a tap): who they are and their clan, **rumours** that give the direction and distance to your nearest unfound charm, fighting **tips**, a duel challenge, or farewell. Time stands still while you talk.
- **R / Duel:** a stand-off, then they fight you hard: 7 to 19 hits to beat (a health bar shows at the top), faster than normal enemies, quick wind-ups chained into near-continuous attacks, two-heart hits from Masters and up, and they **parry** (instant counter-attack) or **evade** (side-step) 25% (Novice) to 53% (Grandmaster) of your blows. A Blade Storm only wounds them. Duels are never to the death: a beaten rival kneels and yields and pays 30 coins per rank; if you lose (or run more than 45 m away) you're knocked back with your hearts restored. Other rivals stop to watch. Rematches are allowed.

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

Enemies: ninja grunts, zig-zag runners, shuriken-throwing archers (swipe their stars to block), armored samurai (3 HP, from stage 4), club-wielding brutes (2 HP, ground-shaking slams, from stage 14) and assassins who vanish in smoke and reappear behind you (from stage 24). The first three types arrive on stages 2-4; every later one comes at least 10 stages after the previous. Each type unlocks on its stage with a NEW ENEMY banner and a tip, is guaranteed a few early appearances that stage, and then keeps showing up in every later stage in growing numbers. Every stage brings more enemies (15 on stage 1, ~50 by stage 10, ~100 by stage 20) and more of them on the field at once (6, rising to 16).

Bosses rotate every 5th stage and get tougher each time round:
- **Oni Warlord** (stage 5, 20, ...): huge, slow, crushing club; summons grunts.
- **Shogun General** (stage 10, 25, ...): telegraphed charging rush across the arena (dash or jump to dodge); summons samurai and archers.
- **Shadow Master** (stage 15, 30, ...): teleports beside you mid-fight and conjures shadow clones.

There are 4 times of day per style, and stages go on endlessly with rising difficulty.

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
Dev-only switches (localhost only): `?test=play&stage=5`, `?test=explore&map=castle` (`&at=x,z` start position, `&talk` / `&duel` with a rival in front of you), `&style=ink|real`, `&spawn=shogun,brute`, `?test=storm` (`&air` for Sky Storm), `?test=finish&go` (`&air` for an aerial finisher, `&fin=N` to pick one), `&hold` (freeze on the last `&sim` frame), `&near`, `&auto`, `&w=naginata`, `&sim=600`, `&dbg`.

## Upload to CrazyGames
Run `build.ps1`. It creates `dist/ninja-arsenal.zip` (index.html + js/ + vendor/). Upload that zip in the Developer Portal and run the QA tool.

## Licenses
three.js r169 (MIT), see `vendor/THREE-LICENSE.txt`. Character body: Mixamo "Soldier" (Vanguard) (Adobe Mixamo, royalty-free for use in games; not for redistribution as a standalone asset), stripped of animations, textures and visor into `models/body.glb`. All other models, textures, and audio are generated in code.
