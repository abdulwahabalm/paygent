// Full pipeline: URL → Extract (Playwright + OCR) → Reason (Gemma)
// This is the main entry point for the new modular architecture.

import { extractAndOcr } from './web_scraper.js';
import { reason } from './reason.js';

/**
 * Complete pipeline: extract text from a URL, then reason over it.
 * @param {string} url - The webpage URL to analyze
 * @param {string} query - The user's question about the page
 * @param {object} options - Pipeline options
 * @returns {object} - { answer, extraction, reasoning }
 */
export async function pipeline(url, query, options = {}) {
  const {
    performOcr = true,
    temperature = 0.3,
  } = options;

  console.log(`\n[Pipeline] Starting for: ${url}`);
  console.log(`[Pipeline] Query: "${query}"`);

  // Step 1: Extract text from the webpage
  console.log('[Pipeline] Step 1: Extracting webpage content...');
  const startExtract = Date.now();

  const extraction = await extractAndOcr(url, {
    waitForNetworkIdle: true,
    performOcr,
  });

  const extractMs = Date.now() - startExtract;
  console.log(`[Pipeline] Extraction done in ${extractMs}ms`);
  console.log(`[Pipeline]   DOM text: ${extraction.textContent.length} chars`);
  console.log(`[Pipeline]   OCR blocks: ${extraction.ocrResults.length}`);
  console.log(`[Pipeline]   Combined: ${extraction.combinedText.length} chars`);

  // Step 2: Send extracted text to Gemma for reasoning
  console.log('[Pipeline] Step 2: Reasoning with Gemma...');
  const startReason = Date.now();

  const reasoning = await reason(query, extraction.combinedText, { temperature });

  const reasonMs = Date.now() - startReason;
  console.log(`[Pipeline] Reasoning done in ${reasonMs}ms`);
  console.log(`[Pipeline]   Tokens: ${reasoning.tokensUsed || 'unknown'}`);

  return {
    answer: reasoning.answer,
    url,
    query,
    extraction: {
      textLength: extraction.combinedText.length,
      ocrBlocks: extraction.ocrResults.length,
      durationMs: extractMs,
    },
    reasoning: {
      model: reasoning.model,
      tokensUsed: reasoning.tokensUsed,
      durationMs: reasonMs,
    },
    totalDurationMs: extractMs + reasonMs,
  };
}
