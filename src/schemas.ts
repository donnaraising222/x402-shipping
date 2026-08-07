/**
 * Per-route x402 schemas — GENERATED FROM `openapi.json`, do not edit by hand.
 *
 * The x402 challenge a paid route answers with has to tell an agent two things
 * it cannot guess: how to call the route, and what it gets back for its money.
 * Both live under `accepts[].outputSchema` in the x402 Bazaar shape:
 *
 *     outputSchema.input   how to invoke  (method + path/query params or JSON body fields)
 *     outputSchema.output  the JSON Schema of the 200/201 body
 *
 * Keys match the paywall route map in `server.ts` exactly, so a route is
 * declared once and its schema is spread in:
 *
 *     "POST /thing": { price: "$0.01", description: "…", ...ROUTE_SCHEMAS["POST /thing"] }
 *
 * Everything here is copied verbatim from this service's OpenAPI document, so
 * the runtime 402 and the published spec can never drift apart.
 */

/** How an agent invokes a paid route. */
export type X402Input = {
  type: "http";
  method: string;
  /** Path segments, e.g. `:id` in `/cases/:id`. */
  pathParams?: Record<string, unknown>;
  queryParams?: Record<string, unknown>;
  queryRequired?: string[];
  bodyType?: "json";
  /** JSON Schema properties of the request body. */
  bodyFields?: Record<string, unknown>;
  bodyRequired?: string[];
};

/** The `outputSchema` object published in every `accepts[]` entry. */
export type X402RouteSchema = {
  input: X402Input;
  /** JSON Schema of the success response body. */
  output: Record<string, unknown>;
};

export type RouteSchemaEntry = { outputSchema: X402RouteSchema };

export const ROUTE_SCHEMAS: Record<string, RouteSchemaEntry> = {
  "POST /rates": {
    "outputSchema": {
      "input": {
        "type": "http",
        "method": "POST",
        "bodyType": "json",
        "bodyFields": {
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
            }
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
            }
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
            }
          }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string"
          },
          "testMode": {
            "type": "boolean"
          },
          "quotedAt": {
            "type": "string"
          },
          "shipmentId": {
            "type": "string"
          },
          "shipment": {
            "type": "object",
            "properties": {
              "from": {
                "type": "object",
                "properties": {
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
                }
              },
              "to": {
                "type": "object",
                "properties": {
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
                }
              },
              "parcel": {
                "type": "object",
                "properties": {
                  "pounds": {
                    "type": "integer"
                  },
                  "cubicFeet": {
                    "type": "number"
                  },
                  "zone": {
                    "type": "integer"
                  }
                }
              }
            }
          },
          "rateCount": {
            "type": "integer"
          },
          "cheapest": {
            "type": "object",
            "properties": {
              "rateId": {
                "type": "string"
              },
              "carrier": {
                "type": "string"
              },
              "service": {
                "type": "string"
              },
              "serviceToken": {
                "type": "string"
              },
              "amount": {
                "type": "number"
              },
              "currency": {
                "type": "string"
              },
              "estimatedDays": {
                "type": "integer"
              },
              "durationTerms": {
                "type": "string"
              },
              "cheapest": {
                "type": "boolean"
              },
              "fastest": {
                "type": "boolean"
              }
            }
          },
          "fastest": {
            "type": "object",
            "properties": {
              "rateId": {
                "type": "string"
              },
              "carrier": {
                "type": "string"
              },
              "service": {
                "type": "string"
              },
              "serviceToken": {
                "type": "string"
              },
              "amount": {
                "type": "number"
              },
              "currency": {
                "type": "string"
              },
              "estimatedDays": {
                "type": "integer"
              },
              "durationTerms": {
                "type": "string"
              },
              "cheapest": {
                "type": "boolean"
              },
              "fastest": {
                "type": "boolean"
              }
            }
          },
          "rates": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "rateId": {
                  "type": "string"
                },
                "carrier": {
                  "type": "string"
                },
                "service": {
                  "type": "string"
                },
                "serviceToken": {
                  "type": "string"
                },
                "amount": {
                  "type": "number"
                },
                "currency": {
                  "type": "string"
                },
                "estimatedDays": {
                  "type": "integer"
                },
                "durationTerms": {
                  "type": "string"
                },
                "cheapest": {
                  "type": "boolean"
                },
                "fastest": {
                  "type": "boolean"
                }
              }
            }
          },
          "payment": {
            "type": "object",
            "properties": {
              "success": {
                "type": "boolean"
              },
              "rail": {
                "type": "string"
              },
              "network": {
                "type": "string"
              },
              "transaction": {
                "type": "string"
              },
              "payer": {
                "type": "string"
              },
              "amount": {
                "type": "string"
              },
              "asset": {
                "type": "string"
              },
              "resource": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  },
  "POST /label": {
    "outputSchema": {
      "input": {
        "type": "http",
        "method": "POST",
        "bodyType": "json",
        "bodyFields": {
          "rateId": {
            "type": "string"
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
            }
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
            }
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
            }
          }
        }
      },
      "output": {
        "type": "object",
        "properties": {
          "source": {
            "type": "string"
          },
          "testMode": {
            "type": "boolean"
          },
          "purchasedAt": {
            "type": "string"
          },
          "labelId": {
            "type": "string"
          },
          "rateId": {
            "type": "string"
          },
          "carrier": {
            "type": "string"
          },
          "service": {
            "type": "string"
          },
          "amount": {
            "type": "number"
          },
          "currency": {
            "type": "string"
          },
          "trackingNumber": {
            "type": "string"
          },
          "trackingUrl": {
            "type": [
              "null",
              "string"
            ]
          },
          "labelFormat": {
            "type": "string"
          },
          "labelPdfBase64": {
            "type": "string"
          },
          "labelUrl": {
            "type": [
              "null",
              "string"
            ]
          },
          "providerShipmentId": {
            "type": [
              "null",
              "string"
            ]
          },
          "providerTransactionId": {
            "type": [
              "null",
              "string"
            ]
          },
          "payment": {
            "type": "object",
            "properties": {
              "success": {
                "type": "boolean"
              },
              "rail": {
                "type": "string"
              },
              "network": {
                "type": "string"
              },
              "transaction": {
                "type": "string"
              },
              "payer": {
                "type": "string"
              },
              "amount": {
                "type": "string"
              },
              "asset": {
                "type": "string"
              },
              "resource": {
                "type": "string"
              }
            }
          }
        }
      }
    }
  }
};
