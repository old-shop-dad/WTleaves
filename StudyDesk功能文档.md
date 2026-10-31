# StudyDesk 软件功能文档

> 学生本地学习工作台 · 液态玻璃风格 · 数据完全本地存储（不上传云端）
> 文档版本：v1.3 · 对应代码版本：1.2.0

---

## 1. 软件概述

StudyDesk 是一款面向大学生的**本地学习工作台**，把课表、任务、笔记、刷题、习惯、专注、记账等日常学习场景整合到一个桌面应用中，并内置 **AI 助手**，支持用自然语言直接操作软件（记账、建笔记、加任务、导入课表、录题目等）。

- **界面风格**：液态玻璃（Glass Card / 毛玻璃 / 高光描边），浅色与深色主题双模式
- **数据安全**：所有业务数据存于浏览器本地 IndexedDB，不经过任何服务器
- **运行形态**：浏览器 Web 应用（开发调试）＋ Electron 桌面应用（打包发布）

---

## 2. 技术架构

| 层 | 技术 |
|---|---|
| 框架 | React 19 + TypeScript 5.9 |
| 构建 | Vite 8（Rolldown）+ Tailwind CSS 4（`@tailwindcss/vite` 插件） |
| UI 组件 | Radix UI 全系 + shadcn/ui 风格封装（`components/ui/*`）+ lucide-react 图标 + framer-motion / GSAP 动效 |
| 玻璃风组件 | 自研 `components/glass/`（GlassCard、EmptyState 等，backdrop-blur + inset 高光） |
| 富文本/笔记 | Milkdown 7（CommonMark 预设 + History + KaTeX 数学公式 + Prism 代码高亮 + Nord 主题） |
| 图表 | Recharts（记账统计，经 shadcn `ChartContainer` 封装）、ECharts（其他可视化场景） |
| 拖拽 | @dnd-kit（任务看板拖拽排序） |
| 数据层 | Dexie 4（IndexedDB），仓库模式 `db/repositories/*` 统一读写，软删除统一 `deletedAt=0` |
| 表单校验 | React Hook Form + Zod |
| 日历 | react-day-picker + 自研 `MonthCalendar` |
| 桌面端 | Electron + electron-builder（NSIS / Portable 双目标） |
| AI 能力 | DeepSeek API（对话 + Function Calling 工具调用 + 流式输出），统一封装在 `src/modules/` |

**分层结构**

```
studydesk/
├── electron/            # Electron 主进程(main.cjs)与预加载脚本(preload.cjs)
├── public/              # 静态资源（图标、头像）
├── src/
│   ├── pages/           # 功能页面（Today/Schedule/Tasks/Notes/Quiz/Habits/Focus/Finance/Launcher/Chat/Docs/Settings）
│   ├── components/
│   │   ├── glass/       # 液态玻璃风格通用组件
│   │   └── ui/          # shadcn/ui 风格基础组件（button/dialog/select/...）
│   ├── db/
│   │   ├── schema.ts    # Dexie 表结构定义
│   │   ├── repositories/ # 数据仓库（业务读写封装）
│   │   └── aggregate/   # 聚合查询（如 today 汇总）
│   ├── lib/             # 通用工具（dates/semester/theme/backup/color/finance-categories）
│   ├── modules/         # AI 与解析器
│   │   ├── quiz/        # 刷题：ai(DeepSeek 识别)、parsers(txt/json/docx)、engine(判题/会话)
│   │   └── schedule/    # 课表：ai(文本提取+网格解析)
│   └── app.tsx          # 路由总入口（HashRouter + Suspense + ErrorBoundary）
└── 启动StudyDesk.bat    # 一键启动开发服务
```

---

## 3. 功能模块详解（含技术实现）

### 3.1 今日仪表盘（`/today`）

**功能**
- 今日日期与问候横幅（`GreetingBanner`）
- **今日课表**（`CourseSection`）：当天课程卡片
- **今日任务 / DDL**（`DdlSection`）：截止任务提醒
- **习惯打卡、专注、随手记**（`HabitsSection` / `FocusSection` / `EntriesSection`）
- **快捷操作**（`QuickActions`）：常用功能一键直达

