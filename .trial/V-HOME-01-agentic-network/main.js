import {gsap} from 'gsap';
import './style.css';
const positions=[[80,80],[270,65],[300,250],[95,270],[185,175]];
const links=[[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]];
const modes=[{name:'Traditional teams',kind:'traditional',radius:15,cycle:5.4,travel:2.2},{name:'Teams with AI',kind:'today',radius:25,cycle:5.4,travel:3.8},{name:'Teams with Agent Colab',kind:'colab',radius:25,cycle:1.65,travel:.72}];
const timelines=[];
const ns='http://www.w3.org/2000/svg';
function el(tag,attrs,parent){const node=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));parent.append(node);return node;}
modes.forEach((mode,index)=>{
 const article=document.createElement('article');article.className=mode.kind;
 article.innerHTML=`<span class="number">0${index+1}</span><svg viewBox="0 0 380 350" role="img" aria-label="${mode.name}"></svg><h2>${mode.name}</h2>`;
 document.querySelector('.networks').append(article);const svg=article.querySelector('svg');
 const point=i=>{const [x,y]=positions[i];return mode.kind==='colab'?[x+23,y+20]:[x,y]};
 const edges=el('g',{},svg), packets=el('g',{},svg);
 links.forEach(([a,b])=>{const p=point(a),q=point(b);el('path',{d:`M${p} L${q}`,class:'edge','stroke-width':mode.kind==='colab'?4:1},edges)});
 positions.forEach(([x,y],i)=>{
  const group=el('g',{transform:`translate(${x} ${y})`},svg);
  const halo=el('circle',{r:mode.radius+7,class:'halo'},group);
  const body=el('g',{},group);el('circle',{r:mode.radius,class:'human'},body);
  const s=mode.radius/25;el('path',{d:`M${-8*s} ${9*s} C${-8*s} ${-1*s} ${8*s} ${-1*s} ${8*s} ${9*s} M${-4*s} ${-7*s} a${4*s} ${4*s} 0 1 0 ${8*s} 0 a${4*s} ${4*s} 0 1 0 ${-8*s} 0`,class:'person-icon'},body);
  if(mode.kind!=='traditional'){el('circle',{cx:23,cy:20,r:13,class:'agent'},body);el('path',{d:'M23 12 L25 18 L31 20 L25 22 L23 28 L21 22 L15 20 L21 18 Z',class:'agent-icon'},body)}
  // Each fixed-size timeline owns one breath and its outgoing packet. No independent packet timer.
  const timeline=gsap.timeline({repeat:-1,delay:i*(mode.kind==='colab'?.23:.48)});
  gsap.set(body,{transformOrigin:'50% 50%'});gsap.set(halo,{transformOrigin:'50% 50%'});
  timeline.to(body,{scale:1.09,duration:.28,ease:'sine.out'},0)
   .fromTo(halo,{scale:.85,opacity:.6},{scale:1.5,opacity:0,duration:mode.kind==='colab'?.7:1.4,ease:'power1.out'},0)
   .to(body,{scale:1,duration:.4,ease:'sine.inOut'},mode.kind==='today'?1.9:.28);
  const outgoing=links.find(([a])=>a===i)||[i,0];const start=point(i),end=point(outgoing[1]);
  const packet=el('circle',{cx:start[0],cy:start[1],r:mode.kind==='colab'?4:2.8,class:'packet',opacity:0},packets);
  timeline.set(packet,{attr:{cx:start[0],cy:start[1]},opacity:1},.28);
  if(mode.kind==='today'){
   const mid=start.map((v,k)=>v+(end[k]-v)*.44);
   timeline.to(packet,{attr:{cx:mid[0],cy:mid[1]},duration:.7,ease:'none'},.28)
    .to(packet,{opacity:.35,duration:.22,repeat:5,yoyo:true},.98)
    .to(packet,{attr:{cx:end[0],cy:end[1]},opacity:1,duration:1.1,ease:'none'},2.52);
  }else timeline.to(packet,{attr:{cx:end[0],cy:end[1]},duration:mode.travel,ease:'none'},.28);
  timeline.set(packet,{opacity:0},mode.kind==='today'?3.62:.28+mode.travel)
   .to({}, {duration:.01},mode.cycle-.01);
  timelines.push(timeline);
 });
});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches;
function applyPause(){timelines.forEach(t=>t.paused(paused));document.querySelector('#pause').textContent=paused?'Play animation':'Pause animation';}
applyPause();document.querySelector('#pause').onclick=()=>{paused=!paused;applyPause()};
reduced.addEventListener('change',e=>{paused=e.matches;applyPause()});
document.addEventListener('visibilitychange',()=>timelines.forEach(t=>t.paused(document.hidden||paused)));
