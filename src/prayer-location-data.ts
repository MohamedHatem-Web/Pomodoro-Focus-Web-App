export interface PrayerRegionOption {
  countryCode: string;
  code: string;
  name: string;
  id: number;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface PrayerLocationIndex {
  regions: PrayerRegionOption[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRegionRow(value: unknown): value is [string, string, string, number, number, number, string] {
  return Array.isArray(value) &&
    value.length === 7 &&
    typeof value[0] === 'string' &&
    /^[A-Z]{2}$/.test(value[0]) &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'string' &&
    value[2].trim().length > 0 &&
    Number.isSafeInteger(value[3]) &&
    value[3] > 0 &&
    typeof value[4] === 'number' &&
    value[4] >= -90 &&
    value[4] <= 90 &&
    typeof value[5] === 'number' &&
    value[5] >= -180 &&
    value[5] <= 180 &&
    typeof value[6] === 'string' &&
    value[6].length > 0;
}

function parseLocationIndex(value: unknown): PrayerLocationIndex {
  if (
    !isRecord(value) ||
    value.format !== 'geonames-region-index' ||
    value.version !== 1 ||
    value.license !== 'CC BY 4.0' ||
    !Array.isArray(value.regions) ||
    value.regions.length === 0 ||
    !value.regions.every(isRegionRow)
  ) {
    throw new Error('The offline prayer region list has an unsupported or invalid format.');
  }

  const keys = new Set<string>();
  const ids = new Set<number>();
  const regions = value.regions.map(([countryCode, code, name, id, latitude, longitude, timezone]) => {
    const key = `${countryCode}:${code}`;
    if (keys.has(key) || ids.has(id)) {
      throw new Error(`The offline prayer region list contains a duplicate region or location ID: ${key}.`);
    }
    keys.add(key);
    ids.add(id);
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      throw new Error(`The offline prayer region list contains an invalid time zone: ${timezone}.`);
    }
    return { countryCode, code, name, id, latitude, longitude, timezone };
  });

  return { regions };
}

let locationIndexPromise: Promise<PrayerLocationIndex> | null = null;

export function loadPrayerLocationIndex(): Promise<PrayerLocationIndex> {
  if (!locationIndexPromise) {
    locationIndexPromise = fetch(`${import.meta.env.BASE_URL}data/prayer-locations.json`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The offline prayer region list returned ${response.status}.`);
        }
        return parseLocationIndex(await response.json());
      })
      .catch((error: unknown) => {
        locationIndexPromise = null;
        throw error;
      });
  }

  return locationIndexPromise;
}