**技术实现**
- 数据聚合：`db/aggregate/today.ts` 的 `getTodayData()` 一次查询汇总课表/任务/习惯/专注/日记
- 存储读取：`assignmentRepo`、`launcherItemRepo` 等仓库层封装 Dexie 查询
- 首屏数据：`seedIfEmpty` 自动填充示例数据（仅首次）
- 导航：`react-router-dom` 的 `useNavigate`
- UI：自研 `GlassCard` 玻璃卡片 + `sonner` toast 提示

### 3.2 课表（`/schedule`）

**功能**
- **超级课程表风格网格**：左侧节次时间轴（1–10 节带时间）、顶部星期栏（"月份 + 日 + 周几"，今天高亮）、彩色课程块按节次跨度合并（absolute 定位 `top=表头+节数×60px`）
- **周次切换**：周次横幅固定顶部（`sticky`），左右箭头切周、到第 1 周后禁用；切周时按周次模式过滤课程
- **课程周次模式**：全周 / 单周 / 双周 / **指定周次**（`weeks`，支持 `7`、`1,2,3,7-10` 范围解析）
- **课程管理**：点卡片编辑/删除，可自定义颜色（`colorWithAlpha` 透明度适配深浅主题）
- **学期管理**：学期开始日期、总周数、当前学期
- **导入能力**：文件上传（Excel 等）+ AI 对话解析导入

**技术实现**
- 周次计算：`lib/semester.ts` 的 `currentWeekNumber()`（基于学期 `startDate` + `totalWeeks`）与 `isWeekActive(filter)`（all/odd/even/weeks 模式判定）
- 数据模型：`IScheduleSlot{ dayOfWeek(0=日..6=六), startMin, endMin, weekPattern, color }`、`ISemester{ startDate, totalWeeks, isCurrent }`，存储于 `schedule_slots` / `semesters` 表
- 网格布局：`PERIODS` 常量定义 10 节时间；星期栏由 `weekStart` 计算 7 天日期
- 日历组件：`components/MonthCalendar`（月份视图）
- 课程编辑表单：`CourseFormDialog.tsx`（含"指定周次"输入与范围解析）
- AI 导入：`modules/schedule/ai/`（`extractText` 文本提取 + `gridParser` 网格结构解析 → `add_course` 工具写入）

### 3.3 任务与 DDL（`/tasks`）

**功能**
- 任务列表：标题、优先级、状态（未开始/进行中/已完成）、截止时间，按 DDL 排序
- **子任务**：任务可拆分子项（独立完成状态与排序）
- **看板视图**：任务卡片拖拽排序、状态分组（`TaskBoard`）
- 支持 AI 自然语言创建任务

**技术实现**
- 数据模型：`assignments`（任务）+ `subtasks`（子任务，含 `sortOrder`、`done`）表
- 仓库层：`db/repositories/assignments.ts`（`assignmentRepo` / `subtaskRepo`）
- 拖拽排序：**@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities**（`TaskBoard` 内 DragOverlay/SortableContext）
- 表单：`TaskFormDialog`（React Hook Form + Zod 校验 + Dialog 弹窗）
- UI：Tabs 分组视图 + GlassCard 卡片 + sonner 提示

### 3.4 笔记（`/notes` + `/notes/:id`）

**功能**
- 笔记列表：标题、标签、快速笔记（不打开编辑器直接记录）
- **富文本编辑器**：Markdown 语法、数学公式、代码高亮、历史撤销
- **历史快照**：每次保存自动生成快照（`note_snapshots`），可追溯历史版本
- **附件**：笔记可挂附件（`attachments` 表）
- AI 创建/删除笔记

