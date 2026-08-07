# Tutorial — x402-shipping

From `git clone` to a paid call returning a real artifact, then to mainnet.

## 1. Install

```bash
git clone https://github.com/nirholas/x402-shipping
cd x402-shipping
npm install
```

Node 18+ is required (the server uses the built-in `fetch`).

## 2. Configure (optional)

```bash
cp .env.example .env
```

Every value already has a working default, so you can skip this entirely. The two you'll eventually want to change:

```bash
PAY_TO_ADDRESS=0xYourEvmAddress            # where USDC on Base lands
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress    # where USDC on Solana lands
```

Left unset, the server uses the suite's own receive addresses and says so on startup:

```
note: using suite default payTo — set PAY_TO_ADDRESS/SOLANA_PAY_TO_ADDRESS to receive funds yourself
```

### Live carrier rates (optional)

Get a **test** key from either provider — both are free and neither requires a payment method:

```bash
SHIPPO_API_TOKEN=shippo_test_xxxxxxxxxxxx      # https://goshippo.com
# or
EASYPOST_API_KEY=EZTKxxxxxxxxxxxxxxxx          # https://easypost.com
```

`source` flips from `"fixture"` to `"shippo"` / `"easypost"`. `testMode` stays `true` as long as the key is a test key — the banner on startup tells you which mode you're in, loudly.

## 3. Run the server

```bash
npm run dev
```

```
x402-shipping listening on http://localhost:4023
  data source: fixture
  payment rails:
    evm     base-sepolia   → 0x40252CFDF8B20Ed757D61ff157719F33Ec332402
    solana  solana         → WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW
  paid routes:
    POST /rates              $0.003
    POST /label              $0.02
  free routes: GET /health, GET /.well-known/x402
```

Check it's alive — `/health` is free:

```bash
curl -s http://localhost:4023/health
```

## 4. Your first 402

Call a paid route with no payment:

```bash
curl -i -X POST http://localhost:4023/rates \
  -H 'Content-Type: application/json' \
  -d '{"from":{"street1":"215 Clayton St","city":"San Francisco","state":"CA","zip":"94117","country":"US"},"to":{"street1":"1600 Pennsylvania Ave NW","city":"Washington","state":"DC","zip":"20500","country":"US"},"parcel":{"length":10,"width":8,"height":4,"weight":32}}'
```

You get `HTTP/1.1 402 Payment Required` and a body listing **both** rails:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base-sepolia",
      "maxAmountRequired": "3000",
      "resource": "http://localhost:4023/rates",
      "description": "Rate-shop a parcel across every available carrier service.",
      "mimeType": "application/json",
      "payTo": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "maxTimeoutSeconds": 60,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    },
    {
      "scheme": "exact",
      "network": "solana",
      "maxAmountRequired": "3000",
      "resource": "http://localhost:4023/rates",
      "description": "Rate-shop a parcel across every available carrier service.",
      "mimeType": "application/json",
      "payTo": "WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW",
      "maxTimeoutSeconds": 60,
      "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "extra": {
        "name": "USD Coin",
        "decimals": 6,
        "feePayer": "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4",
        "amount": "3000"
      }
    }
  ]
}
```

Read it as: *"pay $0.003 of USDC to one of these two addresses, on whichever chain you prefer, then ask again."* `maxAmountRequired` is in atomic units — USDC has 6 decimals, so `"3000"` is `$0.003`.

## 5. Pay for it

### EVM (Base) — `x402-fetch`

The included client does the whole dance. Give it a funded key:

```bash
# A base-sepolia key with testnet USDC. Faucet: https://faucet.circle.com
export PRIVATE_KEY=0xYourTestnetPrivateKey
npm run client
```

`wrapFetchWithPayment` catches the 402, signs an EIP-3009 USDC authorization for the amount quoted, and replays the request with the `X-PAYMENT` header. You never write the retry loop.

### Solana

A Solana wallet signs a serialized SPL transfer rather than typed data, so the server exposes two helpers:

```bash
# 1. Ask for the transaction that satisfies the Solana accept
curl -s -X POST 'http://localhost:4023/api/x402-checkout?action=prepare' \
  -H 'content-type: application/json' \
  -d '{"accept": <the solana entry from the 402 body>, "buyer": "<your base58 pubkey>"}'
# → { "tx_base64": "...", "recent_blockhash": "..." }

