const TIER_COSTS = { financial: 0.3, news: 0.2, search: 0.1 };

const FINANCIAL_KEYWORDS = /\b(price|market cap|volume|trading|coin|token|crypto|btc|eth|xlm|sol|ada|xrp|bitcoin|ethereum|stellar|solana|cardano|ripple|stock|nasdaq|s&p|dow|forex|usd|eur)\b/i;
const NEWS_KEYWORDS = /\b(news|latest|today|breaking|recent|happening|update|announced|report|yesterday|this week)\b/i;

export async function routeQuery(query, paidAmount) {
  const affordable = Object.entries(TIER_COSTS)
    .filter(([, cost]) => paidAmount >= cost)
    .map(([type]) => type);

  let type = 'search';
  if (affordable.includes('financial') && FINANCIAL_KEYWORDS.test(query)) {
    type = 'financial';
  } else if (affordable.includes('news') && NEWS_KEYWORDS.test(query)) {
    type = 'news';
  }

  return { type, refinedQuery: query };
}
