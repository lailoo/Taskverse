import test from "node:test";
import assert from "node:assert/strict";
import { publicAIConfig, resolveAIConfig } from "../src/lib/ai-config";

const previous = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "model-before",
  apiKey: "test-secret",
};

test("same-provider settings preserve the saved key without exposing it", () => {
  const config = resolveAIConfig(
    { ...previous, model: "model-after", apiKey: "" },
    previous,
  );
  assert.equal(config.apiKey, "test-secret");
  assert.equal(config.model, "model-after");
  assert.deepEqual(publicAIConfig(config), {
    provider: "openai",
    baseUrl: previous.baseUrl,
    model: "model-after",
    keyConfigured: true,
  });
});

test("switching provider or endpoint requires a new key", () => {
  assert.throws(() =>
    resolveAIConfig({ ...previous, provider: "custom", apiKey: "" }, previous),
  );
  assert.throws(() =>
    resolveAIConfig(
      { ...previous, baseUrl: "https://example.com/v1", apiKey: "" },
      previous,
    ),
  );
  assert.equal(
    resolveAIConfig(
      {
        ...previous,
        provider: "custom",
        baseUrl: "https://example.com/v1/",
        apiKey: "replacement",
      },
      previous,
    ).baseUrl,
    "https://example.com/v1",
  );
});

test("connection settings reject invalid URLs and header injection", () => {
  for (const baseUrl of [
    "http://example.com/v1",
    "https://user:secret@example.com/v1",
    "https://example.com/v1?secret=x",
    "https://example.com/v1/chat/completions",
  ]) {
    assert.throws(() => resolveAIConfig({ ...previous, baseUrl }, previous));
  }
  assert.throws(() =>
    resolveAIConfig({ ...previous, apiKey: "abc\r\nheader" }, previous),
  );
  assert.throws(() => resolveAIConfig({ ...previous, model: " " }, previous));
  assert.equal(
    resolveAIConfig(
      { ...previous, baseUrl: "http://localhost:11434/v1", apiKey: "local" },
      previous,
    ).baseUrl,
    "http://localhost:11434/v1",
  );
});
