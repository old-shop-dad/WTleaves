---
name: phase-contract
description: 阶段化长任务续跑工作流。适用于跨多轮会话的大规模重构、迁移、分批交付，通过 plan/manifest.yaml + phases/ 合同链实现无损续跑。触发词：大型重构规划、多阶段迁移、拆 phase、分批实施、续跑、阶段合同。
---

# Phase Contract 阶段化工作流

把长任务建模为**有序合同链**：每个 phase 是一个小合同，做完立刻把状态写回外部文件（`plan/` 目录），支持跨会话、跨上下文压缩的无损续跑。

## 1. 目录结构（工作区固定约定）

```
.claude/skills/phase-contract/plan/
├── manifest.yaml        # 所有 phase 的顺序、依赖、路径白名单
└── phases/
    ├── 00-baseline.md   # 每个 phase 一个文件（编号-名称）
    ├── 01-data-layer.md
    └── ...
```

> phase 文件写入 `.claude/skills/phase-contract/plan/`，该目录是**唯一事实源**：每次续跑先读 manifest.yaml 与最新 phase 文件。

## 2. manifest.yaml 模板

```yaml
project: StudyDesk
goal: AI 可续跑的分阶段重构
phases:
  - id: 00-baseline
    name: 冻结基线
    depends_on: []
    allow_paths: ["*"]
    verify: ["git tag baseline", "npm run typecheck"]
  - id: 01-data-layer
    name: 数据层抽象
    depends_on: ["00-baseline"]
    allow_paths: ["src/db/**"]
    forbid_paths: ["src/db/schema.ts", "src/pages/**"]
    verify: ["npm run typecheck", "npm run build"]
```

## 3. 每个 phase 合同文件模板

```markdown
# Phase 00 · 冻结基线

## 本 phase 只做
- [ ] 打 git tag `baseline`
- [ ] 跑通现有全部测试/类型检查
- [ ] 记录"重构前行为"快照（功能清单、关键数据）

## 本 phase 不做
- ❌ 不修改任何业务代码
- ❌ 不引入新依赖
- ❌ 不重构无关系统

## 允许改动
- `*`（仅只读操作 + 打 tag）

## 验收标准（必须可执行）
- [ ] `npm run typecheck` 退出码 0
- [ ] `git tag` 存在 `baseline`

## 状态
- 进度：not-started / in-progress / done
- 完成时间：
- 验证结果：
```

## 4. 执行规则

1. **每次会话开始**：先读 `plan/manifest.yaml` + 最后一个 phase 文件，从断点续跑，不重做已完成 phase。
2. **phase 内只做合同声明的事**：`allow_paths` 之外的目录禁止改动；`forbid_paths` 永远禁止改动（除非 manifest 显式更新）。
3. **完成判定**：`verify` 中列出的可执行命令全部通过（退出码 0），并回填"验收标准"勾选，才算 done。
4. **状态回写**：每完成一个 phase，更新其"状态/完成时间/验证结果"，再开始下一个。
5. **不顺手重构**：只实现当前 phase，不做未来功能，不重构无关系统，不随便加依赖。
6. **失败处理**：验证失败 → 修复到通过为止；无法通过 → 在 phase 文件里记录 blocker 与原因，不要假装 done。

## 5. StudyDesk 建议 phase 序列（示例，可按需调整）

1. **00 冻结基线** — git tag + 全量 typecheck/build 通过，录行为快照
2. **01 数据层抽象** — 不改 schema，给 Dexie 包 repository 层，模块逐步切换
3. **02 AI Gateway 抽取** — 收敛 DeepSeek 调用与工具定义到 `src/modules/`
4. **03 UI 系统落地** — 逐模块替换为 studydesk-ui-system token/组件，每模块视觉回归
5. **04 模块级重构** — 刷题 → 笔记 → 课表 → 记账 → 习惯 → 专注 → 启动台，每模块一个 phase
6. **05 Electron 打包验证** — 重出便携包，验证 file:// 下 HashRouter 与 IndexedDB 行为

## 6. 验收标准可执行化（重要）

重构类任务的验收标准**必须写成可执行的 shell 命令**，exit 0 才算通过，不接受"功能正常"这类模糊描述：

```
[ ] `npm run typecheck` 退出码 0
[ ] `npm run build` 退出码 0，产物体积不超过基线 110%
[ ] 手动验证清单：新建记账 → 刷新 → 记录仍在；AI 说"今天午饭 25" → 产生餐饮支出
```
