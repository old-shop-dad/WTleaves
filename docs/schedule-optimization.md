# 课表模块优化方案（v1.2.0 方案与实施记录）

> 状态：**已确认并实施（方案 C，2026-10-19，v1.2.0）**
> 范围：周次引擎 / 课表导入 / 课表周视图 UI / 调停补课 / ICS / 分享图 / 上课提醒
> 不改：`src/db/schema.ts` 字段名、软删除策略、AI 工具签名、`components/ui/**`

---

## 1. 结论先行

用户遇到的三个现象不是同一个 bug：

| 现象 | 直接原因 | 根因 |
|---|---|---|
| 导入识别不准 | 只支持一种固定格子格式 | 解析器假设“表头连续 + 每格固定 3 行 + 周次写在老师后的 `[x周]`”，真实教务表格的合并单元格、多门课同格、`1-16周(单)`、`{2-16周(双)}` 全部不识别 |
| 每周课表都一样 | 导入后 `weekPattern` 几乎全是 `all` | ① 周次解析丢失；② 表单只存“循环规则”，没有“仅本周”概念；③ 去重键不含周次，用户改完重新导入会被当成重复跳过 |
| 周次显示/过滤混乱 | 周次从 `startDate` 起算，而不是“第 1 周周一” | 非周一开始的学期会出现“第 0 周”；`odd/even` 没有学期上界；学期未开始/已结束仍可能匹配 |
| UI 不美观/不准 | 固定 10 节 × 60px 的表格 | 卡片位置由“节次下标”推算而非真实分钟；早课/晚课被夹取到首末节；重叠课程没有分栏；配色硬编码蓝/灰 |

---

## 2. 现状诊断（带证据）

### 2.1 周次引擎

`src/lib/semester.ts:24-33`：

```ts
const diffMs = todayStart - start;
const day = Math.floor(diffMs / 86400000);
return Math.floor(day / 7) + 1;
```

问题：

1. **锚点不是周一**。学期若从周二/周三开始，第 1 周只有 5~6 天，之后每周都和教务处的“第 N 周”错位。
2. **会返回 0 或负数**。开学前的日期 `week = 0`；`SchedulePage.tsx:128` 的 `w ?? 1` 只兜底 `null`，兜不住 0，于是界面出现“第 0 周”，单双周判断把 0 当双周。
3. **没有上界**。`isWeekActive` 的 `odd/even` 对任意奇数/偶数周都返回 true（`semester.ts:10-21`），16 周之后的 17、19 周仍然显示“单周课”。
4. **今日页重复同一套逻辑**（`today.ts:73-84`），`notStarted = week == null` 在 week=0 时判断错误，导致未开学也显示课程。

### 2.2 导入解析

`src/modules/schedule/ai/gridParser.ts`：

- `isGridSheet` 要求同一行文本里出现 `星期一.*星期二.*星期三`（`:75-82`）；
- 表头之后**只认第 2 列是“一/二/三/四/五/六”**的节次行（`:105-115`）；
- 单元格内容**必须是 3 行**：课程名 / 老师`[周次]` / 地点（`:126-148`）；
- 周次只认 `[1-15周]`（`:32-60`），不认 `1-16周(单)`、`{2-16周(双)}`、`1-8,10-16周`、`单周`；
- 同一格两门课、连堂合并单元格、跨行续接都会丢课。

`CourseImportDialog.tsx`：

- 扁平日志表头映射缺少 `开始节数 / 结束节数 / 周数`（`:48-57`），所以 WakeUp 导出 CSV 无法直接导入；
- `parseDay` 只接受 `0-6`（`:63-77`），而 WakeUp CSV 的星期是 `1-7`（7=周日），周日会解析失败；
- 预览表没有“周次”列、不可编辑（`:452-495`），用户无法在导入前修正错误。

### 2.3 去重与重导入

`src/db/repositories/schedule.ts:28-30`：

