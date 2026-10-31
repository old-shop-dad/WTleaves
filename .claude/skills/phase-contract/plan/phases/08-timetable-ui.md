# Phase 08 · 周视图 UI 重做

## 本 phase 只做
- [x] `TimetableGrid`：按分钟绝对定位、30 分钟网格、当前时间线、重叠分栏
- [x] `WeekStrip`：1..N 周快捷切换 + 当前周标记
- [x] `DayAgenda`：移动端星期 Tab + 当日议程
- [x] 课程卡：色条 / 时间 / 地点 / 调补徽标 / 当前课高亮
- [x] 颜色收敛到 `primary/muted/border` token

## 本 phase 不做
- ❌ 不改数据模型
- ❌ 不引入动画库
- ❌ 不迁移其他页面

## 验收标准（可执行）
- [x] `npm run typecheck` 退出码 0
- [x] `npm run build` 退出码 0

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：构建通过；桌面/移动两套布局（截图受 headless IndexedDB 限制，未做像素级走查）
