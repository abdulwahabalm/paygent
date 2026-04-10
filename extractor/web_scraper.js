import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function extractAndOcr(url, options = {}) {
    const {
        waitForNetworkIdle = true,
        performOcr = true
    } = options;

    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext();
    const page = await context.newPage();

    let textContent = '';
    let ocrResults = [];
    const tempDir = path.join(__dirname, 'temp_images');
    
    // Ensure temp dir exists
    await fs.mkdir(tempDir, { recursive: true });

    try {
        await page.goto(url, {
            waitUntil: waitForNetworkIdle ? 'networkidle' : 'domcontentloaded',
            timeout: 30000
        });

        // 1. Get entire HTML
        const html = await page.content();
        
        // 2. Parse text with Readability
        const doc = new JSDOM(html, { url });
        const reader = new Readability(doc.window.document);
        const article = reader.parse();
        
        if (article && article.textContent) {
            textContent = article.textContent.trim().replace(/\n{3,}/g, '\n\n');
        } else {
            // Fallback plain text if Readability fails
            textContent = await page.evaluate(() => document.body.innerText);
        }

        // 3. Find target elements for OCR
        if (performOcr) {
            const elementsToOcr = await page.evaluate(() => {
                const results = [];
                // Find canvases
                document.querySelectorAll('canvas').forEach((el, idx) => {
                    if (el.getBoundingClientRect().width > 10 && el.getBoundingClientRect().height > 10) {
                        results.push({ type: 'canvas', selector: `canvas:nth-of-type(${idx + 1})` });
                    }
                });

                // Find large images and wikipedia thumbnails that might contain charts or text
                document.querySelectorAll('img, .thumbinner, svg, canvas').forEach((el, idx) => {
                    const rect = el.getBoundingClientRect();
                    // Target substantial images (like charts/diagrams), ignore tiny 1x1 pixels
                    if (rect.width > 50 && rect.height > 50) {
                        el.setAttribute('data-ocr-target', `vis-${idx}`);
                        results.push({ type: el.tagName.toLowerCase(), selector: `[data-ocr-target="vis-${idx}"]` });
                    }
                });
                
                return results;
            });
            console.log("Elements to OCR found:", elementsToOcr.length);

            // 4. Screenshot and OCR
            for (let i = 0; i < elementsToOcr.length; i++) {
                const elInfo = elementsToOcr[i];
                const elementHandle = await page.$(elInfo.selector);
                
                if (elementHandle) {
                    const imgPath = path.join(tempDir, `ocr_target_${i}.png`);
                    await elementHandle.screenshot({ path: imgPath });
                    
                    // Call Python OCR script
                    try {
                        const ocrScript = path.join(__dirname, 'ocr.py');
                        // Use the venv python
                        const pythonPath = path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe');
                        
                        const { stdout, stderr } = await execAsync(`${pythonPath} "${ocrScript}" "${imgPath}"`);
                        const jsonStr = stdout.substring(stdout.indexOf('{')).trim();
                        const parsed = JSON.parse(jsonStr);
                        
                        if (parsed.success) {
                            const combinedText = parsed.data.map(d => d.text).join(' ');
                            if (combinedText.trim()) {
                                ocrResults.push({
                                    type: elInfo.type,
                                    text: combinedText,
                                    raw: parsed.data
                                });
                            }
                        }
                    } catch (e) {
                        console.error(`Failed to OCR element ${i}:`, e);
                    }
                    
                    // Clean up temp image
                    await fs.unlink(imgPath).catch(() => {});
                }
            }
        }

    } catch (e) {
        console.error("Extraction failed:", e);
        throw e;
    } finally {
        await browser.close();
    }

    return {
        url,
        textContent,
        ocrResults,
        combinedText: [
            textContent,
            ocrResults.length > 0 ? '\n--- OCR Content ---\n' : '',
            ocrResults.map(r => `[Visual ${r.type} content]: ${r.text}`).join('\n')
        ].join('').trim()
    };
}
