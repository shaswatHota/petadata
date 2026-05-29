/**
 * scripts/inspect-wire.mjs
 * Run: node scripts/inspect-wire.mjs
 *
 * Reads your WIRE_API_KEY from .env.local (via --env-file flag or manual export)
 * and dumps:
 *   1. All catalogs available to your account
 *   2. Full action schemas for the action IDs you've configured in .env.local
 *
 * Usage:
 *   export $(grep -v '^#' .env.local | xargs)
 *   node scripts/inspect-wire.mjs
 */

const BASE = "https://api.anakin.io/v1";
const API_KEY = process.env.WIRE_API_KEY;

if (!API_KEY) {
  console.error("❌ WIRE_API_KEY not set. Run:  export $(grep -v '^#' .env.local | xargs)");
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-API-Key": API_KEY },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

// ── 1. List all available catalogs ──────────────────────────────────────────
console.log("\n══════════════════════════════════════════════");
console.log("  STEP 1 — All available Wire catalogs");
console.log("══════════════════════════════════════════════");
const { catalog: catalogs } = await get("/wire/catalog");
for (const c of catalogs) {
  console.log(`  ${c.slug.padEnd(25)} ${String(c.action_count).padStart(3)} actions  ${c.name}`);
}

// ── 2. Dump Amazon catalog actions ───────────────────────────────────────────
console.log("\n══════════════════════════════════════════════");
console.log("  STEP 2 — Amazon catalog actions + params");
console.log("══════════════════════════════════════════════");
try {
  const { catalog: amzCatalog, actions: amzActions } = await get("/wire/catalog/amazon");
  console.log(`\n  Catalog: ${amzCatalog.name} (${amzCatalog.domain})`);
  for (const a of amzActions) {
    console.log(`\n  ┌─ action_id: ${a.action_id}`);
    console.log(`  │  name:      ${a.name}`);
    console.log(`  │  credits:   ${a.credits_per_call}`);
    console.log(`  │  auth_mode: ${a.auth_mode}`);
    console.log(`  │  params:`);
    const props = a.parameters?.properties || {};
    const required = new Set(a.parameters?.required || []);
    for (const [k, v] of Object.entries(props)) {
      const req = required.has(k) ? " ★ REQUIRED" : "";
      console.log(`  │    ${k.padEnd(20)} (${v.type || "any"})${req}  ${v.description || ""}`);
    }
  }
} catch (e) {
  console.error("  ⚠ Could not fetch amazon catalog:", e.message);
  console.log("  → Try a different slug. Run STEP 1 above to find the Amazon slug.");
}

// ── 3. Dump YouTube catalog actions ──────────────────────────────────────────
console.log("\n══════════════════════════════════════════════");
console.log("  STEP 3 — YouTube catalog actions + params");
console.log("══════════════════════════════════════════════");
try {
  const { catalog: ytCatalog, actions: ytActions } = await get("/wire/catalog/youtube");
  console.log(`\n  Catalog: ${ytCatalog.name} (${ytCatalog.domain})`);
  for (const a of ytActions) {
    console.log(`\n  ┌─ action_id: ${a.action_id}`);
    console.log(`  │  name:      ${a.name}`);
    console.log(`  │  credits:   ${a.credits_per_call}`);
    console.log(`  │  auth_mode: ${a.auth_mode}`);
    console.log(`  │  params:`);
    const props = a.parameters?.properties || {};
    const required = new Set(a.parameters?.required || []);
    for (const [k, v] of Object.entries(props)) {
      const req = required.has(k) ? " ★ REQUIRED" : "";
      console.log(`  │    ${k.padEnd(20)} (${v.type || "any"})${req}  ${v.description || ""}`);
    }
  }
} catch (e) {
  console.error("  ⚠ Could not fetch youtube catalog:", e.message);
  console.log("  → Try a different slug. Run STEP 1 above to find the YouTube slug.");
}

// ── 4. Look up your configured action IDs directly ───────────────────────────
const configuredActions = {
  WIRE_ACTION_AMAZON_SEARCH:  process.env.WIRE_ACTION_AMAZON_SEARCH,
  WIRE_ACTION_AMAZON_DETAILS: process.env.WIRE_ACTION_AMAZON_DETAILS,
  WIRE_ACTION_AMAZON_REVIEWS: process.env.WIRE_ACTION_AMAZON_REVIEWS,
  WIRE_ACTION_YT_SEARCH:      process.env.WIRE_ACTION_YT_SEARCH,
  WIRE_ACTION_YT_COMMENTS:    process.env.WIRE_ACTION_YT_COMMENTS,
};

const nonEmpty = Object.entries(configuredActions).filter(([, v]) => v);
if (nonEmpty.length > 0) {
  console.log("\n══════════════════════════════════════════════");
  console.log("  STEP 4 — Your configured action IDs (search results)");
  console.log("══════════════════════════════════════════════");
  try {
    // Search each action_id to confirm it exists and see its schema
    for (const [envVar, actionId] of nonEmpty) {
      try {
        const res = await get(`/wire/search?q=${encodeURIComponent(actionId)}`);
        const match = (res.actions || res.results || []).find(a => a.action_id === actionId);
        if (match) {
          console.log(`\n  ✅ ${envVar}=${actionId}`);
          console.log(`     name: ${match.name}`);
          console.log(`     params: ${JSON.stringify(match.parameters?.properties ? Object.keys(match.parameters.properties) : [])}`);
        } else {
          console.log(`\n  ⚠ ${envVar}=${actionId} — not found in search results, check if it's correct`);
        }
      } catch (e) {
        console.log(`\n  ❓ ${envVar}=${actionId} — search error: ${e.message}`);
      }
    }
  } catch (e) {
    console.error("  Error during action search:", e.message);
  }
} else {
  console.log("\n  ℹ No WIRE_ACTION_* env vars are configured yet.");
  console.log("  Use the action_ids from STEP 2 & 3 above to fill in .env.local");
}

console.log("\n══════════════════════════════════════════════\n");
