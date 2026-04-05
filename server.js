import express from 'express';
import dotenv from 'dotenv';
import { verifyPayment } from './middleware/verifyPayment.js';
import { routeQuery } from './middleware/routeQuery.js';
import { searchAgent } from './agents/search.js';
import { financialAgent } from './agents/financial.js';
import { newsAgent } from './agents/news.js';

dotenv.config();

const app = express();
app.use(express.json());

const AGENTS = {
  search: searchAgent,
  financial: financialAgent,
  news: newsAgent,
};

app.get('/pricing', (_req, res) => {
  res.json({
    search:    { cost: '0.1 XLM', description: 'Web search across the internet' },
    news:      { cost: '0.2 XLM', description: 'Recent news and current events' },
    financial: { cost: '0.3 XLM', description: 'Crypto and financial market data' },
  });
});

app.post('/query', async (req, res) => {
  const { query, pubkey, memoId } = req.body;

  if (!query || !pubkey || !memoId) {
    return res.status(400).json({ error: 'query, pubkey, and memoId are required' });
  }

  // 1. Verify payment on Stellar Horizon
  const payment = await verifyPayment(pubkey, memoId);
  if (!payment.valid) {
    return res.status(402).json({
      error: payment.reason,
      gatewayAddress: process.env.GATEWAY_ADDRESS,
      pricing: { search: '0.1 XLM', news: '0.2 XLM', financial: '0.3 XLM' },
    });
  }

  // 2. Route query to the appropriate agent based on content + payment amount
  const { type, refinedQuery } = await routeQuery(query, payment.amount);

  // 3. Execute agent
  const agent = AGENTS[type];
  const result = await agent(refinedQuery);

  res.json({
    answer: result.answer,
    sources: result.sources,
    agent: type,
    xlmCharged: payment.amount,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Paygent running on port ${PORT}`));
