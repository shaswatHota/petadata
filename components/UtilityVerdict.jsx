"use client";

import { CheckCircle, MinusCircle, XCircle, ShoppingCart, Lightbulb, Star } from "lucide-react";

/**
 * UtilityVerdict — Feature 1 result display.
 * Shows verdict badge, explanation, pros, cons, confidence, source breakdown.
 */
export default function UtilityVerdict({ product, verdict, meta }) {
  if (!verdict) return null;

  const {
    verdict: v,
    confidence,
    explanation,
    pros = [],
    cons = [],
    missingBetterOption,
    alternativeSuggestion,
    sourcesUsed = [],
  } = verdict;

  const verdictConfig = {
    "Good Fit": { cls: "verdict-good", icon: <CheckCircle size={32} />, label: "Good Fit" },
    Acceptable: { cls: "verdict-acceptable", icon: <MinusCircle size={32} />, label: "Acceptable" },
    "Poor Fit": { cls: "verdict-poor", icon: <XCircle size={32} />, label: "Poor Fit" },
  };

  const config = verdictConfig[v] || verdictConfig["Acceptable"];

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
    
    const inrValue = Math.round(num * 95.01);
    return `₹${inrValue.toLocaleString('en-IN')}`;
  };

  const amazonUrl = product?.url || (product?.asin ? `https://www.amazon.com/dp/${product.asin}` : null);

  return (
    <div className="utility-verdict">
      {/* Hero verdict */}
      <div className={`verdict-hero ${config.cls}`}>
        <div className="verdict-icon">{config.icon}</div>
        <div className="verdict-text">
          <h2 className="verdict-label">{config.label}</h2>
          {confidence && (
            <span className={`verdict-confidence conf-${confidence}`}>
              {confidence} confidence
            </span>
          )}
        </div>
      </div>

      {/* Product info strip */}
      {product && (
        <div className="verdict-product-strip" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {product.image && (
              <img src={product.image} alt={product.title} className="verdict-product-img" />
            )}
            <div className="verdict-product-info">
              <p className="verdict-product-title">{product.title}</p>
              <div className="verdict-product-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {product.price && <span>{formatPriceToINR(product.price)}</span>}
                {product.rating && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Star size={14} fill="currentColor" /> {product.rating}
                  </span>
                )}
              </div>
            </div>
          </div>
          {amazonUrl && (
            <a 
              href={amazonUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '0.9rem', whiteSpace: 'nowrap', textDecoration: 'none' }}
            >
              amazon.com link <ShoppingCart size={16} />
            </a>
          )}
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div className="verdict-explanation">
          <h3>Why?</h3>
          <p>{explanation}</p>
        </div>
      )}

      {/* Pros / Cons */}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="verdict-signals-grid">
          {pros.length > 0 && (
            <div className="verdict-signal-col pros-col">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={16} /> Works for your use case
              </h4>
              <ul>
                {pros.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {cons.length > 0 && (
            <div className="verdict-signal-col cons-col">
              <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <XCircle size={16} /> Doesn't work for your use case
              </h4>
              <ul>
                {cons.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Alternative suggestion */}
      {missingBetterOption && alternativeSuggestion && (
        <div className="verdict-alternative" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <span className="alt-icon">
            <Lightbulb size={24} />
          </span>
          <div>
            <strong>There's likely a better option</strong>
            <p>{alternativeSuggestion}</p>
          </div>
        </div>
      )}

      {/* Sources used */}
      {sourcesUsed.length > 0 && (
        <div className="verdict-sources">
          <span className="sources-label">Sources analysed:</span>
          {sourcesUsed.map((s, i) => (
            <span key={i} className="source-pill">{s}</span>
          ))}
        </div>
      )}

      {/* Meta stats */}
      {meta && (
        <div className="verdict-meta">
          {meta.reviewsAnalyzed > 0 && (
            <span>{meta.reviewsAnalyzed} relevant reviews read</span>
          )}
          {meta.youtubeVideoUsed && (
            <span>YouTube: {meta.youtubeVideoUsed}</span>
          )}
          {meta.transcriptAvailable !== undefined && (
            <span>Transcript: {meta.transcriptAvailable ? "Available" : "Unavailable"}</span>
          )}
        </div>
      )}
    </div>
  );
}
