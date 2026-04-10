# Paygent

A pay-per-query AI research gateway built on Stellar. Pay XLM, get answers.

Users pay XLM to a gateway address. The Soroban smart contract enforces tier pricing and records memos on-chain to prevent replay attacks. The server routes the query to the appropriate agents, aggregates results, and returns a synthesized answer from a local LLM.

---

## How it works

```
User pays XLM (Freighter wallet, with memo ID)
        ↓
Horizon confirms the payment
        ↓
Soroban contract enforces pricing + records memo (replay protection)
        ↓
Agent classifies query → runs data sources in parallel
        ↓
Local LLM (Ollama) synthesizes multi-source answer
        ↓
Answer returned to user
```

---

## Tiers

Prices are stored on-chain in the Soroban contract and can be updated by the admin via `set_price`. The server reads them at startup and caches for 5 minutes.

| Tier | Default Cost | What it does |
|------|-------------|--------------|
| Search | 0.1 XLM | DuckDuckGo Instant Answers + Wikipedia |
| News | 0.2 XLM | Search + HackerNews |
| Research | 0.3 XLM | Search + News + live CoinGecko financial data |
| Extract | 0.1 XLM | Full page scrape + OCR (include a URL in query) |
| Image OCR | 0.2 XLM | Upload an image, extract text via PaddleOCR |

Query routing is automatic — the server picks the best tier the payment can afford based on keywords and whether a URL or image is present.

---

## Architecture

```
/paygent
  /agents
    search.js       — DuckDuckGo Instant Answers + Wikipedia (no API key)
    financial.js    — CoinGecko live crypto/financial data
    news.js         — HackerNews
    extract.js      — Web scrape + OCR agent (URL-based)
    image_ocr.js    — PaddleOCR agent (uploaded images)
    synthesize.js   — Ollama LLM synthesis
  /contracts
    pricing.js      — Fetches tier prices from Soroban contract (cached)
    /paywall        — Soroban smart contract (Rust)
      src/lib.rs
      Cargo.toml
  /extractor
    web_scraper.js  — Playwright scraper + PaddleOCR element extraction
    ocr.py          — PaddleOCR 3.x wrapper (conda env: paygent-ocr)
  /middleware
    verifyPayment.js — Horizon payment check + Soroban memo recording
    routeQuery.js    — Keyword-based query classifier
  /public
    index.html             — Frontend UI
    stellar-wallets-kit.js — Bundled @creit.tech/stellar-wallets-kit (wallet modal, signing, network)
    swk-entry.js           — SWK esbuild entry point (bundled to stellar-wallets-kit.js)
  server.js
```

---

## Setup

### Prerequisites

- Node.js 18+
- Rust + `stellar-cli` (for contract build/deploy)
- [Ollama](https://ollama.com) running locally with a model pulled
- conda (for the PaddleOCR Python environment)
- A Stellar wallet supported by [Stellar Wallets Kit](https://github.com/creit-tech/stellar-wallets-kit) (Freighter, xBull, Lobstr, etc.)

### 1. Install Node dependencies

```bash
npm install
cp .env.example .env
```

### 2. Set up the PaddleOCR environment

```bash
conda create -n paygent-ocr python=3.11 -y
conda run -n paygent-ocr pip install paddleocr paddlepaddle Pillow
```

### 3. Pull an Ollama model

```bash
ollama pull gemma3  # or any model you prefer
```

### 4. Fill in `.env`

```env
GATEWAY_ADDRESS=your_stellar_public_key
GATEWAY_SECRET_KEY=your_stellar_secret_key
HORIZON_URL=https://horizon-testnet.stellar.org
CONTRACT_ID=your_deployed_soroban_contract_id
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3
SKIP_PAYMENT=false
PORT=3000
```

### 5. Deploy the Soroban contract

Run from the project root:

```bash
# Build
cd contracts/paywall
cargo build --target wasm32-unknown-unknown --release
cd ../..

# Deploy
stellar contract deploy \
  --wasm contracts/paywall/target/wasm32-unknown-unknown/release/paywall.wasm \
  --source-account YOUR_SECRET_KEY \
  --network testnet

# Initialise admin (paste the contract ID returned above)
stellar contract invoke \
  --id YOUR_CONTRACT_ID \
  --source-account YOUR_SECRET_KEY \
  --network testnet \
  -- init --admin YOUR_PUBLIC_KEY
```

Paste the contract ID into `CONTRACT_ID` in `.env`.

### 6. Bundle Stellar Wallets Kit

The frontend uses [@creit.tech/stellar-wallets-kit](https://github.com/creit-tech/stellar-wallets-kit) bundled as a browser-ready IIFE. If you need to rebuild it:

```bash
npm run build
```

This outputs `public/stellar-wallets-kit.js` which the frontend loads directly.

### 7. Run

```bash
npm run devStart   # nodemon (hot reload)
npm start          # production
```

On startup you should see:
```
Paygent running on port 3000
Fetched tier prices from contract: { search: 0.1, news: 0.2, ... }
```

---

## Usage

### Check pricing (live from contract)
```bash
curl http://localhost:3000/pricing
```

### Text query

1. Send XLM to your gateway address on Stellar testnet with a text memo (e.g. `p-1234`).
2. POST to `/query`:

```bash
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "what is the current bitcoin price?",
    "pubkey": "YOUR_PUBLIC_KEY",
    "memoId": "p-1234"
  }'
```

**Response:**
```json
{
  "answer": "Bitcoin is currently trading at...",
  "sources": ["https://..."],
  "agentsUsed": ["search", "news", "financial"],
  "xlmCharged": 0.3
}
```

### Image OCR

After paying 0.2 XLM:

```bash
curl -X POST http://localhost:3000/image-query \
  -F "image=@/path/to/image.png" \
  -F "pubkey=YOUR_PUBLIC_KEY" \
  -F "memoId=p-1234" \
  -F "query=what does this image say?"
```

The frontend handles both flows automatically — select the Image OCR tier to reveal the file upload.

---

## Soroban Contract

The `paywall` contract (`contracts/paywall/src/lib.rs`) exposes:

| Function | Description |
|----------|-------------|
| `init(admin)` | One-time setup, sets the admin address |
| `get_price(tier)` | Returns minimum price in stroops for a tier |
| `set_price(tier, amount_stroops)` | Admin-only: update a tier price on-chain |
| `record_payment(memo, amount_stroops)` | Validates tier, records memo, returns tier name |
| `get_tier(memo)` | Returns the tier recorded for a memo |
| `is_memo_used(memo)` | Returns true if memo has already been used |

The gateway calls `record_payment` after every verified Horizon payment. Pricing lives on-chain — changing a price requires no server redeploy, just a `set_price` invocation:

```bash
stellar contract invoke \
  --id YOUR_CONTRACT_ID \
  --source-account YOUR_SECRET_KEY \
  --network testnet \
  -- set_price --tier search --amount_stroops 500000
```

---

## Local development

Set `SKIP_PAYMENT=true` in `.env` to bypass payment verification.

Get free testnet XLM from [Stellar Friendbot](https://friendbot.stellar.org/?addr=YOUR_ADDRESS).

---

Built for the [Stellar Agent Hackathon](https://stellar.org).
