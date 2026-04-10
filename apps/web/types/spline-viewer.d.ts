import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "spline-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        url: string;
        loading?: "auto" | "lazy" | "eager";
        background?: string;
        width?: string;
        height?: string;
        hint?: boolean;
        unloadable?: boolean;
        "loading-anim"?: boolean;
        "loading-anim-type"?: string;
        "events-target"?: "local" | "global";
      };
    }
  }
}

export {};
