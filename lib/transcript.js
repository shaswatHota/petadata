/**
 * lib/transcript.js
 * YouTube transcript fetcher using youtubei.js (InnerTube client).
 * More reliable than youtube-transcript — mimics browser behaviour,
 * not a scraper, works in server environments including Vercel.
 */

import { Innertube } from "youtubei.js";

// ─── Singleton with expiry ────────────────────────────────────────────────────

let _innertube = null;
let _createdAt = null;
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getInnertube() {
  const now = Date.now();
  const isExpired = _createdAt && now - _createdAt > SESSION_TTL_MS;

  if (_innertube && !isExpired) return _innertube;

  if (isExpired) {
    console.log("[transcript] Session expired — recreating Innertube instance");
  }

  _innertube = await Innertube.create({
    lang: "en",
    location: "US",
    retrieve_player: false,         // skip JS player — only need metadata + captions
    generate_session_locally: true, // critical for Vercel — avoids YouTube's session endpoint
  });

  _createdAt = now;
  return _innertube;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch the full transcript for a YouTube video.
 * Returns cleaned, concatenated text.
 * Falls back to video description if transcript is unavailable.
 *
 * @param {string} videoId - YouTube video ID (11-char string or full URL)
 * @returns {Promise<string|null>} - Full transcript text, or null if unavailable
 */
export async function getTranscript(videoId) {
  const id = extractVideoId(videoId);
  console.log("id from transcript.js: ", id);

  if (!id) {
    console.warn(`[transcript] Invalid videoId: "${videoId}"`);
    return null;
  }

  try {
    const yt = await getInnertube();
    console.log("yt from transcript.js , got innertube instance ");
    const info = await yt.getInfo(id);
    console.log("info from transcript.js ");

    const transcriptResponse = await info.getTranscript();
    console.log("transcriptResponse from transcript.js", JSON.stringify(transcriptResponse, null, 2));
    const segments =
      transcriptResponse?.transcript?.content?.body?.initial_segments;

    console.log("[transcript] Total segments:", segments?.length);
    console.log("[transcript] First 3 segments:", JSON.stringify(segments?.slice(0, 3), null, 2));

    if (!segments?.length) {
      console.warn(
        `[transcript] No segments returned for ${id} — transcript may be disabled on this video`
      );
      return _fallbackToDescription(info, id);
    }

    const raw = segments.map((s) => s.snippet?.text ?? "").join(" ");
    const cleaned = _clean(raw);

    // ── Debug: print first 5 sentences of transcript ─────────────────────────
    const preview = cleaned.split(/[.!?]/).slice(0, 5).join(". ").trim();
    console.log(`[transcript] ✓ Fetched ${segments.length} segments for ${id}`);
    console.log(`[transcript] Preview → "${preview}..."`);
    // ─────────────────────────────────────────────────────────────────────────

    return cleaned;

  } catch (err) {
    console.warn(`[transcript] youtubei.js failed for ${id}: ${err.message}. Trying youtube-transcript as fallback...`);

    try {
      // Lazy import youtube-transcript to avoid top-level issues if not needed
      const { YoutubeTranscript } = await import('youtube-transcript');
      const ytTranscript = await YoutubeTranscript.fetchTranscript(id);
      
      if (ytTranscript && ytTranscript.length > 0) {
        console.log(`[transcript] ✓ Fetched ${ytTranscript.length} segments using youtube-transcript for ${id}`);
        const raw = ytTranscript.map((s) => s.text ?? "").join(" ");
        return _clean(raw);
      }
    } catch (ytErr) {
      console.warn(`[transcript] youtube-transcript fallback failed for ${id}: ${ytErr.message}`);
    }

    // Last resort: try description
    try {
      const yt = await getInnertube();
      const info = await yt.getInfo(id);
      return _fallbackToDescription(info, id);
    } catch {
      return null;
    }
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _fallbackToDescription(info, id) {
  const description = info?.basic_info?.short_description;
  if (description?.trim()) {
    console.log(`[transcript] ↩ Using description fallback for ${id}`);
    console.log(
      `[transcript] Description preview → "${description.slice(0, 200)}..."`
    );
    return `[Transcript unavailable — using video description]\n\n${description.trim()}`;
  }
  console.warn(`[transcript] No description either for ${id} — returning null`);
  return null;
}

function _clean(raw) {
  return raw
    .replace(/\[.*?\]/g, "")    // remove [Music], [Applause], etc.
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")    // collapse whitespace
    .trim();
}

// ─── Unchanged from original ──────────────────────────────────────────────────

/**
 * Extract the most relevant section of a transcript for a given set of keywords.
 * Breaks transcript into ~400-word chunks, scores each by keyword density,
 * returns the top chunk(s) up to maxWords total.
 *
 * @param {string} transcript - Full transcript text
 * @param {string[]} keywords - Keywords to search for
 * @param {number} maxWords - Max words to return (default 2000)
 * @returns {string} - Relevant transcript excerpt
 */
export function extractReviewerAnalysis(transcript, keywords, maxWords = 2000) {
  if (!transcript) {
    console.log("no transcript found")

    return "";
  }

  const words = transcript.split(/\s+/);
  const CHUNK_SIZE = 400;

  const chunks = [];
  for (let i = 0; i < words.length; i += Math.floor(CHUNK_SIZE / 2)) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    chunks.push({ text: chunk, startIndex: i });
  }

  console.log("chunks", chunks.length);
  const kwLower = keywords.map((k) => k.toLowerCase());
  const scored = chunks.map((chunk) => {
    const text = chunk.text.toLowerCase();
    const score = kwLower.reduce(
      (acc, kw) => acc + (text.includes(kw) ? 1 : 0),
      0
    );
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  const usedIndices = new Set();
  let totalWords = 0;

  for (const chunk of scored) {
    if (totalWords >= maxWords) break;
    const tooClose = [...usedIndices].some(
      (idx) => Math.abs(idx - chunk.startIndex) < 200
    );
    if (!tooClose) {
      selected.push(chunk);
      usedIndices.add(chunk.startIndex);
      totalWords += chunk.text.split(/\s+/).length;
    }
  }

  selected.sort((a, b) => a.startIndex - b.startIndex);
  return selected.map((c) => c.text).join("\n\n[...]\n\n");
}

/**
 * Extract the video ID from a YouTube URL, or return the ID if already extracted.
 * @param {string} urlOrId
 * @returns {string|null}
 */
export function extractVideoId(urlOrId) {
  if (!urlOrId) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;

  try {
    const url = new URL(urlOrId);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("?")[0];
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}