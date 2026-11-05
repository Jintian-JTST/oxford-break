// Headless smoke test: node test/run.js <dir holding game_all.js and game_data.json> (needs three@0.128.0).
const fs=require('fs'),path=require('path');const S=path.resolve(process.argv[2]||path.join(__dirname,'..','dist'))+path.sep;
const THREE=require('three');
global.THREE=Object.assign({},THREE);
THREE.WebGLRenderer=undefined;
global.THREE.WebGLRenderer=class{constructor(){this.shadowMap={};this.capabilities={maxTextureSize:8192};}setPixelRatio(){}setSize(){}render(){this.n=(this.n||0)+1}clearDepth(){}};
global.window=global;global.innerWidth=1280;global.innerHeight=800;global.devicePixelRatio=1;
const noopCtx=new Proxy(function(){},{get:(t,k)=>k==='canvas'?{}:()=>noopCtx,set:()=>true});
const els={};
// every element keeps all its listeners; fire(type, event) calls them in order
const mk=id=>({id,style:{setProperty(){}},hidden:false,textContent:'',className:'',offsetWidth:120,classList:{add(){},remove(){}},handlers:{},
 getContext:()=>noopCtx,addEventListener(t,f){(this.handlers[t]=this.handlers[t]||[]).push(f)},setPointerCapture(){},appendChild(){},remove(){},
 fire(t,e){(this.handlers[t]||[]).forEach(f=>f(Object.assign({preventDefault(){},type:t},e)))},
 getBoundingClientRect:()=>({left:0,top:0,width:200,height:150}),width:0,height:0,set onclick(f){this.handlers.click=[f]}});
const arms=[mk('arm0'),mk('arm1'),mk('arm2')];
global.document={addEventListener(){},getElementById:id=>els[id]||(els[id]=mk(id)),createElement:()=>mk('x'),querySelectorAll:()=>arms,body:mk('body')};
els.data=mk('data');els.data.textContent=fs.readFileSync(S+'game_data.json','utf8');
global.localStorage={getItem:()=>null,setItem(){}};
global.location={search:'',pathname:'/'};global.history={replaceState(){}};
const win=mk('window');global.addEventListener=(t,f)=>win.addEventListener(t,f);
let cb=null;global.requestAnimationFrame=f=>{cb=f};
let timers=[];global.setTimeout=(f,ms)=>{timers.push(f);return 0};
const code=fs.readFileSync(S+'game_all.js','utf8');
const t0=Date.now();
(0,eval)(code);
const tm=timers.shift();tm();
console.log('built in',Date.now()-t0,'ms; loadmsg=',els.loadmsg&&els.loadmsg.textContent,'loading hidden=',els.loading.hidden,'mode',document.body.className);
let now=1000;const step=n=>{for(let i=0;i<n;i++){now+=16;const f=cb;cb=null;f(now)}};
step(30);
const c=els.c;
const ev={pointerId:1,clientX:640,clientY:400,pointerType:'mouse',button:0};
const tap=(x)=>{c.fire('pointerdown',{...ev,clientX:x});c.fire('pointerup',{...ev,clientX:x})};

