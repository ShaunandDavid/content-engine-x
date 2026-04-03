"use client";

import React, { useState, useRef } from "react";

export const InfiniteCanvas = ({ children }: { children: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 36, y: 32, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  
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
      ref={containerRef}
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
};
