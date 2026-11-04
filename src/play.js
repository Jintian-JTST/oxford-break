
/* ---------- build the whole map ---------- */
let bList=[];
function buildAll(){
  D.b.forEach((raw,i)=>addBuilding(i,raw));
  bList=finish(bChunks,bMat,true,true,true);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(MW*2.2,MH*2.2),new THREE.MeshLambertMaterial({color:0x9ba487}));
  ground.rotation.x=-Math.PI/2;ground.position.y=-.03;ground.receiveShadow=true;scene.add(ground);
  D.g.forEach(([p,t],i)=>flatPoly(p,.05+(i%5)*.004,t?PITCH[0]:GRASS[i%3]));
  D.w.forEach(([p,h],i)=>flatPoly(p,.1+(i%3)*.003,WATER,h));
  D.r.forEach(([p,w])=>ribbon(p,Math.max(w/10,2),.12,WATER));
  D.d.forEach(([p,w,c])=>ribbon(p,Math.max(w/10,.7),ROAD_Y[c],ROAD_COL[c]));
  finish(gChunks,gMat,false,true,false);
  buildTrees();
}

/* ---------- minimap ---------- */
const mmc=$('mmc'),mmo=$('mmo'),MMW=420,MMH=Math.round(420*MH/MW);
mmc.width=mmo.width=MMW;mmc.height=mmo.height=MMH;
const mx=x=>(x+MW/2)/MW*MMW,mz=z=>(z+MH/2)/MH*MMH;
function drawMini(){
  const g=mmc.getContext('2d');
  g.fillStyle='#8a9a76';g.fillRect(0,0,MMW,MMH);
  const ring=f=>{for(let i=0;i<f.length;i+=2){const x=mx(f[i]/10),z=mz(f[i+1]/10);i?g.lineTo(x,z):g.moveTo(x,z)}g.closePath()};
  const poly=(f,fill,holes)=>{g.beginPath();ring(f);(holes||[]).forEach(ring);g.fillStyle=fill;g.fill('evenodd')};
  D.g.forEach(([p,t])=>poly(p,t?'#6faa57':'#7ea062'));
  D.w.forEach(([p,h])=>poly(p,'#5b92ab',h));
  g.strokeStyle='#5b92ab';
  D.r.forEach(([p,w])=>{g.lineWidth=Math.max(1,w/10*MMW/MW*1.4);g.beginPath();for(let i=0;i<p.length;i+=2){const x=mx(p[i]/10),z=mz(p[i+1]/10);i?g.lineTo(x,z):g.moveTo(x,z)}g.stroke()});
  g.strokeStyle='#d6d1c2';g.lineWidth=.7;
  D.d.forEach(([p,w,c])=>{if(c>=11&&c!==14)return;g.lineWidth=c<=5?1.4:.7;g.beginPath();for(let i=0;i<p.length;i+=2){const x=mx(p[i]/10),z=mz(p[i+1]/10);i?g.lineTo(x,z):g.moveTo(x,z)}g.stroke()});
  g.fillStyle='#c9a45e';g.beginPath();
  for(const b of buildings){const r=b.r;for(let i=0;i<r.length;i+=2){const x=mx(r[i]),z=mz(r[i+1]);i?g.lineTo(x,z):g.moveTo(x,z)}g.closePath()}
  g.fill();
  g.fillStyle='#1c2f45';
  for(const [x0,z0,x1,z1] of D.x||[])g.fillRect(mx(x0),mz(z0),mx(x1)-mx(x0),mz(z1)-mz(z0));
}
const mmDot=$('mmdot');
function mmJump(e){
  const rc=$('mm').getBoundingClientRect();
  cam.tx=clamp(((e.clientX-rc.left)/rc.width-.5)*MW,-MW/2,MW/2);
  cam.tz=clamp(((e.clientY-rc.top)/rc.height-.5)*MH,-MH/2,MH/2);
  clampCam();
}
let mmDown=false;
$('mm').addEventListener('pointerdown',e=>{if(mode!=='bomb')return;mmDown=true;$('mm').setPointerCapture(e.pointerId);mmJump(e)});
$('mm').addEventListener('pointermove',e=>{if(mmDown)mmJump(e)});
$('mm').addEventListener('pointerup',()=>{mmDown=false});

/* ---------- state ---------- */
const bombs=[],fx=[],debris=[],dons=[],sinking=[],burning=[];
let score=0,downCount=0,donCount=0,life=0,shake=0,muted=false;
// Explosions that bring something down within COMBO_T of the previous one raise the multiplier.
const COMBO_T=2;
let combo=0,lastDown=-9,mult=1;
// fxQ scales debris and dust per collapse, so one nuke levelling 200 buildings stays affordable.
let fxQ=1;
// 'menu' | 'bomb' | 'heli' (see main.js)
let mode='menu';
try{life=+localStorage.getItem('oxford-break-life')||0}catch(e){}

