# 《三清观》美术 / 3D / 音效资产提示词

> **重要**：本文件只是提示词，**本次没有执行任何 AI 生图、3D 生成或付费 API 调用**。
> 当前 v1.0 的人物、场景、贴图、音效全部由 Three.js 程序化几何 + Canvas 绘制 + Web Audio 实时合成生成，
> 零额度消耗、可离线运行。若后续要把画面升级成商业级高模，按下面提示词生成资产，
> **需先确认额度消耗后再执行**，生成完把文件放进对应挂载点即可，代码不用改。

---

## 0. 资产挂载点（代码里已经留好）

| 资产 | 目标路径 | 加载方式 | 当前替代实现 |
|---|---|---|---|
| 小道童模型 | `public/models/daotong.glb` | `avatar.js → loadAvatarGLTF()` | LatheGeometry + Sphere 组合 |
| 三清神像 | `public/models/sanqing.glb` | `scene.js → loadDeityGLTF()` | 3 组程序化坐像 |
| 大殿建筑 | `public/models/hall.glb` | `scene.js → loadHallGLTF()` | 柱 / 枋 / 斗拱 / 屋顶程序化拼装 |
| 青砖地面 | `public/textures/brick.png` | `fx.js → TEX.brick` | Canvas 程序生成 |
| 木纹 / 瓦纹 | `public/textures/wood.png` / `tile.png` | `fx.js` | Canvas 程序生成 |
| 黄纸符纸 | `public/textures/talisman-paper.png` | `talisman.js` | Canvas 程序生成 |
| 匾额 / 楹联 / 幡 | `public/textures/*.png` | `fx.js` | Canvas 中文绘制 |
| 清静经诵经音轨 | `public/audio/qingjingjing.mp3` | `audio.js` 优先加载 | Web Audio 合成道乐 |
| 磬 / 木鱼 / 风声 | `public/audio/*.wav` | `audio.js` 可选 | Web Audio 合成 |

> 规则：文件存在就用文件，不存在自动回落程序化版本，不报错、不白屏。

---

## 1. Q 版小道童（角色）

> **硬性（用户 2026-11-12 追加）：形象要卡通 Q 版幼态，不要成熟写实。**
> 三头身、大头小身、圆脸、点状圆眼、淡淡腮红、短手短脚；
> **禁止**：成人头身比、写实五官（鼻梁/唇形/细长眼）、成熟眉眼、肌肉线条、
> 写实皮肤质感、真实布料褶皱、成人化身形曲线。
> 道士与道姑只靠「发髻/冠巾/裙裾/配色/小配饰」区分，可爱度保持一致。

**中文提示词（3D 模型 / 三视图）— 道士**
```
Q 版卡通中国小道士，三头身幼态，超大圆脑袋、短小身体与短手短脚，
皮肤暖白，圆点黑眼睛，两团淡粉腮红，无鼻梁无嘴唇，表情安静呆萌；
黑发梳一个圆圆的小发髻，横插一支素木簪；
身穿交领右衽小道袍，下摆蓬松，配色玄青 / 月白 / 赭黄 / 苍绿 / 墨蓝 / 檀褐，
腰间一根布带，脚穿圆头黑布鞋；整体圆润无锐角，像软胶玩偶。
中式国风 Q 版低多边形卡通，干净拓扑，适合实时渲染。
输出：正面 / 侧面 / 背面三视图 + T-pose，正交视角，纯色背景，无阴影，无文字。
```

**中文提示词（3D 模型 / 三视图）— 道姑**
```
Q 版卡通中国小道姑，三头身幼态，与上面的小道士同一套可爱比例与圆润造型，
超大圆脑袋、短手短脚、圆点眼、淡粉腮红、无成熟五官；
黑发梳双环丫髻或戴一顶小莲花冠，两侧留两缕圆润鬓发，可别一支小玉簪；
身穿对襟小道袍配及膝裙裾，配色藕荷 / 月白 / 霜色 / 杏黄 / 黛紫 / 苍绿，
袖口圆鼓鼓，腰间细布带，圆头布鞋；不画腰身曲线，不画成人比例。
中式国风 Q 版低多边形卡通，与小道士成套，干净拓扑。
输出：正面 / 侧面 / 背面三视图 + T-pose，正交视角，纯色背景，无阴影，无文字。
```

