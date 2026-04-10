// Extraction agent — plugs into the existing Paygent agent system.
// Unlike other agents (search, news, financial) which use APIs,
// this one extracts + reasons over actual webpage content.

import { extractAndOcr } from '../extractor/web_scraper.js';

/**
 * Detects if a query contains a URL to extract from.
 * @param {string} query
 * @returns {string|null} - The URL if found, null otherwise
 */
export function detectUrl(query) {
  const urlMatch = query.match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : null;
}

/**
 * Extract agent — fetches a URL, extracts its text, and returns it
 * as context for the synthesizer to reason over.
 * @param {string} query - User query (should contain a URL)
 * @returns {{ answer: string, sources: string[] }}
 */
export async function extractAgent(query) {
  const url = detectUrl(query);

  if (!url) {
    return {
      answer: 'No URL detected in the query. Please include a webpage URL to extract.',
      sources: [],
    };
  }

  try {
    const result = await extractAndOcr(url, {
      waitForNetworkIdle: true,
      performOcr: true,
    });

    // Build a clean summary for the synthesizer
    const textPreview = result.combinedText.substring(0, 8000);

    return {
      answer: textPreview,
      sources: [url],
      meta: {
        textLength: result.combinedText.length,
        ocrBlocks: result.ocrResults.length,
      },
    };
  } catch (err) {
    return {
      answer: `Failed to extract content from ${url}: ${err.message}`,
      sources: [url],
    };
  }
}
