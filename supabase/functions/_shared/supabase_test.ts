/**
 * Tests for the service-key gate used by maintenance Edge Functions.
 *
 * The gate is the only thing separating a cross-workspace writer from a
 * signed-in user, so these tests pin both directions: the configured key is
 * accepted, and anything else — including a forged JWT that merely claims
 * `service_role` — is refused.
 *
 * Run with: deno test --allow-env supabase/functions/_shared/supabase_test.ts
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import { hasServiceKey } from "./supabase.ts";

const LEGACY_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";
const SECRET_KEY_ENV = "SUPABASE_SECRET_KEY";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, Deno.env.get(name));
    if (value === undefined) Deno.env.delete(name);
    else Deno.env.set(name, value);
  }
  try {
    run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
}

function request(authorization?: string): Request {
  return new Request("https://example.test/backfill-geocode", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });
}

/** A syntactically valid JWT whose payload claims the service role. */
const FORGED_SERVICE_JWT = [
  btoa(JSON.stringify({ alg: "none", typ: "JWT" })),
  btoa(JSON.stringify({ role: "service_role" })),
  "not-a-signature",
].join(".");

Deno.test("hasServiceKey refuses a request with no Authorization header", () => {
  withEnv({ [LEGACY_KEY_ENV]: "service-key", [SECRET_KEY_ENV]: undefined }, () => {
    assert(!hasServiceKey(request()));
  });
});

Deno.test("hasServiceKey refuses a signed-in user's token", () => {
  withEnv({ [LEGACY_KEY_ENV]: "service-key", [SECRET_KEY_ENV]: undefined }, () => {
    assert(!hasServiceKey(request("Bearer user-access-token")));
  });
});

Deno.test("hasServiceKey accepts the configured legacy service role key", () => {
  withEnv({ [LEGACY_KEY_ENV]: "legacy-service-key", [SECRET_KEY_ENV]: undefined }, () => {
    assert(hasServiceKey(request("Bearer legacy-service-key")));
  });
});

Deno.test("hasServiceKey accepts the configured secret key", () => {
  withEnv({ [LEGACY_KEY_ENV]: undefined, [SECRET_KEY_ENV]: "sb_secret_value" }, () => {
    assert(hasServiceKey(request("Bearer sb_secret_value")));
  });
});

Deno.test("hasServiceKey refuses a forged JWT that claims the service role", () => {
  withEnv({ [LEGACY_KEY_ENV]: "legacy-service-key", [SECRET_KEY_ENV]: undefined }, () => {
    assert(!hasServiceKey(request(`Bearer ${FORGED_SERVICE_JWT}`)));
  });
});

Deno.test("hasServiceKey refuses when no service key is configured", () => {
  withEnv({ [LEGACY_KEY_ENV]: undefined, [SECRET_KEY_ENV]: undefined }, () => {
    assert(!hasServiceKey(request("Bearer anything")));
  });
});

Deno.test("hasServiceKey compares the whole secret, not a prefix", () => {
  withEnv({ [LEGACY_KEY_ENV]: "legacy-service-key", [SECRET_KEY_ENV]: undefined }, () => {
    assert(!hasServiceKey(request("Bearer legacy-service-ke")));
    assert(!hasServiceKey(request("Bearer legacy-service-key-extra")));
  });
});

Deno.test("hasServiceKey requires the Bearer scheme", () => {
  withEnv({ [LEGACY_KEY_ENV]: "legacy-service-key", [SECRET_KEY_ENV]: undefined }, () => {
    assertEquals(
      hasServiceKey(request("Basic legacy-service-key")),
      false,
    );
  });
});
