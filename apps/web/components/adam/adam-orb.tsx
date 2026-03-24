"use client";

export type AdamState = "idle" | "listening" | "thinking" | "speaking";

export const AdamOrb = ({ state = "idle", onClick }: { state?: AdamState; onClick?: () => void }) => {
  return (
    <div className="adam-orb-container">
      <div 
        role="button"
        tabIndex={0}
        aria-label="Interact with Adam"
        className={`adam-orb ${state}`} 
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        }}
      />
    </div>
  );
};
