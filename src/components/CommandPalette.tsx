import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/db/db';
import { Search, FileText, CheckSquare, Calendar, Wallet, HelpCircle, X } from 'lucide-react';

type Result = {
  id: string;
  type: 'note' | 'task' | 'course' | 'finance' | 'question' | 'page';
  title: string;
  subtitle?: string;
  path: string;
};

const PAGES: Result[] = [
  { id: 'p-today', type: 'page', title: '今日', subtitle: '首页', path: '/' },
  { id: 'p-schedule', type: 'page', title: '课表', subtitle: '周视图', path: '/schedule' },
  { id: 'p-tasks', type: 'page', title: '任务', subtitle: '待办 DDL', path: '/tasks' },
  { id: 'p-notes', type: 'page', title: '笔记', subtitle: 'Markdown 笔记', path: '/notes' },
  { id: 'p-quiz', type: 'page', title: '刷题', subtitle: '题库与练习', path: '/quiz' },
  { id: 'p-habits', type: 'page', title: '习惯打卡', path: '/habits' },
  { id: 'p-focus', type: 'page', title: '专注', subtitle: '番茄钟', path: '/focus' },
  { id: 'p-finance', type: 'page', title: '记账', subtitle: '收支流水', path: '/finance' },
  { id: 'p-chat', type: 'page', title: 'AI 助手', subtitle: '周小如', path: '/chat' },
  { id: 'p-settings', type: 'page', title: '设置', path: '/settings' },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // 快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 打开时聚焦 + 清空
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // 搜索
  useEffect(() => {
    if (!open) return;
    const run = async () => {
      const query = q.trim().toLowerCase();
      if (!query) {
        setResults(PAGES.slice(0, 8));
        return;
      }
      const list: Result[] = [];
      // 页面
      for (const p of PAGES) {
        if (p.title.toLowerCase().includes(query)) list.push(p);
      }
      try {
        const notes = await db.notes.where('deletedAt').equals(0).toArray();
        for (const n of notes) {
          if (n.title.toLowerCase().includes(query)) {
            list.push({ id: `n-${n.id}`, type: 'note', title: n.title, path: `/notes?id=${n.id}` });
          }
        }
        const tasks = await db.assignments.where('deletedAt').equals(0).toArray();
        for (const t of tasks) {
          if (t.title.toLowerCase().includes(query)) {
            list.push({ id: `t-${t.id}`, type: 'task', title: t.title, subtitle: t.status === 'done' ? '已完成' : '待办', path: '/tasks' });
          }
        }
        const slots = await db.schedule_slots.where('deletedAt').equals(0).toArray();
        for (const s of slots) {
          if (s.title.toLowerCase().includes(query)) {
            list.push({ id: `c-${s.id}`, type: 'course', title: s.title, subtitle: s.location ?? '', path: '/schedule' });
          }
        }
        const fin = await db.finance_records.where('deletedAt').equals(0).toArray();
        for (const f of fin) {
          const note = f.note ?? '';
          if (note.toLowerCase().includes(query) || String(f.amount).includes(query)) {
            list.push({ id: `f-${f.id}`, type: 'finance', title: `${f.type === 'expense' ? '支出' : '收入'} ${f.amount} 元`, subtitle: note, path: '/finance' });
          }
        }
        const qs = await db.quiz_questions.where('deletedAt').equals(0).toArray();
        for (const item of qs.slice(0, 500)) {
          if (item.stem.toLowerCase().includes(query)) {
            list.push({ id: `q-${item.id}`, type: 'question', title: item.stem.slice(0, 60), path: '/quiz' });
            if (list.length > 30) break;
          }
        }
      } catch {
        // ignore
      }
      setResults(list.slice(0, 15));
      setActive(0);
    };
    const t = setTimeout(run, 120);
    return () => clearTimeout(t);
  }, [q, open]);

  const icon = useMemo(() => ({
    note: <FileText className="h-4 w-4 text-blue-500" />,
    task: <CheckSquare className="h-4 w-4 text-green-500" />,
    course: <Calendar className="h-4 w-4 text-purple-500" />,
    finance: <Wallet className="h-4 w-4 text-amber-500" />,
    question: <HelpCircle className="h-4 w-4 text-rose-500" />,
    page: <Search className="h-4 w-4 text-gray-400" />,
  }), []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[10vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter' && results[active]) {
                navigate(results[active].path);
                setOpen(false);
              }
            }}
            placeholder="搜索笔记、任务、课程、题目、记账、页面…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[50vh] overflow-auto py-2">
          {results.length === 0 && <div className="px-4 py-6 text-center text-sm text-gray-400">没找到匹配结果</div>}
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => { navigate(r.path); setOpen(false); }}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === active ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
            >
              {icon[r.type]}
              <div className="flex-1 truncate">
                <div className="truncate text-gray-900 dark:text-gray-100">{r.title}</div>
                {r.subtitle && <div className="truncate text-xs text-gray-400">{r.subtitle}</div>}
              </div>
              <span className="text-xs text-gray-300">{r.type}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-gray-800">
          ↑↓ 选择 · Enter 打开 · Esc 关闭 · Ctrl+K 唤起
        </div>
      </div>
    </div>
  );
}
