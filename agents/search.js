export async function searchAgent(query) {
  const [ddg, wiki] = await Promise.allSettled([
    searchDDG(query),
    searchWikipedia(query),
  ]);

  const results = [
    ...(ddg.status === 'fulfilled' ? ddg.value : []),
    ...(wiki.status === 'fulfilled' ? wiki.value : []),
  ];

  if (!results.length) return { answer: 'No results found.', sources: [] };

  return {
    answer: results.map((r) => `• ${r.title}: ${r.content}`).join('\n'),
    sources: results.map((r) => r.url).filter(Boolean),
  };
}

async function searchDDG(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  const results = [];
  if (data.AbstractText) {
    results.push({ title: data.Heading || query, content: data.AbstractText, url: data.AbstractURL });
  }
  for (const topic of (data.RelatedTopics || []).slice(0, 3)) {
    if (topic.Text && topic.FirstURL) {
      results.push({ title: topic.Text.split(' - ')[0], content: topic.Text, url: topic.FirstURL });
    }
  }
  return results;
}

async function searchWikipedia(query) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&srlimit=3`;
  const res = await fetch(searchUrl, { headers: { 'User-Agent': 'Paygent/1.0' } });
  if (!res.ok) return [];
  const data = await res.json();
  const pages = (data.query?.search || []).slice(0, 3);

  const summaries = await Promise.all(pages.map(async (p) => {
    const sumRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(p.title)}`,
      { headers: { 'User-Agent': 'Paygent/1.0' } }
    );
    if (!sumRes.ok) return null;
    const sum = await sumRes.json();
    return sum.extract
      ? { title: sum.title, content: sum.extract.slice(0, 500), url: sum.content_urls?.desktop?.page }
      : null;
  }));

  return summaries.filter(Boolean);
}
