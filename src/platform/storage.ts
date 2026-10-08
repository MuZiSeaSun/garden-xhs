const STORAGE_KEY = 'garden_world_v1';
const STORAGE_MIN_CLIENT_VERSION = 9460;

export interface SavePayload {
  readonly v: 1;
  readonly blocks: number[];
  readonly camera: { theta: number; phi: number; radius: number };
}

function readBuildVersion(lo?: { miniToolEnv?: { buildVersion?: number } }): number {
  const env = lo?.miniToolEnv;
  return Number(env?.buildVersion) || 0;
}

async function getBuildVersion(): Promise<number> {
  const xhs = window.xhs;
  const sync = readBuildVersion(xhs?.launchOptions);
  if (sync) return sync;

  const mt = xhs?.miniTool;
  if (!mt || typeof mt.getLaunchOptions !== 'function') return 0;

  try {
    const lo = await mt.getLaunchOptions();
    return readBuildVersion(lo);
  } catch {
    return 0;
  }
}

const clientAtLeast = (buildVersion: number, minVer: number): boolean =>
  Math.floor(buildVersion / 1000) >= minVer;

function isSavePayload(x: unknown): x is SavePayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  const cam = o.camera as Record<string, unknown> | undefined | null;
  return (
    o.v === 1 &&
    Array.isArray(o.blocks) &&
    o.blocks.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 9) &&
    !!cam &&
    typeof cam.theta === 'number' &&
    typeof cam.phi === 'number' &&
    typeof cam.radius === 'number'
  );
}

export async function saveWorld(payload: SavePayload): Promise<boolean> {
  const data = JSON.stringify(payload);
  const mt = window.xhs?.miniTool;
  const buildV = await getBuildVersion();

  if (clientAtLeast(buildV, STORAGE_MIN_CLIENT_VERSION) && mt?.setStorage) {
    try {
      await mt.setStorage({ key: STORAGE_KEY, data });
      return true;
    } catch { /* fallthrough */ }
  }

  try {
    localStorage.setItem(STORAGE_KEY, data);
    return true;
  } catch {
    return false;
  }
}

export async function loadWorld(): Promise<SavePayload | null> {
  const mt = window.xhs?.miniTool;
  const buildV = await getBuildVersion();
  let raw: string | null = null;

  if (clientAtLeast(buildV, STORAGE_MIN_CLIENT_VERSION) && mt?.getStorage) {
    try {
      const res = await mt.getStorage({ key: STORAGE_KEY });
      raw = res?.data ?? null;
    } catch { /* ignore */ }
  }

  if (!raw) {
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isSavePayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
