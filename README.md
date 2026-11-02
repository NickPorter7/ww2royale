# WW2 Royale — Release 1.10

## Historical map and province revision (1.10)

- Switzerland now has an irregular, hand-reshaped national outline and organic province subdivisions (no rectangular national overlay).
- Added **Slovakia, Yugoslavia and Bulgaria**, each with three nonplayable provinces and connected land borders. Historical inspiration: October 1939 (the independent Slovak state, Kingdom of Yugoslavia, and Kingdom of Bulgaria existed).
- Renamed **Italy** to **Fascist Italy** in the nation list, map labels and province names (its stable nation code remains `IT`).
- **107 provinces total**; solo victory at 55 owned provinces (51%); alliance victory at 72 (67%).
- The original relief artwork, eight selectable factions, map controls, troop types, diplomacy and server features are unchanged.

## Compact troop selection

The troop-selection panel no longer blocks the map. Click **Move** or **Attack** to reveal three compact, frameless sliders above the quick-action buttons. Each row contains a transparent unit icon, a range bar, and the selected troop count. You can still click anywhere else on the map to select a destination.

1. Select a friendly province with units.
2. Click **Move** or **Attack**.
3. Adjust infantry, tanks, and bomber sliders (each defaults to 100%).
4. Click a destination province on the map.
5. Click **Confirm** to dispatch or **Cancel** to discard. Destination selection alone never sends an order.

Keyboard tip: press Escape while making an order to cancel without dispatching.

## Start

Install Node.js 22 or newer. In this folder, run `npm run dev`, then open http://localhost:3000. No `npm install` required.

Version 1.10.3 changes only historical map regions, province geometry, country names and related tests; existing multiplayer rules and UI controls are unchanged.

## Start on Windows

1. Extract `WW2-Royale-1.10.zip`.
2. Open the extracted `ww2-royale-1.10` folder. It must contain `package.json`.
3. Double-click `start-game-windows.bat`, **or** type `cmd` in File Explorer's address bar and run `npm run dev`.
4. Open http://localhost:3000 in your browser.

The server requires Node.js 22 or newer. There is no `pip install`, `npm install`, or external dependency requirement.
For public internet multiplayer, deploy the Node server online; local hosting alone is only reachable on your local network.

## Map and countries

- The **original supplied, uncoloured textured Europe map** is the backdrop.
- **107 clickable provinces**, traced from the actual land pixels so selectable areas do not extend over sea:
  - **10 each**: Great Britain, Spain, France, Nazi Germany, Soviet Union, Romania, Hungary, Fascist Italy (8 playable nations = 80 provinces).
  - **3 each**: Switzerland, Portugal, Ireland, Netherlands, Belgium, Denmark, **Slovakia, Yugoslavia, Bulgaria** (9 nonplayable nations = 27 provinces).
- Playable nations can be claimed in private lobbies and eight-player public Quick Match. Neutral/nonplayable countries have territory and troops and may be attacked, but have no human commander.
- Province ownership generates dynamically updated **outer country borders** (dark outline / restrained gold edge). Fainter internal province lines remain available.
- Nation labels are **uniform faded parchment** rather than relation-coloured.
- **Your provinces are green**, **allied provinces blue**, **at-war provinces red** and **neutral provinces retain the source map's tan relief**. Colour uses terrain relief, not a solid fill.
- Provinces change appearance when ownership/diplomacy changes, per viewing player.

### Geographic accuracy

These **country outlines and province borders are hand-approximated to this stylized artwork**, not GIS-accurate 1939 boundaries. The user supplied a relief map without political borders; western/eastern Europe are artistically stretched. Unlisted countries and regions remain unselectable relief terrain, rather than being assigned invented political entities. Slovakia, Yugoslavia and Bulgaria are assigned approximated land areas based on their 1939 position; their boundaries are not historical GIS polygons. Coastlines and water are pixel-masked; internal borders are approximations. For a precise historical map, supply country/province vector boundaries or a georeferenced historical dataset.

## Movement controls

1. Select a province containing your troops (including your garrisons in allied territory).
2. Click **Move** (yellow) or **Attack** (red); a map overlay displays three unit sliders, defaulting to 100% of available infantry, tanks and bombers.
3. Adjust the sliders (or use All/Clear), then click a destination province. Merely selecting a target **never sends an order**.
4. The three quick-action buttons are replaced with **Confirm** and **Cancel**. Confirm sends the order, while Cancel restores the original buttons without moving troops.
5. Attacking a neutral country automatically declares war only **when the user confirms**.

Moving into neutral territory by an attack order automatically declares war, after server validation. A brief on-screen notice appears, but does not interrupt the attack.

- Infantry: 10 seconds per province border.
- Tanks: 20 seconds per border.
- Bombers: 7 seconds per border.
- Combined army travels at the speed of its slowest unit.
- Recall and retarget from Orders; armies must travel back at normal speed.

