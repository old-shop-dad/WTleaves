# Phase 02 · PWA 预缓存 + 首屏性能

## 本 phase 只做
- [x] 修复插件顺序：`miaodaOutputPlugin` 必须在 `VitePWA` 之后执行 closeBundle，否则 dist/client 先被删除，SW 预缓存 0 个资源
- [x] DocsPage 的 pdf-lib / docx-preview 改为使用处动态 import（保留 pdfjs 既有动态加载）
- [x] 构建后核对：precache entries 明显 > 3，index chunk 体积下降
- [x] 附带修复：无 CDN 前缀时把 assets 同时写入 `dist/output/assets`，保证 Electron 打包不白屏

## 本 phase 不做
- ❌ 不改 DocsPage 的视觉 / 交互
- ❌ 不引入 manualChunks 等构建架构变更
- ❌ 不删除任何依赖（依赖变更需单独确认）

## 允许改动
- `vite.config.ts`
- `src/pages/DocsPage/DocsPage.tsx`

## 禁止改动
- `src/db/**`、`src/components/ui/**`

## 验收标准（必须可执行）
- [x] `npm run build` 退出码 0
- [x] 构建日志 `precache` 条目数 > 3（修复前为 3 entries / 0 KiB）
- [x] `dist/output/sw.js` 存在且包含实际资源 URL（80 条）
- [x] index chunk < 800 kB（修复前 1,048 kB）
- [x] `dist/output/index.html` 引用的 6 个资源全部存在（Electron 可加载）

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：precache 80 entries / 4,993 KiB；index 455.87 kB（gzip 145.21 kB）；缺失引用 0
