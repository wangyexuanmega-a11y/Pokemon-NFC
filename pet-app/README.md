# 宝可梦 · NFC 宠物

151 只初代宝可梦（像素动图动画），选择后以**悬浮宠物**出现在手机屏幕上（可拖拽），碰 NFC 手环也能直接唤醒。

- 零依赖、零构建：纯 HTML + CSS + ES Module。
- 素材：`sprites/anim/*.png` 帧图带（由 `POKEMON素材/N.gif` 动图拆帧生成，50~100 帧/只）。
- 步数：App 内硬件计步器累计步数（微信步数无开放接口，硬件计步是同源方案），为进化系统积累数据。

## 目录结构

```
pet-app/
  index.html          页面骨架 + UI（选择界面 / 控制卡片）
  css/style.css       样式（含悬浮窗透明模式）
  sprites/            宝可梦素材（透明 PNG）
  js/nfc.js           NFC 读取（Web NFC / URL 参数）
  js/pet.js           通用 2D 宠物渲染器（图片 + 程序化动画 + 占位回退）
  js/spritesheet.js   精灵图集播放器（备用，等更精细素材）
  js/app.js           接线：选择 → 召唤（悬浮窗/页面内）→ 交互；NFC 唤醒
```

## 三种运行模式

| 模式 | 触发 | 表现 |
|---|---|---|
| 网页模式 | 直接打开页面 | 选择后宠物显示在页面里（GitHub Pages 也用它） |
| App 主界面 | `?native=1` | 选择后原生创建**可拖拽的悬浮宠物窗口** |
| 悬浮窗模式 | `?native=1&overlay=1&buddy=xxx` | 全透明窗口，只画宠物（App 的浮窗 WebView，可拖拽） |

## 高清 / 像素切换

选择界面右上角有「高清版 / 像素版」开关（记住选择）：

- **高清版**：475×475 高清透明图，平滑缩放
- **像素版**：96×96 像素图，最近邻缩放保持锐利

切换后：网页模式立即生效；App 模式会重载悬浮窗应用新素材。

## 在线预览（无需安装）

- **GitHub Pages**（每次推送自动更新）：`https://wangyexuanmega-a11y.github.io/Pokemon-NFC/pet-app/`
- 本地：`npx serve . -p 5174` → `http://localhost:5174/`

## 怎么跑起来

```bash
cd "C:\Users\lenovo\Desktop\暑假项目\Pokemon NFC\pet-app"
npx serve . -p 5174
# 打开 http://localhost:5174/
```

## 添加新宝可梦（预留位已就绪）

1. 放一张**透明 PNG** 到 `pet-app/sprites/`（如 `charmander.png`）
2. 在 `js/app.js` 的 `BUDDIES` 里加一行：

```js
charmander: { name: '小火龙', type: '火系', hd: 'sprites/charmander.png', pixel: 'sprites/pixel/charmander.png' },
```

3. 在 `RESERVED` 数组里删掉对应的占位名即可。App 在线加载，推送后自动生效。

> 本地 `pokemon/` 文件夹是完整宝可梦素材库（PokéAPI sprites 包）：
> - 高清：`pokemon/other/home/<编号>.png`（512×512 官方渲染）
> - 像素：`pokemon/<编号>.png`（96×96）
> - 像素动画：`pokemon/versions/generation-v/black-white/animated/<编号>.gif`

## 做动画需要什么素材（规划）

最简单的方案是**逐帧精灵图**，两种交付格式任选：

1. **精灵图集（推荐）**：一张大图，行 = 动作、列 = 帧，透明底、统一画布。附配置：
   ```js
   { cols: 4, rows: 2, rowsDef: [
     { index: 0, id: 'idle', frames: 4, fps: 6 },   // 待机呼吸
     { index: 1, id: 'spawn', frames: 4, fps: 8 },  // 出场
   ]}
   ```
   （`js/spritesheet.js` 已写好这个播放器，直接可用）
2. **分帧文件**：`idle_0.png / idle_1.png ...`，我这边自动拼成图集。

- 每帧建议 ≥256×256、透明背景、所有帧同一画布尺寸、同一位置
- 最小起步：**待机 2~4 帧**（呼吸/浮动）就够"活"起来
- 你素材库里 `black-white/animated/*.gif` 就是 2 帧像素动画，可以直接解析成帧
- Blender 路线：正交相机摆姿态逐帧渲染透明 PNG（需要时我写导出脚本）

## Android App（悬浮宠物）

见 `../android-app/README.md`。要点：

- 首次召唤会请求「显示在其他应用上层」权限（系统设置页），允许后再次点击即可。
- 召唤后按 Home 键回到桌面，宝可梦就站在桌面上了；点它可以摸摸它。
- 限制：从最近任务划掉 App 会同时收起宠物（后续可加前台服务实现常驻）。

## 路线图

- [ ] 高清精灵图集替换（逐帧动画）
- [ ] 悬浮窗拖动位置
- [ ] 图鉴 / 养成 / 亲密度 / 对话气泡
- [ ] 前台服务：划掉 App 后宠物常驻
