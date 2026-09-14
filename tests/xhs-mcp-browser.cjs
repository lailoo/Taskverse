// Local fixtures only: never reads or writes the actual project, chats or account.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {makeInitialProject}=require('../src/lib/tasks.ts');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || "playwright");
const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1040}});page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let loggedIn=false,writes=0,hold=false,release;
  let chat={id:'station-fixture',revision:0,messages:[],summary:'',memory:{},title:'小红书站内测试',updatedAt:new Date().toISOString()};
  const source={title:'花园婚礼',url:'https://www.xiaohongshu.com/explore/66abcdef0123456789012345?xsec_token=fixture&xsec_source=pc_search',snippet:'',author:'花园日记',image:'https://sns-webpic-qc.xhscdn.com/fixture-cover',likes:'42'};
  const queries=[],requests=[];
  await page.route("**/api/**", route => route.abort("blockedbyclient"));
  await page.route('**/api/project',r=>{if(r.request().method()==='PUT')writes++;return r.fulfill({json:{project:makeInitialProject(),revision:1}})});
  await page.route('**/api/chats*',r=>{
   if(r.request().method()==='PUT'){chat={...chat,...r.request().postDataJSON(),revision:chat.revision+1};return r.fulfill({json:chat});}
   return r.fulfill({json:r.request().method()==='POST'||new URL(r.request().url()).searchParams.has('id')?chat:[chat]});
  });
  await page.route('**/api/ai/settings',r=>r.fulfill({json:{provider:'openai',baseUrl:'https://api.openai.com/v1',model:'fixture',keyConfigured:true}}));
  await page.route('**/api/search/settings',r=>{
   if(r.request().method()==='POST'){assert.equal(r.request().postDataJSON().provider,'xiaohongshu-mcp');assert(loggedIn);}
   return r.fulfill({json:{provider:'xiaohongshu-mcp',configured:true,message:'已保存'}});
  });
  await page.route('**/api/search/login',r=>r.fulfill({json:{connected:true,loggedIn,username:loggedIn?'测试用户':'',...(r.request().postDataJSON().action==='qrcode'&&!loggedIn?{qr:'data:image/png;base64,'+pixel,expiresAt:Date.now()+240000}:{})}}));
  await page.route('**/api/search',r=>{const data=r.request().postDataJSON();queries.push(data);return r.fulfill({json:{provider:'xiaohongshu-mcp',query:data.query,searchedAt:new Date().toISOString(),sources:[source]}})});
  await page.route('**/api/search/note',r=>{assert.equal(r.request().postDataJSON().url,source.url);return r.fulfill({json:{...source,content:'先确认雨天备用场地，再确定来宾座椅和签到动线。',snippet:'先确认雨天备用场地。',images:[source.image]}})});
  await page.route(url=>url.hostname.endsWith('.xhscdn.com'),r=>r.fulfill({contentType:'image/png',body:Buffer.from(pixel,'base64')}));
  await page.route('**/api/ai',async r=>{
   if(r.request().method()==='GET')return r.fulfill({json:{configured:true}});
   const data=r.request().postDataJSON();requests.push(data);
   if(hold){hold=false;await new Promise(resolve=>release=resolve);}
   return r.fulfill({json:{reply:'可以先阅读笔记，再讨论适合当前计划的做法。',tasks:[],followUps:[]}});
  });
  await page.addInitScript(()=>{localStorage.setItem('wedding-map-pets','false');localStorage.setItem('wedding-map-theme','desert');localStorage.setItem('wedding-map-language','zh');});
  await page.goto(process.env.XHS_TEST_URL||'http://127.0.0.1:3011/');
  await page.getByRole('button',{name:'婚礼 AI 助手',exact:true}).click();
  await page.getByRole('button',{name:'新建会话',exact:true}).last().click();
  const panel=page.locator('.ai-chat'),composer=page.getByRole('textbox',{name:'发送给 AI 的消息'});
  await page.waitForTimeout(800);const baseline=writes;
  await page.getByRole('button',{name:'小红书搜索',exact:true}).click();
  await page.getByRole('button',{name:'搜索设置',exact:true}).click();
  const settings=page.getByRole('dialog');
  await settings.getByText('等待扫码',{exact:true}).waitFor();
  assert.equal(await settings.getByLabel('搜索方式').inputValue(),'xiaohongshu-mcp');
  assert.equal(await settings.getByLabel('Tavily API Key',{exact:true}).count(),0);
  await settings.getByRole('button',{name:'扫码登录',exact:true}).click();
  await settings.getByAltText('小红书登录二维码').waitFor();
  fs.mkdirSync('/tmp/wedding-xhs-check',{recursive:true});
  await page.screenshot({path:'/tmp/wedding-xhs-check/login-fixture.png'});
  loggedIn=true;await settings.getByRole('button',{name:'检查登录',exact:true}).click();
  await settings.getByRole('button',{name:'保存并使用',exact:true}).click();await settings.waitFor({state:'hidden'});
  await composer.fill('花园婚礼');await composer.press('Enter');
  await panel.getByText('可以先阅读笔记，再讨论适合当前计划的做法。',{exact:true}).waitFor();
  assert.equal(requests[0].search.provider,'xiaohongshu-mcp');
  assert.equal(await panel.locator('.ai-source-card').count(),1);
  await panel.getByRole('button',{name:'读取笔记',exact:true}).click();
  await panel.getByText('查看笔记正文',{exact:true}).waitFor();
  assert.equal(chat.messages.find(m=>m.search).search.sources[0].content,'先确认雨天备用场地，再确定来宾座椅和签到动线。');
  await panel.getByText('查看笔记正文',{exact:true}).click();
  await panel.getByLabel('选择笔记：花园婚礼').check();
  await panel.getByRole('button',{name:'根据所选笔记生成任务建议'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.ai-message.assistant:not(.ai-streaming)').length===2);
  assert(requests.at(-1).messages.findLast(m=>m.role==='user').content.includes('雨天备用场地'));
  assert.equal(queries.length,1);
  assert.equal(writes,baseline);
  // A queued search retains its mode even if the composer is changed afterwards.
  await page.getByRole('button',{name:'小红书搜索',exact:true}).click();
  hold=true;await composer.fill('普通讨论');await composer.press('Enter');
  await page.getByRole('button',{name:'停止生成',exact:true}).waitFor();
  await page.getByRole('button',{name:'小红书搜索',exact:true}).click();
  await composer.fill('秋季婚礼');await composer.press('Enter');
  await panel.getByRole('region',{name:'等待发送的消息'}).getByText('秋季婚礼',{exact:false}).waitFor();
  await page.getByRole('button',{name:'小红书搜索',exact:true}).click();
  release();
  await page.waitForFunction(()=>document.querySelectorAll('.ai-source-card').length===2);
  assert.equal(queries.at(-1).query,'秋季婚礼');
  await page.screenshot({path:'/tmp/wedding-xhs-check/station.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/wedding-xhs-check/station-mobile.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS: MCP default, QR/login/save, note covers and details, persisted content, source follow-up, queue mode, no task writes, mobile');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
