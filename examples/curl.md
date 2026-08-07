# Raw HTTP walkthrough — x402-shipping

The full 402 → pay → 200 flow with nothing but `curl`. Start the server first:

```bash
npm run dev   # http://localhost:4023
```

## 0. Free routes need no payment

```bash
curl -s http://localhost:4023/health
curl -s http://localhost:4023/.well-known/x402
```

## 1. Ask without paying → `402`

```bash
curl -i -X POST http://localhost:4023/rates \
  -H 'Content-Type: application/json' \
  -d '{"from":{"street1":"215 Clayton St","city":"San Francisco","state":"CA","zip":"94117","country":"US"},"to":{"street1":"1600 Pennsylvania Ave NW","city":"Washington","state":"DC","zip":"20500","country":"US"},"parcel":{"length":10,"width":8,"height":4,"weight":32}}'
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
```

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

**Both rails, one challenge.** Pick either entry:

- the `base-sepolia` entry → sign an EIP-3009 USDC authorization
- the `solana` entry → sign an SPL `transferChecked`

`maxAmountRequired` is in USDC atomic units (6 decimals), so `"3000"` = `$0.003`.

## 2a. Pay on Base (EVM)

The EIP-3009 signature is produced by your wallet, so this step isn't a `curl`. The payload you base64-encode into `X-PAYMENT` looks like:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x…",
    "authorization": {
      "from": "0xYourWallet",
      "to": "0x40252CFDF8B20Ed757D61ff157719F33Ec332402",
      "value": "3000",
      "validAfter": "0",
      "validBefore": "1893456000",
      "nonce": "0x…"
    }
  }
}
```

```bash
X_PAYMENT=$(printf '%s' "$PAYLOAD_JSON" | base64 -w0)
```

In practice let [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) build it — see [`agent-client.ts`](agent-client.ts).

## 2b. Pay on Solana

Solana wallets sign serialized transactions, so the server builds one:

```bash
# Save the solana accept from step 1
ACCEPT='{"scheme":"exact","network":"solana","amount":"3000","asset":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","payTo":"WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW","extra":{"name":"USD Coin","decimals":6,"feePayer":"2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4"}}'

# Build the unsigned transfer
curl -s -X POST 'http://localhost:4023/api/x402-checkout?action=prepare' \
  -H 'content-type: application/json' \
  -d "{\"accept\": $ACCEPT, \"buyer\": \"YOUR_BASE58_PUBKEY\"}"
# → { "network": "solana", "tx_base64": "…", "recent_blockhash": "…" }

# …sign tx_base64 in your wallet, then wrap it…
curl -s -X POST 'http://localhost:4023/api/x402-checkout?action=encode' \
  -H 'content-type: application/json' \
  -d "{\"accept\": $ACCEPT, \"signed_tx_base64\": \"SIGNED_TX\", \"resource_url\": \"http://localhost:4023/rates\"}"
# → { "x_payment": "…" }
```

The `feePayer` sponsor pays the SOL network fee — you only need USDC.

## 3. Retry with the header → `200`

```bash
curl -sD - -X POST http://localhost:4023/rates \
  -H 'Content-Type: application/json' \
  -d '{
    "from": {"street1":"215 Clayton St","city":"San Francisco","state":"CA","zip":"94117","country":"US"},
    "to":   {"street1":"1600 Pennsylvania Ave NW","city":"Washington","state":"DC","zip":"20500","country":"US"},
    "parcel": {"length":10,"width":8,"height":4,"weight":32,"massUnit":"oz"}
  }'
```

```http
HTTP/1.1 200 OK
X-PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJyYWlsIjoiZXZtIiwi…
```

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

Decode the receipt header:

```bash
echo "$RESPONSE_HEADER" | base64 -d
# {"success":true,"rail":"evm","network":"base-sepolia","transaction":"0x…","payer":"0x…"}
```

The same object is in the body's `payment` field, so you can skip the header entirely.

## Other routes

### `POST /label` — $0.02

```bash
curl -s -X POST http://localhost:4023/label \
  -H 'Content-Type: application/json' \
  -d '{
    "rateId": "rate_fixture_01_usps_ground_advantage",
    "from": {"street1":"215 Clayton St","city":"San Francisco","state":"CA","zip":"94117","country":"US"},
    "to":   {"street1":"1600 Pennsylvania Ave NW","city":"Washington","state":"DC","zip":"20500","country":"US"},
    "parcel": {"length":10,"width":8,"height":4,"weight":32}
  }' > label.json

# The label is already in the response — write it to disk, no second request.
node -e 'require("fs").writeFileSync("label.pdf",Buffer.from(require("./label.json").labelPdfBase64,"base64"))'
```

## Errors you may hit

| Body `error` | HTTP | Fix |
|---|---|---|
| `invalid_address` | 400 | `from` or `to` is missing `street1`, `city`, `state`, `zip` or `country` |
| `invalid_parcel` | 400 | `parcel` is missing a positive `length`, `width`, `height` or `weight` |
| `missing_rate_id` | 400 | `POST /label` called without a `rateId` |
| `rate_not_found` | 404 | The `rateId` isn't one of the rates for the shipment you sent |
| `label_unavailable` | 502 | The carrier issued tracking but the label PDF could not be fetched — the response tells you where to retrieve it |
| `upstream_error` | 502 | The carrier API rejected the request or was unreachable |
| `facilitator_unreachable` | 502 | The facilitator is down or unreachable — retry; you were not charged |
