export async function newsAgent(query) {
  const response = await fetch(
    `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5`
  );

  const data = await response.json();

  if (!data.hits?.length) {
    return { answer: 'No recent news found.', sources: [] };
  }

  const answer = data.hits
    .slice(0, 3)
    .map((h) => `• ${h.title} (${h.points ?? 0} pts, ${h.num_comments ?? 0} comments)`)
    .join('\n');

  return {
    answer,
    sources: data.hits.slice(0, 3).map((h) => h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`),
  };
}
