// 种子数据：首次启动写入示例学期/课程/任务/笔记/启动台，保证首屏有内容可看
import { assignmentRepo } from '@/db/repositories/assignments';
import { financeRecordRepo } from '@/db/repositories/finance';
import { launcherGroupRepo, launcherItemRepo } from '@/db/repositories/launcher';
import { focusRepo, habitLogRepo, habitRepo } from '@/db/repositories/lifestyle';
import { noteRepo } from '@/db/repositories/notes';
import { slotRepo } from '@/db/repositories/schedule';
import { semesterRepo } from '@/db/repositories/semesters';
import { clockToMinutes, addDaysKey, toDateKey } from '@/lib/dates';

// EXPORTS: seedIfEmpty, SEED_ENTRIES

/** 默认常用入口（与概念图一致） */
export const SEED_ENTRIES = [
  { name: '学习通', url: 'https://i.chaoxing.com' },
  { name: '哔哩哔哩', url: 'https://www.bilibili.com' },
  { name: '中国知网', url: 'https://www.cnki.net' },
  { name: 'Google Scholar', url: 'https://scholar.google.com' },
  { name: 'DeepL', url: 'https://www.deepl.com' },
  { name: 'GitHub', url: 'https://github.com' },
];

// 模块级去重锁：StrictMode 双挂载 / 多页面并发调用共享同一 promise，避免重复播种
let seedingPromise: Promise<void> | null = null;

export function seedIfEmpty(): Promise<void> {
  if (!seedingPromise) {
    seedingPromise = doSeed().finally(() => {
      seedingPromise = null;
    });
  }
  return seedingPromise;
}

async function doSeed(): Promise<void> {
  if ((await semesterRepo.count()) === 0) {
    await seedV1();
  }
  await seedV2();
  await seedV3();
  await seedV4();
  await seedV5();
  await seedV6();
}

/** V1 种子：学期 / 课程 / 任务 / 笔记 / 启动台 */
async function seedV1(): Promise<void> {
  const now = new Date();
  const today = now.getDay();
  // 学期起点：本周一往前推 8 周，保证今天处于学期中（第 9 周）
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((today + 6) % 7) - 7 * 8);
  const startDate = toDateKey(monday);

  const semester = await semesterRepo.create({
    name: '2026 秋季学期',
    startDate,
    endDate: addDaysKey(monday, 7 * 16 - 1),
    totalWeeks: 16,
    isCurrent: true,
  });

  // 概念图三节课（时间、地点、老师与定稿图一致）
  await slotRepo.bulkCreate([
    {
      semesterId: semester.id as number,
      title: '高等数学',
      dayOfWeek: today,
      startMin: clockToMinutes('08:00'),
      endMin: clockToMinutes('09:40'),
      location: '教3-201',
      teacher: '王老师',
      weekPattern: { type: 'all' },
      color: '#4A90D9',
    },
    {
      semesterId: semester.id as number,
      title: '大学英语',
      dayOfWeek: today,
      startMin: clockToMinutes('10:10'),
      endMin: clockToMinutes('11:50'),
      location: '文科楼405',
      teacher: '李老师',
      weekPattern: { type: 'all' },
      color: '#5BAE6F',
    },
    {
      semesterId: semester.id as number,
      title: '线性代数',
      dayOfWeek: today,
      startMin: clockToMinutes('14:00'),
      endMin: clockToMinutes('15:40'),
      location: '教3-203',
      teacher: '张老师',
      weekPattern: { type: 'all' },
      color: '#F2903D',
    },
  ]);

  // DDL：高数习题册（今天 22:00）、读书报告（昨天，逾期 1 天）
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0);
  const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 0);
  await assignmentRepo.bulkCreate([
    {
      semesterId: semester.id as number,
      title: '高数习题册',
      type: 'homework',
      dueAt: todayEnd.getTime(),
      status: 'todo',
      priority: 'high',
      note: '第三章课后习题 1-12',
      estimatedMin: 90,
    },
    {
      semesterId: semester.id as number,
      title: '读书报告',
      type: 'report',
      dueAt: yesterdayEnd.getTime(),
      status: 'todo',
      priority: 'high',
      note: '《活着》读后感，800 字',
      estimatedMin: 120,
    },
  ]);

  // 示例笔记
  await noteRepo.bulkCreate([
    {
      title: '高数 · 第三章笔记',
      content:
        '# 第三章 导数与微分\n\n## 基本求导公式\n\n- $(x^n)\' = nx^{n-1}$\n- $(e^x)\' = e^x$\n- $(\\ln x)\' = \\frac{1}{x}$\n\n## 注意\n\n> 复合函数求导用链式法则。',
      format: 'markdown',
      tags: ['高数'],
      quick: false,
    },
    {
      title: '学习方法备忘',
      content:
        '# 学习方法备忘\n\n- 早上先做最难的科目\n- 番茄钟 25 分钟一轮\n- 每周复盘一次课表与任务',
      format: 'markdown',
      tags: ['方法'],
      quick: false,
    },
  ]);

  // 启动台
  const group = await launcherGroupRepo.create({ name: '常用', sortOrder: 0 });
  await launcherItemRepo.bulkCreate(
    SEED_ENTRIES.map((e, i) => ({ groupId: group.id as number, name: e.name, url: e.url, sortOrder: i, openCount: 10 - i })),
  );
}

