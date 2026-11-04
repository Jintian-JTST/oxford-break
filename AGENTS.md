# Oxford Break (炸牛津)
Peerly "Campus Break" 的牛津版：单文件 Three.js r128 网页游戏，数据来自 OpenStreetMap（Overpass），风格化渲染。
用户（Jintian，Oxford MPhys）回复用中文；公式用 LaTeX；少排比、不写防御性免责句；直接给结论。

## 构建
`python3 build.py` → `dist/oxford-break.html`（把 data/game_data.json 和 src/world.js+labels.js+play.js 内联进 src/head.html）。
外部脚本只允许 cdnjs（three r128）和 Google Fonts CSS。已发布为 Codex Artifact（第 6 版）。
build.py 同时生成 `docs/index.html`（带 doctype 的独立网页）→ GitHub Pages：仓库 Jintian-JTST/oxford-break（公开），Pages 源 main /docs，网址 https://jintian-jtst.github.io/oxford-break/ 。更新流程：build → commit → push。gh 在 `D:\Program Files\GitHub CLI\gh.exe`（不在 bash PATH）。CLAUDE.md、dist/ 不入库。

## 结构
- src/head.html：CSS、HUD、小地图、`/*DATA*/` `/*GAME*/` 占位符
- src/world.js：渲染器/灯光/阴影、Chunks 合并几何、`triFace`（保证绕序）、建筑（`addBuilding`、`LM` 地标表、`ridgeRoof` 双坡/四坡、距离场屋顶、穹顶/尖塔/烟囱）、地面层、树（instanced）
- src/labels.js：地标标签（`COLLEGE_NOTE` 按 D.l 学院位置、`BUILDING_NOTE` 按建筑名；只标表里有的名字），L 键开关
- src/play.js：buildAll、小地图、音效、武器表 `WEAPONS`（bomb/meteor 燃烧/nuke，各自冷却、`fall` 衰减）、破坏/倒塌/火（`fxQ` 限制大爆炸的碎块）、camera 与输入、主循环（视角跟随阴影框）；无回合计时，只有 combo；滚轮：ctrl=捏合缩放，小增量/横向=触控板平移，shift/alt+双指=旋转，Safari gesture 事件=旋转
- data/game_data.json：`s` 尺寸，`b` 建筑 `[环dm, 2×高m, 类型K='crsuo', 名称|0, 洞|0, extras?{s,c,m,w,wc}]`，`t` 树，`w` 水 `[外环, 洞?]`，`r` 河，`g` 绿地，`d` 道路（类别 0=rail,1..15=motorway…steps），`c` 市中心(Carfax) m，`x` 裁掉的矩形 m（镜头进不去、小地图涂黑）
- data/fetch_oxford.py：Overpass 抓取并直接写 game_data.json；原始缓存 data/raw/（不入库，删掉才会重下）；过滤地下建筑（location=underground、layer<0 且无 roof:*、building=tunnel 等）和 tunnel 道路；`CROP`/`CUT` 控制范围，当前裁掉东北角（Cherwell 以东、Headington Rd 以北）
- test/run.js：node 无头测试（需 `npm i three@0.128.0`，改脚本里的 S 路径），桩化 WebGLRenderer

## 坐标
x=(lon-LON0)*KX，z=-(lat-LAT0)*KZ（北为 -z），米，原点为 bbox 中心；bbox S 51.7465 W -1.2745 N 51.7785 E -1.2050。

## 现状 / 待办
- 屋顶：地标手工配置，普通建筑按 OSM 标注 + 类型/位置配色；约 115 万顶点（手机可能偏重）
- 缺 Carfax Tower、Tom Tower、Magdalen Tower 轮廓（OSM 里无独立多边形）
- 只做过无头测试，视觉效果以用户截图为准
- 用户后续还会改玩法/界面
