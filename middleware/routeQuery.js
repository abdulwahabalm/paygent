import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const TIER_COSTS = { financial: 0.3, news: 0.2, search: 0.1 };

export async function routeQuery(query, paidAmount) {
  // Determine which agent types the user's payment covers
  const affordable = Object.entries(TIER_COSTS)
    .filter(([, cost]) => paidAmount >= cost)
    .map(([type]) => type);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    system: `Classify queries into one of these categories:
- "financial": crypto prices, stock data, market cap, trading volume
- "news": recent events, breaking news, current affairs
- "search": general knowledge, how-to, explanations, everything else

Reply with ONLY valid JSON: {"type":"search"|"financial"|"news","refinedQuery":"<cleaned query>"}`,
    messages: [{ role: 'user', content: query }],
  });

  try {
    const { type, refinedQuery } = JSON.parse(response.content[0].text);
    // Downgrade to search if the user underpaid for the classified tier
    const resolved = affordable.includes(type) ? type : 'search';
    return { type: resolved, refinedQuery: refinedQuery || query };
  } catch {
    return { type: 'search', refinedQuery: query };
  }
}
