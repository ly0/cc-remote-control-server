import { config } from "../config";
import type { WorkSecret } from "../types";

/**
 * Base64url encode a string (no padding).
 */
function base64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Create a minimal JWT-like token that CLI can parse for expiry.
 * CLI uses P0z() to decode the JWT payload and read `exp`.
 * Format: header.payload.signature
 */
function createSimpleJwt(sessionId: string): string {
  const header = base64urlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = base64urlEncode(
    JSON.stringify({
      sub: sessionId,
      exp: Math.floor(Date.now() / 1000) + config.tokenExpirySeconds,
      iat: Math.floor(Date.now() / 1000),
    })
  );
  // No signature needed for local development
  return `${header}.${payload}.`;
}

/**
 * Encode a work secret as base64url JSON string.
 * CLI decodes this via DR1() and validates version=1 + session_ingress_token present.
 */
export function encodeWorkSecret(
  sessionId: string,
  apiBaseUrl: string
): string {
  const secret: WorkSecret = {
    version: 1,
    session_ingress_token: createSimpleJwt(sessionId),
    api_base_url: apiBaseUrl,
  };
  return base64urlEncode(JSON.stringify(secret));
}
