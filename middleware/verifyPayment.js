import { Horizon } from '@stellar/stellar-sdk';

const TIER_COSTS = { search: 0.1, news: 0.2, financial: 0.3 };

// In-memory replay protection — swap for persistent store in production
const usedMemos = new Set();

export async function verifyPayment(pubkey, memoId) {
  if (process.env.SKIP_PAYMENT === 'true') {
    return { valid: true, amount: 0.3, tier: 'financial' };
  }

  if (usedMemos.has(memoId)) {
    return { valid: false, reason: 'Payment memo already used' };
  }

  const server = new Horizon.Server(
    process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org'
  );

  try {
    const payments = await server
      .payments()
      .forAccount(process.env.GATEWAY_ADDRESS)
      .order('desc')
      .limit(50)
      .call();

    for (const payment of payments.records) {
      if (
        payment.type === 'payment' &&
        payment.asset_type === 'native' &&
        payment.from === pubkey
      ) {
        const tx = await payment.transaction();
        if (tx.memo === memoId) {
          const amount = parseFloat(payment.amount);
          const tier = resolveTier(amount);
          if (!tier) {
            return { valid: false, reason: `Minimum payment is ${TIER_COSTS.search} XLM` };
          }
          usedMemos.add(memoId);
          return { valid: true, amount, tier };
        }
      }
    }

    return { valid: false, reason: 'No matching payment found for this memo' };
  } catch (err) {
    console.error('Horizon error:', err.message);
    return { valid: false, reason: 'Payment verification failed' };
  }
}

function resolveTier(amount) {
  if (amount >= TIER_COSTS.financial) return 'financial';
  if (amount >= TIER_COSTS.news) return 'news';
  if (amount >= TIER_COSTS.search) return 'search';
  return null;
}