/* ---------- weapons ---------- */
// R blast radius m, dmg at the centre falling off as (1-d/R)^fall, cd cooldown s;
// burn: seconds a meteor leaves the buildings it hits on fire.
const WEAPONS=[
  {key:'bomb',R:R_BOMB,dmg:115,fall:1.2,cd:.3,shake:1},
  {key:'meteor',R:22,dmg:140,fall:1,cd:1.5,shake:1.5,burn:7},
  {key:'nuke',R:75,dmg:1200,fall:.5,cd:12,shake:3.2}
];
const cds=WEAPONS.map(()=>0);
let wi=0;
const cam={tx:0,tz:0,yaw:.55,pitch:.92,dist:140};
const donMat=new THREE.MeshLambertMaterial({color:0x15181d});
const skinMat=new THREE.MeshLambertMaterial({color:0xe9c7a0});
const boxGeo=new THREE.BoxGeometry(1,1,1);
const bombGeo=new THREE.SphereGeometry(.9,12,10),bombMat=new THREE.MeshLambertMaterial({color:0x1e2228});
const sphereGeo=new THREE.SphereGeometry(1,20,14),ringGeo=new THREE.RingGeometry(.9,1,48);
const stemGeo=new THREE.CylinderGeometry(.6,1,1,16,1,true),discGeo=new THREE.CircleGeometry(1,32);
const markGeo=new THREE.RingGeometry(R_BOMB*.55,R_BOMB*.62,40);
const coneGeo=new THREE.ConeGeometry(.42,1.3,10),headGeo=new THREE.SphereGeometry(.26,10,8);
const slateMat=new THREE.MeshLambertMaterial({color:0x56616b});
const debrisMats=new Map();
function debrisMat(col){
  const k=col.map(v=>v.toFixed(2)).join();let m=debrisMats.get(k);
  if(!m){m=new THREE.MeshLambertMaterial({color:new THREE.Color(col[0],col[1],col[2])});debrisMats.set(k,m)}return m;
}

/* ---------- audio ---------- */
// Everything goes through one compressor so overlapping booms don't clip; the noise burst is generated once.
let ac=null,out=null,noise=null;
function ensureAudio(){
  if(muted)return;
  if(!ac){
    try{
      ac=new(window.AudioContext||window.webkitAudioContext)();
      out=ac.createDynamicsCompressor();out.threshold.value=-14;out.ratio.value=6;out.connect(ac.destination);
      const len=Math.floor(ac.sampleRate*1.4);noise=ac.createBuffer(1,len,ac.sampleRate);
      const d=noise.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2);
    }catch(e){ac=null}
  }
  if(ac&&ac.state==='suspended')ac.resume();
}
function whistle(f0,f1,dur,vol){
  if(!ac||muted)return;
  const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();
  o.type='sine';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.15);g.gain.exponentialRampToValueAtTime(.0001,t+dur+.05);
  o.connect(g).connect(out);o.start(t);o.stop(t+dur+.1);
}
// A meteor roars in: filtered noise sweeping up.
function roar(dur){
  if(!ac||muted)return;
  const t=ac.currentTime,s=ac.createBufferSource();s.buffer=noise;s.playbackRate.value=.5;
  const f=ac.createBiquadFilter();f.type='bandpass';f.Q.value=1.2;f.frequency.setValueAtTime(200,t);f.frequency.exponentialRampToValueAtTime(1400,t+dur);
  const g=ac.createGain();g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.5,t+dur);
  s.connect(f).connect(g).connect(out);s.start(t);s.stop(t+dur+.05);
}
// size 1 is a bomb; bigger is lower, louder and longer.
function boom(size){
  if(!ac||muted)return;
  size=size||1;
  const t=ac.currentTime,len=1.2*Math.sqrt(size);
  const s=ac.createBufferSource();s.buffer=noise;s.playbackRate.value=(.9+rr()*.2)/Math.sqrt(size);
  const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(900/Math.sqrt(size),t);f.frequency.exponentialRampToValueAtTime(50,t+len);
  const g=ac.createGain();g.gain.value=Math.min(1.4,.8*Math.sqrt(size));s.connect(f).connect(g).connect(out);s.start(t);
  const o=ac.createOscillator(),og=ac.createGain();
  o.frequency.setValueAtTime(90/Math.sqrt(size),t);o.frequency.exponentialRampToValueAtTime(25,t+.5*size);
  og.gain.setValueAtTime(.6,t);og.gain.exponentialRampToValueAtTime(.001,t+.6*size);
  o.connect(og).connect(out);o.start(t);o.stop(t+.7*size);
}

/* ---------- hud ---------- */
const v3=new THREE.Vector3();
function pop(text,x,y,z,cls){
  const p=v3.set(x,y,z).project(camera);if(p.z>1||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1)return;
  const e=document.createElement('div');e.className='pop '+(cls||'');e.textContent=text;
  e.style.left=((p.x+1)/2*innerWidth)+'px';e.style.top=((1-p.y)/2*innerHeight)+'px';
  $('pops').appendChild(e);setTimeout(()=>e.remove(),1250);
}
const fmt=n=>n.toLocaleString('en-GB');
function hud(){
  $('score').textContent=fmt(score);$('life').textContent=fmt(life);
  $('down').textContent=fmt(downCount);$('dons').textContent=donCount;
}
function comboHud(){
  const on=combo>1&&T-lastDown<COMBO_T;
  $('mult').textContent=on?'×'+combo:'';
}
function addScore(n){score+=n;life+=n}
function saveLife(){try{localStorage.setItem('oxford-break-life',String(life))}catch(e){}}
// Weapon bar: the selected weapon is highlighted, and each button's bar empties as its cooldown runs out.
const armBtns=[...document.querySelectorAll('.arm')];
function pickWeapon(i){
  wi=i;armBtns.forEach((b,j)=>b.classList[j===i?'add':'remove']('on'));
  const s=WEAPONS[i].R/R_BOMB;reticle.scale.set(s,s,s);
}
armBtns.forEach((b,i)=>b.addEventListener('click',()=>{ensureAudio();pickWeapon(i)}));
function armHud(){
  armBtns.forEach((b,i)=>{const k=clamp(cds[i]/WEAPONS[i].cd,0,1);b.style.setProperty('--cd',k.toFixed(3));b.classList[k>0?'add':'remove']('cool')});
}

