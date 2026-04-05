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

  if (results.length) {
    return {
      answer: results.map((r) => `• ${r.text}`).join('\n'),
      sources: results.map((r) => r.url).filter(Boolean),
    };
  }

  // Fallback: Wikipedia search
  const wikiRes = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`
  );
  const wikiData = await wikiRes.json();
  const pages = wikiData.query?.search ?? [];

  if (!pages.length) {
    return { answer: 'No results found.', sources: [] };
  }

  return {
    answer: pages.map((p) => `• ${p.title}: ${p.snippet.replace(/<[^>]+>/g, '')}`).join('\n'),
    sources: pages.map((p) => `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`),
  };
}
