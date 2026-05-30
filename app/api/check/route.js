/**
 * app/api/check/route.js
 * Feature 1 — Utility Check pipeline endpoint.
 *
 * Flow:
 * 1. Receive { product, context } from request body
 * 2. Resolve ASIN from product name or Amazon URL
 * 3. Fetch specs, reviews, YouTube signals in PARALLEL (fastest possible)
 * 4. Filter reviews to context-relevant ones
 * 5. Single Claude Sonnet call → verdict
 */

import { NextResponse } from "next/server";
import {
  getProductDetails,
  getProductReviews,
  searchAmazonProducts,
  searchYouTube,
  getVideoComments,
} from "@/lib/wire.js";
import { runUtilityCheck } from "@/lib/llm.js";
import { extractKeywords, filterReviews, filterComments, formatReviewsForLLM, formatCommentsForLLM } from "@/lib/filters.js";
import { getTranscript, extractReviewerAnalysis, extractVideoId } from "@/lib/transcript.js";
function resolveYoutubeVideoId(video) {
  if (!video) return null;
  return extractVideoId(
    video.url || video.video_id || video.videoId || video.id?.videoId || video.id
  );
}
export async function POST(request) {
  try {
    const body = await request.json();
    const { product, context, llmConfig } = body;

    if (!product?.trim()) {
      return NextResponse.json({ error: "Product name or URL is required" }, { status: 400 });
    }
    if (!context?.trim()) {
      return NextResponse.json({ error: "Use case context is required" }, { status: 400 });
    }

    // Step 1: Resolve ASIN + extract a human-readable title slug from URL for fallback search
    let asin = null;
    let urlTitleSlug = null;
    const amazonAsinMatch = product.match(/\/([A-Z0-9]{10})(?:\/|\?|$)/);
    if (amazonAsinMatch) {
      asin = amazonAsinMatch[1];
      // Extract title slug from URL path: /Product-Name-Here/dp/ASIN → "Product Name Here"
      const slugMatch = product.match(/amazon\.[a-z.]+\/([^/]+)\/dp\//);
      if (slugMatch) {
        urlTitleSlug = slugMatch[1].replace(/-/g, " ").replace(/&amp;/g, "&").trim();
      }
    }

    // Step 2: Get product details (and ASIN if not extracted from URL)
    let productDetails;
    if (asin) {
      try {
        productDetails = await getProductDetails(asin);
      } catch (e) {
        console.warn(`[check] getProductDetails failed for ASIN ${asin}:`, e.message);
        // Fall through to a search-based lookup so we still have a title/specs
        productDetails = null;
      }
    }

    if (!productDetails || !productDetails.title) {
      // PDP returned 404 (e.g. amazon.in ASIN on amazon.com scraper) — search by title slug or name
      // Prefer URL title slug > original product input > raw ASIN (least useful as search term)
      const searchQuery = urlTitleSlug || (asin ? null : product) || product;
      console.log(`[check] Falling back to search with query: "${searchQuery}"`);
      const results = await searchAmazonProducts(searchQuery);
      if (!results?.length) {
        return NextResponse.json({ 
          error: `Could not find this product on Amazon. Note: The scraper uses Amazon.com, so regional links (like amazon.in) or region-specific brands (like iQOO) may not return results.` 
        }, { status: 404 });
      }
      const topResult = results[0];
      asin = asin || topResult.asin;
      // Try to fetch full details for the search result; fall back to search result data
      try {
        const full = await getProductDetails(topResult.asin || asin);
        productDetails = { ...topResult, ...full };
      } catch (e) {
        console.warn("[check] Could not fetch full details, using search result:", e.message);
        productDetails = topResult;
      }
    }

    const productTitle = productDetails.title || product;
    const keywords = extractKeywords(context);

    // Step 3: Fetch reviews + YouTube signals IN PARALLEL
    const [rawReviews, ytVideos] = await Promise.allSettled([
      getProductReviews(asin),
      searchYouTube(productTitle),
    ]);

    // Step 4: Filter reviews
    const reviews = rawReviews.status === "fulfilled" ? rawReviews.value : [];
    const filteredReviews = filterReviews(reviews, keywords, 10);
    const reviewsText = formatReviewsForLLM(filteredReviews);

    // Step 5: Get YouTube transcript + comments for best matching video
    let transcript = null;
    let commentsText = null;
    let videoTitle = null;

    const videos = ytVideos.status === "fulfilled" ? ytVideos.value : [];
    if (videos?.length) {
      const topVideo = videos[0];
      videoTitle = topVideo.title || topVideo.snippet?.title;
      const videoId = resolveYoutubeVideoId(topVideo);

      console.log("getTranscript called with video id:", videoId, "from topVideo:", JSON.stringify(topVideo));

      const [transcriptResult, commentsResult] = await Promise.allSettled([
        getTranscript(videoId),
        getVideoComments(videoId, 300),
      ]);

      console.log("transcript result:", transcriptResult.value);
      console.log("transcript status:", transcriptResult.status);
      console.log("comments result:", commentsResult.value);
      console.log("comments status:", commentsResult.status);

      if (transcriptResult.status === "fulfilled" && transcriptResult.value) {
        transcript = extractReviewerAnalysis(transcriptResult.value, keywords, 2000);
      }

      if (commentsResult.status === "fulfilled" && commentsResult.value?.length) {
        const filteredComments = filterComments(commentsResult.value);
        commentsText = formatCommentsForLLM(filteredComments);
      }
    }

    // Step 6: Single LLM call — verdict
    const verdict = await runUtilityCheck(
      productDetails,
      context,
      { reviews: reviewsText, transcript, comments: commentsText },
      llmConfig
    );
    console.log("verdict check : ", verdict)

    return NextResponse.json({
      product: {
        asin,
        title: productTitle,
        price: productDetails.price || productDetails.offers?.[0]?.price,
        image: productDetails.image || productDetails.images?.[0],
        rating: productDetails.rating,
        ratingsCount: productDetails.ratings_count || productDetails.ratingsTotal,
      },
      verdict,
      meta: {
        reviewsAnalyzed: filteredReviews.length,
        youtubeVideoUsed: videoTitle,
        transcriptAvailable: !!transcript,
        commentsAnalyzed: commentsText ? commentsText.split("\n\n").length : 0,
      },
    });
  } catch (err) {
    console.error("[api/check] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
