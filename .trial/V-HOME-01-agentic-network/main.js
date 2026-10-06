import {gsap} from 'gsap';
import './style.css';
const positions=[[50,55],[210,55],[130,155]];
const links=[[0,1],[1,2],[2,0]];
const HUMAN_CYCLE=6, AGENT_CYCLE=HUMAN_CYCLE/10;
const modes=[{name:'Traditional teams',kind:'traditional',radius:14},{name:'Teams with AI',kind:'today',radius:22},{name:'With Agent Colab',kind:'colab',radius:22}];
const timelines=[];
const ns='http://www.w3.org/2000/svg';
function el(tag,attrs,parent){const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));parent.append(node);return node;}
// A fixed timeline owns each actor's breath and transmission; the agent cycle is exactly one tenth.
function animateActor(body,halo,cycle,delay,packet,start,end,stalled=false){
 gsap.set([body,halo],{transformOrigin:'50% 50%'});
 const t=gsap.timeline({repeat:-1,delay});
 t.to(body,{scale:1.13,duration:cycle*.08,ease:'sine.out'},0)
  .fromTo(halo,{scale:.85,opacity:.65},{scale:1.5,opacity:0,duration:cycle*.42,ease:'power1.out'},0)
  .to(body,{scale:1,duration:cycle*.12,ease:'sine.inOut'},stalled?cycle*.42:cycle*.08);
 if(packet){
  t.set(packet,{attr:{cx:start[0],cy:start[1]},opacity:1},cycle*.08);
  if(stalled){
   const mid=start.map((v,k)=>v+(end[k]-v)*.48);
   t.to(packet,{attr:{cx:mid[0],cy:mid[1]},duration:cycle*.15,ease:'none'},cycle*.08)
    .to(packet,{opacity:.3,duration:cycle*.045,repeat:5,yoyo:true},cycle*.23)
    .to(packet,{attr:{cx:end[0],cy:end[1]},opacity:1,duration:cycle*.22,ease:'none'},cycle*.5);
  }else t.to(packet,{attr:{cx:end[0],cy:end[1]},duration:cycle*.64,ease:'none'},cycle*.08);
  t.set(packet,{opacity:0},cycle*.72);
 }
 t.to({}, {duration:.001},cycle-.001);timelines.push(t);
}
modes.forEach(mode=>{
 const article=document.createElement('article');article.className=mode.kind;
 article.innerHTML='<svg viewBox="0 0 280 200" role="img" aria-label="'+mode.name+'"></svg><h2>'+mode.name+'</h2>';
 document.querySelector('.networks').append(article);const svg=article.querySelector('svg');
 const point=i=>{const [x,y]=positions[i];return mode.kind==='colab'?[x+20,y+16]:[x,y]};
 const edges=el('g',{},svg),packets=el('g',{},svg);
 links.forEach(([a,b])=>el('path',{d:'M'+point(a)+' L'+point(b),class:'edge','stroke-width':mode.kind==='colab'?9:1},edges));
 positions.forEach(([x,y],i)=>{
  const group=el('g',{transform:'translate('+x+' '+y+')'},svg);
  const halo=el('circle',{r:mode.radius+5,class:'halo'},group);
  const human=el('g',{'data-actor':'human','data-cycle':HUMAN_CYCLE},group);
  el('circle',{r:mode.radius,class:'human'},human);
  const icon=el('g',{transform:'scale('+mode.radius/25+')'},human);
  el('path',{d:'M-8 9 C-8 -1 8 -1 8 9 M-4 -7 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0',class:'person-icon'},icon);
  const start=point(i),end=point((i+1)%3);
  const packet=el('circle',{cx:start[0],cy:start[1],r:mode.kind==='colab'?3.8:2.4,class:'packet',opacity:0},packets);
  animateActor(human,halo,HUMAN_CYCLE,i*.4,mode.kind==='colab'?null:packet,start,end,mode.kind==='today');
  if(mode.kind!=='traditional'){
   const agentGroup=el('g',{transform:'translate(20 16)'},group);
   const agentHalo=el('circle',{r:15,class:'halo agent-halo'},agentGroup);
   const agent=el('g',{'data-actor':'agent','data-cycle':AGENT_CYCLE},agentGroup);
   el('circle',{r:12,class:'agent'},agent);
   el('path',{d:'M0 -7 L2 -2 L7 0 L2 2 L0 7 L-2 2 L-7 0 L-2 -2 Z',class:'agent-icon'},agent);
   animateActor(agent,agentHalo,AGENT_CYCLE,i*.04,mode.kind==='colab'?packet:null,start,end);
  }
 });
});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
function applyPause(){timelines.forEach(t=>t.paused(paused||document.hidden));document.querySelector('#pause').textContent=paused?'Play animation':'Pause animation';}
applyPause();document.querySelector('#pause').onclick=()=>{paused=!paused;applyPause()};
reduced.addEventListener('change',e=>{paused=e.matches;applyPause()});
document.addEventListener('visibilitychange',applyPause);
