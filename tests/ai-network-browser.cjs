// Simulate transport failures without touching real project data or external AI.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { makeInitialProject } = require('../src/lib/tasks.ts');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(8000);
    let historyFailures = 1, settingsFailures = 1, loginFailures = 1, aiCalls = 0;
    const session = { id: 'network-fixture', revision: 0, title: '连接恢复测试', messages: [], updatedAt: new Date().toISOString(), summary: '', memory: {} };
    await page.route("**/api/**", route => route.abort("blockedbyclient"));
    await page.route('**/api/project', r => r.fulfill({ json: { project: makeInitialProject(), revision: 1 } }));
    await page.route('**/api/chats*', r => {
      if (r.request().method() === 'GET' && !new URL(r.request().url()).searchParams.has('id')) {
        if (historyFailures-- > 0) return r.abort('failed');
        return r.fulfill({ json: [session] });
      }
      if (r.request().method() === 'PUT') Object.assign(session, r.request().postDataJSON(), { revision: session.revision + 1 });
      return r.fulfill({ json: session });
    });
    await page.route('**/api/ai/settings', r => r.fulfill({ json: { provider: 'openai', baseUrl: 'https://example.com/v1', model: 'fixture', keyConfigured: true } }));
    await page.route('**/api/search/settings', r => {
      if (settingsFailures-- > 0) return r.abort('failed');
      return r.fulfill({ json: { provider: 'xiaohongshu-mcp', configured: true } });
    });
    await page.route('**/api/search/login', r => {
      if (loginFailures-- > 0) return r.abort('failed');
      return r.fulfill({ json: { connected: true, loggedIn: false } });
    });
    await page.route('**/api/ai', r => {
      if (r.request().method() === 'GET') return r.fulfill({ json: { configured: true } });
      aiCalls++;
      return r.abort('failed');
    });
    await page.addInitScript(() => { localStorage.setItem('taskverse-language', 'zh'); localStorage.setItem('wedding-map-pets', 'false'); });
    await page.goto(process.env.XHS_TEST_URL || 'http://127.0.0.1:3010/');
    await page.getByRole('button', { name: '婚礼 AI 助手', exact: true }).click();
    const panel = page.locator('.ai-chat');
    try { await panel.getByText('连接恢复测试', { exact: true }).waitFor(); }
    catch (error) { console.log('History error:', await panel.getByRole('alert').allTextContents()); throw error; }
    await page.getByRole('button', { name: 'AI 模型设置', exact: true }).click();
    await page.getByRole('tab', { name: '搜索', exact: true }).click();
    await page.getByText('等待扫码', { exact: true }).waitFor();
    await page.getByRole('button', { name: '关闭模型设置', exact: true }).click();
    assert.equal(await panel.getByRole('alert').count(), 0);

    historyFailures = 20;
    await page.getByRole('button', { name: '关闭 AI 助手', exact: true }).click();
    await page.getByRole('button', { name: '婚礼 AI 助手', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: '无法连接本机服务' }).waitFor();
    assert.match(await panel.getByRole('alert').innerText(), /聊天记录/);
    historyFailures = 0;
    await panel.getByRole('button', { name: '重新连接', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.ai-session-list [role="alert"]'));
    await panel.getByText('连接恢复测试', { exact: true }).click();
    const composer = page.getByRole('textbox', { name: '发送给 AI 的消息' });
    await composer.fill('检查整体进展');
    await composer.press('Enter');
    await panel.getByRole('alert').filter({ hasText: '无法连接本机服务' }).waitFor();
    assert.match(await panel.getByRole('alert').innerText(), /AI 请求/);
    assert.equal(await composer.inputValue(), '检查整体进展');
    assert.equal(aiCalls, 1, 'Do not automatically resend a generation request');
    console.log('PASS: transient reads recover, login status retries, persistent failure has reconnect, draft retained and AI request sent once');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
