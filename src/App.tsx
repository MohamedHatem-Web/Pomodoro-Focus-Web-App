import { useState, useEffect, useCallback, useRef } from 'react';
import { translations, Language } from './i18n';

// Types
type TimerMode = 'focus' | 'shortBreak' | 'longBreak';
type Theme = 'light' | 'dark';
type View = 'timer' | 'planner';

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

interface TodoTask {
  id: string;
  text: string;
  completed: boolean;
}

interface PlannedSession {
  tasks: TodoTask[];
  timePerTask: number;
  breakDuration: number;
  currentTaskIndex: number;
  currentPhase: 'focus' | 'break';
  isActive: boolean;
  phaseTimeLeft: number;
  breaksDone: number;
  breakCount: number;
  pendingTaskIndex: number;
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
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

function loadSavedTimerState(): SavedTimerState | null {
  try {
    const saved = JSON.parse(localStorage.getItem('pomodoro_timer_state') || 'null');
    return saved && typeof saved === 'object' ? saved as SavedTimerState : null;
  } catch {
    return null;
  }
}

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  if (hours && remainingMinutes) return `${hours}h ${remainingMinutes}m`;
  if (hours) return `${hours}h`;
  return `${remainingMinutes}m`;
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
  const [plannerTasks, setPlannerTasks] = useState<TodoTask[]>([]);
  const [plannerNewTask, setPlannerNewTask] = useState('');
  const intervalRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(savedTimer?.deadline || null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const t = translations[language];

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

  const totalTime = plannedSession?.isActive
    ? (plannedSession.currentPhase === 'break' ? plannedSession.breakDuration : plannedSession.timePerTask) * 60
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

    if (view === 'planner' && plannedSession?.isActive) {
      playNotification();
      if (plannedSession.currentPhase === 'focus') {
        const nextIndex = plannedSession.currentTaskIndex + 1;
        if (nextIndex >= plannedSession.tasks.length) {
          const newStats = { ...stats };
          newStats.focusSessions += plannedSession.tasks.length;
          newStats.totalFocusMinutes += plannedSession.timePerTask * plannedSession.tasks.length;
          setStats(newStats);
          saveStats(newStats);
          setSessionsCompleted((completed) => {
            const updated = completed + plannedSession.tasks.length;
            localStorage.setItem('pomodoro_sessions_completed', String(updated));
            return updated;
          });
          setPlannedSession({ ...plannedSession, isActive: false, phaseTimeLeft: 0 });
          deadlineRef.current = null;
          return;
        }
        if (plannedSession.breaksDone < plannedSession.breakCount) {
          const nextSession = {
            ...plannedSession,
            currentPhase: 'break' as const,
            phaseTimeLeft: plannedSession.breakDuration * 60,
            breaksDone: plannedSession.breaksDone + 1,
            pendingTaskIndex: nextIndex,
          };
          setPlannedSession(nextSession);
          setTimeLeft(nextSession.phaseTimeLeft);
          deadlineRef.current = Date.now() + nextSession.phaseTimeLeft * 1000;
          setIsRunning(true);
        } else {
          const nextSession = {
            ...plannedSession,
            currentTaskIndex: nextIndex,
            currentPhase: 'focus' as const,
            phaseTimeLeft: plannedSession.timePerTask * 60,
          };
          setPlannedSession(nextSession);
          setTimeLeft(nextSession.phaseTimeLeft);
          deadlineRef.current = Date.now() + nextSession.phaseTimeLeft * 1000;
          setIsRunning(true);
        }
      } else {
        const nextSession = {
          ...plannedSession,
          currentTaskIndex: plannedSession.pendingTaskIndex,
          currentPhase: 'focus' as const,
          phaseTimeLeft: plannedSession.timePerTask * 60,
        };
        setPlannedSession(nextSession);
        setTimeLeft(nextSession.phaseTimeLeft);
        deadlineRef.current = Date.now() + nextSession.phaseTimeLeft * 1000;
        setIsRunning(true);
      }
      return;
    }

    if (mode === 'focus') {
      const newSessions = sessionsCompleted + 1;
      setSessionsCompleted(newSessions);
      localStorage.setItem('pomodoro_sessions_completed', String(newSessions));
      
      // Update stats
      const newStats = { ...stats };
      newStats.focusSessions += 1;
      newStats.totalFocusMinutes += settings.focus;
      setStats(newStats);
      saveStats(newStats);

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
  }, [mode, sessionsCompleted, settings, stats, view, plannedSession]);

