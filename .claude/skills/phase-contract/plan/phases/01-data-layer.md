# Phase 01 · 数据层抽象

> 模板示例：v1.1.0 迭代未启用本 phase，实际执行顺序以 `plan/manifest.yaml` 为准。

## 本 phase 只做
- [ ] 在不改 `schema.ts` 的前提下，给 Dexie 调用包一层 repository（已有 `db/repositories/*` 保持并补齐）
- [ ] 各页面/模块统一改为通过 repository 访问数据
- [ ] 聚合查询收敛到 `db/aggregate/*`

## 本 phase 不做
- ❌ 不改 `src/db/schema.ts`（字段名是契约）
- ❌ 不引入新依赖
- ❌ 不改 AI 工具协议

## 允许改动
- `src/db/**`（除 schema.ts）、`src/pages/**`、`src/modules/**`

## 禁止改动
- `src/db/schema.ts`

## 验收标准（必须可执行）
- [ ] `npm run typecheck` 退出码 0
- [ ] `npm run build` 退出码 0
- [ ] 记账/课表/笔记等核心页面读写正常（手动冒烟）

## 状态
- 进度：not-started
- 完成时间：
- 验证结果：
