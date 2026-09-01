# 宝可梦 NFC 宠物 —— Android App

原生 Android 壳（Kotlin + WebView），加载 `pet-app` 的 H5 皮卡丘渲染，原生代码负责 NFC 读取。

## 工作原理

```
手机碰手环（NDEF 标签）
   │
   ├─ App 已打开 → NFC 前台调度 onNewIntent
   └─ App 未打开 → 系统唤起 MainActivity（NDEF_DISCOVERED）
   │
   ▼
解析 NDEF → buddy id（URL 的 ?buddy=xxx 或纯文本）
   │
   ▼
evaluateJavascript("window.__petNfc('pikachu')")
   │
   ▼
H5 页面播放皮卡丘出场动画（出现 / 待机 / 开心 / 挥手 / 收起）
```

## 获取 APK（两种方式）

### 方式一：GitHub Actions 云构建（推荐，无需本地环境）

1. 代码推送到 GitHub 后，进入仓库 **Actions** 标签页
2. 找到 **Build APK** workflow，等它跑完（首次约 5~10 分钟）
3. 点进运行记录 → 底部 **Artifacts** → 下载 `pokemon-nfc-pet-apk`
4. 解压得到 `app-debug.apk`，传到手机安装（允许「未知来源」）

> 如果 Actions 没有自动运行：仓库 **Settings → Actions → General**，把 Actions 权限设为允许。
> 想重新构建：Actions 页面点 **Build APK → Run workflow**。

### 方式二：本地 Android Studio

1. 安装 [Android Studio](https://developer.android.com/studio)（含 JDK + SDK）
2. 打开本目录（`android-app/`），等待 Gradle 同步完成
3. 手机开 USB 调试连电脑，点 ▶ Run；或菜单 **Build → Build APK(s)**

## 手环标签怎么写

用 NFC Tools 之类 App 往手环里写一条 **NDEF URL 记录**（任选其一）：

```
https://example.com/?buddy=pikachu      ← URL 记录（推荐，App 会解析 ?buddy=）
pikachu                                  ← 纯文本记录（整段文本作为宝可梦 ID）
```

已预留：`pikachu` / `bulbasaur` / `charmander` / `squirtle`（后三个暂时复用皮卡丘形象，等素材接入后各自显示）。

## 测试

- 没有手环也能测试：App 里点「桌面调试 · 模拟 NFC」按钮，皮卡丘直接弹出。
- 打开 App 碰手环：前台调度直接响应。
- 关闭 App 碰手环：系统唤起 App 并弹宠物。

## 开发备忘

- H5 资源在 `app/src/main/assets/www/`（从 `../pet-app/` 复制而来）。
  **改了 pet-app 后记得重新复制**：
  ```powershell
  Copy-Item ../pet-app/index.html app/src/main/assets/www/
  Copy-Item ../pet-app/css app/src/main/assets/www/ -Recurse
  Copy-Item ../pet-app/js app/src/main/assets/www/ -Recurse
  ```
- 页面通过 URL `?native=1` 识别 App 环境（跳过 Web NFC，走原生桥接）。
- 原生 → 页面桥接入口：`window.__petNfc(buddyId)`（见 `MainActivity.kt`）。

## 后续计划

- [ ] 悬浮窗模式：碰一下在任何 App 上弹出皮卡丘（需 SYSTEM_ALERT_WINDOW + 前台服务）
- [ ] 真精灵图集替换程序化皮卡丘
- [ ] 图鉴 / 养成 / 亲密度
