import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  ExternalLink,
  Eye,
  EyeOff,
  Headphones,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Star,
  Volume2,
  Wifi,
  X,
} from 'lucide-react';
import { translations, type Language } from './i18n';

const API_BASE = 'https://www.mp3quran.net/api/v3';
const PROVIDER_URL = 'https://www.mp3quran.net/';

interface Moshaf {
  id: number;
  name: string;
  server: string;
  surahIds: number[];
}

interface Reciter {
  id: number;
  name: string;
  moshaf: Moshaf[];
}

interface Surah {
  id: number;
  name: string;
}

interface QuranCatalog {
  language: Language;
  reciters: Reciter[];
  surahs: Surah[];
}

interface QuranPreferences {
  reciterId: number | null;
  moshafId: number | null;
  surahId: number | null;
  volume: number;
  favoriteReciterIds: number[];
  favoriteSurahIds: number[];
  currentTime: number;
  wasPlaying: boolean;
  hasPlayed: boolean;
  miniPlayerHidden: boolean;
}

const catalogCache = new Map<Language, QuranCatalog>();
const PREFERENCES_KEY = 'pomodoro_quran_preferences';
const EMPTY_PREFERENCES: QuranPreferences = {
  reciterId: null,
  moshafId: null,
  surahId: null,
  volume: 0.75,
  favoriteReciterIds: [],
  favoriteSurahIds: [],
  currentTime: 0,
  wasPlaying: false,
  hasPlayed: false,
  miniPlayerHidden: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function validIdList(value: unknown): number[] {
  return Array.isArray(value)
    ? [...new Set(value.map(validId).filter((id): id is number => id !== null))]
    : [];
}

function loadQuranPreferences(): QuranPreferences {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || 'null');
    if (!isRecord(saved)) return EMPTY_PREFERENCES;
    return {
      reciterId: validId(saved.reciterId),
      moshafId: validId(saved.moshafId),
      surahId: validId(saved.surahId),
      volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume)
        ? Math.min(1, Math.max(0, saved.volume))
        : EMPTY_PREFERENCES.volume,
      favoriteReciterIds: validIdList(saved.favoriteReciterIds),
      favoriteSurahIds: validIdList(saved.favoriteSurahIds).filter((id) => id <= 114),
      currentTime: typeof saved.currentTime === 'number' && Number.isFinite(saved.currentTime)
        ? Math.max(0, saved.currentTime)
        : 0,
      wasPlaying: saved.wasPlaying === true,
      hasPlayed: saved.hasPlayed === true,
      miniPlayerHidden: saved.miniPlayerHidden === true,
    };
  } catch (error) {
    console.error('Unable to load saved Quran preferences.', error);
    return EMPTY_PREFERENCES;
  }
}

function saveQuranPreferences(preferences: QuranPreferences): boolean {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch (error) {
    console.error('Unable to save Quran preferences.', error);
    return false;
  }
}

function isProviderUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'mp3quran.net' || url.hostname.endsWith('.mp3quran.net'));
  } catch {
    return false;
  }
}

function parseSurahIds(value: unknown): number[] {
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(',').filter(Boolean).map(Number))]
    .filter((id) => Number.isInteger(id) && id >= 1 && id <= 114);
}

function parseReciters(value: unknown): Reciter[] {
  if (!isRecord(value) || !Array.isArray(value.reciters)) {
    throw new Error('The reciter catalog has an unexpected format.');
  }

  const reciters = value.reciters.flatMap((item): Reciter[] => {
    if (!isRecord(item) || !Number.isInteger(item.id) || typeof item.name !== 'string' || !Array.isArray(item.moshaf)) {
      return [];
    }

    const moshaf = item.moshaf.flatMap((edition): Moshaf[] => {
      if (!isRecord(edition) ||
        !Number.isInteger(edition.id) ||
        typeof edition.name !== 'string' ||
        !isProviderUrl(edition.server)) return [];
      const surahIds = parseSurahIds(edition.surah_list);
      return surahIds.length > 0
        ? [{ id: Number(edition.id), name: edition.name.trim(), server: edition.server, surahIds }]
        : [];
    });

    return moshaf.length > 0
      ? [{ id: Number(item.id), name: item.name.trim(), moshaf }]
      : [];
  });

  if (reciters.length === 0) throw new Error('No supported reciters were returned.');
  return reciters;
}

function parseSurahs(value: unknown): Surah[] {
  if (!isRecord(value) || !Array.isArray(value.suwar)) {
    throw new Error('The surah catalog has an unexpected format.');
  }

  const surahs = value.suwar.flatMap((item): Surah[] =>
    isRecord(item) && Number.isInteger(item.id) && Number(item.id) >= 1 && Number(item.id) <= 114 &&
      typeof item.name === 'string' && item.name.trim()
      ? [{ id: Number(item.id), name: item.name.trim() }]
      : [],
  );

  if (surahs.length === 0) throw new Error('No surahs were returned.');
  return surahs;
}

function getAudioUrl(moshaf: Moshaf | undefined, surah: Surah | undefined): string {
  if (!moshaf || !surah) return '';
  return new URL(`${String(surah.id).padStart(3, '0')}.mp3`, `${moshaf.server.replace(/\/+$/, '')}/`).toString();
}

function getPreferredMoshaf(reciter: Reciter): Moshaf | undefined {
  return [...reciter.moshaf].sort((left, right) => {
    const leftHafs = /حفص|hafs/i.test(left.name) ? 1 : 0;
    const rightHafs = /حفص|hafs/i.test(right.name) ? 1 : 0;
    return rightHafs - leftHafs || right.surahIds.length - left.surahIds.length;
  })[0];
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

interface QuranLibraryProps {
  language: Language;
  isActive: boolean;
  onOpenLibrary: () => void;
}

interface MiniPlayerDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
}

