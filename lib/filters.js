/**
 * lib/filters.js
 * Comment scoring formula, review keyword filter, stop word removal.
 * All pure functions — no API calls, no side effects.
 */

// Stop words to strip when extracting keywords from user context
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
  "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "could", "should", "may", "might", "shall", "can", "need",
  "i", "me", "my", "we", "our", "you", "your", "he", "she", "it", "they",
  "them", "their", "this", "that", "these", "those", "good", "great",
  "nice", "want", "need", "get", "use", "using", "looking", "around",
  "mostly", "mainly", "just", "really", "very", "quite", "under", "over",
  "about", "some", "any", "all", "no", "not", "so", "if", "then", "than",
  "also", "more", "most", "much", "many", "how", "what", "which", "who",
  "when", "where", "why", "bit", "decent", "prefer", "like", "find",
]);

/**
 * Extract meaningful keywords from a user's context declaration.
 * Strips stop words, punctuation, duplicates. Keeps domain-specific terms.
 * @param {string} contextText - User's raw context string
 * @returns {string[]} - Array of meaningful lowercase keywords
 */
export function extractKeywords(contextText) {
  if (!contextText) return [];
  return [
    ...new Set(
      contextText
        .toLowerCase()
        .replace(/[₹₹$€£,]/g, " ")           // strip currency symbols
        .replace(/[^a-z0-9\s\-]/g, " ")       // strip punctuation
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    ),
  ];
}

/**
 * Filter and rank Flipkart reviews by relevance to a user's use case.
 * Reviews mentioning more user keywords rank higher.
 * Verified purchasers get a bonus. Helpful votes add a smaller bonus.
 *
 * @param {Array} reviews - Raw review objects from Wire
 * @param {string[]} keywords - Keywords from extractKeywords()
 * @param {number} topN - How many reviews to return (default 10)
 * @returns {Array} - Top N filtered review objects, sorted by relevance
 */
export function filterReviews(reviews, keywords, topN = 10) {
  if (!reviews?.length) return [];

  const scored = reviews.map((review) => {
    const body = (review.body || review.text || review.content || "").toLowerCase();
    const title = (review.title || "").toLowerCase();
    const combined = `${title} ${body}`;

    // Keyword relevance score
    const keywordScore = keywords.reduce((acc, kw) => {
      const count = (combined.match(new RegExp(kw, "g")) || []).length;
      return acc + Math.min(count, 3); // cap per-keyword bonus at 3
    }, 0);

    // Verified purchase bonus
    const verifiedBonus = review.verified_purchase || review.verified ? 2 : 0;

    // Helpful votes bonus (logarithmic to avoid outlier dominance)
    const helpfulVotes = review.helpful_votes || review.helpful || 0;
    const helpfulBonus = helpfulVotes > 0 ? Math.log2(helpfulVotes + 1) : 0;

    return {
      ...review,
      _score: keywordScore + verifiedBonus + helpfulBonus,
    };
  });

  return scored
    .filter((r) => r._score > 0 || keywords.length === 0) // always return something if no keywords
    .sort((a, b) => b._score - a._score)
    .slice(0, topN)
    .map(({ _score, ...review }) => review); // strip internal score field
}

/**
 * Filter and rank YouTube comments to extract high-signal ones.
 *
 * Three steps per architecture spec:
 * 1. Quantity cap: 10% of total, capped at 200, floored at 30
 * 2. Remove comments under 8 words
 * 3. Score by recency-weighted engagement (likes + replies, decay by age)
 *
 * @param {Array} comments - Raw comment objects from Wire
 * @returns {Array} - Filtered, scored comment objects
 */
export function filterComments(comments) {
  if (!comments?.length) return [];

  // Step 1: Quantity cap
  const targetCount = Math.min(200, Math.max(30, Math.floor(comments.length * 0.1)));

  // Step 2: Remove short comments (< 8 words)
  const substantive = comments.filter((c) => {
    const text = c.text || c.content || c.snippet?.textDisplay || "";
    return text.split(/\s+/).length >= 8;
  });

  // Step 3: Recency-weighted engagement scoring
  const now = Date.now();
  const scored = substantive.map((comment) => {
    const text = comment.text || comment.content || comment.snippet?.textDisplay || "";
    const likes = comment.likes || comment.likeCount || 0;
    const replies = comment.replies || comment.replyCount || 0;
    const engagement = likes + replies * 2; // replies weighted higher

    // Age decay: comments from the last 30 days get full weight
    const publishedAt = comment.publishedAt || comment.published_at;
    const ageMs = publishedAt ? now - new Date(publishedAt).getTime() : 365 * 24 * 3600 * 1000;
    const ageDays = ageMs / (24 * 3600 * 1000);
    const decayFactor = Math.exp(-ageDays / 180); // half-life ~6 months

    return {
      text,
      likes,
      replies,
      publishedAt,
      _score: engagement * (0.3 + 0.7 * decayFactor), // always some base weight
    };
  });

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, targetCount)
    .map(({ _score, ...comment }) => comment);
}

/**
 * Format reviews for LLM consumption — compact, relevant.
 * @param {Array} reviews - Filtered review objects
 * @returns {string} - Formatted review block string
 */
export function formatReviewsForLLM(reviews) {
  return reviews
    .map((r, i) => {
      const rating = r.rating || r.star_rating || "?";
      const verified = r.verified_purchase || r.verified ? " [Verified]" : "";
      const title = r.title || "";
      const body = (r.body || r.text || r.content || "").slice(0, 600);
      return `[${i + 1}] ${rating}★${verified} — ${title}\n${body}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Format comments for LLM consumption.
 * @param {Array} comments - Filtered comment objects
 * @returns {string} - Formatted comments block string
 */
export function formatCommentsForLLM(comments) {
  return comments
    .map((c, i) => {
      const likes = c.likes ? ` (${c.likes} likes)` : "";
      return `[${i + 1}]${likes} ${c.text}`;
    })
    .join("\n\n");
}
