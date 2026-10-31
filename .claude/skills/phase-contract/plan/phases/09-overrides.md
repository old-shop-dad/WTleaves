# Phase 09 · 本周停课 / 调课 / 补课

## 本 phase 只做
- [x] 课程详情 Sheet：编辑循环课程 / 本周停课 / 本周调课 / 删除 / 撤销调整
- [x] `OverrideDialog`：调课（fromDate + 目标日期/时间/地点）、补课
- [x] `coursesOnDate` 正确叠加 off/move/added（含跨周 move）
- [x] 今日页同步使用新的叠加逻辑

## 本 phase 不做
- ❌ 不写物理删除
- ❌ 不改 override 表结构（仅新增可选 `fromDate`）

## 验收标准（可执行）
- [x] `npm run typecheck` 退出码 0
- [x] `npm run test:schedule` 覆盖停课/调课/补课/开学前

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：6 个 occurrences 测试通过
