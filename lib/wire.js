/**
 * lib/wire.js
 * Wire API client — wireCall() utility + all action helpers.
 * Wire actions are async: POST → get job ID → poll until complete.
 */

const WIRE_BASE_URL = process.env.WIRE_BASE_URL || "https://api.anakin.io/v1/wire";
const WIRE_API_KEY = process.env.WIRE_API_KEY;
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 60; // 90 seconds max

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

  // Step 1: Submit the job
  const submitRes = await fetch(`${WIRE_BASE_URL}/actions/${actionId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": WIRE_API_KEY,
    },
    body: JSON.stringify({ inputs: params }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Wire submit failed [${submitRes.status}]: ${err}`);
  }

  const { jobId } = await submitRes.json();
  if (!jobId) throw new Error("Wire did not return a jobId");

  // Step 2: Poll for result
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(`${WIRE_BASE_URL}/jobs/${jobId}`, {
      headers: { "X-API-Key": WIRE_API_KEY },
    });

    if (!pollRes.ok) {
      const err = await pollRes.text();
      throw new Error(`Wire poll failed [${pollRes.status}]: ${err}`);
    }

    const job = await pollRes.json();

    if (job.status === "completed" || job.status === "success") {
      return job.output || job.result || job.data;
    }

    if (job.status === "failed" || job.status === "error") {
      throw new Error(`Wire job failed: ${job.error || "Unknown error"}`);
    }

    // Still running — continue polling
  }

  throw new Error(`Wire job timed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

/** Utility: sleep for ms milliseconds */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Action helpers — each wraps wireCall with the correct action ID + params
// ---------------------------------------------------------------------------

/**
 * Search Amazon for products matching a query.
 * @param {string} query - Natural language product query
 * @returns {Promise<Array>} - Array of product listings
 */
export async function searchAmazonProducts(query) {
  const result = await wireCall("amazon-product-search", { query, country: "IN" });
  return result?.products || result || [];
}

/**
 * Fetch full product details (specs, price, title, images) for an ASIN.
 * @param {string} asin - Amazon product ASIN
 * @returns {Promise<object>} - Product detail object
 */
export async function getProductDetails(asin) {
  const result = await wireCall("amazon-product-details", { asin, country: "IN" });
  return result?.product || result || {};
}

/**
 * Fetch Amazon reviews for a product.
 * @param {string} asin - Amazon product ASIN
 * @param {number} maxPages - Number of review pages to fetch (default 2)
 * @returns {Promise<Array>} - Array of review objects
 */
export async function getProductReviews(asin, maxPages = 2) {
  const result = await wireCall("amazon-product-reviews", {
    asin,
    country: "IN",
    pages: maxPages,
    verified_only: false,
  });
  return result?.reviews || result || [];
}

/**
 * Search YouTube for a review video of a product.
 * @param {string} query - Product name + "review" search query
 * @returns {Promise<Array>} - Array of video objects with id, title, channel
 */
export async function searchYouTube(query) {
  const result = await wireCall("youtube-search", { query: `${query} review`, max_results: 5 });
  return result?.videos || result || [];
}

/**
 * Fetch comments from a YouTube video.
 * @param {string} videoId - YouTube video ID
 * @param {number} maxResults - Max comments to fetch (default 500)
 * @returns {Promise<Array>} - Array of comment objects with text, likes, replies, publishedAt
 */
export async function getVideoComments(videoId, maxResults = 500) {
  const result = await wireCall("youtube-comments", {
    video_id: videoId,
    max_results: maxResults,
    sort_by: "relevance",
  });
  return result?.comments || result || [];
}
