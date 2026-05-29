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

export async function POST(request) {
  try {
    const body = await request.json();
    const { product, context } = body;

    if (!product?.trim()) {
      return NextResponse.json({ error: "Product name or URL is required" }, { status: 400 });
    }
    if (!context?.trim()) {
      return NextResponse.json({ error: "Use case context is required" }, { status: 400 });
    }

    // Step 1: Resolve ASIN
    let asin = null;
    const amazonAsinMatch = product.match(/\/([A-Z0-9]{10})(?:\/|\?|$)/);
    if (amazonAsinMatch) {
      asin = amazonAsinMatch[1];
    }

    // Step 2: Get product details (and ASIN if not extracted from URL)
    let productDetails;
    if (asin) {
      productDetails = await getProductDetails(asin);
    } else {
      // Search by name and use first result
      const results = await searchAmazonProducts(product);
      if (!results?.length) {
        return NextResponse.json({ error: `No products found for: ${product}` }, { status: 404 });
      }
      productDetails = results[0];
      asin = productDetails.asin;
      // Fetch full details for the found product
      try {
        const full = await getProductDetails(asin);
        productDetails = { ...productDetails, ...full };
      } catch (e) {
        console.warn("[check] Could not fetch full details, using search result:", e.message);
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
      const videoId = topVideo.id?.videoId || topVideo.videoId || topVideo.id;

      const [transcriptResult, commentsResult] = await Promise.allSettled([
        getTranscript(videoId),
        getVideoComments(videoId, 300),
      ]);

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
      { reviews: reviewsText, transcript, comments: commentsText }
    );

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
