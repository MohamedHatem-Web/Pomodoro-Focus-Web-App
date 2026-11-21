export interface PrayerRegionOption {
  countryCode: string;
  code: string;
  name: string;
}

export interface PrayerPlaceOption {
  id: number;
  countryCode: string;
  regionCode: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface PrayerLocationIndex {
  regions: PrayerRegionOption[];
  places: PrayerPlaceOption[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRegionRow(value: unknown): value is [string, string, string] {
  return Array.isArray(value) &&
    value.length === 3 &&
    typeof value[0] === 'string' &&
    /^[A-Z]{2}$/.test(value[0]) &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'string' &&
    value[2].trim().length > 0;
}

function isPlaceRow(value: unknown): value is [number, string, string, string, number, number, string] {
  return Array.isArray(value) &&
    value.length === 7 &&
    Number.isSafeInteger(value[0]) &&
    value[0] > 0 &&
    typeof value[1] === 'string' &&
    /^[A-Z]{2}$/.test(value[1]) &&
    typeof value[2] === 'string' &&
    typeof value[3] === 'string' &&
    value[3].trim().length > 0 &&
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
    value.format !== 'geonames-location-index' ||
    value.version !== 1 ||
    value.license !== 'CC BY 4.0' ||
    !Array.isArray(value.regions) ||
    !Array.isArray(value.places) ||
    value.regions.length === 0 ||
    value.places.length === 0
  ) {
    throw new Error('The offline prayer location list has an unsupported format.');
  }

  if (!value.regions.every(isRegionRow) || !value.places.every(isPlaceRow)) {
    throw new Error('The offline prayer location list contains invalid entries.');
  }

  const validTimezones = new Set<string>();
  for (const [, , , , , , timezone] of value.places) {
    if (validTimezones.has(timezone)) continue;
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
      validTimezones.add(timezone);
    } catch {
      throw new Error(`The offline prayer location list contains an invalid time zone: ${timezone}.`);
    }
  }

  const placeIds = new Set<number>();
  const places = value.places.map(([id, countryCode, regionCode, name, latitude, longitude, timezone]) => {
    if (placeIds.has(id)) {
      throw new Error(`The offline prayer location list contains a duplicate place ID: ${id}.`);
    }
    placeIds.add(id);
    return { id, countryCode, regionCode, name, latitude, longitude, timezone };
  });

  const regions = value.regions.map(([countryCode, code, name]) => ({ countryCode, code, name }));
  return { regions, places };
}

let locationIndexPromise: Promise<PrayerLocationIndex> | null = null;

export function loadPrayerLocationIndex(): Promise<PrayerLocationIndex> {
  if (!locationIndexPromise) {
    locationIndexPromise = fetch(`${import.meta.env.BASE_URL}data/prayer-locations.json`, {
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`The offline prayer location list returned ${response.status}.`);
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
