/** A link handed from the Links list to the Link preview panel. */
export interface Handoff {
  /** What Paseo's browser opens: the link itself, or a local file served over http. */
  url: string;
  /** The `file://` link, when this is a local file, so the OS can open it instead. */
  file?: string;
  /** A new number per hand-off, so asking for the same link twice opens it twice. */
  token: number;
}

/**
 * The last link handed off in each chat. A composer popover has no way to open Paseo's browser,
 * but a panel does, so a link travels through here to the panel open on that chat.
 */
const handed = new Map<string, Handoff>();
const listeners = new Set<() => void>();
let tokens = 0;

export function handOff(agentId: string, handoff: Omit<Handoff, "token">) {
  handed.set(agentId, { ...handoff, token: ++tokens });
  for (const listener of listeners) listener();
}

export function handoffFor(agentId: string) {
  return handed.get(agentId) ?? null;
}

export function subscribeHandoffs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
