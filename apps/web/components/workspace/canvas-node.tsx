"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

type NodeViewState = "compact" | "expanded" | "pinned";

type LegacyCanvasNodeProps = {
  id: string;
  initialX: number;
  initialY: number;
  title: string;
  children: ReactNode;
};

type StudioCanvasNodeProps = {
  id: string;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  zIndex: number;
  kindClass: string;
  state: NodeViewState;
  scale: number;
  dragDisabled?: boolean;
  removable?: boolean;
  onBringToFront: (id: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onStateChange: (id: string, state: NodeViewState) => void;
  onRemove?: (id: string) => void;
  children: ReactNode;
};

export type CanvasNodeProps = LegacyCanvasNodeProps | StudioCanvasNodeProps;

const isLegacyCanvasNode = (props: CanvasNodeProps): props is LegacyCanvasNodeProps => "initialX" in props;

const LegacyCanvasNode = ({ initialX, initialY, title, children }: LegacyCanvasNodeProps) => {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation(); // Block the main canvas from picking up the pan event
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPos(p => ({ x: p.x + e.movementX, y: p.y + e.movementY }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div 
      className={`ws-node ${isDragging ? "ws-node--dragging" : ""}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="ws-node-header">{title}</div>
      <div className="ws-node-content">{children}</div>
    </div>
  );
};

const StudioCanvasNode = ({
  id,
  title,
  subtitle,
  x,
  y,
  zIndex,
  kindClass,
  state,
  scale,
  dragDisabled = false,
  removable = false,
  onBringToFront,
  onPositionChange,
  onStateChange,
  onRemove,
  children
}: StudioCanvasNodeProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const handleDragStart = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragDisabled) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    startPointRef.current = { x: event.clientX, y: event.clientY };
    originRef.current = { x, y };
    setIsDragging(true);
    onBringToFront(id);
  };

  const handleDragMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!isDragging || !startPointRef.current || !originRef.current) {
      return;
    }

    onPositionChange(id, {
      x: originRef.current.x + (event.clientX - startPointRef.current.x) / scale,
      y: originRef.current.y + (event.clientY - startPointRef.current.y) / scale
    });
  };

  const handleDragEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    startPointRef.current = null;
    originRef.current = null;
    setIsDragging(false);
  };

  return (
    <article
      className={`studio-node ${kindClass} studio-node--${state}${isDragging ? " studio-node--dragging" : ""}${dragDisabled ? " studio-node--locked" : ""}`}
      style={{
        transform: `translate(${x}px, ${y}px)`,
        zIndex
      }}
      onPointerDown={() => onBringToFront(id)}
    >
      <header className="studio-node__header">
        <div className="studio-node__identity">
          <button
            type="button"
            className="studio-node__drag-handle"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
            aria-label={dragDisabled ? `${title} is pinned in place` : `Drag ${title}`}
            disabled={dragDisabled}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="studio-node__heading">
            <strong>{title}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </div>
        <div className="studio-node__controls">
          <span className={`truth-pill truth-pill--state truth-pill--state-${state}`}>{state}</span>
          <button
            type="button"
            className="studio-node__control"
            onClick={(event) => {
              event.stopPropagation();
              onStateChange(id, state === "compact" ? "expanded" : "compact");
            }}
          >
            {state === "compact" ? "Expand" : "Compact"}
          </button>
          <button
            type="button"
            className="studio-node__control"
            onClick={(event) => {
              event.stopPropagation();
              onStateChange(id, state === "pinned" ? "expanded" : "pinned");
            }}
          >
            {state === "pinned" ? "Unpin" : "Pin"}
          </button>
          {removable && onRemove ? (
            <button
              type="button"
              className="studio-node__control studio-node__control--danger"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(id);
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      </header>
      <div className="studio-node__body">{children}</div>
    </article>
  );
};

export const CanvasNode = (props: CanvasNodeProps) =>
  isLegacyCanvasNode(props) ? <LegacyCanvasNode {...props} /> : <StudioCanvasNode {...props} />;
