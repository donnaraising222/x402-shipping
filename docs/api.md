# API reference — x402-shipping

Base URL: `http://localhost:4023` locally, or your deployment's origin.

All paid routes answer `402` when called without an `X-PAYMENT` header, and the 402 body lists **both** payment rails. See [tutorial.md](tutorial.md) for the end-to-end flow and [agents.md](agents.md) for the agent integration.

---

## `POST /rates`

**$0.003** · Rate-shop a parcel across every available carrier service.

Prices a shipment across every carrier service available for the route. Each rate carries a `rateId` you pass to `POST /label`, the carrier and service name, the price and currency, estimated transit days, and the carrier's own duration terms. The response also surfaces `cheapest` and `fastest` directly so a caller doesn't have to sort. Dimensions accept `in` or `cm` and weight accepts `oz`, `lb`, `g` or `kg` — conversion happens server-side.

### Request body

```json
{
  "from": {
    "name": "Acme Robotics",
    "street1": "215 Clayton St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94117",
    "country": "US"
  },
  "to": {
    "name": "Dana Reyes",
    "street1": "1600 Pennsylvania Ave NW",
    "city": "Washington",
    "state": "DC",
    "zip": "20500",
    "country": "US"
  },
  "parcel": {
    "length": 10,
    "width": 8,
    "height": 4,
    "weight": 32,
    "distanceUnit": "in",
    "massUnit": "oz"
  }
}
```

### Example

```bash
curl -s -X POST http://localhost:4023/rates \
  -H 'Content-Type: application/json' \
  -d '{
    "from": {"street1":"215 Clayton St","city":"San Francisco","state":"CA","zip":"94117","country":"US"},
    "to":   {"street1":"1600 Pennsylvania Ave NW","city":"Washington","state":"DC","zip":"20500","country":"US"},
    "parcel": {"length":10,"width":8,"height":4,"weight":32,"massUnit":"oz"}
  }'
```

### Response `200`

the full carrier rate table with prices, transit days, and `cheapest` / `fastest` flags. The `payment` field mirrors the `X-PAYMENT-RESPONSE` header.

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

### Errors

`400 invalid_address` names the exact missing field. `400 invalid_parcel` when a dimension or weight isn't a positive number. `502 upstream_error` if the carrier API rejects the shipment (a bad ZIP, an unservicable route).

---

## `POST /label`

**$0.02** · Buy a shipping label for a quoted rate and get the label PDF back in the response.

Purchases the rate you name and returns the artifact inline: `labelPdfBase64` is the complete label document, ready to `Buffer.from(..., "base64")` and write to disk. Also returns the tracking number, the carrier's tracking URL where available, and the postage amount actually charged.

In live mode the `rateId` is all that's needed — the provider already holds the shipment. In fixture mode a rate id references nothing, so re-send the same `from`, `to` and `parcel` you used for `POST /rates`; the service will not invent an address it was never given.

### Request body

```json
{
  "rateId": "rate_fixture_01_usps_ground_advantage",
  "from": {
    "name": "Acme Robotics",
    "street1": "215 Clayton St",
    "city": "San Francisco",
    "state": "CA",
    "zip": "94117",
    "country": "US"
  },
  "to": {
    "name": "Dana Reyes",
    "street1": "1600 Pennsylvania Ave NW",
    "city": "Washington",
    "state": "DC",
    "zip": "20500",
    "country": "US"
  },
  "parcel": {
    "length": 10,
    "width": 8,
    "height": 4,
    "weight": 32,
    "distanceUnit": "in",
    "massUnit": "oz"
  }
}
```

### Example

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

### Response `200`

the label as base64 PDF plus tracking number, tracking URL, carrier, service and the amount charged. The `payment` field mirrors the `X-PAYMENT-RESPONSE` header.

```json
{
  "source": "fixture",
  "testMode": true,
  "purchasedAt": "2026-08-07T12:00:00.000Z",
  "labelId": "lbl_fixture_6bd6b4c2e73cace7",
  "rateId": "rate_fixture_01_usps_ground_advantage",
  "carrier": "USPS",
  "service": "Ground Advantage",
  "amount": 9.93,
  "currency": "USD",
  "trackingNumber": "9400 1000 0000 1135 3746 69",
  "trackingUrl": null,
  "labelFormat": "PDF",
  "labelPdfBase64": "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4K…",
  "labelUrl": null,
  "providerShipmentId": null,
  "providerTransactionId": null,
  "payment": {
    "success": true,
    "rail": "solana",
    "network": "solana",
    "transaction": "5xkQ…",
    "payer": "9wFh…",
    "amount": "20000",
    "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "resource": "http://localhost:4023/label"
  }
}
```

### Errors

`400 missing_rate_id` when `rateId` is absent. `404 rate_not_found` when the id isn't among the rates for the shipment you sent — re-quote and use a fresh id. `502 label_unavailable` in the rare case where the carrier issued tracking but the PDF couldn't be fetched; the message includes where to retrieve it, and the tracking number is in the error path too, so nothing is lost.

---

## Free routes

### `GET /health`

```json
{
  "ok": true,
  "service": "x402-shipping",
  "source": "fixture",
  "rails": [
    { "rail": "evm", "network": "base-sepolia" },
    { "rail": "solana", "network": "solana" }
  ]
}
```

### `GET /.well-known/x402`

The discovery manifest. Every resource entry carries its price and an `accepts` array with both rails. This is what [x402scan.com](https://x402scan.com), the x402 Bazaar and [agentic.market](https://agentic.market) index.

---

## The 402 challenge

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

Amounts are USDC atomic units (6 decimals): `"2000"` is `$0.002`.

## Settlement receipt

Successful paid responses carry `X-PAYMENT-RESPONSE`, base64 JSON:

```json
{
  "success": true,
  "rail": "evm",
  "network": "base-sepolia",
  "transaction": "0x…",
  "payer": "0x…",
  "amount": "3000",
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "resource": "http://localhost:4023/rates"
}
```

The same object is echoed in the response body's `payment` field, so an agent that only reads JSON still gets its receipt.

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_address` | 400 | `from` or `to` is missing `street1`, `city`, `state`, `zip` or `country` |
| `invalid_parcel` | 400 | `parcel` is missing a positive `length`, `width`, `height` or `weight` |
| `missing_rate_id` | 400 | `POST /label` called without a `rateId` |
| `rate_not_found` | 404 | The `rateId` isn't one of the rates for the shipment you sent |
| `label_unavailable` | 502 | The carrier issued tracking but the label PDF could not be fetched — the response tells you where to retrieve it |
| `upstream_error` | 502 | The carrier API rejected the request or was unreachable |
| `no_payment_rail` | 500 | Neither rail is configured on this instance |
| `facilitator_unreachable` | 502 | The rail's facilitator could not be reached to verify the payment |
| `settlement_error` | 502 | The payment verified but settlement failed — you were not charged |
