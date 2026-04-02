"use client";

import type { AdamConversationTurn } from "@content-engine/shared";
import { adamConversationTurnSchema } from "@content-engine/shared";

const ADAM_SESSION_STORAGE_KEY = "content-engine-x.adam.session-id";
const ADAM_HISTORY_STORAGE_KEY = "content-engine-x.adam.session-history";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STORED_TURNS = 24;

const isValidSessionId = (value: string | null): value is string => Boolean(value && UUID_PATTERN.test(value));

export const readAdamSessionId = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.sessionStorage.getItem(ADAM_SESSION_STORAGE_KEY);
    return isValidSessionId(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeAdamSessionId = (sessionId: string) => {
  if (typeof window === "undefined" || !isValidSessionId(sessionId)) {
    return;
  }

  try {
    window.sessionStorage.setItem(ADAM_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage write failures so Adam voice remains usable.
  }
};

export const clearAdamSessionId = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ADAM_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage clear failures so Adam voice remains usable.
  }
};

export const readAdamConversationHistory = (): AdamConversationTurn[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(ADAM_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => adamConversationTurnSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data)
      .slice(-MAX_STORED_TURNS);
  } catch {
    return [];
  }
};

export const writeAdamConversationHistory = (history: AdamConversationTurn[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(ADAM_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-MAX_STORED_TURNS)));
  } catch {
    // Ignore storage write failures so Adam voice remains usable.
  }
};

export const clearAdamConversationHistory = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ADAM_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage clear failures so Adam voice remains usable.
  }
};
