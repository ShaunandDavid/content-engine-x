"use client";

import type { CSSProperties, PointerEvent } from "react";

export type AdamState = "idle" | "listening" | "thinking" | "speaking" | "error";
export type AdamOrbSignalSource =
  | "idle_motion"
  | "microphone_rms"
  | "speech_boundary_cadence"
  | "tts_audio_rms"
  | "tts_playback_cadence"
  | "state_only";

const clampSignal = (value: number) => Math.min(1, Math.max(0.08, value));

export const AdamOrb = ({
  state = "idle",
  signalLevel = 0.18,
  signalSource = "idle_motion",
  onClick,
  ariaLabel = "Interact with Adam",
  disabled = false
}: {
  state?: AdamState;
  signalLevel?: number;
  signalSource?: AdamOrbSignalSource;
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}) => {
  const normalizedSignal = clampSignal(signalLevel);
  const style = {
    "--orb-signal": normalizedSignal.toFixed(3),
    "--orb-depth": (0.26 + normalizedSignal * 0.74).toFixed(3)
  } as CSSProperties;

  const resetPointerTilt = (element: HTMLButtonElement) => {
    element.style.setProperty("--orb-tilt-x", "0deg");
    element.style.setProperty("--orb-tilt-y", "0deg");
    element.style.setProperty("--orb-pointer-x", "50%");
    element.style.setProperty("--orb-pointer-y", "50%");
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * 100;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * 100;
    const tiltX = ((pointerX - 50) / 50) * 8;
    const tiltY = ((50 - pointerY) / 50) * 8;

    event.currentTarget.style.setProperty("--orb-tilt-x", `${tiltX.toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--orb-tilt-y", `${tiltY.toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--orb-pointer-x", `${pointerX.toFixed(2)}%`);
    event.currentTarget.style.setProperty("--orb-pointer-y", `${pointerY.toFixed(2)}%`);
  };

  return (
    <div className="adam-orb-container">
      <button
        type="button"
        aria-label={ariaLabel}
        className={`adam-orb adam-orb--${state} adam-orb--source-${signalSource} ${disabled ? "is-disabled" : ""}`}
        disabled={disabled}
        style={style}
        onClick={disabled ? undefined : onClick}
        onPointerMove={handlePointerMove}
        onPointerLeave={(event) => {
          resetPointerTilt(event.currentTarget);
        }}
        onBlur={(event) => {
          resetPointerTilt(event.currentTarget);
        }}
      >
        <span className="adam-orb__backlight" aria-hidden="true" />
        <span className="adam-orb__halo adam-orb__halo--outer" aria-hidden="true" />
        <span className="adam-orb__halo adam-orb__halo--mid" aria-hidden="true" />
        <span className="adam-orb__halo adam-orb__halo--inner" aria-hidden="true" />
        <span className="adam-orb__shell" aria-hidden="true">
          <span className="adam-orb__plasma adam-orb__plasma--primary" />
          <span className="adam-orb__plasma adam-orb__plasma--secondary" />
          <span className="adam-orb__caustic" />
          <span className="adam-orb__ring adam-orb__ring--major" />
          <span className="adam-orb__ring adam-orb__ring--minor" />
          <span className="adam-orb__mesh" />
          <span className="adam-orb__core">
            <span className="adam-orb__glint adam-orb__glint--primary" />
            <span className="adam-orb__glint adam-orb__glint--secondary" />
            <span className="adam-orb__glint adam-orb__glint--tertiary" />
            <span className="adam-orb__kernel" />
          </span>
        </span>
      </button>
    </div>
  );
};