/** V2 补种：习惯打卡 / 专注 / 今日已完成任务（幂等，仅在 habits 表为空时执行） */
async function seedV2(): Promise<void> {
  if ((await habitRepo.count()) > 0) return;
  const now = new Date();
  const today = toDateKey(now);
  const yesterday = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  // 6 个习惯（与定稿图一致）
  const HABITS = [
    { name: '背单词', icon: '📖', color: '#4A90D9' },
    { name: '喝水', icon: '💧', color: '#5BAE6F' },
    { name: '运动', icon: '🏃', color: '#F2903D' },
    { name: '阅读', icon: '📚', color: '#8B74C8' },
    { name: '早睡', icon: '🌙', color: '#4FB3C4' },
    { name: '冥想', icon: '🧘', color: '#E5B93E' },
  ];
  const ids: number[] = [];
  for (const h of HABITS) {
    const rec = await habitRepo.create({ ...h, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] });
    ids.push(rec.id as number);
  }
  // 昨日全部完成；今日 5/6（冥想未完成）
  for (let i = 0; i < ids.length; i++) {
    await habitLogRepo.create({ habitId: ids[i], date: yesterday, done: true });
    await habitLogRepo.create({ habitId: ids[i], date: today, done: i < ids.length - 1 });
  }

  // 专注：今日 2.5h（3 个 50 分钟番茄）
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const base = dayStart.getTime() + 8 * 3600 * 1000;
  const sessions = [
    { label: '高等数学 · 第三章', startMin: 0, dur: 50 },
    { label: '大学英语 · 听力', startMin: 65, dur: 50 },
    { label: '线性代数 · 习题', startMin: 130, dur: 50 },
  ];
  for (const s of sessions) {
    await focusRepo.create({
      kind: 'pomodoro',
      label: s.label,
      startedAt: base + s.startMin * 60 * 1000,
      endedAt: base + (s.startMin + s.dur) * 60 * 1000,
      durationMin: s.dur,
    });
  }

  // 今日已完成任务（让「完成」统计有真实数据；仅当没有任何已完成任务时补充）
  const assignments = await assignmentRepo.list();
  if (!assignments.some((a) => a.status === 'done')) {
    const semester = await semesterRepo.getCurrent();
    if (semester) {
      await assignmentRepo.create({
        semesterId: semester.id as number,
        title: '英语听力练习',
        type: 'homework',
        dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime(),
        status: 'done',
        priority: 'medium',
        note: '完成 Unit 3 听力训练',
        estimatedMin: 30,
      });
    }
  }
}

