import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/db/db';
import { Calendar, CheckSquare, Wallet, BookOpen, Sparkles, ChevronRight } from 'lucide-react';

interface Brief {
  courses: number;
  tasks: number;
  expense: number;
  questions: number;
}

export default function HomePage() {
  const [brief, setBrief] = useState<Brief>({ courses: 0, tasks: 0, expense: 0, questions: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const day = new Date().getDay();
        const semList = await db.semesters.toArray();
        const sem = semList.find((s) => s.isCurrent) ?? semList[semList.length - 1];
        let courses = 0;
        if (sem) {
          const slots = await db.schedule_slots.where('semesterId').equals(sem.id!).toArray();
          courses = slots.filter((s) => s.deletedAt === 0 && s.dayOfWeek === day).length;
        }
        const today = new Date(); today.setHours(23,59,59,999);
        const tasks = await db.assignments.where('deletedAt').equals(0).toArray();
        const pending = tasks.filter((t) => t.status !== 'done' && t.dueAt <= today.getTime()).length;
        const todayStr = new Date().toISOString().slice(0, 10);
        const fin = await db.finance_records.where('date').equals(todayStr).toArray();
        const expense = fin.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
        const qs = await db.quiz_questions.where('deletedAt').equals(0).count();
        setBrief({ courses, tasks: pending, expense, questions: qs });
      } catch { /* ignore */ }
    };
    void load();
  }, []);

  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

  const cards = [
    { to: '/schedule', icon: <Calendar className="h-5 w-5" />, label: '今日课程', value: `${brief.courses} 节`, color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10' },
    { to: '/tasks', icon: <CheckSquare className="h-5 w-5" />, label: '待办任务', value: `${brief.tasks} 个`, color: 'text-green-600 bg-green-50 dark:bg-green-500/10' },
    { to: '/finance', icon: <Wallet className="h-5 w-5" />, label: '今日支出', value: `${brief.expense} 元`, color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' },
    { to: '/quiz', icon: <BookOpen className="h-5 w-5" />, label: '题库总量', value: `${brief.questions} 题`, color: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* 问候 + 简报 */}
      <section className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-sm opacity-90">
          <Sparkles className="h-4 w-4" /> StudyDesk 今日简报
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{greet}，今天也是高效的一天</h1>
        <p className="mt-2 text-sm opacity-90">
          今天有 {brief.courses} 节课、{brief.tasks} 个待办、已花 {brief.expense} 元。
          {brief.tasks > 3 && ' 任务较多，建议优先处理最紧急的一项。'}
          {brief.courses === 0 && ' 今天没课，是集中刷题或写笔记的好时机。'}
        </p>
      </section>

      {/* 快速卡片 */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="group rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-white/5">
            <div className={`inline-flex rounded-xl p-2 ${c.color}`}>{c.icon}</div>
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">{c.label}</div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xl font-semibold">{c.value}</span>
              <ChevronRight className="h-4 w-4 text-gray-300 transition group-hover:translate-x-1 group-hover:text-gray-500" />
            </div>
          </Link>
        ))}
      </section>

      {/* 快捷入口 */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">快捷入口</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { to: '/chat', label: '和周小如聊天' },
            { to: '/notes/new', label: '写笔记' },
            { to: '/quiz/import', label: '导入题库' },
            { to: '/focus', label: '开始专注' },
            { to: '/schedule', label: '查看课表' },
          ].map((l) => (
            <Link key={l.to} to={l.to} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 transition hover:bg-blue-500 hover:text-white dark:bg-white/10 dark:text-gray-300">
              {l.label}
            </Link>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          快捷键：<kbd className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-white/10">Ctrl+K</kbd> 全局搜索 ·
          <kbd className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 dark:bg-white/10">右下角 +</kbd> 随手记
        </p>
      </section>
    </div>
  );
}
