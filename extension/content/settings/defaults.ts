export type PauseSettings = {
  enabled: boolean;
  delaySeconds: number;
  smartPause: boolean;
  keywords: string[];
};

export const SETTINGS_KEY = "microPauseSettings";
export const MIN_DELAY_SECONDS = 0;
export const MAX_DELAY_SECONDS = 30;

export const DEFAULT_SETTINGS: PauseSettings = {
  enabled: true,
  delaySeconds: 5,
  smartPause: true,
  keywords: ["urgent", "asap", "confidential", "private"]
};
