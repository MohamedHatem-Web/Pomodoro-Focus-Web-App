import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import { translations, Language } from './i18n';
import QuranLibrary from './QuranLibrary';

// Types
type TimerMode = 'focus' | 'shortBreak' | 'longBreak';
type Theme = 'light' | 'dark';
type View = 'timer' | 'planner' | 'reports' | 'prayers' | 'quran';
type ReportPeriod = 'week' | 'month';
type PrayerCategoryId = 'study' | 'exam' | 'ease' | 'forgiveness' | 'after';
type PlannerDurationMode = 'focus-only' | 'elapsed-total';

interface BackupPayload {
  format: 'focus-to-work-backup';
  version: 1;
  exportedAt: string;
  data: Record<string, string>;
}

const prayerCategories: {
  id: PrayerCategoryId;
  title: { en: string; ar: string };
  prayers: { arabic: string; english: string; source: { en: string; ar: string } }[];
}[] = [
  {
    id: 'study',
    title: { en: 'Before studying', ar: 'قبل المذاكرة' },
    prayers: [
      {
        arabic: 'رَبِّ زِدْنِي عِلْمًا',
        english: 'My Lord, increase me in knowledge.',
        source: { en: 'Quran, Ta-Ha 20:114', ar: 'القرآن الكريم، طه: ١١٤' },
      },
      {
        arabic: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي',
        english: 'My Lord, expand for me my chest and ease for me my task.',
        source: { en: 'Quran, Ta-Ha 20:25–26', ar: 'القرآن الكريم، طه: ٢٥–٢٦' },
      },
      {
        arabic: 'اللهم افتح عليّ أبواب الفهم، وارزقني علمًا نافعًا، وبارك لي في وقتي.',
        english: 'O Allah, open the doors of understanding for me, grant me beneficial knowledge, and bless my time.',
        source: { en: 'General supplication', ar: 'دعاء عام' },
      },
    ],
  },
  {
    id: 'exam',
    title: { en: 'Starting an exam', ar: 'بداية حل الامتحان' },
    prayers: [
      {
        arabic: 'رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَثَبِّتْ أَقْدَامَنَا',
        english: 'Our Lord, pour upon us patience and make our steps firm.',
        source: { en: 'Quran, Al-Baqarah 2:250', ar: 'القرآن الكريم، البقرة: ٢٥٠' },
      },
      {
        arabic: 'اللهم ذكّرني ما نسيت، واهدني للصواب، ويسّر لي الإجابة.',
        english: 'O Allah, remind me of what I have forgotten, guide me to what is correct, and make my answers easy.',
        source: { en: 'General supplication', ar: 'دعاء عام' },
      },
    ],
  },
  {
    id: 'ease',
    title: { en: 'For ease and calm', ar: 'للتيسير والطمأنينة' },
    prayers: [
      {
        arabic: 'اللهم لا سهل إلا ما جعلته سهلًا، وأنت تجعل الصعب إذا شئت سهلًا.',
        english: 'O Allah, nothing is easy except what You make easy, and You can make what is difficult easy if You will.',
        source: { en: 'Supplication for ease', ar: 'دعاء للتيسير' },
      },
      {
        arabic: 'لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ',
        english: 'There is no deity except You; exalted are You. Indeed, I have been of the wrongdoers.',
        source: { en: 'Quran, Al-Anbiya 21:87', ar: 'القرآن الكريم، الأنبياء: ٨٧' },
      },
      {
        arabic: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ',
        english: 'Allah is sufficient for us, and He is the best Disposer of affairs.',
        source: { en: 'Quran, Aal-E-Imran 3:173', ar: 'القرآن الكريم، آل عمران: ١٧٣' },
      },
    ],
  },
  {
    id: 'forgiveness',
    title: { en: 'Istighfar and remembrance', ar: 'استغفار وأذكار' },
    prayers: [
      {
        arabic: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ',
        english: 'I seek Allah’s forgiveness and repent to Him.',
        source: { en: 'Istighfar', ar: 'استغفار' },
      },
      {
        arabic: 'رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ',
        english: 'My Lord, forgive me and accept my repentance. You are the Accepting of repentance, the Merciful.',
        source: { en: 'Supplication for forgiveness', ar: 'دعاء استغفار' },
      },
    ],
  },
  {
    id: 'after',
    title: { en: 'After studying', ar: 'بعد المذاكرة' },
    prayers: [
      {
        arabic: 'الْحَمْدُ لِلَّهِ الَّذِي بِنِعْمَتِهِ تَتِمُّ الصَّالِحَاتُ',
        english: 'Praise be to Allah, by whose blessing good things are completed.',
        source: { en: 'Words of praise', ar: 'من ألفاظ الحمد' },
      },
      {
        arabic: 'رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ',
        english: 'Our Lord, accept this from us. Indeed, You are the Hearing, the Knowing.',
        source: { en: 'Quran, Al-Baqarah 2:127', ar: 'القرآن الكريم، البقرة: ١٢٧' },
      },
    ],
  },
];

interface TimerSettings {
  focus: number;
  shortBreak: number;
  longBreak: number;
  longBreakInterval: number;
}

interface DailyStats {
  date: string;
  focusSessions: number;
  totalFocusMinutes: number;
}

interface ActivityEvent {
  id: string;
  type: 'focus_completed' | 'task_added' | 'task_completed' | 'task_uncompleted';
  timestamp: number;
  taskId?: string;
  minutes?: number;
}

interface DailyReport {
  date: string;
  focusMinutes: number;
  focusSessions: number;
  plannedTasks: number;
  completedTasks: number;
  score: number | null;
}

interface ProductivityGoals {
  dailyFocusMinutes: number;
  studyDaysPerWeek: number;
}

interface TodoTask {
  id: string;
  text: string;
  completed: boolean;
}

interface PlannedSession {
  tasks: TodoTask[];
  timePerTask: number;
  focusBlockMinutes?: number[];
  completedFocusBlocks?: number;
  breakDuration: number;
  currentTaskIndex: number;
  currentPhase: 'focus' | 'break';
  isActive: boolean;
  phaseTimeLeft: number;
  breaksDone: number;
  breakCount: number;
  pendingTaskIndex: number;
}

const MINIMUM_PLANNER_FOCUS_BLOCK_MINUTES = 25;

function getCompletedFocusBlocks(session: PlannedSession): number {
  if (session.completedFocusBlocks !== undefined) return session.completedFocusBlocks;
  return session.currentPhase === 'break'
    ? Math.max(0, session.breaksDone - 1)
    : session.breaksDone;
}

function getCompletedBreaks(session: PlannedSession): number {
  if (session.completedFocusBlocks === undefined && session.currentPhase === 'break') {
    return Math.max(0, session.breaksDone - 1);
  }
  return session.breaksDone;
}

function getFocusBlockMinutes(session: PlannedSession, blockIndex = getCompletedFocusBlocks(session)): number {
  return session.focusBlockMinutes?.[blockIndex] ?? session.timePerTask;
}

function getMaximumPlannerBreaks(
  totalMinutes: number,
  durationMode: PlannerDurationMode,
  breakDuration: number,
): number {
  const safeBreakDuration = Math.max(0, breakDuration);
  const maximum = durationMode === 'focus-only'
    ? Math.floor(totalMinutes / MINIMUM_PLANNER_FOCUS_BLOCK_MINUTES) - 1
    : Math.floor(
      (totalMinutes - MINIMUM_PLANNER_FOCUS_BLOCK_MINUTES) /
      (MINIMUM_PLANNER_FOCUS_BLOCK_MINUTES + safeBreakDuration),
    );
  return Math.min(10, Math.max(0, maximum));
}

function getMaximumPlannerBreakDuration(
  totalMinutes: number,
  durationMode: PlannerDurationMode,
): number {
  const sessionLimit = durationMode === 'focus-only'
    ? Math.floor(totalMinutes / 4)
    : totalMinutes - MINIMUM_PLANNER_FOCUS_BLOCK_MINUTES * 2;
  return Math.min(30, Math.max(0, sessionLimit));
}

function distributeFocusMinutes(totalMinutes: number, blockCount: number): number[] {
  const baseMinutes = Math.floor(totalMinutes / blockCount);
  const extraMinutes = totalMinutes % blockCount;
  return Array.from({ length: blockCount }, (_, index) => baseMinutes + (index < extraMinutes ? 1 : 0));
}

interface SavedTimerState {
  mode: TimerMode;
  timeLeft: number;
  isRunning: boolean;
  deadline: number | null;
  view: View;
  plannedSession: PlannedSession | null;
}

// Helper functions
function getTodayKey(): string {
  return getDateKey(new Date());
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadStats(): DailyStats {
  const key = `pomodoro_stats_${getTodayKey()}`;
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      localStorage.removeItem(key);
    }
  }
  return { date: getTodayKey(), focusSessions: 0, totalFocusMinutes: 0 };
}

function saveStats(stats: DailyStats) {
  const key = `pomodoro_stats_${stats.date}`;
  localStorage.setItem(key, JSON.stringify(stats));
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!isRecord(value) ||
    typeof value.id !== 'string' ||
    !['focus_completed', 'task_added', 'task_completed', 'task_uncompleted'].includes(String(value.type)) ||
    !Number.isFinite(value.timestamp) ||
    !Number.isFinite(new Date(Number(value.timestamp)).getTime())) return false;
  const isTaskEvent = value.type !== 'focus_completed';
  return (!isTaskEvent || typeof value.taskId === 'string') &&
    (value.type !== 'focus_completed' ||
      (Number.isFinite(value.minutes) && Number(value.minutes) > 0 && Number(value.minutes) <= 480)) &&
    (value.taskId === undefined || typeof value.taskId === 'string') &&
    (value.minutes === undefined || Number.isFinite(value.minutes));
}

function loadActivityEvents(): ActivityEvent[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('pomodoro_activity_events') || '[]');
    return Array.isArray(saved) ? saved.filter(isActivityEvent) : [];
  } catch {
    return [];
  }
}

