# 发布流程（Release Guide）

AI Image Studio 使用 **GitHub Actions + GitHub Release** 自动化发布三种平台的安装包。以下是完整流程与约定。

## 1. 版本号规则（SemVer）

格式：`主版本.次版本.补丁`，如 `0.1.0`。发布时对应 git 标签统一加 `v` 前缀：`v0.1.0`。

| 场景 | 版本示例 | 说明 |
|---|---|---|
| 新增功能（向后兼容） | 0.2.0 | 次版本 +1 |
| 修复 Bug / 小改 | 0.1.1 | 补丁 +1 |
| 破坏性改动 / 大版本 | 1.0.0 | 主版本 +1 |
| 预发布 | 0.2.0-beta.1 | 预发布用，CI 同样会构建 |

版本号唯一权威来源：`package.json` 的 `version` 字段。发布前先改它。

## 2. 分支策略

- 长期维护在 `main` 分支。
- 日常开发可直接在 `main`，或用特性分支合并。
- 打 tag 前，确保 `main` 处于要发布的状态。

## 3. 提交信息与变更记录

CI 会自动把「距上一个 tag 以来的所有非 merge commit」写进 Release 的变更日志。建议用简洁的提交信息，例如：

```
feat: 接入豆包 Seedream 云端 Provider
fix: 修复演示模式在 HiDPI 下模糊
docs: 补充打包说明
```

这样用户能在 Release 页面清楚看到本次改了什么。

## 4. 一键发布（推荐）

```bash
# 1) 更新版本号（手动改 package.json，或用 npm version）
npm version patch          # 0.1.0 -> 0.1.1（同时自动打 v0.1.1 标签）

# 2) 推 main
git push origin main

# 3) 推标签 → 触发 CI
git push origin v0.1.1
```

CI 自动完成：
1. 在 **Windows / macOS / Linux 三台原生 runner** 上各自构建安装包；
2. 聚合三份安装包；
3. 自动生成变更日志；
4. 创建 **GitHub Release** 并把 `.exe / .dmg / .AppImage` 附加到 Release 的 Assets；
5. 你在 Release 页面下载分发。

> 推标签是触发点。若想先跑通不发布，可在 Actions 页手动运行工作流，只产出 artifacts 不建 Release。

## 5. 手动本地打包（不上 CI）

```bash
npm run dist:win      # Windows 本机 → release/*.exe
npm run dist:mac      # macOS 本机   → release/*.dmg
npm run dist:linux    # Linux 本机   → release/*.AppImage
```

> macOS DMG 只能在 macOS 构建；Windows NSIS 在 Linux 需 wine，尽量在原生系统构建。

## 6. 修复已发布版本（补丁流程）

- 从该版本 tag 拉分支，例如 `fix/0.1.1-patch`；
- 修 bug、更新 `package.json` 版本为 `0.1.2`、打 `v0.1.2` 标签推送，CI 自动出补丁包。

## 7. 发布检查清单

- [ ] `package.json` 版本号已更新
- [ ] 变更已合并到 `main`
- [ ] 本地 `npm run typecheck` 通过
- [ ] 推送 tag 后，Actions 三个 job 全部 ✅
- [ ] Release 页面能看到三个安装包 Assets
- [ ] 下载后安装/运行一次（特别是新平台首测）

## 8. 可选增强（后续可接）

- **代码签名**：Windows 用证书（signtool/electron-builder 自动），macOS 做 notarization（公证），可消除「未知发布者」提示。
- **自动更新**：接入 `electron-updater`，配合 GitHub Releases 实现应用内一键升级。
- **自动改版本号**：用 CI 读 tag 反写 `package.json`，减少手工步骤。