**English prompt**
```
Chibi cartoon Chinese Taoist child novice, super-deformed 3-head-tall toddler proportions,
oversized round head, tiny short body and stubby limbs, warm pale skin,
simple round dot eyes, soft pink cheek blush, NO nose bridge, NO lips, NO mature brows,
calm cute blank expression. Boy version (daoshi): single round topknot with a plain wooden pin.
Girl version (daogu): twin loop buns or a small lotus crown, two rounded side locks, tiny jade pin.
Boy wears a cross-collar short daopao; girl wears a front-opening robe with a knee-length skirt.
Palette: dark indigo / moon white / ochre / sage green / lotus pink / pale violet.
Soft rounded vinyl-toy forms, no sharp edges, NO realistic anatomy, NO adult proportions,
NO realistic fabric wrinkles. Chinese guofeng low-poly cartoon, clean topology, game-ready.
Deliver front / side / back orthographic turnaround and T-pose, flat background,
no shadows, no text, no logo.
```

**动画清单（若做 GLTF，需带这些 clip）**：`idle_breathe`、`walk`、`sit_lotus`、`bow_kowtow`、`palms_together`、`write_talisman`、`chant_nod`。当前程序化版本用 lerp 姿态插值实现同名状态。

---

## 2. 三清神像（三尊）

```
中式道观三清殿主尊造像，三尊并列端坐于莲云台，居中玉清元始天尊（白玉金身，
手持混元宝珠）、左位上清灵宝天尊（青金配色，捧玉圭如意）、右位太清道德天尊
（紫金配色，执太极蒲扇，白须）；皆头戴莲花冠，面容慈穆、垂目，宽袖道袍层叠，
衣纹流畅；身后各一轮金色背光与云纹光晕；整体庄严静穆、不威吓、不奇幻化。
唐代造像的圆润 + 明代宫廷彩塑的用色，哑光金与矿物颜料质感，柔和暖光。
```
**English**
```
Three seated Taoist supreme deities in a Chinese temple hall, centered Yuanshi Tianzun
(white-jade gold body, holding a chaos pearl), left Lingbao Tianzun (celadon and gold,
holding a jade gui tablet), right Daode Tianzun (purple and gold, white beard, holding a
taiji fan). Lotus crowns, downcast compassionate eyes, layered wide-sleeve robes, flowing drapery.
Each with a golden halo and cloud-pattern backlight. Tang-dynasty roundness, Ming polychrome
palette, matte gold and mineral pigment, soft warm lighting. Dignified, calm, not fierce,
not fantasy. Front three-quarter view, neutral background, no text.
```

---

## 3. 大殿建筑与场景

