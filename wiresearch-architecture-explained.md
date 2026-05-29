# WireSearch — Buyer-Intelligence Product Research Tool
> Build plan for Cursor. Read this entire file before writing a single line of code.

---

## What This Is

A product research tool with two features:

- **Feature 1 — Utility Check**: User has a specific product in mind. They declare their use case. The tool tells them whether that product actually serves their needs, backed by specs, real reviews, and independent YouTube analysis.
- **Feature 2 — Discovery**: User describes what they want ("decent phone, good battery, bloat-free, under ₹20k"). The tool finds the best matching products using a three-pass tiered retrieval architecture, not a simple search.

Both features use Wire (Anakin's authenticated action layer) for data, Claude Sonnet for reasoning, and YouTube transcripts + Amazon reviews as layered signal sources.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) | Frontend + API routes in one project, no separate backend |
| Styling | Tailwind CSS | Fast, clean, no custom CSS overhead |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-20250514`) | Pass 2 and Pass 3 reasoning |
| LLM (cheap pass) | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | Pass 1 only — mechanical spec filtering |
| Data layer | Wire API (Anakin) | Amazon + YouTube data via authenticated actions |
| Transcripts | `youtube-transcript` npm package | Fetches auto-generated YouTube captions — no Whisper, no audio download |
| Deployment | Vercel | Auto-detects Next.js, one push to deploy |

---

## Project Structure

```
wiresearch/
├── app/
│   ├── page.jsx                        # Home — landing with both feature entry points
│   ├── check/
│   │   └── page.jsx                    # Feature 1: Utility Check UI
│   ├── discover/
│   │   └── page.jsx                    # Feature 2: Discovery UI
│   ├── results/
│   │   └── page.jsx                    # Shared results display page
│   └── api/
│       ├── check/
│       │   └── route.js                # Feature 1 pipeline endpoint
│       └── discover/
│           └── route.js                # Feature 2 pipeline endpoint
├── lib/
│   ├── wire.js                         # Wire API client — wireCall() utility + all action helpers
│   ├── llm.js                          # Claude API client — separate functions per pass
│   ├── transcript.js                   # YouTube transcript fetcher + section extractor
│   ├── filters.js                      # Comment scoring formula, review keyword filter
│   └── prompts.js                      # All LLM prompt templates in one place
├── components/
│   ├── SearchBar.jsx                   # Query input with context declaration
│   ├── ProductCard.jsx                 # Single product result display
│   ├── UtilityVerdict.jsx              # Feature 1 verdict display
│   ├── LoadingPipeline.jsx             # Shows which pass is currently running
│   └── SignalBreakdown.jsx             # Shows which sources contributed to verdict
├── .env.local                          # API keys (never committed)
└── package.json
```

---

## Environment Variables

```bash
# .env.local
WIRE_API_KEY=your_wire_api_key
WIRE_BASE_URL=https://api.anakin.ai/v1/wire        # confirm exact URL from Anakin docs
ANTHROPIC_API_KEY=your_anthropic_api_key
```

---

## Wire Integration — The Foundation

Build this first. Everything else depends on it.

Wire's actions are all **ASYNC** — you POST a request, get a job ID back, then poll until complete. Build one utility that handles this for every Wire call in the project.




# WireSearch — How It Works
> Plain English explanation of the architecture, data flow, and every decision made. No code.

---

## What The Product Does In One Paragraph

Most people research products badly. They read Amazon reviews that may be fake, or watch a YouTube review that may be sponsored, and make a decision based on one biased source. WireSearch layers three independent sources — Amazon specs, Amazon reviews, and YouTube reviewer transcripts plus comments — and treats them differently based on what each source is actually good at. It does this for two distinct tasks: checking whether a specific product fits your needs, and finding the best product for your needs when you don't have one in mind yet.

---

## The Two Features

### Feature 1 — Utility Check

You already have a product in mind. Maybe someone recommended it, maybe you saw it on Instagram. You want to know: is this actually right for me?

You tell the system the product name or paste the Amazon link. Then you describe your situation — not in a form with dropdowns, but in plain language. Something like "student, using it for 8 hours a day at my desk, mostly lo-fi music and podcasts, budget around ₹3000." The system takes that context and evaluates the product specifically against it. The output is a verdict — good fit, acceptable, or poor fit — with a plain English explanation of why, what the product does well for your use case, where it falls short, and whether you're likely missing a better option.

### Feature 2 — Discovery

You don't have a product in mind. You just know what you want. Something like "Android phone, good battery, no bloat, reliable, under ₹20,000." The system searches Amazon, filters the results intelligently across three passes, and returns a ranked list of the best matches — not just the highest rated, but the ones that genuinely match what you said, including things like "no bloat" that Amazon's own search cannot filter for.

---

## Why Wire Is Essential

Both features need data from Amazon and YouTube. The problem is that neither site gives you an API that returns what you actually need:

Amazon's public data doesn't include the structured spec blocks inside product pages, the full review database filtered by verified purchase status, or the ability to pull offers from multiple sellers simultaneously. You'd normally need a browser session and a scraper that breaks every few weeks.

YouTube's public API doesn't let you deep-walk 10,000 comments on a video, and it returns different search results depending on whether you're logged in or not.

Wire solves this entirely. It acts as a pre-built authenticated layer — you call it like an API, pass what you want, and get back clean structured JSON. The auth, the anti-bot bypass, the proxy routing, all of it is Wire's problem. Your code just receives data.

---

## The Three Data Sources And What Each One Is Good For

Understanding why the system uses three sources — and what job each one does — is the core of the architecture.

### Amazon Product Specs

This is objective ground truth. Battery capacity in mAh, RAM in GB, processor generation, weight, dimensions, compatibility. These are facts that cannot be argued with. If a user wants a phone with at least 5000mAh battery and a product has 4000mAh, it fails. No amount of positive reviews changes that. The spec filter uses this source to eliminate products that objectively don't qualify before spending any effort on nuanced analysis.

### Amazon Reviews

This is longitudinal truth — what real owners say after weeks or months of use. Amazon reviews are good at surfacing durability patterns ("hinge broke after 3 months"), long-term battery degradation ("holds charge fine initially but after 6 months noticeably worse"), and use-case specific experiences ("I use this for running and it stays in my ears fine"). The weakness is that Amazon reviews can be gamed — review farms, incentivised reviews, fake verified purchases. The system accounts for this by not relying on Amazon reviews alone, and by filtering them specifically for your stated use case rather than reading all of them.

### YouTube Reviewer Transcripts

This is comparative truth. A YouTube reviewer has typically held 10 similar products in their hands. They say things Amazon reviewers never say — "this is better than the Sony WH-1000XM5 for commute but worse for gym use," or "the bass is muddier than the boAt Rockerz 450 at this price point." That comparative context is unique to video reviewers. The system doesn't watch the video — it fetches the auto-generated transcript that YouTube produces for virtually every video, extracts the reviewer's structured analysis, and passes that to the LLM.

### YouTube Comments

This is the correction layer. Its one specific job: catching when the primary sources are wrong or compromised. If a YouTube reviewer was paid to review a product, the comments are where real buyers surface that — "this review was sponsored, I've had this for 5 months and the coating peeled." It also catches regional edge cases and long-tail failures the reviewer didn't test. Comments are aggressively filtered before being used — only a fraction of total comments are actually passed to the LLM, selected by a scoring formula described below.

---

## Comment Filtering — Why and How

Passing all YouTube comments to an LLM is expensive and counterproductive. Most comments are noise — "great video!", "first!", single words, spam, or completely off-topic conversations. The LLM's reasoning quality degrades when it has to wade through noise to find signal.

The filtering works in three steps:

First, the system calculates how many comments to keep. It takes 10 percent of the total comment count, but caps it at 200 and floors it at 30. So if a video has 500 comments, it keeps 50. If it has 50,000 comments, it still only keeps 200. This is the quantity filter.

Second, it removes obvious noise. Any comment with fewer than 8 words is discarded. This eliminates single reactions, emoji-only comments, and short spam without needing any LLM to judge them.

Third, it scores the remaining comments by recency-weighted engagement. The formula rewards comments that got a lot of likes and replies, adjusted for how old the comment is. A comment from last week with 50 likes scores higher than a comment from two years ago with 100 likes. This surfaces the comments the community itself found most useful, which is a strong proxy for informativeness.

The result is typically 50 to 150 comments, all substantive, all high-signal, ready to pass to the LLM without noise.

---

## Review Filtering — The Keyword Approach

Amazon reviews are also filtered before being used. Not all reviews about a product are relevant to your use case. If you're buying earphones for studying, a review that's entirely about gym use is noise. A review that mentions "8 hours," "long sessions," "comfort," or "fatigue" is signal.

The system extracts the meaningful words from your context declaration — stripping out common words like "a", "the", "and", "good" — and uses those as a relevance filter. Reviews that mention more of your keywords get ranked higher. Reviews from verified purchasers get a bonus. Reviews with more helpful votes get a smaller bonus. The system then takes the top 8 to 10 reviews that survive this filter.

This means the LLM never reads a review about gym sweat resistance when you told it you need earphones for your desk. Every token the LLM reads is relevant to the decision at hand.

---

## The Three-Pass Architecture (Feature 2 Only)

Feature 2's core innovation is that it doesn't try to do everything in one step. It runs three passes, each one doing a different type of job that the previous pass cannot do.

### Why Not One Big Pass?

If you pass 25 products with all their specs, all their reviews, and YouTube data to an LLM in one go, two things happen. First, the token cost is enormous. Second, the quality degrades — LLMs reason better on focused tasks than on everything at once. And most importantly, you'd be fetching YouTube data for 25 products when you only need it for 3.

### Pass 1 — Hard Spec Elimination

The cheapest and fastest pass. It uses the smaller, cheaper LLM (Haiku) because the task is purely mechanical. It receives the spec block for every product — just the structured facts, nothing else — and eliminates anything that objectively fails the user's requirements.

If you said "under ₹20,000" and a product costs ₹24,000, it's gone. If you need at least 6GB RAM and a product has 4GB, it's gone. No reviews needed. No YouTube needed. Just facts.

This pass reduces 20-30 products down to 10-15 survivors. The cost of this pass is low because specs are compact and Haiku is cheap. The time cost is low because it runs in one LLM call.

### Pass 2 — Soft Requirement Scoring

This is where the real intelligence lives. The task is no longer objective — it's about things like "bloat-free," "reliable," "good battery in real use." These cannot be verified from specs. They live in what people who bought and used the product actually reported.

The system fetches Amazon reviews for each surviving product, filters them using the keyword method described above, and passes everything to the smarter LLM (Sonnet). Sonnet reads the reviews and assigns scores for each of your soft requirements — how bloat-free is this phone based on what reviewers say? How reliable? How good is the battery in practice compared to the spec?

The output is a ranked list of 8-10 products ordered by how well they match your full stated requirements, both hard and soft.

### Pass 3 — YouTube Validation For Top 3 Only

After Pass 2, the system knows which products are in the top 3. These are the close-call candidates where Amazon signal alone may not be enough to separate them confidently. Pass 3 adds an independent external source to validate those rankings.

For each of the top 3 products, the system finds a YouTube review video, fetches the transcript, fetches and filters the comments, and passes all of that to Sonnet alongside the Pass 2 rankings. Sonnet's job in this pass is specifically to confirm, contradict, or flag uncertainty in what Pass 2 found.

It looks for three things: whether the YouTube reviewer appears to be sponsored (no real criticisms, unusually positive throughout), whether there are contradictions between Amazon reviewer experiences and the YouTube reviewer's findings, and whether anything in the transcript or comments is a deal-breaker for your specific use case that Pass 2 missed.

The output is a final ranked list of top products with confidence levels and any flags.

---

## Why YouTube Data Only Runs For The Top 3

This is the most important efficiency decision in the architecture.

Fetching a YouTube video, getting its transcript, and fetching its comments are three separate API calls per product. If you did this for all 25 initial products, that's 75 API calls before you even run the LLM. Most of that data is wasted because most of those products won't be in the final recommendation anyway.

By the time you reach Pass 3, you've already used objective spec filtering and real-world review analysis to narrow down to 3 genuine finalists. YouTube validation only needs to run on products where the decision is actually ambiguous. If a product clearly won in Pass 2 by a large margin, you don't need YouTube to confirm it — you already know.

This design keeps the total number of Wire API calls predictable and bounded, regardless of how broad or narrow the initial search was.

---

## How Feature 1 Is Different Structurally

Feature 1 doesn't use passes because you already know which product you're evaluating. There's no elimination stage needed.

Instead, it runs all data fetching in parallel — product specs, Amazon reviews, and YouTube search all happen at the same time. Then it runs a single LLM call with all the signals combined, because the task is evaluating one product against one user's context, not comparing dozens of products against each other.

This makes Feature 1 significantly faster than Feature 2. The wait time is determined by whichever Wire call takes longest, not by sequential passes.

---

## The Wire Async Pattern — What It Means Practically

Every Wire action is asynchronous. This means when you ask Wire to fetch Amazon product details, it doesn't return the data immediately. It returns a job ID, and you have to ask Wire periodically "is this job done yet?" until it says yes.

This is how Wire handles anti-bot systems and login persistence under the hood — the request goes through Wire's infrastructure which may need a moment to route through the right proxy or maintain the right session. From the application's perspective, it just means every Wire call is a two-step process: submit the request and get a job ID, then poll for the result every 1.5 seconds until it's done.

The system handles this transparently — the calling code doesn't have to think about it. There's a single utility function that manages the full lifecycle of every Wire call, so the rest of the codebase just calls it and waits for data.

---

## The LLM Routing Decision

Not every LLM call requires the same level of reasoning. Using the most capable model for everything would be both wasteful and unnecessary.

Pass 1 uses Haiku — the smallest, cheapest, fastest model. The task is purely mechanical: does this number exceed this threshold? Is this feature present? A model with less reasoning depth is perfectly capable of this.

Passes 2 and 3, and Feature 1's single verdict call, use Sonnet — the mid-tier model. The tasks here require genuine language understanding: reading review text and inferring whether a phone feels "bloat-free" based on how 8 different reviewers described their experience, or detecting whether a YouTube reviewer's enthusiasm seems organic or paid. Haiku is not reliable at this level of inference. Sonnet handles it well.

The practical effect: Pass 1 costs a fraction of what Pass 2 costs, even though it processes more raw data, because Haiku is dramatically cheaper per token than Sonnet.

---

## The File Structure And Why It's Organized This Way

The project is a single Next.js application — one folder, one codebase, one deployment. There is no separate backend server. Next.js's API routes function as the backend — they run on the server, have access to environment variables, and are never exposed to the browser.

The library folder contains five files that each have exactly one responsibility. Wire calls live in one file. LLM calls live in one file. Transcript fetching lives in one file. Filtering logic lives in one file. Prompt templates live in one file. This separation matters during a 48-hour build because when something breaks — and something always breaks — you know exactly which file to open. The pipeline logic doesn't have filtering logic tangled into it. The LLM file doesn't have Wire calls tangled into it.

The API routes are thin — they orchestrate calls to the library functions but don't contain business logic themselves. This makes them easy to read and debug without understanding the full codebase.

---

## What Happens When Things Go Wrong

The system is designed to degrade gracefully rather than fail completely.

If a YouTube transcript is unavailable for a product — some channels disable auto-captions — the system skips that source and notes it in the response. The verdict is still generated using Amazon signals alone, with a flag indicating that YouTube validation was unavailable.

If Pass 3 fails for any reason, the system returns Pass 2's rankings as the result, since those are already high quality. The user gets a good answer, not an error.

If the LLM returns something that can't be parsed as JSON, the system retries once with an explicit instruction to return only raw JSON with no surrounding text. This covers the common case of the model adding a brief explanatory sentence before the JSON.

If Wire times out on a product — which can happen if a product page is unusually complex — that product is simply excluded from the results, and the pipeline continues with whatever survived.

---

## The Demo Queries And What They Prove

Three specific queries are prepared for the demonstration, each proving a different capability.

The first query is a specific product utility check — something like boAt Airdopes 141 for office commute and Teams calls. This proves Feature 1 works end-to-end and that the verdict is specific to the stated context, not generic.

The second query is a discovery query with mix of hard and soft requirements — wireless earphones for gym use, sweat resistant, under ₹2000. This proves Feature 2 works and that hard requirements (under ₹2000, sweat resistant) are correctly applied in Pass 1.

The third query is the most important for judges: a phone request where the primary requirements are entirely soft — "bloat-free, reliable, good battery" — with only price as a hard filter. This demonstrates the core value proposition. Amazon's search cannot filter for "bloat-free." Google Shopping cannot filter for "reliable." These are experiential attributes that only live in review text. Pass 2 surfaces them. This query is where you explain to judges that this result is impossible to get any other way — not without Wire giving you authenticated access to review data at this depth, and not without the tiered retrieval architecture that makes it practical to process.