/** V3 补种：记账收支（幂等，仅在 finance_records 表为空时执行） */
async function seedV3(): Promise<void> {
  if ((await financeRecordRepo.count()) > 0) return;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const ym = (yy: number, mm: number) => `${yy}-${String(mm + 1).padStart(2, '0')}`;
  const d = (day: number) => `${ym(y, m)}-${String(day).padStart(2, '0')}`;

  // 本月（前 12 天）支出 + 收入
  const thisMonth: Array<[string, number, string, string]> = [
    // [日期, 金额, 分类, 备注]
    [d(1), 1280, 'allowance', '10月生活费'],
    [d(1), 35, 'food', '食堂午餐'],
    [d(2), 6, 'transport', '地铁'],
    [d(2), 24, 'study', '英语真题资料'],
    [d(3), 48, 'food', '和朋友聚餐'],
    [d(4), 89, 'shopping', '秋装 T 恤'],
    [d(5), 2, 'transport', '共享单车'],
    [d(6), 15, 'entertainment', '游戏充值'],
    [d(7), 56, 'daily', '洗衣液+纸巾'],
    [d(8), 38, 'food', '食堂晚餐'],
    [d(9), 3.5, 'transport', '公交'],
    [d(10), 120, 'study', '高数辅导书'],
    [d(11), 42, 'food', '水果'],
    [d(12), 9, 'transport', '地铁'],
  ];
  for (const [date, amount, category, note] of thisMonth) {
    await financeRecordRepo.create({
      date,
      amount,
      categoryId: category,
      note,
      type: category === 'allowance' ? 'income' : 'expense',
    });
  }

  // 上月（完整 30 天模拟：收入 + 支出）
  const lastY = m === 0 ? y - 1 : y;
  const lastM = m === 0 ? 11 : m - 1;
  const lym = `${lastY}-${String(lastM + 1).padStart(2, '0')}`;
  const ld = (day: number) => `${lym}-${String(day).padStart(2, '0')}`;
  const lastMonth: Array<[string, number, string, string]> = [
    [ld(1), 1500, 'allowance', '9月生活费'],
    [ld(2), 42, 'food', '食堂'],
    [ld(3), 6, 'transport', '地铁'],
    [ld(5), 260, 'shopping', '秋季外套'],
    [ld(7), 58, 'food', '聚餐'],
    [ld(9), 35, 'study', '笔记本'],
    [ld(10), 200, 'parttime', '家教'],
    [ld(12), 28, 'daily', '日用品'],
    [ld(15), 99, 'entertainment', '电影票'],
    [ld(18), 66, 'food', '超市采购'],
    [ld(20), 12, 'transport', '打车'],
    [ld(22), 45, 'study', '打印资料'],
    [ld(25), 88, 'shopping', '耳机配件'],
    [ld(27), 32, 'food', '奶茶'],
    [ld(29), 8, 'transport', '公交'],
  ];
  for (const [date, amount, category, note] of lastMonth) {
    await financeRecordRepo.create({
      date,
      amount,
      categoryId: category,
      note,
      type: category === 'allowance' || category === 'parttime' ? 'income' : 'expense',
    });
  }
}

/** V3 启动台补种：用户指定的常用网站入口（幂等，按 URL 去重） */
async function seedV4(): Promise<void> {
  const ADD = [
    { name: '网飞猫', url: 'https://www.ncat31.com' },
    { name: '腾讯视频', url: 'https://v.qq.com' },
    { name: '抖音', url: 'https://www.douyin.com' },
    { name: 'DeepSeek', url: 'https://chat.deepseek.com' },
    { name: '中国计算机职业资格网', url: 'https://www.ruankao.org.cn' },
  ];
  const items = await launcherItemRepo.list();
  const existing = new Set(items.map((i) => i.url));
  const missing = ADD.filter((a) => !existing.has(a.url));
  if (missing.length === 0) return;

  let group = (await launcherGroupRepo.list()).find((g) => g.name === '常用');
  if (!group) {
    group = await launcherGroupRepo.create({ name: '常用', sortOrder: 0 });
  }
  const maxSort = items
    .filter((i) => i.groupId === group!.id)
    .reduce((m, i) => Math.max(m, i.sortOrder ?? 0), 0);
  for (let i = 0; i < missing.length; i++) {
    await launcherItemRepo.create({
      groupId: group.id as number,
      name: missing[i].name,
      url: missing[i].url,
      sortOrder: maxSort + 1 + i,
      openCount: 0,
    });
  }
}

