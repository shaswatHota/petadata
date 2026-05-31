/**
 * lib/prompts.js
 * All LLM prompt templates in one place.
 * Import the template you need, call it as a function with the required data.
 */

// ---------------------------------------------------------------------------
// Feature 2 — Discovery Prompts
// ---------------------------------------------------------------------------

/**
 * Pass 1: Hard spec elimination (runs on Claude Haiku — mechanical task only)
 * @param {Array} products - Array of { flipkartId, title, specs }
 * @param {string} requirements - User's raw requirement string
 * @returns {string} - Filled prompt string
 */
export function PASS1_PROMPT(products, requirements) {
  const productList = products
    .map(
      (p, i) =>
        `[${i + 1}] Flipkart ID: ${p.flipkartId || p.asin || p.id}\nTitle: ${p.title}\nSpecs: ${JSON.stringify(p.specs || p.details || {}, null, 2)}`
    )
    .join("\n\n---\n\n");

  return `You are a mechanical spec filter. Your only job is to eliminate products that objectively fail hard requirements.

USER REQUIREMENTS:
${requirements}

PRODUCTS TO EVALUATE:
${productList}

TASK:
Go through each product. Eliminate any product that fails a hard, objective requirement (e.g., price too high, RAM too low, battery below stated threshold, missing a required feature).

Be strict but fair. Only eliminate based on facts in the spec data. Do not eliminate based on subjective quality judgments — those come later.

Return ONLY raw JSON. No explanation, no markdown, no surrounding text.
Format:
  {
    "survivors": [
      { "flipkartId": "...", "title": "...", "eliminationReason": null }
    ],
    "eliminated": [
      { "flipkartId": "...", "title": "...", "eliminationReason": "Price ₹24,000 exceeds ₹20,000 limit" }
    ]
}`;
}

/**
 * Pass 2: Soft requirement scoring (runs on Claude Sonnet)
 * @param {Array} products - Array of { flipkartId, title, specs, reviews (formatted string) }
 * @param {string} requirements - User's full requirement string
 * @returns {string} - Filled prompt string
 */
export function PASS2_PROMPT(products, requirements) {
  const productList = products
    .map(
      (p, i) =>
        `[${i + 1}] Flipkart ID: ${p.flipkartId || p.asin || p.id}\nTitle: ${p.title}\n\nFLIPKART REVIEWS:\n${p.reviews || "No reviews available"}`
    )
    .join("\n\n===\n\n");

  return `You are a product analyst. Your job is to score products on soft, experiential requirements that cannot be verified from specs alone.

USER REQUIREMENTS:
${requirements}

PRODUCTS WITH FLIPKART REVIEWS:
${productList}

TASK:
For each product, read the reviews and assess how well the product matches the user's requirements — especially soft requirements like "bloat-free", "reliable", "good battery in real use", "comfortable for long sessions", etc.

Score each product from 0–10 for overall match. Consider:
- How many reviews confirm the soft requirements the user mentioned?
- Are there patterns of failure in areas the user cares about?
- Does real-world battery / performance match what the user needs?

Return ONLY raw JSON. No explanation, no markdown, no surrounding text.
Format:
{
  "ranked": [
    {
      "flipkartId": "...",
      "title": "...",
      "score": 8.5,
      "matchSummary": "Strong battery praise across reviews, minimal bloatware mentions, one report of call quality issue",
      "pros": ["Long real-world battery", "Clean software"],
      "cons": ["Some users report earpiece issues"],
      "confidence": "high"
    }
  ]
}`;
}

/**
 * Pass 3: YouTube validation for top 3 (runs on Claude Sonnet)
 * @param {Array} topProducts - Top 3 products from Pass 2, each with { flipkartId, title, score, matchSummary }
 * @param {string} requirements - User's original requirement string
 * @param {Array} youtubeData - Array of { asin, title, transcript, comments (formatted string), videoTitle }
 * @returns {string} - Filled prompt string
 */