```ts
function dedupKey(s) {
  return `${s.title}|${s.dayOfWeek}|${s.startMin}`;
}
```

- 不含 `weekPattern`：同一门课“1-8 周”和“10-16 周”两个分段会被合并成一条，丢掉后半学期；
- 不含 `endMin`：同起点不同长度的课也会被误判；
- 用户发现周次错了，改 Excel 后重新导入 → 命中旧 key → 提示“没有新课程需要导入”，**改不动**。

### 2.4 表达式缺失

- 表单没有“只改这一周”的入口（`CourseFormDialog.tsx:50-89`），在浏览第 12 周时编辑课程，实际改的是所有周；
- `schedule_overrides` 表和 `overrideRepo` 已存在，今日页也会消费 off/move/added（`today.ts:86-115`），但**课表页从未写入过 override**（`overrideRepo` 只在读取处出现），调停补课是“有数据模型、没有入口”。

### 2.5 渲染与视觉

`SchedulePage.tsx:27-39` 与 `gridParser.ts:16-29` 各自维护一套节次时间，且不一致（8:30 vs 8:00）。卡片 `top` 由节次下标算（`:337`），不是由 `startMin` 算；早于第一节、晚于第十节的课被夹到首/末行（`:328-334`），所以“08:00 早课”会显示在 08:30 的格子里。重叠课程直接叠在一起，没有并排分栏。颜色大量硬编码 `bg-blue-500` / `text-gray-*`（`:236-321`），与 UI Skill 的 token 规范冲突。

---

## 3. GitHub 开源实现调研

