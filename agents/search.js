export async function searchAgent(query) {
  const response = await fetch(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  );

  const data = await response.json();

  const results = [];

  if (data.AbstractText) {
    results.push({ title: data.Heading, text: data.AbstractText, url: data.AbstractURL });
  }

  for (const topic of (data.RelatedTopics ?? []).slice(0, 4)) {
    if (topic.Text && topic.FirstURL) {
      results.push({ title: topic.Text.split(' - ')[0], text: topic.Text, url: topic.FirstURL });
    }
  }

  if (!results.length) {
    return { answer: 'No results found.', sources: [] };
  }

  return {
    answer: results.map((r) => `• ${r.text}`).join('\n'),
    sources: results.map((r) => r.url).filter(Boolean),
  };
}