function loadProductivityGoals(): ProductivityGoals {
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoro_productivity_goals') || '{}');
    return {
      dailyFocusMinutes: Math.min(600, Math.max(30, Number(saved.dailyFocusMinutes) || 120)),
      studyDaysPerWeek: Math.min(7, Math.max(1, Number(saved.studyDaysPerWeek) || 5)),
    };
  } catch {
    return { dailyFocusMinutes: 120, studyDaysPerWeek: 5 };
  }
}

function recordActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'>) {
  const events = loadActivityEvents();
  events.push({ ...event, id: `${Date.now()}-${Math.random()}`, timestamp: Date.now() });
  localStorage.setItem('pomodoro_activity_events', JSON.stringify(events));
}

function recordFocusCompletion(minutes: number) {
  const stats = loadStats();
  const updated = {
    ...stats,
    focusSessions: stats.focusSessions + 1,
    totalFocusMinutes: stats.totalFocusMinutes + minutes,
  };
  saveStats(updated);
  recordActivity({ type: 'focus_completed', minutes });
  return updated;
}

function getFocusDayKeys(events: ActivityEvent[]): Set<string> {
  return new Set(events
    .filter((event) => event.type === 'focus_completed' && Number.isFinite(event.timestamp))
    .map((event) => getDateKey(new Date(event.timestamp)))
    .filter((date) => date !== 'NaN-NaN-NaN'));
}

function getStreakSummary(focusDays: Set<string>, now = new Date()): { current: number; longest: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstCurrentDay = new Date(today);
  if (!focusDays.has(getDateKey(firstCurrentDay))) firstCurrentDay.setDate(firstCurrentDay.getDate() - 1);

  let current = 0;
  const date = new Date(firstCurrentDay);
  while (focusDays.has(getDateKey(date))) {
    current += 1;
    date.setDate(date.getDate() - 1);
  }

  const sortedDays = [...focusDays].sort();
  let longest = 0;
  let run = 0;
  let previousDate: Date | null = null;
  sortedDays.forEach((day) => {
    const currentDate = new Date(`${day}T12:00:00`);
    const consecutive = previousDate !== null &&
      Math.round((currentDate.getTime() - previousDate.getTime()) / 86400000) === 1;
    run = consecutive ? run + 1 : 1;
    longest = Math.max(longest, run);
    previousDate = currentDate;
  });

  return { current, longest };
}

function loadSettings(): TimerSettings {
  const saved = localStorage.getItem('pomodoro_settings');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as Partial<TimerSettings>;
      return {
        focus: parsed.focus ?? 25,
        shortBreak: parsed.shortBreak ?? 5,
        longBreak: parsed.longBreak ?? 15,
        longBreakInterval: parsed.longBreakInterval ?? 4,
      };
    } catch {
      localStorage.removeItem('pomodoro_settings');
    }
  }
  return { focus: 25, shortBreak: 5, longBreak: 15, longBreakInterval: 4 };
}

function saveSettings(settings: TimerSettings) {
  localStorage.setItem('pomodoro_settings', JSON.stringify(settings));
}

function loadSessionsCompleted(): number {
  const saved = Number(localStorage.getItem('pomodoro_sessions_completed') || 0);
  return Number.isFinite(saved) && saved >= 0 ? saved : 0;
}

function loadTheme(): Theme {
  const saved = localStorage.getItem('pomodoro_theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadLanguage(): Language {
  const saved = localStorage.getItem('pomodoro_lang');
  return saved === 'ar' ? 'ar' : 'en';
}

function loadTodos(): TodoTask[] {
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoro_todos') || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function loadFavoritePrayerIds(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('pomodoro_favorite_prayers') || '[]');
    return Array.isArray(saved)
      ? [...new Set(saved.filter((id): id is string =>
        typeof id === 'string' && /^(study|exam|ease|forgiveness|after)-\d+$/.test(id)))]
      : [];
  } catch {
    return [];
  }
}

function loadSavedTimerState(): SavedTimerState | null {
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoro_timer_state') || 'null');
    return saved && typeof saved === 'object' ? saved as SavedTimerState : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTodoTaskArray(value: unknown): value is TodoTask[] {
  return Array.isArray(value) && value.every((task) =>
    isRecord(task) &&
    typeof task.id === 'string' &&
    typeof task.text === 'string' &&
    typeof task.completed === 'boolean');
}

function isPlannedSession(value: unknown): value is PlannedSession {
  return isRecord(value) &&
    isTodoTaskArray(value.tasks) &&
    Number.isFinite(value.timePerTask) && Number(value.timePerTask) >= 1 && Number(value.timePerTask) <= 480 &&
    (value.focusBlockMinutes === undefined ||
      (Array.isArray(value.focusBlockMinutes) &&
        value.focusBlockMinutes.length === Number(value.breakCount) + 1 &&
        value.focusBlockMinutes.every((minutes) => Number.isInteger(minutes) && Number(minutes) >= 1 && Number(minutes) <= 480) &&
        value.focusBlockMinutes.reduce((sum, minutes) => sum + Number(minutes), 0) <= 480)) &&
    (value.completedFocusBlocks === undefined ||
      (Number.isInteger(value.completedFocusBlocks) && Number(value.completedFocusBlocks) >= 0 &&
        Number(value.completedFocusBlocks) <= Number(value.breakCount) + 1)) &&
    Number.isFinite(value.breakDuration) && Number(value.breakDuration) >= 0 && Number(value.breakDuration) <= 30 &&
    Number.isInteger(value.currentTaskIndex) && Number(value.currentTaskIndex) >= 0 &&
    Number(value.currentTaskIndex) < value.tasks.length &&
    (value.currentPhase === 'focus' || value.currentPhase === 'break') &&
    typeof value.isActive === 'boolean' &&
    Number.isFinite(value.phaseTimeLeft) && Number(value.phaseTimeLeft) >= 0 && Number(value.phaseTimeLeft) <= 480 * 60 &&
    Number.isInteger(value.breaksDone) && Number(value.breaksDone) >= 0 && Number(value.breaksDone) <= 10 &&
    Number.isInteger(value.breakCount) && Number(value.breakCount) >= 0 && Number(value.breakCount) <= 10 &&
    Number.isInteger(value.pendingTaskIndex) && Number(value.pendingTaskIndex) >= 0 &&
    Number(value.pendingTaskIndex) < value.tasks.length;
}

function isSavedTimerState(value: unknown): value is SavedTimerState {
  return isRecord(value) &&
    (value.mode === 'focus' || value.mode === 'shortBreak' || value.mode === 'longBreak') &&
    Number.isFinite(value.timeLeft) && Number(value.timeLeft) >= 0 && Number(value.timeLeft) <= 480 * 60 &&
    typeof value.isRunning === 'boolean' &&
    (value.isRunning ? Number.isFinite(value.deadline) : value.deadline === null) &&
    (value.view === 'timer' || value.view === 'planner' || value.view === 'reports' || value.view === 'prayers' || value.view === 'quran') &&
    (value.plannedSession === null || isPlannedSession(value.plannedSession));
}

function getAppStorageData(): Record<string, string> {
  const data: Record<string, string> = {};
  const knownKeys = new Set([
    'pomodoro_activity_events',
    'pomodoro_ambient_volume',
    'pomodoro_favorite_prayers',
    'pomodoro_quran_preferences',
    'pomodoro_lang',
    'pomodoro_productivity_goals',
    'pomodoro_sessions_completed',
    'pomodoro_settings',
    'pomodoro_theme',
    'pomodoro_timer_state',
    'pomodoro_todos',
  ]);
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && (knownKeys.has(key) || /^pomodoro_stats_\d{4}-\d{2}-\d{2}$/.test(key))) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  return data;
}

