# WW2 Royale — Version 1.25

A complete, editable Node.js/WebSocket multiplayer territorial strategy game. The release retains 114 clickable European provinces, nine playable nations, capitals, navy, national traits, diplomacy, War Newspaper, battle reports, commander names, original branded artwork, and the user-provided *War Impact* background track.

## What’s new in 1.25 — Enhanced winter and seasonal travel

### Peak-winter visuals

- **More visible snow** across northern and mountainous provinces, with textured white accumulation instead of a flat white wash.
- **Stronger sea ice** near cold northern coastlines; the surrounding original map texture and country colours remain visible beneath the translucent overlay.
- **Denser, animated snowfall** at winter's peak, decreasing naturally toward the beginning and end of winter.
- Seasonal atmosphere remains visual only in spring, summer, and autumn. Users who prefer reduced motion still get the snowy winter map without animated particles.

### Winter movement penalties

The server uses the **actual in-game calendar** (Dec–Feb) and applies the speed modifier when an army or fleet begins a new order. The modifier rises toward **mid-January**, then gradually thaws through February. Redirecting or retreating starts a new route and recalculates the modifier; orders already travelling keep their originally established ETA so units never jump or teleport at a season change.

| Unit | Spring / summer / autumn | Early December | Around January 15 | Late February |
|---|---:|---:|---:|---:|
| Infantry | 15 seconds per province | ~17.5 sec | 20 sec | ~17.5 sec |
| Tanks | 20 seconds per province | ~25 sec | 30 sec | ~25 sec |
| Bombers | 8.5 seconds per province | 8.5 sec | 8.5 sec | 8.5 sec |
| Navy | Normal voyage duration | +16.7% | +33.3% | +16.7% |
| Spy balloons | 8.5 seconds per province | 8.5 sec | 8.5 sec | 8.5 sec |

Mixed land armies continue travelling at the speed of their slowest unit. Germany's existing tank-speed nation advantage still applies. Outside winter all movement uses the normal speeds in the table. This change deliberately does **not** slow air units. Unit statistics, economy, map geometry, music, combat rules, 60-minute time limit, and 1939–1945 timeline are otherwise unchanged.

The implementation is in `server/weather.js`, used by both `server/game.js` and `server/naval.js`. Weather timing is authoritative on the server, not just an animation on the client.

### Validation

- 64 automated gameplay/interface/weather tests, all passing.
- Multiplayer WebSocket protocol integration passes.
- Map integrity: 114 provinces, aligned IDs and images.
- Province raster and `shared/map.json` hash match Version 1.24 exactly.
- Enhanced snow/ice asset validation with `python tools/check_winter_assets.py`.
- Desktop-compatible and iPhone-width offline interface smoke checks pass.

## What's new in 1.24

### 60-minute public match and historical end date

- Public games end after **60 real minutes** if nobody reaches the victory thresholds earlier. The highest-ranked playable nation wins at the limit.
- The simulation clock (unchanged in Version 1.25) runs from **October 6, 1939**, precisely to **September 2, 1945**, over 60 real minutes: **2,158 in-game days**, around **1.668211 seconds per in-game day**. The final date is clamped after one hour to prevent drift.
- Seasons use this updated in-game calendar. The 1.25 update adds winter-specific movement rules; economy, country bonuses and victory thresholds remain unchanged.
- Private games retain their existing no-forced-timeout behaviour, although their displayed calendar stops at September 2, 1945 after one hour.

### Better small-country map controls

- On mobile, joining a nation now auto-centers and chooses a zoom based on that nation's complete pixel boundaries rather than applying the same zoom to every nation.
- Starting territory fits within approximately 76% of available map width and 62% of height, with zoom bounded by 2.9× and 9×.
- Small countries such as **Portugal, Hungary and Romania** now open at a substantially more usable scale. Users can still pinch zoom or use the map zoom controls (up to 10×).
- The underlying province IDs, terrain texture, black province border colour and clickable land mask were not altered.

### Timed spy balloon movement and one-border reconnaissance

- A spy balloon now takes **8.5 seconds per province border** to fly to a destination, using a server-authoritative shortest path across the existing province graph. Travel is **not instantaneous**, and it never declares war.
- Balloons reveal only the province they have reached **and its immediate graph neighbours**. A future destination stays classified until it is reached (unless revealed through some other legitimate means).
- Use **Buildings → Spy balloons → Move**, then tap a destination and confirm. You can also tap your balloon marker directly on the map to select a new destination.
- In-flight balloons show an animated marker, remaining time, and path. Use **Redirect** or **Retreat** from the balloon list; in-flight balloons also appear in the **Orders** menu. Redirects and retreats take time rather than teleporting.
- Existing permission checks ensure only the owning nation can issue balloon orders. Allies still share reconnaissance according to established diplomacy rules.

### Treasury visible on iPhone

- Fixed a mobile CSS rule that mistakenly hid the **TREASURY** HUD. It now remains visible on 360px–430px tested iPhone-sized layouts. On smaller screens, the less critical **WORLD RANK** item is hidden from the header to make room; rankings remain accessible through the Rankings menu.
- The treasury display still refreshes only **once every five seconds**, while authoritative income accrues continuously on the server.

## Running locally (Windows, Node.js 22+)

1. Extract the ZIP. `package.json` is **at the ZIP root**.
2. Open PowerShell **in the folder containing `package.json`**.
3. Run `npm run dev` (for development) or `npm start` (for production).
4. Open http://localhost:3000.

The server uses built-in Node.js modules and has no runtime npm package dependencies.

## Tests and quality assurance

Run:

```bash
npm run check
npm test
```

Optional, with Python dependencies installed:

```bash
python tools/check_map_assets.py
python tools/offline_browser_123.py
```

The project has **64 automated gameplay/interface/weather tests**, a multiplayer WebSocket protocol integration test, and mobile-width offline Chromium checks. The new browser check verifies treasury visibility, no header overlap, adaptive zoom in Portugal/Hungary/Romania, and balloon-route rendering. The live-browser runner in this environment could not access localhost, so the browser checks are offline and do not replace testing on a real iPhone.

## Deploying to ww2royale.com

Upload the **contents** of this ZIP into the same paths in your existing GitHub repository, commit the changes, and allow Render to redeploy. Keep Render's start command set to `npm start`. You do not need to change GoDaddy, DNS, or custom-domain settings.

**Important limitation:** Live rooms, nations, money, military orders, War Newspaper events and spy balloons exist only in **server memory**. Redeploying or restarting Render clears active matches. Reconnection does not restore authenticated control of a nation. Do not treat the current release as production hardened until persistent storage, proper reconnect identity, moderation, and load testing are added.