export function PASS3_PROMPT(topProducts, requirements, youtubeData) {
  const pass2Summary = topProducts
    .map(
      (p, i) =>
        `[${i + 1}] ${p.title} (Flipkart ID: ${p.flipkartId || p.asin || p.id})\nPass 2 Score: ${p.score}/10\nSummary: ${p.matchSummary}`
    )
    .join("\n\n");

  const ytData = youtubeData
    .map(
      (d) =>
        `=== ${d.title} (Flipkart ID: ${d.flipkartId || d.asin || d.id}) ===\nYouTube Review: "${d.videoTitle}"\n\nTRANSCRIPT EXCERPT:\n${d.transcript || "Transcript unavailable"}\n\nTOP COMMENTS:\n${d.comments || "Comments unavailable"}`
    )
    .join("\n\n");

  return `You are a product analyst performing final validation using independent YouTube reviewer data.

USER REQUIREMENTS:
${requirements}

PASS 2 RANKINGS (from Flipkart review analysis):
${pass2Summary}

YOUTUBE DATA FOR EACH PRODUCT:
${ytData}

TASK:
Using the YouTube transcript and comments, validate or challenge the Pass 2 rankings.

Look for:
1. SPONSORSHIP: Does the reviewer lack meaningful criticism? Does the review feel unusually positive throughout? Do comments call out sponsorship?
2. CONTRADICTIONS: Do YouTube findings contradict Flipkart reviewer experiences?
3. DEALBREAKERS: Is there anything in the transcript or comments that's a dealbreaker for this specific user's stated requirements?
4. CONFIRMATION: Does the YouTube data strongly confirm Pass 2's top pick?

Your output should be the FINAL ranked list with updated confidence levels and any flags.

Return ONLY raw JSON. No explanation, no markdown, no surrounding text.
Format:
{
    "finalRanking": [
    {
      "flipkartId": "...",
      "title": "...",
      "finalScore": 8.5,
      "verdict": "Best match",
      "youtubeSignal": "positive",
      "sponsorshipFlag": false,
      "contradictions": [],
      "dealbreakers": [],
      "buyRecommendation": "Buy with confidence — all three sources align",
      "pros": [...],
      "cons": [...]
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Feature 1 — Utility Check Prompt
// ---------------------------------------------------------------------------

/**
 * Single verdict call for Feature 1 (runs on Claude Sonnet)
 * @param {object} product - Product details { title, specs, price, image }
 * @param {string} userContext - User's declared use case
 * @param {object} signals - { reviews (formatted string), transcript (string|null), comments (formatted string|null) }
 * @returns {string} - Filled prompt string
 */
export function UTILITY_CHECK_PROMPT(product, userContext, signals) {
  const transcriptSection = signals.transcript
    ? `\nYOUTUBE TRANSCRIPT EXCERPT:\n${signals.transcript}`
    : "\nYOUTUBE TRANSCRIPT: Unavailable for this product.";

  const commentsSection = signals.comments
    ? `\nYOUTUBE COMMENTS (high signal):\n${signals.comments}`
    : "";

  return `You are a product analyst evaluating whether a specific product fits a specific user's needs.

PRODUCT:
${product.title}
Price: ${product.price || "Unknown"}
Specs: ${JSON.stringify(product.specs || product.details || {}, null, 2)}

USER'S USE CASE:
${userContext}

FLIPKART REVIEWS (filtered for relevance to user's context):
${signals.reviews || "No reviews available"}
${transcriptSection}
${commentsSection}

TASK:
Evaluate this product specifically for THIS user's stated use case. Consider:
- Do the specs objectively serve the use case?
- What do real Flipkart reviewers say about use cases similar to this user's?
- Does the YouTube reviewer's experience align or contradict?
- Are there better alternatives you'd flag based on what you know?

Give one clear verdict: "Good Fit", "Acceptable", or "Poor Fit".
Be specific — explain WHY relative to their stated use case, not generic product praise.

Return ONLY raw JSON. No explanation, no markdown, no surrounding text.
Format:
{
  "verdict": "Good Fit | Acceptable | Poor Fit",
  "confidence": "high | medium | low",
  "explanation": "Plain English explanation tied to the user's specific use case",
  "pros": ["Specific strength for this use case", "..."],
  "cons": ["Specific weakness for this use case", "..."],
  "missingBetterOption": true | false,
  "alternativeSuggestion": "Only if missingBetterOption is true — one sentence on what to look for instead",
  "sourcesUsed": ["Flipkart specs", "Flipkart reviews", "YouTube transcript", "YouTube comments"]
}`;
}