| 项目 | 值得借鉴的点 | 对本项目的启发 |
|---|---|---|
| [简课表（salt-fishes/jiankebiao）](https://github.com/salt-fishes/jiankebiao) | 正方/强智课表 PDF、班级 Excel 导入；**格线网格分块**；连堂与同格多课；解析规则包；多课表；当前时间线、周末显隐 | 其 v2.2 更新日志明确修复“连堂与同格多课的节次错位”“同格多段课程只保留一段”——正是我们现在的 bug；规则包思路适合后续扩展更多教务格式 |
| [better-class-schedule（RO-M-A）](https://github.com/RO-M-A/better-class-schedule) | 网格 + 扁平表双解析；表头别名表；支持 `1-16周(单)`、`{2-16周(双)}`、`1-8,10-16周`、`周一第1-2节 教101`；识别结果可预览勾选；`weeks` + `weeksText` 双字段 | 可直接借鉴其解析分层（先抽周次→星期→节次→时间→剩余文本→地点）与周次文法；其 `weeks: number[] | null` 模型比裸 `odd/even` 更可控 |
| [ClassIsland](https://github.com/ClassIsland/ClassIsland) | 多周轮换、**单日/跨天临时换课**、提前预定课表、可编辑时间表、Excel 导入导出 | 印证“调停补课”应是独立于循环规则的一等能力；时间表（节次作息）应可配置 |
| [WakeUp 课程表 Kotlin 版](https://github.com/Cerbur/WakeupSchedule_Kotlin) + [CSV 导出脚本](https://github.com/LuBanQAQ/dnui-wakeup-export) | 事实标准 CSV：`课程名称,星期,开始节数,结束节数,老师,地点,周数`；星期 1-7 | 最低成本兼容生态：既支持导入这类 CSV，也可导出给 WakeUp；同时暴露我们 `parseDay` 不认 7 的问题 |

> 结论：不需要引入任何新依赖，也不需要改数据库字段。把“周次规则”和“某一天的例外”分开建模，用一套可测试的纯函数解析器替换现有固定格式解析，再把周视图改成按分钟布局即可。

---

## 4. 目标设计

### 4.1 周次语义（P0）

定义：**第 1 周 = 学期开始日期所在自然周的周一 ~ 周日**；周次范围 `1..totalWeeks`，超出即“未开学/已结束”。

新增/调整 `src/lib/semester.ts`：

```ts
export type WeekPattern =
  | { type: 'all' }
  | { type: 'odd'; maxWeek?: number }
  | { type: 'even'; maxWeek?: number }
  | { type: 'weeks'; weeks: number[] };

export function firstMondayOf(startDate: string): string;
export function weekNumberOn(semester: ISemester, date: Date): number | null;
export function weekStartOf(semester: ISemester, week: number): Date;
export function isWeekActive(pattern: WeekPattern, week: number, totalWeeks: number): boolean;
export function formatWeekPattern(pattern: WeekPattern, totalWeeks: number): string;
export function parseWeekText(text: string, totalWeeks: number): WeekPattern | null;
```

规则：

- `startDate` 为空/非法 → 返回 `null`，UI 明确提示“请先设置学期开始日期”，不再静默把所有课当全周；
- `odd/even` 以 `totalWeeks` 为上界（已有记录不需要迁移，缺省 `maxWeek = semester.totalWeeks`）；
- 有限范围（`1-16`、`1-16(单)`、`1-8,10-16`）**统一展开为 `weeks` 数组**，显示时再压缩成 `1-16周(单)` 文案；
- 所有“某天有哪些课”的查询收敛到 `src/lib/schedule/occurrences.ts`，今日页与课表页共用，杜绝两套逻辑。

**不改 schema 字段**；`ISemester` 只新增可选 `firstMonday?`（不填则从 `startDate` 推导），`IScheduleSlot` 新增可选 `weeksText?` / `periodStart?` / `periodEnd?` 用于展示与回填。

### 4.2 导入管线（P0）

新增模块 `src/modules/schedule/import/`：

```
normalize.ts   // 全角转半角、空白、括号统一
weeks.ts       // parseWeekText / formatWeekPattern（与 UI 共用）
periods.ts     // 节次 ↔ 时间（读取学期作息，缺省内置）
grid.ts        // 二维网格：表头检测、合并单元格、同格多课、连堂
flat.ts        // 扁平表：表头别名、组合列、多段拆分、WakeUp CSV
index.ts       // parseScheduleRows() 统一入口
```

算法要点：

1. **网格检测**：前 30 行中找“星期列 ≥ 3 个”的行作为表头；星期列按 `周一/星期一/礼拜一/一` 映射；节次列取表头含 `节次|节|时间` 的列，或星期列左侧最近的数字列。
2. **合并单元格**：读取 xlsx `!merges`，把值铺满合并区域；课程只在左上角生成一次，`rowspan` 转为 `endPeriod`（连堂正确跨 2~4 节）。
3. **同格多课**：先按空行分块；无空行时按“周次/节次关键字”切分；每块独立解析，不再按固定 3 行。
4. **周次文法**（优先级从高到低）：`{...}` > `第?1-16周(单|双)` > `1-8,10-16周` > `单周/双周` > 无（`all`）。范围一律展开成数组。
5. **节次/时间**：`1-2节`、`第1,2节`、`(1-2)`、`08:00-09:40` 都识别；只有节次时用作息表换算；两者都没有才落默认值并给 warning。
6. **剩余文本**：先剥离周次/节次/星期/时间，再按 `教师:` `场地:` `校区:` 提取；其余行按“课程名可能折行”规则合并；首行优先作为课程名。
7. **扁平表**：表头别名覆盖 `课程名称/教师/教室/星期/节次/周次/开始节数/结束节数/周数/起止时间/上课时间`；单元格内多段用 `;`/换行拆分；`星期` 同时接受 `1-7`（7=周日）与 `周一`。
8. **AI 兜底**：prompt 增加作息表、`weeksText` 字段和“必须保留单双周/周次范围”的强约束；返回后按学期总周数校验/裁剪，若原文含“单/双/周”但 AI 全给 `all`，标记 warning 而不是静默接受。

**预览与导入**：

- 预览表增加“周次”列（chips 展示 + 可编辑文本），任何一行可改星期/节次/周次后重新校验；
- 统计改为：`新增 X / 更新 Y / 跳过 Z / 冲突 N`；
- 冲突检测必须带周次交集（同一时段但周次不重叠不算冲突）；
- 导入模式：`合并（默认，相同 key 跳过）` / `覆盖同位置（按 课程名+星期+开始时间 更新，保留 id）`；两种都记录到现有撤销记录；
- 去重 key 改为 `title|dayOfWeek|startMin|endMin|weekSignature`，同格分段不再互吞；重新导入改周次时走“覆盖”而不是静默跳过。

**兼容**：支持 WakeUp CSV（`课程名称,星期,开始节数,结束节数,老师,地点,周数`），并新增“导出 CSV”按钮（同一格式），方便用户校对与迁移。

### 4.3 周视图 UI 重做（P1）

组件拆分：

```
SchedulePage.tsx               // 数据 + 周状态 + 工具栏
components/TimetableGrid.tsx   // 按分钟绝对定位的 7 天网格
components/CourseCard.tsx      // 课程卡（颜色、周次徽标、当前课）
components/WeekStrip.tsx       // 1..N 周快捷切换
components/DayAgenda.tsx       // 移动端单日议程
components/CourseDetailSheet.tsx // 详情 + 编辑/删除/本周调整
components/WeekPatternEditor.tsx // 周次选择器（全选/单双/点选 1..N）
```

布局：

- **按分钟定位**：`pxPerMin ≈ 1.2`，可视范围从 `min(08:00, 最早课)` 到 `max(21:00, 最晚课)`；卡片 `top = (startMin - rangeStart) * pxPerMin`，`height = duration * pxPerMin`，不再夹取到固定节次；
- 左侧时间轴每 30 分钟一条虚线刻度，整点加粗；表头（星期 + 日期 + 今天）`sticky`；
- 同一天的课程做 **lane 分栏**（区间图着色），重叠课程并排显示；
- 今日显示 **当前时间红线**，每分钟更新；已结束课程降透明度；
- 顶部 `WeekStrip`：`第 1..N 周` 胶囊，当前周高亮，非本周显示“非本周”提示与“回到本周”；
- 移动端（`useIsMobile`）：7 列改为“星期 Tab + 当日议程”，保留左右滑周；
- 空网格显示轻量引导“点击空白格添加课程”，点击空白按 30 分钟吸附预填。

视觉（对齐 `studydesk-ui-system`）：

- 课程卡：`rounded-xl`、`colorWithAlpha(color,'22')` 背景、3px 左侧色条、标题 14~15px/600、地点 12px muted、右上角周次徽标（`1-16周` / `单周` / `本周调整`）；
- 今天列：`bg-primary/5` + 顶部主色日期；当前课：主色 ring + 轻微阴影；
- 全部替换硬编码 `blue/gray` 为 `primary/muted/border` token；深色模式逐项校验；
- 不引入动画库，使用现有 CSS transition；不新增玻璃材质写法，统一 `.glass-card`。

交互：

- 点卡片 → 详情 Sheet：循环规则、本周例外、编辑/删除；
- 「本周调整」：停课 / 调课（改日期、时间、地点）/ 补课（added），写 `schedule_overrides`，卡片显示“调/停/补”徽标；
- 编辑循环课程时明确提示“将影响所有上课周”，并提供“只改本周”跳转；
- 添加课程表单：周次用 `WeekPatternEditor`（1..N 点选、全选、单周、双周、清空），实时预览“共 N 周，第 1-16 周(单)”。

### 4.4 学期与作息设置（P1）

- 学期开始/结束日期改为必填；保存时校验并显示“第 1 周：9月1日（周一）~ 9月7日”；
- 作息表（1~12 节的开始/结束）可编辑，存 `settings` 表（key `schedule.periods`），导入与网格共用；
- 周末显隐、每周起始日（周一）作为设置项。

---

## 5. 方案对比

| 方案 | 内容 | 工作量 | 风险 | 适用 |
|---|---|---|---|---|
| A. 最小修复 | 周次引擎 + 周次正则 + 去重 key + 星期 7 + 表单周次选择器 | 小（1 个 phase） | 低；导入复杂表格仍会失败，UI 不变 | 只想先止血 |
| **B. 推荐（v1.2.0）** | A + 导入管线重写 + 可编辑预览 + 调停补课 + 周视图重做 | 中（4 个 phase） | 中；集中在 schedule，可逐 phase 验收/回滚 | 三个问题都要解决 |
| C. 全量扩展 | B + 多课表、ICS、课表分享图、上课提醒、学校规则包 | 大（6+ phase） | 高；涉及新能力与更多 UI | 后续版本 |

**推荐 B**：先把“周次正确 + 导入可控 + 调停补课”做成可信基础，再重做周视图；每个 phase 独立可发布、可回滚。

---

## 6. 建议的 phase 合同（确认后写入 manifest）

```yaml
- id: 06-week-engine
  name: 周次引擎与今日/课表口径统一
  allow_paths: ["src/lib/semester.ts", "src/lib/schedule/**", "src/db/aggregate/today.ts", "src/pages/SchedulePage/**", "src/pages/SettingsPage/**", "tests/**"]
  forbid_paths: ["src/db/schema.ts", "src/components/ui/**"]
  verify: ["npm run typecheck", "npm run test:schedule"]

- id: 07-import-pipeline
  name: 课表导入管线重写（网格/扁平/WakeUp CSV/AI）
  depends_on: ["06-week-engine"]
  allow_paths: ["src/modules/schedule/**", "src/pages/SchedulePage/CourseImportDialog.tsx", "src/db/repositories/schedule.ts", "tests/**"]
  forbid_paths: ["src/db/schema.ts"]
  verify: ["npm run typecheck", "npm run test:schedule"]

- id: 08-timetable-ui
  name: 周视图按分钟重做 + 移动端议程 + token 化
  depends_on: ["06-week-engine"]
  allow_paths: ["src/pages/SchedulePage/**", "src/components/MonthCalendar.tsx", "src/index.css"]
  verify: ["npm run typecheck", "npm run build"]

- id: 09-overrides
  name: 本周停课/调课/补课入口
  depends_on: ["08-timetable-ui", "07-import-pipeline"]
  allow_paths: ["src/pages/SchedulePage/**", "src/db/repositories/schedule.ts", "src/db/aggregate/today.ts"]
  verify: ["npm run typecheck", "npm run build"]

- id: 10-quality-gate
  name: 质量闸门
  depends_on: ["09-overrides"]
  verify: ["npm run typecheck", "npm run lint:eslint", "npm run build", "npm run test:schedule"]
```

测试不引入新依赖：Node 24 原生支持 `.ts` 类型剥离，`node --test tests/*.test.ts` 即可；测试覆盖周次边界、周次文法、网格合并、同格多课、WakeUp CSV、扁平表别名。

---

## 7. 验收标准（必须可执行）

### 自动化

- [ ] `npm run typecheck` 退出码 0
- [ ] `npm run lint:eslint` 退出码 0
- [ ] `npm run build` 退出码 0
- [ ] `npm run test:schedule` 全部通过，至少覆盖：
  - [ ] 周一/周二开学，第 1 周起始日正确，开学前返回 null
  - [ ] `1-16周(单)` 在第 16 周后不再匹配；`{2-16周(双)}` 只匹配 2..16 的偶数周
  - [ ] 同一格两门课、连堂合并单元格、跨行续接
  - [ ] `星期=7` 的 WakeUp CSV 导入为周日
  - [ ] 去重键区分“1-8 周”和“10-16 周”两段

### 手动

- [ ] 导入 3 种真实格式（正方 Excel 网格、扁平 CSV、粘贴文本），预览周次正确、可编辑
- [ ] 同一门课导入 `1-8周` + `10-16周` 两段，第 9 周不显示，第 10 周显示
- [ ] 第 1 周与第 9 周课表不同；单双周课程只在对应周出现
- [ ] 点击课程 → 本周停课 → 仅该周消失，其他周正常
- [ ] 08:00 早课与 20:50 晚课位置准确，不被夹取
- [ ] 两门重叠课程并排显示
- [ ] 深色模式、375px 宽度、1280px 宽度下无横向溢出
- [ ] 设置学期开始日期为周二，第 1 周仍从该周周一开始

---

## 8. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 周次语义变化导致旧数据“看起来变了” | 这是修复：旧 `odd/even` 之前无上界；现在按总周数收敛。发版说明中写明；不改数据库字段 |
| 导入“覆盖同位置”误删 | 默认“合并”；覆盖模式只在用户显式选择时启用；复用现有撤销记录，记录 updated/created id |
| UI 重做引入回归 | 保留旧周视图组件直到 08 phase 验收通过；按 phase 提交，可回滚到 `v1.1.0` |
| 解析器覆盖不全 | 先覆盖 3 类真实格式 + WakeUp CSV；保留 AI 兜底与“可编辑预览”，解析失败不静默导入 |
| 新增依赖 | 不新增；测试用 Node 原生 TS；作息表用 `settings` 表，不动 schema |
| 与今日页不一致 | 抽出 `occurrences.ts` 单一入口，Today 与 Schedule 共用 |

---

## 9. 不做的事

- 不改 `src/db/schema.ts` 字段名/索引，不做破坏性迁移
- 不引入 Zustand / 新图表库 / 新动画库
- 不重写任务、笔记、刷题等无关模块
- 不做云同步、账号体系、教务系统自动登录
- 不做多课表 / 学校规则包 / ICS 双向同步（后续版本候选）

---

## 10. 实施结果（2026-10-19）

| 计划项 | 落地文件 | 验证 |
|---|---|---|
| 周次引擎（周一锚定 / 上界 / 第 0 周） | `src/lib/semester.ts` | `tests/semester.test.ts` 6 例 |
| 今日/课表统一取课 | `src/lib/schedule/occurrences.ts`、`src/db/aggregate/today.ts` | `tests/occurrences.test.ts` 6 例 |
| 导入管线（网格/合并/同格多课/扁平/WakeUp CSV） | `src/modules/schedule/import/**` | `tests/schedule-import.test.ts` 7 例 |
| 可编辑预览 / merge-replace / 撤销恢复 | `CourseImportDialog.tsx`、`db/repositories/schedule.ts` | typecheck + 手工审查 |
| 周视图（分钟网格 / 重叠分栏 / 移动端议程） | `pages/SchedulePage/components/**` | build + 代码审查 |
| 调停补课 | `CourseDetailDialog.tsx`、`OverrideDialog.tsx`、`occurrences.ts` | 停课/调课/补课测试 |
| ICS / 分享图 / 提醒 / 作息 | `modules/schedule/ics.ts`、`lib/schedule/shareImage.ts`、`lib/schedule/reminders.ts`、`SettingsPage.tsx` | `tests/ics.test.ts` 3 例 + build |
| 版本与文档 | `package.json` 1.2.0、`CHANGELOG.md`、`AGENTS.md`、`README.md` | 版本一致性检查 |

`npm run test:schedule` 共 **22/22** 通过；`typecheck` / `eslint` / `build` 全部退出码 0。

未覆盖：headless 浏览器在虚拟时间模式下 IndexedDB 不回调，自动截图停留在加载态；建议在真实浏览器刷新 `http://localhost:31251/#/schedule` 做一次视觉与交互走查。Electron 安装包未重出。