/* ---------- effects ---------- */
// Each effect mesh owns its material (for its own fade), so the material is disposed with it.
function addFx(m,dur,upd){scene.add(m);fx.push({m,t:0,dur,upd})}
function dropFx(f){scene.remove(f.m);f.m.material.dispose()}
function dust(x,z,n,spread){
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(sphereGeo,new THREE.MeshBasicMaterial({color:0x9a9388,transparent:true,opacity:.55}));
    const px=x+(rr()-.5)*spread,pz=z+(rr()-.5)*spread,r0=1.5+rr()*2,rise=5+rr()*8;
    m.position.set(px,1,pz);
    addFx(m,1.2+rr()*.8,f=>{m.scale.setScalar(r0+f*4);m.position.y=1+f*rise;m.material.opacity=.55*(1-f)});
  }
}
function glow(col,op){return new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:op,depthWrite:false})}
function flash(){const e=$('flash');e.classList.remove('go');void e.offsetWidth;e.classList.add('go')}
function blastFx(x,z,W){
  const R=W.R;
  if(W.key==='nuke'){
    flash();
    // fireball, shock ring, then a mushroom cloud: a stem and a cap that rise and darken
    const fb=new THREE.Mesh(sphereGeo,glow(0xfff1c4,1));fb.position.set(x,6,z);
    addFx(fb,1.6,f=>{fb.scale.setScalar(4+R*.7*Math.sqrt(f));fb.material.opacity=1-f;fb.material.color.setHex(f<.25?0xfff1c4:f<.6?0xffa23a:0xc8442a)});
    const rg=new THREE.Mesh(ringGeo,glow(0xffffff,.9));rg.material.side=THREE.DoubleSide;rg.rotation.x=-Math.PI/2;rg.position.set(x,.5,z);
    addFx(rg,1.8,f=>{rg.scale.setScalar(1+f*R*2.4);rg.material.opacity=.9*(1-f)});
    const stem=new THREE.Mesh(stemGeo,glow(0xc9a27a,.85));stem.position.set(x,0,z);
    addFx(stem,6,f=>{const h=10+f*110;stem.scale.set(9+f*6,h,9+f*6);stem.position.y=h/2;stem.material.opacity=.85*(1-f*f)});
    const cap=new THREE.Mesh(sphereGeo,glow(0xe0a070,.9));cap.position.set(x,10,z);
    addFx(cap,6,f=>{const s=14+Math.sqrt(f)*42;cap.scale.set(s,s*.55,s);cap.position.y=12+f*112;
      cap.material.opacity=.9*(1-f*f);cap.material.color.setRGB(.88-.45*f,.63-.3*f,.44-.18*f)});
    for(let i=0;i<14;i++){
      const a=i/14*6.283,m=new THREE.Mesh(sphereGeo,glow(0xb7a68e,.6));
      addFx(m,3.5,f=>{const r=R*.3+f*R*1.6;m.position.set(x+Math.cos(a)*r,3+f*6,z+Math.sin(a)*r);m.scale.setScalar(6+f*14);m.material.opacity=.6*(1-f)});
    }
    return;
  }
  const big=W.key==='meteor';
  const fb=new THREE.Mesh(sphereGeo,glow(0xffa23a,.95));fb.position.set(x,3,z);
  addFx(fb,big?.8:.55,f=>{fb.scale.setScalar(1+f*R*.85);fb.material.opacity=.95*(1-f);fb.material.color.setHex(f<.4?0xffa23a:0xd45a28)});
  const rg=new THREE.Mesh(ringGeo,glow(0xffffff,.8));rg.material.side=THREE.DoubleSide;
  rg.rotation.x=-Math.PI/2;rg.position.set(x,.4,z);
  addFx(rg,.6,f=>{rg.scale.setScalar(1+f*R*1.7);rg.material.opacity=.8*(1-f)});
  dust(x,z,big?12:8,R*.8);
  if(big){
    // a scorched crater that fades out over a few seconds
    const cr=new THREE.Mesh(discGeo,glow(0x2a2420,.8));cr.scale.setScalar(R*.55);cr.rotation.x=-Math.PI/2;cr.position.set(x,.3,z);
    addFx(cr,9,f=>{cr.material.opacity=.8*(1-f*f)});
  }
}
function explode(x,z,W){
  W=W||WEAPONS[0];
  boom(W.key==='nuke'?4:W.key==='meteor'?1.8:1);shake=Math.max(shake,W.shake);
  blastFx(x,z,W);
  damageArea(x,z,W.R,W.dmg,W.fall,W.burn);
  hud();saveLife();
}
// Damage everything within R of (x,z): buildings ((1-d/R)^fall of dmg), dons and trees. donR: a minimum radius
// for knocking dons over, so a 3 m gun round still takes one down. Returns how many buildings came down.
function damageArea(x,z,R,dmg,fall,burn,donR){
  const hit=[];
  nearBuildings(x,z,R,b=>{if(!b.dead)hit.push(b)});
  fxQ=clamp(24/Math.max(1,hit.length),.12,1);
  // The multiplier this blast earns if it brings anything down.
  mult=T-lastDown<COMBO_T?combo+1:1;
  const before=downCount;
  for(const b of hit){
    if(b.dead)continue;   // may have fallen to a neighbour's collapse earlier in this loop
    const dist=bDist(b,x,z,R);if(dist>=R)continue;
    const d=dmg*Math.pow(1-dist/R,fall);
    b.hp-=d;addScore(Math.round(Math.min(d,b.maxHp)*.3));
    if(!b.seen){b.seen=true;if(fxQ>.5)spawnDons(b)}
    if(b.hp<=0)collapse(b);
    else{setDamage(b);if(burn)ignite(b,burn)}
  }
  const down=downCount-before;
  if(down){combo=mult;lastDown=T}
  fxQ=1;
  const kr=Math.max(R*.85,donR||0);
  for(const d of dons){
    if(d.st!=='run'&&d.st!=='arm')continue;
    const dx=d.x-x,dz=d.z-z,dist=Math.hypot(dx,dz)||.01;
    if(dist<kr){
      const pts=d.st==='arm'?100:60;if(d.st==='arm')H.kills++;
      d.st='fly';d.vy=16+rr()*8;d.vx=dx/dist*(9+rr()*8);d.vz=dz/dist*(9+rr()*8);
      donCount++;addScore(pts);pop('+'+pts+' don',d.x,3,d.z,'don');
    }else if(d.st==='run'&&dist<R*2.2){d.h=Math.atan2(dz,dx);d.sp=6;d.tm=1.6}
  }
  killTrees(x,z,R*.85);
  return down;
}
function setDamage(b){const f=1-clamp(b.hp/b.maxHp,0,1);paintBuilding(b,1-.35*f,f)}
/* fire: a burning building loses hp for a few seconds and may come down on its own */
function ignite(b,t){
  if(b.burn>0){b.burn=Math.max(b.burn,t);return}
  if(burning.length>=40)return;
  b.burn=t;b.flameT=0;b.paintT=0;burning.push(b);
}
const flameCols=[0xffc23a,0xff8a2a,0xe8552a];
function updateFire(dt){
  for(let i=burning.length-1;i>=0;i--){
    const b=burning[i];
    if(b.dead||b.burn<=0){b.burn=0;burning.splice(i,1);continue}
    b.burn-=dt;b.hp-=b.maxHp*.09*dt;
    if(b.hp<=0){mult=1;collapse(b);hud();continue}
    if((b.paintT-=dt)<=0){b.paintT=.3;setDamage(b)}
    if((b.flameT-=dt)<=0){
      b.flameT=.09;
      const px=b.minx+rr()*(b.maxx-b.minx),pz=b.minz+rr()*(b.maxz-b.minz),y0=b.h*b.s+.5;
      const m=new THREE.Mesh(sphereGeo,glow(flameCols[(rr()*3)|0],.9));m.position.set(px,y0,pz);
      const r0=.8+rr()*1.4;
      addFx(m,.9+rr()*.5,f=>{m.scale.setScalar(r0*(1-f*.7));m.position.y=y0+f*7;m.material.opacity=.9*(1-f)});
    }
  }
}
// chain: a collapse shakes its neighbours, but neighbours that fall from that do not shake theirs.
function collapse(b,chain){
  b.dead=true;b.burn=0;downCount++;
  sinking.push({b,s0:b.s,s1:Math.min(1,1.3/b.h),t:0,dur:.6+Math.min(.8,b.h/40)});
  const pts=b.pts*mult;addScore(pts);
  if(b.name||fxQ>=1)pop((b.name?b.name+' ':'')+'+'+fmt(pts)+(mult>1?' ×'+mult:''),b.x,Math.min(b.h*.6,20),b.z,b.name?'big':'');
  if(!chain){
    const rad=clamp(Math.sqrt(b.area)*.35,4,R_BOMB),near=[];
    nearBuildings(b.x,b.z,rad,n=>{if(!n.dead&&n!==b)near.push(n)});
    for(const n of near){
      const d=Math.min(bDist(n,b.x,b.z),bDist(b,n.x,n.z));if(d>=rad)continue;
      n.hp-=clamp(b.h/12,.5,2)*30*(1-d/rad);
      if(n.hp<=0)collapse(n,true);else setDamage(n);
    }
  }
  const o=mmo.getContext('2d');o.fillStyle='#ff6a3d';o.fillRect(mx(b.x)-1,mz(b.z)-1,2.4,2.4);
  const stoneM=debrisMat(b.wc);
  const n=Math.round(Math.min(36,Math.round(b.area*b.h/90)+8)*fxQ);
  for(let i=0;i<n;i++){
    let px=b.x,pz=b.z;
    for(let t=0;t<5;t++){const qx=b.minx+rr()*(b.maxx-b.minx),qz=b.minz+rr()*(b.maxz-b.minz);if(inPoly(b.r,qx,qz)){px=qx;pz=qz;break}}
    const s=.6+rr()*1.5,m=new THREE.Mesh(boxGeo,rr()<.3?slateMat:stoneM);
    m.scale.setScalar(s);m.position.set(px,rr()*b.h*.8+s,pz);m.castShadow=true;
    m.rotation.set(rr()*3,rr()*3,rr()*3);scene.add(m);
    debris.push({m,s,age:0,rest:false,vx:(px-b.x)*.5+(rr()-.5)*8,vy:6+rr()*14,vz:(pz-b.z)*.5+(rr()-.5)*8,rx:(rr()-.5)*8,rz:(rr()-.5)*8});
  }
  while(debris.length>420){const p=debris.shift();scene.remove(p.m)}
  dust(b.x,b.z,Math.round(Math.min(7,3+(b.area/200|0))*fxQ),Math.max(b.maxx-b.minx,b.maxz-b.minz));
}

