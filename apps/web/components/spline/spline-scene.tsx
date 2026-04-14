"use client";

import Script from "next/script";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";

type Props = {
  scene: string;
  className?: string;
  stageClassName?: string;
  fallback?: ReactNode;
  decorative?: boolean;
  eager?: boolean;
};

export const SplineScene = ({
  scene,
  className,
  stageClassName,
  fallback,
  decorative = true,
  eager = false
}: Props) => {
  const viewerRef = useRef<HTMLElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const isHanaScene = scene.endsWith(".hanacode");
  const scriptSrc = isHanaScene
    ? "https://cdn.spline.design/@splinetool/hana-viewer@1.2.51/hana-viewer.js"
    : "https://unpkg.com/@splinetool/viewer/build/spline-viewer.js";
  const viewerTagName = isHanaScene ? "hana-viewer" : "spline-viewer";

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const handleLoadComplete = () => setLoaded(true);
    viewer.addEventListener("load-complete", handleLoadComplete);

    return () => viewer.removeEventListener("load-complete", handleLoadComplete);
  }, [scene]);

  return (
    <>
      <Script src={scriptSrc} type="module" strategy="afterInteractive" />
      <div
        className={cn("relative h-full w-full overflow-hidden", decorative && "pointer-events-none", className)}
        aria-hidden={decorative || undefined}
      >
        <div className={cn("absolute inset-0 transition-opacity duration-500", loaded ? "opacity-0" : "opacity-100")}>
          {fallback ?? (
            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(124,58,237,0.3),transparent_45%),radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.2),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))]" />
          )}
        </div>

        <div className={cn("absolute inset-0 transition-opacity duration-700", loaded ? "opacity-100" : "opacity-0", stageClassName)}>
          {viewerTagName === "hana-viewer" ? (
            <hana-viewer ref={viewerRef} url={scene} style={{ width: "100%", height: "100%", background: "transparent" }} />
          ) : (
            <spline-viewer
              ref={viewerRef}
              url={scene}
              loading={eager ? "eager" : "lazy"}
              loading-anim-type="spinner-small-dark"
              style={{ width: "100%", height: "100%", background: "transparent" }}
            />
          )}
        </div>
      </div>
    </>
  );
};
