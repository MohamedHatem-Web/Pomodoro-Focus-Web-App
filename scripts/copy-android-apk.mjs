import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildRoot = process.env.FOCUS_TO_WORK_GRADLE_BUILD_ROOT || join(tmpdir(), 'focus-to-work-gradle-build');
const apkPath = join(buildRoot, 'app', 'outputs', 'apk', 'debug', 'app-debug.apk');
const downloadPath = join(projectRoot, 'public', 'downloads', 'focus-to-work.apk');

await mkdir(dirname(downloadPath), { recursive: true });
await copyFile(apkPath, downloadPath);
console.log(`Updated ${downloadPath}`);