function validateBackup(value: unknown): BackupPayload {
  if (
    !isRecord(value) ||
    value.format !== 'focus-to-work-backup' ||
    value.version !== 1 ||
    typeof value.exportedAt !== 'string' ||
    !isRecord(value.data)
  ) {
    throw new Error('Unsupported or invalid backup format.');
  }

  const data: Record<string, string> = {};
  const knownKeys = new Set([
    'pomodoro_activity_events',
    'pomodoro_ambient_volume',
    'pomodoro_favorite_prayers',
    'pomodoro_quran_preferences',
    'pomodoro_lang',
    'pomodoro_productivity_goals',
    'pomodoro_sessions_completed',
    'pomodoro_settings',
    'pomodoro_theme',
    'pomodoro_timer_state',
    'pomodoro_todos',
  ]);

  Object.entries(value.data).forEach(([key, rawValue]) => {
    if (!(knownKeys.has(key) || /^pomodoro_stats_\d{4}-\d{2}-\d{2}$/.test(key)) || typeof rawValue !== 'string') {
      throw new Error(`Unsupported backup field: ${key}`);
    }

    if (key === 'pomodoro_theme' && rawValue !== 'light' && rawValue !== 'dark') {
      throw new Error('Invalid theme setting in backup.');
    }
    if (key === 'pomodoro_lang' && rawValue !== 'en' && rawValue !== 'ar') {
      throw new Error('Invalid language setting in backup.');
    }
    if (key === 'pomodoro_sessions_completed' && (!Number.isInteger(Number(rawValue)) || Number(rawValue) < 0)) {
      throw new Error('Invalid session count in backup.');
    }
    if (key === 'pomodoro_ambient_volume' && (!Number.isFinite(Number(rawValue)) || Number(rawValue) < 0 || Number(rawValue) > 0.3)) {
      throw new Error('Invalid ambient volume in backup.');
    }

    if (key === 'pomodoro_activity_events') {
      const events: unknown = JSON.parse(rawValue);
      const validEvents = Array.isArray(events) && events.every(isActivityEvent);
      if (!validEvents) throw new Error('Invalid activity history in backup.');
    } else if (key === 'pomodoro_todos') {
      if (!isTodoTaskArray(JSON.parse(rawValue))) throw new Error('Invalid task list in backup.');
    } else if (key === 'pomodoro_settings') {
      const settings: unknown = JSON.parse(rawValue);
      if (!isRecord(settings) ||
        !Number.isFinite(settings.focus) || Number(settings.focus) < 1 || Number(settings.focus) > 120 ||
        !Number.isFinite(settings.shortBreak) || Number(settings.shortBreak) < 1 || Number(settings.shortBreak) > 30 ||
        !Number.isFinite(settings.longBreak) || Number(settings.longBreak) < 1 || Number(settings.longBreak) > 60 ||
        !Number.isInteger(settings.longBreakInterval) || Number(settings.longBreakInterval) < 2 || Number(settings.longBreakInterval) > 10) {
        throw new Error('Invalid timer settings in backup.');
      }
    } else if (key === 'pomodoro_productivity_goals') {
      const goals: unknown = JSON.parse(rawValue);
      if (!isRecord(goals) ||
        !Number.isFinite(goals.dailyFocusMinutes) || Number(goals.dailyFocusMinutes) < 30 || Number(goals.dailyFocusMinutes) > 600 ||
        !Number.isFinite(goals.studyDaysPerWeek) || Number(goals.studyDaysPerWeek) < 1 || Number(goals.studyDaysPerWeek) > 7) {
        throw new Error('Invalid study goals in backup.');
      }
    } else if (key === 'pomodoro_timer_state') {
      if (!isSavedTimerState(JSON.parse(rawValue))) throw new Error('Invalid timer state in backup.');
    } else if (key === 'pomodoro_favorite_prayers') {
      const favorites: unknown = JSON.parse(rawValue);
      if (!Array.isArray(favorites) || !favorites.every((id) => typeof id === 'string' && /^(study|exam|ease|forgiveness|after)-\d+$/.test(id))) {
        throw new Error('Invalid favorite prayers in backup.');
      }
    } else if (key === 'pomodoro_quran_preferences') {
      const preferences: unknown = JSON.parse(rawValue);
      const isOptionalId = (id: unknown) => id === null || (Number.isInteger(id) && Number(id) > 0);
      const isIdList = (ids: unknown, maximum: number) =>
        Array.isArray(ids) && ids.every((id) => Number.isInteger(id) && Number(id) > 0 && Number(id) <= maximum);
      if (!isRecord(preferences) ||
        !isOptionalId(preferences.reciterId) ||
        !isOptionalId(preferences.moshafId) ||
        !isOptionalId(preferences.surahId) ||
        !Number.isFinite(preferences.volume) || Number(preferences.volume) < 0 || Number(preferences.volume) > 1 ||
        !isIdList(preferences.favoriteReciterIds, Number.MAX_SAFE_INTEGER) ||
        !isIdList(preferences.favoriteSurahIds, 114) ||
        !Number.isFinite(preferences.currentTime) || Number(preferences.currentTime) < 0 ||
        typeof preferences.wasPlaying !== 'boolean' ||
        typeof preferences.hasPlayed !== 'boolean' ||
        (preferences.miniPlayerHidden !== undefined && typeof preferences.miniPlayerHidden !== 'boolean')) {
        throw new Error('Invalid Quran preferences in backup.');
      }
    } else if (/^pomodoro_stats_\d{4}-\d{2}-\d{2}$/.test(key)) {
      const stats: unknown = JSON.parse(rawValue);
      const date = key.slice('pomodoro_stats_'.length);
      if (!isRecord(stats) ||
        stats.date !== date ||
        !Number.isInteger(stats.focusSessions) || Number(stats.focusSessions) < 0 ||
        !Number.isFinite(stats.totalFocusMinutes) || Number(stats.totalFocusMinutes) < 0) {
        throw new Error(`Invalid daily statistics in backup: ${date}`);
      }
    } else if (key.startsWith('pomodoro_') && rawValue.length > 10 * 1024 * 1024) {
      throw new Error(`Backup field is too large: ${key}`);
    }

    data[key] = rawValue;
  });

  return {
    format: 'focus-to-work-backup',
    version: 1,
    exportedAt: value.exportedAt,
    data,
  };
}

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m`;
  if (hours) return `${hours}h`;
  return `${remainingMinutes}m`;
}

interface GoalStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

function GoalStepper({ label, value, min, max, step, onChange }: GoalStepperProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(next));
    onChange(next);
  };

  const adjust = (amount: number) => {
    const next = Math.min(max, Math.max(min, value + amount));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <label className="goal-stepper block text-sm font-medium">
      {label}
      <div className="goal-stepper-control mt-1 flex items-center rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => adjust(-step)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="goal-stepper-button w-11 h-10 text-xl font-semibold"
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && commit()}
          className="goal-stepper-input h-10 min-w-0 flex-1 text-center font-semibold"
        />
        <button
          type="button"
          onClick={() => adjust(step)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="goal-stepper-button w-11 h-10 text-xl font-semibold"
        >
          +
        </button>
      </div>
    </label>
  );
}

function buildReports(events: ActivityEvent[], period: ReportPeriod, dailyFocusGoal: number, now = new Date()): DailyReport[] {
  const firstDay = new Date(now.getFullYear(), now.getMonth(), period === 'week' ? now.getDate() - ((now.getDay() + 6) % 7) : 1);
  const dayCount = period === 'week' ? 7 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dates = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    return getDateKey(date);
  });

  return dates.map((date) => {
    const dayEvents = events.filter((event) => getDateKey(new Date(event.timestamp)) === date);
    const focusEvents = dayEvents.filter((event) => event.type === 'focus_completed');
    const plannedEvents = dayEvents.filter((event) => event.type === 'task_added' && event.taskId);
    const taskIds = new Set(plannedEvents.map((event) => event.taskId as string));
    const taskStatus = new Map<string, boolean>();
    dayEvents
      .filter((event) => event.taskId && (event.type === 'task_completed' || event.type === 'task_uncompleted'))
      .forEach((event) => taskStatus.set(event.taskId as string, event.type === 'task_completed'));

    const focusMinutes = focusEvents.reduce((total, event) => total + (event.minutes || 0), 0);
    const plannedTasks = taskIds.size;
    const completedTasks = [...taskIds].filter((id) => taskStatus.get(id)).length;
    const applicableWeight = 70 + (plannedTasks > 0 ? 30 : 0);
    const score = focusMinutes === 0 && plannedTasks === 0
      ? null
      : Math.round((
        Math.min(focusMinutes / dailyFocusGoal, 1) * 50 +
        (plannedTasks > 0 ? completedTasks / plannedTasks * 30 : 0) +
        (focusMinutes > 0 ? 20 : 0)
      ) / applicableWeight * 100);

    return {
      date,
      focusMinutes,
      focusSessions: focusEvents.length,
      plannedTasks,
      completedTasks,
      score,
    };
  });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Mode configuration
const modeConfig: Record<TimerMode, { label: string; color: string; bgColor: string; ringColor: string; btnColor: string }> = {
  focus: {
    label: 'Focus',
    color: 'text-red-500',
    bgColor: 'bg-red-50',
    ringColor: 'stroke-red-500',
    btnColor: 'bg-red-500 hover:bg-red-600',
  },
  shortBreak: {
    label: 'Short Break',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-50',
    ringColor: 'stroke-emerald-500',
    btnColor: 'bg-emerald-500 hover:bg-emerald-600',
  },
  longBreak: {
    label: 'Long Break',
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    ringColor: 'stroke-blue-500',
    btnColor: 'bg-blue-500 hover:bg-blue-600',
  },
};

export default function App() {
  const [savedTimer] = useState<SavedTimerState | null>(loadSavedTimerState);
  const [settings, setSettings] = useState<TimerSettings>(loadSettings);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [language, setLanguage] = useState<Language>(loadLanguage);
  const [view, setView] = useState<View>(savedTimer?.view || 'timer');
  const [mode, setMode] = useState<TimerMode>(savedTimer?.mode || 'focus');
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!savedTimer) return settings.focus * 60;
    if (savedTimer.isRunning && savedTimer.deadline) {
      return Math.max(0, Math.ceil((savedTimer.deadline - Date.now()) / 1000));
    }
    return savedTimer.timeLeft;
  });
  const [isRunning, setIsRunning] = useState(() => Boolean(savedTimer?.isRunning));
  const [sessionsCompleted, setSessionsCompleted] = useState(loadSessionsCompleted);
  const [stats, setStats] = useState<DailyStats>(loadStats);
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<TimerSettings>(settings);
  const [todos, setTodos] = useState<TodoTask[]>(loadTodos);
  const [newTodo, setNewTodo] = useState('');
  const [plannedSession, setPlannedSession] = useState<PlannedSession | null>(savedTimer?.plannedSession || null);
  const [plannerHours, setPlannerHours] = useState(2);
  const [plannerBreakCount, setPlannerBreakCount] = useState(2);
  const [plannerBreakDuration, setPlannerBreakDuration] = useState(5);
  const [plannerDurationMode, setPlannerDurationMode] = useState<PlannerDurationMode>('focus-only');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('week');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [prayerFilter, setPrayerFilter] = useState<PrayerCategoryId | 'all'>('all');
  const [showFavoritePrayers, setShowFavoritePrayers] = useState(false);
  const [favoritePrayerIds, setFavoritePrayerIds] = useState<string[]>(loadFavoritePrayerIds);
  const [backupStatus, setBackupStatus] = useState('');
  const [backupReloadPending, setBackupReloadPending] = useState(false);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>(loadActivityEvents);
  const [goals, setGoals] = useState<ProductivityGoals>(loadProductivityGoals);
  const [tempGoals, setTempGoals] = useState<ProductivityGoals>(goals);
  const [plannerTasks, setPlannerTasks] = useState<TodoTask[]>([]);
  const [plannerNewTask, setPlannerNewTask] = useState('');
  const intervalRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(savedTimer?.deadline || null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const t = translations[language];
  const logActivity = (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    recordActivity(event);
    setActivityEvents(loadActivityEvents());
  };
  const reports = buildReports(activityEvents, reportPeriod, goals.dailyFocusMinutes);
  const reportDateKeys = new Set(reports.map((day) => day.date));
  const periodEvents = activityEvents
    .filter((event) => reportDateKeys.has(getDateKey(new Date(event.timestamp))))
    .sort((a, b) => a.timestamp - b.timestamp);
  const plannedTaskIds = new Set(
    periodEvents.filter((event) => event.type === 'task_added' && event.taskId).map((event) => event.taskId as string),
  );
  const periodTaskStatus = new Map<string, boolean>();
  periodEvents
    .filter((event) => event.taskId && (event.type === 'task_completed' || event.type === 'task_uncompleted'))
    .forEach((event) => periodTaskStatus.set(event.taskId as string, event.type === 'task_completed'));
  const reportTotals = reports.reduce((total, day) => ({
    focusMinutes: total.focusMinutes + day.focusMinutes,
    focusSessions: total.focusSessions + day.focusSessions,
    plannedTasks: 0,
    completedTasks: 0,
  }), { focusMinutes: 0, focusSessions: 0, plannedTasks: 0, completedTasks: 0 });
  reportTotals.plannedTasks = plannedTaskIds.size;
  reportTotals.completedTasks = [...plannedTaskIds].filter((id) => periodTaskStatus.get(id)).length;
  const targetStudyDays = reportPeriod === 'week'
    ? goals.studyDaysPerWeek
    : Math.round(reports.length * goals.studyDaysPerWeek / 7);
  const activeDays = reports.filter((day) => day.focusMinutes > 0).length;
  const applicableScoreWeight = 70 + (reportTotals.plannedTasks > 0 ? 30 : 0);
  const hasReportData = reportTotals.focusMinutes > 0 || reportTotals.plannedTasks > 0;
  const reportScore = hasReportData
    ? Math.round((
      Math.min(reportTotals.focusMinutes / (goals.dailyFocusMinutes * targetStudyDays), 1) * 50 +
      (reportTotals.plannedTasks > 0 ? reportTotals.completedTasks / reportTotals.plannedTasks * 30 : 0) +
      Math.min(activeDays / targetStudyDays, 1) * 20
    ) / applicableScoreWeight * 100)
    : 0;
  const bestDay = reports.reduce<DailyReport | null>(
    (best, day) => day.focusMinutes > (best?.focusMinutes || 0) ? day : best,
    null,
  );
  const focusDayKeys = getFocusDayKeys(activityEvents);
  const streaks = getStreakSummary(focusDayKeys);
  const focusMinutesByDay = new Map<string, number>();
  activityEvents
    .filter((event) => event.type === 'focus_completed')
    .forEach((event) => {
      const key = getDateKey(new Date(event.timestamp));
      focusMinutesByDay.set(key, (focusMinutesByDay.get(key) || 0) + (event.minutes || 0));
    });
  const totalRecordedSessions = activityEvents.filter((event) => event.type === 'focus_completed').length;
  const historicallyCompletedTasks = new Set(
    activityEvents.filter((event) => event.type === 'task_completed' && event.taskId).map((event) => event.taskId as string),
  ).size;
  const calendarDaysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarStartOffset = (new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() + 6) % 7;
  const calendarCellCount = calendarStartOffset + calendarDaysInMonth;
  const calendarCells: (number | null)[] = [
    ...Array.from({ length: calendarStartOffset }, () => null),
    ...Array.from({ length: calendarDaysInMonth }, (_, index) => index + 1),
    ...Array.from({ length: (7 - calendarCellCount % 7) % 7 }, () => null),
  ];
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isCalendarAtCurrentMonth = calendarMonth.getTime() >= currentMonthStart.getTime();
  const visiblePrayerCategories = prayerCategories
    .map((category) => ({
      ...category,
      prayers: category.prayers
        .map((prayer, index) => ({ ...prayer, id: `${category.id}-${index}` }))
        .filter((prayer) => !showFavoritePrayers || favoritePrayerIds.includes(prayer.id)),
    }))
    .filter((category) => category.prayers.length > 0);
  const achievements = [
    { id: 'first-focus', icon: '🌱', title: t.firstFocusBadge, description: t.firstFocusBadgeHint, progress: Math.min(totalRecordedSessions, 1), target: 1 },
    { id: 'ten-sessions', icon: '🍅', title: t.tenSessionsBadge, description: t.tenSessionsBadgeHint, progress: Math.min(totalRecordedSessions, 10), target: 10 },
    { id: 'three-day-streak', icon: '🔥', title: t.threeDayStreakBadge, description: t.threeDayStreakBadgeHint, progress: Math.min(streaks.longest, 3), target: 3 },
    { id: 'seven-days', icon: '📅', title: t.sevenStudyDaysBadge, description: t.sevenStudyDaysBadgeHint, progress: Math.min(focusDayKeys.size, 7), target: 7 },
    { id: 'ten-tasks', icon: '✅', title: t.tenTasksBadge, description: t.tenTasksBadgeHint, progress: Math.min(historicallyCompletedTasks, 10), target: 10 },
  ];

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', language);
    localStorage.setItem('pomodoro_theme', theme);
    localStorage.setItem('pomodoro_lang', language);

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', theme === 'dark' ? '#111827' : '#ffffff');
  }, [theme, language]);

  useEffect(() => {
    if (window.self === window.top) return;

    const receiveTheme = (event: MessageEvent) => {
      if (event.data?.theme === 'light' || event.data?.theme === 'dark') {
        setTheme(event.data.theme);
      }
    };
    window.addEventListener('message', receiveTheme);
    return () => window.removeEventListener('message', receiveTheme);
  }, []);

  const plannerTotalMinutes = Math.round(plannerHours * 60);
  const maximumPlannerBreakDuration = getMaximumPlannerBreakDuration(
    plannerTotalMinutes,
    plannerDurationMode,
  );
  const selectedPlannerBreakDuration = Math.min(plannerBreakDuration, maximumPlannerBreakDuration);
  const maximumPlannerBreaks = getMaximumPlannerBreaks(
    plannerTotalMinutes,
    plannerDurationMode,
    selectedPlannerBreakDuration,
  );
  const selectedPlannerBreakCount = selectedPlannerBreakDuration === 0
    ? 0
    : Math.min(plannerBreakCount, maximumPlannerBreaks);
  const plannerFocusMinutes = plannerDurationMode === 'focus-only'
    ? plannerTotalMinutes
    : plannerTotalMinutes - selectedPlannerBreakCount * selectedPlannerBreakDuration;
  const plannerElapsedMinutes = plannerFocusMinutes + selectedPlannerBreakCount * selectedPlannerBreakDuration;
  const plannerFocusBlocks = distributeFocusMinutes(plannerFocusMinutes, selectedPlannerBreakCount + 1);
  const updatePlannerBreakDuration = (duration: number) => {
    const nextDuration = Math.max(0, Math.min(maximumPlannerBreakDuration, Math.floor(duration)));
    setPlannerBreakDuration(nextDuration);
    setPlannerBreakCount((count) => nextDuration === 0
      ? 0
      : Math.min(count, getMaximumPlannerBreaks(plannerTotalMinutes, plannerDurationMode, nextDuration)));
  };
  const totalTime = plannedSession?.isActive
    ? (plannedSession.currentPhase === 'break'
      ? plannedSession.breakDuration
      : getFocusBlockMinutes(plannedSession)) * 60
    : settings[mode === 'shortBreak' ? 'shortBreak' : mode === 'longBreak' ? 'longBreak' : 'focus'] * 60;
  const progress = totalTime > 0 ? (totalTime - timeLeft) / totalTime : 0;

  // Save settings when they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('pomodoro_todos', JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    localStorage.setItem('pomodoro_productivity_goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('pomodoro_favorite_prayers', JSON.stringify(favoritePrayerIds));
  }, [favoritePrayerIds]);

  useEffect(() => {
    const state: SavedTimerState = {
      mode,
      timeLeft,
      isRunning,
      deadline: isRunning ? deadlineRef.current : null,
      view,
      plannedSession,
    };
    localStorage.setItem('pomodoro_timer_state', JSON.stringify(state));
  }, [mode, timeLeft, isRunning, view, plannedSession]);

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (plannedSession?.isActive) {
      playNotification();
      if (plannedSession.currentPhase === 'focus') {
        const completedFocusBlocks = getCompletedFocusBlocks(plannedSession);
        const completedFocusBreaks = getCompletedBreaks(plannedSession);
        const focusBlockCount = plannedSession.focusBlockMinutes?.length ?? plannedSession.breakCount + 1;
        recordFocusCompletion(getFocusBlockMinutes(plannedSession, completedFocusBlocks));
        setStats(loadStats());
        setSessionsCompleted((completed) => {
          const updated = completed + 1;
          localStorage.setItem('pomodoro_sessions_completed', String(updated));
          return updated;
        });
        setActivityEvents(loadActivityEvents());
        const nextCompletedFocusBlocks = completedFocusBlocks + 1;
        if (nextCompletedFocusBlocks >= focusBlockCount) {
          setPlannedSession({
            ...plannedSession,
            isActive: false,
            phaseTimeLeft: 0,
            completedFocusBlocks: nextCompletedFocusBlocks,
          });
          deadlineRef.current = null;
          return;
        }
        if (completedFocusBreaks < plannedSession.breakCount) {
          const nextSession = {
            ...plannedSession,
            currentPhase: 'break' as const,
            phaseTimeLeft: plannedSession.breakDuration * 60,
            breaksDone: completedFocusBreaks,
            completedFocusBlocks: nextCompletedFocusBlocks,
          };
          setPlannedSession(nextSession);
          setTimeLeft(nextSession.phaseTimeLeft);
          deadlineRef.current = Date.now() + nextSession.phaseTimeLeft * 1000;
          setIsRunning(true);
        } else {
          const nextSession = {
            ...plannedSession,
            currentPhase: 'focus' as const,
            phaseTimeLeft: getFocusBlockMinutes(plannedSession, nextCompletedFocusBlocks) * 60,
            completedFocusBlocks: nextCompletedFocusBlocks,
          };
          setPlannedSession(nextSession);
          setTimeLeft(nextSession.phaseTimeLeft);
          deadlineRef.current = Date.now() + nextSession.phaseTimeLeft * 1000;
          setIsRunning(true);
        }
      } else {
        const completedFocusBlocks = getCompletedFocusBlocks(plannedSession);
        const nextFocusBlockIndex = plannedSession.completedFocusBlocks === undefined
          ? completedFocusBlocks + 1
          : completedFocusBlocks;
        const completedBreaks = getCompletedBreaks(plannedSession) + 1;
        const nextSession = {
          ...plannedSession,
          breaksDone: completedBreaks,
          currentPhase: 'focus' as const,
          phaseTimeLeft: getFocusBlockMinutes(plannedSession, nextFocusBlockIndex) * 60,
          completedFocusBlocks: nextFocusBlockIndex,
        };
        setPlannedSession(nextSession);
        setTimeLeft(nextSession.phaseTimeLeft);
        deadlineRef.current = Date.now() + nextSession.phaseTimeLeft * 1000;
        setIsRunning(true);
      }
      return;
    }

    if (mode === 'focus') {
      recordFocusCompletion(settings.focus);
      setStats(loadStats());
      setActivityEvents(loadActivityEvents());
      const newSessions = sessionsCompleted + 1;
      setSessionsCompleted(newSessions);
      localStorage.setItem('pomodoro_sessions_completed', String(newSessions));

      // Play notification sound
      playNotification();

      // Switch to break
      if (newSessions % settings.longBreakInterval === 0) {
        setMode('longBreak');
        setTimeLeft(settings.longBreak * 60);
      } else {
        setMode('shortBreak');
        setTimeLeft(settings.shortBreak * 60);
      }
    } else {
      // Break is over, switch back to focus
      playNotification();
      setMode('focus');
      setTimeLeft(settings.focus * 60);
    }
    deadlineRef.current = null;
  }, [mode, sessionsCompleted, settings, plannedSession]);

  const playNotification = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') void audioCtx.resume();

      [523, 659, 784, 1046].forEach((frequency, index) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const start = audioCtx.currentTime + index * 0.28;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gainNode.gain.setValueAtTime(0.0001, start);
        gainNode.gain.exponentialRampToValueAtTime(0.2, start + 0.03);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.36);
      });
    } catch {
      // The timer remains usable when Web Audio is unavailable.
    }
  };

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        if (deadlineRef.current === null) return;
        const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (plannedSession?.isActive) {
          setPlannedSession((session) => session ? { ...session, phaseTimeLeft: remaining } : session);
        }
        if (remaining === 0) handleTimerComplete();
      }, 250);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, handleTimerComplete]);

  const handleStart = () => {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextClass();
    if (audioContextRef.current.state === 'suspended') void audioContextRef.current.resume();
    deadlineRef.current = Date.now() + timeLeft * 1000;
    setIsRunning(true);
  };

  const handlePause = () => {
    if (deadlineRef.current !== null) {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      deadlineRef.current = null;
      setTimeLeft(remaining);
    }
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    deadlineRef.current = null;
    if (plannedSession?.isActive) {
      setPlannedSession({
        ...plannedSession,
        currentTaskIndex: 0,
        currentPhase: 'focus',
        phaseTimeLeft: getFocusBlockMinutes(plannedSession, 0) * 60,
        breaksDone: 0,
        completedFocusBlocks: 0,
        pendingTaskIndex: 0,
      });
      setTimeLeft(getFocusBlockMinutes(plannedSession, 0) * 60);
      return;
    }
    const duration = settings[mode === 'shortBreak' ? 'shortBreak' : mode === 'longBreak' ? 'longBreak' : 'focus'];
    setTimeLeft(duration * 60);
  };

  const handleModeChange = (newMode: TimerMode) => {
    setIsRunning(false);
    deadlineRef.current = null;
    setMode(newMode);
    const duration = settings[newMode === 'shortBreak' ? 'shortBreak' : newMode === 'longBreak' ? 'longBreak' : 'focus'];
    setTimeLeft(duration * 60);
  };

  const handleSaveSettings = () => {
    setSettings(tempSettings);
    setGoals(tempGoals);
    setShowSettings(false);
    // Reset timer if not running
    if (!isRunning) {
      const duration = tempSettings[mode === 'shortBreak' ? 'shortBreak' : mode === 'longBreak' ? 'longBreak' : 'focus'];
      setTimeLeft(duration * 60);
    }
  };

  const handleOpenSettings = () => {
    setTempSettings(settings);
    setTempGoals(goals);
    setShowSettings(true);
  };

  const handleExportBackup = () => {
    try {
      const payload: BackupPayload = {
        format: 'focus-to-work-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: getAppStorageData(),
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `focus-to-work-backup-${getTodayKey()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupStatus(t.backupExportSuccess);
      setBackupReloadPending(false);
    } catch (error) {
      console.error('Unable to export app data.', error);
      setBackupStatus(t.backupExportError);
    }
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBackupStatus('');
    setBackupReloadPending(false);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error(t.backupFileTooLarge);
      const payload = validateBackup(JSON.parse(await file.text()));
      if (!window.confirm(t.backupConfirm)) return;

      const previousData = getAppStorageData();
      try {
        Object.keys(previousData).forEach((key) => localStorage.removeItem(key));
        Object.entries(payload.data).forEach(([key, value]) => localStorage.setItem(key, value));
      } catch (error) {
        try {
          Object.keys(getAppStorageData()).forEach((key) => localStorage.removeItem(key));
          Object.entries(previousData).forEach(([key, value]) => localStorage.setItem(key, value));
        } catch (rollbackError) {
          console.error('Unable to restore app data after a failed backup import.', rollbackError);
          throw new Error(t.backupRollbackError);
        }
        throw new Error(t.backupImportError);
      }

      setBackupStatus(t.backupImportSuccess);
      setBackupReloadPending(true);
    } catch (error) {
      console.error('Unable to import app data.', error);
      const message = error instanceof Error ? error.message : '';
      const knownMessages: string[] = [t.backupFileTooLarge, t.backupRollbackError, t.backupImportError];
      setBackupStatus(
        knownMessages.includes(message)
          ? message
          : t.backupInvalid,
      );
    } finally {
      event.target.value = '';
    }
  };

  const toggleFavoritePrayer = (id: string) => {
    setFavoritePrayerIds((current) =>
      current.includes(id) ? current.filter((favorite) => favorite !== id) : [...current, id],
    );
  };

  const addTodo = () => {
    if (!newTodo.trim()) return;
    const task = { id: `${Date.now()}-${Math.random()}`, text: newTodo.trim(), completed: false };
    setTodos((tasks) => [...tasks, task]);
    logActivity({ type: 'task_added', taskId: task.id });
    setNewTodo('');
  };

  const toggleTodo = (id: string) => {
    const task = todos.find((item) => item.id === id);
    if (task) {
      if (!activityEvents.some((event) => event.type === 'task_added' && event.taskId === id)) {
        logActivity({ type: 'task_added', taskId: id });
      }
      logActivity({ type: task.completed ? 'task_uncompleted' : 'task_completed', taskId: id });
    }
    setTodos((tasks) => tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task));
  };

  const deleteTodo = (id: string) => {
    setTodos((tasks) => tasks.filter((task) => task.id !== id));
  };

  const addPlannerTask = () => {
    if (!plannerNewTask.trim()) return;
    setPlannerTasks((tasks) => [...tasks, { id: `${Date.now()}`, text: plannerNewTask.trim(), completed: false }]);
    setPlannerNewTask('');
  };

  const removePlannerTask = (id: string) => {
    setPlannerTasks((tasks) => tasks.filter((task) => task.id !== id));
  };

  const movePlannerTask = (id: string, offset: -1 | 1) => {
    setPlannerTasks((tasks) => {
      const currentIndex = tasks.findIndex((task) => task.id === id);
      const nextIndex = currentIndex + offset;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= tasks.length) return tasks;
      const reordered = [...tasks];
      [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex], reordered[currentIndex]];
      return reordered;
    });
  };

  const togglePlannedTask = (id: string) => {
    const task = plannedSession?.tasks.find((item) => item.id === id);
    if (task) logActivity({ type: task.completed ? 'task_uncompleted' : 'task_completed', taskId: id });
    setPlannedSession((session) => {
      if (!session) return session;
      const tasks = session.tasks.map((item) => item.id === id ? { ...item, completed: !item.completed } : item);
      let currentTaskIndex = session.currentTaskIndex;
      if (session.currentTaskIndex === session.tasks.findIndex((item) => item.id === id) &&
        tasks[currentTaskIndex]?.completed) {
        const nextIncompleteIndex = tasks.findIndex((item, index) => index > currentTaskIndex && !item.completed);
        const firstIncompleteIndex = tasks.findIndex((item) => !item.completed);
        currentTaskIndex = nextIncompleteIndex >= 0
          ? nextIncompleteIndex
          : firstIncompleteIndex >= 0 ? firstIncompleteIndex : currentTaskIndex;
      }
      return {
        ...session,
        tasks,
        currentTaskIndex,
      };
    });
  };

  const startPlannedSession = () => {
    if (plannerTasks.length === 0) return;
    const effectiveBreakCount = selectedPlannerBreakCount;
    const breakDuration = selectedPlannerBreakDuration;
    const focusBlockMinutes = plannerFocusBlocks;
    const timePerTask = Math.max(1, Math.floor(plannerFocusMinutes / plannerTasks.length));
    const sessionId = `${Date.now()}-${Math.random()}`;
    const sessionTasks = plannerTasks.map((task) => ({
      ...task,
      id: `${sessionId}-${task.id}`,
      completed: false,
    }));
    sessionTasks.forEach((task) => logActivity({ type: 'task_added', taskId: task.id }));
    const nextSession: PlannedSession = {
      tasks: sessionTasks,
      timePerTask,
      focusBlockMinutes,
      completedFocusBlocks: 0,
      breakDuration,
      currentTaskIndex: 0,
      currentPhase: 'focus',
      isActive: true,
      phaseTimeLeft: focusBlockMinutes[0] * 60,
      breaksDone: 0,
      breakCount: effectiveBreakCount,
      pendingTaskIndex: 0,
    };
    setPlannedSession(nextSession);
    setTimeLeft(focusBlockMinutes[0] * 60);
    setView('timer');
    deadlineRef.current = Date.now() + focusBlockMinutes[0] * 60 * 1000;
    setIsRunning(true);
  };

  // SVG circle parameters
  const radius = 140;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const currentConfig = modeConfig[mode];

  return (
    <div className={`min-h-screen app-shell flex flex-col items-center justify-center p-4 font-sans ${theme}`}>
      <div className="w-full max-w-md flex justify-between items-center mb-4">
        <button
          type="button"
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className="theme-toggle px-3 py-2 rounded-lg border flex items-center gap-2 text-sm font-medium"
        >
          <span>{language === 'en' ? '🇪🇬' : '🇺🇸'}</span>
          <span>{language === 'en' ? 'عربي' : 'English'}</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenSettings}
            className="theme-toggle px-3 h-10 rounded-lg border flex items-center gap-2 text-sm font-medium"
          >
            <span>🎯</span>
            <span>{t.goals}</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="theme-toggle w-10 h-10 rounded-full border flex items-center justify-center"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="text-center mb-6 w-full max-w-md">
        <h1 className="text-3xl font-bold app-heading flex items-center justify-center gap-2">
          <span className="text-2xl">🍅</span> <span>{t.title}</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-6 bg-white rounded-xl p-1.5 shadow-sm border border-gray-100">
        <button
          onClick={() => setView('timer')}
          className={`px-5 py-2 rounded-lg text-sm font-medium ${view === 'timer' ? 'bg-gray-800 text-white' : 'text-gray-600'}`}
        >
          {t.timer}
        </button>
        <button
          onClick={() => setView('planner')}
          className={`px-5 py-2 rounded-lg text-sm font-medium ${view === 'planner' ? 'bg-gray-800 text-white' : 'text-gray-600'}`}
        >
          {t.planner}
        </button>
        <button
          onClick={() => setView('reports')}
          className={`px-5 py-2 rounded-lg text-sm font-medium ${view === 'reports' ? 'bg-gray-800 text-white' : 'text-gray-600'}`}
        >
          {t.reports}
        </button>
        <button
          onClick={() => setView('prayers')}
          className={`px-5 py-2 rounded-lg text-sm font-medium ${view === 'prayers' ? 'bg-gray-800 text-white' : 'text-gray-600'}`}
        >
          {t.prayers}
        </button>
        <button
          onClick={() => setView('quran')}
          className={`px-5 py-2 rounded-lg text-sm font-medium ${view === 'quran' ? 'bg-gray-800 text-white' : 'text-gray-600'}`}
        >
          {t.quran}
        </button>
      </div>

      {view === 'timer' && (
        <>
      {/* Mode Selector */}
      {!plannedSession?.isActive && (
      <div className="flex gap-2 mb-8 bg-white rounded-xl p-1.5 shadow-sm border border-gray-100">
        {(Object.keys(modeConfig) as TimerMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              mode === m
                ? `${modeConfig[m].btnColor} text-white shadow-sm`
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {m === 'focus' ? t.focus : m === 'shortBreak' ? t.shortBreak : t.longBreak}
          </button>
        ))}
      </div>
      )}

      {/* Timer Display */}
      <div className={`relative mb-8 timer-ring ${isRunning ? 'is-running' : ''}`}>
        <svg width="320" height="320" className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="160"
            cy="160"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Progress circle */}
          <circle
            cx="160"
            cy="160"
            r={radius}
            fill="none"
            className={`${currentConfig.ringColor} transition-all duration-1000`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        {/* Time display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-6xl font-mono font-bold ${currentConfig.color} tracking-wider`}>
            {formatTime(timeLeft)}
          </span>
          <span className="text-gray-400 text-sm mt-2 uppercase tracking-wide">
            {plannedSession?.isActive
              ? plannedSession.currentPhase === 'focus'
                ? plannedSession.tasks.every((task) => task.completed)
                  ? t.allTasksComplete
                  : `${t.workingOn}: ${plannedSession.tasks[plannedSession.currentTaskIndex]?.text || ''}`
                : t.breakTime
              : mode === 'focus' ? t.focus : mode === 'shortBreak' ? t.shortBreak : t.longBreak}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={isRunning ? handlePause : handleStart}
          className={`${currentConfig.btnColor} text-white px-8 py-3 rounded-xl font-semibold text-lg shadow-lg shadow-${mode === 'focus' ? 'red' : mode === 'shortBreak' ? 'emerald' : 'blue'}-200 transition-all duration-200 transform hover:scale-105 active:scale-95`}
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              {t.pause}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              {t.start}
            </span>
          )}
        </button>
        <button
          onClick={handleReset}
          className="bg-white border border-gray-200 text-gray-600 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-all duration-200 transform hover:scale-105 active:scale-95"
        >
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t.reset}
          </span>
        </button>
      </div>

      <section className="quran-shortcut w-full max-w-md rounded-xl border p-4 shadow-sm mb-6">
        <div className="flex items-center gap-3">
          <span className="quran-shortcut-icon" aria-hidden="true">۞</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">{t.quranShortcutTitle}</h2>
            <p className="text-xs mt-1">{t.quranShortcutHint}</p>
          </div>
          <button
            type="button"
            className="quran-shortcut-button"
            onClick={() => setView('quran')}
          >
            {t.quranShortcutAction}
          </button>
        </div>
      </section>

      {plannedSession?.isActive && (
        <div className="w-full max-w-md bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.tasksToComplete}</h3>
          <div className="space-y-2">
            {plannedSession.tasks.map((task, index) => (
              <button
                key={task.id}
                type="button"
                onClick={() => togglePlannedTask(task.id)}
                aria-pressed={task.completed}
                className={`w-full flex items-center gap-3 p-2 rounded-lg text-left ${
                  index === plannedSession.currentTaskIndex ? 'bg-red-50 border border-red-100' : ''
                }`}
              >
                <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 ${task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`} />
                <span className={`flex-1 text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.text}</span>
                {index === plannedSession.currentTaskIndex && <span className="text-xs text-red-500">{t.workingOn}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats & Settings */}
      <div className="w-full max-w-md grid grid-cols-2 gap-4">
        {/* Today's Stats */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.todaysStats}</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">{t.sessions}</span>
              <span className="font-bold text-gray-800">{stats.focusSessions}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">{t.focusTime}</span>
              <span className="font-bold text-gray-800">{stats.totalFocusMinutes}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">{t.completed}</span>
              <span className="font-bold text-gray-800">{sessionsCompleted}</span>
            </div>
          </div>
        </div>

        {/* Quick Info / Settings Button */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.timerInfo}</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">{t.focus}</span>
              <span className="font-bold text-gray-800">{settings.focus}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">{t.shortBreak}</span>
              <span className="font-bold text-gray-800">{settings.shortBreak}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">{t.longBreak}</span>
              <span className="font-bold text-gray-800">{settings.longBreak}m</span>
            </div>
          </div>
          <button
            onClick={handleOpenSettings}
            className="mt-3 w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors py-1 border-t border-gray-100"
          >
            ⚙️ {t.customize}
          </button>
        </div>
      </div>

      {/* Session dots */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">{t.progress}:</span>
        {Array.from({ length: settings.longBreakInterval }).map((_, i) => (
          <div
            key={i}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              i < (sessionsCompleted % settings.longBreakInterval)
                ? `${mode === 'focus' ? 'bg-red-400' : mode === 'shortBreak' ? 'bg-emerald-400' : 'bg-blue-400'}`
                : 'bg-gray-200'
            }`}
          />
        ))}
        <span className="text-xs text-gray-400 ml-1">→ long break</span>
      </div>

      <div className="w-full max-w-md bg-white rounded-xl p-4 shadow-sm border border-gray-100 mt-6">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.todoList}</h3>
        <div className="flex gap-2 mb-3">
          <input
            value={newTodo}
            onChange={(event) => setNewTodo(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && addTodo()}
            placeholder={t.addTask}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <button onClick={addTodo} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm">{t.add}</button>
        </div>
        {todos.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-3">{t.noTasks}</p>
        ) : (
          <div className="space-y-2">
            {todos.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg">
                <button
                  onClick={() => toggleTodo(task.id)}
                  className={`w-5 h-5 rounded-full border-2 ${task.completed ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`}
                  aria-label={t.completed}
                />
                <span className={`flex-1 text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.text}</span>
                <button onClick={() => deleteTodo(task.id)} className="text-gray-400 hover:text-red-500" aria-label="Delete">×</button>
              </div>
            ))}
          </div>
        )}
        {todos.length > 0 && (
          <button onClick={() => setTodos((tasks) => tasks.filter((task) => !task.completed))} className="mt-3 text-xs text-red-500">
            {t.clearCompleted}
          </button>
        )}
      </div>
        </>
      )}

      {view === 'planner' && (
        <div className="w-full max-w-md bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-bold text-gray-800 mb-2">{t.planSession}</h2>
          <p className="text-sm text-gray-500 mb-4">{t.planDesc}</p>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t.totalDuration}</label>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="range"
              min="0.5"
              max="8"
              step="0.5"
              value={plannerHours}
              onChange={(event) => {
                const nextHours = Number(event.target.value);
                setPlannerHours(nextHours);
                setPlannerBreakCount((count) => Math.min(
                  count,
                  getMaximumPlannerBreaks(
                    Math.round(nextHours * 60),
                    plannerDurationMode,
                    selectedPlannerBreakDuration,
                  ),
                ));
              }}
              className="flex-1 accent-red-500"
            />
            <span className="font-bold text-gray-800 min-w-[82px] text-right">{formatDuration(plannerHours * 60)}</span>
          </div>
          <fieldset className="mb-4">
            <legend className="block text-sm font-medium text-gray-700 mb-2">{t.durationRule}</legend>
            <div className="space-y-2 rounded-lg bg-gray-50 p-3">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="planner-duration-mode"
                  value="focus-only"
                  checked={plannerDurationMode === 'focus-only'}
                  onChange={() => setPlannerDurationMode('focus-only')}
                  className="mt-1 accent-red-500"
                />
                <span>{t.focusOnlyOption}</span>
              </label>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="planner-duration-mode"
                  value="elapsed-total"
                  checked={plannerDurationMode === 'elapsed-total'}
                  onChange={() => {
                    setPlannerDurationMode('elapsed-total');
                    setPlannerBreakCount((count) => Math.min(
                      count,
                      getMaximumPlannerBreaks(
                        plannerTotalMinutes,
                        'elapsed-total',
                        selectedPlannerBreakDuration,
                      ),
                    ));
                  }}
                  className="mt-1 accent-red-500"
                />
                <span>{t.elapsedTotalOption}</span>
              </label>
            </div>
          </fieldset>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t.breakCount}</label>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="range"
              min="0"
              max={maximumPlannerBreaks}
              step="1"
              value={selectedPlannerBreakCount}
              onChange={(event) => {
                const nextCount = Math.max(0, Math.min(maximumPlannerBreaks, Number(event.target.value)));
                setPlannerBreakCount(nextCount);
                if (nextCount > 0 && plannerBreakDuration === 0) setPlannerBreakDuration(5);
              }}
              className="flex-1 accent-emerald-500"
            />
            <input
              type="number"
              min="0"
              max={maximumPlannerBreaks}
              value={selectedPlannerBreakCount}
              onChange={(event) => {
                const nextCount = Math.max(0, Math.min(maximumPlannerBreaks, Number(event.target.value) || 0));
                setPlannerBreakCount(nextCount);
                if (nextCount > 0 && plannerBreakDuration === 0) setPlannerBreakDuration(5);
              }}
              className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-center font-bold"
              aria-label={t.breakCount}
            />
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t.breakDuration}</label>
          <div className="flex items-center gap-3 mb-2">
            <input
              type="range"
              min="0"
              max={maximumPlannerBreakDuration}
              step="1"
              value={selectedPlannerBreakDuration}
              disabled={selectedPlannerBreakCount === 0}
              onChange={(event) => updatePlannerBreakDuration(Number(event.target.value))}
              className="flex-1 accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <input
              type="number"
              min="0"
              max={maximumPlannerBreakDuration}
              step="1"
              value={selectedPlannerBreakDuration}
              disabled={selectedPlannerBreakCount === 0}
              onChange={(event) => updatePlannerBreakDuration(Number(event.target.value) || 0)}
              className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-center font-bold disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t.breakDuration}
            />
            <span className="text-xs text-gray-500">{t.minutesShort}</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">{t.breakDurationHint}</p>
          <p className="text-xs text-gray-500 mb-3">{t.breakScheduleHint}</p>
          <div className="planner-time-estimate rounded-lg border border-emerald-100 bg-emerald-50 p-3 mb-4 text-sm">
            <p>{t.focusTime}: <strong>{formatDuration(plannerFocusMinutes)}</strong></p>
            {selectedPlannerBreakCount > 0 && (
              <p>{t.breakCount}: <strong>{selectedPlannerBreakCount} × {formatDuration(selectedPlannerBreakDuration)}</strong></p>
            )}
            <p className="mt-1">{t.estimatedTotal}: <strong>{formatDuration(plannerElapsedMinutes)}</strong></p>
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t.tasksToComplete}</label>
          <div className="flex gap-2 mb-3">
            <input
              value={plannerNewTask}
              onChange={(event) => setPlannerNewTask(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && addPlannerTask()}
              placeholder={t.taskPlaceholder}
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
            />
            <button onClick={addPlannerTask} className="px-4 bg-red-500 text-white rounded-lg">+</button>
          </div>
          {plannerTasks.length > 0 && (
            <div className="space-y-2 mb-4">
              {plannerTasks.map((task, index) => (
                <div key={task.id} className="planner-task-row flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">{index + 1}</span>
                  <span className="flex-1 text-sm text-gray-700">{task.text}</span>
                  <button
                    type="button"
                    onClick={() => movePlannerTask(task.id, -1)}
                    disabled={index === 0}
                    className="planner-task-order-button"
                    aria-label={`${t.moveTaskUp}: ${task.text}`}
                    title={t.moveTaskUp}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => movePlannerTask(task.id, 1)}
                    disabled={index === plannerTasks.length - 1}
                    className="planner-task-order-button"
                    aria-label={`${t.moveTaskDown}: ${task.text}`}
                    title={t.moveTaskDown}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removePlannerTask(task.id)}
                    className="planner-task-remove-button"
                    aria-label={`${t.removePlannerTask}: ${task.text}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {plannedSession?.isActive && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700">
              {plannedSession.currentPhase === 'focus'
                ? plannedSession.tasks.every((task) => task.completed)
                  ? t.allTasksComplete
                  : `${t.workingOn}: ${plannedSession.tasks[plannedSession.currentTaskIndex]?.text || ''}`
                : t.breakTime}
            </div>
          )}
          {plannedSession && !plannedSession.isActive && (
            <div className="mb-4 p-4 rounded-lg bg-emerald-50 text-center">
              <h3 className="font-bold text-emerald-800">{t.sessionComplete}</h3>
              <button onClick={() => setPlannedSession(null)} className="mt-3 px-4 py-2 bg-emerald-500 text-white rounded-lg">{t.planNewSession}</button>
            </div>
          )}
          <button
            onClick={startPlannedSession}
            disabled={plannerTasks.length === 0}
            className={`w-full py-3 rounded-xl font-semibold text-white ${plannerTasks.length > 0 ? 'bg-red-500' : 'bg-gray-300 cursor-not-allowed'}`}
          >
            {plannerTasks.length > 0 ? t.startSession : t.addAtLeastOne}
          </button>
        </div>
      )}

      {view === 'reports' && (
        <section className="report-panel w-full max-w-2xl bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h2 className="text-xl font-bold text-gray-800">{t.reports}</h2>
            <div className="report-period-switch flex gap-1 p-1 rounded-lg bg-gray-100">
              <button
                onClick={() => setReportPeriod('week')}
                className={`report-period-button px-3 py-1.5 rounded-md text-sm ${reportPeriod === 'week' ? 'is-active bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
              >
                {t.week}
              </button>
              <button
                onClick={() => setReportPeriod('month')}
                className={`report-period-button px-3 py-1.5 rounded-md text-sm ${reportPeriod === 'month' ? 'is-active bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}
              >
                {t.month}
              </button>
            </div>
          </div>

          <div className="report-goals-card rounded-xl border border-gray-100 p-4 mb-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-bold text-gray-800">🎯 {t.goals}</h3>
              <p className="text-xs text-gray-400">{t.goalControlsHint}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <GoalStepper
                label={t.dailyFocusGoal}
                value={goals.dailyFocusMinutes}
                min={30}
                max={600}
                step={15}
                onChange={(dailyFocusMinutes) => setGoals((current) => ({ ...current, dailyFocusMinutes }))}
              />
              <GoalStepper
                label={t.studyDaysGoal}
                value={goals.studyDaysPerWeek}
                min={1}
                max={7}
                step={1}
                onChange={(studyDaysPerWeek) => setGoals((current) => ({ ...current, studyDaysPerWeek }))}
              />
            </div>
          </div>

          {!hasReportData ? (
            <div className="py-10 text-center">
              <span className="text-4xl">📊</span>
              <p className="mt-3 text-gray-700 font-medium">{t.noReportData}</p>
              <p className="mt-2 text-sm text-gray-400">{t.trackingNote}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="report-stat-card report-stat-focus rounded-xl bg-red-50 p-3">
                  <p className="text-xs text-gray-500">{t.focusMinutes}</p>
                  <p className="report-stat-number mt-1 text-xl font-bold text-red-600">{formatDuration(reportTotals.focusMinutes)}</p>
                </div>
                <div className="report-stat-card report-stat-sessions rounded-xl bg-blue-50 p-3">
                  <p className="text-xs text-gray-500">{t.sessions}</p>
                  <p className="report-stat-number mt-1 text-xl font-bold text-blue-600">{reportTotals.focusSessions}</p>
                </div>
                <div className="report-stat-card report-stat-tasks rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs text-gray-500">{t.tasksDone}</p>
                  <p className="report-stat-number mt-1 text-xl font-bold text-emerald-600">
                    {reportTotals.completedTasks}/{reportTotals.plannedTasks}
                  </p>
                </div>
                <div className="report-stat-card report-stat-score rounded-xl bg-amber-50 p-3">
                  <p className="text-xs text-gray-500">{t.score}</p>
                  <p className="report-stat-number mt-1 text-xl font-bold text-amber-600">{reportScore}<span className="text-sm">/100</span></p>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
                <span>{t.activeDays}: {activeDays}/{targetStudyDays}</span>
                <span>{Math.round(reportTotals.plannedTasks ? reportTotals.completedTasks / reportTotals.plannedTasks * 100 : 0)}% {t.tasksDone}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">{t.scoreFormula}</p>
              {bestDay && bestDay.focusMinutes > 0 && (
                <p className="text-xs text-gray-500 mb-3">
                  {t.bestDay}: {new Date(`${bestDay.date}T12:00:00`).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long' })}
                  {' · '}{formatDuration(bestDay.focusMinutes)}
                </p>
              )}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {reports.map((day) => {
                  const date = new Date(`${day.date}T12:00:00`);
                  const label = date.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                    weekday: 'short',
                    month: reportPeriod === 'month' ? 'short' : undefined,
                    day: 'numeric',
                  });
                  const barWidth = reportTotals.focusMinutes
                    ? Math.max(day.focusMinutes ? 3 : 0, day.focusMinutes / Math.max(reportTotals.focusMinutes, 120) * 100)
                    : 0;
                  return (
                    <div key={day.date} className="report-row grid grid-cols-[52px_1fr_54px] sm:grid-cols-[72px_1fr_64px] items-center gap-2 text-xs">
                      <span className="report-row-label text-gray-500">{label}</span>
                      <div className="report-row-track h-7 rounded-md bg-gray-100 overflow-hidden relative">
                        <div className="h-full rounded-md bg-gradient-to-r from-red-400 to-orange-400" style={{ width: `${barWidth}%` }} />
                        <span className="absolute inset-y-0 left-2 flex items-center text-gray-600">
                          {day.focusMinutes ? formatDuration(day.focusMinutes) : '—'}
                          {day.plannedTasks ? ` · ${day.completedTasks}/${day.plannedTasks}` : ''}
                        </span>
                      </div>
                      <span className={`report-row-score text-right font-semibold ${day.score === null ? 'text-gray-300' : 'text-amber-600'}`}>
                        {day.score === null ? '—' : `${day.score}/100`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <section className="study-calendar-panel mt-6 rounded-xl border border-gray-100 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-bold text-gray-800">📅 {t.studyCalendar}</h3>
              <div className="streak-summary flex gap-2">
                <div className="streak-chip">
                  <span>{t.currentStreak}</span>
                  <strong>{streaks.current} {t.days}</strong>
                </div>
                <div className="streak-chip">
                  <span>{t.bestStreak}</span>
                  <strong>{streaks.longest} {t.days}</strong>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">{t.calendarHistoryNote}</p>
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                aria-label={t.previousMonth}
                className="calendar-month-button w-9 h-9 rounded-lg border"
              >
                ‹
              </button>
              <h4 className="font-semibold text-gray-800">
                {calendarMonth.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' })}
              </h4>
              <button
                type="button"
                onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                aria-label={t.nextMonth}
                disabled={isCalendarAtCurrentMonth}
                className="calendar-month-button w-9 h-9 rounded-lg border"
              >
                ›
              </button>
            </div>
            <div className="activity-calendar-grid mb-2">
              {Array.from({ length: 7 }, (_, index) => (
                <span key={`weekday-${index}`} className="activity-calendar-weekday">
                  {new Date(2024, 0, index + 1).toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short' })}
                </span>
              ))}
              {calendarCells.map((day, index) => {
                if (day === null) return <span key={`empty-${index}`} className="activity-calendar-empty" />;
                const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                const dateKey = getDateKey(date);
                const focusMinutes = focusMinutesByDay.get(dateKey) || 0;
                const level = focusMinutes >= goals.dailyFocusMinutes
                  ? 4
                  : focusMinutes >= goals.dailyFocusMinutes * 0.75
                    ? 3
                    : focusMinutes >= goals.dailyFocusMinutes * 0.5
                      ? 2
                      : focusMinutes > 0 ? 1 : 0;
                const label = date.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                });
                return (
                  <div
                    key={dateKey}
                    className={`activity-calendar-day level-${level} ${dateKey === getTodayKey() ? 'is-today' : ''} ${dateKey > getTodayKey() ? 'is-future' : ''}`}
                    title={`${label}: ${focusMinutes ? formatDuration(focusMinutes) : t.noStudy}`}
                    aria-label={`${label}: ${focusMinutes ? formatDuration(focusMinutes) : t.noStudy}`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
            <div className="calendar-legend flex flex-wrap items-center justify-end gap-2 text-xs text-gray-500">
              <span>{t.noStudy}</span>
              <span className="activity-calendar-day level-0" />
              <span className="activity-calendar-day level-1" />
              <span className="activity-calendar-day level-2" />
              <span className="activity-calendar-day level-3" />
              <span className="activity-calendar-day level-4" />
              <span>{t.goalReached}</span>
            </div>
          </section>

          <section className="achievements-panel mt-6">
            <h3 className="text-base font-bold text-gray-800 mb-3">🏆 {t.achievements}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {achievements.map((achievement) => {
                const unlocked = achievement.progress >= achievement.target;
                return (
                  <article key={achievement.id} className={`achievement-card rounded-xl border p-3 ${unlocked ? 'is-unlocked' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="achievement-icon text-2xl" aria-hidden="true">{achievement.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-gray-800">{achievement.title}</h4>
                          <span className={`achievement-status text-xs ${unlocked ? 'is-unlocked' : ''}`}>
                            {unlocked ? t.achievementUnlocked : t.achievementLocked}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{achievement.description}</p>
                        <div className="achievement-progress-track mt-2 h-1.5 rounded-full overflow-hidden">
                          <span style={{ width: `${achievement.progress / achievement.target * 100}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{achievement.progress}/{achievement.target}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="backup-panel mt-6 rounded-xl border border-gray-100 p-4">
            <h3 className="text-base font-bold text-gray-800">💾 {t.dataBackup}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-3">{t.backupHint}</p>
            <input
              ref={backupFileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              className="sr-only"
              aria-label={t.importBackup}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleExportBackup} className="backup-action-button px-3 py-2 rounded-lg text-sm font-medium">
                {t.exportBackup}
              </button>
              <button type="button" onClick={() => backupFileInputRef.current?.click()} className="backup-action-button px-3 py-2 rounded-lg text-sm font-medium">
                {t.importBackup}
              </button>
              {backupReloadPending && (
                <button type="button" onClick={() => window.location.reload()} className="backup-reload-button px-3 py-2 rounded-lg text-sm font-semibold">
                  {t.reloadApp}
                </button>
              )}
            </div>
            {backupStatus && <p role="status" className={`text-sm mt-3 ${backupReloadPending ? 'text-emerald-600' : 'text-gray-500'}`}>{backupStatus}</p>}
          </section>
        </section>
      )}

      {view === 'prayers' && (
        <section className="prayers-panel w-full max-w-3xl bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-gray-100 mb-6">
          <div className="mb-5">
            <h2 className="text-xl font-bold text-gray-800">🤲 {t.prayers}</h2>
            <p className="text-sm text-gray-500 mt-2">{t.prayerNote}</p>
          </div>
          <div className="prayer-category-nav flex flex-wrap gap-2 p-2 rounded-xl bg-gray-50 mb-5">
            <button
              type="button"
              onClick={() => setPrayerFilter('all')}
              aria-pressed={prayerFilter === 'all'}
              className={`prayer-category-button px-3 py-2 rounded-lg text-sm ${prayerFilter === 'all' ? 'is-active' : ''}`}
            >
              {t.allPrayers}
            </button>
            <button
              type="button"
              onClick={() => setShowFavoritePrayers((current) => !current)}
              aria-pressed={showFavoritePrayers}
              className={`prayer-category-button px-3 py-2 rounded-lg text-sm ${showFavoritePrayers ? 'is-active' : ''}`}
            >
              ★ {t.favoritePrayers}
            </button>
            {prayerCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setPrayerFilter(category.id)}
                aria-pressed={prayerFilter === category.id}
                className={`prayer-category-button px-3 py-2 rounded-lg text-sm ${prayerFilter === category.id ? 'is-active' : ''}`}
              >
                {category.title[language]}
              </button>
            ))}
          </div>
          <div className="space-y-6">
            {visiblePrayerCategories
              .filter((category) => prayerFilter === 'all' || prayerFilter === category.id)
              .map((category) => (
                <section key={category.id}>
                  <h3 className="text-base font-bold text-gray-800 mb-3">
                    {category.title[language]}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {category.prayers.map((prayer) => {
                      const isFavorite = favoritePrayerIds.includes(prayer.id);
                      return (
                      <article key={prayer.id} className="prayer-card rounded-xl border border-gray-100 p-4">
                        <div className="flex items-start gap-2">
                          <p lang="ar" dir="rtl" className="prayer-text flex-1 text-right text-xl leading-loose font-medium">
                            {prayer.arabic}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleFavoritePrayer(prayer.id)}
                            aria-label={isFavorite ? t.removeFavorite : t.addFavorite}
                            aria-pressed={isFavorite}
                            className={`prayer-favorite-button w-9 h-9 rounded-lg text-xl ${isFavorite ? 'is-active' : ''}`}
                          >
                            {isFavorite ? '★' : '☆'}
                          </button>
                        </div>
                        {language === 'en' && (
                          <p lang="en" dir="ltr" className="prayer-translation text-sm text-gray-600 mt-2">
                            {prayer.english}
                          </p>
                        )}
                        <p className="prayer-source text-xs text-gray-400 mt-3">
                          {prayer.source[language]}
                        </p>
                      </article>
                    );
                    })}
                  </div>
                </section>
              ))}
            {visiblePrayerCategories.filter((category) => prayerFilter === 'all' || prayerFilter === category.id).length === 0 && (
              <p className="text-center text-gray-500 py-8">{t.noFavoritePrayers}</p>
            )}
          </div>
        </section>
      )}

      <QuranLibrary
        language={language}
        isActive={view === 'quran'}
        onOpenLibrary={() => setView('quran')}
      />

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl transform animate-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">⚙️ {t.settings}</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.focusDuration}
                </label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={tempSettings.focus}
                  onChange={(e) => setTempSettings({ ...tempSettings, focus: Math.max(1, Math.min(120, parseInt(e.target.value) || 1)) })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.shortBreakDuration}
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={tempSettings.shortBreak}
                  onChange={(e) => setTempSettings({ ...tempSettings, shortBreak: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.longBreakDuration}
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={tempSettings.longBreak}
                  onChange={(e) => setTempSettings({ ...tempSettings, longBreak: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.longBreakAfter}
                </label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={tempSettings.longBreakInterval}
                  onChange={(e) => setTempSettings({ ...tempSettings, longBreakInterval: Math.max(2, Math.min(10, parseInt(e.target.value) || 2)) })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 transition-all"
                />
              </div>
            </div>

            <section className="goal-settings-section mt-6 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-bold text-gray-800 mb-1">🎯 {t.goals}</h3>
              <p className="text-xs text-gray-500 mb-3">{t.goalControlsHint}</p>
              <div className="space-y-3">
                <GoalStepper
                  label={t.dailyFocusGoal}
                  value={tempGoals.dailyFocusMinutes}
                  min={30}
                  max={600}
                  step={15}
                  onChange={(dailyFocusMinutes) => setTempGoals((current) => ({ ...current, dailyFocusMinutes }))}
                />
                <GoalStepper
                  label={t.studyDaysGoal}
                  value={tempGoals.studyDaysPerWeek}
                  min={1}
                  max={7}
                  step={1}
                  onChange={(studyDaysPerWeek) => setTempGoals((current) => ({ ...current, studyDaysPerWeek }))}
                />
              </div>
            </section>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-all"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 py-2.5 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-all"
              >
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto pt-8 pb-4 text-center">
        <a
          href="https://mohamed-hatem-web.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm"
        >
          <img
            src={`${import.meta.env.BASE_URL}my-photo.png`}
            alt="Mohamed Hatem"
            className="w-9 h-9 rounded-full object-cover object-center ring-2 ring-white dark:ring-gray-700"
            loading="lazy"
          />
          <span className="text-left">
            <span className="block text-xs text-gray-400 leading-none">{t.developedBy}</span>
            <span className="block text-sm font-semibold text-gray-700">Mohamed Hatem</span>
          </span>
        </a>
        <p className="text-xs text-gray-400 mt-2">
          {t.dataSaved} • {new Date().toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')}
        </p>
      </footer>
    </div>
  );
}
