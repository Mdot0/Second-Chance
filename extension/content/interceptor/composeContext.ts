export type ComposeContext = {
  toCount: number;
  hasAttachment: boolean;
  subject: string;
  bodyText: string;
};

const COMPOSE_ROOT_SELECTORS = ["div[role='dialog']", "div.AD", "div.M9"];

function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function parseRecipientCount(composeRoot: HTMLElement): number {
  const emails = new Set<string>();
  const emailNodes = composeRoot.querySelectorAll<HTMLElement>(
    "span[email], [data-hovercard-id*='@'], [email]"
  );

  emailNodes.forEach((node) => {
    const email = node.getAttribute("email") || node.getAttribute("data-hovercard-id");
    if (email && email.includes("@")) {
      emails.add(email.toLowerCase());
    }
  });

  if (emails.size > 0) {
    return emails.size;
  }

  const toInput = composeRoot.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    "textarea[name='to'], input[aria-label='To recipients']"
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

export function findComposeRootFromNode(node: Node | null): HTMLElement | null {
  if (!node || !(node instanceof Element)) {
    return null;
  }

  for (const selector of COMPOSE_ROOT_SELECTORS) {
    const root = node.closest<HTMLElement>(selector);
    if (root) {
      return root;
    }
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
