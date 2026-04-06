"use client";

import type { CSSProperties, PointerEvent } from "react";

export type EnochState = "idle" | "listening" | "thinking" | "speaking" | "error";
export type EnochOrbSignalSource =
  | "idle_motion"
  | "microphone_rms"
  | "speech_boundary_cadence"
  | "tts_audio_rms"
  | "tts_playback_cadence"
  | "state_only";

const clampSignal = (value: number) => Math.min(1, Math.max(0.08, value));

export const EnochOrb = ({
  state = "idle",
  signalLevel = 0.18,
  signalSource = "idle_motion",
  onClick,
  ariaLabel = "Interact with Enoch",
  disabled = false
}: {
  state?: EnochState;
  signalLevel?: number;
  signalSource?: EnochOrbSignalSource;
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
    <div className="enoch-orb-container">
      <button
        type="button"
        aria-label={ariaLabel}
        className={`enoch-orb enoch-orb--${state} enoch-orb--source-${signalSource} ${disabled ? "is-disabled" : ""}`}
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
        <span className="enoch-orb__backlight" aria-hidden="true" />
        <span className="enoch-orb__halo enoch-orb__halo--outer" aria-hidden="true" />
        <span className="enoch-orb__halo enoch-orb__halo--mid" aria-hidden="true" />
        <span className="enoch-orb__halo enoch-orb__halo--inner" aria-hidden="true" />
        <span className="enoch-orb__shell" aria-hidden="true">
          <span className="enoch-orb__plasma enoch-orb__plasma--primary" />
          <span className="enoch-orb__plasma enoch-orb__plasma--secondary" />
          <span className="enoch-orb__caustic" />
          <span className="enoch-orb__ring enoch-orb__ring--major" />
          <span className="enoch-orb__ring enoch-orb__ring--minor" />
          <span className="enoch-orb__mesh" />
          <span className="enoch-orb__core">
            <span className="enoch-orb__glint enoch-orb__glint--primary" />
            <span className="enoch-orb__glint enoch-orb__glint--secondary" />
            <span className="enoch-orb__glint enoch-orb__glint--tertiary" />
            <span className="enoch-orb__kernel" />
          </span>
        </span>
      </button>
    </div>
  );
};
