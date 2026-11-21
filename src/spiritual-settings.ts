export const SPIRITUAL_SETTINGS_KEY = 'pomodoro_spiritual_settings';

export type ReminderKind = 'quran' | 'dua' | 'istighfar' | 'salawat';
export type ReminderInterval = 'adaptive' | 5 | 10 | 15 | 20;
export type PrayerReminderMode = 'off' | 'notice' | 'pause';

export interface SpiritualPreferences {
  islamicToolsEnabled: boolean;
  remindersEnabled: boolean;
  reminderInterval: ReminderInterval;
  reminderKinds: ReminderKind[];
  reminderTone: boolean;
  reminderSpeech: boolean;
  reminderAudioVersion?: 2;
  prayerMode: PrayerReminderMode;
  prayerCountryCode: string;
  prayerRegionCode: string;
  prayerRegionName: string;
  prayerPlaceId: number | null;
  prayerCity: string;
  prayerLatitude: number | null;
  prayerLongitude: number | null;
  prayerTimezone: string;
  prayerMethod: number;
  prayerIqamaEnabled: boolean;
  prayerSpeech?: boolean;
  prayerAudioVersion?: 2;
}

const reminderKinds: ReminderKind[] = ['quran', 'dua', 'istighfar', 'salawat'];
const prayerModes: PrayerReminderMode[] = ['off', 'notice', 'pause'];
const prayerMethods = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

export const DEFAULT_SPIRITUAL_PREFERENCES: SpiritualPreferences = {
  islamicToolsEnabled: false,
  remindersEnabled: false,
  reminderInterval: 'adaptive',
  reminderKinds,
  reminderTone: false,
  reminderSpeech: false,
  reminderAudioVersion: 2,
  prayerMode: 'off',
  prayerCountryCode: '',
  prayerRegionCode: '',
  prayerRegionName: '',
  prayerPlaceId: null,
  prayerCity: '',
  prayerLatitude: null,
  prayerLongitude: null,
  prayerTimezone: '',
  prayerMethod: 3,
  prayerIqamaEnabled: false,
  prayerSpeech: false,
  prayerAudioVersion: 2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadSpiritualPreferences(): SpiritualPreferences {
  const existingFaithPreferences = localStorage.getItem('pomodoro_quran_preferences') !== null ||
    localStorage.getItem('pomodoro_favorite_prayers') !== null;
  const defaults = { ...DEFAULT_SPIRITUAL_PREFERENCES, islamicToolsEnabled: existingFaithPreferences };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(SPIRITUAL_SETTINGS_KEY) || 'null');
    if (!isRecord(saved)) return defaults;
    const interval = saved.reminderInterval;
    const reminderInterval: ReminderInterval = interval === 5 || interval === 10 || interval === 15 || interval === 20
      ? interval
      : 'adaptive';
    const savedKinds = Array.isArray(saved.reminderKinds)
      ? [...new Set(saved.reminderKinds.filter((kind): kind is ReminderKind =>
        typeof kind === 'string' && reminderKinds.includes(kind as ReminderKind)))]
      : defaults.reminderKinds;
    const hasCurrentReminderAudioPreference = saved.reminderAudioVersion === 2;
    const hasCurrentPrayerAudioPreference = saved.prayerAudioVersion === 2;
    const hasPrayerPlace = Number.isSafeInteger(saved.prayerPlaceId) &&
      Number(saved.prayerPlaceId) > 0 &&
      typeof saved.prayerLatitude === 'number' &&
      saved.prayerLatitude >= -90 &&
      saved.prayerLatitude <= 90 &&
      typeof saved.prayerLongitude === 'number' &&
      saved.prayerLongitude >= -180 &&
      saved.prayerLongitude <= 180 &&
      typeof saved.prayerTimezone === 'string' &&
      saved.prayerTimezone.length > 0;
    return {
      islamicToolsEnabled: saved.islamicToolsEnabled === true,
      remindersEnabled: saved.remindersEnabled === true,
      reminderInterval,
      reminderKinds: savedKinds,
      reminderTone: hasCurrentReminderAudioPreference && saved.reminderTone === true,
      reminderSpeech: hasCurrentReminderAudioPreference && saved.reminderSpeech === true,
      reminderAudioVersion: 2,
      prayerMode: prayerModes.includes(saved.prayerMode as PrayerReminderMode)
        ? saved.prayerMode as PrayerReminderMode
        : 'off',
      prayerCountryCode: typeof saved.prayerCountryCode === 'string' && /^[A-Z]{2}$/.test(saved.prayerCountryCode)
        ? saved.prayerCountryCode
        : '',
      prayerRegionCode: hasPrayerPlace && typeof saved.prayerRegionCode === 'string' ? saved.prayerRegionCode : '',
      prayerRegionName: hasPrayerPlace && typeof saved.prayerRegionName === 'string' ? saved.prayerRegionName : '',
      prayerPlaceId: hasPrayerPlace ? Number(saved.prayerPlaceId) : null,
      prayerCity: hasPrayerPlace && typeof saved.prayerCity === 'string' ? saved.prayerCity.slice(0, 100) : '',
      prayerLatitude: hasPrayerPlace ? Number(saved.prayerLatitude) : null,
      prayerLongitude: hasPrayerPlace ? Number(saved.prayerLongitude) : null,
      prayerTimezone: hasPrayerPlace ? saved.prayerTimezone as string : '',
      prayerMethod: typeof saved.prayerMethod === 'number' && prayerMethods.includes(saved.prayerMethod)
        ? saved.prayerMethod
        : defaults.prayerMethod,
      prayerIqamaEnabled: saved.prayerIqamaEnabled === true,
      prayerSpeech: hasCurrentPrayerAudioPreference && saved.prayerSpeech === true,
      prayerAudioVersion: 2,
    };
  } catch (error) {
    console.error('Unable to load spiritual reminder preferences.', error);
    return defaults;
  }
}

