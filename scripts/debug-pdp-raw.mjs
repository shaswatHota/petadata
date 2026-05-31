/**
 * scripts/debug-pdp-raw.mjs
 * Print the first 2000 chars of the PDP markdown so we can see what we get.
 */
const KEY = process.env.WIRE_API_KEY;
const BASE = process.env.ANAKIN_SCRAPER_BASE_URL || "https://api.anakin.io/v1";
const ASIN = process.argv[2] || "B09N3ZNHTY";
const URL_TO_SCRAPE = `https://www.amazon.in/dp/${ASIN}`;

const submitRes = await fetch(`${BASE}/url-scraper`, {
  method: "POST",
  headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ url: URL_TO_SCRAPE, useBrowser: true, generateJson: true, country: "in" }),
});
const { jobId } = await submitRes.json();
console.log("jobId:", jobId);

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(`${BASE}/url-scraper/${jobId}`, { headers: { "X-API-Key": KEY } });
  const job = await res.json();
  if (job.status === "failed") { console.error("failed:", job.error); break; }
  if (job.status === "completed") {
    console.log("\n=== generatedJson.data.title ===", job.generatedJson?.data?.title);
    console.log("=== first 3000 chars of markdown ===");
    console.log(job.markdown?.slice(0, 3000));
    break;
  }
  process.stdout.write(`[${i}] ${job.status}\r`);
}
