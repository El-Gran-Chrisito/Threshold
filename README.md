# Threshold

Design every part of a home in the browser: floor plan, walls, doors, windows, furniture, finishes, floors, lighting and roof. See it in 3D, pull it apart in an exploded view, or walk through it.

## Selling it

Threshold ships ready to sell. Setup takes about an hour: see [docs/MONETIZATION.md](docs/MONETIZATION.md), then run `bun run launch-check --live`.

| Part | What it does |
| --- | --- |
| Plans | Free, Pro and Studio, monthly or yearly; a one-time 6-month Build Pass; a 7-day trial of Pro (or Studio, for people who design for clients) |
| Paid features | PDF plan set, clean and high-resolution exports, 3D model, shopping spreadsheet, electrical layout, design assistant, all styles and surroundings, the full plan library, design versions, design sync; Studio branding, presentations and client links |
| License keys | Signed keys checked offline; emailed after purchase; "Email me my key" recovery; renewals while a subscription is paid |
| License server | Stripe checkout to key, renewals, design sync, hosted design assistant, signed trials, invites with Stripe balance credit, "Email me this design" with an opt-in tips list, refund and dispute revocation, daily stats (`bun run stats`) |
| Growth | Marketing page with pricing, sample plan set, FAQ and search data; public pages for every ready-made home (`/plans/`); share and client links; invite links; store links on the shopping list (affiliate-ready) |
| Legal | Terms, privacy and refund page templates |

## Run

```bash
bun install
bun run dev          # local dev server
bun run test         # model, assistant and design-check tests
bun run build        # static site in dist/
bun run build:single # one self-contained HTML file in dist-single/
bun run license init # create license signing keys (once; see docs/MONETIZATION.md)
bun run launch-check # before going live: checks every selling setting (--live also calls the license server)
bun run stats        # daily trials, purchases, invites and more from the license server (needs ADMIN_TOKEN)
```

`scripts/*.mjs` drive the built app in headless Chromium (Playwright) for end-to-end checks and screenshots.

## What it does

| Area | Features |
| --- | --- |
| Start | Example home, templates, a plan library of ready-made styled homes (2 free, 8 with Pro), or a furnished plan made from your needs (bedrooms, bathrooms, one or two floors, garage, office, open plan) that passes the design check |
| Plan (2D) | Rectangle and free-shape rooms, floor-only areas (patios, decks, lawns), walls with typed lengths and chosen thickness, shared walls, closed wall loops become rooms, doors / double doors / sliders / archways / garage doors / windows, snapping (grid, corners, alignment guides, 15° angles), drag / resize / rotate handles, add corners to room edges, click a dimension to edit it, click a room's name, area or size on the plan to type a new one, measure, text labels, multi-select with align and distribute, right-click and long-press quick actions, tracing image with scale calibration |
| Furniture | 103 parametric items in 12 categories (living, bedroom, dining, kitchen, bath, office, laundry, lighting, electrical, decor, outdoor, structure); auto-backs onto walls; any size, two colours, mirror, lock, swap; one-click kitchen cabinet runs |
| Finishes | Six whole-home styles (modern farmhouse, Scandinavian, mid-century, industrial, coastal, traditional) in one click; nine wall finishes per wall side (paint, wallpaper, tile, wood, brick, stone, siding, shingle, concrete), 18 floor finishes with real-scale textures and pattern direction, ceilings, trim and baseboards, door and window styles, exterior and roof colour |
| Levels | Multiple floors, basement, straight, L-shaped and U-shaped stairs with matching openings cut through the floor above, flat / gable / hip / shed roofs with pitch, overhang and covering (asphalt shingle, standing-seam metal, clay tile, slate, membrane); gable ends take the wall cladding |
| 3D | Orbit view with inside and outside presets, views from top and each compass side, section cut front-to-back or side-to-side, exploded view with layer tags and show/hide for roof, walls, floors and furniture, low walls, sun by time of day, night lighting from lamps, click to select, click to paint, drag furniture, double-click to focus, Fast 3D mode for slower devices |
| Walk | First-person walk-through with wall collision, open doors, mini-map with position and heading |
| Assistant | Plain-language requests or a photo of a floor plan become undoable edits (inside Claude through the viewer's Claude; on a hosted site through the license server and the Claude API) |
| Surroundings | Painted sky with sun, moon, drifting clouds, sunset colours and stars; rolling ground that fades into hazy hills; four settings: suburban street (road, sidewalks, kerbs, street trees and lamps, neighbours' houses, parked cars), private garden (hedges and trees), countryside (fields, gravel lane, fences, woods) or plain ground. Driveways run from garage doors, a path from the front door, planting beds with shrubs and flowers line the walls, and trees fill the yard, all laid out from the design. Street-level view from across the road; street lamps and neighbours' windows light up after dark; sky reflections on glass and metal |
| Site | Lot with property lines and front, side and rear setbacks on the plan, the plan sheet and in 3D; ground colour; north direction |
| Electrical | One click per room or per floor: ceiling lights on a grid, a switch on the latch side of each doorway, outlets no more than 12 ft apart, smoke alarms in bedrooms, halls and entries; standard plan symbols; show or hide on the plan |
| Checks and cost | Design check (rooms without doors, bedrooms without windows, overlaps, blocked doors, walls past the property line or inside a setback); live cost estimate by flooring, walls and finishes, openings and furniture, with editable prices; shopping list (paint cans, flooring and finishes with waste, baseboard, doors, windows, furniture) as CSV or text |
| Files | Autosave to the browser, to the viewer's account inside Claude, and to the license server on Pro and Studio (designs on every device); several designs; duplicate; save and open design files; PDF plan set (cover, 3D views, every floor plan, room schedule, cost estimate, shopping list); floor-plan PNG sheet; 3D image; 3D model (.glb); share links that hold the whole design; Studio client links that open as a branded 3D tour |
| Access | Feet-and-inches or metres, reading-comfort settings (larger text, extra spacing, Lexend or Atkinson Hyperlegible font), light and dark themes, phone layout; installable, works offline once opened |

All lengths are stored in centimetres; the UI accepts `12' 6"`, `12-6`, `6 1/2"`, `3.5m`, `350cm` and plain numbers.

## Layout

```text
src/model      data model, geometry, editing operations, catalog, materials, templates, budget, design checks
src/store      app state with undo/redo, browser and account persistence, file saving, tracing image
src/plan       2D editor (SVG), symbols, snapping, context menu, plan export
src/three      3D scene (react-three-fiber), procedural furniture and textures, walk mode, exploded view, glTF export
src/assistant  design assistant prompt and action executor
src/ui         panels, inspector, controls, upgrade sheet, presentation mode
src/product    plans, license keys, entitlements, gates, branding, funnel events
src/landing    marketing page (home.html)
server         license server (Stripe checkout -> license key, renewals, key emails, design sync, hosted assistant)
docs           selling setup guide
```
