import { useState, useEffect, useCallback, useRef } from 'react';

// Types
type TimerMode = 'focus' | 'shortBreak' | 'longBreak';
type Theme = 'light' | 'dark';

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
  const [settings, setSettings] = useState<TimerSettings>(loadSettings);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [mode, setMode] = useState<TimerMode>('focus');
  const [timeLeft, setTimeLeft] = useState(settings.focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsCompleted, setSessionsCompleted] = useState(loadSessionsCompleted);
  const [stats, setStats] = useState<DailyStats>(loadStats);
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<TimerSettings>(settings);
  const intervalRef = useRef<number | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('pomodoro_theme', theme);

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute('content', theme === 'dark' ? '#111827' : '#ffffff');
  }, [theme]);

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

  const totalTime = settings[mode === 'shortBreak' ? 'shortBreak' : mode === 'longBreak' ? 'longBreak' : 'focus'] * 60;
  const progress = (totalTime - timeLeft) / totalTime;

  // Save settings when they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
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
  }, [mode, sessionsCompleted, settings, stats]);

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

  // SVG circle parameters
  const radius = 140;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const currentConfig = modeConfig[mode];

  return (
    <div className={`min-h-screen app-shell flex flex-col items-center justify-center p-4 font-sans ${theme}`}>
      {/* Header */}
      <div className="text-center mb-6 relative w-full max-w-md">
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="theme-toggle absolute right-0 top-0 w-10 h-10 rounded-full border flex items-center justify-center"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <h1 className="text-3xl font-bold app-heading flex items-center justify-center gap-2">
          <span className="text-2xl">🍅</span> <span>Pomodoro Focus</span>
        </h1>
        <p className="text-gray-500 text-sm mt-1">Stay focused, take breaks, be productive</p>
      </div>

      {/* Mode Selector */}
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
            {modeConfig[m].label}
          </button>
        ))}
      </div>

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
            {currentConfig.label}
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
              Pause
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Start
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
            Reset
          </span>
        </button>
      </div>

      {/* Stats & Settings */}
      <div className="w-full max-w-md grid grid-cols-2 gap-4">
        {/* Today's Stats */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Today's Stats</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Sessions</span>
              <span className="font-bold text-gray-800">{stats.focusSessions}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Focus Time</span>
              <span className="font-bold text-gray-800">{stats.totalFocusMinutes}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Completed</span>
              <span className="font-bold text-gray-800">{sessionsCompleted}</span>
            </div>
          </div>
        </div>

        {/* Quick Info / Settings Button */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Timer Info</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Focus</span>
              <span className="font-bold text-gray-800">{settings.focus}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Short Break</span>
              <span className="font-bold text-gray-800">{settings.shortBreak}m</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Long Break</span>
              <span className="font-bold text-gray-800">{settings.longBreak}m</span>
            </div>
          </div>
          <button
            onClick={handleOpenSettings}
            className="mt-3 w-full text-center text-sm text-gray-500 hover:text-gray-700 transition-colors py-1 border-t border-gray-100"
          >
            ⚙️ Customize
          </button>
        </div>
      </div>

      {/* Session dots */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Progress:</span>
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl transform animate-in">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">⚙️ Settings</h2>
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
                  Focus Duration (minutes)
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
                  Short Break (minutes)
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
                  Long Break (minutes)
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
                  Long Break After (sessions)
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
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 py-2.5 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-xs text-gray-400">
        <p>Data saved locally • {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
}
