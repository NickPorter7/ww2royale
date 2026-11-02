## Version 1.19.1 — Official logo integration

- Added the supplied transparent WW2 Royale emblem to the **home screen**, replacing the placeholder star with a prominent full-size logo.
- Replaced the old four-point star by the game title with a smaller branded logo and added a matching **logo in the top-right corner** of the game bar.
- Added an `.ico` favicon, a high-resolution PNG favicon, and an Apple touch icon for browsers and phones.
- The art is included locally at `client/assets/branding/`. There are no new third-party dependencies or external image requests.
- All prior version 1.19 gameplay, province maps, Portugal, public matchmaking and music are retained.

Browser favicons may be cached; after deploying refresh the page and, if needed, try a new private tab to see the new icon.

## Version 1.19 — Portugal playable, polished province borders, and 6-of-9 public matchmaking

- Portugal is now a **playable nation** with **10 provinces** instead of 3.
- Public matchmaking now supports **9 playable nations total**, and public games **start once 6 commanders** have selected nations.
- **Quick Match** can still place players into a started public server for the **first 60 seconds** after the war begins, as long as a nation slot is still open.
- After that first minute, the match can still be joined by **entering the room code** directly.
- Province borders received another polish pass for a more historical-map look while keeping the same territory colours.

## Version 1.18 — sandbox wording, cleaner order planning, and revised province lines

- Replaced the visible top-bar subtitle **THE EUROPEAN THEATRE** with **WW2 SANDBOX**.
- When you enter **Move** or **Attack** planning, the bottom province intelligence strip now hides while the troop sliders are on screen, so the planner no longer has province info sitting behind it.
- Province borders were redrawn in a more map-like style inspired by the supplied screenshot: the overlay is now generated from the province-ID raster with fine pale border lines and a subtle dark under-shadow, keeping province edges fully connected while looking more like hand-drawn historical map partitions.

## Version 1.17.1 — Uploaded soundtrack integrated

The user-provided **War Impact** MP3 by The_Mountain is now bundled as `client/assets/audio/war-impact.mp3`, approximately 3 minutes 13 seconds long. The game uses it as its default looping soundtrack at 22% volume and retains the original loop as a fallback if the MP3 cannot play. Other sound effects are unchanged. The previously implemented treasury display refreshes every five seconds; server-side cash accrual is unchanged.

Music page: https://pixabay.com/music/main-title-war-impact-129181/ . This file was provided for inclusion in the game. Keep the Pixabay license/download records when deploying publicly; Pixabay's license terms and any Content ID claims remain the deployer's responsibility.

# WW2 Royale — Version 1.19

Real-time multiplayer WWII-inspired browser strategy game for desktop and mobile. This release updates connected province borders, movement and calendar timings, progressive seasonal weather, province troop counters, the province intelligence dock, button states, and the original soundtrack.

## Start on Windows

1. Extract `WW2-Royale-1.16.zip` using **Extract All**.
2. Open the extracted folder until you see `package.json` at its top level. This ZIP deliberately contains `package.json` at its root to avoid the earlier nested-folder npm error.
3. In that folder, click File Explorer's address bar, type `cmd`, and press Enter.
4. Run `npm run dev` (requires **Node.js 22 or newer**; there are no npm production dependencies).
5. Visit <http://localhost:3000>.

If `npm run dev` returns `ENOENT` for `package.json`, the terminal is in the wrong directory. Open the directory containing that file, or run the included `start-game-windows.bat` launcher.

For online hosting, use `npm start`, on a Render Node.js Web Service with the Root Directory containing `package.json`.

## Historical changes retained from 1.15

### Connected, detailed province borders

- **No Chaikin or individually rounded borders.** The black border overlay is regenerated from the exact same province-ID raster that handles clicking and country colours.
- Neighbouring provinces therefore share the same edges. The edges have more naturally detailed corners, without the rounded gaps seen in 1.14.
- Hover/selection outlines are regenerated from the province-ID mask at subpixel contour precision.
- To regenerate the border overlay and province paths after editing a province mask, run `python tools/refine_borders.py` (requires Python, Pillow, NumPy, and OpenCV).

### Military and calendar pacing

| Unit | Travel time per province |
|---|---:|
| Infantry | 15 seconds |
| Tanks | 30 seconds |
| Bombers | 10.5 seconds |

