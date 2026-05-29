/**
 * lib/llm.js
 * Claude API client — separate functions per pass.
 * Pass 1 uses Haiku (cheap, mechanical), Passes 2/3 + Feature 1 use Sonnet.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PASS1_PROMPT, PASS2_PROMPT, PASS3_PROMPT, UTILITY_CHECK_PROMPT } from "./prompts.js";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const SONNET_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

/**
 * Parse LLM response to JSON. Retries once with an explicit JSON instruction
 * if the initial response can't be parsed (handles common "here is the JSON: {...}" patterns).
 * @param {string} text - Raw LLM response text
 * @param {Function} retryFn - Async function to retry with stricter JSON instruction
 * @returns {object} - Parsed JSON object
 */
async function parseJsonResponse(text, retryFn) {
  // Try direct parse
  try {
    return JSON.parse(text.trim());
  } catch (_) {}

  // Try extracting JSON block from markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (_) {}
  }

  // Try extracting the first { ... } block
  const braceMatch = text.match(/\{[\s\S]+\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0]);
    } catch (_) {}
  }

  // Last resort: retry with explicit JSON instruction
  if (retryFn) {
    console.warn("[llm] Failed to parse JSON, retrying with explicit instruction...");
    const retryText = await retryFn();
    return JSON.parse(retryText.trim());
  }

  throw new Error(`LLM response could not be parsed as JSON:\n${text.slice(0, 500)}`);
}

/**
 * Internal: Call Claude with given model and prompt. Returns raw text.
 */
async function callClaude(model, prompt, extraInstruction = "") {
  const fullPrompt = extraInstruction
    ? `${prompt}\n\n${extraInstruction}`
    : prompt;

  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: fullPrompt }],
  });

  return message.content[0]?.text || "";
}

// ---------------------------------------------------------------------------
// Pass 1 — Hard Spec Elimination (Haiku — cheap + fast)
// ---------------------------------------------------------------------------

/**
 * @param {Array} products - Array of { asin, title, specs }
 * @param {string} requirements - User's requirement string
 * @returns {Promise<{ survivors: Array, eliminated: Array }>}
 */
export async function runPass1(products, requirements) {
  const prompt = PASS1_PROMPT(products, requirements);

  const text = await callClaude(HAIKU_MODEL, prompt);

  return parseJsonResponse(text, async () =>
    callClaude(
      HAIKU_MODEL,
      prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever."
    )
  );
}

// ---------------------------------------------------------------------------
// Pass 2 — Soft Requirement Scoring (Sonnet)
// ---------------------------------------------------------------------------

/**
 * @param {Array} products - Array of { asin, title, specs, reviews }
 * @param {string} requirements - User's requirement string
 * @returns {Promise<{ ranked: Array }>}
 */
export async function runPass2(products, requirements) {
  const prompt = PASS2_PROMPT(products, requirements);

  const text = await callClaude(SONNET_MODEL, prompt);

  return parseJsonResponse(text, async () =>
    callClaude(
      SONNET_MODEL,
      prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever."
    )
  );
}

// ---------------------------------------------------------------------------
// Pass 3 — YouTube Validation (Sonnet)
// ---------------------------------------------------------------------------

/**
 * @param {Array} topProducts - Top 3 products from Pass 2
 * @param {string} requirements - User's requirement string
 * @param {Array} youtubeData - YouTube signals per product
 * @returns {Promise<{ finalRanking: Array }>}
 */
export async function runPass3(topProducts, requirements, youtubeData) {
  const prompt = PASS3_PROMPT(topProducts, requirements, youtubeData);

  const text = await callClaude(SONNET_MODEL, prompt);

  return parseJsonResponse(text, async () =>
    callClaude(
      SONNET_MODEL,
      prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever."
    )
  );
}

// ---------------------------------------------------------------------------
// Feature 1 — Utility Check (Sonnet)
// ---------------------------------------------------------------------------

/**
 * @param {object} product - Product details
 * @param {string} userContext - User's declared use case
 * @param {object} signals - { reviews, transcript, comments }
 * @returns {Promise<object>} - Verdict object
 */
export async function runUtilityCheck(product, userContext, signals) {
  const prompt = UTILITY_CHECK_PROMPT(product, userContext, signals);

  const text = await callClaude(SONNET_MODEL, prompt);

  return parseJsonResponse(text, async () =>
    callClaude(
      SONNET_MODEL,
      prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever."
    )
  );
}