export function isSpiritualPreferences(value: unknown): value is SpiritualPreferences {
  if (!isRecord(value)) return false;
  return typeof value.islamicToolsEnabled === 'boolean' &&
    typeof value.remindersEnabled === 'boolean' &&
    (value.reminderInterval === 'adaptive' || value.reminderInterval === 5 || value.reminderInterval === 10 ||
      value.reminderInterval === 15 || value.reminderInterval === 20) &&
    Array.isArray(value.reminderKinds) &&
    value.reminderKinds.every((kind) => typeof kind === 'string' && reminderKinds.includes(kind as ReminderKind)) &&
    typeof value.reminderTone === 'boolean' &&
    typeof value.reminderSpeech === 'boolean' &&
    (value.reminderAudioVersion === undefined || value.reminderAudioVersion === 2) &&
    prayerModes.includes(value.prayerMode as PrayerReminderMode) &&
    typeof value.prayerCountryCode === 'string' &&
    (value.prayerCountryCode === '' || /^[A-Z]{2}$/.test(value.prayerCountryCode)) &&
    (value.prayerRegionCode === undefined || typeof value.prayerRegionCode === 'string') &&
    (value.prayerRegionName === undefined || typeof value.prayerRegionName === 'string') &&
    (value.prayerPlaceId === undefined || value.prayerPlaceId === null ||
      (Number.isSafeInteger(value.prayerPlaceId) && Number(value.prayerPlaceId) > 0)) &&
    typeof value.prayerCity === 'string' &&
    value.prayerCity.length <= 100 &&
    (value.prayerLatitude === undefined || value.prayerLatitude === null ||
      (typeof value.prayerLatitude === 'number' && value.prayerLatitude >= -90 && value.prayerLatitude <= 90)) &&
    (value.prayerLongitude === undefined || value.prayerLongitude === null ||
      (typeof value.prayerLongitude === 'number' && value.prayerLongitude >= -180 && value.prayerLongitude <= 180)) &&
    (value.prayerTimezone === undefined || typeof value.prayerTimezone === 'string') &&
    typeof value.prayerMethod === 'number' &&
    prayerMethods.includes(value.prayerMethod) &&
    (value.prayerIqamaEnabled === undefined || typeof value.prayerIqamaEnabled === 'boolean') &&
    (value.prayerSpeech === undefined || typeof value.prayerSpeech === 'boolean') &&
    (value.prayerAudioVersion === undefined || value.prayerAudioVersion === 2);
}
