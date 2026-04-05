export async function newsAgent(query) {
  const response = await fetch(
    `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`
  );

  const data = await response.json();

  if (data.status !== 'ok' || !data.articles?.length) {
    return { answer: 'No recent news found.', sources: [] };
  }

  const answer = data.articles
    .slice(0, 3)
    .map((a) => `• ${a.title} (${a.source.name}, ${a.publishedAt.slice(0, 10)})`)
    .join('\n');

  return {
    answer,
    sources: data.articles.slice(0, 3).map((a) => a.url),
  };
}
