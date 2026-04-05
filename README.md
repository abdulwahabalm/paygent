# Paygent

An autonomous research agent where every query has a price. Pay XLM, get answers.

Paygent is a pay-per-query API gateway built on Stellar. Users send XLM to a gateway address, and the agent decides which data sources to query, aggregates the results, and returns a synthesized answer — all enforced by a Soroban smart contract on-chain.

---

## How it works

```
User pays XLM (with memo ID)
        ↓
Horizon confirms the payment
        ↓
Soroban contract enforces tier pricing + records memo (replay protection)
        ↓
Agent classifies query → runs sources in parallel
        ↓
LLM synthesizes multi-source answer
        ↓
Answer returned
```

The pricing tier determines how many sources the agent uses:

| Tier | Cost | Sources |
|------|------|---------|
| Search | 0.1 XLM | Web search |
| News | 0.2 XLM | Web search + recent news |
| Research | 0.3 XLM | Web + news + live financial data |

The Soroban contract enforces these tiers on-chain not just payment existence, but that the correct amount was paid for the requested tier. Used memos are recorded permanently on-chain to prevent replay attacks.

---

## Architecture

```
/gateway
  /agents
    search.js       — DuckDuckGo + Wikipedia fallback
    financial.js    — CoinGecko (live crypto prices)
    news.js         — HackerNews
    synthesize.js   — Ollama LLM synthesis
  /contracts
    /paywall        — Soroban contract (Rust)
      src/lib.rs
      Cargo.toml
  /middleware
    verifyPayment.js — Horizon + Soroban verification
    routeQuery.js    — keyword-based query classifier
  server.js
```

---

## Setup

### Prerequisites
- Node.js 18+
- Rust + `stellar-cli` (for contract deployment)
- Ollama running locally with a model pulled (`ollama pull llama3.2`)

### Install
```bash
npm install
cp .env.example .env
```

Fill in `.env`:
```
GATEWAY_ADDRESS=your_stellar_public_key
GATEWAY_SECRET_KEY=your_stellar_secret_key
HORIZON_URL=https://horizon-testnet.stellar.org
CONTRACT_ID=your_deployed_soroban_contract_id
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### Deploy the Soroban contract
```bash
cd contracts/paywall
cargo build --release --target wasm32-unknown-unknown
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/paywall.wasm \
  --source YOUR_SECRET_KEY \
  --network testnet
```

Paste the returned contract ID into `CONTRACT_ID` in `.env`.

### Run
```bash
npm start
```

---

## Usage

### 1. Check pricing
```bash
curl http://localhost:3000/pricing
```

### 2. Send a payment

Send XLM to your gateway address on Stellar testnet with a text memo (e.g. `query-1`). Use [Stellar Lab](https://laboratory.stellar.org) or any Stellar wallet.

Get free testnet XLM: `https://friendbot.stellar.org/?addr=YOUR_ADDRESS`

### 3. Query the agent
```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "what is the current bitcoin price and market sentiment?",
    "pubkey": "YOUR_CALLER_PUBLIC_KEY",
    "memoId": "query-1"
  }'
```

**Response:**
```json
{
  "answer": "Bitcoin is currently trading at $67,394...",
  "sources": ["https://coingecko.com/...", "..."],
  "agentsUsed": ["search", "news", "financial"],
  "xlmCharged": 0.3
}
```

---

## Soroban Contract

The `paywall` contract (`contracts/paywall/src/lib.rs`) exposes four functions:

| Function | Description |
|----------|-------------|
| `record_payment(memo, amount_stroops)` | Validates tier, stores memo, returns tier name |
| `get_tier(memo)` | Returns the tier recorded for a memo |
| `is_memo_used(memo)` | Returns true if memo has been used |
| `tier_for_amount(amount_stroops)` | Returns tier name for a given amount |

The gateway calls `record_payment` after every verified Horizon payment. This moves pricing logic on-chain — the contract, not the server, decides what tier a payment unlocks.

---

## Local development

Set `SKIP_PAYMENT=true` in `.env` to bypass payment verification during development.

```bash
npm run devStart   # nodemon with hot reload
npm run dev        # node --watch
```

---

Built for the [Stellar Agent Hackathon](https://stellar.org).