/** V5 启动台重构：按功能分组（学习/视频），常用组改为虚拟聚合（openCount>=5 自动归入） */
async function seedV5(): Promise<void> {
  const groups = await launcherGroupRepo.list();
  const common = groups.find((g) => g.name === '常用');
  if (!common) return; // 已迁移

  let study = groups.find((g) => g.name === '学习');
  let video = groups.find((g) => g.name === '视频');
  if (!study) study = await launcherGroupRepo.create({ name: '学习', sortOrder: 0 });
  if (!video) video = await launcherGroupRepo.create({ name: '视频', sortOrder: 1 });

  const STUDY_NAMES = ['学习通', '中国知网', 'Google Scholar', 'DeepL', 'GitHub', 'DeepSeek', '中国计算机职业资格网'];
  const VIDEO_NAMES = ['哔哩哔哩', '抖音', '网飞猫', '腾讯视频'];

  const items = await launcherItemRepo.list();
  for (const item of items) {
    if (item.groupId !== common.id) continue;
    let targetId: number | undefined;
    if (STUDY_NAMES.includes(item.name)) targetId = study.id;
    else if (VIDEO_NAMES.includes(item.name)) targetId = video.id;
    if (targetId != null && item.id != null) {
      await launcherItemRepo.update(item.id, { groupId: targetId });
    }
  }

  // 重排各组 sortOrder
  const all = await launcherItemRepo.list();
  for (const g of [study, video]) {
    const gItems = all.filter((i) => i.groupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < gItems.length; i++) {
      if (gItems[i].id != null) await launcherItemRepo.update(gItems[i].id!, { sortOrder: i });
    }
  }
  await launcherGroupRepo.update(study.id as number, { sortOrder: 0 });
  await launcherGroupRepo.update(video.id as number, { sortOrder: 1 });

  // 常用组已清空，删除（启动台改为虚拟聚合）
  await launcherGroupRepo.softDelete(common.id as number);
}

/** V6 修复：seedV5 迁移时遗漏的视频类入口（网飞猫/腾讯视频）变成孤儿，重新归入视频组 */
async function seedV6(): Promise<void> {
  const FIX = [
    { name: '网飞猫', url: 'https://www.ncat31.com' },
    { name: '腾讯视频', url: 'https://v.qq.com' },
  ];
  const groups = await launcherGroupRepo.list();
  const validGroupIds = new Set(groups.map((g) => g.id as number));
  let video = groups.find((g) => g.name === '视频');
  if (!video) video = await launcherGroupRepo.create({ name: '视频', sortOrder: 1 });

  const items = await launcherItemRepo.list();
  const videoItems = items.filter((i) => i.groupId === video.id).sort((a, b) => a.sortOrder - b.sortOrder);
  let nextSort = videoItems.length;

  for (const entry of FIX) {
    const existing = items.find((i) => i.url === entry.url);
    if (existing) {
      // 已存在但在已删除分组中（孤儿）→ 移到视频组
      if (!validGroupIds.has(existing.groupId) && existing.id != null) {
        await launcherItemRepo.update(existing.id, { groupId: video.id as number, sortOrder: nextSort++ });
      }
    } else {
      // 不存在 → 创建到视频组
      await launcherItemRepo.create({
        groupId: video.id as number,
        name: entry.name,
        url: entry.url,
        sortOrder: nextSort++,
        openCount: 0,
      });
    }
  }
}
