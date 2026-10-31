# Changelog

本项目从 1.1.0 起记录版本变更；1.0.0 为备份后冻结的基线。

## 1.2.0 · 2026-10-19

课表模块专项重构（方案 C：正确性 + 导入 + UI + ICS/分享图/提醒）。

### 修复：周次不再“每周都一样”

- **第 1 周锚定周一**：`weekNumberOn()` 以“学期开始日期所在自然周的周一”为第 1 周起点，非周一开始的学期不再错位。
- **消灭第 0 周**：开学前 / 学期结束后返回 `null`，不再出现“第 0 周”，也不会把 0 当双周。
- **单双周有上界**：`odd/even` 按 `totalWeeks` 收敛；`1-16周(单)` 不再在第 17、19 周出现。
- **统一口径**：今日页与课表页共用 `coursesOnDate()`；学期开始/结束日期改为必填，并预览第 1 周周一。
- **表单周次选择器**：1..N 周点选、全选 / 单周 / 双周 / 清空，实时显示 `1-15周(单)` 等文案。

### 修复：导入识别

- 新增 `src/modules/schedule/import/`：表头检测、合并单元格、同格多课、连堂跨节次、扁平表、WakeUp CSV。
- 周次文法支持 `{2-16周(双)}`、`1-16周(单)`、`1-8,10-16周`、`单周/双周`、`第7周`。
- WakeUp CSV 兼容：`课程名称,星期,开始节数,结束节数,老师,地点,周数`，星期 7 = 周日。
- 导入预览新增“周次”列且可逐行修改；支持“合并（跳过重复）”与“覆盖同位置课程”。
- 去重键改为 `课程名 + 星期 + 起止时间 + 周次`，同格分段不再互吞；覆盖导入可撤销并恢复旧记录。
- AI prompt 增加作息表与 `weeksText` 约束，AI 返回的周次按学期总周数校验；ICS 导入支持单次事件与 WEEKLY RRULE。
- 移除旧的固定 3 行网格解析器。

### UI：周视图重做

- 按分钟绝对定位（不再按固定节次下标），早课/晚课位置准确；重叠课程自动分栏。
- 今天列高亮、当前时间红线、课程卡周次/调补徽标、点击空白格快速添加。
- 新增 1..N 周快捷条、移动端单日议程、图例；颜色收敛到 `primary/muted/border` token。
- 课程详情 Sheet：编辑循环课程 / 本周停课 / 本周调课 / 删除 / 撤销调整。

### 新能力

- **调停补课**：`schedule_overrides` 的 off/move/added 首次接入 UI；move 新增可选 `fromDate` 支持跨周调课。
- **ICS**：导出当前学期全部课程（含调停补课）；导入外部 ICS 并按同课合并周次。
- **分享图**：canvas 渲染当前周为 PNG，一键下载。
- **上课提醒**：应用打开期间按提前 0/5/10/15/20 分钟发系统通知。
- **作息表**：设置页可编辑 1~10 节起止时间，存 `settings.schedule.periods`。

### 验证

