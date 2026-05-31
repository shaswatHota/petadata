/**
 * lib/wire.js
 * Dual-client module:
 *
 * 1. Wire API (YouTube only) — managed action abstraction
 *    POST /v1/wire/task  { action_id, params } → { job_id }
 *    GET  /v1/wire/jobs/{id}                   → { status, data }
 *    Reference: https://anakin.io/docs/api-reference/wire
 *
 * 2. URL Scraper (Amazon.in) — universal crawler
 *    POST /v1/url-scraper  { url, useBrowser, generateJson, country } → { jobId }
 *    GET  /v1/url-scraper/{jobId}                                      → { status, markdown, generatedJson }
 *    Reference: https://anakin.io/docs/api-reference/url-scraper
 */

const WIRE_BASE_URL = process.env.WIRE_BASE_URL || "https://anakin.io/v1";
const WIRE_API_KEY = process.env.WIRE_API_KEY;
const POLL_INTERVAL_MS = 3000;    // Anakin docs recommend 3-second intervals
const MAX_POLL_ATTEMPTS = 60;     // 3 minutes max

/**
 * Core Wire utility. Submits a job and polls until complete.
 * @param {string} actionId - Wire action identifier
 * @param {object} params - Action parameters
 * @returns {Promise<object>} - Parsed result data
 */
