# Phase 07 · 课表导入管线重写

## 本 phase 只做
- [x] 新 `modules/schedule/import/`：normalize / weeks / metadata / courseText / grid / flat / index
- [x] 网格：表头检测、合并单元格、同格多课、连堂跨节次
- [x] 周次文法：`{2-16周(双)}`、`1-16周(单)`、`1-8,10-16周`、`单周/双周`
- [x] 扁平表：表头别名、组合列、WakeUp CSV（星期 7=周日）
- [x] 预览可编辑周次；导入模式 merge/replace；去重键含周次与结束时间
- [x] 导入撤销同时恢复被覆盖的旧记录

## 本 phase 不做
- ❌ 不改 schema
- ❌ 不做 ICS（留给 10）
- ❌ 不引入依赖（Excel 继续用 xlsx）

## 验收标准（可执行）
- [x] `npm run typecheck` 退出码 0
- [x] `npm run test:schedule` 覆盖网格/合并/同格多课/扁平/WakeUp/失败降级

## 状态
- 进度：done
- 完成时间：2026-10-19
- 验证结果：导入相关 7 个测试通过；旧的 gridParser 已移除
