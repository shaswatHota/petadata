/**
 * lib/llm.js
 * Modular LLM client — supports Claude (Anthropic) and Gemini (@google/genai).
 *
 * llmConfig shape: { provider: "claude" | "gemini", model: string }
 *
 * Claude defaults:
 *   - pass1 (cheap, mechanical): claude-haiku-4-5-20251001
 *   - all others (reasoning): claude-sonnet-4-20250514
 *
 * Gemini defaults:
 *   - pass1 (cheap, mechanical): gemini-2.0-flash
 *   - all others (reasoning): gemini-2.5-flash
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { PASS1_PROMPT, PASS2_PROMPT, PASS3_PROMPT, UTILITY_CHECK_PROMPT } from "./prompts.js";

// ---------------------------------------------------------------------------
// Clients — lazy-initialised so missing keys don't crash at import time
// ---------------------------------------------------------------------------

let _anthropic = null;
function getAnthropicClient() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

let _gemini = null;
function getGeminiClient() {
  if (!_gemini) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
    _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _gemini;
}

// ---------------------------------------------------------------------------
// Default model names
// ---------------------------------------------------------------------------

export const LLM_PROVIDERS = {
  claude: {
    label: "Claude (Anthropic)",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fast)" },
    ],
    defaultModel: "claude-sonnet-4-20250514",
    cheapModel: "claude-haiku-4-5-20251001",
  },
  gemini: {
    label: "Gemini (Google)",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Recommended)" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (Powerful)" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Fast)" },
    ],
    defaultModel: "gemini-2.5-flash",
    cheapModel: "gemini-2.0-flash",
  },
};

const MAX_TOKENS = 4096;

// ---------------------------------------------------------------------------
// JSON parsing helper
// ---------------------------------------------------------------------------

/**
 * Parse LLM response to JSON. Retries once with an explicit JSON instruction
 * if the initial response can't be parsed.
 */
async function parseJsonResponse(text, retryFn) {
  try {
    return JSON.parse(text.trim());
  } catch (_) {}

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }

  const braceMatch = text.match(/\{[\s\S]+\}/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[0]); } catch (_) {}
  }

  if (retryFn) {
    console.warn("[llm] Failed to parse JSON, retrying with explicit instruction...");
    const retryText = await retryFn();
    return JSON.parse(retryText.trim());
  }

  throw new Error(`LLM response could not be parsed as JSON:\n${text.slice(0, 500)}`);
}

// ---------------------------------------------------------------------------
// Core unified callLLM — dispatches to the right provider
// ---------------------------------------------------------------------------

/**
 * Call the specified LLM provider and return raw text.
 * @param {string} provider - "claude" | "gemini"
 * @param {string} model - model name/ID
 * @param {string} prompt - the full prompt string
 * @param {string} [extraInstruction] - optional suffix appended to the prompt
 */
async function callLLM(provider, model, prompt, extraInstruction = "") {
  const fullPrompt = extraInstruction ? `${prompt}\n\n${extraInstruction}` : prompt;

  if (provider === "gemini") {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
      config: { maxOutputTokens: MAX_TOKENS },
    });
    return response.text ?? "";
  }

  // Default: claude
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: fullPrompt }],
  });
  return message.content[0]?.text ?? "";
}

// ---------------------------------------------------------------------------
// Resolve provider + model from optional llmConfig, with smart defaults
// ---------------------------------------------------------------------------

function resolveConfig(llmConfig, useCheapModel = false) {
  const provider = llmConfig?.provider || "claude";
  const providerDef = LLM_PROVIDERS[provider] || LLM_PROVIDERS.claude;

  let model;
  if (llmConfig?.model) {
    model = llmConfig.model;
  } else if (useCheapModel) {
    model = providerDef.cheapModel;
  } else {
    model = providerDef.defaultModel;
  }

  return { provider, model };
}

// ---------------------------------------------------------------------------
// Pass 1 — Hard Spec Elimination (cheap model)
// ---------------------------------------------------------------------------

/**
 * @param {Array} products - Array of { asin, title, specs }
 * @param {string} requirements - User's requirement string
 * @param {object} [llmConfig] - { provider, model }
 * @returns {Promise<{ survivors: Array, eliminated: Array }>}
 */
export async function runPass1(products, requirements, llmConfig) {
  const { provider, model } = resolveConfig(llmConfig, true); // use cheap model
  const prompt = PASS1_PROMPT(products, requirements);
  const text = await callLLM(provider, model, prompt);
  return parseJsonResponse(text, async () =>
    callLLM(provider, model, prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever.")
  );
}

// ---------------------------------------------------------------------------
// Pass 2 — Soft Requirement Scoring
// ---------------------------------------------------------------------------

/**
 * @param {Array} products - Array of { asin, title, specs, reviews }
 * @param {string} requirements - User's requirement string
 * @param {object} [llmConfig] - { provider, model }
 * @returns {Promise<{ ranked: Array }>}
 */
export async function runPass2(products, requirements, llmConfig) {
  const { provider, model } = resolveConfig(llmConfig);
  const prompt = PASS2_PROMPT(products, requirements);
  const text = await callLLM(provider, model, prompt);
  return parseJsonResponse(text, async () =>
    callLLM(provider, model, prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever.")
  );
}

// ---------------------------------------------------------------------------
// Pass 3 — YouTube Validation
// ---------------------------------------------------------------------------

/**
 * @param {Array} topProducts - Top 3 products from Pass 2
 * @param {string} requirements - User's requirement string
 * @param {Array} youtubeData - YouTube signals per product
 * @param {object} [llmConfig] - { provider, model }
 * @returns {Promise<{ finalRanking: Array }>}
 */
export async function runPass3(topProducts, requirements, youtubeData, llmConfig) {
  const { provider, model } = resolveConfig(llmConfig);
  const prompt = PASS3_PROMPT(topProducts, requirements, youtubeData);
  const text = await callLLM(provider, model, prompt);
  return parseJsonResponse(text, async () =>
    callLLM(provider, model, prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever.")
  );
}

// ---------------------------------------------------------------------------
// Feature 1 — Utility Check
// ---------------------------------------------------------------------------

/**
 * @param {object} product - Product details
 * @param {string} userContext - User's declared use case
 * @param {object} signals - { reviews, transcript, comments }
 * @param {object} [llmConfig] - { provider, model }
 * @returns {Promise<object>} - Verdict object
 */
export async function runUtilityCheck(product, userContext, signals, llmConfig) {
  const { provider, model } = resolveConfig(llmConfig);
  const prompt = UTILITY_CHECK_PROMPT(product, userContext, signals);
  const text = await callLLM(provider, model, prompt);
  return parseJsonResponse(text, async () =>
    callLLM(provider, model, prompt,
      "IMPORTANT: Return ONLY the raw JSON object. No markdown, no explanation, no surrounding text whatsoever.")
  );
}