export async function wireCall(actionId, params) {
  if (!WIRE_API_KEY) {
    throw new Error("WIRE_API_KEY is not set in environment variables");
  }

  // Step 1: Submit the job — POST /v1/wire/task
  const submitRes = await fetch(`${WIRE_BASE_URL}/wire/task`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": WIRE_API_KEY,
    },
    body: JSON.stringify({ action_id: actionId, params }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Wire submit failed [${submitRes.status}]: ${err}`);
  }

  const submitData = await submitRes.json();
  const jobId = submitData.job_id;
  if (!jobId) throw new Error(`Wire did not return a job_id. Response: ${JSON.stringify(submitData)}`);

  // Step 2: Poll for result — GET /v1/wire/jobs/{id}
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(`${WIRE_BASE_URL}/wire/jobs/${jobId}`, {
      headers: { "X-API-Key": WIRE_API_KEY },
    });

    if (!pollRes.ok) {
      const err = await pollRes.text();
      throw new Error(`Wire poll failed [${pollRes.status}]: ${err}`);
    }

    const job = await pollRes.json();

    if (job.status === "completed") {
      const raw = job.data;
      // Wire actions wrap their payload: job.data = { status: "ok", data: { ...actual result... } }
      // Unwrap so helpers receive the actual payload directly.
      const payload = (raw && raw.status === "ok" && raw.data !== undefined) ? raw.data : raw;
      console.log(`[wire:DEBUG] unwrapped payload keys:`, payload ? Object.keys(payload) : payload);
      return payload;
    }

    if (job.status === "failed") {
      const msg = job.error?.message || job.error || "Unknown error";
      throw new Error(`Wire job failed: ${msg}`);
    }

    // status === "processing" — continue polling
  }

  throw new Error(`Wire job timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

/** Utility: sleep for ms milliseconds */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// URL Scraper client — hits amazon.in directly
// ---------------------------------------------------------------------------

const SCRAPER_BASE_URL = process.env.ANAKIN_SCRAPER_BASE_URL || "https://api.anakin.io/v1";
// Reuse the same Anakin account key — works for both Wire and URL Scraper
const SCRAPER_API_KEY = process.env.WIRE_API_KEY;

/**
 * Submits a single URL to the Anakin URL Scraper and polls until the job
 * completes. Returns the full completed job object.
 *
 * @param {string} url - URL to scrape
 * @param {object} [opts] - Additional scraper options
 * @param {boolean} [opts.useBrowser=true]  - Use headless Chrome (required for amazon.in)
 * @param {boolean} [opts.generateJson=true] - Ask Anakin AI to extract structured JSON
 * @param {string}  [opts.country='in']      - Geo-targeting country code
 * @returns {Promise<{markdown:string, generatedJson:any, html:string}>}
 */
async function scraperCall(url, { useBrowser = true, generateJson = true, country = "in" } = {}) {
  if (!SCRAPER_API_KEY) throw new Error("WIRE_API_KEY is not set — needed for URL Scraper too");

  // Step 1: Submit
  const submitRes = await fetch(`${SCRAPER_BASE_URL}/url-scraper`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": SCRAPER_API_KEY,
    },
    body: JSON.stringify({ url, useBrowser, generateJson, country }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Scraper submit failed [${submitRes.status}]: ${err}`);
  }

  const { jobId } = await submitRes.json();
  if (!jobId) throw new Error(`Scraper did not return a jobId for URL: ${url}`);

  // Step 2: Poll — up to 3 minutes (same cadence as Wire)
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await sleep(POLL_INTERVAL_MS);

    let pollRes;
    try {
      pollRes = await fetch(`${SCRAPER_BASE_URL}/url-scraper/${jobId}`, {
        headers: { "X-API-Key": SCRAPER_API_KEY },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      // Transient network error — retry silently
      continue;
    }

    if (!pollRes.ok) {
      const err = await pollRes.text();
      throw new Error(`Scraper poll failed [${pollRes.status}]: ${err}`);
    }

    const job = await pollRes.json();

    if (job.status === "completed") {
      console.log(`[scraper] ${url} → completed (cached:${job.cached}, ${job.durationMs}ms)`);
      return { markdown: job.markdown ?? "", generatedJson: job.generatedJson ?? null, html: job.html ?? "" };
    }
    if (job.status === "failed") {
      throw new Error(`Scraper job failed for ${url}: ${job.error}`);
    }
    // pending / processing — continue polling
  }

  throw new Error(`Scraper timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s for URL: ${url}`);
}

// ---------------------------------------------------------------------------
// Amazon.in URL builders
// ---------------------------------------------------------------------------

function amazonSearchUrl(query) {
  return `https://www.amazon.in/s?k=${encodeURIComponent(query)}&ref=sr_pg_1`;
}
function amazonDpUrl(asin) {
  return `https://www.amazon.in/dp/${asin}`;
}
function amazonReviewsUrl(asin) {
  return `https://www.amazon.in/product-reviews/${asin}?sortBy=recent&pageNumber=1`;
}

// ---------------------------------------------------------------------------
// Response normalisers
// Anakin's generatedJson is freeform — we coerce it into the shapes the rest
// of the app already expects. Markdown fallback is tried when JSON is thin.
// ---------------------------------------------------------------------------

/**
 * Normalise Amazon.in search results into { asin, title, price, image, rating, url }[].
 * Primary source: generatedJson. Fallback: regex over markdown.
 */
function parseSearchResults(markdown, generatedJson) {
  // 1. Try generatedJson (Anakin AI extraction)
  const raw = generatedJson?.data ?? generatedJson ?? null;
  const candidates =
    (Array.isArray(raw) ? raw : null) ||
    (Array.isArray(raw?.products) ? raw.products : null) ||
    (Array.isArray(raw?.items) ? raw.items : null) ||
    (Array.isArray(raw?.results) ? raw.results : null) ||
    null;

  if (candidates?.length) {
    const mapped = candidates
      .map((p) => ({
        asin:
          p.asin ||
          p.id ||
          p.product_id ||
          extractAsinFromUrl(p.url || p.link || p.productUrl || ""),
        title: p.title || p.name || p.productTitle || "",
        price: normalisePrice(p.price || p.selling_price || p.mrp || p.cost),
        image: p.image || p.image_url || p.thumbnail || p.img || null,
        rating: p.rating || p.stars || null,
        ratingsCount: p.ratings_count || p.reviews_count || p.numRatings || null,
        url: p.url || p.link || null,
      }))
      .filter((p) => p.asin && p.title);
    if (mapped.length) return mapped;
  }

  // 2. Fallback: parse markdown for ASIN links
  const asinPattern = /\/dp\/([A-Z0-9]{10})/g;
  const seen = new Set();
  const fallback = [];
  let m;
  while ((m = asinPattern.exec(markdown)) !== null) {
    const asin = m[1];
    if (!seen.has(asin)) {
      seen.add(asin);
      fallback.push({ asin, title: asin, price: null, image: null, rating: null });
    }
  }
  console.warn(`[scraper] parseSearchResults: generatedJson empty, fell back to ${fallback.length} ASIN-link matches`);
  return fallback;
}

/**
 * Normalise a scraped PDP into the product detail shape the app expects.
 * Primary: generatedJson. Fallback: structured markdown parsing.
 */
function parseProductDetail(markdown, generatedJson, asin) {
  const raw = generatedJson?.data ?? generatedJson ?? null;

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const item = raw.product || raw.item || raw.details || raw;
    const title = item.title || item.name || item.productTitle || "";
    if (title) {
      return {
        asin: item.asin || asin,
        title,
        price: normalisePrice(item.price || item.selling_price || item.mrp),
        image: item.image || item.image_url || item.thumbnail || null,
        images: item.images || (item.image ? [item.image] : []),
        rating: item.rating || item.stars || null,
        ratings_count: item.ratings_count || item.numRatings || item.reviews_count || null,
        specs: item.specifications || item.features || item.specs || item.details || {},
        description: item.description || item.about || null,
        brand: item.brand || null,
        availability: item.availability || item.in_stock || null,
      };
    }
  }

  // Fallback: extract from markdown
  console.warn(`[scraper] parseProductDetail: falling back to markdown for ASIN ${asin}`);

  // Title: first H1 or H2 that isn't a nav/UI string
  const headingRe = /^#{1,2}\s+(.{10,})/m;
  const headingMatch = markdown.match(headingRe);
  const title = headingMatch ? headingMatch[1].trim() : "";

  // Price: ₹ followed by digits (commas ok), e.g. ₹999 or ₹1,499
  const priceRe = /[₹\u20b9][\s]?([\d,]+(?:\.\d{1,2})?)/;
  const priceMatch = markdown.match(priceRe);
  const price = priceMatch ? normalisePrice(priceMatch[1]) : null;

  // Rating: e.g. "4.1 out of 5" or "4.1/5"
  const ratingRe = /(\d\.\d)\s*(?:out of|\/)\s*5/i;
  const ratingMatch = markdown.match(ratingRe);
  const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

  // Ratings count: e.g. "12,345 ratings" or "12345 reviews"
  const ratingCountRe = /([\d,]+)\s+(?:ratings?|reviews?|customer)/i;
  const rcMatch = markdown.match(ratingCountRe);
  const ratings_count = rcMatch ? parseInt(rcMatch[1].replace(/,/g, ""), 10) : null;

  // Image: first markdown image
  const imgRe = /!\[[^\]]*\]\(([^)]+)\)/;
  const imgMatch = markdown.match(imgRe);
  const image = imgMatch ? imgMatch[1] : null;

  return { asin, title, price, image, images: image ? [image] : [], rating, ratings_count, specs: {}, description: null, brand: null };
}

