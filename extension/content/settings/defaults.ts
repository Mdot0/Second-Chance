export type LLMMode = "fast" | "both" | "deep";

export type PauseSettings = {
  enabled: boolean;
  delaySeconds: number;
  checkGrammar: boolean;
  checkFormatting: boolean;
  llmMode: LLMMode;
  customDictionary: string[];
  llmEnabled: boolean;
};

export const SETTINGS_KEY = "microPauseSettings";
export const MIN_DELAY_SECONDS = 0;
export const MAX_DELAY_SECONDS = 60;

export const DEFAULT_SETTINGS: PauseSettings = {
  enabled: true,
  delaySeconds: 20,
  checkGrammar: true,
  checkFormatting: true,
  llmMode: "both",
  customDictionary: [],
  llmEnabled: true
};
