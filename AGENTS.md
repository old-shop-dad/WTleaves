# StudyDesk 项目级入口（稳定事实）

> 本文件只放**项目稳定事实**，不放 Skill 内容。AI 每次会话先读本文件建立上下文。

## 产品定位

StudyDesk 是面向大学生的**本地学习工作台**：课表、任务、笔记、刷题、习惯、专注、记账 + AI 助手，数据全部存本地 IndexedDB，不上传云端。

## 技术栈（锁定）

- 前端：React 19 + TypeScript 5.9 + Vite 8（Rolldown）+ Tailwind CSS 4
- UI：shadcn/ui 风格组件（`components/ui/*`）+ 自研液态玻璃组件（`components/glass/*`）+ lucide-react
- 富文本：Milkdown 7（CommonMark + KaTeX + Prism + Nord 主题）
- 图表：Recharts（记账统计）
- 数据层：Dexie 4（IndexedDB），软删除 `deletedAt=0`，仓库层 `db/repositories/*`
- 桌面壳：Electron + electron-builder（NSIS / Portable）
- AI：DeepSeek API（SSE 流式 + Function Calling），入口 `src/pages/ChatPage/ChatPage.tsx`，客户端 `src/modules/`

## 运行命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 dev server（端口 31251，`启动StudyDesk.bat`） |
| `npm run typecheck` | tsc 类型检查 |
| `npm run lint` | 类型检查 + ESLint |
| `npm run test:schedule` | 课表周次/导入/ICS 回归测试（Node 原生 TS） |
| `npm run build` | 前端构建（产物 `dist/`） |
| `npm run dist` | Electron 打包（产物 `release/`） |

## 版本与备份

- 当前版本：**1.2.0**；基线 tag `v1.0.0-baseline`，已发布 tag `v1.1.0`、`v1.2.0`
- 本地备份：`backups/studydesk-v1.0.0-<timestamp>/` 与同名 `.zip`，附 `BACKUP-MANIFEST.md`（逐文件 SHA-256）
- 变更记录：`CHANGELOG.md`

## 课表稳定事实（v1.2.0）

- **周次**：第 1 周 = 学期开始日期所在自然周的周一 ~ 周日；周次限定 `1..totalWeeks`，开学前/结束后为 null；学期起止日期必填。
- **口径**：某天有哪些课统一走 `src/lib/schedule/occurrences.ts` 的 `coursesOnDate()`（今日页与课表页共用），停课/调课/补课存 `schedule_overrides`（off / move / added，move 用可选 `fromDate`）。
- **导入**：`src/modules/schedule/import/` 支持 Excel 网格（合并单元格/同格多课/连堂）、扁平表、WakeUp CSV、ICS、AI；预览可逐行修改周次；导入支持合并 / 覆盖同位置，去重键包含周次。
- **扩展**：ICS 导出、当前周分享图、上课提醒（应用打开期间生效）、作息表（`settings` key `schedule.periods`）。

## 目录路由（重要）

- `src/app.tsx` — 路由总入口（HashRouter）
- `src/db/schema.ts` — 29 张表定义（22 张基础表 + 5 张 quiz 表 + 2 张 chat 表，v1–v5 迁移；**字段名是契约，禁止重命名/删除**）
- `src/db/repositories/` — 数据仓库（页面读写数据的唯一通道）
- `src/pages/` — 功能页面：Today/Schedule/Tasks/Notes/Quiz/Habits/Focus/Finance/Launcher/Chat/Docs/Settings
- `src/modules/` — AI 客户端与解析器（quiz/ai、quiz/parsers、quiz/engine、schedule/ai、schedule/import、schedule/ics.ts）
- `src/lib/` — 工具（dates/semester/theme/backup/color/finance-categories；课表周次/occurrences/periods/reminders/shareImage 在 `lib/schedule/`）
- `.claude/skills/` — AI 协作 Skill 套件（架构闸门/UI 系统/工具协议/阶段合同/质量闸门）

## 关键约束（任何改动前须知）

1. **数据契约**：schema 字段名、软删除策略、repository 访问路径是硬约束。
2. **架构变更**：先读 `.claude/skills/studydesk-architect/SKILL.md`，出方案确认后再动。
3. **UI 改动**：先读 `.claude/skills/studydesk-ui-system/SKILL.md`，token 优先、玻璃效果走 `GlassCard`（内部 `.glass-card`）。
4. **AI 工具改动**：先读 `.claude/skills/studydesk-ai-tools/SKILL.md`，登记契约 + 删除保护。
5. **重构批次**：先读 `.claude/skills/phase-contract/SKILL.md`，按 phase 推进；收尾跑 `.claude/skills/code-review-gate/SKILL.md`。
6. **AI 对话工具**：旧对话可能记得旧工具清单，新增工具能力需开新对话生效。