# 2. Sign tx_base64 with your wallet, then wrap it into an X-PAYMENT header
curl -s -X POST 'http://localhost:4023/api/x402-checkout?action=encode' \
  -H 'content-type: application/json' \
  -d '{"accept": <same accept>, "signed_tx_base64": "<signed>", "resource_url": "<the resource field>"}'
# → { "x_payment": "..." }
```

Then retry the original request with `X-PAYMENT: <x_payment>`. In a browser, [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) does all of this from a single `<button>`.

## 6. Read the artifact

```json
{
  "source": "fixture",
  "testMode": true,
  "quotedAt": "2026-08-07T12:00:00.000Z",
  "shipmentId": "shp_fixture_cf65f479a7323d17",
  "shipment": {
    "from": {
      "city": "San Francisco",
      "state": "CA",
      "zip": "94117",
      "country": "US"
    },
    "to": {
      "city": "Washington",
      "state": "DC",
      "zip": "20500",
      "country": "US"
    },
    "parcel": {
      "pounds": 2,
      "cubicFeet": 0.19,
      "zone": 8
    }
  },
  "rateCount": 7,
  "cheapest": {
    "rateId": "rate_fixture_01_usps_ground_advantage",
    "carrier": "USPS",
    "service": "Ground Advantage",
    "serviceToken": "usps_ground_advantage",
    "amount": 9.93,
    "currency": "USD",
    "estimatedDays": 6,
    "durationTerms": "Delivery in 2 to 5 business days.",
    "cheapest": true,
    "fastest": false
  },
  "fastest": {
    "rateId": "rate_fixture_03_usps_priority_express",
    "carrier": "USPS",
    "service": "Priority Mail Express",
    "serviceToken": "usps_priority_express",
    "amount": 45.02,
    "currency": "USD",
    "estimatedDays": 1,
    "durationTerms": "Next business day by 6pm to most US addresses.",
    "cheapest": false,
    "fastest": true
  },
  "rates": [
    {
      "rateId": "rate_fixture_01_usps_ground_advantage",
      "carrier": "USPS",
      "service": "Ground Advantage",
      "serviceToken": "usps_ground_advantage",
      "amount": 9.93,
      "currency": "USD",
      "estimatedDays": 6,
      "durationTerms": "Delivery in 2 to 5 business days.",
      "cheapest": true,
      "fastest": false
    }
  ],
  "payment": {
    "success": true,
    "rail": "evm",
    "network": "base-sepolia",
    "transaction": "0x9c1f…",
    "payer": "0xA11ce…",
    "amount": "3000",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "resource": "http://localhost:4023/rates"
  }
}
```

Two things to notice:

- **The artifact is in the body.** There's no job id to poll and no webhook to wait for — the thing you paid for is right there.
- **`payment` is your receipt.** It repeats the `X-PAYMENT-RESPONSE` header: which rail settled, the transaction hash or signature, and who paid. Log it; it's your proof of purchase.

`labelPdfBase64` is the whole point: decode it and you have the label on disk, no second request.

```bash
node -e 'const r=require("./label.json");require("fs").writeFileSync("label.pdf",Buffer.from(r.labelPdfBase64,"base64"))'
open label.pdf
```

In fixture mode the tracking number is derived from a hash of the shipment, so the same parcel always gets the same number — which makes tests boring, in the good way.

## 7. Go to mainnet

Testnet USDC is fine for development. For real money:

```bash
NETWORK=base                                   # EVM rail → Base mainnet
FACILITATOR_URL=https://facilitator.payai.network   # x402.org only settles base-sepolia
SOLANA_NETWORK=mainnet-beta                    # already the default
SOLANA_RPC_URL=https://your-dedicated-rpc      # the public RPC is rate-limited
PAY_TO_ADDRESS=0xYourEvmAddress
SOLANA_PAY_TO_ADDRESS=YourSolanaAddress
```

Then deploy anywhere that runs Node, set `PUBLIC_BASE_URL` to your public origin so the 402 `resource` field is right, and submit that origin to [x402scan.com](https://x402scan.com) / the x402 Bazaar / [agentic.market](https://agentic.market) — they read `/.well-known/x402` and list you automatically.

## Next

- [API reference](api.md) — every parameter and response field
- [For AI agents](agents.md) — discovery, MCP, and the skill.md contract
- [`examples/curl.md`](https://github.com/nirholas/x402-shipping/blob/main/examples/curl.md) — the raw HTTP walkthrough
