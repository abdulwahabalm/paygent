import pkg from '@stellar/stellar-sdk';
const { Horizon, SorobanRpc, TransactionBuilder, Networks, Contract, nativeToScVal, scValToNative, Keypair } = pkg;

const TIER_COSTS = { search: 0.1, news: 0.2, financial: 0.3 };

// Fallback in-memory replay protection (used when CONTRACT_ID is not set)
const usedMemos = new Set();

export async function verifyPayment(pubkey, memoId) {
  if (process.env.SKIP_PAYMENT === 'true') {
    return { valid: true, amount: 0.3, tier: 'financial' };
  }

  // 1. Verify the payment exists on Horizon
  const horizonResult = await checkHorizon(pubkey, memoId);
  if (!horizonResult.valid) return horizonResult;

  // 2. Enforce tier pricing + replay protection
  if (process.env.CONTRACT_ID && process.env.GATEWAY_SECRET_KEY) {
    return recordOnChain(memoId, horizonResult.amount);
  }

  // Fallback: in-memory replay protection
  if (usedMemos.has(memoId)) {
    return { valid: false, reason: 'Payment memo already used' };
  }
  const tier = resolveTier(horizonResult.amount);
  if (!tier) return { valid: false, reason: `Minimum payment is ${TIER_COSTS.search} XLM` };
  usedMemos.add(memoId);
  return { valid: true, amount: horizonResult.amount, tier };
}

async function checkHorizon(pubkey, memoId) {
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
          return { valid: true, amount: parseFloat(payment.amount) };
        }
      }
    }
    return { valid: false, reason: 'No matching payment found for this memo' };
  } catch (err) {
    console.error('Horizon error:', err.message);
    return { valid: false, reason: 'Payment verification failed' };
  }
}

async function recordOnChain(memoId, amountXlm) {
  const rpc = new SorobanRpc.Server(
    process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org'
  );
  const keypair = Keypair.fromSecret(process.env.GATEWAY_SECRET_KEY);
  const contract = new Contract(process.env.CONTRACT_ID);
  const amountStroops = Math.round(amountXlm * 10_000_000);

  try {
    const horizon = new Horizon.Server(
      process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org'
    );
    const account = await horizon.loadAccount(keypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'record_payment',
          nativeToScVal(memoId, { type: 'string' }),
          nativeToScVal(amountStroops, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await rpc.prepareTransaction(tx);
    prepared.sign(keypair);
    const response = await rpc.sendTransaction(prepared);

    if (response.status === 'ERROR') {
      return { valid: false, reason: 'Contract rejected: memo already used or below minimum' };
    }

    // Poll for confirmation
    let result;
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await rpc.getTransaction(response.hash);
      if (result.status !== 'NOT_FOUND') break;
    }

    if (result?.status !== 'SUCCESS') {
      return { valid: false, reason: 'Contract transaction did not confirm' };
    }

    const tier = scValToNative(result.returnValue);
    return { valid: true, amount: amountXlm, tier };
  } catch (err) {
    console.error('Soroban error:', err.message);
    return { valid: false, reason: 'Contract call failed' };
  }
}

function resolveTier(amount) {
  if (amount >= TIER_COSTS.financial) return 'financial';
  if (amount >= TIER_COSTS.news) return 'news';
  if (amount >= TIER_COSTS.search) return 'search';
  return null;
}
