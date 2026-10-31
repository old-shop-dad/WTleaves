# StudyDesk · 学生本地学习工作台

面向大学生的本地学习工作台：**课表 / 任务 / 笔记 / 刷题 / 习惯 / 专注 / 记账 / 文档处理 / AI 助手**。
所有业务数据保存在浏览器本地 IndexedDB，不上传云端；可打包为 Electron 桌面应用。

当前版本：**1.2.0**（变更见 [CHANGELOG.md](CHANGELOG.md)）

---

## 快速开始

```bash
npm ci          # 安装依赖（Node.js 20+，推荐 24）
npm run dev     # 开发服务器，端口 31251
```

Windows 下也可双击 `启动StudyDesk.bat` / `停止StudyDesk.bat`。

| 命令 | 说明 |
|---|---|
| `npm run dev` | Vite dev server（`http://localhost:31251`） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | 类型检查 + ESLint |
| `npm run lint:eslint` | 仅 ESLint |
| `npm run test:schedule` | 课表周次 / 导入 / ICS 回归测试（Node 原生 TS） |
| `npm run build` | 生产构建（`dist/output` + `dist/output_resource`） |
| `npm run electron:dev` | 以 Electron 壳运行已构建产物 |
| `npm run dist` | Electron 打包（NSIS + Portable，产物 `release/`） |

---

## 功能模块

| 路由 | 模块 | 能力 |
|---|---|---|
| `/today` | 今日仪表盘 | 今日课程、DDL、习惯、专注、记账摘要、快捷入口 |
| `/schedule` | 课表 | 按分钟周视图 / 移动端议程、单双周与指定周次、调停补课、Excel 网格 / 扁平 / WakeUp CSV / ICS / AI 导入、分享图 |
| `/tasks` | 任务 | 列表 / 看板、子任务、拖拽跨列、DDL 与优先级 |
| `/notes` | 笔记 | 卡片网格、搜索、Milkdown 富文本编辑、自动保存与快照 |
| `/quiz` | 刷题 | 题库管理、多格式导入、7 种练习模式、错题回流 |
| `/habits` | 习惯 | 打卡、连续天数、自然周统计、打卡日历 |
| `/focus` | 专注 | 番茄钟、关联任务、中断恢复、统计 |
| `/finance` | 记账 | 月度汇总、分类饼图、近 6 月趋势、预算、流水 |
| `/launcher` | 启动台 | 分组 / 入口管理、拖拽排序、打开计数、命令面板 |
| `/chat` | AI 助手 | DeepSeek 流式对话、附件、17 个本地工具（Function Calling） |
| `/docs` | 文档处理 | 图片互转、图片转 PDF、PDF 合并、图片压缩、Word 预览 |
| `/settings` | 设置 | 学期、课表作息、上课提醒、主题、AI 配置、备份导入导出、存储配额、清空数据 |

---

## 课表模块（v1.2.0）

- **周次**：第 1 周 = 学期开始日期所在自然周的周一；单双周 / 指定周次都有学期上界，不会“第 17 周还显示单周课”。
- **导入**：Excel 二维网格（合并单元格、同格多课、连堂）、扁平表、WakeUp CSV、ICS、Word/PDF/文本 AI 兜底；导入前可逐行修改周次，支持“合并”与“覆盖同位置课程”。
- **调停补课**：课程卡片 → 本周停课 / 本周调课 / 撤销调整，只影响所选周，不改变循环规则。
- **视图**：按分钟绝对定位的 7 天网格（重叠课程并排、当前时间线、点击空白快速添加），移动端自动切换为单日议程。
- **生态**：导出 `.ics` 到系统日历；一键生成当前周分享图；应用打开期间按提前量发送上课通知。
- **作息**：设置页可改 1~10 节起止时间，导入与分享图共用。<br>回归命令：`npm run test:schedule`（22 个用例）。

---

## 技术栈

- **前端**：React 19 + TypeScript 5.9 + Vite 8（Rolldown）+ Tailwind CSS 4
- **UI**：shadcn/ui 风格组件（`src/components/ui/*`）+ 自研液态玻璃（`src/components/glass/*`）+ lucide-react
- **富文本**：Milkdown 7（CommonMark + KaTeX + Prism + Nord）
- **图表**：Recharts
- **数据**：Dexie 4（IndexedDB），软删除 `deletedAt=0`，统一走 `src/db/repositories/*`
- **路由**：HashRouter（兼容 Electron `file://`）
- **桌面壳**：Electron + electron-builder（NSIS / Portable）
- **AI**：DeepSeek API（SSE 流式 + Function Calling）

---

## 目录结构

```
studydesk/
├── electron/                # Electron 主进程 / preload
├── public/                  # 静态资源（图标、头像）
├── src/
│   ├── app.tsx              # HashRouter 路由总入口
│   ├── pages/               # 功能页面（每页一个目录）
│   ├── components/          # 通用组件（ui/ 为基础组件，glass/ 为玻璃组件）
│   ├── db/
│   │   ├── schema.ts        # 29 张表定义（字段名是契约）
│   │   ├── repositories/    # 页面读写数据的唯一通道
│   │   └── aggregate/       # 跨表聚合（如 today 汇总）
│   ├── modules/             # AI 客户端与解析器（quiz/、schedule/）
│   ├── lib/                 # 工具（dates / semester / theme / backup / color）
│   └── data/                # 导航、种子数据
├── .claude/skills/          # AI 协作规范（架构 / UI / AI 工具 / 阶段合同 / 质量闸门）
├── backups/                 # 本地备份快照（git 忽略）
├── CHANGELOG.md
├── AGENTS.md                # 项目稳定事实（AI 会话入口）
└── StudyDesk功能文档.md      # 完整功能说明
```

---

## 数据与备份

- 业务数据全部在 IndexedDB 数据库 `studydesk`，schema 已迭代到 **v5**（29 张表）。
- 所有表统一软删除：`deletedAt=0` 为正常，`deletedAt>0` 为已删除；查询默认过滤。
- 设置页支持导出 / 导入 JSON 全量备份（导入前二次确认并事务化写入）。
- 迭代前本地快照位于 `backups/studydesk-v1.0.0-<timestamp>/`（含 `BACKUP-MANIFEST.md` 逐文件 SHA-256）与同名 `.zip`。

## AI 配置

在「设置 → AI 配置」填入 DeepSeek API Key 与模型；工具协议与删除保护见
`.claude/skills/studydesk-ai-tools/SKILL.md`。注意：旧对话可能缓存旧工具清单，新增工具后建议开新对话。

---

## 质量闸门

提交前执行：

```bash
npm run typecheck
npm run lint:eslint
npm run build
```

阶段化迭代记录在 `.claude/skills/phase-contract/plan/`（`manifest.yaml` + `phases/`），质量闸门清单见
`.claude/skills/code-review-gate/SKILL.md`。
