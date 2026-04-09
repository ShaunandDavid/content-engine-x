"use client";

import { useState, type FormEvent } from "react";

type BrandFormState = {
  brand_name: string;
  industry: string;
  brand_tagline: string;
  brand_voice: string;
  target_audience: string;
  visual_style: string;
  primary_color: string;
  tone_adjectives_text: string;
  audience_pain_points_text: string;
  avoid_patterns_text: string;
};

const initialState: BrandFormState = {
  brand_name: "",
  industry: "",
  brand_tagline: "",
  brand_voice: "",
  target_audience: "",
  visual_style: "",
  primary_color: "#000000",
  tone_adjectives_text: "",
  audience_pain_points_text: "",
  avoid_patterns_text: "",
};

const splitTags = (value: string): string[] =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

type BrandProfileFormProps = {
  operatorUserId: string;
  projectId?: string;
  onSaved?: (profileId: string) => void;
};

export function BrandProfileForm({ operatorUserId, projectId, onSaved }: BrandProfileFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<BrandFormState>(initialState);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof BrandFormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      operator_user_id: operatorUserId,
      ...(projectId ? { project_id: projectId } : {}),
      brand_name: form.brand_name,
      industry: form.industry,
      brand_tagline: form.brand_tagline || null,
      brand_voice: form.brand_voice,
      target_audience: form.target_audience,
      visual_style: form.visual_style || null,
      primary_color: form.primary_color || null,
      tone_adjectives: splitTags(form.tone_adjectives_text),
      audience_pain_points: splitTags(form.audience_pain_points_text),
      avoid_patterns: splitTags(form.avoid_patterns_text),
    };

    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to save brand profile.");
      }

      const saved = await res.json();
      setSaved(true);
      setIsOpen(false);
      onSaved?.(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="brand-profile-block">
      <button
        type="button"
        className="brand-profile-toggle"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
      >
        <span className="brand-profile-toggle__label">
          {saved ? "Brand Identity — saved" : "Brand Identity"}
          {!saved && <span className="brand-profile-toggle__hint"> — optional</span>}
        </span>
        <span className="brand-profile-toggle__chevron" aria-hidden>
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {isOpen && (
        <form className="brand-profile-form" onSubmit={handleSubmit} noValidate>
          <p className="brand-profile-form__description">
            Enoch reads this before generating any concept, scene, or prompt.
            Profiles saved here are matched to your operator account and injected automatically.
          </p>

          <div className="brand-profile-form__row brand-profile-form__row--half">
            <div className="brand-profile-form__field">
              <label className="form-label" htmlFor="bp-brand-name">Brand name</label>
              <input
                id="bp-brand-name"
                className="form-input"
                type="text"
                placeholder="XenTeck"
                value={form.brand_name}
                onChange={set("brand_name")}
                required
              />
            </div>
            <div className="brand-profile-form__field">
              <label className="form-label" htmlFor="bp-industry">Industry</label>
              <input
                id="bp-industry"
                className="form-input"
                type="text"
                placeholder="AI Services"
                value={form.industry}
                onChange={set("industry")}
                required
              />
            </div>
          </div>

          <div className="brand-profile-form__field">
            <label className="form-label" htmlFor="bp-tagline">Tagline <span className="brand-profile-form__optional">(optional)</span></label>
            <input
              id="bp-tagline"
              className="form-input"
              type="text"
              placeholder="Speed to revenue."
              value={form.brand_tagline}
              onChange={set("brand_tagline")}
            />
          </div>

          <div className="brand-profile-form__row brand-profile-form__row--half">
            <div className="brand-profile-form__field">
              <label className="form-label" htmlFor="bp-voice">Brand voice</label>
              <select
                id="bp-voice"
                className="form-select"
                value={form.brand_voice}
                onChange={set("brand_voice")}
                required
              >
                <option value="">Select voice</option>
                <option value="authoritative">Authoritative</option>
                <option value="playful">Playful</option>
                <option value="urgent">Urgent</option>
                <option value="aspirational">Aspirational</option>
                <option value="educational">Educational</option>
                <option value="raw">Raw / Unfiltered</option>
              </select>
            </div>
            <div className="brand-profile-form__field">
              <label className="form-label" htmlFor="bp-visual-style">Visual style <span className="brand-profile-form__optional">(optional)</span></label>
              <input
                id="bp-visual-style"
                className="form-input"
                type="text"
                placeholder="dark industrial electric blue"
                value={form.visual_style}
                onChange={set("visual_style")}
              />
            </div>
          </div>

          <div className="brand-profile-form__field">
            <label className="form-label" htmlFor="bp-audience">Target audience</label>
            <input
              id="bp-audience"
              className="form-input"
              type="text"
              placeholder="Small business owners aged 30-50"
              value={form.target_audience}
              onChange={set("target_audience")}
              required
            />
          </div>

          <div className="brand-profile-form__row brand-profile-form__row--color">
            <div className="brand-profile-form__field">
              <label className="form-label" htmlFor="bp-color">Primary color</label>
              <div className="brand-profile-form__color-row">
                <input
                  id="bp-color"
                  className="form-color-picker"
                  type="color"
                  value={form.primary_color}
                  onChange={set("primary_color")}
                />
                <input
                  className="form-input form-input--color-hex"
                  type="text"
                  placeholder="#00D4FF"
                  value={form.primary_color}
                  onChange={set("primary_color")}
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
            </div>
          </div>

          <div className="brand-profile-form__field">
            <label className="form-label" htmlFor="bp-tone">Tone adjectives <span className="brand-profile-form__optional">(comma-separated)</span></label>
            <input
              id="bp-tone"
              className="form-input"
              type="text"
              placeholder="bold, direct, no-fluff"
              value={form.tone_adjectives_text}
              onChange={set("tone_adjectives_text")}
            />
          </div>

          <div className="brand-profile-form__field">
            <label className="form-label" htmlFor="bp-pain-points">Audience pain points <span className="brand-profile-form__optional">(comma-separated)</span></label>
            <input
              id="bp-pain-points"
              className="form-input"
              type="text"
              placeholder="losing leads, no systems, wasting ad spend"
              value={form.audience_pain_points_text}
              onChange={set("audience_pain_points_text")}
            />
          </div>

          <div className="brand-profile-form__field">
            <label className="form-label" htmlFor="bp-avoid">Avoid these patterns <span className="brand-profile-form__optional">(comma-separated)</span></label>
            <input
              id="bp-avoid"
              className="form-input"
              type="text"
              placeholder="talking heads only, stock footage feel, corporate stiff"
              value={form.avoid_patterns_text}
              onChange={set("avoid_patterns_text")}
            />
          </div>

          {error && <p className="brand-profile-form__error">{error}</p>}

          <div className="brand-profile-form__actions">
            <button
              type="submit"
              className="form-submit brand-profile-form__submit"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save brand profile"}
            </button>
            <button
              type="button"
              className="brand-profile-form__cancel"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <style>{`
        .brand-profile-block {
          border: 1px solid var(--line);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 1.5rem;
        }
        .brand-profile-toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1rem;
          background: var(--surface);
          border: none;
          cursor: pointer;
          text-align: left;
          color: var(--ink);
          font-size: 0.8125rem;
          font-weight: 500;
          letter-spacing: 0.03em;
          transition: background 0.15s;
        }
        .brand-profile-toggle:hover {
          background: var(--field-bg);
        }
        .brand-profile-toggle__hint {
          color: var(--muted);
          font-weight: 400;
        }
        .brand-profile-toggle__chevron {
          color: var(--muted);
          font-size: 1rem;
          line-height: 1;
          user-select: none;
        }
        .brand-profile-form {
          padding: 1.25rem 1rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          border-top: 1px solid var(--line);
          background: var(--bg);
        }
        .brand-profile-form__description {
          font-size: 0.75rem;
          color: var(--muted);
          line-height: 1.5;
          margin: 0;
        }
        .brand-profile-form__row {
          display: grid;
          gap: 0.75rem;
        }
        .brand-profile-form__row--half {
          grid-template-columns: 1fr 1fr;
        }
        @media (max-width: 540px) {
          .brand-profile-form__row--half {
            grid-template-columns: 1fr;
          }
        }
        .brand-profile-form__field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .brand-profile-form__optional {
          color: var(--muted);
          font-weight: 400;
          font-size: 0.75em;
        }
        .brand-profile-form__color-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .form-color-picker {
          width: 2.25rem;
          height: 2.25rem;
          border: 1px solid var(--line);
          border-radius: 4px;
          padding: 0.125rem;
          background: var(--field-bg);
          cursor: pointer;
          flex-shrink: 0;
        }
        .form-input--color-hex {
          flex: 1;
        }
        .brand-profile-form__error {
          font-size: 0.8125rem;
          color: var(--danger);
          margin: 0;
          padding: 0.5rem 0.75rem;
          background: var(--danger-bg);
          border: 1px solid var(--danger-line);
          border-radius: 4px;
        }
        .brand-profile-form__actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding-top: 0.25rem;
        }
        .brand-profile-form__submit {
          flex-shrink: 0;
        }
        .brand-profile-form__cancel {
          background: none;
          border: none;
          color: var(--muted);
          font-size: 0.8125rem;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .brand-profile-form__cancel:hover {
          color: var(--ink);
        }
      `}</style>
    </div>
  );
}
