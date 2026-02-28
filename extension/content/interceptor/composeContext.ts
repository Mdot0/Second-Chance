export type ComposeContext = {
  toCount: number;
  hasAttachment: boolean;
  subject: string;
  bodyText: string;
};

const COMPOSE_ROOT_SELECTORS = [
  "div[role='dialog'][gh='mtb']",
  "div[gh='mtb']",
  "div[role='dialog']",
  "div.M9",
  "div.AD"
];

function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function parseRecipientCount(composeRoot: HTMLElement): number {
  const emails = new Set<string>();
  const chips = composeRoot.querySelectorAll<HTMLElement>(
    "span[email], div[email], [data-hovercard-id*='@'], [email]"
  );

  chips.forEach((node) => {
    const email = node.getAttribute("email") || node.getAttribute("data-hovercard-id");
    if (email && email.includes("@")) {
      emails.add(email.toLowerCase());
    }
  });

  if (emails.size > 0) {
    return emails.size;
  }

  const toInput = composeRoot.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "textarea[name='to'], input[aria-label*='To']"
  );
  if (!toInput?.value) {
    return 0;
  }

  return toInput.value
    .split(/[;,]/g)
    .map((entry) => entry.trim())
    .filter(Boolean).length;
}

function parseHasAttachment(composeRoot: HTMLElement): boolean {
  return Boolean(
    composeRoot.querySelector(
      "[download_url], a[aria-label*='Attachment'], div[aria-label*='attachment'], .aZo"
    )
  );
}

function parseSubject(composeRoot: HTMLElement): string {
  const subjectInput = composeRoot.querySelector<HTMLInputElement>("input[name='subjectbox']");
  return cleanText(subjectInput?.value);
}

function parseBodyText(composeRoot: HTMLElement): string {
  const body = composeRoot.querySelector<HTMLElement>(
    "div[aria-label='Message Body'], div[role='textbox'][contenteditable='true']"
  );
  return cleanText(body?.innerText || body?.textContent);
}

function isComposeRoot(root: HTMLElement): boolean {
  const hasBody = Boolean(
    root.querySelector("div[aria-label='Message Body'], div[role='textbox'][contenteditable='true']")
  );
  const hasSubject = Boolean(root.querySelector("input[name='subjectbox']"));
  return hasBody || hasSubject;
}

function looksLikeComposeContainer(element: HTMLElement): boolean {
  return (
    element.getAttribute("gh") === "mtb" ||
    element.getAttribute("role") === "dialog" ||
    element.classList.contains("M9") ||
    element.classList.contains("AD")
  );
}

function elementFromNode(node: Node | null): Element | null {
  if (!node) {
    return null;
  }
  if (node instanceof Element) {
    return node;
  }
  return node.parentElement;
}

export function findComposeRootFromNode(node: Node | null): HTMLElement | null {
  const element = elementFromNode(node);
  if (!element) {
    return null;
  }

  for (const selector of COMPOSE_ROOT_SELECTORS) {
    const root = element.closest<HTMLElement>(selector);
    if (root && isComposeRoot(root)) {
      return root;
    }
  }

  // Fallback: if Gmail mutates classes, walk up but keep compose-like constraints.
  let current: HTMLElement | null = element as HTMLElement;
  while (current) {
    if (looksLikeComposeContainer(current) && isComposeRoot(current)) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

export function buildComposeContext(composeRoot: HTMLElement): ComposeContext {
  return {
    toCount: parseRecipientCount(composeRoot),
    hasAttachment: parseHasAttachment(composeRoot),
    subject: parseSubject(composeRoot),
    bodyText: parseBodyText(composeRoot)
  };
}
