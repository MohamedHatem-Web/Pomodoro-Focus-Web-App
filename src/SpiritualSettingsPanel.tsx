import { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, Clock3, MoonStar, Volume2 } from 'lucide-react';
import { translations, type Language } from './i18n';
import {
  loadPrayerLocationIndex,
  type PrayerLocationIndex,
  type PrayerRegionOption,
} from './prayer-location-data';
import type { PrayerMonthSchedule } from './prayer-times';
import type { PrayerReminderMode, ReminderKind, ReminderInterval, SpiritualPreferences } from './spiritual-settings';

interface SpiritualSettingsPanelProps {
  language: Language;
  preferences: SpiritualPreferences;
  schedule: PrayerMonthSchedule | null;
  prayerLoadState: 'idle' | 'loading' | 'ready' | 'error';
  onChange: (preferences: SpiritualPreferences) => void;
  onLoadPrayerTimes: () => void;
  onTestMindfulReminder: () => void;
  onTestPrayerReminder: () => void;
}

const reminderOptions: { kind: ReminderKind; translationKey: 'reminderQuran' | 'reminderDua' | 'reminderIstighfar' | 'reminderSalawat' }[] = [
  { kind: 'quran', translationKey: 'reminderQuran' },
  { kind: 'dua', translationKey: 'reminderDua' },
  { kind: 'istighfar', translationKey: 'reminderIstighfar' },
  { kind: 'salawat', translationKey: 'reminderSalawat' },
];

const prayerMethods: { id: number; translationKey: 'prayerMethodEgypt' | 'prayerMethodNorthAmerica' | 'prayerMethodMuslimWorldLeague' | 'prayerMethodUmmAlQura' | 'prayerMethodKarachi' }[] = [
  { id: 5, translationKey: 'prayerMethodEgypt' },
  { id: 2, translationKey: 'prayerMethodNorthAmerica' },
  { id: 3, translationKey: 'prayerMethodMuslimWorldLeague' },
  { id: 4, translationKey: 'prayerMethodUmmAlQura' },
  { id: 1, translationKey: 'prayerMethodKarachi' },
];

type GetStatesOfCountry = typeof import('localized-countries-states').getStatesOfCountry;

function normalizeSubdivisionName(name: string): string {
  return name.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^al\s*/, '')
    .replace(/ou/g, 'u')
    .replace(/[^a-z0-9]/g, '');
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const oldValue = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = oldValue;
    }
  }
  return row[right.length];
}

function localizedSubdivisionNames(
  regions: PrayerRegionOption[],
  language: Language,
  getStatesOfCountry: GetStatesOfCountry | null,
): Map<string, string> {
  const names = new Map<string, string>();
  if (language === 'en' || !getStatesOfCountry || regions.length === 0) return names;

  const countryCode = regions[0].countryCode;
  const englishStates = getStatesOfCountry(countryCode, 'en');
  const localizedStates = new Map(
    getStatesOfCountry(countryCode, language).map((state) => [state.code, state.name]),
  );

  for (const region of regions) {
    const sourceName = normalizeSubdivisionName(region.name);
    const rankedStates = englishStates
      .map((state) => {
        const stateName = normalizeSubdivisionName(state.name);
        const score = 1 - editDistance(sourceName, stateName) / Math.max(sourceName.length, stateName.length);
        return { state, score };
      })
      .sort((left, right) => right.score - left.score);
    const best = rankedStates[0];
    const nextBest = rankedStates[1];
    if (best && best.score >= 0.7 && (!nextBest || best.score - nextBest.score >= 0.12)) {
      const localizedName = localizedStates.get(best.state.code);
      if (localizedName && normalizeSubdivisionName(localizedName) !== normalizeSubdivisionName(best.state.name)) {
        names.set(region.code, localizedName);
      }
    }
  }
  return names;
}

