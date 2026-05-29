"use client";

/**
 * ProductCard — Single product result with score, match reason, pros/cons.
 */
export default function ProductCard({ product, rank }) {
  const {
    title,
    image,
    price,
    rating,
    ratingsCount,
    score,
    finalScore,
    matchSummary,
    pros = [],
    cons = [],
    verdict,
    buyRecommendation,
    sponsorshipFlag,
    youtubeSignal,
    confidence,
  } = product;

  const displayScore = finalScore ?? score ?? null;
  const isTopPick = rank === 1;

  function getScoreColor(s) {
    if (s >= 8) return "score-green";
    if (s >= 6) return "score-amber";
    return "score-red";
  }

  function getYtBadge() {
    if (!youtubeSignal) return null;
    const map = { positive: { label: "✓ YT Confirmed", cls: "yt-positive" }, negative: { label: "⚠ YT Flags Issues", cls: "yt-negative" }, mixed: { label: "~ YT Mixed", cls: "yt-mixed" } };
    return map[youtubeSignal] || null;
  }

  const ytBadge = getYtBadge();

  return (
    <div className={`product-card ${isTopPick ? "top-pick" : ""}`}>
      {isTopPick && <div className="top-pick-badge">⭐ Top Pick</div>}
      {sponsorshipFlag && <div className="sponsor-flag">⚠ Possible sponsored review</div>}

      <div className="card-inner">
        {/* Left: image */}
        <div className="card-image-col">
          {image ? (
            <img src={image} alt={title} className="card-image" />
          ) : (
            <div className="card-image-placeholder">
              <span>📦</span>
            </div>
          )}
          {displayScore !== null && (
            <div className={`score-badge ${getScoreColor(displayScore)}`}>
              {displayScore.toFixed(1)}<span className="score-denom">/10</span>
            </div>
          )}
        </div>

        {/* Right: info */}
        <div className="card-info-col">
          <div className="card-header">
            {rank && <span className="card-rank">#{rank}</span>}
            <h3 className="card-title">{title}</h3>
          </div>

          <div className="card-meta">
            {price && <span className="card-price">{price}</span>}
            {rating && (
              <span className="card-rating">
                ★ {typeof rating === "number" ? rating.toFixed(1) : rating}
                {ratingsCount && <span className="ratings-count"> ({Number(ratingsCount).toLocaleString("en-IN")})</span>}
              </span>
            )}
            {ytBadge && <span className={`yt-badge ${ytBadge.cls}`}>{ytBadge.label}</span>}
            {confidence && <span className={`confidence-pill conf-${confidence}`}>{confidence} confidence</span>}
          </div>

          {(verdict || matchSummary) && (
            <p className="card-summary">{verdict || matchSummary}</p>
          )}

          {buyRecommendation && (
            <p className="card-recommendation">💡 {buyRecommendation}</p>
          )}

          <div className="card-signals">
            {pros.length > 0 && (
              <div className="signal-col">
                <span className="signal-heading pros-heading">✓ Strengths</span>
                <ul className="signal-list pros-list">
                  {pros.slice(0, 3).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {cons.length > 0 && (
              <div className="signal-col">
                <span className="signal-heading cons-heading">✗ Weaknesses</span>
                <ul className="signal-list cons-list">
                  {cons.slice(0, 3).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
