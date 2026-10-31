# Phase 06 · 周次引擎与今日/课表口径统一

## 本 phase 只做
- [x] 第 1 周锚定到“学期开始日期所在自然周的周一”
- [x] 周次限制在 `1..totalWeeks`，开学前/结束后返回 null（不再出现第 0 周）
- [x] 单双周有总周数上界；有限范围统一展开为 weeks 数组
- [x] `coursesOnDate()` 统一今日页与课表页的取课逻辑
- [x] 学期开始/结束日期改为必填，并预览第 1 周周一
- [x] 22 个 Node 原生 TS 测试

## 本 phase 不做
- ❌ 不改 `src/db/schema.ts`
- ❌ 不改导入解析（留给 07）
- ❌ 不改周视图布局（留给 08）

## 允许改动
- `src/lib/semester.ts`、`src/lib/schedule/**`、`src/db/aggregate/today.ts`、`src/db/types.ts`
- `src/pages/SchedulePage/**`、`src/pages/SettingsPage/SemesterDialog.tsx`、`tests/**`

## 验收标准（可执行）
- [x] `npm run typecheck` 退出码 0
- [x] `npm run test:schedule` 22/22 通过

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：typecheck 0；周次/单双周/开学前/学期结束边界测试全通过
