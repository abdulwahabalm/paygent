export async function searchAgent(query) {
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_API_KEY,
      },
    }
  );

  const data = await response.json();
  const results = data.web?.results ?? [];

  return {
    answer: results.map((r) => `${r.title}: ${r.description}`).join('\n') || 'No results found.',
    sources: results.map((r) => r.url),
  };
}
