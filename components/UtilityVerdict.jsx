"use client";

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
    "Good Fit": { cls: "verdict-good", icon: "✓", label: "Good Fit" },
    Acceptable: { cls: "verdict-acceptable", icon: "~", label: "Acceptable" },
    "Poor Fit": { cls: "verdict-poor", icon: "✗", label: "Poor Fit" },
  };

  const config = verdictConfig[v] || verdictConfig["Acceptable"];

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
        <div className="verdict-product-strip">
          {product.image && (
            <img src={product.image} alt={product.title} className="verdict-product-img" />
          )}
          <div className="verdict-product-info">
            <p className="verdict-product-title">{product.title}</p>
            <div className="verdict-product-meta">
              {product.price && <span>{product.price}</span>}
              {product.rating && <span>★ {product.rating}</span>}
            </div>
          </div>
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
              <h4>✓ Works for your use case</h4>
              <ul>
                {pros.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {cons.length > 0 && (
            <div className="verdict-signal-col cons-col">
              <h4>✗ Doesn't work for your use case</h4>
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
        <div className="verdict-alternative">
          <span className="alt-icon">💡</span>
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
