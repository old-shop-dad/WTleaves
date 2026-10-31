# Phase 01 · 恢复静态检查绿灯

## 本 phase 只做
- [x] DocsPage 适配 pdfjs-dist v6：`render({ canvas, viewport })`、`loadingTask.destroy()`
- [x] pdf worker 单例从模块级 `let` 改为组件 `useRef`（消除 react-hooks/globals error）
- [x] 清理未使用导入（emptyResult / QuestionDTO / toast）
- [x] 修复 4 个 hooks 依赖警告（ChatPage / FocusPage / HabitsPage / SettingsPage）

## 本 phase 不做
- ❌ 不改数据库 / schema / 路由
- ❌ 不改 UI 视觉
- ❌ 不新增依赖
- ❌ 不做性能优化（留给 02）

## 允许改动
- `src/pages/DocsPage/**`
- `src/modules/quiz/parsers/**`、`src/modules/schedule/ai/extractText.ts`
- `src/pages/ChatPage/**`、`src/pages/FocusPage/**`、`src/pages/HabitsPage/**`、`src/pages/SettingsPage/**`

## 禁止改动
- `src/db/schema.ts`、`src/db/types.ts`、`src/app.tsx`、`src/components/ui/**`

## 验收标准（必须可执行）
- [x] `npm run typecheck` 退出码 0
- [x] `npm run lint:eslint` 退出码 0（0 error / 0 warning）

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：typecheck 0；eslint 0 error / 0 warning
