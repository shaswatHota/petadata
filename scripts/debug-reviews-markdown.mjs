/**
 * scripts/debug-reviews-markdown.mjs
 * Dumps the raw markdown + generatedJson from amazon.in product reviews page
 * so we can inspect the exact structure for the parser.
 *
 * Usage:
 *   WIRE_API_KEY=<key> ANAKIN_SCRAPER_BASE_URL=https://api.anakin.io/v1 node scripts/debug-reviews-markdown.mjs
 */

const KEY = process.env.WIRE_API_KEY;
const BASE = process.env.ANAKIN_SCRAPER_BASE_URL || "https://api.anakin.io/v1";
const ASIN = process.argv[2] || "B09N3ZNHTY";
const URL_TO_SCRAPE = `https://www.amazon.in/product-reviews/${ASIN}?sortBy=recent&pageNumber=1`;

if (!KEY) throw new Error("WIRE_API_KEY not set");

console.log(`Submitting: ${URL_TO_SCRAPE}`);
const submitRes = await fetch(`${BASE}/url-scraper`, {
  method: "POST",
  headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ url: URL_TO_SCRAPE, useBrowser: true, generateJson: true, country: "in" }),
});
const { jobId } = await submitRes.json();
console.log(`jobId: ${jobId}`);

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(`${BASE}/url-scraper/${jobId}`, { headers: { "X-API-Key": KEY } });
  const job = await res.json();
  if (job.status === "failed") {
    console.error("Failed:", job.error);
    process.exit(1);
  }
  if (job.status === "completed") {
    console.log(`\n=== generatedJson ===`);
    console.log(JSON.stringify(job.generatedJson, null, 2)?.slice(0, 3000) ?? "(null)");
    console.log(`\n=== MARKDOWN (first 4000 chars) ===`);
    console.log(job.markdown?.slice(0, 4000) ?? "(empty)");
    break;
  }
  process.stdout.write(`[${i}] status=${job.status}\r`);
}
