/**
 * lib/transcript.js
 * YouTube transcript fetcher using the youtube-transcript package.
 * Fetches auto-generated captions — no Whisper, no audio download.
 */

import { YoutubeTranscript } from "youtube-transcript";

/**
 * Fetch the full transcript for a YouTube video.
 * Returns cleaned, concatenated text.
 *
 * @param {string} videoId - YouTube video ID (11-char string or full URL)
 * @returns {Promise<string|null>} - Full transcript text, or null if unavailable
 */
export async function getTranscript(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: "en",
    });

    if (!segments?.length) return null;

    // Concatenate all segments into clean running text
    const raw = segments.map((s) => s.text || "").join(" ");

    // Clean up: remove [Music], [Applause], double spaces, HTML entities
    return raw
      .replace(/\[.*?\]/g, "")           // remove captions like [Music]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, " ")           // collapse whitespace
      .trim();
  } catch (err) {
    // Transcripts are unavailable for some channels — graceful null return
    console.warn(`[transcript] Could not fetch transcript for ${videoId}:`, err.message);
    return null;
  }
}

/**
 * Extract the most relevant section of a transcript for a given set of keywords.
 * Breaks transcript into ~500-word chunks, scores each by keyword density,
 * returns the top chunk(s) up to ~2000 words total.
 *
 * @param {string} transcript - Full transcript text
 * @param {string[]} keywords - Keywords to search for in the transcript
 * @param {number} maxWords - Max words to return (default 2000)
 * @returns {string} - Relevant transcript excerpt
 */
export function extractReviewerAnalysis(transcript, keywords, maxWords = 2000) {
  if (!transcript) return "";

  const words = transcript.split(/\s+/);
  const CHUNK_SIZE = 400; // words per chunk

  // Build overlapping chunks
  const chunks = [];
  for (let i = 0; i < words.length; i += Math.floor(CHUNK_SIZE / 2)) {
    const chunk = words.slice(i, i + CHUNK_SIZE).join(" ");
    chunks.push({ text: chunk, startIndex: i });
  }

  // Score each chunk by keyword density
  const kwLower = keywords.map((k) => k.toLowerCase());
  const scored = chunks.map((chunk) => {
    const text = chunk.text.toLowerCase();
    const score = kwLower.reduce((acc, kw) => {
      return acc + (text.includes(kw) ? 1 : 0);
    }, 0);
    return { ...chunk, score };
  });

  // Sort by score, take top chunks (no duplicates), up to maxWords
  scored.sort((a, b) => b.score - a.score);
  const selected = [];
  const usedIndices = new Set();
  let totalWords = 0;

  for (const chunk of scored) {
    if (totalWords >= maxWords) break;
    // Avoid overlapping chunks (within 200 words of an already-selected chunk)
    const tooClose = [...usedIndices].some(
      (idx) => Math.abs(idx - chunk.startIndex) < 200
    );
    if (!tooClose) {
      selected.push(chunk);
      usedIndices.add(chunk.startIndex);
      totalWords += chunk.text.split(/\s+/).length;
    }
  }

  // Re-sort selected chunks by original position for coherent reading
  selected.sort((a, b) => a.startIndex - b.startIndex);

  return selected.map((c) => c.text).join("\n\n[...]\n\n");
}

/**
 * Extract the video ID from a YouTube URL or return the ID if already extracted.
 * @param {string} urlOrId
 * @returns {string|null}
 */
export function extractVideoId(urlOrId) {
  if (!urlOrId) return null;
  // Already a plain ID (11 chars, no slashes)
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;

  try {
    const url = new URL(urlOrId);
    // youtu.be/ID format
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("?")[0];
    // youtube.com/watch?v=ID format
    return url.searchParams.get("v");
  } catch {
    return null;
  }
}
