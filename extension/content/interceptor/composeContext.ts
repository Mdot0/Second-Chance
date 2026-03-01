export type BodyBlockType = "paragraph" | "bullet-item" | "number-item" | "quote" | "blank";

export type BodyBlock = {
  type: BodyBlockType;
  text: string;
  indentLevel: number;
  sourceTag: string;
};

export type ComposeContext = {
  toCount: number;
  hasAttachment: boolean;
  subject: string;
  bodyText: string;
  bodyRaw: string;
  bodyBlocks: BodyBlock[];
};

const COMPOSE_ROOT_SELECTORS = [
  "div[role='dialog'][gh='mtb']",
  "div[gh='mtb']",
  "div[role='dialog']",
  "div.M9",
  "div.AD"
];

const BLOCK_TAGS = new Set([
  "article",
  "blockquote",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "ul"
]);

function cleanText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function cleanRawText(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
}

function normalizeBlockText(text: string | null | undefined): string {
  return cleanRawText(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
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

function getBodyElement(composeRoot: HTMLElement): HTMLElement | null {
  return composeRoot.querySelector<HTMLElement>(
    "div[aria-label='Message Body'], div[role='textbox'][contenteditable='true']"
  );
}

function stripQuotedContent(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("div.gmail_quote, blockquote[type='cite'], .gmail_quote_container")
    .forEach((el) => el.remove());
  return clone;
}

function pushBlock(
  blocks: BodyBlock[],
  type: BodyBlockType,
  text: string,
  indentLevel: number,
  sourceTag: string
): void {
  if (type !== "blank" && text.length === 0) {
    return;
  }

  const prev = blocks.length > 0 ? blocks[blocks.length - 1] : undefined;
  if (type === "blank" && prev?.type === "blank") {
    blocks.push({ type, text: "", indentLevel, sourceTag });
    return;
  }

  blocks.push({ type, text, indentLevel, sourceTag });
}

function parseListElement(
  listElement: HTMLElement,
  blocks: BodyBlock[],
  indentLevel: number,
  inQuote: boolean
): void {
  const listType: BodyBlockType = listElement.tagName.toLowerCase() === "ol" ? "number-item" : "bullet-item";

  for (const child of Array.from(listElement.children)) {
    if (!(child instanceof HTMLElement) || child.tagName.toLowerCase() !== "li") {
      continue;
    }

    const clone = child.cloneNode(true) as HTMLElement;
    for (const cloneChild of Array.from(clone.children)) {
      const cloneTag = cloneChild.tagName.toLowerCase();
      if (cloneTag === "ul" || cloneTag === "ol") {
        cloneChild.remove();
      }
    }

    const itemText = normalizeBlockText(clone.innerText || clone.textContent);
    pushBlock(blocks, inQuote ? "quote" : listType, itemText, indentLevel, "li");

    for (const liChild of Array.from(child.children)) {
      if (!(liChild instanceof HTMLElement)) {
        continue;
      }
      const tag = liChild.tagName.toLowerCase();
      if (tag === "ul" || tag === "ol") {
        parseListElement(liChild, blocks, indentLevel + 1, inQuote);
      }
    }
  }
}

function parseNode(node: Node, blocks: BodyBlock[], indentLevel: number, inQuote: boolean): void {
  if (node instanceof Text) {
    const text = normalizeBlockText(node.textContent);
    if (text.length > 0) {
      pushBlock(blocks, inQuote ? "quote" : "paragraph", text, indentLevel, "#text");
    }
    return;
  }

  if (!(node instanceof HTMLElement)) {
    return;
  }

  const tag = node.tagName.toLowerCase();

  if (tag === "br") {
    pushBlock(blocks, "blank", "", indentLevel, "br");
    return;
  }

  if (tag === "blockquote") {
    const beforeCount = blocks.length;
    for (const childNode of Array.from(node.childNodes)) {
      parseNode(childNode, blocks, indentLevel + 1, true);
    }

    if (blocks.length === beforeCount) {
      const quoteText = normalizeBlockText(node.innerText || node.textContent);
      if (quoteText.length > 0) {
        pushBlock(blocks, "quote", quoteText, indentLevel + 1, "blockquote");
      }
    }
    return;
  }

  if (tag === "ul" || tag === "ol") {
    parseListElement(node, blocks, indentLevel, inQuote);
    return;
  }

  if (tag === "li") {
    const parentTag = node.parentElement?.tagName.toLowerCase();
    const listType: BodyBlockType = parentTag === "ol" ? "number-item" : "bullet-item";
    const itemText = normalizeBlockText(node.innerText || node.textContent);
    pushBlock(blocks, inQuote ? "quote" : listType, itemText, indentLevel, "li");
    return;
  }

  if (BLOCK_TAGS.has(tag)) {
    const hasStructuralChildren = Array.from(node.children).some((child) => {
      return BLOCK_TAGS.has(child.tagName.toLowerCase()) || child.tagName.toLowerCase() === "br";
    });

    if (hasStructuralChildren) {
      for (const childNode of Array.from(node.childNodes)) {
        parseNode(childNode, blocks, indentLevel, inQuote);
      }
      return;
    }

    const text = normalizeBlockText(node.innerText || node.textContent);
    if (text.length > 0) {
      pushBlock(blocks, inQuote ? "quote" : "paragraph", text, indentLevel, tag);
      return;
    }

    if (tag === "div" || tag === "p") {
      pushBlock(blocks, "blank", "", indentLevel, tag);
    }
    return;
  }

  const fallbackText = normalizeBlockText(node.textContent);
  if (fallbackText.length > 0) {
    pushBlock(blocks, inQuote ? "quote" : "paragraph", fallbackText, indentLevel, tag);
  }
}

function trimBoundaryBlankBlocks(blocks: BodyBlock[]): BodyBlock[] {
  let start = 0;
  let end = blocks.length;

  while (start < end && blocks[start].type === "blank") {
    start += 1;
  }

  while (end > start && blocks[end - 1].type === "blank") {
    end -= 1;
  }

  return blocks.slice(start, end);
}

function parseBodyBlocks(strippedBody: HTMLElement | null): BodyBlock[] {
  if (!strippedBody) {
    return [];
  }

  const blocks: BodyBlock[] = [];
  for (const childNode of Array.from(strippedBody.childNodes)) {
    parseNode(childNode, blocks, 0, false);
  }

  if (blocks.length === 0) {
    const text = normalizeBlockText(strippedBody.innerText || strippedBody.textContent);
    if (text.length > 0) {
      blocks.push({
        type: "paragraph",
        text,
        indentLevel: 0,
        sourceTag: "body"
      });
    }
  }

  return trimBoundaryBlankBlocks(blocks);
}

function isComposeRoot(root: HTMLElement): boolean {
  const hasBody = Boolean(getBodyElement(root));
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
  const body = getBodyElement(composeRoot);
  const strippedBody = body ? stripQuotedContent(body) : null;
  const bodyBlocks = parseBodyBlocks(strippedBody);

  // Derive bodyRaw from the DOM-walked blocks rather than innerText on the
  // disconnected clone. Chrome skips block-level newlines for off-DOM nodes,
  // so innerText collapses "Good Morning,\n\nHi" into "Good Morning,Hi",
  // which makes LanguageTool flag the comma as missing a space.
  const bodyRaw =
    bodyBlocks.length > 0
      ? bodyBlocks.map((b) => (b.type === "blank" ? "" : b.text)).join("\n")
      : cleanRawText(strippedBody?.innerText ?? strippedBody?.textContent);

  return {
    toCount: parseRecipientCount(composeRoot),
    hasAttachment: parseHasAttachment(composeRoot),
    subject: parseSubject(composeRoot),
    bodyText: cleanText(bodyRaw),
    bodyRaw,
    bodyBlocks
  };
}
