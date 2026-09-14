// Uses isolated in-memory chats, project and search/model fixtures; no private data or keys leave the app.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { makeInitialProject } = require('../src/lib/tasks.ts');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = '/tmp/wedding-xhs-check'; fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1040}});
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let chat = {id:'search-test',revision:0,messages:[],summary:'',memory:{},title:'搜索婚礼布置',updatedAt:new Date().toISOString()};
  let configured=false, settingsFail=true, searchFail=false, aiFail=false, writes=0;
  const queries=[], aiRequests=[];
  const sources=[1,2].map((id)=>({title:`户外婚礼参考 ${id}`,url:`https://www.xiaohongshu.com/explore/66abcdef012345678901234${id}`,snippet:`参考 ${id}：木色桌椅、白色花材与来宾动线。`}));
  await page.route("**/api/**", route => route.abort("blockedbyclient"));
  await page.route('**/api/project',r=>{if(r.request().method()==='PUT')writes++;return r.fulfill({json:{project:makeInitialProject(),revision:1}})});
  await page.route('**/api/chats*',r=>{
    if(r.request().method()==='PUT'){const data=r.request().postDataJSON();chat={...chat,...data,revision:chat.revision+1};return r.fulfill({json:chat});}
    if(r.request().method()==='POST'||new URL(r.request().url()).searchParams.has('id'))return r.fulfill({json:chat});
    return r.fulfill({json:[chat]});
  });
  await page.route('**/api/ai/settings',r=>r.fulfill({json:{provider:'openai',baseUrl:'https://api.openai.com/v1',model:'fixture',keyConfigured:true}}));
  await page.route('**/api/search/settings',r=>{
    if(r.request().method()==='GET')return r.fulfill({json:{provider:'tavily',configured}});
    if(settingsFail)return r.fulfill({status:502,json:{error:'搜索密钥验证失败，请检查搜索设置'}});
    configured=true;return r.fulfill({json:{configured:true,message:'搜索连接测试通过，设置已保存'}});
  });
  await page.route('**/api/search',r=>{
    const data=r.request().postDataJSON();queries.push(data);assert.deepEqual(Object.keys(data),['query']);
    if(searchFail)return r.fulfill({status:502,json:{error:'搜索服务暂时不可用，请稍后重试'}});
    return r.fulfill({json:{query:data.query,provider:'tavily',searchedAt:new Date().toISOString(),sources:data.query==='无结果'?[]:sources}});
  });
  let release;
  await page.route('**/api/ai',async r=>{
    if(r.request().method()==='GET')return r.fulfill({json:{configured:true}});
    const data=r.request().postDataJSON();aiRequests.push(data);
    if(aiFail){await new Promise(resolve=>release=resolve);return r.fulfill({status:502,json:{error:'模型暂时不可用'}}).catch(()=>{});}
    const latest=data.messages.findLast(m=>m.role==='user').content;
    return r.fulfill({json:{reply:'可以参考白色花材，并先确认场地动线。',tasks:latest.includes('勾选')?[{title:'确认花材和场地动线',parentId:'venue',description:'来自所选公开笔记',owner:'',due:''}]:[],followUps:[]}});
  });
  await page.addInitScript(()=>{localStorage.setItem('wedding-map-pets','false');localStorage.setItem('wedding-map-theme','desert');});
  await page.goto(process.env.XHS_TEST_URL||'http://127.0.0.1:3011/');
  await page.getByRole('button',{name:'婚礼 AI 助手',exact:true}).click();
  await page.getByRole('button',{name:'新建会话',exact:true}).last().click();
  const chatPanel=page.locator('.ai-chat');
  const composer=page.getByRole('textbox',{name:'发送给 AI 的消息'});
  await page.waitForTimeout(800);
  const baselineWrites=writes;
  await page.getByRole('button',{name:'小红书搜索',exact:true}).click();
  await composer.fill('户外婚礼布置');await composer.press('Enter');
  const settings=page.getByRole('dialog');
  await settings.getByRole('tab',{name:'搜索',exact:true}).waitFor();
  assert.equal(await settings.getByRole('tab',{name:'搜索',exact:true}).getAttribute('aria-selected'),'true');
  await settings.getByLabel('Tavily API Key',{exact:true}).fill('test-search-key');
  await settings.getByRole('button',{name:'测试并保存',exact:true}).click();
  await settings.getByRole('alert').filter({hasText:'搜索密钥验证失败'}).waitFor();
  settingsFail=false;
  await settings.getByRole('button',{name:'测试并保存',exact:true}).click();
  await settings.waitFor({state:'hidden'});
  await composer.press('Enter');
  await chatPanel.getByText('可以参考白色花材，并先确认场地动线。',{exact:true}).waitFor();
  assert.equal(queries.length,1);assert.equal(aiRequests[0].search.sources.length,2);
  assert.equal(await chatPanel.locator('.ai-source-card').count(),2);
  const link=chatPanel.getByRole('link',{name:'户外婚礼参考 1'});
  assert.equal(await link.getAttribute('target'),'_blank');assert((await link.getAttribute('rel')).includes('noopener'));
  await chatPanel.getByLabel('选择笔记：户外婚礼参考 1').check();
  await chatPanel.getByRole('button',{name:'根据所选笔记生成任务建议'}).click();
  await chatPanel.getByLabel('选择任务：确认花材和场地动线').waitFor();
  const selectionRequest=aiRequests.at(-1).messages.findLast(m=>m.role==='user').content;
  assert(selectionRequest.includes('户外婚礼参考 1'));assert(!selectionRequest.includes('户外婚礼参考 2'));
  assert.equal(queries.length,1,'source follow-up does not search again');
  assert.equal(writes,baselineWrites,'search and suggestions never apply tasks without confirmation');
  await chatPanel.getByText('跳过未确认项，继续后续对话',{exact:true}).click();
  await page.screenshot({path:output+'/sources.png'});
  await page.reload();await page.getByRole('button',{name:'婚礼 AI 助手',exact:true}).click();
  await page.locator('.ai-session-row').first().click();
  await chatPanel.locator('.ai-source-card').first().waitFor();
  assert.equal(await chatPanel.locator('.ai-source-card').count(),2,'sources survive session reopening');
  await page.getByRole('button',{name:'小红书搜索',exact:true}).click();
  searchFail=true;const before=aiRequests.length;
  await composer.fill('搜索失败');await composer.press('Enter');
  await chatPanel.getByRole('alert').filter({hasText:'搜索服务暂时不可用'}).waitFor();
  assert.equal(aiRequests.length,before,'failed search must not ask the model to invent a search summary');
  searchFail=false;
  await composer.fill('无结果');await composer.press('Enter');
  await chatPanel.getByText(/没有找到与「无结果」匹配/).waitFor();
  assert.equal(aiRequests.length,before,'empty search does not invent notes');
  aiFail=true;
  await composer.fill('沙滩婚礼');await composer.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.ai-source-card').length===4);
  await chatPanel.getByRole('button',{name:'停止生成',exact:true}).click();
  release?.();
  await chatPanel.getByRole('alert').filter({hasText:'已停止生成'}).waitFor();
  assert.equal(chat.messages.filter(m=>m.search?.sources?.length).length,2,'stopping AI retains acquired search results');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:output+'/mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
  console.log('PASS: setup validation, source cards, selected-note task suggestions, no task writes, saved history, empty/error handling, stop preserves sources, mobile');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
