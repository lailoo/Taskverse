import test from "node:test";
import assert from "node:assert/strict";
import { loadProject, saveProject } from "../src/lib/storage";
import { makeInitialProject } from "../src/lib/tasks";

test("server storage migrates legacy data once and never replaces an existing project", async () => {
  const originalFetch = globalThis.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  const legacy = makeInitialProject();
  let reads = 0;
  const fakeIDB = {
    open() {
      reads++;
      const request: Record<string, any> = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            const transaction: Record<string, any> = {
              objectStore: () => ({ get: () => ({ result: legacy }) }),
            };
            queueMicrotask(() => transaction.oncomplete?.());
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: fakeIDB,
  });
  try {
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      if (!init?.method) return Response.json({ project: null, revision: 0 });
      const body = JSON.parse(String(init.body));
      assert.equal(body.revision, 0);
      assert.deepEqual(body.project, legacy);
      return Response.json({ revision: 1 });
    };
    assert.deepEqual(await loadProject(), legacy);
    assert.equal(calls, 2);
    assert.equal(reads, 1);

    const existing = { ...legacy, budget: 120000 };
    globalThis.fetch = async () =>
      Response.json({ project: existing, revision: 5 });
    assert.deepEqual(await loadProject(), existing);
    assert.equal(
      reads,
      1,
      "Existing SQLite data must bypass legacy browser records",
    );

    globalThis.fetch = async (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).revision, 5);
      return Response.json({ error: "版本冲突" }, { status: 409 });
    };
    await assert.rejects(() => saveProject(existing), /版本冲突/);

    calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      if (init?.method === "PUT")
        return Response.json({ error: "conflict" }, { status: 409 });
      return Response.json(
        calls === 1
          ? { project: null, revision: 0 }
          : { project: existing, revision: 5 },
      );
    };
    assert.deepEqual(
      await loadProject(),
      existing,
      "A competing first migration wins without being overwritten",
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (descriptor) Object.defineProperty(globalThis, "indexedDB", descriptor);
    else Reflect.deleteProperty(globalThis, "indexedDB");
  }
});
