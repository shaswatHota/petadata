import Link from "next/link";

export default function Home() {
  return (
    <div className="page-wrap">
      <nav className="nav">
        <div className="nav-inner">
          <span className="nav-logo">WireSearch</span>
          <div className="nav-links">
            <Link href="/check" className="nav-link">Utility Check</Link>
            <Link href="/discover" className="nav-link">Discovery</Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="hero">
          <span className="hero-eyebrow">Buyer Intelligence · Powered by Wire + Claude</span>
          <h1 className="hero-title">
            Research products<br />
            <span className="grad">the right way.</span>
          </h1>
          <p className="hero-sub">
            Amazon reviews can be faked. YouTube reviews can be sponsored. WireSearch layers
            three independent sources — specs, real owner reviews, and YouTube transcripts — to
            give you the actual truth about any product.
          </p>
        </section>

        {/* Feature cards */}
        <div className="features-grid">
          <Link href="/check" className="feature-card">
            <div className="feature-icon">🔍</div>
            <div className="feature-tag">Feature 1</div>
            <h2 className="feature-title">Utility Check</h2>
            <p className="feature-desc">
              Already have a product in mind? Tell us your use case and we'll tell you whether
              it actually fits — backed by specs, reviews, and YouTube analysis.
            </p>
            <span className="feature-cta">Check a product</span>
          </Link>

          <Link href="/discover" className="feature-card">
            <div className="feature-icon">✨</div>
            <div className="feature-tag">Feature 2</div>
            <h2 className="feature-title">Discovery</h2>
            <p className="feature-desc">
              Describe what you want in plain English. Our three-pass AI pipeline finds the best
              matching products — including soft requirements Amazon can't filter for.
            </p>
            <span className="feature-cta">Discover products</span>
          </Link>
        </div>

        {/* How it works */}
        <div className="how-strip">
          <p className="how-title">How it works</p>
          <div className="how-steps">
            <div className="how-step">
              <div className="how-num">1</div>
              <p className="how-text"><strong>Spec filter</strong>Eliminate anything that objectively fails your requirements</p>
            </div>
            <div className="how-step">
              <div className="how-num">2</div>
              <p className="how-text"><strong>Review scoring</strong>Score soft requirements from real owner experiences</p>
            </div>
            <div className="how-step">
              <div className="how-num">3</div>
              <p className="how-text"><strong>YouTube validation</strong>Independent reviewer transcripts for top candidates</p>
            </div>
            <div className="how-step">
              <div className="how-num">4</div>
              <p className="how-text"><strong>Final verdict</strong>Ranked results with confidence levels and flags</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
