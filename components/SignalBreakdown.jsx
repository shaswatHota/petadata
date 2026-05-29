"use client";

/**
 * SignalBreakdown — Visual breakdown of which data sources contributed to the verdict.
 */
export default function SignalBreakdown({ meta }) {
  if (!meta) return null;

  const sources = [
    {
      key: "specs",
      label: "Amazon Specs",
      icon: "📋",
      description: "Objective product specifications",
      active: true, // always used
    },
    {
      key: "reviews",
      label: "Amazon Reviews",
      icon: "⭐",
      description: `${meta.reviewsAnalyzed || 0} relevant reviews analysed`,
      active: (meta.reviewsAnalyzed || 0) > 0,
    },
    {
      key: "transcript",
      label: "YouTube Transcript",
      icon: "🎥",
      description: meta.youtubeVideoUsed
        ? `"${meta.youtubeVideoUsed.slice(0, 50)}${meta.youtubeVideoUsed.length > 50 ? "…" : ""}"`
        : "Transcript unavailable",
      active: !!meta.transcriptAvailable,
    },
    {
      key: "comments",
      label: "YouTube Comments",
      icon: "💬",
      description: meta.commentsAnalyzed
        ? `${meta.commentsAnalyzed} high-signal comments`
        : "Comments unavailable",
      active: (meta.commentsAnalyzed || 0) > 0,
    },
  ];

  return (
    <div className="signal-breakdown">
      <h4 className="breakdown-title">Signal Sources</h4>
      <div className="breakdown-grid">
        {sources.map((s) => (
          <div key={s.key} className={`breakdown-item ${s.active ? "active" : "inactive"}`}>
            <span className="breakdown-icon">{s.icon}</span>
            <div className="breakdown-info">
              <span className="breakdown-label">{s.label}</span>
              <span className="breakdown-desc">{s.description}</span>
            </div>
            <span className={`breakdown-status ${s.active ? "status-on" : "status-off"}`}>
              {s.active ? "✓" : "✗"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
