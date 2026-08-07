# Expose x402-shipping as an MCP tool

[MCP](https://modelcontextprotocol.io) lets Claude (and other MCP clients) call this service directly. The payment is invisible to the model: the wrapper handles the 402 and returns only the artifact.

## Install

```bash
npm install @modelcontextprotocol/sdk x402-fetch viem
```

## `mcp-server.ts`

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { writeFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";

const BASE_URL = process.env.SHIPPING_URL ?? "http://localhost:4023";

// One wallet, reused for every tool call. On base-sepolia this is testnet USDC.
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

const TOOLS = [
  {
    name: "shipping_get_rates",
    description: "Rate-shop a parcel across every available carrier service. Costs $0.003 in USDC (paid automatically via x402).",
    inputSchema: {
          "type": "object",
          "properties": {
                "from": {
                      "type": "object",
                      "properties": {
                            "name": {
                                  "type": "string"
                            },
                            "street1": {
                                  "type": "string"
                            },
                            "city": {
                                  "type": "string"
                            },
                            "state": {
                                  "type": "string"
                            },
                            "zip": {
                                  "type": "string"
                            },
                            "country": {
                                  "type": "string"
                            }
                      },
                      "description": "See skill.md for the full shape of `from`."
                },
                "to": {
                      "type": "object",
                      "properties": {
                            "name": {
                                  "type": "string"
                            },
                            "street1": {
                                  "type": "string"
                            },
                            "city": {
                                  "type": "string"
                            },
                            "state": {
                                  "type": "string"
                            },
                            "zip": {
                                  "type": "string"
                            },
                            "country": {
                                  "type": "string"
                            }
                      },
                      "description": "See skill.md for the full shape of `to`."
                },
                "parcel": {
                      "type": "object",
                      "properties": {
                            "length": {
                                  "type": "integer"
                            },
                            "width": {
                                  "type": "integer"
                            },
                            "height": {
                                  "type": "integer"
                            },
                            "weight": {
                                  "type": "integer"
                            },
                            "distanceUnit": {
                                  "type": "string"
                            },
                            "massUnit": {
                                  "type": "string"
                            }
                      },
                      "description": "See skill.md for the full shape of `parcel`."
                }
          },
          "required": [
                "from",
                "to",
                "parcel"
          ]
    },
  },
  {
    name: "shipping_buy_label",
    description: "Buy a shipping label for a quoted rate and get the label PDF back in the response. Costs $0.02 in USDC (paid automatically via x402).",
    inputSchema: {
          "type": "object",
          "properties": {
                "rateId": {
                      "type": "string",
                      "description": "See skill.md for the full shape of `rateId`."
                },
                "from": {
                      "type": "object",
                      "properties": {
                            "name": {
                                  "type": "string"
                            },
                            "street1": {
                                  "type": "string"
                            },
                            "city": {
                                  "type": "string"
                            },
                            "state": {
                                  "type": "string"
                            },
                            "zip": {
                                  "type": "string"
                            },
                            "country": {
                                  "type": "string"
                            }
                      },
                      "description": "See skill.md for the full shape of `from`."
                },
                "to": {
                      "type": "object",
                      "properties": {
                            "name": {
                                  "type": "string"
                            },
                            "street1": {
                                  "type": "string"
                            },
                            "city": {
                                  "type": "string"
                            },
                            "state": {
                                  "type": "string"
                            },
                            "zip": {
                                  "type": "string"
                            },
                            "country": {
                                  "type": "string"
                            }
                      },
                      "description": "See skill.md for the full shape of `to`."
                },
                "parcel": {
                      "type": "object",
                      "properties": {
                            "length": {
                                  "type": "integer"
                            },
                            "width": {
                                  "type": "integer"
                            },
                            "height": {
                                  "type": "integer"
                            },
                            "weight": {
                                  "type": "integer"
                            },
                            "distanceUnit": {
                                  "type": "string"
                            },
                            "massUnit": {
                                  "type": "string"
                            }
                      },
                      "description": "See skill.md for the full shape of `parcel`."
                }
          },
          "required": [
                "rateId",
                "from",
                "to",
                "parcel"
          ]
    },
  },
];

const server = new Server({ name: "x402-shipping", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  let res: Response;

  switch (req.params.name) {
    case "shipping_get_rates": {
      res = await payFetch(new URL("/rates", BASE_URL).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      break;
    }
    case "shipping_buy_label": {
      res = await payFetch(new URL("/label", BASE_URL).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      break;
    }
    default:
      throw new Error(`unknown tool: ${req.params.name}`);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`x402-shipping ${res.status}: ${detail}`);
  }

  // The artifact is the 200 body — hand it straight to the model.
  return { content: [{ type: "text", text: await res.text() }] };
});

await server.connect(new StdioServerTransport());
```

## Register it with Claude Desktop

```json
{
  "mcpServers": {
    "x402-shipping": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-server.ts"],
      "env": {
        "PRIVATE_KEY": "0xYourFundedKey",
        "SHIPPING_URL": "http://localhost:4023"
      }
    }
  }
}
```

## Notes

- **Budget the wallet.** Every tool call spends real USDC (POST /rates = $0.003, POST /label = $0.02). Fund the key with only what a session should be allowed to spend — that cap is your real spending limit.
- **Both rails work.** The example uses the EVM rail because `x402-fetch` handles it in one wrapper. For a Solana-funded agent, use the `/api/x402-checkout` helpers described in [`curl.md`](curl.md) and set the `X-PAYMENT` header yourself.
- **Receipts.** `res.headers.get("X-PAYMENT-RESPONSE")` (base64 JSON) is the settlement proof; the body's `payment` field carries the same thing if you'd rather log the parsed artifact.
- **Point the model at [`skill.md`](../skill.md)** as a resource so it knows the response schemas without a trial call.
