/**
 * lib/wire.js
 * Wire API client — wireCall() utility + all action helpers.
 *
 * API reference: https://anakin.io/docs/api-reference/wire
 *
 * Flow:
 *   POST /v1/wire/task        { action_id, params }  → { job_id }
 *   GET  /v1/wire/jobs/{id}                           → { status, data }
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
// Action helpers — each wraps wireCall with the correct action ID + params
// ---------------------------------------------------------------------------

/**
 * Search Amazon for products matching a query.
 *
 * am_search_products params (from live catalog):
 *   query  string  required  — Search query e.g. 'iphone 15'
 *   page   integer optional  — 1-based page number (default 1)
 *   limit  integer optional  — Max products 1-48 (default 24)
 *   sort   string  optional  — featured|price_low|price_high|rating_high|new|best_seller
 *
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchAmazonProducts(query) {
  const result = await wireCall(requireAction(ACTION_AMAZON_SEARCH, "AMAZON_SEARCH"), {
    query,
    limit: 24,
    sort: "featured",
  });
  if (!result) return [];
  // The action may return a bare array or wrap under a key
  const arr =
    (Array.isArray(result) ? result : null) ||
    (Array.isArray(result.products) ? result.products : null) ||
    (Array.isArray(result.items) ? result.items : null) ||
    (Array.isArray(result.results) ? result.results : null) ||
    (Array.isArray(result.data) ? result.data : null) ||
    [];
  console.log(`[wire] searchAmazonProducts → ${arr.length} items`);
  return arr;
}

/**
 * Fetch full product details for an ASIN.
 *
 * am_product_details params (from live catalog):
 *   asin  string  required  — 10-char alphanumeric ASIN
 *
 * @param {string} asin
 * @returns {Promise<object>}
 */
export async function getProductDetails(asin) {
  const result = await wireCall(requireAction(ACTION_AMAZON_DETAILS, "AMAZON_DETAILS"), { asin });
  if (!result) return {};
  console.log(`[wire] getProductDetails(${asin}) raw keys:`, Object.keys(result));
  return result.product || result.item || result.detail || result;
}

/**
 * Fetch Amazon reviews for a product.
 *
 * am_product_reviews params (from live catalog):
 *   asin  string  required  — 10-char alphanumeric ASIN
 *
 * @param {string} asin
 * @returns {Promise<Array>}
 */
export async function getProductReviews(asin) {
  const result = await wireCall(requireAction(ACTION_AMAZON_REVIEWS, "AMAZON_REVIEWS"), { asin });
  if (!result) return [];
  const arr =
    (Array.isArray(result) ? result : null) ||
    (Array.isArray(result.reviews) ? result.reviews : null) ||
    (Array.isArray(result.data) ? result.data : null) ||
    [];
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