/* ---------- dons ---------- */
// A don: gown, head and mortarboard, twice life size so they read from the air.
function donMesh(x,z){
  const g=new THREE.Group();
  const body=new THREE.Mesh(coneGeo,donMat);body.position.y=.65;g.add(body);
  const head=new THREE.Mesh(headGeo,skinMat);head.position.y=1.5;g.add(head);
  const hat=new THREE.Mesh(boxGeo,donMat);hat.scale.set(.6,.07,.6);hat.position.y=1.78;g.add(hat);
  g.scale.setScalar(2);g.position.set(x,0,z);g.traverse(o=>{o.castShadow=true});scene.add(g);
  return g;
}
function spawnDons(b){
  if(dons.length>45)return;
  const n=b.name?3:1+(rr()<.4?1:0);
  for(let i=0;i<n;i++){
    const vi=((rr()*(b.r.length/2))|0)*2,vx=b.r[vi],vz=b.r[vi+1];
    let dx=vx-b.x,dz=vz-b.z;const l=Math.hypot(dx,dz)||1;
    const px=vx+dx/l*2.5,pz=vz+dz/l*2.5;
    if(Math.abs(px)>MW/2||Math.abs(pz)>MH/2||insideAlive(px,pz,.8))continue;
    dons.push({g:donMesh(px,pz),x:px,z:pz,h:rr()*6.28,sp:3,st:'run',t:rr()*10,tm:0,vx:0,vy:0,vz:0});
  }
}
function updateDons(dt){
  for(let i=dons.length-1;i>=0;i--){
    const d=dons[i];d.t+=dt;
    if(d.st==='run'){
      d.tm-=dt;
      if(d.tm<=0){d.h=rr()*6.28;d.tm=1+rr()*2;d.sp=2.5+rr()*1.5}
      const nx=d.x+Math.cos(d.h)*d.sp*dt,nz=d.z+Math.sin(d.h)*d.sp*dt;
      if(Math.abs(nx)>MW/2||Math.abs(nz)>MH/2||insideAlive(nx,nz,.6)){d.h+=Math.PI*(.6+rr()*.8);d.tm=.5}
      else{d.x=nx;d.z=nz}
      d.g.position.set(d.x,Math.abs(Math.sin(d.t*12))*.2,d.z);
      d.g.rotation.set(0,-d.h+Math.PI/2,Math.sin(d.t*12)*.12);
    }else if(d.st==='arm'){
      armedDon(d,dt);
    }else if(d.st==='fly'){
      d.vy-=30*dt;d.x+=d.vx*dt;d.z+=d.vz*dt;
      d.g.position.set(d.x,d.g.position.y+d.vy*dt,d.z);
      d.g.rotation.x+=9*dt;d.g.rotation.z+=6*dt;
      if(d.g.position.y<=0&&d.vy<0){d.g.position.y=.3;d.st='down';d.tm=1.5;d.g.rotation.set(Math.PI/2,0,0)}
    }else{d.tm-=dt;if(d.tm<=0){scene.remove(d.g);dons.splice(i,1)}}
  }
}

