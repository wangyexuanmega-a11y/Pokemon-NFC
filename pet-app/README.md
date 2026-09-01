# 宝可梦 · NFC 宠物

选择一只宝可梦 → 它以**悬浮宠物**出现在手机屏幕上（像真的站在屏幕里），碰 NFC 手环也能直接唤醒。

- 零依赖、零构建：纯 HTML + CSS + ES Module。
- 素材：透明 PNG 图片 + 程序化待机动画（浮动/呼吸/摇摆/地面阴影/粒子特效）。

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
| App 主界面 | `?native=1` | 选择后原生创建**悬浮宠物窗口** |
| 悬浮窗模式 | `?native=1&overlay=1&buddy=xxx` | 全透明窗口，只画宠物（App 的浮窗 WebView） |

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
charmander: { name: '小火龙', type: '火系', image: 'sprites/charmander.png' },
```

3. 在 `RESERVED` 数组里删掉对应的占位名即可。Android App 需重新构建（推 GitHub 自动构建）。

> 图片建议：透明背景、主体居中、至少 256×256（现在是 96×96，屏幕放大会偏软）。
> 想换皮卡丘等其他宝可梦同理，PNG + 一行目录。

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
