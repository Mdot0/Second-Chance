export type StrictnessMode = "balanced" | "strict";

export type PauseSettings = {
  enabled: boolean;
  delaySeconds: number;
  checkTone: boolean;
  checkGrammar: boolean;
  checkFormatting: boolean;
  strictness: StrictnessMode;
  customDictionary: string[];
  useOnlineCheck: boolean;
};

export const SETTINGS_KEY = "microPauseSettings";
export const MIN_DELAY_SECONDS = 0;
export const MAX_DELAY_SECONDS = 30;

export const DEFAULT_SETTINGS: PauseSettings = {
  enabled: true,
  delaySeconds: 5,
  checkTone: true,
  checkGrammar: true,
  checkFormatting: true,
  strictness: "balanced",
  customDictionary: [],
  useOnlineCheck: false
};
