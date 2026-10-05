(()=>{
 const style=document.createElement('style');
 // Inset ring remains visible on scroll containers and narrow sidebar regions.
 style.textContent=`@keyframes trace-breathe{0%,100%{box-shadow:inset 0 0 0 4px #22d3ee;outline-color:#22d3ee}50%{box-shadow:inset 0 0 0 7px #a78bfa;outline-color:#a78bfa}}[data-trace-highlight]{animation:trace-breathe 1.4s ease-in-out infinite!important;outline:3px solid #22d3ee!important;outline-offset:-3px!important;opacity:1!important}@media(prefers-reduced-motion:reduce){[data-trace-highlight]{animation:none!important}}`;
 document.head.append(style);
 const config=JSON.parse(document.querySelector('#trace-locator-config')?.textContent||'{}');
 const origins=new Set([location.origin,config.catalogOrigin].filter(Boolean));
 let generation=0;
 const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert],[aria-hidden="true"]'));
 const find=selector=>selector?[...document.querySelectorAll(selector)].find(visible):undefined;
 const clear=()=>document.querySelectorAll('[data-trace-highlight]').forEach(e=>e.removeAttribute('data-trace-highlight'));
 window.addEventListener('message',async event=>{
  if(!origins.has(event.origin)||event.source!==parent||event.data?.type!=='trace.locate')return;
  const mine=++generation;clear();
  const report=(ok,message)=>{if(mine===generation)parent.postMessage({type:'trace.result',id:event.data.id,ok,message},event.origin);};
  try {
   const entries=await fetch('/locator/entries.json').then(r=>r.json());
   if(mine!==generation)return;
   const entry=entries.find(e=>e.id===event.data.id&&e.surface==='gui');if(!entry){report(false,'未注册的 GUI 入口');return;}
   const wait=async selector=>{const deadline=performance.now()+2500;while(mine===generation&&performance.now()<deadline){const e=find(selector);if(e)return e;await new Promise(r=>setTimeout(r,50));}};
   if(entry.tab){
    await wait('[role=tab]');
    const tab=[...document.querySelectorAll('[role=tab]')].find(e=>visible(e)&&e.textContent.trim()===entry.tab);
    if(!tab){report(false,`请先选择可访问的 Channel，才能进入 ${entry.tab}`);return;}
    if(tab.getAttribute('aria-selected')!=='true')tab.click();
   }
   // Only explicitly marked navigation controls can be clicked. Business targets are never clicked.
   for(const step of entry.locator?.steps??[]){
    if(step.unless&&find(step.unless))continue;
    const target=step.optional?find(step.selector):await wait(step.selector);
    if(mine!==generation)return;
    if(!target){if(step.optional)continue;report(false,'导航入口不可用，请检查登录状态与页面权限');return;}
    if(!target.hasAttribute('data-trace-nav'))throw Error('拒绝点击未声明为导航的控件');
    target.click();await new Promise(r=>setTimeout(r,100));
   }
   const target=await wait(entry.locator?.kind==='region'?`[data-trace-region="${entry.locator.region}"]`:entry.selector);
   if(mine!==generation)return;
   let element=target;
   if(entry.locator?.kind==='region')element=find(`[data-trace-region="${entry.locator.region}"]`)??target;
   let regionOnly=false;
   if(!element){element=find(`[data-trace-region="${entry.locator?.region}"]`);regionOnly=!!element;}
   if(!element){report(false,entry.locator?.unavailable??'对应页面区域尚未出现，请打开操作所在弹层');return;}
   element.dataset.traceHighlight=entry.id;
   element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
   report(!regionOnly,regionOnly?`已标出所属区域，具体控件尚不可用：${entry.locator?.unavailable??entry.id}`:`已定位${entry.locator?.kind==='region'?'页面区域':'控件'} ${entry.id}；${entry.locator?.stateNote??'业务操作未触发'}`);
  }catch(error){report(false,`定位失败：${error.message}`);}
 });
})();
