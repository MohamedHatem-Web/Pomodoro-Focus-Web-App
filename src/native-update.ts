declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
    };
    __TAURI_INTERNALS__?: unknown;
  }
}

const REMOTE_APP_URL = 'https://focus-to-work.vercel.app/';
const UPDATE_MANIFEST_URL = `${REMOTE_APP_URL}app-update.json`;

interface AppUpdateManifest {
  version: string;
  url: string;
}

function isNativeRuntime(): boolean {
  if (typeof window.__TAURI_INTERNALS__ !== 'undefined') return true;
  return typeof window.Capacitor?.isNativePlatform === 'function'
    ? window.Capacitor.isNativePlatform()
    : false;
}

function parseVersion(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function isRemoteVersionNewer(remoteVersion: string, localVersion: string): boolean {
  const remote = parseVersion(remoteVersion);
  const local = parseVersion(localVersion);
  const length = Math.max(remote.length, local.length);
  for (let index = 0; index < length; index += 1) {
    const remotePart = remote[index] ?? 0;
    const localPart = local[index] ?? 0;
    if (remotePart !== localPart) return remotePart > localPart;
  }
  return false;
}

export async function applyNativeRemoteUpdate(localVersion: string): Promise<boolean> {
  if (!isNativeRuntime() || !navigator.onLine) return false;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(UPDATE_MANIFEST_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;

    const manifest = await response.json() as Partial<AppUpdateManifest>;
    if (typeof manifest.version !== 'string') return false;
    if (!isRemoteVersionNewer(manifest.version, localVersion)) return false;

    const targetUrl = typeof manifest.url === 'string' && manifest.url.startsWith('https://')
      ? manifest.url
      : REMOTE_APP_URL;
    window.location.replace(targetUrl);
    return true;
  } catch (error) {
    console.info('Remote app update unavailable; using the bundled app.', error);
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