/* ---------- bombs ---------- */
const meteorGeo=new THREE.IcosahedronGeometry(2.4,1),meteorMat=new THREE.MeshBasicMaterial({color:0xffb347});
const nukeMat=new THREE.MeshLambertMaterial({color:0x4a5536});
function drop(x,z){
  const W=WEAPONS[wi];if(cds[wi]>0)return;
  cds[wi]=W.cd;x=clamp(x,-MW/2,MW/2);z=clamp(z,-MH/2,MH/2);
  const mk=new THREE.Mesh(markGeo,glow(W.key==='nuke'?0xffd23a:0xff6a3d,.7));mk.material.side=THREE.DoubleSide;
  mk.scale.setScalar(W.R/R_BOMB);mk.rotation.x=-Math.PI/2;mk.position.set(x,.4,z);scene.add(mk);
  if(W.key==='meteor'){
    // comes in at a slant from beyond the camera's right shoulder, trailing fire
    const a=cam.yaw+1.1,sx=x+Math.sin(a)*120,sz=z+Math.cos(a)*120;
    const g=new THREE.Mesh(meteorGeo,meteorMat);g.position.set(sx,150,sz);scene.add(g);
    bombs.push({W,g,mk,x,z,sx,sy:150,sz,t:0,dur:1.1,trail:0});roar(1.1);
  }else{
    const nuke=W.key==='nuke',y=nuke?160:80;
    const g=new THREE.Mesh(bombGeo,nuke?nukeMat:bombMat);g.scale.set(nuke?2.6:1,nuke?4:1.6,nuke?2.6:1);g.position.set(x,y,z);scene.add(g);
    bombs.push({W,g,mk,x,z,y,vy:nuke?-20:-30});
    if(nuke)whistle(900,110,2,.08);else whistle(1500,260,1.1,.05);
  }
}

