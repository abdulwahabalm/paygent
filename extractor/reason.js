// Reasoning module — sends extracted text to Gemma via Ollama for inference
// The LLM is ONLY used for reasoning, never for extraction.

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma4:e4b';

/**
 * Takes extracted webpage text + a user question, and asks Gemma to reason over it.
 * @param {string} query - The user's question
 * @param {string} extractedText - Clean text from the extraction pipeline
 * @param {object} options - Optional config
 * @returns {string} - The LLM's answer
 */
export async function reason(query, extractedText, options = {}) {
  const { temperature = 0.3, maxTokens = 1024 } = options;

  // Truncate context if too long (Gemma 4B has ~8k context)
  const MAX_CONTEXT_CHARS = 12000;
  const context = extractedText.length > MAX_CONTEXT_CHARS
    ? extractedText.substring(0, MAX_CONTEXT_CHARS) + '\n\n[... content truncated for length]'
    : extractedText;

  const systemPrompt = `You are a precise research assistant. You will be given text extracted from a webpage. Your job is to answer the user's question based ONLY on the provided text. 

Rules:
- Answer directly and concisely
- Only use information present in the provided text
- If the text doesn't contain enough information to answer, say so clearly
- Do not make up or infer information not in the text
- Present information naturally without mentioning "the text says" or "according to the extract"`;

  const userPrompt = `Question: ${query}

--- Extracted Webpage Content ---
${context}
--- End of Content ---

Answer the question based on the content above.`;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
        },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama returned ${response.status}: ${errText}`);
    }

    const data = await response.json();
    return {
      answer: data.message.content,
      model: OLLAMA_MODEL,
      tokensUsed: data.eval_count || null,
      durationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : null,
    };
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      throw new Error('Ollama is not running. Start it with: ollama serve');
    }
    throw err;
  }
}
