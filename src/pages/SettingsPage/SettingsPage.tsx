// 设置页：学期 / 外观 / 备份与导入 / 存储信息 / 数据管理
import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Database, Download, HardDrive, Moon, Palette, Save, Sparkles, Trash2, Upload, Bell, Clock } from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { semesterRepo } from '@/db/repositories/semesters';
import { settingsRepo } from '@/db/repositories/settings';
import { seedIfEmpty } from '@/data/seed';
import { db } from '@/db/db';
import { estimateUsage } from '@/lib/storage-persist';
import { exportBackup, downloadJson, importBackup } from '@/lib/backup';
import { getSavedTheme, saveTheme, ThemeMode } from '@/lib/theme';
import { clockToMinutes, minutesToClock } from '@/lib/dates';
import { DEFAULT_PERIODS, PERIODS_SETTING_KEY, normalizePeriods, type Period } from '@/lib/schedule/periods';
import {
  DEFAULT_REMINDERS, loadReminderSettings, requestNotificationPermission,
  saveReminderSettings, type ReminderSettings,
} from '@/lib/schedule/reminders';
import { loadAiConfig, saveAiConfig, DEEPSEEK_PRESET } from '@/modules/quiz/ai';
import type { AiConfig } from '@/modules/quiz/ai';
import SemesterDialog from './SemesterDialog';
import TrashBinCard from './TrashBinCard';
import type { ISemester } from '@/db/types';

function fmtMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function SettingsPage() {
  const [semester, setSemester] = useState<ISemester | null>(null);
  const [allSemesters, setAllSemesters] = useState<ISemester[]>([]);
  const [semDialog, setSemDialog] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState(DEEPSEEK_PRESET.baseUrl);
  const [aiModel, setAiModel] = useState(DEEPSEEK_PRESET.model);
  // 阶段四：AI 助手人设（可编辑，存 settings:studydesk:chat-system-prompt，默认内置"周小如"）
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatPromptDirty, setChatPromptDirty] = useState(false);
  // 阶段四：AI 助手权限（view=仅可查看 / edit=工作区内修改 / full=完全权限，默认 full）
  const [chatPermission, setChatPermission] = useState<'view' | 'edit' | 'full'>('full');
  const [chatPermissionDirty, setChatPermissionDirty] = useState(false);
  const [periods, setPeriods] = useState<Period[]>(DEFAULT_PERIODS);
  const [reminder, setReminder] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadAiConfig().then((cfg) => {
      if (cfg) {
        setAiKey(cfg.apiKey);
        setAiBaseUrl(cfg.baseUrl);
        setAiModel(cfg.model);      }
    }).catch(() => {});
    settingsRepo.get<Period[]>(PERIODS_SETTING_KEY, DEFAULT_PERIODS)
      .then((v) => setPeriods(normalizePeriods(v) ?? DEFAULT_PERIODS))
      .catch(() => {});
    loadReminderSettings().then(setReminder).catch(() => {});
    // 阶段四：加载 AI 助手人设（空=使用内置默认）
    settingsRepo.get<string>('studydesk:chat-system-prompt', '')
      .then((v) => { setChatPrompt(v ?? ''); setChatPromptDirty(false); })
      .catch(() => {});
    // 阶段四：加载 AI 助手权限
    settingsRepo.get<string>('studydesk:chat-permission', 'full')
      .then((v) => {
        if (v === 'view' || v === 'edit' || v === 'full') {
          setChatPermission(v);
          setChatPermissionDirty(false);
        }
      })
      .catch(() => {});
  }, []);

  const saveAi = useCallback(async () => {
    const cfg: AiConfig = {
      apiKey: aiKey.trim(),
      baseUrl: aiBaseUrl.trim() || DEEPSEEK_PRESET.baseUrl,
      model: aiModel.trim() || DEEPSEEK_PRESET.model,
    };
    await saveAiConfig(cfg);
    toast.success('AI 配置已保存');
  }, [aiKey, aiBaseUrl, aiModel]);

  // 阶段四：保存 AI 助手人设（留空 = 恢复内置默认"周小如"）
  const saveChatPrompt = useCallback(async () => {
    const v = chatPrompt.trim();
    await settingsRepo.set('studydesk:chat-system-prompt', v);
    setChatPromptDirty(false);
    toast.success(v ? '助手人设已保存' : '已恢复默认人设（周小如）');
  }, [chatPrompt]);

  // 阶段四：保存 AI 助手权限
  const saveChatPermission = useCallback(async () => {
    await settingsRepo.set('studydesk:chat-permission', chatPermission);
    setChatPermissionDirty(false);
    toast.success('AI 助手权限已保存');
  }, [chatPermission]);

  const fetchData = useCallback(async (): Promise<{ sem: ISemester | null; themeMode: ThemeMode }> => {
    await seedIfEmpty();
    const sem = (await semesterRepo.getCurrent()) ?? null;
    return { sem, themeMode: getSavedTheme() };
  }, []);

  const applyData = useCallback((d: { sem: ISemester | null; themeMode: ThemeMode }) => {
    setSemester(d.sem);
    setTheme(d.themeMode);
  }, []);

  useEffect(() => {
    fetchData()
      .then(applyData)
      .catch(() => {});
  }, [fetchData, applyData]);

  useEffect(() => {
    void estimateUsage().then((est) => setStorage(est));
    void navigator.storage
      ?.persisted()
      .then((p) => setPersisted(p))
      .catch(() => setPersisted(false));
  }, []);

  const changeTheme = useCallback((mode: ThemeMode) => {
    setTheme(mode);
    saveTheme(mode);
    toast.success(mode === 'system' ? '已跟随系统外观' : mode === 'dark' ? '已切换深色模式' : '已切换浅色模式');
  }, []);

  const savePeriods = useCallback(async () => {
    const normalized = normalizePeriods(periods);
    if (!normalized) {
      toast.error('作息表不合法：结束时间需晚于开始时间');
      return;
    }
    await settingsRepo.set(PERIODS_SETTING_KEY, normalized);
    setPeriods(normalized);
    toast.success('课表作息已保存（导入与分享图会使用）');
  }, [periods]);

  const toggleReminder = useCallback(async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        toast.error('浏览器未授权通知，请在地址栏权限里允许通知');
        return;
      }
    }
    const next = { ...reminder, enabled };
    setReminder(next);
    await saveReminderSettings(next);
    toast.success(enabled ? `已开启课前 ${next.leadMin} 分钟提醒` : '已关闭上课提醒');
  }, [reminder]);

  const changeLead = useCallback(async (value: string) => {
    const next = { ...reminder, leadMin: Number(value) };
    setReminder(next);
    await saveReminderSettings(next);
    toast.success(`提醒时间已改为提前 ${next.leadMin} 分钟`);
  }, [reminder]);

  const updatePeriod = (slot: number, field: 'startMin' | 'endMin', value: string) => {
    const minutes = clockToMinutes(value);
    setPeriods((prev) => prev.map((p) => (p.slot === slot ? { ...p, [field]: minutes } : p)));
  };

  const reloadSemester = useCallback(() => {
    semesterRepo
      .getCurrent()
      .then((s) => setSemester(s ?? null))
      .catch(() => {});
    // S5: 同时加载全部学期列表
    semesterRepo.listAll().then((list) => setAllSemesters(list)).catch(() => {});
  }, []);

  const handleSetCurrent = useCallback(async (id: number) => {
    await semesterRepo.setCurrent(id);
    toast.success('已设为当前学期');
    reloadSemester();
  }, [reloadSemester]);

  const handleDeleteSemester = useCallback(async (s: ISemester) => {
    if (s.isCurrent) { toast.error('不能删除当前学期，请先切换到其他学期'); return; }
    const refs = await semesterRepo.hasReferences(s.id!);
    if (refs.slots > 0 || refs.assignments > 0) {
      if (!window.confirm(`学期「${s.name}」下有 ${refs.slots} 节课、${refs.assignments} 个任务，删除后这些记录会一并移入回收站。仍要删除吗？`)) return;
    } else {
      if (!window.confirm(`确认删除学期「${s.name}」？`)) return;
    }
    await semesterRepo.removeWithReferences(s.id!);
    toast.success('学期及其课程/任务已删除（可到回收站恢复）');
    reloadSemester();
  }, [reloadSemester]);

  const doExport = useCallback(async () => {
    const backup = await exportBackup();
    const stamp = format(new Date(), 'yyyyMMdd-HHmm');
    downloadJson(`studydesk-backup-${stamp}.json`, JSON.stringify(backup, null, 2));
    toast.success('备份已导出');
  }, []);

  const doImport = useCallback(
    async (file: File) => {
      // S1: 导入会全量覆盖现有数据，必须二次确认
      if (!window.confirm('⚠️ 导入备份将清空并覆盖当前所有数据，且不可撤销！\n\n确定要用该备份文件覆盖现有数据吗？')) return;
      setImporting(true);
      try {
        const result = await importBackup(file);
        toast.success(`导入完成：${result.tables} 张表 · ${result.rows} 条记录`);
        // S3: 导入会全量覆盖内存状态，提示重启
        toast.message('导入成功，请重启应用以加载全部数据', { duration: 5000 });
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '导入失败');
      } finally {
        setImporting(false);
      }
    },
    [],
  );

  const doReset = useCallback(async () => {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
    });
    toast.success('已清空所有数据');
    setConfirmReset(false);
    reloadSemester();
  }, [reloadSemester]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">设置</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">学期、外观、备份与数据管理</p>
      </div>

      <div className="space-y-5">
        {/* 学期 */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">学期</h2>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSemDialog(true)}>
              编辑
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-foreground">{semester?.name ?? '—'}</span>
            <span className="text-muted-foreground">
              {semester?.startDate ? format(new Date(semester.startDate), 'yyyy年M月d日') : '—'}
              {' 至 '}
              {semester?.endDate ? format(new Date(semester.endDate), 'yyyy年M月d日') : '—'}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
              {semester?.isCurrent ? '当前学期' : '未设置'}
            </span>
          </div>
          {/* S5: 历史学期管理 */}
          {allSemesters.length > 1 && (
            <div className="mt-4 space-y-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">全部学期（{allSemesters.length}）</p>
              {allSemesters.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.startDate} ~ {s.endDate}
                  </span>
                  {s.isCurrent ? (
                    <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">当前</span>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => void handleSetCurrent(s.id!)}>
                        设为当前
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-danger hover:bg-danger/10" onClick={() => void handleDeleteSemester(s)}>
                        <Trash2 className="h-3 w-3" /> 删除
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* 课表作息 */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">课表作息</h2>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setPeriods(DEFAULT_PERIODS)}
            >
              恢复默认
            </Button>
            <Button size="sm" onClick={() => void savePeriods()}>
              <Save className="h-3.5 w-3.5" /> 保存
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            节次时间用于课表导入（只有“第 1-2 节”没有具体时间时）与分享图。不同学校作息不同，请按本校调整。
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {periods.map((p) => (
              <div key={p.slot} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-1.5">
                <span className="w-11 shrink-0 text-xs text-muted-foreground">第 {p.slot} 节</span>
                <Input
                  type="time"
                  value={minutesToClock(p.startMin)}
                  onChange={(e) => updatePeriod(p.slot, 'startMin', e.target.value)}
                  className="h-8 w-[104px]"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <Input
                  type="time"
                  value={minutesToClock(p.endMin)}
                  onChange={(e) => updatePeriod(p.slot, 'endMin', e.target.value)}
                  className="h-8 w-[104px]"
                />
              </div>
            ))}
          </div>
        </GlassCard>

        {/* 上课提醒 */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">上课提醒</h2>
            <Switch
              className="ml-auto"
              checked={reminder.enabled}
              onCheckedChange={(v) => void toggleReminder(v)}
              aria-label="开启上课提醒"
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            在课程开始前用系统通知提醒；应用打开期间生效（Web/Electron 均需允许通知权限），不联网、不上传。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Label className="text-xs text-muted-foreground">提前</Label>
            <Select value={String(reminder.leadMin)} onValueChange={(v) => void changeLead(v)}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[0, 5, 10, 15, 20].map((m) => (
                  <SelectItem key={m} value={String(m)}>{m} 分钟</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {reminder.enabled ? '已开启：到点会弹系统通知' : '当前未开启'}
            </span>
          </div>
        </GlassCard>

        {/* 外观 */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">外观</h2>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Label className="text-sm text-muted-foreground">主题</Label>
            <Select value={theme} onValueChange={(v) => changeTheme(v as ThemeMode)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">浅色</SelectItem>
                <SelectItem value="dark">深色</SelectItem>
                <SelectItem value="system">跟随系统</SelectItem>
              </SelectContent>
            </Select>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Moon className="h-3.5 w-3.5" /> 液态玻璃在两种模式下均可悬浮呈现
            </span>
          </div>
        </GlassCard>

        {/* AI 配置（题库识别） */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">AI 题库识别</h2>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setAiBaseUrl(DEEPSEEK_PRESET.baseUrl);
                setAiModel(DEEPSEEK_PRESET.model);
              }}
            >
              填入 DeepSeek 预设
            </Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            用于导入题库时规则解析失败的兜底。Key 只存在本机浏览器，不上传其他地方。
            获取 DeepSeek Key：platform.deepseek.com
          </p>
          <div className="mt-4 grid gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <Input
                type="password"
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder="sk-..."
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Base URL</Label>
                <Input
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="https://api.deepseek.com/v1"
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">模型</Label>
                <Input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="deepseek-chat"
                  className="mt-1 font-mono text-xs"
                />
              </div>
            </div>
            <div>
              <Button size="sm" onClick={() => void saveAi()}>
                <Save className="h-3.5 w-3.5" /> 保存 AI 配置
              </Button>
            </div>
          </div>

          {/* 阶段四：AI 助手人设（可编辑） */}
          <div className="mt-5 border-t border-white/50 pt-4 dark:border-white/10">
            <Label className="text-xs text-muted-foreground">AI 助手人设（系统提示词）</Label>
            <Textarea
              value={chatPrompt}
              onChange={(e) => { setChatPrompt(e.target.value); setChatPromptDirty(true); }}
              rows={6}
              placeholder="留空使用内置默认人设：你是 StudyDesk 桌面助手「周小如」…"
              className="mt-1.5 text-xs leading-relaxed"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              用于 AI 助手对话（/chat）。留空保存即恢复默认"周小如"人设；Key 只存本机。
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              disabled={!chatPromptDirty}
              onClick={() => void saveChatPrompt()}
            >
              <Save className="h-3.5 w-3.5" /> 保存人设
            </Button>
          </div>

          {/* 阶段四：AI 助手权限（仅可查看 / 工作区内修改 / 完全权限） */}
          <div className="mt-5 border-t border-white/50 pt-4 dark:border-white/10">
            <Label className="text-xs text-muted-foreground">AI 助手权限</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <Select value={chatPermission} onValueChange={(v) => { setChatPermission(v as 'view' | 'edit' | 'full'); setChatPermissionDirty(true); }}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">仅可查看</SelectItem>
                  <SelectItem value="edit">工作区内修改</SelectItem>
                  <SelectItem value="full">完全权限</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={!chatPermissionDirty} onClick={() => void saveChatPermission()}>
                <Save className="h-3.5 w-3.5" /> 保存权限
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              仅可查看：AI 只能查询今日安排等只读数据；工作区内修改：可新增/修改记账、笔记、任务、课表、习惯、题库，删除类操作不可用；
              完全权限：可增删改查全部数据，删除类操作会先弹出确认卡片、经你确认后才执行。
            </p>
          </div>
        </GlassCard>

        {/* 备份 */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">备份与导入</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            数据全部保存在本机浏览器（IndexedDB），不会上传云端。导出 JSON 备份可随时恢复，建议定期备份。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={() => void doExport()}>
              <Download className="h-4 w-4" /> 导出备份
            </Button>
            <Button
              variant="outline"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> {importing ? '导入中…' : '导入备份'}
            </Button>
            <Input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
                e.target.value = '';
              }}
            />
          </div>
        </GlassCard>

        {/* 回收站 */}
        <TrashBinCard />

        {/* 存储 */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">存储</h2>
          </div>
          <div className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">已使用</span>
              <span className="tabular-nums text-foreground">{storage ? fmtMb(storage.usage) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">可用配额</span>
              <span className="tabular-nums text-foreground">{storage ? fmtMb(storage.quota) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">持久化授权</span>
              <span className="text-foreground">
                {persisted == null ? '检测中…' : persisted ? '已授权（数据更稳定保留）' : '未授权'}
              </span>
            </div>
          </div>
        </GlassCard>

        {/* 数据管理 */}
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-danger" />
            <h2 className="text-[15px] font-semibold text-foreground">数据管理</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            删除所有课程、任务、笔记、题库、对话等全部数据，不恢复示例。此操作不可撤销，建议先导出备份。
          </p>
          <Button variant="outline" size="sm" className="mt-3 text-danger hover:bg-danger/10" onClick={() => setConfirmReset(true)}>
            <Trash2 className="h-3.5 w-3.5" /> 重置所有数据
          </Button>
        </GlassCard>
      </div>

      <SemesterDialog key={semDialog ? 'open' : 'closed'} open={semDialog} onOpenChange={setSemDialog} semester={semester} onSaved={reloadSemester} />

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重置所有数据</AlertDialogTitle>
            <AlertDialogDescription>
              将删除所有课程、任务、笔记、题库、对话、记账、设置等全部内容，且不恢复示例数据。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doReset()}>确认重置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
