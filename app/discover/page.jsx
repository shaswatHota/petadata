"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import LoadingPipeline from "@/components/LoadingPipeline";
import ProductCard from "@/components/ProductCard";
import LLMSelector from "@/components/LLMSelector";

const EXAMPLES = [
  "Wireless earphones for gym, sweat resistant, under ₹2000",
  "Android phone, good battery, no bloat, reliable, under ₹20,000",
  "Mechanical keyboard for coding, tactile switches, under ₹5000",
  "Laptop for college, light, good battery life, under ₹50,000",
];

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [meta, setMeta] = useState(null);
  const [pass, setPass] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [stats, setStats] = useState({});
  const [llmConfig, setLlmConfig] = useState({ provider: "claude", model: "claude-sonnet-4-20250514" });
  const abortRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setMeta(null);
    setPass(0);
    setStats({});

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, llmConfig }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop(); // keep incomplete last chunk

        for (const block of events) {
          const lines = block.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          const data = JSON.parse(dataStr);

          if (eventType === "status") {
            setStatusMessage(data.message || "");
            if (data.pass !== undefined) setPass(data.pass);
            setStats((prev) => ({ ...prev, ...data }));
          } else if (eventType === "done") {
            setResults(data.results || []);
            setMeta(data.meta || null);
            setPass(4);
          } else if (eventType === "error") {
            throw new Error(data.message || "Pipeline error");
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    abortRef.current?.abort();
    setResults(null);
    setMeta(null);
    setError(null);
    setLoading(false);
  }

  return (
    <div className="page-wrap">
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="nav-logo">WireSearch</Link>
          <div className="nav-links">
            <Link href="/check" className="nav-link">Utility Check</Link>
            <Link href="/discover" className="nav-link active">Discovery</Link>
          </div>
        </div>
      </nav>

      <div className="page-header">
        <div className="page-header-inner">
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--text3)", marginBottom: 16 }}>
            ← Back
          </Link>
          <h1 className="page-title">✨ Discovery</h1>
          <p className="page-subtitle">
            Describe what you want in plain language. The AI pipeline finds the best matches — including things like "no bloat" that Amazon can't filter for.
          </p>
        </div>
      </div>

      <div className="form-section">
        <div className="form-inner">
          {!results && (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="discover-query">
                  What are you looking for?
                </label>
                <textarea
                  id="discover-query"
                  className="form-textarea"
                  style={{ minHeight: 80 }}
                  placeholder="e.g. Android phone, good battery, no bloat, reliable, under ₹20,000"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={loading}
                  required
                />
                <p className="form-hint">Mix hard requirements (price, specs) with soft ones (reliable, no bloat). The pipeline handles both.</p>
              </div>

              <LLMSelector value={llmConfig} onChange={setLlmConfig} disabled={loading} />

              <div className="examples" style={{ padding: "0 0 20px" }}>
                <p className="examples-label">Try these queries</p>
                <div className="example-chips">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      type="button"
                      className="example-chip"
                      onClick={() => setQuery(ex)}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <button
                id="discover-submit-btn"
                type="submit"
                className="btn-primary"
                disabled={loading || !query.trim()}
              >
                {loading ? "Running pipeline…" : "Find best products →"}
              </button>
            </form>
          )}

          {error && <div className="error-banner">⚠ {error}</div>}

          {loading && (
            <LoadingPipeline
              mode="discover"
              currentPass={pass}
              statusMessage={statusMessage}
              stats={stats}
            />
          )}

          {results && (
            <div className="results-section" style={{ padding: 0 }}>
              <div className="results-header">
                <span className="results-title">
                  {results.length} product{results.length !== 1 ? "s" : ""} found
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {meta && (
                    <span className="results-meta">
                      {meta.initialProducts} searched · {meta.afterPass1} passed spec filter · {meta.youtubeValidated} YouTube-validated
                    </span>
                  )}
                  <button className="btn-secondary" onClick={handleReset}>← New search</button>
                </div>
              </div>

              {results.length === 0 ? (
                <div className="error-banner">No products matched your requirements. Try relaxing your constraints.</div>
              ) : (
                results.map((product, i) => (
                  <ProductCard key={product.asin || i} product={product} rank={i + 1} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
