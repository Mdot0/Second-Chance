import { DEFAULT_SETTINGS, MAX_DELAY_SECONDS, MIN_DELAY_SECONDS } from "../content/settings/defaults";
import { getSettings, setSettings } from "../content/settings/storage";

type Elements = {
  form: HTMLFormElement;
  enabled: HTMLInputElement;
  delaySeconds: HTMLInputElement;
  smartPause: HTMLInputElement;
  keywords: HTMLTextAreaElement;
  status: HTMLParagraphElement;
  delayHint: HTMLSpanElement;
  keywordsHint: HTMLSpanElement;
};

function getElements(): Elements {
  const form = document.getElementById("settings-form");
  const enabled = document.getElementById("enabled");
  const delaySeconds = document.getElementById("delaySeconds");
  const smartPause = document.getElementById("smartPause");
  const keywords = document.getElementById("keywords");
  const status = document.getElementById("status");
  const delayHint = document.getElementById("delay-hint");
  const keywordsHint = document.getElementById("keywords-hint");

  if (
    !(form instanceof HTMLFormElement) ||
    !(enabled instanceof HTMLInputElement) ||
    !(delaySeconds instanceof HTMLInputElement) ||
    !(smartPause instanceof HTMLInputElement) ||
    !(keywords instanceof HTMLTextAreaElement) ||
    !(status instanceof HTMLParagraphElement) ||
    !(delayHint instanceof HTMLSpanElement) ||
    !(keywordsHint instanceof HTMLSpanElement)
  ) {
    throw new Error("Popup elements are missing.");
  }

  return { form, enabled, delaySeconds, smartPause, keywords, status, delayHint, keywordsHint };
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

function parseKeywords(raw: string): string[] {
  return [...new Set(raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

function clampDelay(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.delaySeconds;
  }
  return Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(value)));
}

function validateDelay(elements: Elements): void {
  const raw = Number(elements.delaySeconds.value);
  if (!Number.isFinite(raw)) {
    elements.delayHint.textContent = `Invalid value — will use ${DEFAULT_SETTINGS.delaySeconds}s`;
  } else if (raw < MIN_DELAY_SECONDS || raw > MAX_DELAY_SECONDS) {
    const clamped = clampDelay(raw);
    elements.delayHint.textContent = `Must be ${MIN_DELAY_SECONDS}–${MAX_DELAY_SECONDS}. Will be saved as ${clamped}s`;
  } else {
    elements.delayHint.textContent = "";
  }
}

function validateKeywords(elements: Elements): void {
  const parsed = parseKeywords(elements.keywords.value);
  if (parsed.length === 0) {
    elements.keywordsHint.textContent = `Empty list — defaults will apply (${DEFAULT_SETTINGS.keywords.join(", ")})`;
  } else {
    elements.keywordsHint.textContent = "";
  }
}

async function initPopup(): Promise<void> {
  const elements = getElements();

  try {
    const settings = await getSettings();
    elements.enabled.checked = settings.enabled;
    elements.delaySeconds.value = String(settings.delaySeconds);
    elements.smartPause.checked = settings.smartPause;
    elements.keywords.value = settings.keywords.join(", ");
  } catch {
    setStatus(elements, "Could not load settings — Chrome storage may be unavailable.", true);
  }

  elements.delaySeconds.addEventListener("input", () => validateDelay(elements));
  elements.keywords.addEventListener("input", () => validateKeywords(elements));

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const delay = clampDelay(Number(elements.delaySeconds.value));
    const keywords = parseKeywords(elements.keywords.value);

    try {
      const saved = await setSettings({
        enabled: elements.enabled.checked,
        delaySeconds: delay,
        smartPause: elements.smartPause.checked,
        keywords
      });

      elements.delaySeconds.value = String(saved.delaySeconds);
      elements.keywords.value = saved.keywords.join(", ");
      elements.delayHint.textContent = "";
      elements.keywordsHint.textContent = "";

      setStatus(elements, "Saved");
      window.setTimeout(() => clearStatus(elements), 1200);
    } catch {
      setStatus(elements, "Could not save — Chrome storage may be unavailable.", true);
    }
  });
}

void initPopup();
