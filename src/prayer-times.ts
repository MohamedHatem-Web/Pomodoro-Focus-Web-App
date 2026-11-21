export const prayerNames = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;

export type PrayerName = (typeof prayerNames)[number];

export interface PrayerLocation {
  countryCode: string;
  countryName: string;
  city: string;
  regionCode?: string;
  regionName?: string;
  geonameId?: number;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

export interface PrayerDay {
  date: string;
  times: Record<PrayerName, string>;
}

export interface PrayerMonthSchedule {
  location: PrayerLocation;
  method: number;
  month: string;
  timezone: string;
  days: PrayerDay[];
  updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePrayerTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function isPrayerMonthSchedule(value: unknown): value is PrayerMonthSchedule {
  if (!isRecord(value) || typeof value.timezone !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value.timezone });
  } catch {
    return false;
  }
  const location = isRecord(value.location) ? value.location : null;
  const hasCoordinates = location !== null && (
    location.geonameId !== undefined ||
    location.latitude !== undefined ||
    location.longitude !== undefined ||
    location.timezone !== undefined
  );
  const validCoordinates = location !== null &&
    Number.isSafeInteger(location.geonameId) &&
    Number(location.geonameId) > 0 &&
    typeof location.latitude === 'number' &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location.longitude === 'number' &&
    location.longitude >= -180 &&
    location.longitude <= 180 &&
    typeof location.timezone === 'string' &&
    typeof location.regionCode === 'string' &&
    typeof location.regionName === 'string';
  return location !== null &&
    typeof location.countryCode === 'string' &&
    typeof location.countryName === 'string' &&
    typeof location.city === 'string' &&
    (!hasCoordinates || validCoordinates) &&
    Number.isInteger(value.method) &&
    typeof value.month === 'string' &&
    /^\d{4}-\d{2}$/.test(value.month) &&
    typeof value.timezone === 'string' &&
    Array.isArray(value.days) &&
    value.days.length >= 28 &&
    value.days.every((day) => {
      if (!isRecord(day) || typeof day.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !isRecord(day.times)) return false;
      const times = day.times;
      let previousMinutes = -1;
      return prayerNames.every((name) => {
        const time = parsePrayerTime(times[name]);
        if (time === null) return false;
        const [hour, minute] = time.split(':').map(Number);
        const currentMinutes = hour * 60 + minute;
        if (currentMinutes < previousMinutes) return false;
        previousMinutes = currentMinutes;
        return true;
      });
    }) &&
    Number.isFinite(value.updatedAt);
}

export async function fetchPrayerMonth(
  location: PrayerLocation,
  method: number,
  date = new Date(),
): Promise<PrayerMonthSchedule> {
  if (
    typeof location.latitude !== 'number' ||
    typeof location.longitude !== 'number' ||
    !location.timezone ||
    !Number.isSafeInteger(location.geonameId)
  ) {
    throw new Error('Select a city with coordinates before loading prayer times.');
  }
  const requestDate = getPrayerDateTime(date, location.timezone).date;
  const [year, monthNumber] = requestDate.split('-');
  const month = `${year}-${monthNumber}`;
  const query = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    method: String(method),
  });
  const url = `https://api.aladhan.com/v1/calendar/${Number(year)}/${Number(monthNumber)}?${query}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Prayer time service returned ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.code !== 200 || !Array.isArray(payload.data)) {
    throw new Error('Prayer time service returned an unexpected response.');
  }

  const days = payload.data.flatMap((entry: unknown): PrayerDay[] => {
    if (!isRecord(entry)) {
      return [];
    }
    const date = entry.date;
    const timings = entry.timings;
    if (!isRecord(date) || !isRecord(date.gregorian) || !isRecord(timings)) return [];
    const dateKey = parseDate(date.gregorian.date);
    if (!dateKey) return [];
    const times = Object.fromEntries(
      prayerNames.map((name) => [name, parsePrayerTime(timings[name])]),
    ) as Record<PrayerName, string | null>;
    if (prayerNames.some((name) => times[name] === null)) return [];
    return [{ date: dateKey, times: times as Record<PrayerName, string> }];
  });

  const firstDay = payload.data[0];
  const timezone = isRecord(firstDay) && isRecord(firstDay.meta) && typeof firstDay.meta.timezone === 'string'
    ? firstDay.meta.timezone
    : '';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new Error('Prayer time service returned an invalid time zone.');
  }
  if (days.length < 28) {
    throw new Error('Prayer time service returned an incomplete month.');
  }

  const schedule: PrayerMonthSchedule = {
    location: { ...location, city: location.city.trim() },
    method,
    month,
    timezone,
    days,
    updatedAt: Date.now(),
  };
  if (!isPrayerMonthSchedule(schedule)) {
    throw new Error('Prayer time service returned invalid prayer-time ordering.');
  }
  return schedule;
}

export function getPrayerDateTime(now: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}
