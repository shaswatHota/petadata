"use client";

import { Award, Package, ShoppingCart, Lightbulb, Star, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

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
  const flipkartUrl = product?.url || null;

  return (
    <div className={`product-card ${isTopPick ? "top-pick" : ""}`}>
      {isTopPick && (
        <div className="top-pick-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <Award size={14} /> Top Pick
        </div>
      )}
      {sponsorshipFlag && (
        <div className="sponsor-flag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <AlertTriangle size={14} /> Possible sponsored review
        </div>
      )}

      <div className="card-inner">
        {/* Left: image */}
        <div className="card-image-col">
          {image ? (
            <img src={image} alt={title} className="card-image" />
          ) : (
            <div className="card-image-placeholder">
              <Package size={32} />
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
            {flipkartUrl && (
              <a 
                href={flipkartUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                flipkart.com link <ShoppingCart size={14} />
              </a>
            )}
          </div>

          <div className="card-meta">
            {price && <span className="card-price">{formatPriceToINR(price)}</span>}
            {rating && (
              <span className="card-rating" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Star size={14} fill="currentColor" /> {typeof rating === "number" ? rating.toFixed(1) : rating}
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
            <p className="card-recommendation" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <Lightbulb size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
              {buyRecommendation}
            </p>
          )}

          <div className="card-signals">
            {pros.length > 0 && (
              <div className="signal-col">
                <span className="signal-heading pros-heading" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} /> Strengths
                </span>
                <ul className="signal-list pros-list">
                  {pros.slice(0, 3).map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {cons.length > 0 && (
              <div className="signal-col">
                <span className="signal-heading cons-heading" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <XCircle size={14} /> Weaknesses
                </span>
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
