import test from "node:test";
import assert from "node:assert/strict";
import { fetchLocal } from "../src/lib/local-fetch";

test("a temporary disconnect does not prevent loading conversation history", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    if (++calls === 1) throw new TypeError("Failed to fetch");
    return Response.json([{ id: "saved-conversation" }]);
  });
  assert.deepEqual(await (await fetchLocal("/api/chats")).json(), [{ id: "saved-conversation" }]);
  assert.equal(calls, 2);
});

test("writes are never retried after an ambiguous transport failure", async t => {
  for (const method of ["POST", "PUT", "DELETE"]) {
    const mock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Load failed"); });
    await assert.rejects(fetchLocal("/api/chats", { method }), /无法连接本机服务，聊天记录请求未完成/);
    assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
});

test("explicit read-only login status retries are bounded", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("NetworkError when attempting to fetch resource."); });
  await assert.rejects(fetchLocal("/api/search/login", { method: "POST", retryRead: true }), /小红书登录请求未完成/);
  assert.equal(mock.mock.callCount(), 3);
});

test("closing a panel cancels reconnect and keeps the original abort reason", async t => {
  const controller = new AbortController();
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  const request = fetchLocal("/api/chats", { signal: controller.signal });
  setTimeout(() => controller.abort("panel-closed"), 20);
  await assert.rejects(request, error => error === "panel-closed");
  assert.equal(mock.mock.callCount(), 1);
});

test("server validation and login errors are kept without retry", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "请先扫码登录" }, { status: 401 }));
  const response = await fetchLocal("/api/search/login", { method: "POST", retryRead: true });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "请先扫码登录");
  assert.equal(mock.mock.callCount(), 1);
});
