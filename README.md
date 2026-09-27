# Threshold

Design every part of a home in the browser: floor plan, walls, doors, windows, furniture, finishes, floors and roof. See it in 3D, pull it apart in an exploded view, or walk through it.

## Run

```bash
bun install
bun run dev          # local dev server
bun run test         # model tests
bun run build        # static site in dist/
bun run build:single # one self-contained HTML file in dist-single/
```

## What it does

| Area | Features |
| --- | --- |
| Plan (2D) | Rectangle and free-shape rooms, walls with typed lengths, shared walls, doors/windows/sliders/archways/garage doors, snapping (grid, corners, alignment guides, 15° angles), drag/resize/rotate handles, measure, text labels, auto-detect rooms from walls |
| Furniture | 80 parametric items in 11 categories, auto-backs onto walls, any size, two colours each, mirror, lock, swap, copy/paste |
| Finishes | Paint per wall side or per room, 18 floor finishes with real-scale textures, ceilings, exterior colour, roof colour |
| Levels | Multiple floors, basement, stair openings cut through floors, flat/gable/hip/shed roofs with pitch and overhang |
| 3D | Orbit view, inside (cutaway) and outside views, exploded view, low-wall view, sun position by time of day, click-to-select and click-to-paint |
| Walk | First-person walk-through with wall collision; doors are passable |
| Budget | Live cost estimate: flooring, walls and paint, doors and windows, furniture; editable prices |
| Files | Autosave in the browser, several designs, save/open design files, save 3D image |

All lengths are stored in centimetres; the UI shows feet-and-inches or metres and accepts inputs such as `12' 6"`, `12-6`, `3.5m`, `350cm`.
