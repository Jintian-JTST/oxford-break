# Oxford Break（炸牛津）

A browser game set in a stylised 3D Oxford built from OpenStreetMap data. Knock down the city from above, fly a helicopter along a route and shoot from its nose gun, or take a fighter jet in low with bombs and a cannon.

**Play:** https://jintian-jtst.github.io/oxford-break/

Oxford Break is modelled on [Campus Break](https://peerlyhk.com/campus-break) by Peerly, which was made for HKU's campus. This Oxford version is an independent remake with its own code, map and art.

## Modes

- **Bombing.** Choose a round of 1, 2, 3 or 5 minutes; the clock starts with your first bomb. There are three weapons: bomb, meteor (sets fires) and nuke. Collapses that follow each other within two seconds raise a combo multiplier, and big collapses can shake their neighbours down.
- **Helicopter.** One 100-second run along a route: City centre, or Science Area & North. The autopilot flies until you take the controls and takes over again three seconds after you let go. Armed dons shoot back, and the gun upgrades from MK I to MK III as your score rises.
- **Fighter jet.** A 1, 2 or 3 minute sortie in a jet that never stops. Bombs keep the jet's speed and land on the ring drawn on the ground ahead; four hang under the wings and reload. Hold the mouse for the cannon. Flying into a roof or the ground ends the sortie.

Buildings that come down burst into debris and dust and are left standing as ruins.

Each mode opens with a short how-to-play booklet. Each game ends on a summary showing your score, time played, collapses, dons, weapons used, and a list of the named buildings you destroyed.

## Controls

| | Bombing | Helicopter | Fighter jet |
|---|---|---|---|
| Mouse / tap | drop the selected weapon | aim; hold to fire | aim; hold for the cannon |
| W / S | pan forward / back | forward / back | climb / dive |
| A / D | pan left / right | turn | bank and turn |
| Q / E | rotate | slide sideways | — |
| R / F | tilt | climb / descend | — |
| Other | 1 2 3 pick weapon · Space drops at centre · wheel or pinch zooms | Shift boost · Space or right-click missile · C cockpit view | Shift afterburner · Space or right-click bomb · C cockpit view |

All modes: L place names · M sound · N music. On a phone, drag and pinch in Bombing, and use the joystick in the helicopter and the jet.

## Build

```
python build.py
```

The build inlines `data/game_data.json` and `src/*.js` into `src/head.html`. It writes two files:
- `docs/index.html`, the standalone page served by GitHub Pages;
- `dist/oxford-break.html`.

It is a single file, loading Three.js r128 from cdnjs. All sound is synthesised with WebAudio, so there are no audio files.

`data/fetch_oxford.py` re-downloads the map from the Overpass API. `node test/run.js <dir>` runs a headless smoke test of both modes (it needs `three@0.128.0`).

Map data © OpenStreetMap contributors, ODbL.