/* ---------- camera + input ---------- */
function placeCam(){
  const cp=Math.cos(cam.pitch),s=shake*shake*1.8;
  camera.position.set(
    cam.tx+Math.sin(cam.yaw)*cp*cam.dist+(rr()-.5)*s,
    Math.sin(cam.pitch)*cam.dist+(rr()-.5)*s,
    cam.tz+Math.cos(cam.yaw)*cp*cam.dist+(rr()-.5)*s);
  camera.lookAt(cam.tx,0,cam.tz);
  fitShadow(cam.tx,cam.tz,cam.dist,cam.yaw);
}
// The shadow box follows what is on screen: centred ahead of (tx,tz) along the view and sized from the distance.
function fitShadow(tx,tz,dist,yaw){
  const fwd=dist*.2,S=clamp(dist*1.4,160,600);
  sunT.position.set(tx-Math.sin(yaw)*fwd,0,tz-Math.cos(yaw)*fwd);
  sun.position.copy(sunT.position).addScaledVector(SUN_DIR,900);
  if(Math.abs(S-lastS)>3){
    const sc=sun.shadow.camera;sc.left=-S;sc.right=S;sc.top=S;sc.bottom=-S;sc.updateProjectionMatrix();
    sun.shadow.normalBias=Math.max(.35,S*2/SM*2.4);lastS=S;
  }
}
const SUN_DIR=new THREE.Vector3(-90,170,60).normalize();let lastS=0;
// The map can have cut-out corners (D.x); the camera target is pushed out of them along the shorter way.
const CUTS=D.x||[];
function onMap(x,z){
  x=clamp(x,-MW/2,MW/2);z=clamp(z,-MH/2,MH/2);
  for(const [x0,z0,x1,z1] of CUTS){
    if(x<=x0||x>=x1||z<=z0||z>=z1)continue;
    const opts=[[x0-x,0],[x1-x,0],[0,z0-z],[0,z1-z]]
      .filter(([dx,dz])=>Math.abs(x+dx)<=MW/2&&Math.abs(z+dz)<=MH/2);
    let b=opts[0];for(const o of opts)if(Math.abs(o[0])+Math.abs(o[1])<Math.abs(b[0])+Math.abs(b[1]))b=o;
    x+=b[0];z+=b[1];
  }
  return [x,z];
}
function clampCam(){[cam.tx,cam.tz]=onMap(cam.tx,cam.tz)}
function panBy(dx,dy){
  const k=cam.dist*.0016,s=Math.sin(cam.yaw),c=Math.cos(cam.yaw);
  cam.tx+=-c*dx*k+(-s)*dy*k;cam.tz+=s*dx*k+(-c)*dy*k;clampCam();
}
const ray=new THREE.Raycaster(),gp=new THREE.Plane(new THREE.Vector3(0,1,0),0),hitv=new THREE.Vector3(),ndc=new THREE.Vector2();
function ground(cx,cy){
  ndc.set(cx/innerWidth*2-1,-(cy/innerHeight)*2+1);
  ray.setFromCamera(ndc,camera);
  return ray.ray.intersectPlane(gp,hitv)?hitv:null;
}
const reticle=new THREE.Mesh(new THREE.RingGeometry(R_BOMB-.6,R_BOMB,48),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55,side:THREE.DoubleSide}));
reticle.rotation.x=-Math.PI/2;reticle.position.y=.5;reticle.visible=false;scene.add(reticle);
function aim(x,y){const g=ground(x,y);if(g){reticle.position.x=g.x;reticle.position.z=g.z;reticle.visible=true}}