```
夜色中的中国传统道观三清殿，重檐歇山顶，灰瓦，正脊鸱吻，朱红木柱十二根，
柱头斗拱层叠，殿内藻井绘太极八卦，梁枋彩画青绿；殿前青砖月台与三级台阶，
汉白玉栏杆；殿门高悬黑底金字「三清殿」匾额，两侧竖挂楹联与云纹幡幢；
殿内供桌、铜香炉升三缕青烟、一对红烛摇曳；地面整齐铺 108 个深红蒲团；
远景层叠青山、松柏、流云与一轮满月，薄雾缭绕，星点稀疏。
色调：玄青夜色为底，暖金烛光与朱红为点缀，低饱和，安静克制；
光影：柔和体积光从殿内溢出，月光冷调补光，无强烈对比，无霓虹、无赛博元素。
构图：正面略仰视，殿堂居中对称，留出前景蒲团阵列的纵深感。
```
**English**
```
A traditional Chinese Taoist Sanqing Hall at night, double-eaved xieshan roof, grey tiles,
chiwen ridge ornaments, twelve vermilion timber columns, layered dougong brackets,
taiji-bagua painted caisson ceiling, Qing-green beam paintings. Blue-brick terrace with three
steps and white marble balustrade. Black lacquer plaque with gold characters, vertical couplets
and cloud-pattern banners. Inside: offertory table, bronze incense burner with three thin smoke
plumes, two flickering red candles, 108 dark-red meditation cushions in neat rows.
Background: layered mountains, pines, drifting mist, a full moon, sparse stars.
Palette: deep indigo night base, warm gold candlelight and vermilion accents, low saturation,
quiet and restrained, volumetric spill light, cool moonlight fill, NO neon, NO cyberpunk.
Symmetrical frontal slightly low-angle composition with strong foreground depth.
```

---

## 4. 贴图（Tileable / 2D）

| 资产 | 提示词 |
|---|---|
| 青砖地面 | `seamless tileable Chinese blue-grey brick floor texture, subtle worn edges, faint moss in joints, matte, top-down, 2k, no perspective, no text` |
| 朱漆木纹 | `seamless tileable vermilion lacquered Chinese temple timber texture, fine vertical grain, slight age cracking, matte-satin, 2k, no knots, no text` |
| 灰瓦 | `seamless tileable Chinese grey clay roof tile texture, repeating curved barrel tiles, weathered, top-down, 2k, no text` |
| 黄纸符纸 | `aged yellow Taoist talisman paper texture, fibrous mulberry paper, faint speckles and deckled edge, warm ochre, flat scan, 2k, no text, no symbols` |
| 云纹幡 | `vertical Chinese Taoist ceremonial banner, indigo silk with gold ruyi cloud pattern and subtle brocade sheen, straight-on, no text` |
| 太极藻井 | `Chinese Taoist caisson ceiling, central taiji yin-yang surrounded by eight trigrams, gold on deep blue, symmetrical, flat top-down, no text` |

---

## 5. 音频（若后续要真人诵经 / 实录）

```
《太上老君说常清静经》全文诵经，中文，男声或女声齐诵（道众齐唱风格），
语速舒缓均匀，无配乐或极轻的木鱼与引磬打点，混响为中型殿堂自然尾音，
不加电子鼓点、不加流行编曲、不加人声和声堆叠；整轨无缝循环，
起始与结尾做淡入淡出以便 loop；44.1kHz / 立体声 / 统一响度。
```
**English**
```
Full recitation of the Taoist "Chang Qingjing Jing" in Mandarin Chinese,
monastic group chanting, slow even pacing, unaccompanied or with very light wooden fish
and a single bronze qing strike as punctuation, natural medium-hall reverb,
NO electronic beats, NO pop arrangement, NO layered vocal harmonies.
Seamless-loop ready with fades at head and tail, 44.1 kHz stereo, consistent loudness.
```

**单个音效**：`bronze qing bowl strike, long decay, clean recording` / `wooden fish (muyu) single knock, dry` / `soft mountain wind and distant stream, 60s loop` / `small handbell, single ring`。

> **授权提醒**：诵经录音、道乐、字体、模型都可能带版权。上线前用自有录音、CC0 / 商用授权素材，或继续用本项目的程序化合成版本。本项目不会自动下载或引用任何第三方音频。

---

## 6. 明确不做的事

- 不调用 AI 生图 / 文生 3D / 商业配音（消耗额度，须先征得同意）
- 不抓取原站 `sansatemple.com` 的模型、贴图、音频、代码
- 不使用任何外部 CDN 资源（Three.js 已存本地 `public/vendor/`）
- 不编造宗教功效、不做占卜算命、不接支付
