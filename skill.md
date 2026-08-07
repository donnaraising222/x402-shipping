# x402-shipping

x402-shipping lets an agent rate-shop and buy shipping labels by paying per call. `POST /rates` takes a from address, a to address and a parcel (dimensions + weight in the units you have) and returns the full carrier rate table: carrier, service name, price, estimated transit days, and duration terms, with `cheapest` and `fastest` flags already computed. `POST /label` takes a `rateId` from that table and returns the purchased label as base64 PDF plus the tracking number, tracking URL, and the amount actually charged. Both artifacts arrive in the response body. Providers run in **test mode** by default, so labels are real documents but nothing ships and nothing is charged.

**Base URL:** `{BASE_URL}` (local default `http://localhost:4023`)

## Endpoints

### `POST /rates` — $0.003

Prices a shipment across every carrier service available for the route. Each rate carries a `rateId` you pass to `POST /label`, the carrier and service name, the price and currency, estimated transit days, and the carrier's own duration terms. The response also surfaces `cheapest` and `fastest` directly so a caller doesn't have to sort. Dimensions accept `in` or `cm` and weight accepts `oz`, `lb`, `g` or `kg` — conversion happens server-side.

Request body:

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

Returns the full carrier rate table with prices, transit days, and `cheapest` / `fastest` flags:

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

### `POST /label` — $0.02

Purchases the rate you name and returns the artifact inline: `labelPdfBase64` is the complete label document, ready to `Buffer.from(..., "base64")` and write to disk. Also returns the tracking number, the carrier's tracking URL where available, and the postage amount actually charged.

In live mode the `rateId` is all that's needed — the provider already holds the shipment. In fixture mode a rate id references nothing, so re-send the same `from`, `to` and `parcel` you used for `POST /rates`; the service will not invent an address it was never given.

Request body:

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

Returns the label as base64 PDF plus tracking number, tracking URL, carrier, service and the amount charged:

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

### Free routes

| Route | Returns |
|---|---|
| `GET /health` | `{ok, service, source, rails}` — liveness plus the rails this instance advertises |
| `GET /.well-known/x402` | The discovery manifest below |

## Payment

This service speaks **x402** (HTTP 402 payment protocol, <https://x402.org>). **Pay in USDC on Base or Solana — your client picks the rail.**

1. Call the endpoint normally. With no `X-PAYMENT` header you get `402` and a JSON body with an `accepts` array holding **both** rails.
2. Pick a rail, produce a payment for it, and retry the identical request with the base64 `X-PAYMENT` header.
3. You get `200` with the artifact **in the response body**, plus an `X-PAYMENT-RESPONSE` header carrying the settlement receipt (tx hash / signature + rail). The same receipt is echoed in the body's `payment` field.

| Rail | Network | Asset | payTo | Facilitator |
|---|---|---|---|---|
| EVM | `base-sepolia` (or `base`) | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `0x40252CFDF8B20Ed757D61ff157719F33Ec332402` | `https://x402.org/facilitator` |
| Solana | `solana` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | `WwwuGbqHrwF5RG89KhUbmRWEvjnRH9k5kVM5p7T3WwW` | `https://facilitator.payai.network` |

Pay via [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) (EVM), [`@three-ws/x402-payment-modal`](https://www.npmjs.com/package/@three-ws/x402-payment-modal) (browser, both rails), or any x402 client. Solana wallets that sign serialized transactions can use this server's helper endpoints:

```
POST /api/x402-checkout?action=prepare   → unsigned SPL transfer for a chosen accept
POST /api/x402-checkout?action=encode    → wraps your signed tx into an X-PAYMENT header
```

The Solana `extra.feePayer` sponsor pays the SOL network fee, so you need only USDC.

## Errors

| Code | HTTP | Meaning |
|---|---|---|
| `invalid_address` | 400 | `from` or `to` is missing `street1`, `city`, `state`, `zip` or `country` |
| `invalid_parcel` | 400 | `parcel` is missing a positive `length`, `width`, `height` or `weight` |
| `missing_rate_id` | 400 | `POST /label` called without a `rateId` |
| `rate_not_found` | 404 | The `rateId` isn't one of the rates for the shipment you sent |
| `label_unavailable` | 502 | The carrier issued tracking but the label PDF could not be fetched — the response tells you where to retrieve it |
| `upstream_error` | 502 | The carrier API rejected the request or was unreachable |
| `no_payment_rail` | 500 | Neither rail is configured on this instance |
| `facilitator_unreachable` | 502 | The rail's facilitator could not be reached to verify |
| `settlement_error` | 502 | Verified, but settlement failed — you were not charged |

## Data source

Live carrier data is used when `SHIPPO_API_TOKEN` or `EASYPOST_API_KEY` is set — both providers issue free test-mode keys. Without either, the service quotes from a deterministic fixture rate table (seven real carrier services: USPS Ground Advantage / Priority / Priority Express, UPS Ground / 2nd Day Air, FedEx Home Delivery / 2Day) priced on actual weight, volume and ZIP-derived zone, and issues a genuine one-page PDF label. Every response carries `"source": "fixture"` and `"testMode": true`.

## Discovery

- Manifest: `{BASE_URL}/.well-known/x402`
- OpenAPI: [`openapi.json`](https://github.com/nirholas/x402-shipping/blob/main/openapi.json)
- Docs: <https://nirholas.github.io/x402-shipping/>
- Contact: nichxbt@gmail.com
