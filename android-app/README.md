# 宝可梦 NFC 宠物 —— Android App

原生 Android 壳（Kotlin + WebView）。主界面是**宝可梦选择界面**，选择后以**悬浮宠物窗口**出现在屏幕上（像真的站在手机屏幕里）；NFC 手环碰一下也能直接唤醒。

## 工作原理

```
App 主界面（选择宝可梦 / NFC 碰手环）
   │
   ▼
H5 summon(buddy) → JS 桥接 PetBridge.summon(id)
   │
   ▼
原生创建透明悬浮窗（TYPE_APPLICATION_OVERLAY）
  加载 overlay 模式 H5（?native=1&overlay=1&buddy=xxx）
   │
   ▼
宠物站在桌面上（透明背景 + 地面阴影 + 待机动画）
   · 点宠物 = 摸摸它（跳 + 爱心）
   · App 控制卡可 摸摸它 / 打招呼 / 收起宠物 / 换一只
```

## 获取 APK（两种方式）

### 方式一：GitHub Actions 云构建（推荐，无需本地环境）

1. 代码推送到 GitHub 后，进入仓库 **Actions** 标签页
2. 找到 **Build APK** workflow，等它跑完
3. 点进运行记录 → **Artifacts** → 下载 `pokemon-nfc-pet-apk`
4. 解压得到 `app-debug.apk`，传到手机安装（允许「未知来源」）

> 想重新构建：Actions 页面点 **Build APK → Run workflow**。

### 方式二：本地 Android Studio

1. 安装 [Android Studio](https://developer.android.com/studio)
2. 打开本目录（`android-app/`），等待 Gradle 同步
3. 手机开 USB 调试连电脑，点 ▶ Run

## 使用说明

- **首次召唤**：会跳到系统设置让你允许「显示在其他应用上层」权限 → 返回 App 再点一次宝可梦。
- **回到桌面看宠物**：召唤后按 Home 键，宝可梦就站在桌面上了；点它可以摸摸它。
- **换一只**：打开 App → 换一只 → 点新的宝可梦（悬浮窗会替换）。
- **收起**：App 控制卡点「收起宠物」。
- **限制**：从最近任务划掉 App 会同时收起宠物（后续可加前台服务常驻）。

## 手环标签怎么写

用 NFC Tools 之类 App 往手环里写一条 **NDEF URL 记录**（任选其一）：

```
https://example.com/?buddy=bulbasaur    ← URL 记录（推荐，App 会解析 ?buddy=）
bulbasaur                                ← 纯文本记录（整段文本作为宝可梦 ID）
```

已上线：`bulbasaur` / `ivysaur` / `venusaur`（妙蛙种子 / 妙蛙草 / 妙蛙花）。

## 添加新宝可梦

1. 放透明 PNG 到 `../pet-app/sprites/`（如 `charmander.png`）
2. `../pet-app/js/app.js` 的 `BUDDIES` 加一行，`RESERVED` 删掉对应占位
3. 重新复制资源（见下）→ 推送 GitHub 自动构建

## 开发备忘

- H5 资源在 `app/src/main/assets/www/`（从 `../pet-app/` 复制而来）。**改了 pet-app 后重新复制**：
  ```powershell
  $d = app/src/main/assets/www; Remove-Item $d -Recurse -Force
  Copy-Item ../pet-app/index.html $d; Copy-Item ../pet-app/css $d -Recurse
  Copy-Item ../pet-app/js $d -Recurse; Copy-Item ../pet-app/sprites $d -Recurse
  ```
- 页面 URL 参数：`?native=1`（App 主界面）/ `?native=1&overlay=1&buddy=xxx`（悬浮窗）。
- JS → 原生桥接：`PetBridge.summon/pet/wave/dismiss`（见 `MainActivity.kt`）。
- 原生 → 页面：`window.__petNfc(buddyId)`（NFC 唤醒）。

## 后续计划

- [ ] 前台服务：划掉 App 后宠物常驻桌面
- [ ] 悬浮窗可拖动位置
- [ ] 高清精灵图集替换（逐帧动画）
- [ ] 图鉴 / 养成 / 亲密度
