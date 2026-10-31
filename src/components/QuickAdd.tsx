import { useState } from 'react';
import { Plus, X, FileText, CheckSquare, Wallet, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/db/db';

type Kind = 'note' | 'task' | 'finance' | 'habit';

export default function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('note');
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    const now = Date.now();
    try {
      if (kind === 'note') {
        await db.notes.add({ title: t.slice(0, 30) || '未命名', content: t, format: 'markdown', tags: [], quick: true, createdAt: now, updatedAt: now, deletedAt: 0 });
        toast.success('已加笔记');
      } else if (kind === 'task') {
        await db.assignments.add({ title: t, type: 'homework', dueAt: now + 86400000, status: 'todo', priority: 'medium', createdAt: now, updatedAt: now, deletedAt: 0 });
        toast.success('已加任务');
      } else if (kind === 'finance') {
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) { toast.error('请输入金额'); return; }
        await db.finance_records.add({ date: new Date().toISOString().slice(0, 10), categoryId: 'food', amount: amt, note: t, type: 'expense', createdAt: now, deletedAt: 0 });
        toast.success(`已记账：${amt} 元`);
      } else if (kind === 'habit') {
        const habits = await db.habits.toArray();
        const h = habits.find((x) => x.deletedAt === 0 && x.name.includes(t));
        if (!h) { toast.error(`没找到习惯"${t}"，先到习惯页创建`); return; }
        const today = new Date().toISOString().slice(0, 10);
        await db.habit_logs.add({ habitId: h.id!, date: today, done: true, createdAt: now });
        toast.success(`已打卡：${h.name}`);
      }
      setText(''); setAmount(''); setOpen(false);
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    }
  };

  const kinds: { k: Kind; label: string; icon: React.ReactNode }[] = [
    { k: 'note', label: '笔记', icon: <FileText className="h-4 w-4" /> },
    { k: 'task', label: '任务', icon: <CheckSquare className="h-4 w-4" /> },
    { k: 'finance', label: '记账', icon: <Wallet className="h-4 w-4" /> },
    { k: 'habit', label: '打卡', icon: <CheckCircle className="h-4 w-4" /> },
  ];

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/30 transition-transform hover:scale-110"
        title="随手记 (Ctrl+N)"
      >
        <Plus className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 pb-[20vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-1">
                {kinds.map(({ k, label, icon }) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${kind === k ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-400"><X className="h-4 w-4" /></button>
            </div>

            {kind === 'finance' && (
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="金额"
                type="number"
                className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700"
              />
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder={kind === 'note' ? '快速记一条想法…' : kind === 'task' ? '要做什么？' : kind === 'finance' ? '备注（如：午饭）' : '习惯名（如：背单词）'}
              rows={3}
              autoFocus
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700"
            />
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="mt-2 w-full rounded-lg bg-blue-500 py-2 text-sm text-white disabled:opacity-30"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </>
  );
}