// --- bombing: booklet, then a timed round that starts with the first bomb, then the summary
els.todNight.fire('click');step(30);console.log('night on: lamps built');
els.playBomb.fire('click');console.log('mode',document.body.className,'booklet shown',!els.guide.hidden,'|',els.gT.textContent);
tap(640);step(30);console.log('tap behind the booklet: score',els.score.textContent);
els.gStart.fire('click');step(30);console.log('before the first bomb:',els.btime.textContent);
tap(640);step(120);
console.log('bomb: score',els.score.textContent,'down',els.down.textContent,'|',els.btime.textContent);
for(let k=0;k<4;k++){tap(520+k*60);step(60)}
arms[1].fire('click');tap(640);step(150);
arms[2].fire('click');tap(640);step(200);
console.log('after meteor+nuke: score',els.score.textContent,'down',els.down.textContent,'|',els.btime.textContent);
c.fire('wheel',{deltaMode:0,deltaX:0,deltaY:8,ctrlKey:true,clientX:640,clientY:400});
c.fire('wheel',{deltaMode:0,deltaX:6,deltaY:-3,clientX:640,clientY:400});
c.fire('wheel',{deltaMode:0,deltaX:0,deltaY:100,clientX:640,clientY:400});
win.fire('keydown',{code:'KeyQ'});step(60);win.fire('keyup',{code:'KeyQ'});
step(Math.ceil(122/0.016));
console.log('summary shown',!els.summary.hidden,'|',els.sumKind.textContent,'|',els.sumT.textContent,'|',els.sumScore.textContent,'|',els.sumBest.textContent);
console.log('grid:',els.sumGrid.innerHTML.replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
els.sumDet.fire('click');console.log('details shown',!els.sumMore.hidden);
console.log('list:',els.sumList.innerHTML.replace(/<\/dd>/g,'; ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
console.log('buildings:',els.sumBld.innerHTML.replace(/<\/li>/g,', ').replace(/<[^>]+>/g,'').slice(0,300));
tap(640);step(10);console.log('tap after the end: score',els.sumScore.textContent,'=',els.score.textContent);
els.sumMenu.fire('click');console.log('mode',document.body.className);step(10);
els.infoBtn.fire('click');console.log('info shown',!els.info.hidden);els.infoClose.fire('click');

// --- helicopter: booklet, 10 s on autopilot, gunfire, a missile, the gunner view, manual flying, the handback, then the summary
els.playHeli.fire('click');console.log('mode',document.body.className,'booklet shown',!els.guide.hidden,'|',els.gT.textContent);
step(60);console.log('behind the booklet: time',els.htime.textContent);
els.gStart.fire('click');
step(600);
console.log('heli autopilot 10s: auto',els.hauto.textContent,'time',els.htime.textContent,'hp',els.hpv.textContent,'route',els.hround.textContent);
c.fire('pointermove',{...ev,clientY:520});c.fire('pointerdown',{...ev,clientY:520});step(60);c.fire('pointerup',{...ev,clientY:520});
win.fire('keydown',{code:'Space'});step(90);
win.fire('keydown',{code:'KeyC'});c.fire('pointerdown',{...ev,clientY:500});step(60);c.fire('pointerup',{...ev,clientY:500});
console.log('gunner view:',els.viewT.textContent,'score',els.hscore.textContent);
win.fire('keydown',{code:'KeyC'});step(5);
els.hinfo.fire('click');const tInfo=els.htime.textContent;step(60);console.log('info pauses the run:',tInfo,'->',els.htime.textContent);els.infoClose.fire('click');
console.log('after gun+missile: score',els.hscore.textContent,'dons down',els.hkills.textContent,'mk',els.hmk.textContent);
win.fire('keydown',{code:'KeyW'});win.fire('keydown',{code:'KeyA'});step(60);
console.log('manual:',els.hauto.textContent);
// boost: metres covered in 1.5 s of forward flight, without and with Shift held (minimap dot is in % of the map)
const mm=()=>[parseFloat(els.mmdot.style.left),parseFloat(els.mmdot.style.top)];
win.fire('keyup',{code:'KeyA'});step(60);
let a=mm();step(94);let b=mm();const plain=Math.hypot((b[0]-a[0])*47.88,(b[1]-a[1])*35.38);
win.fire('keydown',{code:'ShiftLeft'});step(30);a=mm();step(94);b=mm();const fast=Math.hypot((b[0]-a[0])*47.88,(b[1]-a[1])*35.38);
win.fire('keyup',{code:'ShiftLeft'});
console.log('boost: 1.5 s forward',plain.toFixed(0),'m plain,',fast.toFixed(0),'m boosted');
win.fire('keyup',{code:'KeyW'});step(200);
console.log('after letting go 3.2s:',els.hauto.textContent);
step(Math.ceil(100/0.016));
console.log('summary shown',!els.summary.hidden,'|',els.sumKind.textContent,'|',els.sumT.textContent,'|',els.sumScore.textContent);
console.log('list:',els.sumList.innerHTML.replace(/<\/dd>/g,'; ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));
els.sumAgain.fire('click');console.log('play again -> booklet',!els.guide.hidden,'summary hidden',els.summary.hidden);
els.gMenu.fire('click');step(10);console.log('mode',document.body.className,'best',els.recFlight.textContent);