| 项目 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint:eslint` | 退出码 0（0 error / 0 warning） |
| `npm run build` | 退出码 0（SchedulePage chunk 71 kB，precache 81 entries） |
| `npm run test:schedule` | 22/22 通过（周次 6 + 叠加 6 + 导入 7 + ICS 3） |

### 已知事项

- 提醒仅在应用打开期间生效；应用关闭后不驻留通知。
- 本轮未重出 Electron 安装包；发布前需 `npm run dist` 并人工走查。
- headless 浏览器的 IndexedDB 在 `--virtual-time-budget` 下不回调，自动截图只能看到加载态；UI 已做代码审查与构建验证，建议刷新 31251 页面做一次人工视觉走查。
- “覆盖同位置”按 `课程名+星期+开始时间` 更新单条记录；同一门课多个周次段的批量覆盖仍建议先删除旧段再导入。

## 1.1.0 · 2026-10-19

稳定性、性能与契约同步迭代（基线 tag `v1.0.0-baseline`）。

### 修复

- **DocsPage 适配 pdfjs-dist 6.4**：`page.render()` 现在必须显式传 `canvas`；文档销毁改为 `loadingTask.destroy()`，并用 `try/finally` 保证异常时也释放 worker 连接。
- **pdf worker 单例**：从模块级 `let` 改为组件 `useRef`，消除 ESLint `react-hooks/globals` error，也不再有渲染期改写模块变量的隐患。
- **hooks 依赖告警清零**：ChatPage 会话加载、FocusPage 删除任务、HabitsPage 跨午夜刷新、SettingsPage 导入回调。
- **未使用导入清理**：quiz parsers、schedule extractText。
- **PWA 预缓存失效**：`miaodaOutputPlugin` 会在 `closeBundle` 删除 `dist/client`，而 VitePWA 默认最后执行，导致 SW 扫描不到任何资源（3 entries / 0 KiB）。为 VitePWA 设置 `integration.closeBundleOrder: 'pre'` 后恢复为 **80 entries / 4.9 MB**，`sw.js` 随 `dist/output` 一起发布。
- **Electron 打包资源缺失**：`index.html` 引用 `./assets/*`，但构建只把 assets 放进 `dist/output_resource`，而 electron-builder 只收 `dist/output`，安装包会因找不到 JS/CSS 白屏。无 CDN 前缀时（本地 / Electron 构建）现在会同时写入 `dist/output/assets`，并已验证 index.html 的全部引用均存在。

### 性能

- **文档页重依赖按需加载**：`pdf-lib`、`docx-preview` 改为转换时动态 `import()`，不再进入首屏。
  - 首屏 `index` chunk：**1,048 kB → 456 kB**（gzip 370 kB → 145 kB）。
  - 拆出 `pdf-lib`（428 kB）、`docx-preview`（76 kB）、`jszip`（96 kB）等按需 chunk。
- 首屏不再为未打开的文档转换功能付出下载成本。

### 设计系统

- 新增 `--glass-*` 材质 token（浅色 / 深色两套）与 `.glass-card` / `.glass-panel` / `.glass-chip` 类，作为玻璃效果唯一入口。
- `GlassCard`、`StatChip` 改用玻璃类，移除组件内的 rgba / backdrop-filter 魔法值；`EmptyState` 的行动按钮改用语义阴影；视觉参数与 1.0.0 保持一致。

### 文档与契约

- `AGENTS.md`：表数量修正为 **29**（22 基础 + 5 quiz + 2 chat，Dexie v1–v5），补充版本与备份说明。
- `studydesk-ai-tools` skill：工具清单修正为 **17 个**，补登 `finish_task`、`clear_schedule`，参数名与 JSON Schema 对齐（snake_case），删除协议改为描述当前 `window.confirm` 实现。
- `studydesk-architect` skill：表数量与图表技术栈修正。
- `studydesk-ui-system` skill：废弃 `--sd-*` 平行 token，改为记录实际的 `tailwind-theme.css` 语义变量与 `--glass-*`。
- `README.md`：从模板占位替换为真实项目说明（HashRouter、脚本、目录、数据策略）。
- `StudyDesk功能文档.md`：标注对应代码版本 1.1.0。

### 版本与基线

- `package.json` 版本 1.0.0 → **1.1.0**。
- 新增 `backups/studydesk-v1.0.0-<timestamp>/` + `.zip` + `BACKUP-MANIFEST.md`（190 个文件逐文件 SHA-256，全部一致）。
- git 基线提交与 tag `v1.0.0-baseline`，发布 tag `v1.1.0`。

### 验证

| 项目 | 结果 |
|---|---|
| `npm run typecheck` | 退出码 0 |
| `npm run lint:eslint` | 退出码 0（0 error / 0 warning） |
| `npm run build` | 退出码 0 |
| PWA 预缓存 | 80 entries / 4,993 KiB |
| 首屏 index chunk | 455.87 kB（gzip 145.22 kB） |

### 已知事项 / 后续候选

- 本轮未重出 Electron 安装包；`npm run dist` 需在发布前单独执行并人工走查安装/便携版。
- 未执行浏览器自动化 GUI 测试（环境无 Playwright），视觉与交互仅做静态审查。
- 依赖审计：`echarts`、`echarts-for-react`、`framer-motion`、`@gsap/react`、`gsap` 在当前 `src/` 中无引用；按架构闸门"依赖变更需单独确认"，本轮仅记录，建议 1.2.0 确认后移除。
- ChatPage / DocsPage 仍有 `bg-gray-*` / `bg-blue-*` 等非语义色，建议作为独立 UI phase 迁移到 token。

## 1.0.0 · 2026-10-16 基线

- 14 个功能模块 + 29 张表（Dexie v1–v5）+ 17 个 AI 工具。
- 备份与基线冻结见 `backups/` 与 tag `v1.0.0-baseline`。
