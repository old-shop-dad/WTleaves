---
name: studydesk-ai-tools
description: StudyDesk AI 助手 Function Calling 工具定义与调用规范。增删改 AI 工具、修改工具参数协议、工具调用循环、删除保护、DeepSeek 集成时必须加载。触发词：AI 工具、Function Calling、add_expense、delete_、工具协议、DeepSeek 集成。
---

# StudyDesk AI 工具协议

AI 助手的工具链是核心差异化能力，也是最容易被"改坏"的部分。本 Skill 固化工具定义与调用循环的协议。

## 1. 现状基线（契约快照）

- 入口：`src/pages/ChatPage/ChatPage.tsx`（TOOLS 数组）
- AI 调用：DeepSeek API，SSE 流式，`deepseek-reasoner` / 自定义 model 可选
- 配置：`src/modules/quiz/ai/storage.ts`（loadAiConfig：API Key + 模型）
- 客户端：`src/modules/quiz/ai/client.ts`
- 数据写入：一律走 `db/repositories/*` 仓库层

## 2. 工具清单（当前 17 个，契约）

> 参数名以 `ChatPage.tsx` 中 TOOLS 的 JSON Schema 为准（snake_case）；下表是协议摘要。

| 工具 | 参数 | 协议契约 |
|---|---|---|
| `add_expense` | (category_id, amount, note?, date?) | category_id ∈ food/transport/study/entertainment/shopping/daily/other；amount 必填正数、单位元；date 用 `YYYY-MM-DD`，缺省今天 |
| `add_income` | (category_id, amount, note?, date?) | category_id ∈ allowance/parttime/bonus；其余同 add_expense |
| `create_note` | (title, content) | 两者必填；content 为 Markdown |
| `add_task` | (title, due_date?) | title 必填；due_date 用 `YYYY-MM-DD`，未提及具体日期时留空 |
| `add_course` | (title, day_of_week, start_hour, end_hour, location?, teacher?, week_pattern?, weeks?) | day_of_week 1=周一..7=周日；start/end_hour 为小数小时（8.5=8:30）；week_pattern ∈ all/odd/even/weeks；weeks 为周次数组 |
| `add_quiz_question` | (bank_name, type, stem, answer, options?, explanation?, difficulty?) | type ∈ single/multiple/judge/fill/short；answer/options 为字符串数组；题库不存在时自动创建 |
| `get_today_schedule` | () | 只读 |
| `get_today_tasks` | () | 只读 |
| `get_today_finance` | () | 只读 |
| `finish_task` | (title_keyword) | 按标题关键词匹配任务并置为已完成 |
| `add_habit_log` | (habit_name) | 幂等：同一天重复打卡不重复计 |
| `delete_finance_record` | (amount, note_keyword?) | 高危：按金额 + 备注定位并展示可读摘要，确认后软删除 |
| `delete_note` | (title_keyword) | 高危：摘要 = 标题，确认后软删除 |
| `delete_course` | (course_name) | 高危：摘要 = 课程名 + 星期 + 节次 |
| `clear_schedule` | () | **最高危**：清空当前学期全部课程，需连续两次确认 |
| `delete_task` | (title_keyword) | 高危：摘要 = 任务标题 |
| `delete_quiz_bank` | (bank_name) | 高危：摘要 = 题库名 + 题目数量 |

## 3. 工具定义最小化原则

1. **小而单一**：每个工具只做一件事，便于测试与控制。
2. **输入校验**：工具参数必须校验（金额为正数、枚举合法性、日期格式），**不要盲目信任 AI 生成的参数**。
3. **歧义不猜测**：参数缺失或歧义 → 返回结构化 error，让 AI 追问用户，而不是填默认值。
4. 错误返回格式统一：`{ ok: false, error: { code, message, retryable } }`。

## 4. 多轮调用循环终止条件

- 工具返回 error 且 `retryable: true`（参数缺失/格式错）→ AI 追问用户修正，**不计入轮数上限**
- 工具返回 error 且 `retryable: false`（数据库约束冲突、对象不存在）→ **终止循环**并告知用户
- 高危操作（删除类）二次确认未通过 → **终止该工具执行**，不重试
- 轮数上限：**最多 5 轮工具调用**，超限后把已收集结果汇总给用户

## 5. 删除操作统一协议

- 删除类工具（`delete_*` / `clear_schedule`）必须在执行前弹确认，确认信息展示**被删除对象的可读摘要**（不是裸 ID）：
  - 好：`确认删除《高等数学》题库？共 128 题将一并删除`
  - 坏：`确认删除 bank_42？`
- 当前实现：`executeTool` 内用 `window.confirm` 展示摘要（`clear_schedule` 连续两次确认）；后续如迁移到 AlertDialog，摘要要求不变
- 确认通过后执行**软删除**（`deletedAt = Date.now()`），不物理删除；如产品需要物理清理另走专用流程
- 界面侧同步用 AlertDialog 二次确认（参考 TasksPage / QuizPage 现有模式）

## 6. 修改工具的流程

1. 先在 §2 表格中登记/更新工具契约（签名 + 协议）
2. 更新 `ChatPage.tsx` 的 TOOLS 数组（name/description/parameters 的 JSON Schema）
3. 更新执行函数：调仓库层写入 + 校验 + 错误返回
4. 删除类工具必须挂确认保护
5. 验证：在 `/chat` 用自然语言触发该工具，检查数据落库
