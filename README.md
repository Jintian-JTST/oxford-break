# Oxford Break（炸牛津）

A small browser game: drop bombs on a stylised 3D Oxford built from OpenStreetMap data. 60 seconds per round, chain collapses for a combo multiplier.

**Play:** https://jintian-jtst.github.io/oxford-break/ (GitHub Pages, served from `docs/`)

Controls: click/tap to drop · drag to pan · wheel/pinch to zoom · right-drag, Q/E, R/F or two-finger twist to rotate and tilt · Space drops at screen centre · click the minimap to jump.

## Build

```
python build.py
```

Inlines `data/game_data.json` and `src/*.js` into `src/head.html`, writing `docs/index.html` (standalone page) and `dist/oxford-break.html`. Single file, Three.js r128 from cdnjs.

`data/fetch_oxford.py` re-downloads the map from the Overpass API.

Map data © OpenStreetMap contributors, ODbL.
