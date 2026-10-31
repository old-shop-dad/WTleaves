// AI 聊天页面：DeepSeek 多轮对话，仿 DeepSeek 官网 UI
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Trash2, Plus, Search, FileImage, AlertCircle, BrainCircuit, Globe, Wrench, CheckCircle2, XCircle, Square, Loader2, ChevronDown, ChevronUp, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/db/db';
import { loadAiConfig } from '@/modules/quiz/ai/storage';
import { settingsRepo } from '@/db/repositories/settings';
import type { IChatConversation, IChatMessage } from '@/db/types';
import { categoryById } from '@/lib/finance-categories';
import { cn } from '@/lib/utils';

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  toolOk?: boolean;
  /** 工具卡片状态：running=调用中 confirm=待用户确认 done=终态（历史还原默认 done） */
  status?: 'running' | 'confirm' | 'done' | 'error';
  /** 本次调用参数 JSON 字符串（可展开查看） */
  args?: string;
  /** 待删除条目预览（confirm 卡） */
  targets?: { label: string; extra?: string }[];
  /** 确认卡片唯一 key（本会话内唯一即可） */
  confirmKey?: string;
}

/** 模块级时间戳，避免在组件渲染路径中直接调用 Date.now() */
const nowTs = () => Date.now();

// 阶段四：默认人设（可在设置页修改，存 settings:studydesk:chat-system-prompt）
const DEFAULT_SYSTEM_PROMPT = '你是 StudyDesk 桌面助手"周小如"，拥有应用的全部操作权限：记账、写笔记、加任务、加课表、入题库、查询今日安排、完成任务、打卡、删除记录。规则：\n1. 凡是记账、删除、新增笔记/任务/课程、完成任务、打卡等写操作，必须先调用对应工具完成，绝不允许只在回复里说"已记录/已删除/已完成"却不调用工具（那会被视为说谎）\n2. 工具执行失败（返回 ok:false）时必须如实告诉用户"操作未成功"并说明原因，不得谎称成功\n3. 查询类工具（get_today_*）只读，随便用\n4. 删除类工具（delete_*/clear_schedule）会在消息流里弹出确认卡片，用户确认后才真正执行，直接调用并等待确认结果即可\n5. 一次导入文件就循环调用工具逐批处理，完成后用一句话总结结果\n6. 不知道数据时先查询再操作，不要瞎编 ID';

// 阶段四：上下文窗口裁剪——最近保留消息条数，更早的由摘要替代
const MAX_HISTORY_MSGS = 20;

// 阶段四：删除类工具集合（走消息流内嵌确认卡片，不再用浏览器原生 confirm()）
const DELETE_TOOLS = new Set(['delete_finance_record', 'delete_note', 'delete_course', 'clear_schedule', 'delete_task', 'delete_quiz_bank']);

