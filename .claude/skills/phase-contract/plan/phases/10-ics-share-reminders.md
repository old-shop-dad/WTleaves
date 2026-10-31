# Phase 10 · ICS / 分享图 / 上课提醒 / 作息

## 本 phase 只做
- [x] ICS 导出（逐周事件，含调停补课）与导入（VEVENT + WEEKLY RRULE，并按同课合并周次）
- [x] 分享图：canvas 渲染当前周 PNG，下载
- [x] 上课提醒：全局 hook + 系统通知，提前 0/5/10/15/20 分钟
- [x] 设置页：课表作息编辑（1~10 节起止时间）、提醒开关与提前量
- [x] 部分布局统一使用 `settings.schedule.periods`

## 本 phase 不做
- ❌ 不做后台常驻提醒（应用关闭后不提醒）
- ❌ 不做第三方日历双向同步
- ❌ 不引入新依赖

## 验收标准（可执行）
- [x] `npm run typecheck` 退出码 0
- [x] `npm run test:schedule` ICS 导出/导入/RRULE 测试通过
- [x] `npm run build` 退出码 0

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：ICS 3 个测试通过；构建通过；通知需用户授权（未在 headless 中验证）
