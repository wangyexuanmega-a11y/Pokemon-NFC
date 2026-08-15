# 宝可梦 · NFC 宠物（H5 原型）

碰一下 NFC 手环，手机屏幕弹出一只 2D 皮卡丘（桌面宠物风格动画）。

- 零依赖、零构建：纯 HTML + CSS + ES Module，不需要 npm install。
- 目前皮卡丘是 **Canvas 程序化绘制**的占位，接口已按「未来替换成精灵图集」设计好。

## 目录结构

```
pet-app/
  index.html          页面骨架 + UI
  css/style.css       样式
  js/nfc.js           NFC 读取（Web NFC / URL 参数 / 模拟）
  js/pikachu.js       程序化 2D 皮卡丘 + 动画状态机（占位）
  js/spritesheet.js   精灵图集播放器（供你后续喂真实素材）
  js/app.js           接线：NFC → 弹宠物 → 交互
```

## 怎么跑起来

### 桌面预览（用「模拟 NFC」按钮）

任何静态服务器都行，例如：

```bash
cd "C:\Users\lenovo\Desktop\暑假项目\Pokemon NFC\pet-app"
npx serve . -p 5174
# 或 python -m http.server 5174
```

打开 `http://localhost:5174/`，点「桌面调试 · 模拟 NFC」即可看到皮卡丘弹出。

### Android 真机 NFC（真正的「碰一下」）

1. 手机和电脑同一局域网，把 `pet-app` 部署到 **HTTPS** 地址（Web NFC 强制要求 HTTPS 或 localhost）。
2. 用 Android Chrome 打开。
3. 手环里写入一条 **NDEF URL 记录**，内容形如：
   `https://你的域名/?buddy=pikachu`
   （用 NFC Tools 之类的 App 写卡；NTAG213/215/216 均可，URL 很短放得下。）
4. 手机碰手环 → 系统弹出「打开链接」→ 页面读取 `?buddy=` 直接唤醒皮卡丘。

> 两种唤醒方式都已支持：
> - **URL 跳转**：`?buddy=xxx`（iOS/Android 通用，最稳）
> - **Web NFC 常驻扫描**：页面内 `NDEFReader` 监听标签（仅 Android Chrome，需用户手势 + HTTPS）

## 后续：把占位皮卡丘换成真实 2D 素材

等你提供 spritesheet（透明 PNG/WebP + 图集配置），三步接入：

1. 把图片放到 `pet-app/sprites/` 下。
2. 在 `js/app.js` 顶部用 `SpriteSheetPlayer` 替换 `PikachuPet`，传入 `imageUrl` + `atlas`。
3. `atlas` 格式（兼容 agent-pet 的 Codex 8×9 图集）：

```js
{
  cols: 8, rows: 9,
  rowsDef: [
    { index: 0, id: 'idle',   frames: 8, fps: 6 },
    { index: 1, id: 'appear', frames: 6, fps: 10 },
    { index: 2, id: 'happy',  frames: 6, fps: 10 },
    { index: 3, id: 'wave',   frames: 4, fps: 8 },
    { index: 4, id: 'leave',  frames: 6, fps: 10 },
  ]
}
```

每行 = 一个动画状态，帧按 `图宽/cols × 图高/rows` 等分取子图。`SpriteSheetPlayer` 已实现 `appear/happy/wave/dismiss/tick/draw`，和当前接口一致。

> 关于 **Blender 渲染 2D 帧**：你现有的 `../models/pikachu.glb` 可以在 Blender 里摆好「待机/跑步/跳跃/挥手」等姿态，用正交相机逐姿态渲染成透明 PNG，再拼成上面的图集——这是把你 3D 资产价值最大化的路线。需要时我可以帮你写导出/拼图脚本。

## 路线图（后续慢慢加）

- [ ] 多宝可梦图鉴（`BUDDIES` 已预留多只）
- [ ] 养成：喂食 / 心情值 / 亲密度
- [ ] 对话气泡
- [ ] 交换 / 对战（云端同步）
- [ ] PWA（添加到主屏幕）
- [ ] AR 模式（复用 3D 模型做彩蛋）
