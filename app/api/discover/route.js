/**
 * app/api/discover/route.js
 * Feature 2 — Discovery pipeline endpoint (three-pass architecture).
 *
 * Flow:
 * 1. Receive { query } from request body
 * 2. Search Amazon → 20-30 products
 * 3. Pass 1: Fetch all specs, run Haiku → eliminate hard failures → 10-15 survivors
 * 4. Pass 2: Fetch + filter reviews for survivors, run Sonnet → ranked top 8-10
 * 5. Pass 3: YouTube (transcript + comments) for top 3 ONLY, run Sonnet → final ranking
 *
 * Progress is streamed via Server-Sent Events so the UI can show real-time pass status.
 */

import { searchAmazonProducts, getProductDetails, getProductReviews, searchYouTube, getVideoComments } from "@/lib/wire.js";
import { runPass1, runPass2, runPass3 } from "@/lib/llm.js";
import { extractKeywords, filterReviews, filterComments, formatReviewsForLLM, formatCommentsForLLM } from "@/lib/filters.js";
import { getTranscript, extractReviewerAnalysis } from "@/lib/transcript.js";

export async function POST(request) {
  const body = await request.json();
  const { query, llmConfig } = body;

  if (!query?.trim()) {
    return new Response(JSON.stringify({ error: "Query is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Use Server-Sent Events to stream progress to the client
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event, data) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        const keywords = extractKeywords(query);
        send("status", { pass: 0, message: "Searching Amazon for matching products..." });

        // ── Step 1: Amazon search ───────────────────────────────────────────
        let products = await searchAmazonProducts(query);
        console.log(`[discover] searchAmazonProducts returned ${products?.length ?? "null"} items`);
        if (!products?.length) {
          send("error", { message: "No products found for your query. Try rephrasing." });
          controller.close();
          return;
        }
        // Limit to 25 for pass 1
        products = products.slice(0, 25);
        send("status", { pass: 0, message: `Found ${products.length} products. Fetching specs...` });

        // ── Fetch specs for all products in parallel ────────────────────────
        const specsResults = await Promise.allSettled(
          products.map((p) => getProductDetails(p.asin || p.id))
        );

        const productsWithSpecs = products
          .map((p, i) => {
            const specResult = specsResults[i];
            if (specResult.status === "fulfilled" && specResult.value) {
              return { ...p, ...specResult.value, asin: p.asin || p.id || specResult.value.asin };
            }
            // Spec fetch failed (e.g. 404 on PDP) — keep the product from search results
            return { ...p, asin: p.asin || p.id, specs: {} };
          })
          .filter((p) => p.asin); // skip any that have no ASIN at all

        // ── Pass 1: Hard spec elimination (Haiku) ──────────────────────────
        send("status", { pass: 1, message: "Pass 1: Eliminating products that fail hard requirements..." });
        let pass1Result;
        try {
          pass1Result = await runPass1(productsWithSpecs, query, llmConfig);
        } catch (e) {
          send("error", { message: `Pass 1 failed: ${e.message}` });
          controller.close();
          return;
        }

        const survivors = pass1Result.survivors || productsWithSpecs;
        send("status", {
          pass: 1,
          message: `Pass 1 complete. ${survivors.length} products passed, ${pass1Result.eliminated?.length || 0} eliminated.`,
          eliminated: pass1Result.eliminated?.length || 0,
          survivors: survivors.length,
        });

        if (!survivors.length) {
          send("done", { results: [], message: "No products matched your hard requirements. Try relaxing your constraints." });
          controller.close();
          return;
        }

        // ── Pass 2: Soft scoring via Amazon reviews (Sonnet) ───────────────
        send("status", { pass: 2, message: "Pass 2: Fetching Amazon reviews and scoring soft requirements..." });

        const reviewsResults = await Promise.allSettled(
          survivors.map((p) => getProductReviews(p.asin))
        );

        const productsWithReviews = survivors.map((p, i) => {
          const result = reviewsResults[i];
          const rawReviews = result.status === "fulfilled" ? result.value : [];
          const filtered = filterReviews(rawReviews, keywords, 10);
          return { ...p, reviews: formatReviewsForLLM(filtered), reviewCount: filtered.length };
        });

        let pass2Result;
        try {
          pass2Result = await runPass2(productsWithReviews, query, llmConfig);
        } catch (e) {
          send("error", { message: `Pass 2 failed: ${e.message}` });
          controller.close();
          return;
        }

        const ranked = pass2Result.ranked || [];
        send("status", {
          pass: 2,
          message: `Pass 2 complete. Top ${Math.min(ranked.length, 8)} products ranked by fit.`,
          rankedCount: ranked.length,
        });

        if (!ranked.length) {
          send("done", { results: [], message: "Could not rank products. Try a different query." });
          controller.close();
          return;
        }

        // ── Pass 3: YouTube validation for top 3 ONLY (Sonnet) ─────────────
        send("status", { pass: 3, message: "Pass 3: Running YouTube validation on top 3 products..." });

        const top3 = ranked.slice(0, 3);
        const ytDataArray = [];

        for (const product of top3) {
          try {
            const videos = await searchYouTube(product.title);
            if (!videos?.length) {
              ytDataArray.push({ asin: product.asin, title: product.title, transcript: null, comments: null, videoTitle: null });
              continue;
            }

            const topVideo = videos[0];
            const videoId = topVideo.id?.videoId || topVideo.videoId || topVideo.id;
            const videoTitle = topVideo.title || topVideo.snippet?.title;

            const [transcriptResult, commentsResult] = await Promise.allSettled([
              getTranscript(videoId),
              getVideoComments(videoId, 400),
            ]);

            const rawTranscript = transcriptResult.status === "fulfilled" ? transcriptResult.value : null;
            const transcript = rawTranscript ? extractReviewerAnalysis(rawTranscript, keywords, 2000) : null;

            const rawComments = commentsResult.status === "fulfilled" ? commentsResult.value : [];
            const filteredComments = filterComments(rawComments);
            const comments = filteredComments.length ? formatCommentsForLLM(filteredComments) : null;

            ytDataArray.push({ asin: product.asin, title: product.title, transcript, comments, videoTitle });
          } catch (e) {
            console.warn(`[discover] YouTube fetch failed for ${product.title}:`, e.message);
            ytDataArray.push({ asin: product.asin, title: product.title, transcript: null, comments: null, videoTitle: null });
          }
        }

        // Proceed with Pass 3 if we got at least some YouTube data
        let finalRanking = ranked; // fallback to pass 2 if pass 3 fails
        try {
          const pass3Result = await runPass3(top3, query, ytDataArray, llmConfig);
          if (pass3Result?.finalRanking?.length) {
            // Merge pass 3 top results with remaining ranked products from pass 2
            const top3Asins = new Set(pass3Result.finalRanking.map((p) => p.asin));
            const rest = ranked.slice(3).filter((p) => !top3Asins.has(p.asin));
            finalRanking = [...pass3Result.finalRanking, ...rest];
          }
        } catch (e) {
          console.warn("[discover] Pass 3 failed, using Pass 2 results:", e.message);
          // Graceful degradation: pass 2 results are still good
        }

        // Enrich final results with product images/prices from spec data
        const enrichedResults = finalRanking.slice(0, 8).map((r) => {
          const specProduct = productsWithSpecs.find((p) => p.asin === r.asin) || {};
          return {
            ...r,
            image: specProduct.image || specProduct.images?.[0] || null,
            price: specProduct.price || specProduct.offers?.[0]?.price || null,
            rating: specProduct.rating || null,
            ratingsCount: specProduct.ratings_count || specProduct.ratingsTotal || null,
          };
        });

        send("status", { pass: 3, message: "Pass 3 complete. Final rankings ready." });
        send("done", {
          results: enrichedResults,
          meta: {
            initialProducts: products.length,
            afterPass1: survivors.length,
            afterPass2: ranked.length,
            youtubeValidated: ytDataArray.filter((d) => d.transcript || d.comments).length,
          },
        });
      } catch (err) {
        console.error("[api/discover] Fatal error:", err);
        send("error", { message: err.message || "An unexpected error occurred" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
