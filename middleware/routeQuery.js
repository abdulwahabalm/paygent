const FINANCIAL_KEYWORDS = /\b(price|market cap|volume|trading|coin|token|crypto|btc|eth|xlm|sol|ada|xrp|bitcoin|ethereum|stellar|solana|cardano|ripple|stock|nasdaq|s&p|dow|forex|usd|eur)\b/i;
const NEWS_KEYWORDS = /\b(news|latest|today|breaking|recent|happening|update|announced|report|yesterday|this week)\b/i;
const URL_PATTERN = /https?:\/\/[^\s]+/;

export async function routeQuery(query, paidAmount, tierPrices) {
  const affordable = Object.entries(tierPrices)
    .filter(([, cost]) => paidAmount >= cost)
    .map(([type]) => type);

  // URL in query → extract agent (takes priority)
  if (affordable.includes('extract') && URL_PATTERN.test(query)) {
    return { type: 'extract', refinedQuery: query };
  }

  let type = 'search';
  if (affordable.includes('financial') && FINANCIAL_KEYWORDS.test(query)) {
    type = 'financial';
  } else if (affordable.includes('news') && NEWS_KEYWORDS.test(query)) {
    type = 'news';
  }

  return { type, refinedQuery: query };
}