**技术实现**
- 编辑器：**Milkdown 7**（`MilkdownEditor.tsx`）——`@milkdown/core` + `preset-commonmark`（Markdown）+ `plugin-history`（撤销/重做）+ `plugin-math`（**KaTeX** 公式）+ `plugin-prism`（**Prism** 代码高亮）+ `theme-nord`（编辑器主题）+ `@milkdown/react` 的 `useEditor`
- 自动保存：`plugin-listener` 监听内容变化回调 `onUpdate`，配合防抖写库
- 快照：保存时 `snapshotRepo` 写入 `note_snapshots`（含 `createdAt`）
- 数据模型：`notes{ id, title, tags, quick, content }`、`note_snapshots{ noteId, createdAt }`、`attachments{ noteId, name }`
- 富文本内容以 Markdown 字符串存储，渲染时由 Milkdown 即时解析

### 3.5 刷题（`/quiz` 系列）

**功能**
- **题库管理**：按学科/课程组织题库（`quiz_banks`），题库详情页
- **刷题练习**（`/quiz/practice/:id`）：答题引擎、即时判分、查看解析
- **考试模式**：整卷限时作答
- **错题本**：答错自动入错题本，支持复习回顾
- **学习统计**：正确率、刷题量图表
- **导入向导**（`/quiz/import`）：支持 **txt / json / docx** 多格式导入
- **AI 解析题目**：上传题目图片/文档 → DeepSeek 识别 → 写入题库

**技术实现**
- 解析器：`modules/quiz/parsers/`——`txtParser.ts`（文本题块解析）、`jsonParser.ts`（结构化 JSON）、`docxParser.ts`（docx 文本抽取）、`normalize.ts`（统一归一化题目对象）
- AI 识别：`modules/quiz/ai/`——`client.ts`（DeepSeek 调用）、`prompt.ts`（题目解析提示词）、`toDTO.ts`（AI 输出转题库数据）、`storage.ts`（API Key 与模型配置持久化）
- 答题引擎：`modules/quiz/engine/`——`sessionBuilder.ts`（会话构建）、`judge.ts`（判题，支持单选/多选/判断/填空）、`reviewBridge.ts`（错题本桥接）
- 数据模型：题库/题目/答题记录/错题/考试记录等表（见 §4）
- 判分与统计在前端本地完成，无服务端

### 3.6 习惯打卡（`/habits`）

**功能**
- 习惯管理：名称、每周重复日（周一至周日勾选）
- 每日打卡：勾选完成，日历式记录
- 历史打卡记录查询
- AI 直接打卡

**技术实现**
- 数据模型：`habits{ name, daysOfWeek }` + `habit_logs{ habitId, date, done }`，日期键 `toDateKey()`（YYYY-MM-DD）
- 仓库层：`db/repositories/lifestyle.ts`（`habitRepo` / `habitLogRepo`）
- 打卡幂等：同一天重复打卡由 `habit_logs` 唯一键约束/去重逻辑保证
- UI：GlassCard 习惯卡片 + 勾选交互 + sonner 提示

### 3.7 专注（`/focus`）

**功能**
- **番茄钟专注**：开始/暂停/重置/结束专注计时
- **关联任务**：专注可绑定任务（专注栏支持增删关联任务）
- **专注记录**：每次专注自动写入 `focus_sessions`，累计专注次数统计

**技术实现**
- 计时：前端 `setInterval` 状态机（`useRef` 存计时器句柄），支持暂停/继续
- 数据模型：`focus_sessions{ id, taskId, startedAt }`（taskId 关联任务，可空）
- 仓库层：`focusRepo`（`db/repositories/lifestyle.ts`）
- 任务联动：`assignmentRepo` 读取未完成任务供选择关联
- UI：GlassCard + Select 任务选择 + 计时环

### 3.8 记账（`/finance`）

**功能**
- **收支记录**：支出/收入流水（日期、分类、备注）
- **分类体系**：内置常用分类（`lib/finance-categories.ts`），月度日历视图
- **预算**：按分类设置月度预算
- **可视化**：收支趋势、分类占比、预算执行图表
- **AI 记账**：自然语言记账（`add_expense` / `add_income`）

