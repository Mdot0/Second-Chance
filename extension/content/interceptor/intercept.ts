import { findComposeRootFromNode } from "./composeContext";
import {
  findSendButtonFromTarget,
  isBypassSend,
  isSendShortcut
} from "./sendTrigger";

export type SendAttempt = {
  composeRoot: HTMLElement;
  trigger: "click" | "shortcut";
  event: Event;
};

export function startSendInterception(onAttempt: (attempt: SendAttempt) => void): () => void {
  const onClick = (event: MouseEvent): void => {
    const sendButton = findSendButtonFromTarget(event.target);
    if (!sendButton || isBypassSend(sendButton)) {
      return;
    }

    const composeRoot = findComposeRootFromNode(sendButton);
    if (!composeRoot) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    onAttempt({ composeRoot, trigger: "click", event });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isSendShortcut(event)) {
      return;
    }

    const composeRoot = findComposeRootFromNode(event.target as Node | null);
    if (!composeRoot) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    onAttempt({ composeRoot, trigger: "shortcut", event });
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
