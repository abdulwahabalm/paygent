const COIN_MAP = {
  bitcoin: 'bitcoin', btc: 'bitcoin',
  ethereum: 'ethereum', eth: 'ethereum',
  stellar: 'stellar', xlm: 'stellar',
  solana: 'solana', sol: 'solana',
  cardano: 'cardano', ada: 'cardano',
  ripple: 'ripple', xrp: 'ripple',
};

export async function financialAgent(query) {
  const match = query.match(/\b(bitcoin|btc|ethereum|eth|stellar|xlm|solana|sol|cardano|ada|ripple|xrp)\b/i);
  const coinId = match ? (COIN_MAP[match[1].toLowerCase()] ?? 'bitcoin') : 'bitcoin';

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`
  );

  const data = await response.json();
  const info = data[coinId];

  if (!info) {
    return { answer: `Could not find financial data for "${coinId}".`, sources: [] };
  }

  const change = info.usd_24h_change?.toFixed(2);
  const cap = (info.usd_market_cap / 1e9).toFixed(2);
  const answer = `${coinId.toUpperCase()}: $${info.usd.toLocaleString()} USD | 24h change: ${change}% | Market cap: $${cap}B`;

  return {
    answer,
    sources: [`https://www.coingecko.com/en/coins/${coinId}`],
  };
}
