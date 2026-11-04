const fs=require('fs');const S='/tmp/claude-0/-home-claude/11e1c156-8d75-581b-b719-7e3b8e7dcdc7/scratchpad/';
const THREE=require('three');
global.THREE=Object.assign({},THREE);
THREE.WebGLRenderer=undefined;
global.THREE.WebGLRenderer=class{constructor(){this.shadowMap={};this.capabilities={maxTextureSize:8192};}setPixelRatio(){}setSize(){}render(){this.n=(this.n||0)+1}};
global.window=global;global.innerWidth=1280;global.innerHeight=800;global.devicePixelRatio=1;
const noopCtx=new Proxy(function(){},{get:(t,k)=>k==='canvas'?{}:()=>{},set:()=>true});
const els={};
const mk=id=>({id,style:{setProperty(){}},hidden:false,textContent:'',classList:{add(){},remove(){}},handlers:{},
 getContext:()=>noopCtx,addEventListener(t,f){this.handlers[t]=f},setPointerCapture(){},appendChild(){},remove(){},
 getBoundingClientRect:()=>({left:0,top:0,width:200,height:150}),width:0,height:0});
const arms=[mk('arm0'),mk('arm1'),mk('arm2')];
global.document={getElementById:id=>els[id]||(els[id]=mk(id)),createElement:()=>mk('x'),querySelectorAll:()=>arms};
els.data=mk('data');els.data.textContent=fs.readFileSync(S+'game_data.json','utf8');
global.localStorage={getItem:()=>null,setItem(){}};
global.addEventListener=()=>{};
let cb=null;global.requestAnimationFrame=f=>{cb=f};
let timers=[];global.setTimeout=(f,ms)=>{timers.push(f);return 0};
const code=fs.readFileSync(S+'game_all.js','utf8');
const t0=Date.now();
(0,eval)(code);
const tm=timers.shift();tm();
console.log('built in',Date.now()-t0,'ms; loadmsg=',els.loadmsg&&els.loadmsg.textContent,'loading hidden=',els.loading.hidden);
let now=1000;const step=n=>{for(let i=0;i<n;i++){now+=16;const f=cb;cb=null;f(now)}};
step(5);
// simulate a tap at screen centre
const c=els.c.handlers;
const ev={pointerId:1,clientX:640,clientY:400,pointerType:'mouse'};
c.pointerdown(ev);c.pointerup(Object.assign({type:'pointerup'},ev));
step(120);
console.log('score',els.score.textContent,'down',els.down.textContent,'dons',els.dons.textContent);
// several bombs
for(let k=0;k<6;k++){c.pointerdown({...ev,clientX:500+k*50});c.pointerup({...ev,clientX:500+k*50,type:'pointerup'});step(60)}
console.log('score',els.score.textContent,'down',els.down.textContent,'where',els.where.textContent);
// meteor, then nuke (cooldowns are per weapon)
arms[1].handlers.click();c.pointerdown(ev);c.pointerup({...ev,type:'pointerup'});step(150);
console.log('meteor: score',els.score.textContent,'down',els.down.textContent);
arms[2].handlers.click();c.pointerdown(ev);c.pointerup({...ev,type:'pointerup'});step(200);
console.log('nuke: score',els.score.textContent,'down',els.down.textContent);
// trackpad: pinch, two-finger pan, mouse wheel
c.wheel({preventDefault(){},deltaMode:0,deltaX:0,deltaY:8,ctrlKey:true,clientX:640,clientY:400});
c.wheel({preventDefault(){},deltaMode:0,deltaX:6,deltaY:-3,clientX:640,clientY:400});
c.wheel({preventDefault(){},deltaMode:0,deltaX:0,deltaY:100,clientX:640,clientY:400});
step(5);
els.rebuild.handlers.click();
console.log('after reset score',els.score.textContent,'down',els.down.textContent);
