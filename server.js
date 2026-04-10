import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { verifyPayment } from './middleware/verifyPayment.js';
import { routeQuery } from './middleware/routeQuery.js';
import { getTierPrices, pricingResponse } from './contracts/pricing.js';
import { searchAgent } from './agents/search.js';
import { financialAgent } from './agents/financial.js';
import { newsAgent } from './agents/news.js';
import { extractAgent } from './agents/extract.js';
import { imageOcrAgent } from './agents/image_ocr.js';
import { synthesize } from './agents/synthesize.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } = require('@stellar/stellar-sdk');

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

const upload = multer({
  storage: multer.diskStorage({
    destination: join(__dirname, 'temp_uploads'),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const TIER_AGENTS = {
  search:    [{ agent: 'search',    fn: searchAgent }],
  news:      [{ agent: 'search',    fn: searchAgent },
              { agent: 'news',      fn: newsAgent }],
  financial: [{ agent: 'search',    fn: searchAgent },
              { agent: 'news',      fn: newsAgent },
              { agent: 'financial', fn: financialAgent }],
  extract:   [{ agent: 'extract',   fn: extractAgent }],
};

// Returns gateway address so the frontend can display it
app.get('/config', (_req, res) => {
  res.json({ gatewayAddress: process.env.GATEWAY_ADDRESS });
});

app.get('/pricing', async (_req, res) => {
  const prices = await getTierPrices();
  res.json(pricingResponse(prices));
});

// Builds an unsigned payment transaction and returns the XDR for the wallet to sign
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

// Submits a signed transaction to Horizon
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

  const tierPrices = await getTierPrices();
  const { type, refinedQuery } = await routeQuery(query, payment.amount, tierPrices);

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

app.post('/image-query', upload.single('image'), async (req, res) => {
  const { pubkey, memoId, query } = req.body;
  const file = req.file;

  if (!pubkey || !memoId || !file) {
    if (file) await fs.unlink(file.path).catch(() => {});
    return res.status(400).json({ error: 'pubkey, memoId, and image are required' });
  }

  const payment = await verifyPayment(pubkey, memoId);
  if (!payment.valid) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(402).json({
      error: payment.reason,
      gatewayAddress: process.env.GATEWAY_ADDRESS,
      pricing: { image_ocr: '0.2 XLM' },
    });
  }

  const tierPrices = await getTierPrices();
  if (payment.amount < tierPrices.image_ocr) {
    await fs.unlink(file.path).catch(() => {});
    return res.status(402).json({ error: `Image OCR requires at least ${tierPrices.image_ocr} XLM` });
  }

  try {
    const ocrResult = await imageOcrAgent(file.path);
    const synthesized = await synthesize(query || 'Extract and describe all text found in this image.', [{ agent: 'image_ocr', ...ocrResult }]);
    res.json({
      answer: synthesized,
      sources: [],
      agentsUsed: ['image_ocr'],
      xlmCharged: payment.amount,
    });
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Paygent running on port ${PORT}`);
  await getTierPrices();
});
