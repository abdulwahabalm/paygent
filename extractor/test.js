import { extractAndOcr } from './web_scraper.js';
import fs from 'fs/promises';

async function main() {
    console.log("Starting pipeline test...");
    const url = process.argv[2] || 'https://en.wikipedia.org/wiki/Web_scraping';
    
    console.log(`Target URL: ${url}`);
    
    try {
        const result = await extractAndOcr(url, {
            waitForNetworkIdle: true,
            performOcr: true
        });

        console.log("=== Extraction Result ===");
        console.log(`DOM Text length: ${result.textContent.length} characters`);
        console.log(`OCR Blocks found: ${result.ocrResults.length}`);
        console.log("\n--- Combined Text Snippet ---");
        console.log(result.combinedText.substring(0, 1000) + "\n... [truncated]");

        // Save to file for inspection
        await fs.writeFile('extraction_result.json', JSON.stringify(result, null, 2));
        console.log("\nFull output saved to extraction_result.json");
    } catch (e) {
        console.error("Test failed:", e);
    }
}

main();
