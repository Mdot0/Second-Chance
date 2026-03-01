import { SEND_BYPASS_ATTR, isBypassSend } from "./sendTrigger";

export { isBypassSend };

const OUTLOOK_SEND_SELECTORS = [
  'button[aria-label="Send"]',
  '[role="button"][aria-label="Send"]'
];

const SEND_CLICK_SUPPRESS_MS = 250;

export function findOutlookSendButton(composeRoot: HTMLElement): HTMLElement | null {
  for (const selector of OUTLOOK_SEND_SELECTORS) {
    const button = composeRoot.querySelector<HTMLElement>(selector);
    if (button) return button;
  }
  return null;
}

export function findOutlookSendButtonFromTarget(target: EventTarget | null): HTMLElement | null {
  let element: Element | null = null;
  if (target instanceof Element) {
    element = target;
  } else if (target instanceof Node) {
    element = target.parentElement;
  }
  if (!element) return null;

  for (const selector of OUTLOOK_SEND_SELECTORS) {
    const button = element.closest<HTMLElement>(selector);
    if (button) return button;
  }
  return null;
}

export function triggerOutlookNativeSend(
  composeRoot: HTMLElement,
  preferredButton?: HTMLElement | null
): boolean {
  const button =
    preferredButton && preferredButton.isConnected
      ? preferredButton
      : findOutlookSendButton(composeRoot);
  if (!button) return false;

  button.setAttribute(SEND_BYPASS_ATTR, "true");
  button.click();
  window.setTimeout(() => button.removeAttribute(SEND_BYPASS_ATTR), SEND_CLICK_SUPPRESS_MS);
  return true;
}
