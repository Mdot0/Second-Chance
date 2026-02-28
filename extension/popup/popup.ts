import { DEFAULT_SETTINGS, MAX_DELAY_SECONDS, MIN_DELAY_SECONDS } from "../content/settings/defaults";
import { getSettings, setSettings } from "../content/settings/storage";

type Elements = {
  form: HTMLFormElement;
  enabled: HTMLInputElement;
  delaySeconds: HTMLInputElement;
  smartPause: HTMLInputElement;
  keywords: HTMLTextAreaElement;
  status: HTMLParagraphElement;
};

function getElements(): Elements {
  const form = document.getElementById("settings-form");
  const enabled = document.getElementById("enabled");
  const delaySeconds = document.getElementById("delaySeconds");
  const smartPause = document.getElementById("smartPause");
  const keywords = document.getElementById("keywords");
  const status = document.getElementById("status");

  if (
    !(form instanceof HTMLFormElement) ||
    !(enabled instanceof HTMLInputElement) ||
    !(delaySeconds instanceof HTMLInputElement) ||
    !(smartPause instanceof HTMLInputElement) ||
    !(keywords instanceof HTMLTextAreaElement) ||
    !(status instanceof HTMLParagraphElement)
  ) {
    throw new Error("Popup elements are missing.");
  }

  return { form, enabled, delaySeconds, smartPause, keywords, status };
}

function setStatus(elements: Elements, message: string): void {
  elements.status.textContent = message;
}

function parseKeywords(raw: string): string[] {
  return [...new Set(raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

function clampDelay(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.delaySeconds;
  }
  return Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(value)));
}

async function initPopup(): Promise<void> {
  const elements = getElements();
  const settings = await getSettings();

  elements.enabled.checked = settings.enabled;
  elements.delaySeconds.value = String(settings.delaySeconds);
  elements.smartPause.checked = settings.smartPause;
  elements.keywords.value = settings.keywords.join(", ");

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const delay = clampDelay(Number(elements.delaySeconds.value));
    const keywords = parseKeywords(elements.keywords.value);

    await setSettings({
      enabled: elements.enabled.checked,
      delaySeconds: delay,
      smartPause: elements.smartPause.checked,
      keywords
    });

    elements.delaySeconds.value = String(delay);
    elements.keywords.value = keywords.join(", ");
    setStatus(elements, "Saved");
    window.setTimeout(() => setStatus(elements, ""), 1200);
  });
}

void initPopup();