interface DocumentPictureInPictureApi {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>;
}

export default function QuranLibrary({ language, isActive, onOpenLibrary }: QuranLibraryProps) {
  const t = translations[language];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [savedPreferences] = useState(loadQuranPreferences);
  const [catalog, setCatalog] = useState<QuranCatalog | null>(() => catalogCache.get(language) || null);
  const [isLoading, setIsLoading] = useState(() => !catalogCache.has(language) && savedPreferences.hasPlayed);
  const [loadError, setLoadError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [selectedReciterId, setSelectedReciterId] = useState<number | null>(savedPreferences.reciterId);
  const [selectedMoshafId, setSelectedMoshafId] = useState<number | null>(savedPreferences.moshafId);
  const [selectedSurahId, setSelectedSurahId] = useState<number | null>(savedPreferences.surahId);
  const [reciterSearch, setReciterSearch] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [currentTime, setCurrentTime] = useState(savedPreferences.currentTime);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(savedPreferences.volume);
  const [favoriteReciterIds, setFavoriteReciterIds] = useState(savedPreferences.favoriteReciterIds);
  const [favoriteSurahIds, setFavoriteSurahIds] = useState(savedPreferences.favoriteSurahIds);
  const [hasPlayed, setHasPlayed] = useState(savedPreferences.hasPlayed);
  const [isMiniPlayerHidden, setIsMiniPlayerHidden] = useState(savedPreferences.miniPlayerHidden);
  const [resumeAvailable, setResumeAvailable] = useState(savedPreferences.currentTime > 0);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isReciterSearchOpen, setIsReciterSearchOpen] = useState(false);
  const [floatingPlayer, setFloatingPlayer] = useState<{ window: Window; container: HTMLDivElement } | null>(null);
  const [floatingError, setFloatingError] = useState('');
  const [miniPlayerPosition, setMiniPlayerPosition] = useState<{ left: number; top: number } | null>(null);
  const preferencesRef = useRef<QuranPreferences>(savedPreferences);
  const restorePositionRef = useRef<number | null>(savedPreferences.currentTime > 0 ? savedPreferences.currentTime : null);
  const continueAfterTrackChangeRef = useRef(false);
  const lastSavedPositionRef = useRef(savedPreferences.currentTime);
  const miniPlayerRef = useRef<HTMLElement | null>(null);
  const miniPlayerDragRef = useRef<MiniPlayerDrag | null>(null);
  const audioTrackRef = useRef<{ key: string; url: string } | null>(null);
  const favoritesPanelRef = useRef<HTMLElement | null>(null);
  const favoritesTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasFavoritesOpenRef = useRef(false);

  useEffect(() => {
    const cachedCatalog = catalogCache.get(language);
    if (cachedCatalog) {
      setCatalog(cachedCatalog);
      setIsLoading(false);
      setLoadError('');
      return;
    }
    if (!isActive && !hasPlayed) return;

    const controller = new AbortController();
    setIsLoading(true);
    setLoadError('');
    void (async () => {
      try {
        const apiLanguage = language === 'ar' ? 'ar' : 'eng';
        const [recitersResponse, surahsResponse] = await Promise.all([
          fetch(`${API_BASE}/reciters?language=${apiLanguage}`, { signal: controller.signal }),
          fetch(`${API_BASE}/suwar?language=${apiLanguage}`, { signal: controller.signal }),
        ]);
        if (!recitersResponse.ok || !surahsResponse.ok) {
          throw new Error(`Catalog request failed (${recitersResponse.status}/${surahsResponse.status}).`);
        }

        const [recitersData, surahsData]: [unknown, unknown] = await Promise.all([
          recitersResponse.json(),
          surahsResponse.json(),
        ]);
        const nextCatalog = {
          language,
          reciters: parseReciters(recitersData),
          surahs: parseSurahs(surahsData),
        };
        catalogCache.set(language, nextCatalog);
        setCatalog(nextCatalog);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Unable to load Quran reciter catalog.', error);
        setLoadError(t.quranLoadError);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [hasPlayed, isActive, language, retryCount, t.quranLoadError]);

  const visibleCatalog = catalog;
  const reciters = visibleCatalog?.reciters || [];
  const selectedReciter = reciters.find((reciter) => reciter.id === selectedReciterId) ||
    reciters.find((reciter) => /ماهر المعيقلي|maher.*(muaiq|meaq)/i.test(reciter.name)) ||
    reciters[0];
  const moshafOptions = selectedReciter?.moshaf || [];
  const selectedMoshaf = moshafOptions.find((moshaf) => moshaf.id === selectedMoshafId) ||
    (selectedReciter ? getPreferredMoshaf(selectedReciter) : undefined);
  const availableSurahs = useMemo(() => {
    const surahIds = new Set(selectedMoshaf?.surahIds || []);
    return (visibleCatalog?.surahs || []).filter((surah) => surahIds.has(surah.id));
  }, [selectedMoshaf, visibleCatalog]);
  const selectedSurah = availableSurahs.find((surah) => surah.id === selectedSurahId) || availableSurahs[0];
  const candidateAudioUrl = getAudioUrl(selectedMoshaf, selectedSurah);
  const audioTrackKey = selectedReciter && selectedMoshaf && selectedSurah
    ? `${selectedReciter.id}:${selectedMoshaf.id}:${selectedSurah.id}`
    : '';
  const audioUrl = audioTrackRef.current?.url || candidateAudioUrl;
  const filteredReciters = reciters.filter((reciter) =>
    reciter.name.toLocaleLowerCase().includes(reciterSearch.trim().toLocaleLowerCase()));
  const currentSurahIndex = availableSurahs.findIndex((surah) => surah.id === selectedSurah?.id);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  preferencesRef.current = {
    ...preferencesRef.current,
    reciterId: selectedReciter?.id ?? null,
    moshafId: selectedMoshaf?.id ?? null,
    surahId: selectedSurah?.id ?? null,
    volume,
    favoriteReciterIds,
    favoriteSurahIds,
    currentTime,
    hasPlayed,
    miniPlayerHidden: isMiniPlayerHidden,
  };

  useEffect(() => {
    if (!audioTrackKey || !candidateAudioUrl) {
      audioTrackRef.current = null;
      return;
    }
    if (!audioTrackRef.current) {
      audioTrackRef.current = { key: audioTrackKey, url: candidateAudioUrl };
    }
  }, [audioTrackKey, candidateAudioUrl]);

  useEffect(() => {
    if (!isActive) setIsFavoritesOpen(false);
  }, [isActive]);

  useEffect(() => {
    if (isFavoritesOpen) {
      wasFavoritesOpenRef.current = true;
      favoritesPanelRef.current?.focus();
    } else if (wasFavoritesOpenRef.current) {
      wasFavoritesOpenRef.current = false;
      if (isActive) favoritesTriggerRef.current?.focus();
    }
  }, [isActive, isFavoritesOpen]);

  useEffect(() => {
    if (!isFavoritesOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFavoritesOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFavoritesOpen]);

  const persistPreferences = useCallback(() => {
    if (saveQuranPreferences(preferencesRef.current)) {
      setStorageError('');
    } else {
      setStorageError(t.quranStorageError);
    }
  }, [t.quranStorageError]);

  useEffect(() => {
    if (!selectedReciter || !selectedMoshaf || !selectedSurah) return;
    persistPreferences();
  }, [
    selectedReciter?.id,
    selectedMoshaf?.id,
    selectedSurah?.id,
    volume,
    favoriteReciterIds,
    favoriteSurahIds,
    hasPlayed,
    isMiniPlayerHidden,
    persistPreferences,
  ]);

  useEffect(() => {
    const saveBeforeLeaving = () => {
      const audio = audioRef.current;
      if (audio && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        preferencesRef.current.currentTime = audio.currentTime;
        preferencesRef.current.wasPlaying = !audio.paused;
      }
      saveQuranPreferences(preferencesRef.current);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveBeforeLeaving();
    };
    window.addEventListener('pagehide', saveBeforeLeaving);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', saveBeforeLeaving);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const confirmBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', confirmBeforeLeaving);
    return () => window.removeEventListener('beforeunload', confirmBeforeLeaving);
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsBuffering(false);
    setPlaybackError('');
    setDuration(0);
    if (restorePositionRef.current !== null) {
      setCurrentTime(restorePositionRef.current);
    } else {
      audio.currentTime = 0;
      setCurrentTime(0);
    }
    if (continueAfterTrackChangeRef.current) {
      setIsBuffering(true);
      audio.load();
    }
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      preferencesRef.current.currentTime = audio.currentTime;
      preferencesRef.current.wasPlaying = !audio.paused;
    }
    if (audio) {
      audio.pause();
    }
    saveQuranPreferences(preferencesRef.current);
  }, []);

  const startPlayback = async (audio = audioRef.current) => {
    if (!audio || !audioUrl) return;
    setHasPlayed(true);
    preferencesRef.current.hasPlayed = true;
    preferencesRef.current.wasPlaying = true;
    setResumeAvailable(false);
    setPlaybackError('');
    setIsBuffering(true);
    try {
      await audio.play();
      setIsPlaying(true);
    } catch (error) {
      console.error('Unable to play the selected recitation.', error);
      preferencesRef.current.wasPlaying = false;
      setIsBuffering(false);
      setPlaybackError(t.quranPlaybackError);
    }
  };

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }

    await startPlayback(audio);
  };

  const stopPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    preferencesRef.current.currentTime = 0;
    lastSavedPositionRef.current = 0;
    preferencesRef.current.wasPlaying = false;
    restorePositionRef.current = null;
    setResumeAvailable(false);
    persistPreferences();
  };

  const prepareTrackChange = () => {
    continueAfterTrackChangeRef.current = Boolean(audioRef.current && !audioRef.current.paused);
    restorePositionRef.current = null;
    setResumeAvailable(false);
    setCurrentTime(0);
    preferencesRef.current.currentTime = 0;
    lastSavedPositionRef.current = 0;
  };

  const selectReciter = (nextReciter: Reciter) => {
    setIsFavoritesOpen(false);
    if (selectedReciter?.id === nextReciter.id) {
      setReciterSearch('');
      setIsReciterSearchOpen(false);
      return;
    }
    const nextMoshaf = getPreferredMoshaf(nextReciter);
    prepareTrackChange();
    audioTrackRef.current = null;
    setSelectedReciterId(nextReciter.id);
    setSelectedMoshafId(nextMoshaf?.id ?? null);
    setSelectedSurahId(nextMoshaf?.surahIds[0] ?? null);
    setReciterSearch('');
    setIsReciterSearchOpen(false);
    setIsFavoritesOpen(false);
    setPlaybackError('');
  };

  const selectSurah = (surahId: number) => {
    if (selectedSurah?.id === surahId) return;
    prepareTrackChange();
    audioTrackRef.current = null;
    setSelectedSurahId(surahId);
    setPlaybackError('');
  };

  const selectSurahByOffset = (offset: number) => {
    const nextSurah = availableSurahs[currentSurahIndex + offset];
    if (nextSurah) selectSurah(nextSurah.id);
  };

  const selectFavoriteSurah = (surahId: number) => {
    setIsFavoritesOpen(false);
    const matchingMoshaf = moshafOptions.find((moshaf) => moshaf.surahIds.includes(surahId));
    if (!matchingMoshaf) {
      setPlaybackError(t.quranFavoriteUnavailable);
      return;
    }
    if (selectedSurah?.id === surahId && selectedMoshaf?.id === matchingMoshaf.id) return;
    prepareTrackChange();
    audioTrackRef.current = null;
    setSelectedMoshafId(matchingMoshaf.id);
    setSelectedSurahId(surahId);
    setIsFavoritesOpen(false);
    setPlaybackError('');
  };

  const toggleFavoriteReciter = () => {
    if (!selectedReciter) return;
    setFavoriteReciterIds((favorites) => favorites.includes(selectedReciter.id)
      ? favorites.filter((id) => id !== selectedReciter.id)
      : [...favorites, selectedReciter.id]);
  };

  const toggleFavoriteSurah = () => {
    if (!selectedSurah) return;
    setFavoriteSurahIds((favorites) => favorites.includes(selectedSurah.id)
      ? favorites.filter((id) => id !== selectedSurah.id)
      : [...favorites, selectedSurah.id]);
  };

  const handleTimeUpdate = (audio: HTMLAudioElement) => {
    const nextTime = audio.currentTime;
    setCurrentTime(nextTime);
    preferencesRef.current.currentTime = nextTime;
    if (Math.abs(nextTime - lastSavedPositionRef.current) >= 4) {
      lastSavedPositionRef.current = nextTime;
      persistPreferences();
    }
  };

  const handleLoadedMetadata = (audio: HTMLAudioElement) => {
    setDuration(audio.duration);
    if (restorePositionRef.current !== null) {
      const savedTime = restorePositionRef.current;
      audio.currentTime = Math.min(savedTime, Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 1) : savedTime);
      setCurrentTime(audio.currentTime);
      preferencesRef.current.currentTime = audio.currentTime;
      lastSavedPositionRef.current = audio.currentTime;
      restorePositionRef.current = null;
    }
  };

  const handleCanPlay = () => {
    setIsBuffering(false);
    if (!continueAfterTrackChangeRef.current) return;
    continueAfterTrackChangeRef.current = false;
    void startPlayback();
  };

  const handleToggleFloatingPlayer = async () => {
    if (floatingPlayer) {
      floatingPlayer.window.close();
      setFloatingPlayer(null);
      return;
    }

    const pictureInPicture = (window as Window & {
      documentPictureInPicture?: DocumentPictureInPictureApi;
    }).documentPictureInPicture;
    if (!pictureInPicture) {
      setFloatingError(t.quranFloatUnavailable);
      return;
    }

    setFloatingError('');
    let pipWindow: Window | null = null;
    try {
      pipWindow = await pictureInPicture.requestWindow({ width: 420, height: 300 });
      const pipDocument = pipWindow.document;
      pipDocument.title = t.quranMiniPlayer;
      pipDocument.documentElement.lang = language;
      pipDocument.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
      pipDocument.body.style.margin = '0';
      pipDocument.body.style.background = '#102d28';

      document.querySelectorAll('style, link[rel="stylesheet"]').forEach((styleNode) => {
        pipDocument.head.appendChild(styleNode.cloneNode(true));
      });

      const pipStyle = pipDocument.createElement('style');
      pipStyle.textContent = '.quran-pip-root{box-sizing:border-box;min-height:100vh;padding:12px;background:#102d28}.quran-pip-root *{box-sizing:border-box}';
      pipDocument.head.appendChild(pipStyle);

      const container = pipDocument.createElement('div');
      pipDocument.body.appendChild(container);
      pipWindow.addEventListener('pagehide', () => {
        setFloatingPlayer((current) => current?.window === pipWindow ? null : current);
      }, { once: true });
      setFloatingPlayer({ window: pipWindow, container });
    } catch (error) {
      if (pipWindow && !pipWindow.closed) pipWindow.close();
      console.error('Unable to open the Quran floating player.', error);
      setFloatingError(t.quranFloatError);
    }
  };

  const hideMiniPlayer = () => {
    setIsMiniPlayerHidden(true);
    if (floatingPlayer) {
      floatingPlayer.window.close();
      setFloatingPlayer(null);
    }
  };

  const toggleMiniPlayerVisibility = () => {
    if (isMiniPlayerHidden) {
      setIsMiniPlayerHidden(false);
    } else {
      hideMiniPlayer();
    }
  };

  const handleMiniPlayerPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !miniPlayerRef.current) return;
    const bounds = miniPlayerRef.current.getBoundingClientRect();
    miniPlayerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: bounds.left,
      startTop: bounds.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMiniPlayerPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = miniPlayerDragRef.current;
    const player = miniPlayerRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !player) return;
    const bounds = player.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - bounds.width - 8);
    const maxTop = Math.max(8, window.innerHeight - bounds.height - 8);
    setMiniPlayerPosition({
      left: Math.min(maxLeft, Math.max(8, drag.startLeft + event.clientX - drag.startX)),
      top: Math.min(maxTop, Math.max(8, drag.startTop + event.clientY - drag.startY)),
    });
  };

  const handleMiniPlayerPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (miniPlayerDragRef.current?.pointerId !== event.pointerId) return;
    miniPlayerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const favoriteReciters = reciters.filter((reciter) => favoriteReciterIds.includes(reciter.id));
  const favoriteSurahs = (visibleCatalog?.surahs || []).filter((surah) => favoriteSurahIds.includes(surah.id));
  const showMiniPlayer = !isActive && hasPlayed && !isMiniPlayerHidden;
  const miniPlayerContent = (
    <aside
      ref={miniPlayerRef}
      className="quran-mini-player"
      aria-label={t.quranMiniPlayer}
      style={floatingPlayer
        ? { position: 'relative', left: 'auto', bottom: 'auto', transform: 'none', width: '100%' }
        : miniPlayerPosition
          ? { left: `${miniPlayerPosition.left}px`, top: `${miniPlayerPosition.top}px`, bottom: 'auto', transform: 'none' }
          : undefined}
    >
      <div className="quran-mini-player-heading">
        <div
          className="quran-mini-drag-handle"
          title={t.quranDragPlayer}
          onPointerDown={floatingPlayer ? undefined : handleMiniPlayerPointerDown}
          onPointerMove={floatingPlayer ? undefined : handleMiniPlayerPointerMove}
          onPointerUp={floatingPlayer ? undefined : handleMiniPlayerPointerUp}
          onPointerCancel={floatingPlayer ? undefined : handleMiniPlayerPointerUp}
        >
          <div className="quran-mini-cover" aria-hidden="true"><BookOpen size={19} /></div>
          <div className="quran-mini-track">
            <span>{isPlaying ? t.quranNowPlaying : resumeAvailable ? t.quranResumeHint : t.quranMiniPlayer}</span>
            <strong>{selectedSurah?.name || t.quranLoading}</strong>
            <small>{selectedReciter?.name || ''}</small>
          </div>
        </div>
        <button type="button" className="quran-mini-open" onClick={onOpenLibrary} aria-label={t.quranOpenLibrary} title={t.quranOpenLibrary}>
          <BookOpen size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="quran-mini-float"
          onClick={() => void handleToggleFloatingPlayer()}
          aria-label={floatingPlayer ? t.quranExitFloatPlayer : t.quranFloatPlayer}
          title={floatingPlayer ? t.quranExitFloatPlayer : t.quranFloatPlayer}
          aria-pressed={Boolean(floatingPlayer)}
        >
          <ExternalLink size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="quran-mini-close"
          onClick={hideMiniPlayer}
          aria-label={t.quranHideMiniPlayer}
          title={t.quranHideMiniPlayer}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {reciters.length > 0 && selectedReciter && selectedSurah && (
        <div className="quran-mini-selects">
          <label>
            <span className="sr-only">{t.quranReciter}</span>
            <select
              aria-label={t.quranReciter}
              value={selectedReciter.id}
              onChange={(event) => {
                const nextReciter = reciters.find((reciter) => reciter.id === Number(event.target.value));
                if (nextReciter) selectReciter(nextReciter);
              }}
            >
              {reciters.map((reciter) => <option key={reciter.id} value={reciter.id}>{reciter.name}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">{t.quranSurah}</span>
            <select
              aria-label={t.quranSurah}
              value={selectedSurah.id}
              onChange={(event) => selectFavoriteSurah(Number(event.target.value))}
            >
              {availableSurahs.map((surah) => <option key={surah.id} value={surah.id}>{surah.name}</option>)}
            </select>
          </label>
        </div>
      )}
      {storageError && <p className="quran-mini-error" role="alert">{storageError}</p>}
      {playbackError && <p className="quran-mini-error" role="alert">{playbackError}</p>}
      {floatingError && <p className="quran-mini-error" role="alert">{floatingError}</p>}
      <input
        className="quran-mini-progress"
        type="range"
        min="0"
        max={duration || 1}
        step="1"
        value={Math.min(currentTime, duration || 1)}
        aria-label={t.quranPlaybackProgress}
        style={{ background: `linear-gradient(to right, #d6bd78 ${progress}%, rgba(255,255,255,.16) ${progress}%)` }}
        onChange={(event) => {
          const nextTime = Number(event.target.value);
          if (audioRef.current) audioRef.current.currentTime = nextTime;
          setCurrentTime(nextTime);
          preferencesRef.current.currentTime = nextTime;
          persistPreferences();
        }}
        disabled={!audioUrl || duration <= 0}
      />
      <div className="quran-mini-footer">
        <span dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <div className="quran-mini-controls">
          <button type="button" onClick={() => selectSurahByOffset(-1)} disabled={currentSurahIndex <= 0} aria-label={t.quranPreviousSurah}>
            <SkipBack size={17} aria-hidden="true" />
          </button>
          <button type="button" className="quran-mini-play" onClick={() => void handlePlayPause()} disabled={!audioUrl} aria-label={isPlaying || isBuffering ? t.quranPause : t.quranPlay}>
            {isBuffering ? <Loader2 className="quran-spin" size={18} aria-hidden="true" /> : isPlaying ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => selectSurahByOffset(1)} disabled={currentSurahIndex < 0 || currentSurahIndex >= availableSurahs.length - 1} aria-label={t.quranNextSurah}>
            <SkipForward size={17} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className={`quran-mini-favorite ${selectedSurah && favoriteSurahIds.includes(selectedSurah.id) ? 'is-active' : ''}`}
          onClick={toggleFavoriteSurah}
          aria-label={selectedSurah && favoriteSurahIds.includes(selectedSurah.id) ? t.quranRemoveFavoriteSurah : t.quranAddFavoriteSurah}
          aria-pressed={Boolean(selectedSurah && favoriteSurahIds.includes(selectedSurah.id))}
        >
          <Star size={17} fill={selectedSurah && favoriteSurahIds.includes(selectedSurah.id) ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );

  return (
    <>
    <audio
      ref={audioRef}
      className="quran-audio-element"
      src={audioUrl || undefined}
      preload="none"
      onPlay={() => {
        setIsPlaying(true);
        setIsBuffering(false);
        preferencesRef.current.wasPlaying = true;
      }}
      onPause={() => {
        setIsPlaying(false);
        setIsBuffering(false);
        preferencesRef.current.wasPlaying = false;
      }}
      onWaiting={() => setIsBuffering(true)}
      onCanPlay={handleCanPlay}
      onLoadedMetadata={(event) => handleLoadedMetadata(event.currentTarget)}
      onDurationChange={(event) => setDuration(event.currentTarget.duration)}
      onTimeUpdate={(event) => handleTimeUpdate(event.currentTarget)}
      onEnded={() => {
        setIsPlaying(false);
        setCurrentTime(0);
        preferencesRef.current.currentTime = 0;
        lastSavedPositionRef.current = 0;
        preferencesRef.current.wasPlaying = false;
        persistPreferences();
      }}
      onError={() => {
        continueAfterTrackChangeRef.current = false;
        preferencesRef.current.wasPlaying = false;
        setIsPlaying(false);
        setIsBuffering(false);
        setPlaybackError(t.quranPlaybackError);
      }}
    />
    <section
      className="quran-library w-full max-w-3xl mb-6"
      aria-labelledby="quran-library-title"
      hidden={!isActive}
    >
      <header className="quran-hero">
        <div className="quran-hero-orbit quran-hero-orbit-one" aria-hidden="true" />
        <div className="quran-hero-orbit quran-hero-orbit-two" aria-hidden="true" />
        <div className="quran-hero-content">
          <div className="quran-hero-icon" aria-hidden="true">
            <BookOpen size={29} strokeWidth={1.6} />
          </div>
          <div className="quran-hero-copy">
            <span className="quran-eyebrow">{t.quranEyebrow}</span>
            <h2 id="quran-library-title">{t.quranTitle}</h2>
            <p>{t.quranSubtitle}</p>
          </div>
          <span className="quran-online-badge">
            <Wifi size={14} aria-hidden="true" />
            {t.quranOnlineOnly}
          </span>
        </div>
      </header>

      <div className="quran-library-body">
        <div className="quran-source-note">
          <span className="quran-source-icon"><Headphones size={17} aria-hidden="true" /></span>
          <p>{t.quranStreamNote}</p>
        </div>

        {isLoading && !visibleCatalog && (
          <div className="quran-state-card" role="status" aria-live="polite">
            <Loader2 className="quran-spin" size={25} aria-hidden="true" />
            <span>{t.quranLoading}</span>
          </div>
        )}

        {loadError && !visibleCatalog && (
          <div className="quran-state-card quran-error-card" role="alert">
            <div>
              <strong>{t.quranLoadError}</strong>
              <p>{t.quranOffline}</p>
            </div>
            <button type="button" className="quran-retry-button" onClick={() => setRetryCount((count) => count + 1)}>
              <RotateCcw size={15} aria-hidden="true" />
              {t.quranRetry}
            </button>
          </div>
        )}

        {visibleCatalog && (
          <>
            {storageError && <p className="quran-storage-error" role="alert">{storageError}</p>}
            <div className="quran-library-grid">
              <div className="quran-select-card">
                <div className="quran-section-heading">
                  <span className="quran-section-index">01</span>
                  <div>
                    <h3>{t.quranChooseReciter}</h3>
                    <p>{t.quranReciterHint}</p>
                  </div>
                  <button
                    ref={favoritesTriggerRef}
                    type="button"
                    className="quran-favorites-trigger"
                    aria-label={`${t.quranFavorites} (${favoriteReciterIds.length + favoriteSurahIds.length})`}
                    aria-expanded={isFavoritesOpen}
                    aria-controls="quran-favorites-panel"
                    onClick={() => setIsFavoritesOpen((isOpen) => !isOpen)}
                    title={t.quranFavorites}
                  >
                    <Star size={16} aria-hidden="true" />
                    <span>{favoriteReciterIds.length + favoriteSurahIds.length}</span>
                  </button>
                </div>

                <div
                  className="quran-reciter-search"
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                      setIsReciterSearchOpen(false);
                    }
                  }}
                >
                  <label className="quran-field-label" htmlFor="quran-reciter-search">{t.quranSearchReciter}</label>
                  <div className="quran-search-field">
                    <Search size={17} aria-hidden="true" />
                    <input
                      id="quran-reciter-search"
                      type="search"
                      value={reciterSearch}
                      onChange={(event) => setReciterSearch(event.target.value)}
                      onFocus={() => setIsReciterSearchOpen(true)}
                      placeholder={t.quranSearchPlaceholder}
                      autoComplete="off"
                      role="combobox"
                      aria-expanded={isReciterSearchOpen}
                      aria-controls="quran-reciter-results"
                      aria-autocomplete="list"
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          setReciterSearch('');
                          setIsReciterSearchOpen(false);
                        }
                      }}
                    />
                  </div>
                  {isReciterSearchOpen && (
                    <div id="quran-reciter-results" className="quran-reciter-results" role="listbox" aria-label={t.quranReciter}>
                      {filteredReciters.length > 0
                        ? filteredReciters.map((reciter) => (
                        <button
                          key={reciter.id}
                          type="button"
                          className="quran-reciter-result"
                          role="option"
                          aria-selected={selectedReciter?.id === reciter.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectReciter(reciter)}
                        >
                          <span className="quran-reciter-result-avatar" aria-hidden="true">{reciter.name.slice(0, 1)}</span>
                          <span>{reciter.name}</span>
                          {selectedReciter?.id === reciter.id && <span className="quran-reciter-result-current">{t.quranSelected}</span>}
                        </button>
                      ))
                        : <p className="quran-empty-note">{t.quranNoReciters}</p>}
                    </div>
                  )}
                </div>

                <label className="quran-field-label" htmlFor="quran-moshaf">{t.quranRecitation}</label>
                <select
                  id="quran-moshaf"
                  className="quran-select"
                  value={selectedMoshaf?.id ?? ''}
                  onChange={(event) => {
                    const nextMoshaf = moshafOptions.find((moshaf) => moshaf.id === Number(event.target.value));
                    if (!nextMoshaf || nextMoshaf.id === selectedMoshaf?.id) return;
                    prepareTrackChange();
                    audioTrackRef.current = null;
                    setSelectedMoshafId(nextMoshaf.id);
                    setSelectedSurahId(nextMoshaf.surahIds[0] ?? null);
                  }}
                >
                  {moshafOptions.map((moshaf) => (
                    <option key={moshaf.id} value={moshaf.id}>{moshaf.name}</option>
                  ))}
                </select>
              </div>

              <div className="quran-select-card quran-surah-card">
                <div className="quran-section-heading">
                  <span className="quran-section-index">02</span>
                  <div>
                    <h3>{t.quranChooseSurah}</h3>
                    <p>{t.quranSurahHint}</p>
                  </div>
                </div>
                <label className="quran-field-label" htmlFor="quran-surah">{t.quranSurah}</label>
                <select
                  id="quran-surah"
                  className="quran-select quran-surah-select"
                  value={selectedSurah?.id ?? ''}
                  onChange={(event) => selectSurah(Number(event.target.value))}
                >
                  {availableSurahs.map((surah) => (
                    <option key={surah.id} value={surah.id}>{String(surah.id).padStart(2, '0')} · {surah.name}</option>
                  ))}
                </select>
                {availableSurahs.length === 0 && <p className="quran-empty-note">{t.quranNoSurahs}</p>}

                <div className="quran-reciter-summary">
                  <div className="quran-reciter-avatar" aria-hidden="true">
                    {selectedReciter?.name.slice(0, 1) || <BookOpen size={19} />}
                  </div>
                  <div className="quran-reciter-summary-copy">
                    <span>{t.quranSelectedReciter}</span>
                    <strong>{selectedReciter?.name || t.quranNoReciters}</strong>
                  </div>
                    <button
                      type="button"
                      className={`quran-favorite-toggle ${selectedReciter && favoriteReciterIds.includes(selectedReciter.id) ? 'is-active' : ''}`}
                      aria-label={selectedReciter && favoriteReciterIds.includes(selectedReciter.id) ? t.quranRemoveFavoriteReciter : t.quranAddFavoriteReciter}
                      aria-pressed={Boolean(selectedReciter && favoriteReciterIds.includes(selectedReciter.id))}
                      title={selectedReciter && favoriteReciterIds.includes(selectedReciter.id) ? t.quranRemoveFavoriteReciter : t.quranAddFavoriteReciter}
                      onClick={toggleFavoriteReciter}
                    >
                      <Star size={17} fill={selectedReciter && favoriteReciterIds.includes(selectedReciter.id) ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                  <span className="quran-surah-count">
                    {availableSurahs.length} {t.quranSurahCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="quran-player-card">
              <div className="quran-player-topline">
                <div className="quran-player-cover" aria-hidden="true">
                  <BookOpen size={25} strokeWidth={1.6} />
                </div>
                <div className="quran-player-title">
                  <span>{isPlaying ? t.quranNowPlaying : t.quranReadyToListen}</span>
                  <strong>{selectedSurah?.name || t.quranChooseSurah}</strong>
                  <small>{selectedReciter?.name || ''}</small>
                </div>
                <button
                  type="button"
                  className={`quran-favorite-toggle ${selectedSurah && favoriteSurahIds.includes(selectedSurah.id) ? 'is-active' : ''}`}
                  aria-label={selectedSurah && favoriteSurahIds.includes(selectedSurah.id) ? t.quranRemoveFavoriteSurah : t.quranAddFavoriteSurah}
                  aria-pressed={Boolean(selectedSurah && favoriteSurahIds.includes(selectedSurah.id))}
                  title={selectedSurah && favoriteSurahIds.includes(selectedSurah.id) ? t.quranRemoveFavoriteSurah : t.quranAddFavoriteSurah}
                  onClick={toggleFavoriteSurah}
                >
                  <Star size={17} fill={selectedSurah && favoriteSurahIds.includes(selectedSurah.id) ? 'currentColor' : 'none'} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="quran-favorite-toggle"
                  onClick={() => void handleToggleFloatingPlayer()}
                  aria-label={floatingPlayer ? t.quranExitFloatPlayer : t.quranFloatPlayer}
                  title={floatingPlayer ? t.quranExitFloatPlayer : t.quranFloatPlayer}
                  aria-pressed={Boolean(floatingPlayer)}
                >
                  <ExternalLink size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="quran-favorite-toggle"
                  onClick={toggleMiniPlayerVisibility}
                  aria-label={isMiniPlayerHidden ? t.quranShowMiniPlayer : t.quranHideMiniPlayer}
                  title={isMiniPlayerHidden ? t.quranShowMiniPlayer : t.quranHideMiniPlayer}
                  aria-pressed={!isMiniPlayerHidden}
                >
                  {isMiniPlayerHidden
                    ? <Eye size={17} aria-hidden="true" />
                    : <EyeOff size={17} aria-hidden="true" />}
                </button>
                <div className={`quran-live-indicator ${isPlaying ? 'is-playing' : ''}`} aria-hidden="true">
                  <i /><i /><i /><i />
                </div>
              </div>

              <label className="sr-only" htmlFor="quran-progress">{t.quranPlaybackProgress}</label>
              <input
                id="quran-progress"
                className="quran-progress"
                type="range"
                min="0"
                max={duration || 1}
                step="1"
                value={Math.min(currentTime, duration || 1)}
                style={{
                  background: `linear-gradient(to right, #d6bd78 ${progress}%, rgba(255, 255, 255, 0.19) ${progress}%)`,
                }}
                onChange={(event) => {
                  const nextTime = Number(event.target.value);
                  if (audioRef.current) audioRef.current.currentTime = nextTime;
                  setCurrentTime(nextTime);
                  preferencesRef.current.currentTime = nextTime;
                  persistPreferences();
                }}
                disabled={!audioUrl || duration <= 0}
              />
              <div className="quran-time-row" dir="ltr">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="quran-controls-row">
                <button
                  type="button"
                  className="quran-skip-button"
                  aria-label={t.quranPreviousSurah}
                  title={t.quranPreviousSurah}
                  disabled={currentSurahIndex <= 0}
                  onClick={() => selectSurahByOffset(-1)}
                >
                  <SkipBack size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="quran-play-button"
                  aria-label={isPlaying || isBuffering ? t.quranPause : t.quranPlay}
                  onClick={() => void handlePlayPause()}
                  disabled={!audioUrl}
                >
                  {isBuffering
                    ? <Loader2 className="quran-spin" size={22} aria-hidden="true" />
                    : isPlaying
                      ? <Pause size={22} fill="currentColor" aria-hidden="true" />
                      : <Play size={22} fill="currentColor" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="quran-skip-button"
                  aria-label={t.quranNextSurah}
                  title={t.quranNextSurah}
                  disabled={currentSurahIndex < 0 || currentSurahIndex >= availableSurahs.length - 1}
                  onClick={() => selectSurahByOffset(1)}
                >
                  <SkipForward size={20} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="quran-stop-button"
                  aria-label={t.quranStop}
                  title={t.quranStop}
                  disabled={!audioUrl}
                  onClick={stopPlayback}
                >
                  <RotateCcw size={17} aria-hidden="true" />
                </button>
                <label className="quran-volume-control" title={t.quranVolume}>
                  <Volume2 size={17} aria-hidden="true" />
                  <span className="sr-only">{t.quranVolume}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(event) => setVolume(Number(event.target.value))}
                    aria-label={t.quranVolume}
                  />
                </label>
              </div>

              {playbackError && (
                <p className="quran-playback-error" role="alert">{playbackError} {t.quranOffline}</p>
              )}
              {floatingError && <p className="quran-playback-error" role="alert">{floatingError}</p>}
            </div>
            {resumeAvailable && !isPlaying && (
              <p className="quran-resume-note" role="status">{t.quranResumeHint}</p>
            )}
          </>
        )}

        <footer className="quran-attribution">
          <span>{t.quranSourceLabel}</span>
          <a href={PROVIDER_URL} target="_blank" rel="noopener noreferrer">
            MP3Quran
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </section>
    {isFavoritesOpen && isActive && (
      <>
        <button
          type="button"
          className="quran-favorites-backdrop"
          aria-label={t.quranCloseFavorites}
          onClick={() => setIsFavoritesOpen(false)}
        />
        <aside
          ref={favoritesPanelRef}
          id="quran-favorites-panel"
          className="quran-favorites-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quran-favorites-title"
          tabIndex={-1}
        >
          <div className="quran-favorites-panel-heading">
            <div>
              <span><Star size={16} aria-hidden="true" /> {t.quranFavorites}</span>
              <h3 id="quran-favorites-title">{t.quranFavoriteReciters} · {t.quranFavoriteSurahs}</h3>
            </div>
            <button type="button" onClick={() => setIsFavoritesOpen(false)} aria-label={t.quranCloseFavorites}>
              <X size={19} aria-hidden="true" />
            </button>
          </div>
          {favoriteReciters.length === 0 && favoriteSurahs.length === 0
            ? <p className="quran-favorites-empty">{t.quranNoFavorites}</p>
            : (
              <div className="quran-favorites-groups">
                {favoriteReciters.length > 0 && (
                  <div className="quran-favorite-group">
                    <span>{t.quranFavoriteReciters}</span>
                    <div className="quran-favorite-chips">
                      {favoriteReciters.map((reciter) => (
                        <button
                          key={reciter.id}
                          type="button"
                          className={`quran-favorite-chip ${selectedReciter?.id === reciter.id ? 'is-selected' : ''}`}
                          onClick={() => selectReciter(reciter)}
                        >
                          <span aria-hidden="true">{reciter.name.slice(0, 1)}</span>
                          {reciter.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {favoriteSurahs.length > 0 && (
                  <div className="quran-favorite-group">
                    <span>{t.quranFavoriteSurahs}</span>
                    <div className="quran-favorite-chips">
                      {favoriteSurahs.map((surah) => (
                        <button
                          key={surah.id}
                          type="button"
                          className={`quran-favorite-chip ${selectedSurah?.id === surah.id ? 'is-selected' : ''}`}
                          onClick={() => selectFavoriteSurah(surah.id)}
                        >
                          <span aria-hidden="true">{String(surah.id).padStart(2, '0')}</span>
                          {surah.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
        </aside>
      </>
    )}
    {floatingPlayer && !isMiniPlayerHidden && createPortal(
      <div className="quran-pip-root">{miniPlayerContent}</div>,
      floatingPlayer.container,
    )}
    {showMiniPlayer && !floatingPlayer && miniPlayerContent}
    </>
  );
}