// C5: 本地时区日期串，替代 new Date().toISOString().slice(0,10)（UTC，早 8 点会跨天）
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// C11: 完整 HTML 实体解码（补全 &quot; &apos; 及数字实体）
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// ============ 工具定义（OpenAI 兼容 function calling） ============
// 谎报检测：AI 回复中出现这些"完成声明"但本轮未调用任何工具时，向用户提示核实
const FAKE_CLAIM_RE = /已删除|已删掉|已记录|已记好|已新增|已创建|已添加|已写入|已入账|已打卡|打卡成功|已标记完成|已完成为/;
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'add_expense',
      description: '记一笔支出（吃饭、交通、购物等）',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', enum: ['food','transport','study','entertainment','shopping','daily','other'], description: '支出分类 id：food=餐饮, transport=交通, study=学习, entertainment=娱乐, shopping=购物, daily=日用, other=其他' },
          amount: { type: 'number', description: '金额（元），正数' },
          note: { type: 'string', description: '备注，如"午饭""地铁"' },
          date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
        },
        required: ['category_id','amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_income',
      description: '记一笔收入（生活费、红包、兼职等）',
      parameters: {
        type: 'object',
        properties: {
          category_id: { type: 'string', enum: ['allowance','parttime','bonus'], description: 'allowance=生活费, parttime=兼职, bonus=红包' },
          amount: { type: 'number', description: '金额（元），正数' },
          note: { type: 'string', description: '备注' },
          date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
        },
        required: ['category_id','amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: '新建一条笔记',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '笔记标题' },
          content: { type: 'string', description: '笔记正文' },
        },
        required: ['title','content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: '新建一个待办任务/DDL',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '任务标题' },
          due_date: { type: 'string', description: '截止日期 YYYY-MM-DD；如果没提具体日期就留空' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_course',
      description: '往课表加一门课（用于聊天里上传课表文件后批量导入）',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '课程名，如"高等数学"' },
          day_of_week: { type: 'number', enum: [1,2,3,4,5,6,7], description: '星期几：1=周一, 2=周二, ... 7=周日' },
          start_hour: { type: 'number', description: '开始小时，如 8.5 表示 8:30, 14 表示 14:00' },
          end_hour: { type: 'number', description: '结束小时，如 10 表示 10:00' },
          location: { type: 'string', description: '教室地点，没有就留空字符串' },
          teacher: { type: 'string', description: '老师名，没有就留空字符串' },
          week_pattern: { type: 'string', enum: ['all','odd','even','weeks'], description: '周次：all=全周, odd=单周, even=双周, weeks=指定周次（需配合 weeks 参数）' },
          weeks: { type: 'array', items: { type: 'number' }, description: '当 week_pattern=weeks 时，指定具体周次数组，如 [7] 表示只在第7周上, [1,2,3,7,8,9] 表示第1,2,3,7,8,9周上' },
        },
        required: ['title','day_of_week','start_hour','end_hour'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_quiz_question',
      description: '往题库加一道题（用于聊天里上传题目文件后批量导入）。如果题库不存在会自动创建。',
      parameters: {
        type: 'object',
        properties: {
          bank_name: { type: 'string', description: '题库名，如"Spark期末复习"；同一文件的题用同一个 bank_name' },
          type: { type: 'string', enum: ['single','multiple','judge','fill','short'], description: '题型：single=单选, multiple=多选, judge=判断, fill=填空, short=简答' },
          stem: { type: 'string', description: '题干（去掉选项）' },
          options: { type: 'array', items: { type: 'string' }, description: '选项文本数组，如 ["A 选项内容","B 选项内容"]；判断题传 ["对","错"]；填空/简答传空数组' },
          answer: { type: 'array', items: { type: 'string' }, description: '正确答案数组，如 ["A"] 或 ["对"] 或 ["RDD"]' },
          explanation: { type: 'string', description: '答案解析，没有就留空字符串' },
          difficulty: { type: 'number', enum: [1,2,3,4,5], description: '难度 1-5，默认 3' },
        },
        required: ['bank_name','type','stem','answer'],
      },
    },
  },
  // 查询类（只读，安全）
  {
    type: 'function',
    function: {
      name: 'get_today_schedule',
      description: '查询今天的课程表（返回今天所有课的时间、课程名、教室、老师）',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_tasks',
      description: '查询今天待办的任务/DDL（返回未完成的任务列表和截止时间）',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_today_finance',
      description: '查询今天的记账流水（返回今天所有收支和合计）',
      parameters: { type: 'object', properties: {} },
    },
  },
  // 操作类
  {
    type: 'function',
    function: {
      name: 'finish_task',
      description: '把一个任务标记为已完成',
      parameters: {
        type: 'object',
        properties: { title_keyword: { type: 'string', description: '任务标题关键词，用于匹配要完成的任务' } },
        required: ['title_keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_habit_log',
      description: '给某个习惯打卡（如"今天背单词了"）',
      parameters: {
        type: 'object',
        properties: { habit_name: { type: 'string', description: '习惯名关键词，如"背单词""喝水""运动"' } },
        required: ['habit_name'],
      },
    },
  },
  // 删除类（会弹确认框）
  {
    type: 'function',
    function: {
      name: 'delete_finance_record',
      description: '删除一条记账记录（按金额+备注匹配），会弹确认框',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: '要删除的记录金额' },
          note_keyword: { type: 'string', description: '备注关键词，用于定位具体哪条' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_note',
      description: '删除一篇笔记（按标题关键词），会弹确认框',
      parameters: {
        type: 'object',
        properties: { title_keyword: { type: 'string', description: '笔记标题关键词' } },
        required: ['title_keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_course',
      description: '删除一门课（按课程名关键词），会弹确认框',
      parameters: {
        type: 'object',
        properties: { course_name: { type: 'string', description: '课程名关键词，如"高等数学"' } },
        required: ['course_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_schedule',
      description: '清空当前学期所有课程（高危操作，会二次确认）',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: '删除一个任务（按标题关键词），会弹确认框',
      parameters: {
        type: 'object',
        properties: { title_keyword: { type: 'string', description: '任务标题关键词' } },
        required: ['title_keyword'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_quiz_bank',
      description: '删除整个题库及其所有题目（高危，按题库名），会弹确认框',
      parameters: {
        type: 'object',
        properties: { bank_name: { type: 'string', description: '题库名关键词' } },
        required: ['bank_name'],
      },
    },
  },
];

// 本地执行工具
async function executeTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: string }> {
  try {
    if (name === 'add_expense' || name === 'add_income') {
      const amount = Number(args.amount);
      if (!amount || amount <= 0) return { ok: false, result: '金额无效' };
      const date = (args.date as string) || localDateStr();
      const cat = categoryById(args.category_id as string);
      await db.finance_records.add({
        date, categoryId: String(args.category_id), amount,
        note: args.note ? String(args.note) : undefined,
        type: name === 'add_expense' ? 'expense' : 'income',
        createdAt: Date.now(), deletedAt: 0,
      });
      return { ok: true, result: `已记账：${cat?.name ?? args.category_id} ${name === 'add_expense' ? '-' : '+'}${amount} 元` };
    }
    if (name === 'create_note') {
      const now = Date.now();
      await db.notes.add({
        title: String(args.title), content: String(args.content ?? ''),
        format: 'markdown', tags: [], quick: false,
        createdAt: now, updatedAt: now, deletedAt: 0,
      });
      return { ok: true, result: `已创建笔记：${args.title}` };
    }
    if (name === 'add_task') {
      const now = Date.now();
      let dueAt = now + 86400000;
      if (args.due_date) {
        dueAt = new Date(String(args.due_date) + ' 23:59:59').getTime();
      }
      await db.assignments.add({
        title: String(args.title), type: 'homework', dueAt,
        status: 'todo', priority: 'medium',
        createdAt: now, updatedAt: now, deletedAt: 0,
      });
      return { ok: true, result: `已加任务：${args.title}（截止 ${args.due_date ?? '明天'}）` };
    }
    if (name === 'add_course') {
      // 取当前学期
      // 取当前学期（用 toArray 过滤，避免索引 boolean 报错）
      const allSems = await db.semesters.toArray();
      const sem = allSems.find((s) => s.isCurrent === true) ?? allSems[allSems.length - 1];
      if (!sem) return { ok: false, result: '未设置任何学期，请先到设置页创建学期' };
      const hourToMin = (h: number) => Math.round(h * 60);
      const startMin = hourToMin(Number(args.start_hour));
      const endMin = hourToMin(Number(args.end_hour));
      const dayOfWeek = Number(args.day_of_week) === 7 ? 0 : Number(args.day_of_week);
      await db.schedule_slots.add({
        semesterId: sem.id,
        title: String(args.title),
        dayOfWeek, startMin, endMin,
        location: args.location ? String(args.location) : undefined,
        teacher: args.teacher ? String(args.teacher) : undefined,
        weekPattern: args.week_pattern === 'weeks' && Array.isArray(args.weeks) && args.weeks.length
          ? { type: 'weeks', weeks: args.weeks.map(Number).filter((n: number) => !isNaN(n)) }
          : args.week_pattern === 'odd' || args.week_pattern === 'even'
            ? { type: args.week_pattern as 'odd' | 'even' }
            : { type: 'all' },
        color: '#4A90D9',
        createdAt: Date.now(), updatedAt: Date.now(), deletedAt: 0,
      });
      const dayName = ['日','一','二','三','四','五','六'][dayOfWeek];
      return { ok: true, result: `已加课：${args.title}（周${dayName} ${Math.floor(startMin/60)}:${String(startMin%60).padStart(2,'0')}）` };
    }
    if (name === 'add_quiz_question') {
      const bankName = String(args.bank_name);
      // C9: 按 name 找题库时过滤软删，避免软删后复活旧题库
      const allBanks = await db.quiz_banks.toArray();
      let bank = allBanks.find((b) => b.name === bankName && !b.deletedAt);
      if (!bank) {
        const now = Date.now();
        const bid = await db.quiz_banks.add({
          name: bankName, description: '', source: 'ai', questionCount: 0,
          tags: [], archived: false, createdAt: now, updatedAt: now, deletedAt: 0,
        });
        bank = { id: bid, name: bankName } as typeof bank;
      }
      // 构造选项
      const options: { key: string; content: string; correct: boolean }[] = [];
      const optionTexts: string[] = Array.isArray(args.options) ? args.options as string[] : [];
      const answers: string[] = Array.isArray(args.answer) ? args.answer as string[] : [];
      const letterKeys = ['A','B','C','D','E','F','G','H'];
      optionTexts.forEach((opt, i) => {
        const key = letterKeys[i];
        options.push({ key, content: opt, correct: answers.includes(key) });
      });
      // C8: order 计数只算未删除题；questionCount 增量 +1 而非覆盖
      const activeQs = await db.quiz_questions.where('bankId').equals(bank!.id!).filter((q) => !q.deletedAt).toArray();
      const order = activeQs.length + 1;
      await db.quiz_questions.add({
        bankId: bank!.id!,
        type: args.type as any,
        stem: String(args.stem),
        options,
        answer: answers,
        explanation: args.explanation ? String(args.explanation) : '',
        chapter: '',
        difficulty: (args.difficulty ?? 3) as 1|2|3|4|5,
        tags: [], order, source: 'ai',
        createdAt: Date.now(), updatedAt: Date.now(), deletedAt: 0,
      });
      const prevCount = typeof bank.questionCount === 'number' ? bank.questionCount : activeQs.length;
      await db.quiz_banks.update(bank!.id!, { questionCount: prevCount + 1, updatedAt: Date.now() });
      return { ok: true, result: `已入题【${bankName}】第${order}题：${String(args.stem).slice(0,30)}` };
    }
    // ===== 查询类 =====
    if (name === 'get_today_schedule') {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=周日
      const semList = await db.semesters.toArray();
      const sem = semList.find((s) => s.isCurrent === true) ?? semList[semList.length - 1];
      if (!sem) return { ok: false, result: '没有学期' };
      const slots = await db.schedule_slots.where('semesterId').equals(sem.id!).toArray();
      const todaySlots = slots
        .filter((s) => s.deletedAt === 0 && s.dayOfWeek === dayOfWeek)
        .sort((a, b) => a.startMin - b.startMin);
      if (todaySlots.length === 0) return { ok: true, result: '今天没有课。' };
      const lines = todaySlots.map((s) => {
        const fmt = (m: number) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
        return `- ${fmt(s.startMin)}-${fmt(s.endMin)} ${s.title}${s.location ? `@${s.location}` : ''}${s.teacher ? ` (${s.teacher})` : ''}`;
      });
      return { ok: true, result: `今天（周${'日一二三四五六'[dayOfWeek]}）共 ${todaySlots.length} 节课：\n${lines.join('\n')}` };
    }
    if (name === 'get_today_tasks') {
      const tasks = await db.assignments.toArray();
      // C7: 加下界——只算今天 0 点之后到期的；历史逾期单独区分
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const pendingToday = tasks
        .filter((t) => t.deletedAt === 0 && t.status !== 'done' && t.dueAt >= todayStart.getTime() && t.dueAt <= todayEnd.getTime())
        .sort((a, b) => a.dueAt - b.dueAt);
      const overdue = tasks
        .filter((t) => t.deletedAt === 0 && t.status !== 'done' && t.dueAt < todayStart.getTime())
        .sort((a, b) => a.dueAt - b.dueAt);
      const lines: string[] = [];
      if (pendingToday.length) {
        lines.push(`今日到期 ${pendingToday.length} 个：`);
        for (const t of pendingToday) {
          const d = new Date(t.dueAt);
          lines.push(`- [${t.id}] ${t.title}（截止 ${d.getMonth()+1}月${d.getDate()}日）`);
        }
      }
      if (overdue.length) {
        lines.push(`\n已逾期 ${overdue.length} 个：`);
        for (const t of overdue) {
          const d = new Date(t.dueAt);
          lines.push(`- [${t.id}] ${t.title}（${d.getMonth()+1}月${d.getDate()}日已逾期）`);
        }
      }
      if (!pendingToday.length && !overdue.length) return { ok: true, result: '今天没有待办任务。' };
      return { ok: true, result: lines.join('\n') };
    }
    if (name === 'get_today_finance') {
      const todayStr = localDateStr();
      const records = await db.finance_records.where('date').equals(todayStr).toArray();
      if (records.length === 0) return { ok: true, result: '今天还没有记账。' };
      let exp = 0, inc = 0;
      const lines = records.map((r) => {
        if (r.type === 'expense') exp += r.amount; else inc += r.amount;
        return `- [${r.id}] ${r.type === 'expense' ? '支出' : '收入'} ${r.amount} 元（${r.note ?? ''}）`;
      });
      lines.push(`\n今日合计：支出 ${exp} 元，收入 ${inc} 元，净 ${inc - exp} 元`);
      return { ok: true, result: lines.join('\n') };
    }
    // ===== 操作类 =====
    if (name === 'finish_task') {
      const kw = String(args.title_keyword);
      const tasks = await db.assignments.toArray();
      const t = tasks.find((x) => x.deletedAt === 0 && x.status !== 'done' && x.title.includes(kw));
      if (!t) return { ok: false, result: `没找到包含"${kw}"的未完成任务` };
      await db.assignments.update(t.id!, { status: 'done', updatedAt: Date.now() });
      return { ok: true, result: `已完成任务：${t.title}` };
    }
    if (name === 'add_habit_log') {
      const kw = String(args.habit_name);
      const habits = await db.habits.toArray();
      const h = habits.find((x) => x.deletedAt === 0 && x.name.includes(kw));
      if (!h) return { ok: false, result: `没找到习惯"${kw}"，现有习惯：${habits.filter(x=>x.deletedAt===0).map(x=>x.name).join('、')}` };
      const today = localDateStr();
      const exist = await db.habit_logs.where({ habitId: h.id!, date: today }).first();
      if (exist) return { ok: true, result: `习惯"${h.name}"今天已经打过卡了` };
      await db.habit_logs.add({ habitId: h.id!, date: today, done: true, createdAt: Date.now() });
      return { ok: true, result: `已打卡：${h.name}` };
    }
    // ===== 删除类（走消息流确认卡片，见 queryDeleteTargets/doDeleteConfirmed）=====
    if (DELETE_TOOLS.has(name)) {
      return { ok: false, result: '删除类工具走确认卡片流程' };
    }
    return { ok: false, result: `未知工具 ${name}` };
  } catch (e) {
    return { ok: false, result: `执行失败：${(e as Error).message}` };
  }
}

// 阶段四：删除类工具——第一步只查询目标，返回"待确认"（绝不直接删）
async function queryDeleteTargets(
  name: string, args: Record<string, unknown>,
): Promise<{ ok: boolean; result: string; needConfirm?: boolean; targets?: { label: string; extra?: string }[] }> {
  try {
    if (name === 'delete_finance_record') {
      const amount = Number(args.amount);
      const kw = args.note_keyword ? String(args.note_keyword) : '';
      const all = await db.finance_records.toArray();
      const targets = all.filter((r) => r.deletedAt === 0 && r.amount === amount && (!kw || (r.note ?? '').includes(kw)));
      if (targets.length === 0) return { ok: false, result: '没找到匹配的记账记录' };
      return {
        ok: true, needConfirm: true,
        result: `即将删除 ${targets.length} 条记账记录`,
        targets: targets.map((r) => ({ label: r.note || categoryById(r.categoryId)?.name || '未分类', extra: `${r.type === 'expense' ? '-' : '+'}${r.amount} 元 · ${r.date}` })),
      };
    }
    if (name === 'delete_note') {
      const kw = String(args.title_keyword);
      const notes = await db.notes.toArray();
      const targets = notes.filter((n) => n.deletedAt === 0 && n.title.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的笔记` };
      return { ok: true, needConfirm: true, result: `即将删除 ${targets.length} 篇笔记`, targets: targets.map((n) => ({ label: n.title })) };
    }
    if (name === 'delete_course') {
      const kw = String(args.course_name);
      const all = await db.schedule_slots.toArray();
      const targets = all.filter((s) => s.deletedAt === 0 && s.title.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的课程` };
      return { ok: true, needConfirm: true, result: `即将删除 ${targets.length} 节课`, targets: targets.map((s) => ({ label: s.title, extra: s.location ? `@${s.location}` : undefined })) };
    }
    if (name === 'clear_schedule') {
      const all = await db.schedule_slots.toArray();
      const active = all.filter((s) => s.deletedAt === 0);
      if (active.length === 0) return { ok: true, result: '课表本来就是空的' };
      return { ok: true, needConfirm: true, result: `高危操作：即将清空全部 ${active.length} 节课`, targets: active.slice(0, 20).map((s) => ({ label: s.title })).concat(active.length > 20 ? [{ label: `…等共 ${active.length} 节` }] : []) };
    }
    if (name === 'delete_task') {
      const kw = String(args.title_keyword);
      const all = await db.assignments.toArray();
      const targets = all.filter((t) => t.deletedAt === 0 && t.title.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的任务` };
      return { ok: true, needConfirm: true, result: `即将删除 ${targets.length} 个任务`, targets: targets.map((t) => ({ label: t.title })) };
    }
    if (name === 'delete_quiz_bank') {
      const kw = String(args.bank_name);
      const banks = await db.quiz_banks.toArray();
      const targets = banks.filter((b) => b.deletedAt === 0 && b.name.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的题库` };
      return { ok: true, needConfirm: true, result: `即将删除 ${targets.length} 个题库（含其下所有题目）`, targets: targets.map((b) => ({ label: b.name, extra: `${b.questionCount} 题` })) };
    }
    return { ok: false, result: `未知工具 ${name}` };
  } catch (e) {
    return { ok: false, result: `查询失败：${(e as Error).message}` };
  }
}

// 阶段四：删除类工具——第二步：用户确认后真正执行（软删除，时间戳规范一致）
async function doDeleteConfirmed(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; result: string }> {
  try {
    const now = Date.now();
    if (name === 'delete_finance_record') {
      const amount = Number(args.amount);
      const kw = args.note_keyword ? String(args.note_keyword) : '';
      const all = await db.finance_records.toArray();
      const targets = all.filter((r) => r.deletedAt === 0 && r.amount === amount && (!kw || (r.note ?? '').includes(kw)));
      if (targets.length === 0) return { ok: false, result: '没找到匹配的记账记录' };
      for (const t of targets) await db.finance_records.update(t.id!, { deletedAt: now });
      return { ok: true, result: `已删除 ${targets.length} 条记账记录` };
    }
    if (name === 'delete_note') {
      const kw = String(args.title_keyword);
      const notes = await db.notes.toArray();
      const targets = notes.filter((n) => n.deletedAt === 0 && n.title.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的笔记` };
      for (const t of targets) {
        await db.notes.update(t.id!, { deletedAt: now });
        // 级联软删快照与附件，避免孤儿数据
        const snaps = await db.note_snapshots.where('noteId').equals(t.id!).toArray();
        for (const s of snaps) {
          if (!s.deletedAt) await db.note_snapshots.update(s.id!, { deletedAt: now, updatedAt: now });
        }
        const atts = await db.attachments.where('noteId').equals(t.id!).toArray();
        for (const a of atts) {
          if (!a.deletedAt) await db.attachments.update(a.id!, { deletedAt: now, updatedAt: now });
        }
      }
      return { ok: true, result: `已删除 ${targets.length} 篇笔记` };
    }
    if (name === 'delete_course') {
      const kw = String(args.course_name);
      const all = await db.schedule_slots.toArray();
      const targets = all.filter((s) => s.deletedAt === 0 && s.title.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的课程` };
      for (const t of targets) await db.schedule_slots.update(t.id!, { deletedAt: now });
      return { ok: true, result: `已删除 ${targets.length} 节"${kw}"相关课程` };
    }
    if (name === 'clear_schedule') {
      const all = await db.schedule_slots.toArray();
      const active = all.filter((s) => s.deletedAt === 0);
      if (active.length === 0) return { ok: true, result: '课表本来就是空的' };
      for (const t of active) await db.schedule_slots.update(t.id!, { deletedAt: now });
      return { ok: true, result: `已清空全部 ${active.length} 节课` };
    }
    if (name === 'delete_task') {
      const kw = String(args.title_keyword);
      const all = await db.assignments.toArray();
      const targets = all.filter((t) => t.deletedAt === 0 && t.title.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的任务` };
      for (const t of targets) await db.assignments.update(t.id!, { deletedAt: now });
      return { ok: true, result: `已删除 ${targets.length} 个任务` };
    }
    if (name === 'delete_quiz_bank') {
      const kw = String(args.bank_name);
      const banks = await db.quiz_banks.toArray();
      const targets = banks.filter((b) => b.deletedAt === 0 && b.name.includes(kw));
      if (targets.length === 0) return { ok: false, result: `没找到包含"${kw}"的题库` };
      for (const b of targets) {
        const qs = await db.quiz_questions.where('bankId').equals(b.id!).toArray();
        for (const q of qs) await db.quiz_questions.update(q.id!, { deletedAt: now });
        await db.quiz_banks.update(b.id!, { deletedAt: now });
      }
      return { ok: true, result: `已删除 ${targets.length} 个题库及其题目` };
    }
    return { ok: false, result: `未知工具 ${name}` };
  } catch (e) {
    return { ok: false, result: `执行失败：${(e as Error).message}` };
  }
}

// 阶段四：早期对话摘要（上下文裁剪的兜底记忆）——失败返回空串，调用方回退为全量发送
async function summarizeEarly(
  msgs: { role: string; content: string }[],
  cfg: { baseUrl: string; apiKey: string; model: string; temperature?: number },
  signal?: AbortSignal,
): Promise<string> {
  try {
    const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: '请把下面的对话压缩成 120 字以内的中文摘要，保留：聊过的话题、已执行过的操作（如记了账、建了笔记）、尚未完成的事项。只输出摘要本身。' },
          ...msgs,
        ],
        stream: false,
        temperature: 0.3,
      }),
      signal,
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    return String(data?.choices?.[0]?.message?.content ?? '').trim();
  } catch {
    return '';
  }
}

function groupByTime(list: IChatConversation[]) {
  const now = Date.now();
  const DAY = 86400000;
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const groups: { label: string; items: IChatConversation[] }[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '7 天内', items: [] },
    { label: '30 天内', items: [] },
    { label: '更早', items: [] },
  ];
  for (const c of list) {
    const t = c.updatedAt ?? c.createdAt ?? now;
    const diff = now - t;
    if (t >= todayStart.getTime()) groups[0].items.push(c);
    else if (diff < DAY * 2) groups[1].items.push(c);
    else if (diff < DAY * 7) groups[2].items.push(c);
    else if (diff < DAY * 30) groups[3].items.push(c);
    else groups[4].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<IChatConversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [fakeClaimText, setFakeClaimText] = useState<string | null>(null);
  const hadToolCallRef = useRef(false);
  const [needConfig, setNeedConfig] = useState(false);
  const [deepThink, setDeepThink] = useState(false);
  const [searchKw, setSearchKw] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // 粘贴文件处理
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      for (const f of files) void pickFile(f);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 阶段四：删除确认卡片等待器——工具循环等待用户点击确认/取消；'abort' 表示停止生成
  const confirmWaiterRef = useRef<((decision: boolean | 'abort') => void) | null>(null);
  // 阶段四：展开查看工具参数的卡片 key
  const [expandedToolArgs, setExpandedToolArgs] = useState<string | null>(null);
  // 实时跟踪当前会话 id，供流式回调判断是否还在本会话，避免切走后旧消息写回视图
  const activeIdRef = useRef<number | null>(null);
  // 阶段四：是否已完成首次自动加载（避免"新建对话"置空 activeId 后又被自动切回第一个会话）
  const initialLoadedRef = useRef(false);
  // 阶段四：AI 权限（view=仅可查看 / edit=工作区内修改 / full=完全权限）
  const [permission, setPermission] = useState<'view' | 'edit' | 'full'>('full');

  // 选文件：提取文本
  const pickFile = async (f: File) => {
    try {
      let text = '';
      const name = f.name.toLowerCase();
      if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv') || name.endsWith('.json')) {
        text = await f.text();
      } else if (name.endsWith('.docx')) {
        const buf = await f.arrayBuffer();
        const zip = new (await import('jszip')).default();
        const zipObj = await zip.loadAsync(buf);
        const docFile = zipObj.file('word/document.xml');
        if (!docFile) throw new Error('不是有效的 docx');
        const xml = await docFile.async('text');
        // C11: 先把段落标签换成换行、去掉所有标签，再用完整实体解码（补 &quot;/&apos;/数字实体）
        text = decodeHtmlEntities(
          xml.replace(/<w:p[^>]*>/g, '\n').replace(/<[^>]+>/g, ''),
        ).replace(/\n{3,}/g, '\n\n').trim();
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheets: string[] = [];
        for (const sn of wb.SheetNames) {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn]);
          sheets.push(`=== ${sn} ===\n${csv}`);
        }
        text = sheets.join('\n\n');
      } else if (name.endsWith('.pdf')) {
        toast.error('PDF 暂不支持，请把内容复制为文字粘贴');
        return;
      } else if (name.match(/\.(png|jpe?g|jpg|webp|bmp)$/)) {
        toast.error('图片暂不支持，请把图里文字复制后粘贴');
        return;
      } else {
        text = await f.text().catch(() => '');
      }
      // 截断超长文本（避免爆 token）
      if (text.length > 20000) text = text.slice(0, 20000) + '\n...(内容过长已截断)';
      setAttachments((prev) => [...prev, { name: f.name, text }]);
      toast.success(`已附加：${f.name}`);
    } catch (e) {
      toast.error(`读取文件失败：${(e as Error).message}`);
    }
  };

  const switchConversation = async (id: number) => {
    // C3: 切换会话前中断上一个正在进行的流式请求，避免旧消息写回新视图
    abortRef.current?.abort();
    setActiveId(id);
    activeIdRef.current = id;
    const msgs = await db.chat_messages
      .where('conversationId').equals(id)
      .sortBy('createdAt');
    setMessages(msgs.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'tool',
      content: m.content,
      toolName: m.toolName,
      toolOk: m.toolOk,
    })));
    // 阶段四：会话加载后立即滚到底部（组件重挂载/切换会话时 smooth 常失效，用两帧 rAF + 直接赋值兜底）
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }));
  };

  const loadConversations = useCallback(async () => {
    const list = await db.chat_conversations
      .where('deletedAt').equals(0)
      .reverse().sortBy('updatedAt');
    setConversations(list);
    if (!initialLoadedRef.current && list.length > 0) {
      initialLoadedRef.current = true;
      await switchConversation(list[0].id!);
    }
  }, []);

  const newConversation = async () => {
    // C3: 新建会话前中断正在进行的流式请求
    abortRef.current?.abort();
    setActiveId(null);
    activeIdRef.current = null;
    setMessages([]);
    setInput('');
  };

  const deleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除这个对话？消息也会一起删除。')) return;
    const now = nowTs();
    await db.chat_conversations.update(id, { deletedAt: now });
    await db.chat_messages.where('conversationId').equals(id).modify({ deletedAt: now });
    if (activeId === id) { setActiveId(null); setMessages([]); }
    await loadConversations();
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || streaming) return;

    const cfg = await loadAiConfig();
    if (!cfg?.apiKey) {
      setNeedConfig(true);
      toast.error('还没配置 DeepSeek API Key，请先到「设置 → AI 题库识别」里填好');
      return;
    }

    let convId = activeId;
    if (!convId) {
      const now = Date.now();
      convId = await db.chat_conversations.add({
        title: text.slice(0, 20),
        model: deepThink ? 'deepseek-reasoner' : cfg.model,
        createdAt: now,
        updatedAt: now,
        deletedAt: 0,
      } as IChatConversation) as number;
    }
    activeIdRef.current = convId;

    const userContent = attachments.length > 0
      ? `${text ? text + '\n\n' : ''}${attachments.map((a) => `【文件：${a.name}】\n${a.text}`).join('\n\n')}`
      : text;

    const userMsg: ChatMessage = { role: 'user', content: userContent };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setAttachments([]);
    setStreaming(true);
    hadToolCallRef.current = false;
    setFakeClaimText(null);

    await db.chat_messages.add({
      conversationId: convId, role: 'user', content: userContent, createdAt: Date.now(),
    } as IChatMessage);

    const ac = new AbortController();
    abortRef.current = ac;

    // 阶段四：人设从设置读取（设置页可编辑，默认内置）
    const baseSystemPrompt = (await settingsRepo.get<string>('studydesk:chat-system-prompt', DEFAULT_SYSTEM_PROMPT)) || DEFAULT_SYSTEM_PROMPT;

    // 阶段四：AI 权限——按设置过滤工具集（view 仅查询 / edit 可写不可删 / full 全部）
    const permDesc = permission === 'view'
      ? '当前权限：仅可查看。只能执行查询类操作（get_today_*），绝对禁止新增、修改、删除任何数据；用户让你记账/删除/新增时，如实说明"我没有写入权限，无法完成"，不得谎称已执行。'
      : permission === 'edit'
        ? '当前权限：工作区内修改。可以新增、修改数据（记账/笔记/任务/课表/习惯/题库），但禁止任何删除类操作（delete_*、clear_schedule 不可用）；每次写操作都必须真正调用工具，禁止只在回复里声称完成。'
        : '当前权限：完全权限。可以增删改查应用内所有数据；删除类操作会先弹出确认卡片，必须等待用户确认后才能执行，禁止在未确认时谎称已删除；所有写操作都必须真正调用工具完成。';
    const effectiveTools = permission === 'view'
      ? TOOLS.filter((t) => t.function?.name?.startsWith('get_'))
      : permission === 'edit'
        ? TOOLS.filter((t) => !DELETE_TOOLS.has(t.function?.name ?? ''))
        : TOOLS;
    const systemPrompt = `${baseSystemPrompt}\n\n${permDesc}`;

    // 从历史构造 apiMsgs：tool 消息在持久化后只保留展示文本，无法重建 tool_call_id，
    // 直接发给 API 会 400，因此历史里的 tool 角色消息跳过（本轮工具循环会另行追加完整结构）
    const plainMsgs = newMsgs
      .filter((m) => m.role !== 'tool')
      .map((m) => ({ role: m.role, content: m.content }));

    // 阶段四：上下文窗口裁剪——保留 system + 最近 MAX_HISTORY_MSGS 条，更早的用摘要替代；
    // 首次超限时先请求一次摘要并缓存到会话（chat_conversations.summary），摘要失败则回退全量发送（不丢记忆）
    let apiMsgs: any[];
    if (plainMsgs.length > MAX_HISTORY_MSGS) {
      const convRow = await db.chat_conversations.get(convId);
      let summary = convRow?.summary ?? '';
      if (!summary) {
        summary = await summarizeEarly(plainMsgs.slice(0, plainMsgs.length - MAX_HISTORY_MSGS), cfg, ac.signal);
        if (summary) await db.chat_conversations.update(convId, { summary });
      }
      if (summary) {
        apiMsgs = [
          { role: 'system', content: systemPrompt },
          { role: 'system', content: `【早期对话摘要（压缩记忆）】\n${summary}` },
          ...plainMsgs.slice(-MAX_HISTORY_MSGS),
        ];
      } else {
        apiMsgs = [{ role: 'system', content: systemPrompt }, ...plainMsgs];
      }
    } else {
      apiMsgs = [{ role: 'system', content: systemPrompt }, ...plainMsgs];
    }

    // 消息历史（用于 UI 渲染，包含工具调用卡片）
    const uiMsgs: ChatMessage[] = [...newMsgs];

    try {
      const model = deepThink ? 'deepseek-reasoner' : cfg.model;

      // 最多循环 5 轮（避免死循环）
      let hitLimit = false;
      for (let round = 0; round < 5; round++) {
        const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
          body: JSON.stringify({
            model, messages: apiMsgs,
            // C2: deepseek-reasoner 不支持 function calling，深度思考时不传 tools
            tools: deepThink ? undefined : effectiveTools,
            tool_choice: deepThink ? undefined : 'auto',
            stream: true,
            temperature: cfg.temperature ?? 0.7,
          }),
          signal: ac.signal,
        });

        if (!resp.ok || !resp.body) {
          const errText = await resp.text();
          throw new Error(`API 错误 ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let assistantContent = '';
        let buffer = '';
        // 收集 tool_calls（流式分片拼接）
        const toolCalls: Record<number, { id: string; name: string; args: string }> = {};

        // 解析单行 SSE 数据；content 增量时刷新 UI（C3: 仅当仍在本会话才写回视图）
        const handleLine = (line: string) => {
          const t = line.trim();
          if (!t.startsWith('data:')) return;
          const data = t.slice(5).trim();
          if (data === '[DONE]') return;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta ?? {};
            if (delta.content) {
              assistantContent += delta.content;
              if (activeIdRef.current === convId) {
                setMessages([...uiMsgs, { role: 'assistant', content: assistantContent }]);
              }
            }
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCalls[idx]) toolCalls[idx] = { id: '', name: '', args: '' };
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
              }
            }
          } catch { /* 忽略单行解析失败 */ }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) handleLine(line);
        }

        // C1: 流结束后 buffer 里还残留最后一个未带换行的分片，按相同逻辑再解析一次
        if (buffer.trim()) {
          handleLine(buffer);
          buffer = '';
        }

        const calls = Object.values(toolCalls);

        // 没有工具调用 → 这就是最终回复，结束循环
        if (calls.length === 0) {
          if (assistantContent) {
            uiMsgs.push({ role: 'assistant', content: assistantContent });
            await db.chat_messages.add({
              conversationId: convId, role: 'assistant', content: assistantContent, createdAt: Date.now(),
            } as IChatMessage);
            // 谎报检测：本轮自始至终没有任何工具调用，却声称完成写操作 → 记录警示
            if (!hadToolCallRef.current && FAKE_CLAIM_RE.test(assistantContent)) {
              setFakeClaimText(assistantContent);
            }
          }
          break;
        }
        // 本轮有工具调用 → 之后的总结有工具卡背书，不做谎报警示
        hadToolCallRef.current = true;

        // 把 assistant 的 tool_calls 消息加入 apiMsgs
        apiMsgs.push({
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: calls.map((c) => ({
            id: c.id, type: 'function', function: { name: c.name, arguments: c.args },
          })),
        });

        // C4: assistant 的 tool_calls 消息有正文时也落库（空正文无可显示内容，跳过避免空气泡）
        if (assistantContent) {
          await db.chat_messages.add({
            conversationId: convId, role: 'assistant', content: assistantContent, createdAt: Date.now(),
          } as IChatMessage);
        }

        // 逐个执行工具（阶段四：running 卡 → confirm 卡/终态卡，参数可展开）
        for (const call of calls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(call.args || '{}'); } catch { /* 忽略参数解析失败 */ }
          const argsStr = call.args || '{}';
          const confirmKey = `${convId}-${call.id}-${call.name}`;

          // 1. 推"调用中"卡片（不落库，中断/翻转为终态后消失）
          uiMsgs.push({ role: 'tool', status: 'running', toolName: call.name, content: '', args: argsStr });
          if (activeIdRef.current === convId) setMessages([...uiMsgs]);

          let result: { ok: boolean; result: string };
          if (DELETE_TOOLS.has(call.name)) {
            // 2a. 删除类：先查询目标 → 消息流内嵌确认卡片 → 等用户决策（不再用原生 confirm()）
            const q = await queryDeleteTargets(call.name, args);
            uiMsgs.pop(); // 移除 running 卡
            if (q.needConfirm && q.targets && q.targets.length > 0) {
              uiMsgs.push({ role: 'tool', status: 'confirm', toolName: call.name, content: q.result, args: argsStr, targets: q.targets, confirmKey });
              if (activeIdRef.current === convId) setMessages([...uiMsgs]);
              const decision = await new Promise<boolean | 'abort'>((resolve) => {
                confirmWaiterRef.current = resolve;
              });
              confirmWaiterRef.current = null;
              if (decision === 'abort') {
                uiMsgs.pop();
                if (activeIdRef.current === convId) setMessages([...uiMsgs]);
                throw new DOMException('Aborted', 'AbortError');
              }
              const idx = uiMsgs.findIndex((m) => m.confirmKey === confirmKey);
              if (decision === true) {
                result = await doDeleteConfirmed(call.name, args);
                if (idx >= 0) uiMsgs[idx] = { role: 'tool', status: 'done', toolName: call.name, content: result.result, toolOk: result.ok, args: argsStr };
              } else {
                result = { ok: false, result: '已取消删除，未做任何改动' };
                if (idx >= 0) uiMsgs[idx] = { role: 'tool', status: 'done', toolName: call.name, content: result.result, toolOk: false, args: argsStr };
              }
              if (activeIdRef.current === convId) setMessages([...uiMsgs]);
            } else {
              // 无匹配目标 → 直接失败终态
              result = { ok: false, result: q.result };
              uiMsgs.push({ role: 'tool', status: 'done', toolName: call.name, content: result.result, toolOk: false, args: argsStr });
              if (activeIdRef.current === convId) setMessages([...uiMsgs]);
            }
          } else {
            // 2b. 普通工具：执行后原地翻转为绿/红终态
            result = await executeTool(call.name, args);
            uiMsgs.pop();
            uiMsgs.push({ role: 'tool', status: 'done', toolName: call.name, content: result.result, toolOk: result.ok, args: argsStr });
            if (activeIdRef.current === convId) setMessages([...uiMsgs]);
          }

          // 3. 终态结果落库（running/confirm 不落库，刷新后只还原已完成的卡片）
          await db.chat_messages.add({
            conversationId: convId, role: 'tool', content: result.result,
            toolName: call.name, toolOk: result.ok, createdAt: Date.now(),
          } as IChatMessage);

          // 4. 结果塞回 apiMsgs
          apiMsgs.push({
            role: 'tool', tool_call_id: call.id, content: result.result,
          });
        }

        // C6: 最后一轮仍有工具调用 → 标记命中上限
        if (round === 4) hitLimit = true;
      }

      // C6: 达到工具调用上限后，追加一条系统提示并再请求一轮纯文本总结
      if (hitLimit) {
        const notice = '已达到工具调用上限（5 轮）。请基于以上工具执行结果，直接给用户一段最终总结，不要再调用工具。';
        uiMsgs.push({ role: 'assistant', content: `⚠️ ${notice}` });
        await db.chat_messages.add({
          conversationId: convId, role: 'assistant', content: notice, createdAt: Date.now(),
        } as IChatMessage);
        if (activeIdRef.current === convId) setMessages([...uiMsgs]);
        // 再发一次纯文本请求让模型总结（不带 tools）
        try {
          const sumResp = await fetch(`${cfg.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
            body: JSON.stringify({
              model, messages: [...apiMsgs, { role: 'user', content: notice }],
              stream: false, temperature: cfg.temperature ?? 0.7,
            }),
            signal: ac.signal,
          });
          if (sumResp.ok) {
            const sumData = await sumResp.json();
            const sumText: string = sumData?.choices?.[0]?.message?.content ?? '';
            if (sumText) {
              uiMsgs.push({ role: 'assistant', content: sumText });
              await db.chat_messages.add({
                conversationId: convId, role: 'assistant', content: sumText, createdAt: Date.now(),
              } as IChatMessage);
              if (activeIdRef.current === convId) setMessages([...uiMsgs]);
            }
          }
        } catch { /* 总结请求失败不影响主流程 */ }
      }

      await db.chat_conversations.update(convId, { updatedAt: Date.now() });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        toast.error(`聊天失败：${(e as Error).message}`);
        setMessages([...uiMsgs, { role: 'assistant', content: `❌ 请求失败：${(e as Error).message}` }]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      await loadConversations();
    }
  };

  // C3: 手动停止生成（阶段四：同时中断待确认卡片的等待）
  const stopStreaming = () => {
    abortRef.current?.abort();
    const w = confirmWaiterRef.current;
    if (w) { confirmWaiterRef.current = null; w('abort'); }
  };

  useLayoutEffect(() => {
    // 阶段四：消息变化（流式增量/发送/切换会话）时保持滚动在底部；
    // useLayoutEffect 在 DOM 提交后同步执行，scrollHeight 已更新，直接赋值最可靠
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadConversations(); }, [loadConversations]);

  // 阶段四：读取 AI 助手权限设置（view/edit/full，默认 full）
  useEffect(() => {
    void settingsRepo.get<string>('studydesk:chat-permission', 'full').then((v) => {
      if (v === 'view' || v === 'edit' || v === 'full') setPermission(v);
    });
  }, []);

  const filtered = searchKw
    ? conversations.filter((c) => (c.title ?? '').includes(searchKw))
    : conversations;
  const groups = groupByTime(filtered);

  return (
    <div style={{ left: 'var(--sidebar-width)' }} className="fixed bottom-0 right-0 top-0 flex bg-white dark:bg-slate-950">
      {/* 左侧边栏 */}
      <aside className="flex w-64 flex-col border-r border-gray-100 bg-gray-50/80 dark:border-white/5 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <img src={`${import.meta.env.BASE_URL}xiaoru-avatar.jpg`} alt="周小如" className="h-7 w-7 rounded-lg object-cover" />
          <span className="text-base font-semibold text-gray-800 dark:text-gray-100">周小如</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => searchInputRef.current?.focus()}
              className="rounded-lg p-1.5 hover:bg-gray-200/60 dark:hover:bg-white/10"
              title="搜索对话"
            >
              <Search className="h-4 w-4 text-gray-500" />
            </button>
            <button onClick={newConversation} className="rounded-lg p-1.5 hover:bg-gray-200/60 dark:hover:bg-white/10" title="新建对话"><Plus className="h-4 w-4 text-gray-500" /></button>
          </div>
        </div>

        <div className="px-3 pb-2">
          <button
            onClick={newConversation}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <Plus className="h-4 w-4" /> 开启新对话
          </button>
        </div>

        <input
          ref={searchInputRef}
          value={searchKw}
          onChange={(e) => setSearchKw(e.target.value)}
          placeholder="搜索对话"
          className="mx-3 mb-2 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-gray-400 focus:border-gray-200 focus:bg-white dark:focus:bg-white/5"
        />

        <div className="flex-1 overflow-auto px-2 pb-4">
          {groups.length === 0 && (
            <p className="py-8 text-center text-xs text-gray-400">还没有对话</p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-3">
              <p className="px-2 py-1.5 text-xs text-gray-400">{g.label}</p>
              {g.items.map((c) => (
                <div
                  key={c.id}
                  onClick={() => switchConversation(c.id!)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    activeId === c.id
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5',
                  )}
                >
                  <span className="flex-1 truncate">{c.title || '新对话'}</span>
                  <button
                    onClick={(e) => deleteConversation(c.id!, e)}
                    className="hidden text-gray-400 hover:text-red-500 group-hover:block"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* 右侧主区 */}
      <main className="flex flex-1 flex-col">
        {needConfig ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <p className="text-sm font-medium">还没配置 AI</p>
            <p className="max-w-sm text-center text-xs text-gray-500">
              请到「设置 → AI 题库识别」填入 DeepSeek API Key，回来就能用了。
            </p>
          </div>
        ) : messages.length === 0 ? (
          /* 欢迎页：欢迎语居中靠上，输入框固定底部 */
          <div className="flex flex-1 flex-col px-8">
            <div className="flex flex-1 items-center justify-center pb-20">
              <div className="flex items-center gap-3">
                <img src={`${import.meta.env.BASE_URL}xiaoru-avatar.jpg`} alt="周小如" className="h-12 w-12 rounded-2xl object-cover shadow-md" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">你好，我是周小如，让我们开始聊天吧！</h2>
              </div>
            </div>

            <div className="pb-6">
              <div className="mx-auto w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                {/* 附件 chips */}
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <span key={i} className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                        <FileImage className="h-3 w-3" /> {a.name}
                        <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  onPaste={handlePaste}
                  placeholder="给周小如发送消息（可粘贴文本，或附 .txt/.md/.csv/.docx/.xlsx 文件）"
                  rows={3}
                  className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-gray-400"
                />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setDeepThink(!deepThink)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors',
                      deepThink
                        ? 'border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300',
                    )}
                  >
                    <BrainCircuit className="h-3.5 w-3.5" /> 深度思考
                  </button>
                  {deepThink && <span className="text-[10px] text-amber-500">（深度思考模式暂不支持工具调用）</span>}
                  <button className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300">
                    <Globe className="h-3.5 w-3.5" /> 智能搜索
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => fileRef.current?.click()} className="rounded-full p-2 text-gray-400 hover:bg-gray-100" title="上传文件">
                      <FileImage className="h-4 w-4" />
                    </button>
                    {streaming ? (
                      <button onClick={stopStreaming} title="停止生成" className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600">
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        onClick={send}
                        disabled={(!input.trim() && attachments.length === 0) || streaming}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:opacity-30"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 对话页 */
          <>
            <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-6">
              <div className="mx-auto max-w-3xl space-y-6">
                {messages.map((m, i) => (
                  m.role === 'tool' ? (
                    <ToolCard
                      key={i}
                      m={m}
                      expanded={expandedToolArgs === (m.confirmKey ?? `${m.toolName}-${i}`)}
                      onToggle={() => setExpandedToolArgs((prev) => (prev === (m.confirmKey ?? `${m.toolName}-${i}`) ? null : (m.confirmKey ?? `${m.toolName}-${i}`)))}
                      onConfirm={() => { const w = confirmWaiterRef.current; if (w) { confirmWaiterRef.current = null; w(true); } }}
                      onCancel={() => { const w = confirmWaiterRef.current; if (w) { confirmWaiterRef.current = null; w(false); } }}
                    />
                  ) : (
                    <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                          m.role === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'chat-md bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-gray-100',
                        )}
                      >
                        {m.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        ) : (
                          m.content
                        )}
                        {m.role === 'assistant' && fakeClaimText && !streaming && i === messages.length - 1 && m.content === fakeClaimText && (
                          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                            ⚠️ 本轮未检测到实际工具调用，上述"已完成"声明可能不实，请到对应模块核实
                          </p>
                        )}
                        {m.role === 'assistant' && streaming && i === messages.length - 1 && (
                          <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current" />
                        )}
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* 底部输入 */}
            <div className="px-6 pb-6">
              <div className="mx-auto w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {attachments.map((a, i) => (
                      <span key={i} className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                        <FileImage className="h-3 w-3" /> {a.name}
                        <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} className="ml-1 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  onPaste={handlePaste}
                  placeholder="给周小如发送消息（可粘贴文本，或附文件）"
                  rows={2}
                  className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-gray-400"
                />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setDeepThink(!deepThink)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs',
                      deepThink ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <BrainCircuit className="h-3.5 w-3.5" /> 深度思考
                  </button>
                  {deepThink && <span className="text-[10px] text-amber-500">（深度思考模式暂不支持工具调用）</span>}
                  <button
                    onClick={() => toast.message('智能搜索暂未开放（当前模型不支持联网）')}
                    className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 dark:border-white/10 dark:text-gray-500"
                    title="当前模型不支持联网搜索"
                  >
                    <Globe className="h-3.5 w-3.5" /> 智能搜索
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => fileRef.current?.click()} className="rounded-full p-2 text-gray-400 hover:bg-gray-100" title="上传文件">
                      <FileImage className="h-4 w-4" />
                    </button>
                    {streaming ? (
                      <button onClick={stopStreaming} title="停止生成" className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600">
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        onClick={send}
                        disabled={(!input.trim() && attachments.length === 0) || streaming}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-30"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 隐藏的文件选择器 */}
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.csv,.json,.docx,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
                e.target.value = '';
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}

// 阶段四：工具调用卡片（running 进行态 / confirm 确认态 / done 终态，参数可展开）
function ToolCard({ m, expanded, onToggle, onConfirm, onCancel }: {
  m: ChatMessage;
  expanded: boolean;
  onToggle: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // 进行态：spinner + 工具名
  if (m.status === 'running') {
    return (
      <div className="flex justify-start">
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <Wrench className="h-3.5 w-3.5" />
          <span className="font-medium">正在调用 {m.toolName}…</span>
        </div>
      </div>
    );
  }

  // 确认态：删除保护卡片（替代原生 confirm()）
  if (m.status === 'confirm') {
    return (
      <div className="flex justify-start">
        <div className="w-full max-w-[85%] rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" />
            <span className="font-semibold">{m.content}</span>
          </div>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-amber-800/90 dark:text-amber-200/90">
            {m.targets?.map((t, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="shrink-0">·</span>
                <span className="truncate">{t.label}</span>
                {t.extra && <span className="shrink-0 text-amber-700/70 dark:text-amber-300/70">{t.extra}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex gap-2">
            <button onClick={onConfirm} className="rounded-full bg-amber-500 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-600">
              确认删除
            </button>
            <button onClick={onCancel} className="rounded-full border border-amber-300 px-3.5 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-300">
              取消
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 终态：绿=成功 / 红=失败（历史还原消息无 status，默认按终态渲染）
  const isError = m.toolOk === false;
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <div className={cn(
          'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs',
          isError
            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300'
            : 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300',
        )}>
          {isError ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          <Wrench className="h-3.5 w-3.5" />
          <span className="font-medium">调用 {m.toolName}</span>
          <span className={cn('truncate', isError ? 'text-red-600/80 dark:text-red-400/80' : 'text-green-600/80 dark:text-green-400/80')}>
            → {m.content}
          </span>
          {m.args && (
            <button onClick={onToggle} className="ml-0.5 shrink-0 rounded p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10" title={expanded ? '收起参数' : '查看参数'}>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
        {expanded && m.args && (
          <pre className="mt-1.5 overflow-x-auto rounded-lg bg-black/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-600 dark:bg-white/10 dark:text-gray-300">
            {(() => { try { return JSON.stringify(JSON.parse(m.args), null, 2); } catch { return m.args; } })()}
          </pre>
        )}
      </div>
    </div>
  );
}