const cv=$('c'),ptrs=new Map();let pinch0=1,twist0=0;
const PITCH_MIN=.5,PITCH_MAX=1.35;
const pair=()=>{const a=[...ptrs.values()];return{d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,a:Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x)}};
// Zoom by factor k while keeping the ground point under the cursor fixed.
function zoomAt(k,sx,sy){
  placeCam();camera.updateMatrixWorld();
  const g=ground(sx,sy),gx=g&&g.x,gz=g&&g.z;
  cam.dist=clamp(cam.dist*k,40,450);
  if(!g)return;
  placeCam();camera.updateMatrixWorld();
  const g2=ground(sx,sy);if(g2){cam.tx+=gx-g2.x;cam.tz+=gz-g2.z;clampCam()}
}
cv.addEventListener('pointerdown',e=>{
  ensureAudio();if(mode!=='bomb')return;
  cv.setPointerCapture(e.pointerId);
  // right mouse button (or ctrl-click) orbits instead of panning
  const rot=e.pointerType==='mouse'&&(e.button===2||e.ctrlKey);
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),multi:false,rot});
  if(ptrs.size>=2){ptrs.forEach(p=>p.multi=true);const q=pair();pinch0=q.d;twist0=q.a}
});
cv.addEventListener('pointermove',e=>{
  if(mode!=='bomb')return;
  const p=ptrs.get(e.pointerId);
  if(!p){if(e.pointerType==='mouse')aim(e.clientX,e.clientY);return}
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(ptrs.size===1){
    if(p.rot){cam.yaw-=dx*.006;cam.pitch=clamp(cam.pitch+dy*.004,PITCH_MIN,PITCH_MAX)}
    else{panBy(dx,dy);if(e.pointerType==='mouse')aim(e.clientX,e.clientY)}
  }else if(ptrs.size===2){
    const q=pair();cam.dist=clamp(cam.dist*pinch0/q.d,40,450);pinch0=q.d;
    let da=q.a-twist0;if(da>Math.PI)da-=Math.PI*2;if(da<-Math.PI)da+=Math.PI*2;
    cam.yaw+=da;twist0=q.a;
  }
});
const endPtr=e=>{
  const p=ptrs.get(e.pointerId);if(!p)return;ptrs.delete(e.pointerId);
  if(e.type==='pointerup'&&!p.multi&&!p.rot&&Math.hypot(p.x-p.sx,p.y-p.sy)<8&&performance.now()-p.t<500){
    const g=ground(p.x,p.y);if(g)drop(g.x,g.z);
  }
};
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')reticle.visible=false});
cv.addEventListener('contextmenu',e=>e.preventDefault());
// Wheel: a mouse wheel zooms in steps. Laptop trackpads report two-finger scrolls as small, often fractional
// wheel deltas (and sideways ones), and pinches as ctrl+wheel: so two fingers pan, pinch zooms, and
// shift/alt + two fingers orbits. Safari on a Mac also sends rotate gestures.
let padT=-1e9,pinchT=-1e9;
cv.addEventListener('wheel',e=>{
  e.preventDefault();if(mode!=='bomb')return;
  const now=performance.now(),u=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1,dx=e.deltaX*u,dy=e.deltaY*u;
  if(e.ctrlKey){pinchT=now;zoomAt(Math.exp(clamp(dy,-50,50)*.012),e.clientX,e.clientY);return}
  if(e.deltaMode===0&&(dx!==0||Math.abs(dy)<50))padT=now;   // a wheel notch is ≥ 100 px and never sideways
  if(now-padT<300){
    if(e.shiftKey||e.altKey){cam.yaw-=(dx||dy)*.005;if(dx)cam.pitch=clamp(cam.pitch+dy*.003,PITCH_MIN,PITCH_MAX)}
    else panBy(-dx,-dy);
    return;
  }
  zoomAt(1+Math.sign(dy)*.1,e.clientX,e.clientY);
},{passive:false});
let gest=null;
cv.addEventListener('gesturestart',e=>{e.preventDefault();if(mode==='bomb')gest={r:e.rotation,d:cam.dist}});
cv.addEventListener('gesturechange',e=>{
  e.preventDefault();if(!gest)return;
  cam.yaw-=(e.rotation-gest.r)*Math.PI/180;gest.r=e.rotation;
  if(performance.now()-pinchT>200)cam.dist=clamp(gest.d/e.scale,40,450);
});
cv.addEventListener('gestureend',e=>{e.preventDefault();gest=null});

const keys=new Set();
addEventListener('keydown',e=>{
  if(e.code==='KeyM'){toggleMute();return}
  if(e.code==='KeyL'){toggleLabels();return}
  if(mode==='bomb'){
    if(e.code==='Space'){e.preventDefault();ensureAudio();const g=ground(innerWidth/2,innerHeight/2);if(g)drop(g.x,g.z);return}
    const n=['Digit1','Digit2','Digit3'].indexOf(e.code);if(n>=0){pickWeapon(n);return}
  }else if(mode==='heli'){
    if(e.code==='Space')e.preventDefault();
    if(e.code==='KeyE'){ensureAudio();fireMissile();return}
  }
  keys.add(e.code);
});
addEventListener('keyup',e=>keys.delete(e.code));
function toggleMute(){muted=!muted;$('mute').textContent=$('hmute').textContent=muted?'Sound off':'Sound on';if(!muted)ensureAudio()}
$('mute').addEventListener('click',toggleMute);
$('lblbtn').addEventListener('click',toggleLabels);$('lblbtn').textContent=labelsOn?'Labels on':'Labels off';
function reset(){
  bombs.splice(0).forEach(b=>{scene.remove(b.g);scene.remove(b.mk);b.mk.material.dispose()});
  fx.splice(0).forEach(dropFx);
  sinking.length=0;
  burning.splice(0).forEach(b=>{b.burn=0});
  debris.splice(0).forEach(p=>scene.remove(p.m));
  dons.splice(0).forEach(d=>scene.remove(d.g));
  for(const c of bList){
    for(let i=0;i<c.n;i++)c.posA[i*3+1]=c.baseY[i];
    c.colA.set(c.col0);
    for(const a of [c.geo.attributes.position,c.geo.attributes.color]){a.updateRange.count=-1;a.needsUpdate=true}
  }
  for(const b of buildings){b.dead=false;b.seen=false;b.hp=b.maxHp;b.s=1}
  treeChunks.forEach(tc=>{
    tc.crown.instanceMatrix.array.set(tc.orig);tc.trunk.instanceMatrix.array.set(tc.orig);
    tc.crown.instanceMatrix.needsUpdate=tc.trunk.instanceMatrix.needsUpdate=true;
    tc.list.forEach(t=>t.dead=false);
  });
  mmo.getContext('2d').clearRect(0,0,MMW,MMH);
  reticle.visible=false;
  score=0;downCount=0;donCount=0;hud();
  combo=0;lastDown=-9;comboHud();
}
$('rebuild').addEventListener('click',reset);