Mixed armies move at the pace of the slowest unit. Recalls and target changes continue to use standard movement speed. One in-game year now lasts **20 real minutes**, starting on October 6, 1939. The number of days per anniversary interval is taken from the Gregorian calendar, including leap days; each in-game day is about **3.28 real seconds**.

### Seasons deepen and recede gradually

- The game still uses spring, summer, autumn, and winter overlays.
- Within a season, the effect progressively intensifies toward its centre and decreases toward the next season.
- Snow and northern sea-ice tint become more visible in midwinter; spring rain particles become denser in mid-spring; summer light grows stronger in midsummer; autumn colour and leaves intensify mid-autumn.
- The visual effects are synchronized to the game clock and **do not change combat mechanics**.

### Province visibility and compact dock

- Troop counters are restored directly on the map, showing troop counts and a small unit icon **only in provinces for which the server permits intelligence**. Classified areas remain blank—no question marks.
- The bottom province information dock has a dark teal title strip and compact military/infrastructure tiles with labelled unit/building icons and quantities, inspired by the supplied reference screenshots.
- On iPhone, the dock can scroll horizontally rather than swallowing the screen. The quick-action buttons remain above it.

### Soundtrack and controls

- Replaced `client/assets/audio/music-loop.wav` with an **original 38.4-second orchestral march loop** written and synthesized specifically for WW2 Royale. It does not contain samples or music taken from third parties.
- Background music starts after an initial click/tap in accordance with browser autoplay restrictions.
- Button hover states darken slightly, and clicking depresses buttons with an inset shadow instead of brightening or lifting them.
- Existing effects for construction, purchases, movement, chat, and attacks are retained.

## Existing features retained

- 107 provinces and 17 nations, eight playable.
- Private rooms with six-digit invite codes and eight-player public matchmaking.
- Historical city names, national flags, dynamic territory colouring and diplomacy.
- Infantry, tanks, bombers, defence, recruitment, buildings, bank income, and spy balloons.
- Army travel and recall, troop selection sliders, live chat, and victory conditions.

## Source files

| File | Purpose |
|---|---|
| `shared/map.json` | Province definitions, capitals, adjacency, and `secondsPerYear` |
| `client/assets/province-ids.png` | Authoritative selectable province raster |
| `client/assets/province-lines.png` | Shared, connected province borders |
| `client/assets/season-*.png` | Seasonal colour/ice/snow overlays |
| `client/assets/audio/music-loop.wav` | Original orchestral background music |
| `client/main.js` | Map renderer, visibility, controls, seasonal depth |
| `client/style.css` | Desktop/mobile layouts and button interactions |
| `server/game.js` | Authoritative travel, combat, economy, diplomacy |
| `server/index.js` | HTTP/WebSocket multiplayer and asset delivery |
| `tools/refine_borders.py` | Connected border and province contour regeneration |
| `tools/make_score_115.py` | Regenerate the original score from code |

## Testing

Run:

```bash
npm run check
npm test
```

The browser smoke test `tools/offline_browser_116.py` uses Python Playwright and local Chromium when available. It exercises selected provinces, the bottom dock, buildings, troop purchasing and desktop/mobile viewport rendering.

## Deploy to ww2royale.com

Upload the **contents** of `ww2-royale-1.16` into the same folder of your GitHub repository used by Render. Commit, then allow Render to deploy the latest commit. Render's Start Command remains `npm start`. **No GoDaddy domain or DNS changes are needed** for this code update.

**Important limitation:** Multiplayer rooms and battles are still held in **server memory**. Active games are reset when the Render service restarts/redeploys. Do not describe the current backend as persistent or production-ready until database storage, disconnect recovery and live security/performance testing are added. Live deployment and physical-device iPhone testing are not part of these automated checks.

## Version 1.16 updates

- **Simplified Buildings tab:** five compact rows with building icon, name, level, effect, price and one action. The action is **Build** when the level is 0, **Upgrade** when it is already constructed but below its level cap, and **Max** at the cap. Unaffordable actions remain labelled Build/Upgrade but are disabled; their tooltip explains the cost.
- Recruitment rows are compact with **+1** and **+5** purchases; spy balloon deployment is in a collapsible section.
- **Calendar pacing:** the interval from 6 October of one year to 6 October the next is exactly 1,200 real seconds (20 minutes). Leap years receive 366 calendar days, other anniversary intervals receive 365. A game day is approximately **3.28 seconds** long, with exact timing depending on the number of days to the next anniversary.
- Economy, movement speeds, buildings, music, map, and multiplayer rules are unchanged.

