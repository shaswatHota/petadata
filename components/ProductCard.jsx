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

  const formatPriceToINR = (priceStr) => {
    if (!priceStr) return null;
    const str = priceStr.toString();
    const match = str.match(/[\d,.]+/);
    if (!match) return str;
    const num = parseFloat(match[0].replace(/,/g, ''));
    if (isNaN(num)) return str;
    
    if (str.includes('₹') || str.toLowerCase().includes('inr')) {
       return `₹${num.toLocaleString('en-IN')}`;
    }
    
    const inrValue = Math.round(num * 83.5);
    return `₹${inrValue.toLocaleString('en-IN')}`;
  };

  const ytBadge = getYtBadge();
  const amazonUrl = product?.url || (product?.asin ? `https://www.amazon.com/dp/${product.asin}` : null);

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
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
            <div>
              {rank && <span className="card-rank">#{rank}</span>}
              <h3 className="card-title" style={{ display: 'inline' }}>{title}</h3>
            </div>
            {amazonUrl && (
              <a 
                href={amazonUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                amazon.com link 🛒
              </a>
            )}
          </div>

          <div className="card-meta">
            {price && <span className="card-price">{formatPriceToINR(price)}</span>}
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
