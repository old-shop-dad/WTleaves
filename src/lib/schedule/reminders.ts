// 上课提醒：全局 hook + 设置读写（应用打开期间生效）
import { useEffect } from 'react';
import { settingsRepo } from '@/db/repositories/settings';
import { semesterRepo } from '@/db/repositories/semesters';
import { overrideRepo, slotRepo } from '@/db/repositories/schedule';
import { coursesOnDate } from '@/lib/schedule/occurrences';
import { courseTimeOf, DEFAULT_PERIODS, normalizePeriods, PERIODS_SETTING_KEY } from '@/lib/schedule/periods';
import { semesterStateOn } from '@/lib/semester';
import { minutesToClock, toDateKey } from '@/lib/dates';

export interface ReminderSettings {
  enabled: boolean;
  leadMin: number;
}

const KEY = 'schedule.reminders';
export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, leadMin: 10 };

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const raw = await settingsRepo.get<Partial<ReminderSettings>>(KEY, {});
  const lead = Number(raw.leadMin);
  return {
    enabled: raw.enabled === true,
    leadMin: [0, 5, 10, 15, 20].includes(lead) ? lead : DEFAULT_REMINDERS.leadMin,
  };
}

export async function saveReminderSettings(next: ReminderSettings): Promise<void> {
  await settingsRepo.set(KEY, next);
  window.dispatchEvent(new CustomEvent('studydesk:reminders-changed'));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

const notified = new Set<string>();

/** 挂在 Layout 上：每 30 秒检查一次今日课程，提前 N 分钟提醒 */
export function useClassReminders(): void {
  useEffect(() => {
    let disposed = false;

    const run = async () => {
      if (disposed) return;
      const settings = await loadReminderSettings();
      if (!settings.enabled) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

      const now = new Date();
      const semester = await semesterRepo.getCurrent();
      if (!semester || semesterStateOn(semester, now) !== 'ongoing') return;
      const dateKey = toDateKey(now);
      const [slots, overrides, periodsRaw] = await Promise.all([
        slotRepo.list(),
        overrideRepo.list(),
        settingsRepo.get(PERIODS_SETTING_KEY, null),
      ]);
      const periods = normalizePeriods(periodsRaw) ?? DEFAULT_PERIODS;
      const courses = coursesOnDate({
        dateKey,
        semester,
        slots: slots.filter((s) => s.semesterId === semester.id),
        overrides,
      });

      const nowMin = now.getHours() * 60 + now.getMinutes();
      const today = dateKey;

      for (const course of courses) {
        // 课程时间跟随作息换算，提醒与实际上课时间一致
        const t = courseTimeOf(course, periods);
        const diff = t.startMin - nowMin;
        if (diff < 0 || diff > settings.leadMin) continue;
        const key = `${today}-${course.slotId ?? course.title}-${t.startMin}`;
        if (notified.has(key)) continue;
        notified.add(key);
        try {
          new Notification(`即将上课：${course.title}`, {
            body: `${minutesToClock(t.startMin)} 开始${course.location ? ` · ${course.location}` : ''}`,
            tag: key,
          });
        } catch { /* 通知被系统拒绝时静默忽略 */ }
      }

      // 控制 Set 规模：只保留今天的 key
      if (notified.size > 200) {
        for (const key of notified) {
          if (!key.startsWith(today)) notified.delete(key);
        }
      }
    };

    const tick = () => { void run(); };
    tick();
    const interval = window.setInterval(tick, 30_000);
    const onChanged = () => tick();
    window.addEventListener('studydesk:reminders-changed', onChanged);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.removeEventListener('studydesk:reminders-changed', onChanged);
    };
  }, []);
}
