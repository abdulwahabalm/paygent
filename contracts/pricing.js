import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  rpc: SorobanRpc, TransactionBuilder, Networks,
  Contract, nativeToScVal, scValToNative, Account,
} = require('@stellar/stellar-sdk');

const TIERS = ['search', 'news', 'financial', 'extract', 'image_ocr'];

// Fallback used when the contract is unavailable
const FALLBACK = { search: 0.1, news: 0.2, financial: 0.3, extract: 0.1, image_ocr: 0.2 };

const DESCRIPTIONS = {
  search:    'Web search',
  news:      'Web search + news',
  financial: 'Web + news + financial data',
  extract:   'Full page extract + OCR (include a URL in your query)',
  image_ocr: 'Upload an image and extract text via OCR',
};

let _cache = null;
let _cacheAt = 0;
const TTL = 5 * 60 * 1000; // 5 minutes

export async function getTierPrices() {
  if (_cache && Date.now() - _cacheAt < TTL) return _cache;
  if (!process.env.CONTRACT_ID) return FALLBACK;

  try {
    const rpc = new SorobanRpc.Server(
      process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
    );
    const contract = new Contract(process.env.CONTRACT_ID);
    // Dummy source account — simulation doesn't submit, sequence doesn't matter
    const source = new Account(
      process.env.GATEWAY_ADDRESS,
      '999999999'
    );

    const prices = {};
    await Promise.all(TIERS.map(async (tier) => {
      try {
        const tx = new TransactionBuilder(source, {
          fee: '100',
          networkPassphrase: Networks.TESTNET,
        })
          .addOperation(contract.call('get_price', nativeToScVal(tier, { type: 'symbol' })))
          .setTimeout(30)
          .build();

        const sim = await rpc.simulateTransaction(tx);
        if (SorobanRpc.Api.isSimulationSuccess(sim) && sim.result) {
          prices[tier] = Number(scValToNative(sim.result.retval)) / 10_000_000;
        } else {
          prices[tier] = FALLBACK[tier];
        }
      } catch {
        prices[tier] = FALLBACK[tier];
      }
    }));

    _cache = prices;
    _cacheAt = Date.now();
    console.log('Fetched tier prices from contract:', prices);
    return prices;
  } catch (err) {
    console.error('Failed to fetch prices from contract, using fallback:', err.message);
    return FALLBACK;
  }
}

export function pricingResponse(prices) {
  return Object.fromEntries(
    TIERS.map((tier) => [tier, {
      cost: `${prices[tier]} XLM`,
      description: DESCRIPTIONS[tier],
    }])
  );
}
