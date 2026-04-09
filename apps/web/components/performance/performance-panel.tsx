"use client";

import { useState } from "react";

interface PerformanceRecord {
  id: string;
  platform: string;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  completion_rate: number;
  click_through_rate: number;
  went_viral: boolean;
  viral_framework: string | null;
  hook_text: string | null;
  concept_title: string | null;
  brand_name: string | null;
  feedback_distilled: boolean;
  published_at: string | null;
}

interface DistillResult {
  processed: number;
  admitted: number;
  rejected: number;
}

interface PerformancePanelProps {
  projectId: string;
  initialRecords?: PerformanceRecord[];
}

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram_reels: "Instagram Reels",
  youtube_shorts: "YouTube Shorts",
};

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        padding: "10px 14px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "6px",
        minWidth: "80px",
      }}
    >
      <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ fontSize: "18px", fontWeight: 600, color: "var(--ink)" }}>{value}</span>
    </div>
  );
}

function ViralBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "3px 10px",
        background: "rgba(255, 200, 0, 0.15)",
        border: "1px solid rgba(255, 200, 0, 0.4)",
        borderRadius: "99px",
        fontSize: "11px",
        fontWeight: 700,
        color: "#c89600",
        letterSpacing: "0.04em",
      }}
    >
      VIRAL
    </span>
  );
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function PerformancePanel({ projectId, initialRecords = [] }: PerformancePanelProps) {
  const [records, setRecords] = useState<PerformanceRecord[]>(initialRecords);
  const [distillResult, setDistillResult] = useState<DistillResult | null>(null);
  const [distilling, setDistilling] = useState(false);
  const [distillError, setDistillError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/performance?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const triggerDistill = async () => {
    setDistilling(true);
    setDistillError(null);
    setDistillResult(null);
    try {
      const res = await fetch("/api/performance/distill", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDistillError(data.error ?? "Distillation failed.");
      } else {
        setDistillResult(data);
        // Refresh records after distillation
        await fetchRecords();
      }
    } catch (err) {
      setDistillError(String(err));
    } finally {
      setDistilling(false);
    }
  };

  const mostRecent = records[0] ?? null;

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "8px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>
            Performance Data
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--muted)" }}>
            Real engagement metrics — feeds back into Enoch&apos;s brain.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={fetchRecords}
            disabled={loading}
            className="button button--secondary"
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={triggerDistill}
            disabled={distilling || records.every((r) => r.feedback_distilled)}
            className="button button--primary"
            style={{ fontSize: "13px", padding: "6px 14px" }}
          >
            {distilling ? "Distilling..." : "Feed to Enoch Brain"}
          </button>
        </div>
      </div>

      {/* Distill result banner */}
      {distillResult && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(34, 197, 94, 0.08)",
            border: "1px solid rgba(34, 197, 94, 0.25)",
            borderRadius: "6px",
            fontSize: "13px",
            color: "var(--ink)",
          }}
        >
          Distillation complete: {distillResult.admitted} insight{distillResult.admitted !== 1 ? "s" : ""} admitted,{" "}
          {distillResult.rejected} rejected from {distillResult.processed} record{distillResult.processed !== 1 ? "s" : ""}.
        </div>
      )}
      {distillError && (
        <p className="error-banner" style={{ margin: 0, fontSize: "13px" }}>
          {distillError}
        </p>
      )}

      {/* No data state */}
      {records.length === 0 && (
        <div className="empty-state">
          No performance data yet. POST to /api/performance after publishing to start the learning loop.
        </div>
      )}

      {/* Most recent record metrics */}
      {mostRecent && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "var(--muted)" }}>
              {PLATFORM_LABELS[mostRecent.platform] ?? mostRecent.platform}
              {mostRecent.published_at
                ? ` · ${new Date(mostRecent.published_at).toLocaleDateString()}`
                : ""}
            </span>
            {mostRecent.went_viral && <ViralBadge />}
            {mostRecent.feedback_distilled && (
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--muted)",
                  padding: "2px 8px",
                  border: "1px solid var(--line)",
                  borderRadius: "99px",
                }}
              >
                Distilled
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <MetricPill label="Views" value={formatViews(mostRecent.views)} />
            <MetricPill label="Completion" value={`${Math.round(mostRecent.completion_rate * 100)}%`} />
            <MetricPill label="Likes" value={formatViews(mostRecent.likes)} />
            <MetricPill label="Shares" value={formatViews(mostRecent.shares)} />
            <MetricPill label="Saves" value={formatViews(mostRecent.saves)} />
            <MetricPill label="CTR" value={`${(mostRecent.click_through_rate * 100).toFixed(1)}%`} />
          </div>

          {mostRecent.hook_text && (
            <div
              style={{
                padding: "10px 14px",
                background: "var(--bg)",
                border: "1px solid var(--line)",
                borderRadius: "6px",
                fontSize: "13px",
                color: "var(--ink)",
              }}
            >
              <span style={{ color: "var(--muted)", marginRight: "6px" }}>Hook:</span>
              &ldquo;{mostRecent.hook_text}&rdquo;
              {mostRecent.viral_framework && (
                <span style={{ marginLeft: "8px", fontSize: "11px", color: "var(--muted)" }}>
                  [{mostRecent.viral_framework.replace(/_/g, " ")}]
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* History table for multiple records */}
      {records.length > 1 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line)" }}>
                {["Platform", "Views", "Completion", "Viral", "Distilled"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "6px 10px",
                      fontSize: "11px",
                      color: "var(--muted)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px 10px", color: "var(--ink)" }}>
                    {PLATFORM_LABELS[r.platform] ?? r.platform}
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--ink)" }}>{formatViews(r.views)}</td>
                  <td style={{ padding: "8px 10px", color: "var(--ink)" }}>
                    {Math.round(r.completion_rate * 100)}%
                  </td>
                  <td style={{ padding: "8px 10px" }}>{r.went_viral ? <ViralBadge /> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{r.feedback_distilled ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
