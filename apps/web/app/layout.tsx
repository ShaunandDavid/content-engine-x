import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeToggle } from "../components/theme-toggle";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Project Enoch | Content Engine X",
    template: "%s | Project Enoch | Content Engine X"
  },
  description: "Project Enoch brings voice planning, project creation, and render orchestration together inside Content Engine X."
};

const themeBootScript = `(() => {
  try {
    const storageKey = "content-engine-x-theme";
    const storedTheme = window.localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : prefersDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
    document.documentElement.classList.remove("dark");
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