**技术实现**
- 图表：**Recharts**（`BarChart` 收支柱状、`PieChart` 分类占比），经 shadcn `ChartContainer` + `ChartTooltip` 封装，配置驱动 `ChartConfig`
- 分类：`lib/finance-categories.ts`（固定分类目录 + 图标/颜色映射）
- 数据模型：`finance_records{ date, categoryId, type(支出/收入) }` + `budgets{ name, categoryId }`
- 仓库层：`financeRecordRepo`（`db/repositories/finance.ts`）
- 日历视图：`MonthCalendar` 组件 + 收支汇总

### 3.9 快捷启动台（`/launcher`）

**功能**
- 分组管理快捷项（网址/应用入口）
- 打开次数统计，常用项置顶

**技术实现**
- 数据模型：`launcher_groups{ name, sortOrder }` + `launcher_items{ groupId, name, url, openCount }`
- 仓库层：`launcherItemRepo`（`db/repositories/launcher.ts`）
- 打开计数：点击时 `openCount++` 并排序
- 链接安全：`lib/url-safety.ts` 校验 url 前缀，防止非法协议

### 3.10 AI 助手（`/chat`）

**功能**
- DeepSeek 多轮对话（仿 DeepSeek 官网 UI），流式输出
- **工具调用（Function Calling）**：AI 可读写本地数据
- **删除保护**：删除类操作先向用户确认
- **文件解析**：上传/粘贴文本，AI 解析后写入（课表文件、题目文档等）

**技术实现**
- AI 客户端：`modules/quiz/ai/client.ts`（DeepSeek chat/completions，**SSE 流式**，支持 `deepseek-reasoner` 思考模型）
- 配置：`loadAiConfig()` 从设置读取 API Key 与模型（`modules/quiz/ai/storage.ts`）
- 工具清单（TOOLS 数组）：`add_expense` / `add_income`（记账）、`create_note` / `delete_note`（笔记）、`add_task` / `delete_task`（任务）、`add_course` / `delete_course`（课表，支持指定周次）、`add_quiz_question` / `delete_quiz_bank`（题库）、`add_habit_log`（打卡）、`get_today_schedule` / `get_today_tasks` / `get_today_finance`（查询）、`delete_finance_record`（删账单）
- 执行层：收到工具调用后走各仓库（`db/repositories/*`）真实读写 IndexedDB
- 会话存储：`chat_conversations` / `chat_messages` 表（含 attachments 附件记录）
- UI：输入框固定在底部，消息列表 + 流式打字机效果，附件上传（图片/文件）

### 3.11 文档处理中心（`/docs`）

**功能**
- **文件转换（Filee 风格）**：文件卡片列表，**悬停弹出环形菜单**（`group-hover` + `pointer-events` 实现），点格式即转
  - 图片互转：PNG ↔ JPG ↔ WebP（含 JPG 白底填充）
  - 图片 → PDF：单张/批量合成
  - PDF → 图片：多页导出（**20 页上限**防卡顿）
- **图片转 PDF**（批量）、**合并 PDF**、**图片压缩**、**Word 预览**

**技术实现**
- 图片互转：`canvas.toBlob()`（`canvasToBlob`），`Image` 解码（`loadImage`），JPG 输出质量 0.92
- PDF 生成/合并：**pdf-lib**（`PDFDocument.create()` + `embedJpg/embedPng` + `addPage`/`copyPages`）
- PDF 渲染：**pdfjs-dist v6** + **Vite `?worker` 导入**创建 worker（`GlobalWorkerOptions.workerPort` 复用单例），`getDocument` → `page.render({ canvasContext, viewport })`，scale 2 渲染
- Word 预览：**docx-preview**（`renderAsync`，Electron 下可 Ctrl+P 打印为 PDF）
- 压缩：canvas 重绘 + `toBlob(quality)` 批量处理
- 环形菜单：纯 CSS（`opacity` + `group-hover` + 按角度 `transform: translate` 排列格式按钮）
- 全部转换在浏览器本地完成，**无上传**

