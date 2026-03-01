import { DEFAULT_SETTINGS, MAX_DELAY_SECONDS, MIN_DELAY_SECONDS } from "../content/settings/defaults";
import { getSettings, onSettingsChange, setSettings } from "../content/settings/storage";
import type { PauseSettings } from "../content/settings/defaults";

type Elements = {
  form: HTMLFormElement;
  enabled: HTMLInputElement;
  delaySeconds: HTMLInputElement;
  checkGrammar: HTMLInputElement;
  checkFormatting: HTMLInputElement;
  strictness: HTMLSelectElement;
  status: HTMLParagraphElement;
  delayReadout: HTMLSpanElement;
  resetBtn: HTMLButtonElement;
};

function getElements(): Elements {
  const form = document.getElementById("settings-form");
  const enabled = document.getElementById("enabled");
  const delaySeconds = document.getElementById("delaySeconds");
  const checkGrammar = document.getElementById("checkGrammar");
  const checkFormatting = document.getElementById("checkFormatting");
  const strictness = document.getElementById("strictness");
  const status = document.getElementById("status");
  const delayReadout = document.getElementById("delay-readout");
  const resetBtn = document.getElementById("resetBtn");

  if (
    !(form instanceof HTMLFormElement) ||
    !(enabled instanceof HTMLInputElement) ||
    !(delaySeconds instanceof HTMLInputElement) ||
    !(checkGrammar instanceof HTMLInputElement) ||
    !(checkFormatting instanceof HTMLInputElement) ||
    !(strictness instanceof HTMLSelectElement) ||
    !(status instanceof HTMLParagraphElement) ||
    !(delayReadout instanceof HTMLSpanElement) ||
    !(resetBtn instanceof HTMLButtonElement)
  ) {
    throw new Error("Popup elements are missing.");
  }

  return {
    form,
    enabled,
    delaySeconds,
    checkGrammar,
    checkFormatting,
    strictness,
    status,
    delayReadout,
    resetBtn
  };
}

function setStatus(elements: Elements, message: string, isError = false): void {
  elements.status.textContent = message;
  elements.status.classList.toggle("status--error", isError);
  elements.status.classList.toggle("status--saved", !isError && message.length > 0);
}

function clearStatus(elements: Elements): void {
  elements.status.textContent = "";
  elements.status.classList.remove("status--error", "status--saved");
}

function clampDelay(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.delaySeconds;
  }
  return Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(value)));
}

function updateDelayDisplay(elements: Elements): void {
  const value = clampDelay(Number(elements.delaySeconds.value));
  elements.delayReadout.textContent = `${value}s`;
  const pct = ((value - MIN_DELAY_SECONDS) / (MAX_DELAY_SECONDS - MIN_DELAY_SECONDS)) * 100;
  elements.delaySeconds.style.background = `linear-gradient(to right, #2563eb ${pct}%, #e2e8f0 ${pct}%)`;
}

function applySettings(elements: Elements, settings: PauseSettings): void {
  elements.enabled.checked = settings.enabled;
  elements.delaySeconds.value = String(settings.delaySeconds);
  elements.checkGrammar.checked = settings.checkGrammar;
  elements.checkFormatting.checked = settings.checkFormatting;
  elements.strictness.value = settings.strictness;
  updateDelayDisplay(elements);
}

async function initPopup(): Promise<void> {
  const elements = getElements();

  try {
    const settings = await getSettings();
    applySettings(elements, settings);
  } catch {
    setStatus(elements, "Could not load settings. Chrome storage may be unavailable.", true);
  }

  const removeSettingsListener = onSettingsChange((settings) => {
    applySettings(elements, settings);
  });
  if (removeSettingsListener) {
    window.addEventListener("unload", removeSettingsListener, { once: true });
  }

  elements.delaySeconds.addEventListener("input", () => updateDelayDisplay(elements));

  elements.resetBtn.addEventListener("click", async () => {
    try {
      const saved = await setSettings(DEFAULT_SETTINGS);
      applySettings(elements, saved);
      setStatus(elements, "Reset to defaults");
      window.setTimeout(() => clearStatus(elements), 1300);
    } catch {
      setStatus(elements, "Could not reset settings.", true);
    }
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const saved = await setSettings({
        enabled: elements.enabled.checked,
        delaySeconds: clampDelay(Number(elements.delaySeconds.value)),
        checkGrammar: elements.checkGrammar.checked,
        checkFormatting: elements.checkFormatting.checked,
        strictness: elements.strictness.value === "strict" ? "strict" : "balanced"
      });

      applySettings(elements, saved);
      setStatus(elements, "Saved");
      window.setTimeout(() => clearStatus(elements), 1300);
    } catch {
      setStatus(elements, "Could not save settings.", true);
    }
  });
}

void initPopup();