function resize(){
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.fov=innerWidth<innerHeight?62:45;
  camera.updateProjectionMatrix();
}
addEventListener('resize',resize);resize();

/* ---------- per-frame updates ---------- */
// Everything that moves on its own, whatever the mode: bombs in flight, fire, effects, collapses, debris, dons.
function updateWorld(dt){
  for(let i=0;i<cds.length;i++)cds[i]-=dt;
  shake=Math.max(0,shake-dt*1.6);
  for(let i=bombs.length-1;i>=0;i--){
    const b=bombs[i];let landed;
    b.mk.material.opacity=.5+.25*Math.sin(T*22);
    if(b.dur){
      // meteor: accelerates along its slant
      b.t+=dt/b.dur;const k=Math.min(1,b.t),e=k*k;
      b.g.position.set(b.sx+(b.x-b.sx)*e,b.sy*(1-e)+1,b.sz+(b.z-b.sz)*e);b.g.rotation.x+=dt*6;b.g.rotation.y+=dt*4;
      if((b.trail-=dt)<=0){
        b.trail=.025;const m=new THREE.Mesh(sphereGeo,glow(flameCols[(rr()*3)|0],.85));m.position.copy(b.g.position);
        const r0=1.6+rr();addFx(m,.6,f=>{m.scale.setScalar(r0*(1+f*1.5));m.material.opacity=.85*(1-f)});
      }
      landed=k>=1;
    }else{b.vy-=55*dt;b.y+=b.vy*dt;b.g.position.y=b.y;landed=b.y<=1}
    if(landed){scene.remove(b.g);scene.remove(b.mk);b.mk.material.dispose();bombs.splice(i,1);explode(b.x,b.z,b.W)}
  }
  updateFire(dt);
  for(let i=fx.length-1;i>=0;i--){
    const f=fx[i];f.t+=dt;const k=f.t/f.dur;
    if(k>=1){dropFx(f);fx.splice(i,1)}else f.upd(k);
  }
  // Collapsing buildings sink with an ease-in, so they visibly give way before hitting the ground.
  for(let i=sinking.length-1;i>=0;i--){
    const s=sinking[i];s.t+=dt/s.dur;const k=Math.min(1,s.t),e=k*k;
    paintBuilding(s.b,s.s0+(s.s1-s.s0)*e,.6+.4*k);
    if(k>=1)sinking.splice(i,1);
  }
  for(let i=debris.length-1;i>=0;i--){
    const p=debris[i];p.age+=dt;
    if(!p.rest){
      p.vy-=32*dt;
      p.m.position.x+=p.vx*dt;p.m.position.y+=p.vy*dt;p.m.position.z+=p.vz*dt;
      p.m.rotation.x+=p.rx*dt;p.m.rotation.z+=p.rz*dt;
      const fl=p.s*.5;
      if(p.m.position.y<=fl){
        p.m.position.y=fl;
        if(Math.abs(p.vy)<4)p.rest=true;
        else{p.vy*=-.35;p.vx*=.6;p.vz*=.6;p.rx*=.6;p.rz*=.6}
      }
    }
    if(p.age>10){
      const k=1-(p.age-10)/1.2;
      if(k<=0){scene.remove(p.m);debris.splice(i,1);continue}
      p.m.scale.setScalar(p.s*k);
    }
  }
  updateDons(dt);
}
// Bombing mode: keyboard camera, HUD, and the overhead camera.
function updateBomb(dt){
  const sp=60*dt*(cam.dist/100);
  let fx_=0,fz_=0;
  if(keys.has('KeyW')||keys.has('ArrowUp'))fz_-=1;
  if(keys.has('KeyS')||keys.has('ArrowDown'))fz_+=1;
  if(keys.has('KeyA')||keys.has('ArrowLeft'))fx_-=1;
  if(keys.has('KeyD')||keys.has('ArrowRight'))fx_+=1;
  if(fx_||fz_){const s=Math.sin(cam.yaw),c=Math.cos(cam.yaw);cam.tx+=(fx_*c+fz_*s)*sp;cam.tz+=(-fx_*s+fz_*c)*sp;clampCam()}
  if(keys.has('KeyQ'))cam.yaw-=1.2*dt;
  if(keys.has('KeyE'))cam.yaw+=1.2*dt;
  if(keys.has('KeyR'))cam.pitch=Math.min(PITCH_MAX,cam.pitch+.8*dt);
  if(keys.has('KeyF'))cam.pitch=Math.max(PITCH_MIN,cam.pitch-.8*dt);
  comboHud();armHud();
  if(fr%20===1){
    let best=null,bd=95*95;
    nearBuildings(cam.tx,cam.tz,95,b=>{if(b.name&&!b.dead){const d=(b.x-cam.tx)**2+(b.z-cam.tz)**2;if(d<bd){bd=d;best=b.name}}});
    $('where').textContent=best||'Oxford';
  }
  placeCam();
}
