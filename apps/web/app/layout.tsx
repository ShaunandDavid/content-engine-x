import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Project Enoch | Content Engine X",
    template: "%s | Project Enoch | Content Engine X"
  },
  description: "Project Enoch brings voice planning, project creation, and render orchestration together inside Content Engine X."
};

const themeBootScript = `(() => {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.style.colorScheme = "dark";
  document.documentElement.classList.add("dark");
})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
