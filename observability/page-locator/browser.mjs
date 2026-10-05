export function mountLocator({enabled=false, allowedOrigins=[], getOperations, timeoutMs=2500}={}){
 if(!enabled)return ()=>{};
 if(typeof getOperations!=="function")throw Error("getOperations is required");
 const origins=new Set(allowedOrigins.map(value=>{const url=new URL(value);if(url.origin!==value)throw Error("Use exact allowed origins");return value;}));
 if(!origins.size)throw Error("An explicit allowed origin is required");
 const style=document.createElement('style');
 // Inset ring remains visible on scroll containers and narrow sidebar regions.
 style.textContent=`@keyframes trace-breathe{0%,100%{box-shadow:inset 0 0 0 4px #22d3ee;outline-color:#22d3ee}50%{box-shadow:inset 0 0 0 7px #a78bfa;outline-color:#a78bfa}}[data-trace-highlight]{animation:trace-breathe 1.4s ease-in-out infinite!important;outline:3px solid #22d3ee!important;outline-offset:-3px!important;opacity:1!important}@media(prefers-reduced-motion:reduce){[data-trace-highlight]{animation:none!important}}`;
 document.head.append(style);
 let generation=0;
 const visible=e=>!!(e&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert],[aria-hidden="true"]'));
 const find=selector=>selector?[...document.querySelectorAll(selector)].find(visible):undefined;
 const clear=()=>document.querySelectorAll('[data-trace-highlight]').forEach(e=>e.removeAttribute('data-trace-highlight'));
 const listener=async event=>{
  if(!origins.has(event.origin)||event.source!==parent||event.data?.type!=='trace.locate'||typeof event.data.id!=='string')return;
  const mine=++generation;clear();
  const report=(ok,message)=>{if(mine===generation)parent.postMessage({type:'trace.result',id:event.data.id,ok,message},event.origin);};
  try {
   const loaded=await getOperations();
   const entries=Array.isArray(loaded)?loaded:loaded.operations;
   if(mine!==generation)return;
   const operation=entries.find(e=>e.id===event.data.id&&e.entry?.kind==='gui');const entry=operation?{...operation,...operation.entry}:null;if(!entry){report(false,'Unregistered GUI entry');return;}
   const wait=async selector=>{const deadline=performance.now()+timeoutMs;while(mine===generation&&performance.now()<deadline){const e=find(selector);if(e)return e;await new Promise(r=>setTimeout(r,50));}};
   if(entry.tab){
    await wait('[role=tab]');
    if(mine!==generation)return;
    const tab=[...document.querySelectorAll('[role=tab]')].find(e=>visible(e)&&e.textContent.trim()===entry.tab);
    if(!tab){report(false,`Open an accessible page before navigating to ${entry.tab}`);return;}
    if(tab.getAttribute('aria-selected')!=='true')tab.click();
   }
   // Only explicitly marked navigation controls can be clicked. Business targets are never clicked.
   for(const step of entry.locator?.steps??[]){
    if(step.unless&&find(step.unless))continue;
    const target=step.optional?find(step.selector):await wait(step.selector);
    if(mine!==generation)return;
    if(!target){if(step.optional)continue;report(false,'Navigation is unavailable; check page access and login');return;}
    if(!target.hasAttribute('data-trace-nav'))throw Error('Refusing to click an undeclared navigation control');
    target.click();await new Promise(r=>setTimeout(r,100));
   }
   const selector=entry.selector||`[data-trace-target~="${CSS.escape(entry.target||entry.id)}"]`;
   const target=await wait(entry.locator?.kind==='region'?`[data-trace-region="${CSS.escape(entry.locator.region)}"]`:selector);
   if(mine!==generation)return;
   let element=target;
   if(entry.locator?.kind==='region')element=find(`[data-trace-region="${entry.locator.region}"]`)??target;
   let regionOnly=false;
   if(!element){element=find(`[data-trace-region="${entry.locator?.region}"]`);regionOnly=!!element;}
   if(!element){report(false,entry.locator?.unavailable??'Target is unavailable; open its dialog or select the required resource');return;}
   element.dataset.traceHighlight=entry.id;
   element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
   report(!regionOnly,regionOnly?`Owning region highlighted; specific control unavailable: ${entry.locator?.unavailable??entry.id}`:`Located ${entry.locator?.kind==='region'?'region':'control'} ${entry.id}; ${entry.locator?.stateNote??'business action was not executed'}`);
  }catch(error){report(false,`Location failed: ${error.message}`);}
 };
 window.addEventListener('message',listener);
 return ()=>{generation++;window.removeEventListener('message',listener);clear();style.remove();};
}

