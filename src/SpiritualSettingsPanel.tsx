import { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, Clock3, MapPin, MoonStar, Volume2 } from 'lucide-react';
import { translations, type Language } from './i18n';
import {
  loadPrayerLocationIndex,
  type PrayerLocationIndex,
  type PrayerPlaceOption,
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

const MAX_CITY_RESULTS = 200;
const MAX_CITY_OPTIONS = 12;
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
  const [citySearch, setCitySearch] = useState('');
  const [isCityListOpen, setIsCityListOpen] = useState(false);
  const [activeCityIndex, setActiveCityIndex] = useState(-1);
  const countriesList = useMemo(() => {
    const names = new Intl.DisplayNames([language], { type: 'region' });
    const availableCodes = new Set(locationIndex?.places.map((place) => place.countryCode) ?? []);
    return [...availableCodes]
      .map((code) => ({ code, name: names.of(code) || code }))
      .sort((left, right) => left.name.localeCompare(right.name, language));
  }, [language, locationIndex]);
  const availableRegions = useMemo(() => {
    if (!locationIndex || !preferences.prayerCountryCode) return [];
    const availableRegionCodes = new Set(
      locationIndex.places
        .filter((place) => place.countryCode === preferences.prayerCountryCode)
        .map((place) => place.regionCode),
    );
    return locationIndex.regions
      .filter((region) => region.countryCode === preferences.prayerCountryCode && availableRegionCodes.has(region.code));
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
  const placesForSelection = useMemo(() => {
    if (!locationIndex || !preferences.prayerCountryCode) return [];
    return locationIndex.places
      .filter((place) =>
        place.countryCode === preferences.prayerCountryCode &&
        (!hasRegionOptions || place.regionCode === preferences.prayerRegionCode),
      )
      .sort((left, right) => left.name.localeCompare(right.name, language));
  }, [hasRegionOptions, locationIndex, preferences.prayerCountryCode, preferences.prayerRegionCode]);
  const isCitySearchRequired = placesForSelection.length > MAX_CITY_RESULTS;
  const matchingCities = useMemo(() => {
    const query = citySearch.trim().toLocaleLowerCase(language);
    if (query.length < 2) return isCitySearchRequired ? [] : placesForSelection;
    return placesForSelection.filter((place) => place.name.toLocaleLowerCase(language).includes(query));
  }, [citySearch, isCitySearchRequired, language, placesForSelection]);
  const cityOptions = matchingCities.slice(0, MAX_CITY_OPTIONS);
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
  const selectedPlace = locationIndex?.places.find((place) =>
    place.id === preferences.prayerPlaceId &&
    place.countryCode === preferences.prayerCountryCode &&
    (!hasRegionOptions || place.regionCode === preferences.prayerRegionCode),
  );
  const hasUntranslatedRegions = language === 'ar' && getStatesOfCountry !== null &&
    regionsForCountry.some((region) => region.code !== '00' && !localizedRegionNames.has(region.code));
  const prayerMode = preferences.prayerMode;
  const citySearchMessage = isCitySearchRequired && citySearch.trim().length < 2
    ? t.prayerCitySearchHint
    : matchingCities.length > MAX_CITY_OPTIONS
      ? t.prayerCitySearchMore
      : matchingCities.length === 0 && citySearch.trim().length >= 2
        ? t.prayerNoCitiesFound
        : !preferences.prayerPlaceId && cityOptions.length > 0
          ? t.prayerCitySelectHint
          : '';

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

  const selectPlace = (place: PrayerPlaceOption | undefined) => {
    setCitySearch(place?.name ?? '');
    setIsCityListOpen(false);
    setActiveCityIndex(-1);
    if (!place) {
      update({
        prayerPlaceId: null,
        prayerCity: '',
        prayerLatitude: null,
        prayerLongitude: null,
        prayerTimezone: '',
      });
      return;
    }
    update({
      prayerPlaceId: place.id,
      prayerCity: place.name,
      prayerLatitude: place.latitude,
      prayerLongitude: place.longitude,
      prayerTimezone: place.timezone,
    });
  };

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
            ? t.prayerLocationCount.replace('{count}', locationIndex.places.length.toLocaleString(language))
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
              setCitySearch('');
              setIsCityListOpen(false);
              setActiveCityIndex(-1);
              update({
                prayerCountryCode: countryCode,
                prayerRegionCode: '',
                prayerRegionName: '',
                prayerPlaceId: null,
                prayerCity: '',
                prayerLatitude: null,
                prayerLongitude: null,
                prayerTimezone: '',
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
                setCitySearch('');
                setIsCityListOpen(false);
                setActiveCityIndex(-1);
                update({
                  prayerRegionCode: region?.code ?? '',
                  prayerRegionName: region?.name ?? '',
                  prayerPlaceId: null,
                  prayerCity: '',
                  prayerLatitude: null,
                  prayerLongitude: null,
                  prayerTimezone: '',
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
        {preferences.prayerCountryCode && (
          <>
            <label className="settings-field settings-city-field">
              <span>{t.prayerCity}</span>
              <div className="settings-city-combobox">
                <div className="settings-input-with-icon">
                  <MapPin size={16} aria-hidden="true" />
                  <input
                    type="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isCityListOpen && cityOptions.length > 0}
                    aria-controls="prayer-city-options"
                    aria-activedescendant={
                      isCityListOpen && activeCityIndex >= 0
                        ? `prayer-city-option-${cityOptions[activeCityIndex]?.id}`
                        : undefined
                    }
                    maxLength={100}
                    value={citySearch}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCitySearch(value);
                      setIsCityListOpen(true);
                      setActiveCityIndex(-1);
                      if (selectedPlace && value !== selectedPlace.name) {
                        update({
                          prayerPlaceId: null,
                          prayerCity: '',
                          prayerLatitude: null,
                          prayerLongitude: null,
                          prayerTimezone: '',
                        });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' && cityOptions.length > 0) {
                        event.preventDefault();
                        setIsCityListOpen(true);
                        setActiveCityIndex((index) => (index + 1) % cityOptions.length);
                      } else if (event.key === 'ArrowUp' && cityOptions.length > 0) {
                        event.preventDefault();
                        setIsCityListOpen(true);
                        setActiveCityIndex((index) => index <= 0 ? cityOptions.length - 1 : index - 1);
                      } else if (event.key === 'Enter' && isCityListOpen && cityOptions.length > 0) {
                        event.preventDefault();
                        selectPlace(cityOptions[activeCityIndex >= 0 ? activeCityIndex : 0]);
                      } else if (event.key === 'Escape') {
                        setIsCityListOpen(false);
                        setActiveCityIndex(-1);
                      }
                    }}
                    onFocus={() => setIsCityListOpen(true)}
                    onBlur={() => setIsCityListOpen(false)}
                    placeholder={t.prayerCitySearchPlaceholder}
                    disabled={!locationIndex || (hasRegionOptions && !preferences.prayerRegionCode)}
                  />
                </div>
                {isCityListOpen && cityOptions.length > 0 && (
                  <div id="prayer-city-options" className="settings-city-options" role="listbox" aria-label={t.prayerCity}>
                    {cityOptions.map((place, index) => (
                      <button
                        key={place.id}
                        id={`prayer-city-option-${place.id}`}
                        type="button"
                        role="option"
                        aria-selected={preferences.prayerPlaceId === place.id}
                        className={`settings-city-option ${activeCityIndex === index ? 'is-active' : ''}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectPlace(place)}
                      >
                        {place.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <p className="settings-helper" role="status" aria-live="polite">{citySearchMessage}</p>
          </>
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
          disabled={prayerLoadState === 'loading' || !preferences.prayerPlaceId || !selectedPlace}
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
            {preferences.prayerCity ? ` · ${preferences.prayerCity}` : ''} · {schedule?.timezone}
          </p>
        )}
      </fieldset>
    </section>
  );
}
