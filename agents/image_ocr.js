import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PYTHON = '/Users/aw/anaconda3/envs/paygent-ocr/bin/python';
const OCR_SCRIPT = path.join(__dirname, '..', 'extractor', 'ocr.py');

export async function imageOcrAgent(imagePath) {
  const { stdout } = await execAsync(`"${PYTHON}" "${OCR_SCRIPT}" "${imagePath}"`);
  const jsonStr = stdout.substring(stdout.indexOf('{')).trim();
  const parsed = JSON.parse(jsonStr);

  if (!parsed.success) {
    return { answer: 'OCR failed: ' + (parsed.error || 'Unknown error'), sources: [] };
  }

  const text = (parsed.data || []).map((d) => d.text).join('\n');
  return {
    answer: text.trim() || 'No text found in the image.',
    sources: [],
  };
}
