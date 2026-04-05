import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { verifyPayment } from './middleware/verifyPayment.js';
import { routeQuery } from './middleware/routeQuery.js';
import { searchAgent } from './agents/search.js';
import { financialAgent } from './agents/financial.js';
import { newsAgent } from './agents/news.js';
import { synthesize } from './agents/synthesize.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } = require('@stellar/stellar-sdk');

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const TIER_AGENTS = {
  search:    [{ agent: 'search',    fn: searchAgent }],
  news:      [{ agent: 'search',    fn: searchAgent },
              { agent: 'news',      fn: newsAgent }],
  financial: [{ agent: 'search',    fn: searchAgent },
              { agent: 'news',      fn: newsAgent },
              { agent: 'financial', fn: financialAgent }],
};

// Returns gateway address so the frontend can display it
app.get('/config', (_req, res) => {
  res.json({ gatewayAddress: process.env.GATEWAY_ADDRESS });
});

app.get('/pricing', (_req, res) => {
  res.json({
    search:    { cost: '0.1 XLM', sources: 1, description: 'Web search' },
    news:      { cost: '0.2 XLM', sources: 2, description: 'Web search + news' },
    financial: { cost: '0.3 XLM', sources: 3, description: 'Web + news + financial data' },
  });
});

// Builds an unsigned payment transaction and returns the XDR for Freighter to sign
app.post('/create-payment', async (req, res) => {
  const { pubkey, amount } = req.body;
  if (!pubkey || !amount) return res.status(400).json({ error: 'pubkey and amount required' });

  const horizon = new Horizon.Server(process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org');
  try {
    const account = await horizon.loadAccount(pubkey);
    const memo = `p-${Date.now()}`;

    const tx = new TransactionBuilder(account, {
      fee: '1000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({
        destination: process.env.GATEWAY_ADDRESS,
        asset: Asset.native(),
        amount: amount.toString(),
      }))
      .addMemo(Memo.text(memo))
      .setTimeout(30)
      .build();

    res.json({ xdr: tx.toEnvelope().toXDR('base64'), memo });
  } catch (err) {
    console.error('create-payment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Submits a Freighter-signed transaction to Horizon
app.post('/submit-payment', async (req, res) => {
  const { xdr } = req.body;
  if (!xdr) return res.status(400).json({ error: 'xdr required' });

  const horizon = new Horizon.Server(process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org');
  try {
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    const result = await horizon.submitTransaction(tx);
    res.json({ success: true, hash: result.hash });
  } catch (err) {
    console.error('submit-payment error:', err.message);
    res.status(500).json({ error: err.response?.data?.extras?.result_codes || err.message });
  }
});

app.post('/query', async (req, res) => {
  const { query, pubkey, memoId } = req.body;

  if (!query || !pubkey || !memoId) {
    return res.status(400).json({ error: 'query, pubkey, and memoId are required' });
  }

  const payment = await verifyPayment(pubkey, memoId);
  if (!payment.valid) {
    return res.status(402).json({
      error: payment.reason,
      gatewayAddress: process.env.GATEWAY_ADDRESS,
      pricing: { search: '0.1 XLM', news: '0.2 XLM', financial: '0.3 XLM' },
    });
  }

  const { type, refinedQuery } = await routeQuery(query, payment.amount);

  const agentList = TIER_AGENTS[type];
  const results = await Promise.all(
    agentList.map(({ agent, fn }) =>
      fn(refinedQuery).then((r) => ({ agent, ...r }))
    )
  );

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
