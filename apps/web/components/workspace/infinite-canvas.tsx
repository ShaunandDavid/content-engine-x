"use client";

import { forwardRef, useEffect, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from "react";

export type CanvasTransform = {
  x: number;
  y: number;
  scale: number;
};

type LegacyInfiniteCanvasProps = {
  children: ReactNode;
};

type StudioInfiniteCanvasProps = {
  children: ReactNode;
  transform: CanvasTransform;
  onTransformChange: (transform: CanvasTransform) => void;
  gridEnabled: boolean;
};

type InfiniteCanvasProps = LegacyInfiniteCanvasProps | StudioInfiniteCanvasProps;

const isStudioInfiniteCanvas = (props: InfiniteCanvasProps): props is StudioInfiniteCanvasProps =>
  "transform" in props && typeof props.onTransformChange === "function";

const LegacyInfiniteCanvas = forwardRef<HTMLDivElement, LegacyInfiniteCanvasProps>(function LegacyInfiniteCanvas(
  { children },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<CanvasTransform>({ x: 36, y: 32, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);

  const setRefs = (element: HTMLDivElement | null) => {
    containerRef.current = element;

    if (typeof ref === "function") {
      ref(element);
      return;
    }

    if (ref) {
      ref.current = element;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only intercept if we clicked the background, not an artifact node.
    if ((e.target as HTMLElement).classList.contains("ws-canvas-bg")) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsPanning(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isPanning) return;
    setTransform(prev => ({
      ...prev,
      x: prev.x + e.movementX,
      y: prev.y + e.movementY
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsPanning(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom logic mapping
      const zoomSensitivity = 0.005;
      const zoomDelta = -e.deltaY * zoomSensitivity;
      setTransform(prev => ({
        ...prev,
        scale: Math.min(Math.max(0.1, prev.scale + zoomDelta), 3)
      }));
    } else {
      // Native trackpad panning
      setTransform(prev => ({
        ...prev,
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  };

  return (
    <div
      ref={setRefs}
      className="ws-canvas-viewport"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="ws-canvas-bg" style={{ cursor: isPanning ? "grabbing" : "grab" }} />
      <div 
        className="ws-canvas-plane"
        style={{ 
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0"
        }}
      >
        <div className="ws-canvas-content">
          {children}
        </div>
      </div>
    </div>
  );
});

const clampScale = (value: number) => Math.min(1.75, Math.max(0.5, value));

const StudioInfiniteCanvas = forwardRef<HTMLDivElement, StudioInfiniteCanvasProps>(function StudioInfiniteCanvas(
  { children, transform, onTransformChange, gridEnabled },
  ref
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [ctrlPressed, setCtrlPressed] = useState(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const originRef = useRef<CanvasTransform | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCtrlPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") {
        setCtrlPressed(false);
        if (isPanning) {
          setIsPanning(false);
          startPointRef.current = null;
          originRef.current = null;
          const activePointerId = pointerIdRef.current;
          if (
            activePointerId !== null &&
            viewportRef.current &&
            viewportRef.current.hasPointerCapture(activePointerId)
          ) {
            viewportRef.current.releasePointerCapture(activePointerId);
          }
          pointerIdRef.current = null;
        }
      }
    };

    const handleBlur = () => {
      setCtrlPressed(false);
      setIsPanning(false);
      startPointRef.current = null;
      originRef.current = null;
      pointerIdRef.current = null;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isPanning]);

  const setRefs = (element: HTMLDivElement | null) => {
    viewportRef.current = element;

    if (typeof ref === "function") {
      ref(element);
      return;
    }

    if (ref) {
      ref.current = element;
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.ctrlKey) {
      return;
    }

    if (
      event.target.closest(
        ".studio-node, .studio-composer, .studio-tool-rail, .studio-board__canvas-actions, input, textarea, select, button, a, label"
      )
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    startPointRef.current = { x: event.clientX, y: event.clientY };
    originRef.current = transform;
    pointerIdRef.current = event.pointerId;
    setIsPanning(true);
  };

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    startPointRef.current = null;
    originRef.current = null;
    pointerIdRef.current = null;
    setIsPanning(false);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !startPointRef.current || !originRef.current) {
      return;
    }

    if (!event.ctrlKey) {
      endPan(event);
      return;
    }

    onTransformChange({
      ...originRef.current,
      x: originRef.current.x + (event.clientX - startPointRef.current.x),
      y: originRef.current.y + (event.clientY - startPointRef.current.y)
    });
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const rect = event.currentTarget.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const nextScale = clampScale(transform.scale - event.deltaY * 0.0012);
      const worldX = (pointerX - transform.x) / transform.scale;
      const worldY = (pointerY - transform.y) / transform.scale;

      onTransformChange({
        scale: nextScale,
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale
      });
      return;
    }

    onTransformChange({
      ...transform,
      x: transform.x - event.deltaX,
      y: transform.y - event.deltaY
    });
  };

  return (
    <div
      ref={setRefs}
      className={`studio-canvas${gridEnabled ? "" : " studio-canvas--gridless"}${ctrlPressed ? " studio-canvas--pan-ready" : ""}${isPanning ? " studio-canvas--panning" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={handleWheel}
    >
      <div className="studio-canvas__background" data-canvas-background="true" />
      <div
        className="studio-canvas__plane"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
        }}
      >
        <div className="studio-canvas__content">{children}</div>
      </div>
    </div>
  );
});

export const InfiniteCanvas = forwardRef<HTMLDivElement, InfiniteCanvasProps>(function InfiniteCanvas(props, ref) {
  return isStudioInfiniteCanvas(props) ? (
    <StudioInfiniteCanvas {...props} ref={ref} />
  ) : (
    <LegacyInfiniteCanvas {...props} ref={ref} />
  );
});
