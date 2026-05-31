/**
 * scripts/test-amazon-scraper.mjs
 * Quick sanity check for the new URL-Scraper-backed Amazon.in functions.
 *
 * Usage:
 *   node scripts/test-amazon-scraper.mjs
 *
 * Set env vars first (they're already in .env.local — dotenv not loaded here,
 * so either source .env.local or pass them inline):
 *
 *   WIRE_API_KEY=<your key> node scripts/test-amazon-scraper.mjs
 *
 * Or from the project root (requires dotenv-cli):
 *   npx dotenv -e .env.local -- node scripts/test-amazon-scraper.mjs
 */

import { searchAmazonProducts, getProductDetails, getProductReviews } from "../lib/wire.js";

const TEST_QUERY = "boAt Airdopes 141";   // India-specific product

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log(" Amazon.in URL Scraper — Integration Test");
  console.log("═══════════════════════════════════════════\n");

  // ── Test 1: Search ─────────────────────────────────────────────────────────
  console.log(`[1/3] searchAmazonProducts("${TEST_QUERY}")`);
  console.log("      (uses browser mode + country=in — may take 10–30s)\n");

  let products;
  try {
    products = await searchAmazonProducts(TEST_QUERY);
    console.log(`✅  Found ${products.length} products`);
    if (products.length) {
      const p = products[0];
      console.log(`    First result: ${p.title}`);
      console.log(`    ASIN: ${p.asin}  |  Price: ₹${p.price ?? "n/a"}  |  Rating: ${p.rating ?? "n/a"}`);
    }
  } catch (err) {
    console.error("❌  searchAmazonProducts failed:", err.message);
    process.exit(1);
  }

  if (!products.length) {
    console.warn("⚠️  No products returned — cannot continue with details / reviews tests");
    process.exit(0);
  }

  const testAsin = products[0].asin;

  // ── Test 2: Product Details ────────────────────────────────────────────────
  console.log(`\n[2/3] getProductDetails("${testAsin}")`);
  let detail;
  try {
    detail = await getProductDetails(testAsin);
    console.log(`✅  Title: ${detail.title || "(empty)"}`);
    console.log(`    Price: ₹${detail.price ?? "n/a"}  |  Rating: ${detail.rating ?? "n/a"}`);
    console.log(`    Specs keys: ${Object.keys(detail.specs || {}).slice(0, 5).join(", ") || "none"}`);
  } catch (err) {
    console.error("❌  getProductDetails failed:", err.message);
  }

  // ── Test 3: Reviews ────────────────────────────────────────────────────────
  console.log(`\n[3/3] getProductReviews("${testAsin}")`);
  try {
    const reviews = await getProductReviews(testAsin);
    console.log(`✅  Fetched ${reviews.length} reviews`);
    if (reviews.length) {
      const r = reviews[0];
      console.log(`    First review: [${r.rating ?? "?"}★] ${r.title || "(no title)"}`);
      console.log(`    Body snippet: ${(r.body || "").slice(0, 120)}…`);
    }
  } catch (err) {
    console.error("❌  getProductReviews failed:", err.message);
  }

  console.log("\n═══════════════════════════════════════════");
  console.log(" Done.");
  console.log("═══════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
