"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "content-engine-x-theme";

const resolveTheme = (): Theme => {
  if (typeof document === "undefined") {
    return "light";
  }

  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.classList.toggle("dark", theme === "dark");
};

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const syncTheme = () => {
      let nextTheme: Theme = resolveTheme();

      try {
        const storedTheme = window.localStorage.getItem(STORAGE_KEY);
        if (storedTheme === "light" || storedTheme === "dark") {
          nextTheme = storedTheme;
        } else {
          nextTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
      } catch {
        nextTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }

      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    syncTheme();
    setMounted(true);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      try {
        const storedTheme = window.localStorage.getItem(STORAGE_KEY);
        if (storedTheme === "light" || storedTheme === "dark") {
          return;
        }
      } catch {
        // Ignore storage read failures and fall through to syncing the system theme.
      }

      syncTheme();
    };

    mediaQuery.addEventListener("change", handleMediaChange);

    return () => {
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  const setExplicitTheme = (nextTheme: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Ignore storage write failures and still apply the theme in memory.
    }

    applyTheme(nextTheme);
    setTheme(nextTheme);
  };

  const activeTheme = mounted ? theme : null;

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      <button
        type="button"
        className={activeTheme === "light" ? "theme-toggle__button theme-toggle__button--active" : "theme-toggle__button"}
        onClick={() => setExplicitTheme("light")}
        aria-pressed={activeTheme === "light"}
      >
        Light
      </button>
      <button
        type="button"
        className={activeTheme === "dark" ? "theme-toggle__button theme-toggle__button--active" : "theme-toggle__button"}
        onClick={() => setExplicitTheme("dark")}
        aria-pressed={activeTheme === "dark"}
      >
        Dark
      </button>
    </div>
  );
};
