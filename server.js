import express from 'express';
import dotenv from 'dotenv';
import { verifyPayment } from './middleware/verifyPayment.js';
import { routeQuery } from './middleware/routeQuery.js';
import { searchAgent } from './agents/search.js';
import { financialAgent } from './agents/financial.js';
import { newsAgent } from './agents/news.js';
import { synthesize } from './agents/synthesize.js';

dotenv.config();

const app = express();
app.use(express.json());

// Which agents run at each tier
const TIER_AGENTS = {
  search:    [{ agent: 'search',    fn: searchAgent }],
  news:      [{ agent: 'search',    fn: searchAgent },
              { agent: 'news',      fn: newsAgent }],
  financial: [{ agent: 'search',    fn: searchAgent },
              { agent: 'news',      fn: newsAgent },
              { agent: 'financial', fn: financialAgent }],
};

app.get('/pricing', (_req, res) => {
  res.json({
    search:    { cost: '0.1 XLM', sources: 1, description: 'Web search' },
    news:      { cost: '0.2 XLM', sources: 2, description: 'Web search + news' },
    financial: { cost: '0.3 XLM', sources: 3, description: 'Web + news + financial data' },
  });
});

app.post('/query', async (req, res) => {
  const { query, pubkey, memoId } = req.body;

  if (!query || !pubkey || !memoId) {
    return res.status(400).json({ error: 'query, pubkey, and memoId are required' });
  }

  // 1. Verify payment on Stellar Horizon + Soroban contract
  const payment = await verifyPayment(pubkey, memoId);
  if (!payment.valid) {
    return res.status(402).json({
      error: payment.reason,
      gatewayAddress: process.env.GATEWAY_ADDRESS,
      pricing: { search: '0.1 XLM', news: '0.2 XLM', financial: '0.3 XLM' },
    });
  }

  // 2. Classify query and resolve tier
  const { type, refinedQuery } = await routeQuery(query, payment.amount);

  // 3. Run all agents for this tier in parallel
  const agentList = TIER_AGENTS[type];
  const results = await Promise.all(
    agentList.map(({ agent, fn }) =>
      fn(refinedQuery).then((r) => ({ agent, ...r }))
    )
  );

  // 4. Synthesize multi-source results into a coherent answer
  const answer = await synthesize(query, results);
  const sources = [...new Set(results.flatMap((r) => r.sources))];

  res.json({
    answer,
    sources,
    agentsUsed: agentList.map((a) => a.agent),
    xlmCharged: payment.amount,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Paygent running on port ${PORT}`));
