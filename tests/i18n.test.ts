import test from "node:test";
import assert from "node:assert/strict";
import { APP_LANGUAGES, UI_TEXT, priorityText, statusText, type AppLanguage } from "../src/lib/i18n";

test("the interface exposes the five supported languages", () => {
  assert.deepEqual(APP_LANGUAGES.map(language => language.value), ["zh", "en", "fr", "ja", "ko"]);
  const keys = Object.keys(UI_TEXT.zh).sort();
  for (const language of APP_LANGUAGES.map(item => item.value) as AppLanguage[]) {
    assert.deepEqual(Object.keys(UI_TEXT[language]).sort(), keys);
    assert.ok(UI_TEXT[language].map.length > 0);
    assert.ok(UI_TEXT[language].language.length > 0);
  }
});

test("status and priority labels follow the selected language", () => {
  assert.equal(statusText("fr").doing, "En cours");
  assert.equal(statusText("ja").done, "完了");
  assert.equal(statusText("ko").todo, "할 일");
  assert.equal(priorityText("fr").high, "Haute");
  assert.equal(priorityText("ja").none, "優先度なし");
  assert.equal(priorityText("ko").medium, "보통");
});
