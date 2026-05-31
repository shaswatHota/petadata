"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, AlertTriangle } from "lucide-react";
import LoadingPipeline from "@/components/LoadingPipeline";
import UtilityVerdict from "@/components/UtilityVerdict";
import SignalBreakdown from "@/components/SignalBreakdown";
import LLMSelector from "@/components/LLMSelector";

const EXAMPLES = [
  "Student using it 8 hours at desk, mostly lo-fi and podcasts, budget ₹3000",
  "Daily commute on metro, need passive noise isolation, call quality matters",
  "Work from home, Teams calls all day, comfortable for 6-hour sessions",
];

export default function CheckPage() {
  const [product, setProduct] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [llmConfig, setLlmConfig] = useState({ provider: "claude", model: "claude-sonnet-4-6" });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!product.trim() || !context.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Small timeout to allow React to render the loading section before scrolling
      setTimeout(() => {
        const loadingSection = document.getElementById("loading-section");
        if (loadingSection) {
          loadingSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 50);

      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, context, llmConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
  }

  return (
    <div className="page-wrap">
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">WireSearch</Link>
          <div className="nav-links">
            <Link href="/check" className="nav-link active">Utility Check</Link>
            <Link href="/discover" className="nav-link">Discovery</Link>
          </div>
        </div>
      </nav>

      <div className="page-header">
        <div className="page-header-inner">
          <Link href="/" className="page-back" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--text3)", marginBottom: 16 }}>
            <ArrowLeft size={14} /> Back
          </Link>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Search size={24} /> Utility Check
          </h1>
          <p className="page-subtitle">
            Paste a product name or Flipkart URL and describe your use case. We'll tell you if it's the right fit.
          </p>
        </div>
      </div>

      <div className="form-section">
        <div className="form-inner">
          {!result && (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="product-input">
                  Product name or Flipkart URL
                </label>
                <input
                  id="product-input"
                  className="form-input"
                  type="text"
                  placeholder="e.g. boAt Airdopes 141  or  flipkart.com/..."
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="context-input">
                  Your use case <span>(be specific)</span>
                </label>
                <textarea
                  id="context-input"
                  className="form-textarea"
                  placeholder="e.g. Student, using it for 8 hours a day at my desk, mostly lo-fi music and podcasts, budget around ₹3000"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={loading}
                  required
                />
                <p className="form-hint">The more specific you are, the better the verdict.</p>
              </div>

              <LLMSelector value={llmConfig} onChange={setLlmConfig} disabled={loading} />

              <div className="examples" style={{ padding: "0 0 20px" }}>
                <p className="examples-label">Example use cases</p>
                <div className="example-chips">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      className="example-chip"
                      onClick={() => setContext(ex)}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <button
                id="check-submit-btn"
                type="submit"
                className="btn-primary"
                disabled={loading || !product.trim() || !context.trim()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {loading ? "Analysing…" : <>Check this product <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {error && <div className="error-banner" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> {error}
          </div>}

          {loading && (
            <div id="loading-section">
              <LoadingPipeline
                mode="check"
                currentPass={1}
                statusMessage="Fetching product data, reviews, and YouTube signals in parallel…"
              />
            </div>
          )}

          {result && (
            <>
              <div className="results-header">
                <span className="results-title">Analysis complete</span>
                <button className="btn-secondary" onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowLeft size={14} /> New check
                </button>
              </div>
              <UtilityVerdict
                product={result.product}
                verdict={result.verdict}
                meta={result.meta}
              />
              <SignalBreakdown meta={result.meta} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
