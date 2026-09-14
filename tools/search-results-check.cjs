#!/usr/bin/env node
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { homedir, tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

let playwright=null;
for(const candidate of [
  'playwright',
  join(dirname(dirname(process.execPath)),'node_modules/playwright'),
  join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),
]){try{playwright=require(candidate);break;}catch{}}
if(!playwright)throw new Error('Playwright 未安装；请在 Codex Desktop 工作区运行');

const extensionPath=resolve(process.argv[2]||'.');
const profile=mkdtempSync(join(tmpdir(),'fu-nav-search-results-'));
const seed=JSON.parse(readFileSync(join(extensionPath,'data/seed.json'),'utf8'));
const assert=(value,message)=>{if(!value)throw new Error(message);};
const storage=(page,keys)=>page.evaluate(query=>new Promise(resolveGet=>chrome.storage.local.get(query,resolveGet)),keys);

function findById(config,id){
  for(const group of config.groups||[]){
    const visit=(items,path)=>{for(const item of items||[]){const next=[...path,item.name||item.id];if(item.id===id)return{item,path:next};if(item.type==='folder'){const hit=visit(item.items,next);if(hit)return hit;}}return null;};
    const hit=visit(group.items,[group.name]);if(hit)return hit;
  }
  return null;
}

(async()=>{
  const errors=[];
  const context=await playwright.chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,viewport:{width:1024,height:768},
    args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`],
  });
  try{
    let worker=context.serviceWorkers()[0];
    if(!worker)worker=await context.waitForEvent('serviceworker',{timeout:10000});
    const extensionId=new URL(worker.url()).host;
    const config=structuredClone(seed);
    config.settings={...config.settings,onboarded:true,activeMode:null,modes:[],locked:true,treeOpen:{'g-search-target':true},showClock:false,showWeather:false,showStatus:false,widgets:[],hiddenAgentCards:['reminder','calendar','digest'],background:{enabled:false,mode:'none'},bookmarkRecoveryV326:true,bookmarkStructureRecoveryV327:true};
    config.favOrder=[];
    config.groups=[
      {id:'g-search-source',name:'搜索源',icon:'search',color:'#4a55f3',items:[
        {id:'i-search-manage',name:'搜索管理测试',url:'https://example.com/search-original',note:'保留备注',tags:['保留标签'],aliases:['搜索别名'],icon:'',frame:true},
        {id:'i-search-group',name:'搜索分组投放',url:'https://example.com/search-group',note:'分组备注',tags:['分组标签'],icon:''},
      ]},
      {id:'g-search-target',name:'目标收藏夹',icon:'folder',color:'#14b8a6',items:[
        {id:'f-search-target',type:'folder',name:'目标文件夹',icon:'folder',items:[]},
      ]},
    ];
    config.savedAt=Date.now();
    await worker.evaluate(cfg=>new Promise(resolveSet=>chrome.storage.local.set({fn_config:cfg},resolveSet)),config);

    const page=await context.newPage();
    page.setDefaultTimeout(6000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`chrome-extension://${extensionId}/newtab.html?e2e=search-result-management`,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('.lay-fusion');
    const search=page.getByLabel('搜索或询问');
    await search.fill('搜索管理测试');
    let result=page.locator('.fx-res[data-iid="i-search-manage"]');
    await result.waitFor();

    await result.dragTo(page.getByRole('button',{name:'固定第一条搜索结果到首页（也可拖放）'}));
    await page.waitForFunction(()=>new Promise(resolveGet=>chrome.storage.local.get(['fn_config'],value=>{
      const cfg=value.fn_config,item=cfg.groups[0].items[0];
      resolveGet(item.fav===true&&cfg.favOrder.filter(id=>id==='i-search-manage').length===1);
    })));
    await page.locator('.fx-fav[data-iid="i-search-manage"]').waitFor();
    await page.getByLabel('搜索或询问').fill('搜索管理测试');
    await page.getByRole('button',{name:'固定第一条搜索结果到首页（也可拖放）'}).click();
    const repeatedHome=(await storage(page,['fn_config'])).fn_config;
    assert(repeatedHome.favOrder.filter(id=>id==='i-search-manage').length===1,'重复首页投放产生了重复顺序');
    await page.getByLabel('搜索或询问').fill('搜索管理测试');
    result=page.locator('.fx-res[data-iid="i-search-manage"]');

    const folderTarget=page.locator('.fx-navfolder[data-folder-id="f-search-target"]');
    await result.dragTo(folderTarget);
    await page.waitForFunction(()=>new Promise(resolveGet=>chrome.storage.local.get(['fn_config'],value=>{
      resolveGet(value.fn_config.groups[1].items[0].items.some(item=>item.id==='i-search-manage'));
    })));
    await page.getByLabel('搜索或询问').fill('搜索管理测试');
    result=page.locator('.fx-res[data-iid="i-search-manage"]');
    await result.dragTo(page.locator('.fx-navfolder[data-folder-id="f-search-target"]'));
    await page.getByText('已经位于「目标文件夹」',{exact:true}).waitFor();

    await page.getByLabel('搜索或询问').fill('搜索管理测试');
    await page.getByRole('button',{name:'编辑搜索结果'}).click();
    assert(!(await page.evaluate(()=>document.body.classList.contains('editing'))),'局部编辑态错误解锁了全局编辑模式');
    await page.getByRole('button',{name:'编辑 搜索管理测试'}).click();
    const editor=page.getByRole('dialog',{name:'编辑网站'});
    await editor.getByRole('textbox',{name:'名称',exact:true}).fill('搜索管理已编辑');
    await editor.getByRole('textbox',{name:'网址',exact:true}).fill('https://example.com/search-edited');
    await editor.getByRole('textbox',{name:'备注',exact:true}).fill('编辑后的备注');
    await editor.getByRole('button',{name:'保存',exact:true}).click();
    await page.waitForFunction(()=>new Promise(resolveGet=>chrome.storage.local.get(['fn_config'],value=>{
      const stack=value.fn_config.groups.flatMap(group=>group.items||[]);let match=null;
      while(stack.length){const item=stack.shift();if(item.id==='i-search-manage'){match=item;break;}if(item.type==='folder')stack.push(...(item.items||[]));}
      resolveGet(match?.name==='搜索管理已编辑');
    })));

    await page.getByLabel('搜索或询问').fill('搜索分组投放');
    let groupResult=page.locator('.fx-res[data-iid="i-search-group"]');
    const groupTarget=page.locator('.fx-navitem[data-gid="g-search-target"]:not(.fx-navfolder)');
    await groupResult.dragTo(groupTarget);
    await page.waitForFunction(()=>new Promise(resolveGet=>chrome.storage.local.get(['fn_config'],value=>{
      resolveGet(value.fn_config.groups[1].items.some(item=>item.id==='i-search-group'));
    })));
    await page.getByLabel('搜索或询问').fill('搜索分组投放');
    groupResult=page.locator('.fx-res[data-iid="i-search-group"]');
    await groupResult.dragTo(groupTarget);
    await page.getByText('已经位于「目标收藏夹」',{exact:true}).waitFor();

    const final=(await storage(page,['fn_config'])).fn_config;
    const hit=findById(final,'i-search-manage');
    const duplicates=final.groups.flatMap(group=>{const ids=[];const walk=items=>(items||[]).forEach(item=>{if(item.id==='i-search-manage')ids.push(item.id);if(item.type==='folder')walk(item.items);});walk(group.items);return ids;});
    assert(duplicates.length===1,`收藏被复制：${duplicates.length}`);
    assert(hit.path.join('/')==='目标收藏夹/目标文件夹/搜索管理已编辑',`目标路径错误：${hit.path.join('/')}`);
    assert(hit.item.fav===true&&final.favOrder.filter(id=>id==='i-search-manage').length===1,'首页固定状态丢失或重复');
    assert(hit.item.note==='编辑后的备注'&&hit.item.tags[0]==='保留标签'&&hit.item.frame===true,'编辑导致元数据丢失');
    assert(final.settings.locked===true,'局部编辑态修改了全局锁定设置');
    assert(errors.length===0,`console errors: ${errors.join(' | ')}`);
    console.log(JSON.stringify({ok:true,homePinned:true,repeatedHomeIdempotent:true,targetPath:hit.path,groupDrop:true,sameTargetNoop:true,edited:true,unique:true,globalLocked:true}));
  }finally{await context.close();}
})().catch(error=>{console.error(`search-results-check: ${error.message}`);process.exitCode=1;}).finally(()=>rmSync(profile,{recursive:true,force:true}));