/**
 * Normalise a scraped reviews page into { rating, title, body, date, verified }[].
 * Primary: generatedJson. Fallback: structured markdown parsing.
 */
function parseReviews(markdown, generatedJson) {
  const raw = generatedJson?.data ?? generatedJson ?? null;
  const candidates =
    (Array.isArray(raw) ? raw : null) ||
    (Array.isArray(raw?.reviews) ? raw.reviews : null) ||
    (Array.isArray(raw?.customer_reviews) ? raw.customer_reviews : null) ||
    (Array.isArray(raw?.items) ? raw.items : null) ||
    null;

  if (candidates?.length) {
    return candidates.map((r) => ({
      rating: r.rating || r.stars || null,
      title: r.title || r.headline || r.review_title || "",
      body: r.body || r.text || r.review_body || r.content || "",
      date: r.date || r.review_date || null,
      verified: r.verified || r.verified_purchase || false,
      helpful: r.helpful || r.helpful_votes || 0,
    }));
  }

  // Fallback: parse markdown — Amazon review pages have a predictable pattern
  console.warn("[scraper] parseReviews: generatedJson empty, falling back to markdown parsing");

  // Skip everything before the actual reviews section (sign-in walls, nav, etc.)
  // Reviews section starts after lines containing "customer reviews" or "verified purchase"
  const reviewsSectionRe = /(?:customer reviews|verified purchase|top reviews)/i;
  const reviewSectionIdx = markdown.search(reviewsSectionRe);
  const reviewsSection = reviewSectionIdx >= 0 ? markdown.slice(reviewSectionIdx) : markdown;

  // Pattern: a star rating line followed by a review block
  // Amazon markdown often shows: "4.0 out of 5 stars" then title then body
  const starRe = /(\d\.?\d?)\s*out\s*of\s*5\s*stars?/gi;
  const reviews = [];
  let match;
  let lastIndex = 0;
  const starMatches = [];

  while ((match = starRe.exec(reviewsSection)) !== null) {
    starMatches.push({ rating: parseFloat(match[1]), index: match.index });
  }

  for (let i = 0; i < starMatches.length; i++) {
    const start = starMatches[i].index;
    const end = starMatches[i + 1]?.index ?? reviewsSection.length;
    const chunk = reviewsSection.slice(start, end);

    // Skip if chunk looks like a nav/widget (very short or contains "Sign in")
    if (chunk.length < 30 || /sign in|create account|login/i.test(chunk)) continue;

    // Extract title: first non-empty line after the star rating line
    const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
    const titleLine = lines[1] || "";
    const titleClean = titleLine.replace(/^[#*>-]+\s*/, "").trim();

    // Body: rest of lines joined, strip markdown symbols
    const bodyLines = lines.slice(2).join(" ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")  // strip images
      .replace(/\[[^\]]*\]\([^)]*\)/g, "")   // strip links
      .replace(/[#*>|`]/g, "")                // strip markdown
      .trim();

    if (bodyLines.length < 20) continue; // skip noise-only blocks

    // Date: look for patterns like "Reviewed in India on June 5, 2024"
    const dateMatch = chunk.match(/Reviewed.*?on\s+([A-Z][a-z]+ \d+,? \d{4})/i);
    const date = dateMatch ? dateMatch[1] : null;

    const verified = /Verified Purchase/i.test(chunk);

    reviews.push({
      rating: starMatches[i].rating,
      title: titleClean.slice(0, 120),
      body: bodyLines.slice(0, 800),
      date,
      verified,
      helpful: 0,
    });
  }

  return reviews;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function extractAsinFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/(?:dp|product|gp\/product)\/([A-Z0-9]{10})/);
  return m ? m[1] : null;
}

function normalisePrice(raw) {
  if (!raw) return null;
  if (typeof raw === "number") return raw;
  // Strip currency symbols / commas, parse float
  const cleaned = String(raw).replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Action IDs — loaded from env vars.
// Find real action_ids in your Wire dashboard:
//   https://anakin.io/wire → pick "Amazon" or "YouTube" catalog
//                          → click an action → copy its action_id
// Then set the corresponding env vars in .env.local
// ---------------------------------------------------------------------------

const ACTION_AMAZON_SEARCH = process.env.WIRE_ACTION_AMAZON_SEARCH;
const ACTION_AMAZON_DETAILS = process.env.WIRE_ACTION_AMAZON_DETAILS;
const ACTION_AMAZON_REVIEWS = process.env.WIRE_ACTION_AMAZON_REVIEWS;
const ACTION_YT_SEARCH = process.env.WIRE_ACTION_YT_SEARCH;
const ACTION_YT_COMMENTS = process.env.WIRE_ACTION_YT_COMMENTS;

function requireAction(envVar, name) {
  if (!envVar) throw new Error(
    `Wire action ID for "${name}" is not set. ` +
    `Find it at https://anakin.io/wire and add WIRE_ACTION_${name.toUpperCase().replace(/-/g, "_")} to .env.local`
  );
  return envVar;
}

// ---------------------------------------------------------------------------
// Amazon.in action helpers — backed by the URL Scraper (not Wire)
// ---------------------------------------------------------------------------

/**
 * Search amazon.in for products matching a query.
 * Scrapes https://www.amazon.in/s?k=<query> and normalises the result.
 *
 * @param {string} query
 * @returns {Promise<Array<{asin,title,price,image,rating}>>}
 */
export async function searchAmazonProducts(query) {
  const url = amazonSearchUrl(query);
  console.log(`[scraper] searchAmazonProducts → ${url}`);
  const { markdown, generatedJson } = await scraperCall(url);
  const arr = parseSearchResults(markdown, generatedJson);
  console.log(`[scraper] searchAmazonProducts → ${arr.length} products`);
  return arr;
}

/**
 * Fetch full product details for an ASIN.
 *
 * IMPORTANT: Amazon.in's PDP (/dp/<ASIN>) also requires authentication and
 * returns empty content when scraped without a session.
 * Wire's managed identity handles this — we use Wire for details.
 * The search step (URL Scraper → amazon.in) gives us india-relevant ASINs;
 * Wire then fetches details + reviews for those same ASINs.
 *
 * @param {string} asin - 10-char alphanumeric ASIN
 * @returns {Promise<object>}
 */
export async function getProductDetails(asin) {
  const result = await wireCall(requireAction(ACTION_AMAZON_DETAILS, "AMAZON_DETAILS"), { asin });
  if (!result) return {};
  console.log(`[wire] getProductDetails(${asin}) raw keys:`, Object.keys(result));
  return result.product || result.item || result.detail || result;
}

/**
 * Fetch Amazon.in reviews for a product ASIN.
 *
 * IMPORTANT: Amazon.in's /product-reviews/ page requires authentication and
 * redirects to a sign-in wall when scraped without a session.
 * Wire's managed identity handles this transparently, so we keep using Wire
 * for reviews while using the URL Scraper for search + details.
 *
 * @param {string} asin
 * @returns {Promise<Array<{rating,title,body,date,verified}>>}
 */
export async function getProductReviews(asin) {
  const result = await wireCall(requireAction(ACTION_AMAZON_REVIEWS, "AMAZON_REVIEWS"), { asin });
  if (!result) return [];
  const arr =
    (Array.isArray(result) ? result : null) ||
    (Array.isArray(result.reviews) ? result.reviews : null) ||
    (Array.isArray(result.data) ? result.data : null) ||
    [];
  console.log(`[wire] getProductReviews(${asin}) → ${arr.length} reviews`);
  return arr;
}

/**
 * Search YouTube for review videos.
 *
 * yt_search params (from live catalog):
 *   query  string  required  — Search query
 *   limit  integer optional  — Max results 1-20 (default 10)
 *
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchYouTube(query) {
  const result = await wireCall(requireAction(ACTION_YT_SEARCH, "YT_SEARCH"), {
    query: `${query} review`,
    limit: 5,
  });

  console.log("[wire] Raw YT search result:", JSON.stringify(result, null, 2));
  if (!result) return [];
  const arr =
    (Array.isArray(result) ? result : null) ||
    (Array.isArray(result.videos) ? result.videos : null) ||
    (Array.isArray(result.items) ? result.items : null) ||
    (Array.isArray(result.results) ? result.results : null) ||
    (Array.isArray(result.data) ? result.data : null) ||
    [];
  return arr;
}

/**
 * Fetch comments from a YouTube video.
 *
 * yt_comments params (from live catalog):
 *   video_id        string   required  — YouTube video ID or full URL
 *   limit           integer  optional  — Max comments incl. replies 1-10000 (default 50)
 *   include_replies boolean  optional  — Walk reply threads (default true)
 *   sort            string   optional  — top|newest|both (default top)
 *
 * @param {string} videoId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getVideoComments(videoId, limit = 300) {
  const result = await wireCall(requireAction(ACTION_YT_COMMENTS, "YT_COMMENTS"), {
    video_id: videoId,
    limit,
    sort: "top",
    include_replies: true,
  });
  if (!result) return [];
  const arr =
    (Array.isArray(result) ? result : null) ||
    (Array.isArray(result.comments) ? result.comments : null) ||
    (Array.isArray(result.data) ? result.data : null) ||
    [];
  return arr;
}