  const playNotification = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === 'suspended') void audioCtx.resume();

      [660, 880, 1046].forEach((frequency, index) => {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        const start = audioCtx.currentTime + index * 0.18;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gainNode.gain.setValueAtTime(0.0001, start);
        gainNode.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.18);
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
        if (view === 'planner' && plannedSession?.isActive) {
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
    if (view === 'planner' && plannedSession?.isActive) {
      setPlannedSession({
        ...plannedSession,
        currentTaskIndex: 0,
        currentPhase: 'focus',
        phaseTimeLeft: plannedSession.timePerTask * 60,
        breaksDone: 0,
        pendingTaskIndex: 0,
      });
      setTimeLeft(plannedSession.timePerTask * 60);
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
    setShowSettings(false);
    // Reset timer if not running
    if (!isRunning) {
      const duration = tempSettings[mode === 'shortBreak' ? 'shortBreak' : mode === 'longBreak' ? 'longBreak' : 'focus'];
      setTimeLeft(duration * 60);
    }
  };

  const handleOpenSettings = () => {
    setTempSettings(settings);
    setShowSettings(true);
  };

  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos((tasks) => [...tasks, { id: `${Date.now()}`, text: newTodo.trim(), completed: false }]);
    setNewTodo('');
  };

  const toggleTodo = (id: string) => {
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

  const togglePlannedTask = (id: string) => {
    setPlannedSession((session) => {
      if (!session) return session;
      return {
        ...session,
        tasks: session.tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task),
      };
    });
  };

  const startPlannedSession = () => {
    if (plannerTasks.length === 0) return;
    const totalMinutes = plannerHours * 60;
    const breakDuration = 5;
    const effectiveBreakCount = Math.min(plannerBreakCount, plannerTasks.length - 1);
    const focusTime = totalMinutes - effectiveBreakCount * breakDuration;
    const timePerTask = Math.max(1, Math.floor(focusTime / plannerTasks.length));
    const nextSession: PlannedSession = {
      tasks: [...plannerTasks],
      timePerTask,
      breakDuration,
      currentTaskIndex: 0,
      currentPhase: 'focus',
      isActive: true,
      phaseTimeLeft: timePerTask * 60,
      breaksDone: 0,
      breakCount: effectiveBreakCount,
      pendingTaskIndex: 0,
    };
    setPlannedSession(nextSession);
    setTimeLeft(timePerTask * 60);
    setView('timer');
    deadlineRef.current = Date.now() + timePerTask * 60 * 1000;
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
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="theme-toggle w-10 h-10 rounded-full border flex items-center justify-center"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Header */}
      <div className="text-center mb-6 w-full max-w-md">
        <h1 className="text-3xl font-bold app-heading flex items-center justify-center gap-2">
          <span className="text-2xl">🍅</span> <span>{t.title}</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">{t.subtitle}</p>
      </div>

      <div className="flex gap-2 mb-6 bg-white rounded-xl p-1.5 shadow-sm border border-gray-100">
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
                ? `${t.workingOn}: ${plannedSession.tasks[plannedSession.currentTaskIndex]?.text || ''}`
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

      {plannedSession?.isActive && (
        <div className="w-full max-w-md bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t.tasksToComplete}</h3>
          <div className="space-y-2">
            {plannedSession.tasks.map((task, index) => (
              <button
                key={task.id}
                type="button"
                onClick={() => togglePlannedTask(task.id)}
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
              onChange={(event) => setPlannerHours(Number(event.target.value))}
              className="flex-1 accent-red-500"
            />
            <span className="font-bold text-gray-800 min-w-[82px] text-right">{formatDuration(plannerHours * 60)}</span>
          </div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t.breakCount}</label>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={plannerBreakCount}
              onChange={(event) => setPlannerBreakCount(Math.max(0, Math.min(10, Number(event.target.value))))}
              className="flex-1 accent-emerald-500"
            />
            <input
              type="number"
              min="0"
              max="10"
              value={plannerBreakCount}
              onChange={(event) => setPlannerBreakCount(Math.max(0, Math.min(10, Number(event.target.value) || 0)))}
              className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-center font-bold"
              aria-label={t.breakCount}
            />
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
                <div key={task.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">{index + 1}</span>
                  <span className="flex-1 text-sm text-gray-700">{task.text}</span>
                  <button onClick={() => removePlannerTask(task.id)} className="text-gray-400">×</button>
                </div>
              ))}
            </div>
          )}
          {plannedSession?.isActive && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700">
              {plannedSession.currentPhase === 'focus' ? t.workingOn : t.breakTime}: {plannedSession.currentPhase === 'focus' ? plannedSession.tasks[plannedSession.currentTaskIndex]?.text : ''}
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform animate-in">
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
          <span className="w-7 h-7 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">M</span>
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
