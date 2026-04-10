// End-to-end pipeline test: Extract + Reason
// Usage: node extractor/test_pipeline.js [url] [question]

import { pipeline } from './pipeline.js';

const DEFAULT_URL = 'https://en.wikipedia.org/wiki/Wikipedia:Random_pages_test';
const DEFAULT_QUERY = 'What subjects does Wikipedia cover and in what proportions according to the visualisation?';

async function main() {
  const url = process.argv[2] || DEFAULT_URL;
  const query = process.argv[3] || DEFAULT_QUERY;

  console.log('='.repeat(60));
  console.log('PAYGENT PIPELINE TEST');
  console.log('='.repeat(60));

  try {
    const result = await pipeline(url, query);

    console.log('\n' + '='.repeat(60));
    console.log('RESULT');
    console.log('='.repeat(60));
    console.log(`\nAnswer:\n${result.answer}`);
    console.log(`\n--- Stats ---`);
    console.log(`URL: ${result.url}`);
    console.log(`Query: "${result.query}"`);
    console.log(`Text extracted: ${result.extraction.textLength} chars`);
    console.log(`OCR blocks: ${result.extraction.ocrBlocks}`);
    console.log(`Extraction time: ${result.extraction.durationMs}ms`);
    console.log(`Reasoning time: ${result.reasoning.durationMs}ms`);
    console.log(`Total time: ${result.totalDurationMs}ms`);
    console.log(`Model: ${result.reasoning.model}`);
  } catch (err) {
    console.error('\nPipeline failed:', err.message);
    if (err.message.includes('Ollama is not running')) {
      console.log('\nMake sure Ollama is running: ollama serve');
      console.log('And the model is pulled: ollama pull gemma4:e4b');
    }
  }
}

main();
