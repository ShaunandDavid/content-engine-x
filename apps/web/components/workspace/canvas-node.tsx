"use client";

import React, { useState, ReactNode } from "react";

interface CanvasNodeProps {
  id: string;
  initialX: number;
  initialY: number;
  title: string;
  children: ReactNode;
}

export const CanvasNode = ({ id, initialX, initialY, title, children }: CanvasNodeProps) => {
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
