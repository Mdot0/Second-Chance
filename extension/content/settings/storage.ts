import {
  DEFAULT_SETTINGS,
  MAX_DELAY_SECONDS,
  MIN_DELAY_SECONDS,
  SETTINGS_KEY,
  type PauseSettings
} from "./defaults";

function normalizeSettings(input: unknown): PauseSettings {
  const raw = typeof input === "object" && input ? (input as Partial<PauseSettings>) : {};
  const delay = Number(raw.delaySeconds ?? DEFAULT_SETTINGS.delaySeconds);
  const safeDelay = Number.isFinite(delay)
    ? Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(delay)))
    : DEFAULT_SETTINGS.delaySeconds;

  const rawKeywords = Array.isArray(raw.keywords) ? raw.keywords : DEFAULT_SETTINGS.keywords;
  const keywords = [...new Set(rawKeywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean))];

  return {
    enabled: raw.enabled ?? DEFAULT_SETTINGS.enabled,
    delaySeconds: safeDelay,
    smartPause: raw.smartPause ?? DEFAULT_SETTINGS.smartPause,
    keywords: keywords.length > 0 ? keywords : DEFAULT_SETTINGS.keywords
  };
}

function getStorageArea(): chrome.storage.StorageArea | null {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return null;
  }
  return chrome.storage.local;
}

export async function getSettings(): Promise<PauseSettings> {
  const storage = getStorageArea();
  if (!storage) {
    return DEFAULT_SETTINGS;
  }
  const raw = await storage.get(SETTINGS_KEY);
  return normalizeSettings(raw[SETTINGS_KEY]);
}

export async function setSettings(patch: Partial<PauseSettings>): Promise<PauseSettings> {
  const storage = getStorageArea();
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });

  if (storage) {
    await storage.set({ [SETTINGS_KEY]: next });
  }
  return next;
}

export function onSettingsChange(
  callback: (settings: PauseSettings) => void
): (() => void) | undefined {
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged) {
    return undefined;
  }

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) {
      return;
    }
    callback(normalizeSettings(changes[SETTINGS_KEY].newValue));
  };

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export { normalizeSettings };
