import test from "node:test";
import assert from "node:assert/strict";
import { isSameOrigin } from "../src/lib/request-origin";
test("Next internal localhost URL accepts the original loopback host", () => {
  const request = (origin: string) =>
    new Request("http://localhost:3010/api/project", {
      headers: { origin, host: "127.0.0.1:3010" },
    });
  assert.equal(isSameOrigin(request("http://127.0.0.1:3010")), true);
  assert.equal(isSameOrigin(request("http://example.com:3010")), false);
  assert.equal(isSameOrigin(request("null")), false);
});
