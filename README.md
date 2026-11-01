# Ninja Arsenal: Slice Storm

A 3D third-person ninja arena slicing game with a realistic look and five explorable maps, for [CrazyGames](https://www.crazygames.com/), built with three.js (bundled locally, no build step).
You move freely around a walled shrine arena while enemies pour in through four torii gates, and you cut them apart with real-time mesh slicing: every cut splits the 3D model along your swipe plane, caps the wound, and sends the halves flying. Halves can be sliced again in mid-air.

## Controls
| | Desktop | Mobile |
|---|---|---|
| Move | WASD (arrows turn) | left-thumb joystick (up/down move, left/right turn) |
| Look | mouse (pointer lock; right-drag if lock is unavailable) | joystick turn |
| Slice | hold left click + drag ("blade mode": camera freezes, mouse draws the cut); quick click = fast slash | swipe on the right side |
| Jump / flip | Space (again in the air = front flip) | JUMP button |
| Dash / dodge | Shift | DASH button |
| Weapons | 1-6 or mouse wheel | weapon bar |
| Blade Storm | Q / E / F | STORM button |
| Finisher (crippled enemy nearby; in the air = aerial finisher) | Q | FINISH button |
| Pause | P (Esc also pauses, as it releases the mouse) | pause button (top right) |

Keys are bound by their physical position, so other layouts work as they are (AZERTY: ZQSD to move, A for Blade Storm), and every key name shown in the game follows the player's keyboard layout. Ctrl/Cmd+W is held back while the game is fullscreen. The tutorial can be skipped from its card or the pause menu.

Melee enemies wind up before striking (red `!`). Step out of range or dash to dodge. Red arrows at the screen edge show enemies you can't see.

## Skill: counters, perfect dodges, clean cuts
- **Counter:** cut a foe in the late part of his wind-up (the `!` has been up a while), or while he's left open after a perfect dodge. It cuts through anything (bosses take triple damage, but like every hit on a boss it never stuns them: no flinch, no knockback, and their blow still lands): slow motion, Storm gauge and coins. Hits early in the wind-up land but no longer stop the blow, so timing beats mashing.
- **Perfect dodge:** dash or jump in the last moment before a blow that would have hit lands: slow motion, Storm gauge, and he is left open for a counter for a second.
- **Clean cut:** a killing cut straight through the middle of the body (not a graze) pays a bonus.
- The results screen counts counters, perfect dodges and clean cuts.

## Cloth
The hero's headband is a thick, folded band. Its tails and the obi-knot tails are simulated cloth (`js/cloth.js`) of a heavy weave: they hang down the back at rest, trail behind when running, and swing only gently through turns, dashes and flips (strong damping, little flutter). They stay out of the head and back.

## Art style
- **Look:** a cloudy sky with a real sun or moon, sunlight and shadows that follow you across the whole map, ACES tone mapping, painted stone, grass, moss, snow, gravel, timber, plaster and tile surfaces, rippling reflective water, and characters in dyed indigo, hemp and lacquer garb with real skin tones (the Oni is red-skinned in a tiger hide). Times of day: Golden Dawn, Moonlit Night, Spring Day and Blood Moon.
- **Effects:** with Blood on, hits throw red droplets that vanish as they reach the floor. Blood never splatters or pools on the ground. In family mode (Blood off, the default), hits throw sakura petals and confetti. Slashes leave dry-brush strokes.
- **UI:** parchment panels, a brush font (Permanent Marker, Apache 2.0, bundled in `vendor/fonts`) and red seal accents.

## Bodies, ragdolls & gore
- **Rounded bodies:** at load, the trunk, upper arms, forearms, thighs, shins and head are sliced across their bone axis and each slice is blended toward a smooth ellipse of the same width and depth (`roundTrunk` / `roundLimbs` in `js/body.js`). Flat panels and creases become clean, rounded forms, and the silhouette and proportions stay the same. The blend fades out at the joints, so no seams open.
- **Characters:** built from rounded, smooth-shaded parts (capsule limbs, a curved torso shell, sphere heads, rounded hands and tabi feet). Every part can be sliced.
- **Cut faces:** a red rim with a bone-white center in limbs, darker meat in torsos (dark tones with Blood off).
- **Ragdoll (`js/ragdoll.js`):** each kill becomes an articulated body with 16 joints, a torso frame, and elbow/knee limits so limbs can't fold flat. Joints have contact radii, so bodies settle onto the ground instead of floating.
- **Cutting the dead:** a cut severs every connection it crosses and leaves a stump on each side. Every mesh piece re-attaches to the nearest bone on its side, and disconnected parts become separate ragdolls. Corpses stay on the ground for the whole stage and can be sliced again with any blade or thrown weapon.
- **Loose pieces:** pieces with no bone and dropped weapons are rigid bodies with impulse contact and friction, so they topple and lie flat.
- **Blood:** with Blood on, stumps keep spurting briefly, but nothing splatters or pools on the floor. In family mode there is no spurting, and every body vanishes in a puff of ink smoke a few seconds after it settles.
- **Performance:** sleeping bodies merge into one mesh per material. Past 34 bodies / 60 pieces, the oldest slowly sink away.

## Aerial attacks
Three weapons attack differently in the air, once per jump (it recharges when you land):
- **Katana, Tsubame Gaeshi:** the cut spins your whole body round (knees tucked), you hang in the air for a moment, and a return cut follows 0.17 s later along the mirrored line, with longer reach and +1 damage.
- **Kusarigama, Kaiten:** the sickle whirls round you on its chain one and a half times, cutting every enemy (and corpse, star and, in Explore, prop) within 7-11 m as it sweeps past.
- **Naginata, Rakurai:** you drive down blade-first. The landing cuts apart everything within 4.5-6.3 m of the impact, with +1 damage, a dust ring and a heavy shake.
From a double jump (during or after the flip), each becomes a somersault instead:
- **Katana, Engetsu:** a tight front flip with the blade carried round overhead, ending in a straight overhead cleave.
- **Kusarigama, vertical Kaiten:** you somersault while the chain loops out in front of you. It reaches 30% further, but only ahead.
- **Naginata:** a front flip first, then the drive down.

Bosses and duelling rivals take the damage instead of being cut apart.

## Movement & flips
- **At ease (Explore):** with nothing to fight within 16 m, 3 s after your last attack your ninja puts the weapon away (it disappears from the hand, and from the first-person view) and stands and walks at ease: upright, legs straight, arms hanging and swinging naturally with the stride. Any attack, Storm or weapon pick draws it again at once.
- **Momentum:** speed builds up and bleeds off over a fraction of a second, and there is little steering in mid-air. The dash bursts out and eases off. Every joint of the hero eases toward its pose instead of snapping between running, standing and jumping, and landings are soaked up in the knees. Enemies and townsfolk ease into their stride too, and slow walkers take small steps instead of running in place.
- **Space:** jump. Press it again in the air for a front flip, a camera roll in first person or a full tucked flip on the hero. Jumping over a strike dodges it.
- **Air kills:** kills while airborne give **AERIAL KILL** bonus coins and slow motion.
- **Dash:** zooms the camera with speed lines. Landing kicks up dust and dips the camera.
- **Hits:** kills briefly freeze the action for impact.
- **Animation:** the hero breathes in a guard stance at rest, counter-swings the shoulders while running, leans into strafes, tucks on the way up and reaches for the ground on the way down, absorbs landings in a crouch and flinches when hit. Slashes whip from the hips with an eased follow-through, and weapon swaps draw the new blade. In first person the weapon bobs with the stride, dips on landing and rises from below on a swap.
- **Enemy animation:** enemies breathe and shift their weight, counter-rotate while running, coil back before a strike (with a tremor just before it lands) and lunge into it, snap back with whiplash when hit, crouch after leaping, and crippled ones clutch their wounds and keep trying to rise.
- **Enemies:** half of the light ninjas vault over the arena wall with a flip. Runners (and sometimes grunts) close in with a flying flip into an attack, and archers backflip away if you rush them.

## Family mode
The game is family-friendly by default: **Blood** is off (Settings can turn it back on), hits throw petals instead of blood, nothing spurts, defeated bodies vanish in ink smoke, crippled enemies get circling stars instead of bleeding, and no finisher beheads. Existing saves are switched to family mode once; turning Blood on again is remembered.

## Wounds and finishers
A killing blow that only clips an enemy's legs (a low cut) or an arm (a glancing side cut) cripples them instead: they drop to their knees, bleeding (or seeing stars in family mode) and unable to attack. Walk up and press **Q** (or tap **FINISH**) for a slow-motion finisher that pays bonus coins, score and Storm charge. There are four, picked at random (never the same twice in a row): **Kabutowari** (overhead helmet-splitter that cleaves him top to bottom), **Iaigiri** (crouched quick-draw across the chest that dashes past; he falls a beat later), **Kesagiri** (diagonal shoulder-to-hip cleave) and **Jumonji** (two crossing cuts burn in, then he falls apart in four). **Aerial finishers:** jump (or flip) and press **Q** / **FINISH** while airborne to finish a crippled enemy from up to 7.5 m away (twice the ground range). They pay double coins, +500 score and more Storm charge. Three play at random: **Hien** (front flip to the top of the arc, then a straight dive that splits him in two), **Raijin Otoshi** (high backflip, then a corkscrew fall that carves three cuts; he falls in four pieces) and **Tengu Gaeshi** (vault over him upside down, cutting on the way past; he falls at the click of the sheath). Any other hit kills a crippled enemy outright; left alone, they collapse and vanish in a puff of smoke after 20 s. Bosses and training dummies can't be crippled.

## Blade Storm
When the Storm gauge is full, press **Q** (or tap STORM) for a cutscene: your ninja kneels into a draw stance, the blade flashes out and every enemy in range is marked with glowing cut lines. He holds the follow-through while they stand frozen, then sheathes his sword and they all fall apart on the click.

**Sky Storm** (天嵐) is the aerial variant: trigger the Storm while airborne and your ninja soars up with a backflip, then draws in a whirlwind spin at the top that marks every enemy below. He keeps his knees drawn up and his eyes on the field, hangs for a heartbeat, then drops fast, legs reaching for the ground, into a crouched landing that kicks up dust. He holds the follow-through on the ground (no floating), and the enemies fall apart when he sheathes.

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
**Explore** on the main menu opens the selected map (the one the selected stage would use) for free roaming: no waves, walls and moats only open at their gates and bridges, and buildings, trees and rocks are solid. Each map hides **8 charms** (glowing red omamori) worth 25 coins each, plus 150 for finding all of them; found charms are remembered per map.

**Charm blessings:** charms from all maps count toward permanent blessings that apply everywhere, stages included: 3 charms +1 heart, 8 Storm charges 15% faster, 14 +15% coins from every run, 20 stages start with the Storm gauge half full, 28 +1 more heart, 40 (every charm) dash recharges 25% faster. The main menu (under the buttons) and the explore pause menu show your charm count, the blessings you have and the next one. Picking up a charm tells you how many more you need, and reaching a blessing announces it. Practice dummies stand in the arena and get back up a few seconds after you slice them, and the Storm gauge starts full. A minimap (top right) shows the layout, the charms you haven't found yet and where you are. Pause → Main menu leaves.

**Spirit trials:** now and then a glowing spirit appears 18-35 m away (cyan on the minimap, with a cyan marker or edge arrow on screen). Touch it and **50 spirit warriors** rise round you a few at a time (red on the minimap). Cut them all down within 3 minutes. The first trial puts 4 on the field at once. Each trial you clear adds one more every other clear, up to 8, and brings in tougher kinds: archers after 1 clear, samurai after 3, assassins after 5, brutes after 8. Clearing one pays 150 coins and fills the Storm gauge. If you're knocked down or the time runs out, the trial ends, the warriors fade, and your hearts are restored. You can't start a duel during a trial.

**Errands:** ask a rival **"Need a hand?"** and they give you a job: cut down 4-8 pieces of scenery, beat a ninja of a named clan in a duel, finish a spirit trial, or find a charm. You can carry one errand at a time. It shows under your hearts (with the trial timer while a trial runs) and pays 40 + 15 per rank of the giver as soon as it's done, wherever they are by then. Ask the giver again to check your progress.

**Rumour markers:** after a rival tells you a rumour, that charm gets a gold marker on screen (an edge arrow when it's out of view) and a pulsing gold ring on the minimap until you find it.

**Day, night and weather:** in Explore the sky runs a full day every 7 minutes: dawn, day, dusk and night, each held for a while, then blended smoothly into the next (sun, sky, fog, light and reflections). The weather drifts between clear, cloudy, rain, storm and fog every 1-2 minutes, blending over about 12 s. On the Snowy Pass, rain and storms become snow and blizzards. Rain falls as streaks round you, storms throw lightning with thunder, and fog closes in the view. The stage tag shows the time of day and the weather. Nights and the Blood Moon are lit brightly enough to fight in.

**Towns and townsfolk:** every map has a town: a beaten-earth square with a well, two market stalls, a bounty board and lanterns, ringed by houses, with a road to the nearest path. The towns are Kiyomizu (Shrine), Takemura (Bamboo), Jokamachi (Castle) and Yukimura (Snowy Pass); on the Mountain Village map, Yamamura is the village square itself. Near a town, townsfolk in straw hats walk the square, chat as you pass (their lines depend on the weather and the time of day) and turn to face you. They can't be harmed. Press **T** (or tap Talk) beside one to talk:
- **Merchant** (at a stall): Healing tea (30 coins, full hearts), Storm talisman (120, full Storm gauge), Charm map (150, marks the nearest charm you haven't found), Spirit incense (80, calls a spirit trial to you).
- **Village elder** (at the bounty board): asks for help against **bandit raids**. Accept, and bandits pour in from the edge of town a few at a time. 12 bandits for the first raid, 3 more per raid repelled (up to 30), with tougher kinds over time. Beat them all within 150 s without leaving town. The townsfolk take shelter during the raid and cheer when it's over. A raid pays 120 coins + 20 per raid already repelled (up to +200), half again at night, and fills the Storm gauge.
- **Townsfolk:** small talk, and news of where a spirit light was seen.
Rivals can also hand out a raid errand. The explorer's guide has a step that leads you to the town. Merchants and elders show as white dots on the minimap.

**Houses and towns are solid:** every house (in towns, the village, the mill and the huts), plus a town's stalls, well, bounty board and lanterns, can't be cut. The blade glances off with a spark, a scrape and a small nudge of the camera. Bombs, aerial attacks and the Blade Storm leave them alone too. Trees, bamboo, rocks, fences, walls and other scenery still come down.

**Cutting performance:** blade strokes cut at most 6 props each, nearest first, and the cuts are queued so only 2 happen per frame. Removing a cut prop from the world re-uploads only its own slice of the merged scenery mesh and its own instance, not the whole buffer. Up to 80 cut pieces stay on the ground (the oldest settled ones sink away). Settled small pieces stop casting shadows, and crumbs sink away after 6 s.

**Endless maps:** every map is a square tile (twice its explore radius across) that repeats forever in every direction, so you can walk any way without reaching an edge; forests, paths and paddies run seamlessly from one copy into the next. The 3x3 block of tiles round the camera is drawn (static scenery is merged per material to keep that cheap), the sun's shadows, ground, mountains and particles follow you, collisions wrap across tile edges, and charms are counted per map (each copy shows the ones you haven't found yet). The minimap is centred on you and repeats with the world.

**Rival ninjas:** 22 wandering ninjas (14 on low graphics) share the map with you, coming and going as you travel. Each has a name, a clan, a rank (1 Novice to 5 Grandmaster, which sets how they fight: grunt, runner or archer, assassin, samurai, brute) and a temper (kind, proud, gruff or wise) that shapes what they say. Name tags and speech bubbles float over nearby rivals, and they show on the minimap (blue, green once beaten, red while duelling). Walk up to one:
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

**Explorer's guide:** after the first tutorial and its shop tour, the game takes you straight into Explore (on stage 1's map), and a 7-step guide starts at once. It uses the same card as the tutorial. Step 1 has you leave the arena through a gate to a white marker in the wilds. The other steps cover talking to a rival, rumours and charm blessings, errands, cutting scenery, spirit trials, and seeing a duel through. If a step needs a rival or a spirit, one is placed in front of you. Finishing it the first time pays 100 coins, and then stage 1 starts (skipping it goes to stage 1 too). Players who skipped the tutorial see a pulsing **NEW** badge on the menu's Explore button until they've done the guide, which then joins them 12 s into their first visit. Pause → **Explorer's guide** replays it.

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
| 6 | Hōroku Bomb | tap | A clay bomb lobbed in an arc to the enemy nearest your aim (or the ground, up to 30 m away). It bursts on impact and cuts apart every enemy, corpse and (in Explore) prop within 3-4.6 m, and destroys stars in the blast. Bosses and duelling rivals take the damage instead. 3,000 coins; power 2-4, recharges in 1.55-0.95 s |
| Q | Blade Storm | button / Q / Space | Ultimate: slow motion, every enemy on screen is sliced |

Enemies: ninja grunts, zig-zag runners, shuriken-throwing archers (swipe their stars to block), armored samurai (3 HP, from stage 4), club-wielding brutes (2 HP, ground-shaking slams, from stage 14) and assassins who vanish in smoke and reappear behind you (from stage 24). The first three types arrive on stages 2-4; every later one comes at least 10 stages after the previous. Each type unlocks on its stage with a NEW ENEMY banner and a tip, is guaranteed a few early appearances that stage, and then keeps showing up in every later stage in growing numbers. Every stage brings more enemies (15 on stage 1, ~53 by stage 10, ~112 by stage 20, up to 170) and more of them on the field at once (6, rising to 24).

**Difficulty curve:** from stage 6 a hardness factor climbs to full strength by stage 30 (and keeps rising to stage 40). Mid and end game get much harder:
- Enemies run faster (up to 2x by stage 34), and wind-ups and the pauses between attacks shrink to as little as half (wind-ups never drop below 0.3 s, so they can still be read).
- Armoured and heavy enemies gain up to 2 extra hit points, and light ones may be veterans that take two hits.
- From stage 18, heavy, armoured and boss blows cost an extra heart.
- Bosses gain far more health each time round and can call more help at once.

Bosses rotate every 5th stage and get tougher each time round:
- **Oni Warlord** (stage 5, 20, ...): huge, slow, crushing club; summons grunts.
- **Shogun General** (stage 10, 25, ...): telegraphed charging rush across the arena (dash or jump to dodge); summons samurai and archers.
- **Shadow Master** (stage 15, 30, ...): teleports beside you mid-fight and conjures shadow clones.

There are 4 times of day per style, and stages go on endlessly with rising difficulty.

Ads: a midgame ad plays at most every 3rd stage and never within 3 minutes of the previous ad (rewarded ads count).

**Star rating:** each stage clear gets 3 stars if you lost no more hearts than the allowance: 40% of your hearts (at least 2), plus 1 more every 10 stages. With 5 hearts that's 2 on stages 1-9 and 3 on stages 10-19. Any clear without a revive gets 2 stars, and a clear after a revive gets 1. A 3-star clear pays +25 coins, and a flawless clear (no hits) still pays +50. The results screen shows the hearts you lost next to the allowance.

Progression: coins → unlock and upgrade 6 weapons (5 levels each) + Vitality (8 levels, +1 heart each: 400, 900, 1,600, 2,600, 3,800, 5,200, 7,000 and 9,500 coins, up to 13 base hearts). Combos, multi-slice bonuses, air slices, 3-star results.

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

## Store art (covers and preview videos)
`marketing/` holds the CrazyGames assets, rendered from the game itself:
- Covers: `cover-landscape-1920x1080.png`, `cover-portrait-800x1200.png`, `cover-square-800x800.png` (the hero mid Sky Storm under the Blood Moon, with the title).
- Previews: `preview-landscape-1920x1080.mp4` and `preview-portrait-1080x1620.mp4`. They are silent, about 16 s long and under 50 MB, with no HUD, cursor or text. Each opens on its cover for half a second, then shows a katana fight in a stage arena, a Sky Storm, Hōroku bombs bursting in a crowd, and a bandit raid on a town at dusk in the rain.

To regenerate them, serve the game on port 8010 and run `python tools/capture.py` (or name a job: `covers`, `landscape`, `portrait`). It needs Chrome and ffmpeg. The script opens the game headless with the dev switch `&rec`, which steps the game frame by frame on a virtual clock (so slow software rendering still gives smooth 30 fps) and posts each frame (3D view plus slash trails, no HUD) to the script. ffmpeg then joins the clips. `&shot=x,y,z,tx,ty,tz` (camera offsets from the hero), `&fov`, `&light` (a key light) and `&title` frame the cover. Edit `CLIPS` and `COVER` in the script to change the shots.

## Run locally
Serve the folder over HTTP (ES modules don't load from `file://`):
```
python -m http.server 8010 --directory .
```
Open http://localhost:8010/. Test switches: `?devads` simulates ads, `?muteAudio=true` simulates the platform mute.
Dev-only switches (localhost only): `?test=play&stage=5`, `?test=explore&map=castle` (`&at=x,z` start position, `&talk` / `&duel` with a rival in front of you, `&guide` to start the explorer's guide, `&wisp` to start a spirit trial (`&errand` adds a trial errand), `&raid` for a bandit raid on the nearest town, `&time=0..1` (0 dawn, .25 day, .5 dusk, .75 night), `&wx=rain|storm|fog|cloudy`), `&spawn=shogun,brute`, `?test=storm` (`&air` for Sky Storm), `?test=finish&go` (`&air` for an aerial finisher, `&fin=N` to pick one), `&hold` (freeze on the last `&sim` frame), `&near`, `&auto`, `&w=naginata`, `&sim=600`, `&dbg`.

## Upload to CrazyGames
Run `build.ps1`. It creates `dist/ninja-arsenal.zip` (index.html + js/ + vendor/). Upload that zip in the Developer Portal and run the QA tool.

## Licenses
three.js r169 (MIT), see `vendor/THREE-LICENSE.txt`. Character body: Mixamo "Soldier" (Vanguard) (Adobe Mixamo, royalty-free for use in games; not for redistribution as a standalone asset), stripped of animations, textures and visor into `models/body.glb`. All other models, textures, and audio are generated in code.
