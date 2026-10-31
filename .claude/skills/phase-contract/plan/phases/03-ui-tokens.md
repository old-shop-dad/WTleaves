# Phase 03 · 玻璃材质 token 化收口

## 本 phase 只做
- [x] 在 `:root` / `.dark` 增加玻璃材质 token（背景、描边、模糊、饱和、阴影、悬停阴影）
- [x] 增加 `.glass-card` / `.glass-panel` / `.glass-chip` 类，作为玻璃效果唯一入口
- [x] `GlassCard` / `StatChip` 改用玻璃类，删除组件内联 rgba / backdrop-filter 魔法值

## 本 phase 不做
- ❌ 不改任何页面的信息结构
- ❌ 不迁移 ChatPage / DocsPage 的既有配色（留给后续 phase）
- ❌ 不改 `components/ui/**`

## 允许改动
- `src/index.css`
- `src/tailwind-theme.css`
- `src/components/glass/**`

## 验收标准（必须可执行）
- [x] `npm run typecheck` 退出码 0
- [x] `npm run build` 退出码 0
- [x] `src/components/glass/**` 内无 `rgba(` / `backdrop-blur-` 内联写法

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：typecheck/build 0；glass 组件检索无内联材质（仅注释被改写后也无残留）
