# Threshold

Design every part of a home in the browser: floor plan, walls, doors, windows, furniture, finishes, floors, lighting and roof. See it in 3D, pull it apart in an exploded view, or walk through it.

## Run

```bash
bun install
bun run dev          # local dev server
bun run test         # model, assistant and design-check tests
bun run build        # static site in dist/
bun run build:single # one self-contained HTML file in dist-single/
```

`scripts/*.mjs` drive the built app in headless Chromium (Playwright) for end-to-end checks and screenshots.

## What it does

| Area | Features |
| --- | --- |
| Start | Example home, templates, or a furnished plan made from your needs (bedrooms, bathrooms, one or two floors, garage, office, open plan) that passes the design check |
| Plan (2D) | Rectangle and free-shape rooms, floor-only areas (patios, decks, lawns), walls with typed lengths and chosen thickness, shared walls, closed wall loops become rooms, doors / double doors / sliders / archways / garage doors / windows, snapping (grid, corners, alignment guides, 15° angles), drag / resize / rotate handles, add corners to room edges, click a dimension to edit it, measure, text labels, multi-select with align and distribute, right-click and long-press quick actions, tracing image with scale calibration |
| Furniture | 99 parametric items in 12 categories (living, bedroom, dining, kitchen, bath, office, laundry, lighting, electrical, decor, outdoor, structure); auto-backs onto walls; any size, two colours, mirror, lock, swap; one-click kitchen cabinet runs |
| Finishes | Six whole-home styles (modern farmhouse, Scandinavian, mid-century, industrial, coastal, traditional) in one click; nine wall finishes per wall side (paint, wallpaper, tile, wood, brick, stone, siding, shingle, concrete), 18 floor finishes with real-scale textures and pattern direction, ceilings, trim and baseboards, door and window styles, exterior and roof colour |
| Levels | Multiple floors, basement, stair openings cut through floors, flat / gable / hip / shed roofs with pitch, overhang and covering (asphalt shingle, standing-seam metal, clay tile, slate, membrane); gable ends take the wall cladding |
| 3D | Orbit view with inside and outside presets, views from top and each compass side, exploded view with layer tags and show/hide for roof, walls, floors and furniture, low walls, sun by time of day, night lighting from lamps, click to select, click to paint, drag furniture, double-click to focus, Fast 3D mode for slower devices |
| Walk | First-person walk-through with wall collision, open doors, mini-map with position and heading |
| Assistant | Plain-language requests or a photo of a floor plan become undoable edits (inside Claude, via the artifact `sample` capability) |
| Checks and cost | Design check (rooms without doors, bedrooms without windows, overlaps, blocked doors); live cost estimate by flooring, walls and finishes, openings and furniture, with editable prices; shopping list (paint cans, flooring and finishes with waste, baseboard, doors, windows, furniture) as CSV or text |
| Files | Autosave to the browser and, inside Claude, to the viewer's account; several designs; duplicate; save and open design files; floor-plan PNG sheet; 3D image; 3D model (.glb) |
| Access | Feet-and-inches or metres, reading-comfort settings (larger text, extra spacing, Lexend or Atkinson Hyperlegible font), light and dark themes, phone layout |

All lengths are stored in centimetres; the UI accepts `12' 6"`, `12-6`, `6 1/2"`, `3.5m`, `350cm` and plain numbers.

## Layout

```text
src/model      data model, geometry, editing operations, catalog, materials, templates, budget, design checks
src/store      app state with undo/redo, browser and account persistence, file saving, tracing image
src/plan       2D editor (SVG), symbols, snapping, context menu, plan export
src/three      3D scene (react-three-fiber), procedural furniture and textures, walk mode, exploded view, glTF export
src/assistant  design assistant prompt and action executor
src/ui         panels, inspector and controls
```