### 3.12 设置（`/settings`）

**功能**
- **主题切换**：浅色 / 深色 / 跟随系统
- **学期管理**：创建/切换学期
- **AI 配置**：DeepSeek API Key 与模型设置
- **备份与恢复**：导出/导入本地数据备份
- **重置所有数据**：清空全部本地数据（有确认保护）

**技术实现**
- 主题：`lib/theme.ts`（class 切换 + `next-themes` 风格封装），Tailwind dark 变体
- 备份：`lib/backup.ts`（导出 IndexedDB 全量 JSON / 导入恢复，含版本字段）
- 存储用量：`lib/storage-persist.ts` 的 `estimateUsage()` 估算占用
- 学期仓库：`semesterRepo`（`db/repositories/semesters.ts`）
- 重置：逐表 `clear()` 清空，删除操作有确认弹窗

---

## 4. 数据存储（IndexedDB 表）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `semesters` | 学期 | name, startDate, totalWeeks, isCurrent |
| `schedule_slots` | 课程 | semesterId, dayOfWeek, startMin, weekPattern |
| `schedule_overrides` | 课程调课/停课覆盖 | date, semesterId, kind |
| `assignments` / `subtasks` | 任务与子任务 | dueAt, status, priority / done, sortOrder |
| `notes` / `note_snapshots` / `attachments` | 笔记、历史快照、附件 | tags, content / noteId / noteId |
| `launcher_groups` / `launcher_items` | 快捷启动台 | sortOrder / url, openCount |
| `habits` / `habit_logs` | 习惯与打卡 | daysOfWeek / date, done |
| `focus_sessions` | 专注记录 | taskId, startedAt |
| `mistakes` / `subjects` | 错题本与学科 | box, reviewedAt |
| `grades` | 成绩 | courseName, date |
| `reading_items` | 阅读清单 | title, status |
| `calendar_events` | 日历事件 | date, title |
| `diary_entries` | 日记 | date, mood |
| `finance_records` / `budgets` | 账单与预算 | categoryId, type / name, categoryId |
| `chat_conversations` / `chat_messages` | AI 对话 | 消息内容、附件 |
| `quiz_banks` / `quiz_questions` 等 | 题库/题目/答题/考试/错题 | 见 `db/schema.ts` |
| `settings` | 应用设置（键值） | key → value |

所有删除均为**软删除**（`deletedAt=0` 标记），避免误操作导致数据不可恢复。数据读写统一走 `db/repositories/*` 仓库层，页面不直接操作 Dexie。

---

## 5. 运行与构建

| 操作 | 命令 | 说明 |
|---|---|---|
| 启动开发 | `启动StudyDesk.bat` 或 `npm run dev` | Vite dev server，端口 31251 |
| 类型检查 | `npm run typecheck` | tsc 检查 |
| Lint | `npm run lint` | 类型检查 + ESLint |
| 前端构建 | `npm run build` | 产物 `dist/` |
| Electron 打包 | `npm run dist` | NSIS 安装版 + Portable 版，产物 `release/` |
| 停止服务 | `停止StudyDesk.bat` | 结束 node 进程 |

---

## 6. 使用说明与注意事项

1. **数据在本地**：所有数据存于当前浏览器/Electron 的 IndexedDB，换设备不共享；重要数据请用设置页的"备份"功能定期导出。
2. **AI 需要联网与 API Key**：AI 助手调用 DeepSeek API，需在「设置 → AI 配置」填入 API Key；离线时对话与 AI 导入不可用，其余本地功能不受影响。
3. **课表周次**：切换周次后只显示该周有效的课程；"仅第 X 周"课程需在课程编辑中选择"指定周次"模式。
4. **PDF 转图片**：默认最多导出前 20 页，避免超大 PDF 卡顿；worker 由 Vite 托管，首次转换稍慢属正常。
5. **AI 对话工具**：旧对话可能仍记得旧工具清单，新增工具能力请开启新对话生效。
