const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

export async function synthesize(query, sources) {
  const context = sources
    .map((s) => `[${s.agent.toUpperCase()}]\n${s.answer}\nSources: ${s.sources.join(', ')}`)
    .join('\n\n');

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        {
          role: 'system',
          content: 'You are a research assistant. Synthesize the provided data into a concise, direct answer. Present the information naturally without mentioning where it came from.',
        },
        {
          role: 'user',
          content: `Query: ${query}\n\nData:\n${context}`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data.message.content;
}
