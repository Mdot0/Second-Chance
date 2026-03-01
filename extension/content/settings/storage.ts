import {
  DEFAULT_SETTINGS,
  MAX_DELAY_SECONDS,
  MIN_DELAY_SECONDS,
  SETTINGS_KEY,
  type PauseSettings,
  type StrictnessMode
} from "./defaults";

type LegacySettings = {
  smartPause?: boolean;
};

function isStrictness(value: unknown): value is StrictnessMode {
  return value === "balanced" || value === "strict";
}

function normalizeDelay(input: unknown): number {
  const delay = Number(input ?? DEFAULT_SETTINGS.delaySeconds);
  if (!Number.isFinite(delay)) {
    return DEFAULT_SETTINGS.delaySeconds;
  }
  return Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(delay)));
}

function normalizeCustomDictionary(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return [...new Set(input.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

export function normalizeSettings(input: unknown): PauseSettings {
  const raw = typeof input === "object" && input ? (input as Partial<PauseSettings> & LegacySettings) : {};
  const legacySmartPause = typeof raw.smartPause === "boolean" ? raw.smartPause : true;

  return {
    enabled: raw.enabled ?? DEFAULT_SETTINGS.enabled,
    delaySeconds: normalizeDelay(raw.delaySeconds),
    checkGrammar: raw.checkGrammar ?? legacySmartPause,
    checkFormatting: raw.checkFormatting ?? legacySmartPause,
    strictness: isStrictness(raw.strictness) ? raw.strictness : DEFAULT_SETTINGS.strictness,
    customDictionary: normalizeCustomDictionary((raw as Partial<PauseSettings>).customDictionary)
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
  if (!storage) {
    throw new Error("Chrome storage is unavailable.");
  }
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...patch });
  await storage.set({ [SETTINGS_KEY]: next });
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
