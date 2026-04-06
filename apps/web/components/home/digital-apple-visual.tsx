import type { CSSProperties } from "react";

const glyphs = ["<>", "{}", "fn", "::", "/>", "0x", "[]", "=>", "if", "let", "map", "ts"];

const particles = Array.from({ length: 44 }, (_, index) => ({
  id: `particle-${index}`,
  x: 14 + ((index * 17) % 68),
  y: 12 + ((index * 23) % 72),
  size: 1.8 + ((index * 7) % 6) * 0.28,
  delay: `${(index % 9) * 0.42}s`,
  duration: `${8 + (index % 5)}s`
}));

const codeRows = Array.from({ length: 12 }, (_, rowIndex) => ({
  id: `row-${rowIndex}`,
  y: 66 + rowIndex * 27,
  text: `${glyphs[rowIndex % glyphs.length]}  enoch.runtime  ${glyphs[(rowIndex + 3) % glyphs.length]}  workflow.sync`
}));

export const DigitalAppleVisual = () => (
  <div className="digital-apple-visual" aria-hidden="true">
    <div className="digital-apple-visual__halo digital-apple-visual__halo--outer" />
    <div className="digital-apple-visual__halo digital-apple-visual__halo--inner" />

    <div className="digital-apple-visual__stage">
      <svg
        className="digital-apple-visual__svg"
        viewBox="0 0 460 520"
        role="presentation"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="enochAppleStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
            <stop offset="55%" stopColor="rgba(186, 202, 241, 0.62)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.18)" />
          </linearGradient>
          <radialGradient id="enochAppleFill" cx="50%" cy="36%" r="72%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.84)" />
            <stop offset="58%" stopColor="rgba(215,223,238,0.34)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
          </radialGradient>
          <clipPath id="enochAppleClip">
            <path d="M227 108C263 53 338 45 364 106C379 141 375 181 353 212C400 253 421 314 421 375C421 462 356 500 281 500C247 500 228 490 214 482C200 490 181 500 147 500C72 500 7 462 7 375C7 313 29 252 76 211C54 180 49 140 64 106C90 45 165 53 201 108C212 125 216 130 214 130C212 130 216 125 227 108Z" />
          </clipPath>
        </defs>

        <g className="digital-apple-visual__leaf">
          <path
            d="M258 45C276 18 313 5 338 22C321 48 290 71 257 78C251 66 251 56 258 45Z"
            fill="rgba(227, 236, 255, 0.72)"
          />
          <path
            d="M267 48C287 23 313 14 332 23"
            fill="none"
            stroke="rgba(15,23,42,0.18)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </g>

        <g className="digital-apple-visual__body">
          <path
            d="M227 108C263 53 338 45 364 106C379 141 375 181 353 212C400 253 421 314 421 375C421 462 356 500 281 500C247 500 228 490 214 482C200 490 181 500 147 500C72 500 7 462 7 375C7 313 29 252 76 211C54 180 49 140 64 106C90 45 165 53 201 108C212 125 216 130 214 130C212 130 216 125 227 108Z"
            fill="url(#enochAppleFill)"
            stroke="url(#enochAppleStroke)"
            strokeWidth="1.4"
          />

          <g clipPath="url(#enochAppleClip)">
            <rect x="0" y="0" width="460" height="520" fill="rgba(255,255,255,0.02)" />

            {codeRows.map((row) => (
              <text
                key={row.id}
                x="38"
                y={row.y}
                className="digital-apple-visual__code-row"
              >
                {row.text}
              </text>
            ))}

            {particles.map((particle) => (
              <g
                key={particle.id}
                className="digital-apple-visual__particle"
                style={
                  {
                    "--particle-delay": particle.delay,
                    "--particle-duration": particle.duration
                  } as CSSProperties
                }
              >
                <circle
                  cx={`${particle.x}%`}
                  cy={`${particle.y}%`}
                  r={particle.size}
                  fill="rgba(214, 226, 255, 0.72)"
                />
                <text
                  x={`${Math.min(particle.x + 2, 92)}%`}
                  y={`${Math.min(particle.y + 3, 94)}%`}
                  className="digital-apple-visual__glyph"
                >
                  {glyphs[particle.x % glyphs.length]}
                </text>
              </g>
            ))}

            <path
              d="M72 210C139 176 192 170 246 190C292 207 337 210 396 192"
              className="digital-apple-visual__flow"
            />
            <path
              d="M57 292C128 262 187 259 237 278C285 296 336 301 401 286"
              className="digital-apple-visual__flow digital-apple-visual__flow--secondary"
            />
            <path
              d="M71 370C129 350 183 346 231 360C290 377 334 383 392 372"
              className="digital-apple-visual__flow"
            />
          </g>
        </g>
      </svg>
    </div>
  </div>
);
