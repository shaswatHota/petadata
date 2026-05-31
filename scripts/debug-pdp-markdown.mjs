/**
 * scripts/debug-pdp-markdown.mjs
 * Dumps the raw markdown from amazon.in product detail page (dp/ASIN)
 * to see what reviews/ratings are embedded there.
 */

const KEY = process.env.WIRE_API_KEY;
const BASE = process.env.ANAKIN_SCRAPER_BASE_URL || "https://api.anakin.io/v1";
const ASIN = process.argv[2] || "B09N3ZNHTY";

// Also try the public customerReviews iframe URL
const URLS = [
  `https://www.amazon.in/dp/${ASIN}`,
  // Amazon embeds reviews via a public-ish URL — no login required
  `https://www.amazon.in/${ASIN}/dp/${ASIN}#customerReviews`,
];

if (!KEY) throw new Error("WIRE_API_KEY not set");

for (const URL_TO_SCRAPE of URLS) {
  console.log(`\nSubmitting: ${URL_TO_SCRAPE}`);
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
      break;
    }
    if (job.status === "completed") {
      console.log(`\n=== generatedJson (first 2000) ===`);
      console.log(JSON.stringify(job.generatedJson, null, 2)?.slice(0, 2000) ?? "(null)");
      // Print the section of markdown that contains review-like content
      const md = job.markdown ?? "";
      // Find review sections
      const reviewIdx = md.search(/(?:customer review|rating|star|verified|helpful)/i);
      console.log(`\n=== MARKDOWN around reviews (chars ${reviewIdx} to ${reviewIdx + 3000}) ===`);
      console.log(md.slice(Math.max(0, reviewIdx - 100), reviewIdx + 3000));
      break;
    }
    process.stdout.write(`[${i}] status=${job.status}\r`);
  }
}
