export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",

  // Long poll timeout in ms (CLI will timeout at ~10s, we respond before that)
  pollTimeoutMs: 8000,

  // JWT token expiry for work secrets (1 hour)
  tokenExpirySeconds: 3600,

  // WebSocket ping interval
  wsPingIntervalMs: 30000,

  // When enabled, forward set_permission_mode to CLI instead of handling server-side.
  // Requires CLI to be patched with scripts/patch.js.
  experimentalSetPermissionMode:
    process.env.EXPERIMENTAL_SET_PERMISSION_MODE === "true" ||
    process.argv.includes("--experimental-set-permission-mode"),
};
