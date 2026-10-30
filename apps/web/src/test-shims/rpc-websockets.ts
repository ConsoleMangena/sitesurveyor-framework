/**
 * Test-only stand-in for `rpc-websockets` (aliased in vite.config.ts when
 * VITEST is set).
 *
 * @solana/web3.js extends `CommonClient` at module scope to build its
 * websocket RPC client, and calls `WebSocket(url, ...)` only when a `Connection`
 * with a websocket endpoint is constructed. Unit tests never open sockets,
 * so the classes here stub the module surface and fail loudly if any test
 * accidentally tries to use them.
 */

export class CommonClient {
  constructor(..._args: unknown[]) {
    throw new Error(
      "rpc-websockets is stubbed in tests: websocket subscriptions are unavailable.",
    );
  }
}

export function WebSocket(..._args: unknown[]): never {
  throw new Error(
    "rpc-websockets is stubbed in tests: websocket subscriptions are unavailable.",
  );
}

export class Client extends CommonClient {}
