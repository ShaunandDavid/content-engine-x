"use client";

export type AdamState = "idle" | "listening" | "thinking" | "speaking";

export const AdamOrb = ({
  state = "idle",
  onClick,
  ariaLabel = "Interact with Adam",
  disabled = false
}: {
  state?: AdamState;
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}) => {
  return (
    <div className="adam-orb-container">
      <div
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-disabled={disabled}
        className={`adam-orb ${state} ${disabled ? "is-disabled" : ""}`}
        onClick={disabled ? undefined : onClick}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick?.();
          }
        }}
      />
    </div>
  );
};