export default function SpiritualSettingsPanel({
  language,
  preferences,
  schedule,
  prayerLoadState,
  onChange,
  onLoadPrayerTimes,
  onTestMindfulReminder,
  onTestPrayerReminder,
}: SpiritualSettingsPanelProps) {
  const t = translations[language];
  const [locationIndex, setLocationIndex] = useState<PrayerLocationIndex | null>(null);
  const [locationIndexError, setLocationIndexError] = useState(false);
  const [regionLocalizationError, setRegionLocalizationError] = useState(false);
  const [getStatesOfCountry, setGetStatesOfCountry] = useState<GetStatesOfCountry | null>(null);
  const countriesList = useMemo(() => {
    const names = new Intl.DisplayNames([language], { type: 'region' });
    const availableCodes = new Set(locationIndex?.regions.map((region) => region.countryCode) ?? []);
    return [...availableCodes]
      .map((code) => ({ code, name: names.of(code) || code }))
      .sort((left, right) => left.name.localeCompare(right.name, language));
  }, [language, locationIndex]);
  const availableRegions = useMemo(() => {
    if (!locationIndex || !preferences.prayerCountryCode) return [];
    return locationIndex.regions
      .filter((region) => region.countryCode === preferences.prayerCountryCode);
  }, [locationIndex, preferences.prayerCountryCode]);
  const localizedRegionNames = useMemo(
    () => localizedSubdivisionNames(availableRegions, language, getStatesOfCountry),
    [availableRegions, getStatesOfCountry, language],
  );
  const regionsForCountry = useMemo(
    () => [...availableRegions].sort((left, right) =>
      (localizedRegionNames.get(left.code) || left.name).localeCompare(
        localizedRegionNames.get(right.code) || right.name,
        language,
      )),
    [availableRegions, language, localizedRegionNames],
  );
  const hasRegionOptions = regionsForCountry.length > 0;
  const update = (patch: Partial<SpiritualPreferences>) => onChange({ ...preferences, ...patch });
  const toggleKind = (kind: ReminderKind) => {
    const reminderKinds = preferences.reminderKinds.includes(kind)
      ? preferences.reminderKinds.filter((item) => item !== kind)
      : [...preferences.reminderKinds, kind];
    update({ reminderKinds });
  };
  const currentMonth = new Date();
  const scheduleMonth = schedule
    ? new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone, year: 'numeric', month: '2-digit' })
      .formatToParts(currentMonth)
    : [];
  const currentScheduleMonth = `${scheduleMonth.find((part) => part.type === 'year')?.value}-${scheduleMonth.find((part) => part.type === 'month')?.value}`;
  const scheduleIsCurrent = schedule?.month === currentScheduleMonth &&
    schedule.location.countryCode === preferences.prayerCountryCode &&
    schedule.location.geonameId === preferences.prayerPlaceId &&
    schedule.method === preferences.prayerMethod;
  const selectedCountry = countriesList.find((country) => country.code === preferences.prayerCountryCode);
  const countryName = selectedCountry?.name || '';
  const selectedRegion = regionsForCountry.find((region) => region.code === preferences.prayerRegionCode);
  const hasUntranslatedRegions = language === 'ar' && getStatesOfCountry !== null &&
    regionsForCountry.some((region) => region.code !== '00' && !localizedRegionNames.has(region.code));
  const prayerMode = preferences.prayerMode;

  useEffect(() => {
    let active = true;
    loadPrayerLocationIndex()
      .then((index) => {
        if (active) setLocationIndex(index);
      })
      .catch((error: unknown) => {
        console.error('Unable to load offline prayer location choices.', error);
        if (active) setLocationIndexError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedRegion) return;
    const alreadyUsesRegionLocation = preferences.prayerLocationVersion === 2 &&
      preferences.prayerPlaceId === selectedRegion.id &&
      preferences.prayerCity === selectedRegion.name &&
      preferences.prayerLatitude === selectedRegion.latitude &&
      preferences.prayerLongitude === selectedRegion.longitude &&
      preferences.prayerTimezone === selectedRegion.timezone;
    if (alreadyUsesRegionLocation) return;

    onChange({
      ...preferences,
      prayerPlaceId: selectedRegion.id,
      prayerCity: selectedRegion.name,
      prayerLatitude: selectedRegion.latitude,
      prayerLongitude: selectedRegion.longitude,
      prayerTimezone: selectedRegion.timezone,
      prayerLocationVersion: 2,
    });
  }, [onChange, preferences, selectedRegion]);

  useEffect(() => {
    if (language === 'en' || getStatesOfCountry) return;
    let active = true;
    import('localized-countries-states')
      .then((module) => {
        if (active) {
          setGetStatesOfCountry(() => module.getStatesOfCountry);
          setRegionLocalizationError(false);
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to load localized subdivision names.', error);
        if (active) setRegionLocalizationError(true);
      });
    return () => {
      active = false;
    };
  }, [getStatesOfCountry, language]);

  return (
    <section className="spiritual-settings-panel" aria-labelledby="spiritual-settings-title">
      <div className="settings-section-heading">
        <span className="settings-section-icon"><MoonStar size={18} aria-hidden="true" /></span>
        <div>
          <h3 id="spiritual-settings-title">{t.spiritualSettings}</h3>
          <p>{t.firstRunIslamicToolsHint}</p>
        </div>
      </div>

      <label className="settings-toggle-row">
        <span className="settings-toggle-copy">
          <span className="settings-toggle-icon"><BookOpen size={17} aria-hidden="true" /></span>
          <span className="settings-toggle-text">
            <strong>{t.showIslamicTools}</strong>
            <small>{t.firstRunIslamicToolsHint}</small>
          </span>
        </span>
        <input
          type="checkbox"
          checked={preferences.islamicToolsEnabled}
          onChange={(event) => update({ islamicToolsEnabled: event.target.checked })}
        />
      </label>

      <fieldset className="settings-subsection" disabled={!preferences.islamicToolsEnabled}>
        <legend>
          <span className="settings-legend-icon"><Bell size={16} aria-hidden="true" /></span>
          <span>{t.focusRemindersHeading}</span>
        </legend>
        <label className="settings-toggle-row">
          <span>
            <strong>{t.enableReminders}</strong>
            <small>{t.reminderDisplayHint}</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.remindersEnabled}
            onChange={(event) => update({ remindersEnabled: event.target.checked })}
          />
        </label>

        <label className="settings-field">
          <span>{t.reminderInterval}</span>
          <select
            value={preferences.reminderInterval}
            disabled={!preferences.remindersEnabled}
            onChange={(event) => update({ reminderInterval: event.target.value === 'adaptive' ? 'adaptive' : Number(event.target.value) as ReminderInterval })}
          >
            <option value="adaptive">{t.reminderIntervalAdaptive}</option>
            <option value={5}>{t.reminderEvery5}</option>
            <option value={10}>{t.reminderEvery10}</option>
            <option value={15}>{t.reminderEvery15}</option>
            <option value={20}>{t.reminderEvery20}</option>
          </select>
        </label>

        <div className="settings-choice-group">
          <p>{t.reminderContent}</p>
          {reminderOptions.map(({ kind, translationKey }) => (
            <label key={kind} className="settings-choice-row">
              <span>{t[translationKey]}</span>
              <input
                type="checkbox"
                checked={preferences.reminderKinds.includes(kind)}
                disabled={!preferences.remindersEnabled}
                onChange={() => toggleKind(kind)}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          className="settings-test-button"
          disabled={!preferences.remindersEnabled || preferences.reminderKinds.length === 0}
          onClick={onTestMindfulReminder}
        >
          {t.testMindfulReminder}
        </button>

        <label className="settings-toggle-row">
          <span>
            <strong className="settings-option-label"><Volume2 size={16} aria-hidden="true" /> {t.reminderTone}</strong>
          </span>
          <input
            type="checkbox"
            checked={preferences.reminderTone}
            disabled={!preferences.remindersEnabled}
            onChange={(event) => update({ reminderTone: event.target.checked })}
          />
        </label>
        <label className="settings-toggle-row">
          <span>
            <strong className="settings-option-label"><Volume2 size={16} aria-hidden="true" /> {t.reminderSpeech}</strong>
            <small>{t.reminderSpeechHint}</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.reminderSpeech}
            disabled={!preferences.remindersEnabled}
            onChange={(event) => update({ reminderSpeech: event.target.checked })}
          />
        </label>
      </fieldset>

      <fieldset className="settings-subsection" disabled={!preferences.islamicToolsEnabled}>
        <legend>
          <span className="settings-legend-icon"><Clock3 size={16} aria-hidden="true" /></span>
          <span>{t.prayerTimeReminders}</span>
        </legend>
        <label className="settings-field">
          <span>{t.prayerReminderMode}</span>
          <select value={prayerMode} onChange={(event) => update({ prayerMode: event.target.value as PrayerReminderMode })}>
            <option value="off">{t.prayerModeOff}</option>
            <option value="notice">{t.prayerModeNotice}</option>
            <option value="pause">{t.prayerModePause}</option>
          </select>
        </label>
        <label className="settings-toggle-row">
          <span>
            <strong>{t.prayerSpeech}</strong>
            <small>{t.prayerSpeechHint}</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.prayerSpeech === true}
            disabled={prayerMode === 'off'}
            onChange={(event) => update({ prayerSpeech: event.target.checked })}
          />
        </label>
        <p className="settings-helper">
          {t.prayerAudioAttribution}{' '}
          <a href="https://commons.wikimedia.org/wiki/File:The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3" target="_blank" rel="noopener noreferrer">
            {t.prayerAudioSource}
          </a>
        </p>
        <button
          type="button"
          className="settings-test-button"
          disabled={prayerMode === 'off'}
          onClick={onTestPrayerReminder}
        >
          {t.testPrayerReminder}
        </button>
        <p className="settings-helper">{t.prayerLocationHint}</p>
        <p className="settings-helper" role="status" aria-live="polite">
          {locationIndex
            ? t.prayerLocationCount.replace('{count}', locationIndex.regions.length.toLocaleString(language))
            : locationIndexError
              ? t.prayerLocationDataError
              : t.prayerLocationDataLoading}
        </p>
        {regionLocalizationError && language === 'ar' && (
          <p className="settings-helper is-error" role="status">{t.prayerRegionLocalizationError}</p>
        )}
        {language === 'ar' && !getStatesOfCountry && !regionLocalizationError && (
          <p className="settings-helper" role="status">{t.prayerRegionLocalizationLoading}</p>
        )}
        {hasUntranslatedRegions && (
          <p className="settings-helper">{t.prayerRegionLocalizationFallback}</p>
        )}
        <label className="settings-field">
          <span>{t.prayerCountry}</span>
          <select
            value={preferences.prayerCountryCode}
            disabled={!locationIndex}
            onChange={(event) => {
              const countryCode = event.target.value;
              const defaultMethod = countryCode === 'EG'
                ? 5
                : countryCode === 'US' || countryCode === 'CA' ? 2 : preferences.prayerMethod;
              update({
                prayerCountryCode: countryCode,
                prayerRegionCode: '',
                prayerRegionName: '',
                prayerPlaceId: null,
                prayerCity: '',
                prayerLatitude: null,
                prayerLongitude: null,
                prayerTimezone: '',
                prayerLocationVersion: 2,
                prayerMethod: defaultMethod,
              });
            }}
          >
            <option value="">{t.selectCountry}</option>
            {countriesList.map((country) => (
              <option key={country.code} value={country.code}>{country.name}</option>
            ))}
          </select>
        </label>
        {hasRegionOptions && (
          <label className="settings-field">
            <span>{t.prayerRegion}</span>
            <select
              value={preferences.prayerRegionCode}
              onChange={(event) => {
                const region = regionsForCountry.find((item) => item.code === event.target.value);
                update({
                  prayerRegionCode: region?.code ?? '',
                  prayerRegionName: region?.name ?? '',
                  prayerPlaceId: region?.id ?? null,
                  prayerCity: region?.name ?? '',
                  prayerLatitude: region?.latitude ?? null,
                  prayerLongitude: region?.longitude ?? null,
                  prayerTimezone: region?.timezone ?? '',
                  prayerLocationVersion: 2,
                });
              }}
            >
              <option value="">{t.selectRegion}</option>
              {regionsForCountry.map((region) => {
                const label = region.code === '00'
                  ? t.prayerRegionUnspecified
                  : localizedRegionNames.get(region.code) || region.name;
                return <option key={region.code} value={region.code}>{label}</option>;
              })}
            </select>
          </label>
        )}
        <label className="settings-field">
          <span>{t.prayerMethod}</span>
          <select
            value={preferences.prayerMethod}
            onChange={(event) => update({ prayerMethod: Number(event.target.value) })}
          >
            {prayerMethods.map(({ id, translationKey }) => (
              <option key={id} value={id}>{t[translationKey]}</option>
            ))}
          </select>
        </label>
        <p className="settings-privacy-note">{t.prayerTimesPrivacy}</p>
        <p className="settings-privacy-note">{t.prayerCalculationNote}</p>
        <p className="settings-privacy-note">
          {t.prayerLocationAttribution}{' '}
          <a href="https://www.geonames.org" target="_blank" rel="noreferrer">GeoNames</a>
        </p>
        <button
          type="button"
          className="settings-load-prayer-times"
          onClick={onLoadPrayerTimes}
          disabled={prayerLoadState === 'loading' || !preferences.prayerPlaceId || !selectedRegion}
        >
          <BookOpen size={16} aria-hidden="true" />
          {prayerLoadState === 'loading' ? t.prayerTimesLoading : t.prayerLoadTimes}
        </button>
        <p className={`settings-status ${prayerLoadState === 'error' || locationIndexError ? 'is-error' : ''}`} role="status" aria-live="polite">
          {prayerLoadState === 'error'
            ? t.prayerTimesError
            : locationIndexError
              ? t.prayerLocationDataError
              : scheduleIsCurrent
                ? t.prayerTimesReady
                : t.prayerTimesNotReady}
        </p>
        {scheduleIsCurrent && (
          <p className="settings-schedule-meta">
            {countryName}{selectedRegion ? ` · ${localizedRegionNames.get(selectedRegion.code) || selectedRegion.name}` : ''}
          {' · '}{schedule?.timezone}
          </p>
        )}
      </fieldset>
    </section>
  );
}