## Campaign date, defeat, and win

- Each campaign begins on **6 October 1939**.
- Every **10 real seconds = 1 in-game day**; the current date appears in the top bar.
- A player with **zero owned provinces** can return to the main menu through the elimination dialog.
- Solo win: **at least 51%** of all 107 provinces; allied win: **at least 67% combined**.
- The outcome dialog can return you to the main menu rather than restarting in place.

## Gameplay retained

Infantry, tanks and bombers; per-province buildings and production; money/banks; defensive structures; diplomacy/alliances/peace; global and private chat; fog of war; allied garrisons; movement arrows and timers; rankings; private 6-digit invite rooms; public matchmaking.

## Project files

- `server/index.js` — zero-dependency WebSocket server, room creation and matchmaking
- `server/game.js` — authoritative movement, economy, combat, diplomacy and win conditions
- `shared/map.json` — nations, province polygons, connections and initial troop values
- `client/assets/europe-map.png` — supplied relief image (unaltered)
- `client/assets/province-ids.png` — pixel-perfect interactive province hitbox IDs
- `client/assets/province-lines.png` — cosmetic internal borders
- `client/main.js` — Canvas game renderer, relationship colour and click workflow
- `client/index.html`, `client/style.css` — game interface
- `tools/generate_map.py` — optional reproducible map-layer generator, requires Python, Pillow, OpenCV, SciPy (not needed to **play**)

## Validation

Run `npm run check` and `npm test` to execute syntax checks, updated rule/UI checks, and real WebSocket/server integration checks.

An additional offline Chromium interaction test (`tools/offline-browser-smoke.py`) confirmed that sliders default to full troop counts, choosing a destination does not dispatch, Cancel sends no command, and Confirm sends the chosen numbers. It uses a stub WebSocket because direct browser navigation to the local server is restricted in this test environment.

**Limitations:** The interface was exercised in a headless browser against a simulated connection; a full live browser-to-server playthrough is still unverified due to navigation restrictions. Server/game tests pass. Sessions are stored only in RAM and disappear when the server restarts. No anti-cheat, authentication, reconnection ownership, persistent economy, or cross-server matchmaking yet.


## Release 1.6 interface changes

- Province menu is now split into **Army** (troops, allied garrisons) and **Buildings** (counts, production, purchases).
- On selection of a province containing troops you command, **Move** and **Attack** appear as context buttons over the map.
- Move and Attack now open an on-map troop composer with sliders, and orders require a final confirmation (updated in Version 1.8).
- Selecting a province opens Army automatically. Use the Buildings icon to manage construction.
- Server protocol, map assets, combat model, and economy are unchanged.


## Release 1.7 — quick commands and redesigned construction

- Replaced the old framed quick command strip with **three equally sized floating buttons only**: **Attack** (red), **Move** (yellow) and **Build** (blue). There is no box, subtitle or province name attached.
- Attack and Move still use selected troop quantities (100% by default) and the existing source → action → destination workflow.
- Build opens the standalone **Buildings** panel directly for the currently selected owned province. In allied provinces it is disabled, because only the province owner can construct.
- The Buildings panel now features clear SVG icons for each type of infrastructure, a province-output summary, your current treasury, owned counts, output rates, and large **Construct** buttons with prices. Building purchase operations and server-side validation are unchanged.
- No changes to the supplied map, map layers, province IDs, multiplayer protocol, economy, combat, or server rules.


## Release 1.8 — slider-based army orders

- Click the red **Attack** or yellow **Move** quick-action button to open a floating **Field Operations** composer over the map.
- Adjust three **range sliders** — Infantry, Tanks, Bombers — with individual live counts and available totals. The initial setting sends **100% of all available troops**. Use **All** or **Clear** shortcuts.
- Then click a destination province; this **stages the order only**, with the target province highlighted.
- The Attack/Move/Build buttons are **temporarily replaced** by **Confirm attack/Confirm move** and **Cancel**.
- **Confirm** sends one server order using exactly the selected counts, and the usual move times, combat, and neutral war declarations apply. **Cancel** restores the three buttons without sending anything.
- You can also choose a different target in the composer, cancel before choosing a target with its Cancel order link, or press Escape.
- Changes are client-only (`client/index.html`, `client/style.css`, and `client/main.js`); the multiplayer server, map assets, provinces and combat model remain unchanged.


## 1.10.3 visual change

- Replaced the flat grey/blank outer background with an ocean-style repeating backdrop so the sea continues beyond the map edges.

## Version 1.10.3: original background restored

Removed repeating ocean fill beyond the map boundaries and restored the original flat background (`#092632`) from version 1.10.1. Map provinces, regional names, and gameplay remain unchanged.
