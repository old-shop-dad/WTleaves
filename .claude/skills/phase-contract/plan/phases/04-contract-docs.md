# Phase 04 · 文档 / 契约同步 + 版本号

## 本 phase 只做
- [x] AGENTS.md：表数量 22 → 29，工具数 15 → 17，玻璃入口改为 GlassCard
- [x] studydesk-ai-tools skill：补登 `finish_task`、`clear_schedule`，总数改为 17
- [x] studydesk-ui-system skill：标注实际 token 落点为 `tailwind-theme.css` + GlassCard
- [x] README.md：替换模板占位内容为真实项目说明（HashRouter、脚本、目录）
- [x] package.json / package-lock.json 版本 1.0.0 → 1.1.0
- [x] 新增 CHANGELOG.md

## 本 phase 不做
- ❌ 不改任何运行时代码
- ❌ 不改 schema
- ❌ 不重建 Electron 安装包

## 允许改动
- `AGENTS.md`、`README.md`、`StudyDesk功能文档.md`
- `package.json`、`package-lock.json`
- `.claude/skills/**`
- `CHANGELOG.md`

## 验收标准（必须可执行）
- [x] `node -p "require('./package.json').version"` 输出 1.1.0
- [x] 仓库内检索不到 "22 张表" / "当前 15 个"
- [x] README 不再出现 "BrowserRouter 已在 index.tsx 中配置"

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：版本 1.1.0（package.json 与 lock 一致）；过期描述检索 0 命中
