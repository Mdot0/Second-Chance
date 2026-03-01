import type { ComposeContext } from "./composeContext";

const OUTLOOK_BODY_SELECTOR = '[aria-label="Message body"][contenteditable="true"]';
const OUTLOOK_TO_SELECTOR = '[aria-label="To"][contenteditable="true"]';
const OUTLOOK_SUBJECT_SELECTORS = [
  'input[aria-label="Add a subject"]',
  'input[aria-label*="ubject"]',
  'input[placeholder*="ubject"]'
];

function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function cleanRawText(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
}

function parseRecipientCount(composeRoot: HTMLElement): number {
  // Outlook renders recipient chips with a title attribute containing the email
  const chips = composeRoot.querySelectorAll<HTMLElement>("[title*='@']");
  const emails = new Set<string>();
  chips.forEach((chip) => {
    const title = chip.getAttribute("title");
    if (title && title.includes("@")) {
      emails.add(title.toLowerCase());
    }
  });
  if (emails.size > 0) return emails.size;

  // Fallback: count entries in the To field text
  const toField = composeRoot.querySelector<HTMLElement>(OUTLOOK_TO_SELECTOR);
  if (!toField) return 0;
  return (toField.innerText ?? "")
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@")).length;
}

function parseHasAttachment(composeRoot: HTMLElement): boolean {
  return Boolean(
    composeRoot.querySelector(
      "[aria-label*='ttachment'], [title*='ttachment'], [class*='attachmentItem']"
    )
  );
}

function parseSubject(composeRoot: HTMLElement): string {
  for (const selector of OUTLOOK_SUBJECT_SELECTORS) {
    const input = composeRoot.querySelector<HTMLInputElement>(selector);
    if (input) return input.value.trim();
  }
  return "";
}

function parseBodyRaw(composeRoot: HTMLElement): string {
  const bodyEl = composeRoot.querySelector<HTMLElement>(OUTLOOK_BODY_SELECTOR);
  if (!bodyEl) return "";
  // Read innerText from the live connected element (avoids off-DOM layout issues)
  return cleanRawText(bodyEl.innerText);
}

export function findOutlookComposeRoot(node: Node | null): HTMLElement | null {
  let element: Element | null =
    node instanceof Element ? node : node instanceof Node ? node.parentElement : null;

  while (element) {
    const el = element as HTMLElement;
    if (
      el.querySelector('[aria-label="Message body"]') !== null &&
      el.querySelector('button[aria-label="Send"]') !== null
    ) {
      return el;
    }
    element = element.parentElement;
  }
  return null;
}

export function buildOutlookComposeContext(composeRoot: HTMLElement): ComposeContext {
  const bodyRaw = parseBodyRaw(composeRoot);
  const bodyText = cleanText(bodyRaw);
  return {
    toCount: parseRecipientCount(composeRoot),
    hasAttachment: parseHasAttachment(composeRoot),
    subject: parseSubject(composeRoot),
    bodyText,
    bodyRaw,
    bodyBlocks: []
  };
}
