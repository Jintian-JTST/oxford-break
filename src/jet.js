
/* ---------- fighter jet mode ---------- */
// A timed sortie in a jet that never stops: W/S climb and dive, A/D bank and turn, Shift afterburner.
// The pointer aims the cannon (hold to fire). Space or a right-click drops a bomb: it keeps the jet's speed and falls on
// the ring drawn on the ground ahead. C switches to the cockpit. Flying into a roof or the ground ends the sortie.
const JET_LIMITS=[60,120,180];
const JBOMB={key:'jbomb',R:24,dmg:190,fall:1,shake:1.3};
const J_MAG=4,J_RELOAD=2.2,J_GAP=.3,J_RATE=14,J_DMG=16,G_BOMB=30,J_TURN=.8,AB_T=4,AB_FILL=8;
const J={g:null,flames:null,pyl:null,x:0,y:110,z:0,yaw:0,pitch:0,roll:0,v:75,thr:.45,ab:false,en:1,dry:false,
  bombs:J_MAG,rel:0,gap:0,gunT:0,firing:false,firePtr:null,phase:'off',view:'chase',ox:0,oy:0,oz:0,fovk:0,warn:false,turning:0};
let jetLimit=120,jetBest=0;
try{jetLimit=+localStorage.getItem('oxford-break-jet-limit')||120;jetBest=+localStorage.getItem('oxford-break-jet-best')||0}catch(e){}
if(JET_LIMITS.indexOf(jetLimit)<0)jetLimit=120;
const jBombs=[],jTracers=[];

/* model, facing -z: a lathe-turned fuselage, side intakes, cranked delta wings, twin canted fins, two nozzles with
   afterburner flames that grow with the throttle, and four bombs under the wings that go as they are dropped */
function jetModel(){
  const lam=(c,ds)=>new THREE.MeshLambertMaterial({color:c,side:ds?THREE.DoubleSide:THREE.FrontSide});
  const grey=lam(0x8a929b),wing=lam(0x7b838c,true),dark=lam(0x3a4049),navy=lam(0x22406a,true),stone=lam(0xe6bd62,true),
    glass=new THREE.MeshPhongMaterial({color:0x1d2f45,specular:0xffffff,shininess:120,transparent:true,opacity:.9});
  const g=new THREE.Group();
  const add=(geo,mat,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,par=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(rx,ry,rz);m.castShadow=true;par.add(m);return m};
  const zc=(r0,r1,h,n)=>{const c=new THREE.CylinderGeometry(r0,r1,h,n);c.rotateX(Math.PI/2);return c};
  // a flat outline (x, z) extruded t thick
  const plate=(pts,t)=>new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a,b])=>new THREE.Vector2(a,b))),{depth:t,bevelEnabled:false});
  const prof=[[0,-9.5],[.3,-8.8],[.62,-7.6],[.92,-6],[1.12,-4],[1.22,-1.5],[1.22,2],[1.12,4.5],[.95,6.4],[.85,7]].map(([r,z])=>new THREE.Vector2(r,z));
  const body=new THREE.LatheGeometry(prof,20);body.rotateX(Math.PI/2);
  add(body,grey,0,0,0,1,.85,1);
  add(body,navy,0,.02,0,1.01,.12,1.01);                       // an Oxford-blue band down each side
  add(sphereGeo,glass,0,.7,-4.6,.58,.5,2.1);                  // canopy
  add(boxGeo,dark,0,.5,-2.35,.9,.12,.25);                     // canopy frame at the back
  add(zc(.04,.04,1.6,6),dark,0,0,-10.2);                      // pitot probe
  for(const s of [-1,1]){
    add(boxGeo,grey,s*1.15,-.2,-1.2,.7,1,3.6);                // intakes
    add(boxGeo,dark,s*1.15,-.2,-3.02,.56,.82,.06);
  }
  const wg=plate([[0,-3],[5.9,2.6],[6.1,3.6],[0,4.8]],.16);wg.rotateX(Math.PI/2);
  const tp=plate([[0,0],[2.6,1.2],[2.6,2.4],[0,2.6]],.12);tp.rotateX(Math.PI/2);
  const fin=plate([[0,0],[3.2,0],[3.9,3.4],[2.6,3.4]],.12);fin.rotateY(-Math.PI/2);
  for(const s of [-1,1]){
    add(wg,wing,s*.9,-.05,0,s,1,1);
    add(tp,wing,s*.9,-.1,5,s,1,1);
    add(fin,wing,s*.75,.5,3.4,1,1,1,0,0,-s*.3);
    add(boxGeo,navy,s*(.75+.55),3.4,5.9,.14,.5,1.1,0,0,-s*.3);   // fin tips
    // roundels on the wing tops: blue ring, stone centre
    add(discGeo,navy,s*4.1,.03,2.5,.7,.7,.7,-Math.PI/2);
    add(discGeo,stone,s*4.1,.04,2.5,.34,.34,.34,-Math.PI/2);
    add(zc(.5,.42,1.1,14),dark,s*.55,-.05,7.3);               // nozzles
    add(sphereGeo,new THREE.MeshBasicMaterial({color:s<0?0xff3b30:0x35e06a}),s*6.05,-.1,3.3,.1,.1,.1);
  }
  const fg=new THREE.ConeGeometry(.4,3,12,1,true);fg.translate(0,1.5,0);fg.rotateX(Math.PI/2);
  const flames=[];
  for(const s of [-1,1]){
    const f=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color:0xffa04a,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    f.position.set(s*.55,-.05,7.85);g.add(f);flames.push(f);
  }
  const pyl=[];
  for(const [x,z] of [[-2.4,1.6],[2.4,1.6],[-3.7,2.4],[3.7,2.4]]){
    add(boxGeo,dark,x,-.28,z,.1,.3,.8);
    pyl.push(add(bombGeo,bombMat,x,-.62,z,.36,.36,1.25));
  }
  g.scale.setScalar(1.15);
  return {g,flames,pyl};
}

/* cockpit: the canopy bow arching over the top corners, the glare shield and instrument panel along the bottom, and
   the head-up display glass in the middle; a small scene of its own drawn on top, like the helicopter's */
const jfp={scene:new THREE.Scene(),cam:new THREE.PerspectiveCamera(60,1,.05,30),built:false};
function jetCockpit(){
  const lam=c=>new THREE.MeshLambertMaterial({color:c});
  const frame=lam(0x2a3038),panel=lam(0x1a1e24),S=jfp.scene;
  S.add(new THREE.AmbientLight(0xffffff,.6));
  const L=new THREE.DirectionalLight(0xffffff,.7);L.position.set(1,3,2);S.add(L);
  const add=(geo,mat,x,y,z,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);S.add(m);return m};
  add(new THREE.TorusGeometry(1.3,.05,8,48,Math.PI),frame,0,-.5,-1.15);
  for(const s of [-1,1])add(boxGeo,frame,s*1.3,-.5,-.45,.07,.07,1.4);
  add(boxGeo,panel,0,-.72,-1.02,2.6,.4,.5);
  add(boxGeo,frame,0,-.52,-.98,1.5,.05,.42);
  const scr=new THREE.MeshBasicMaterial({color:0x1d5038});
  for(const s of [-1,1]){add(boxGeo,scr,s*.45,-.64,-.765,.3,.13,.02);add(boxGeo,frame,s*.45,-.64,-.77,.34,.17,.01)}
  add(boxGeo,new THREE.MeshBasicMaterial({color:0x9cffc0,transparent:true,opacity:.1,depthWrite:false}),0,-.3,-1,.44,.3,.01);
  for(const s of [-1,1])add(boxGeo,frame,s*.23,-.42,-1,.02,.2,.02);
  jfp.built=true;
}
function toggleJetView(){
  if(mode!=='jet'||!J.g)return;
  J.view=J.view==='cock'?'chase':'cock';
  if(J.view==='cock'&&!jfp.built)jetCockpit();
  J.g.visible=J.view==='chase'&&J.phase!=='dead';
  document.body.classList[J.view==='cock'?'add':'remove']('jcock');
  xhair.set=false;
  $('jviewT').textContent=J.view==='cock'?'Chase view':'Cockpit view';
}
function renderJetCockpit(){
  if(mode!=='jet'||J.view!=='cock'||!jfp.built||J.phase==='off'||J.phase==='dead')return;
  const c=jfp.cam;
  if(c.fov!==camera.fov||c.aspect!==camera.aspect){c.fov=camera.fov;c.aspect=camera.aspect;c.updateProjectionMatrix()}
  renderer.autoClear=false;renderer.clearDepth();renderer.render(jfp.scene,c);renderer.autoClear=true;
}

/* a sortie: set up behind the booklet, flown after Start */
const ccip=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false}));
ccip.rotation.x=-Math.PI/2;ccip.scale.setScalar(JBOMB.R*.6);ccip.visible=false;scene.add(ccip);
function prepJet(){
  reset();clearJet();
  if(!J.g){const m=jetModel();J.g=m.g;J.flames=m.flames;J.pyl=m.pyl}
  scene.add(J.g);
  // in from the south, 700 m short of the Radcliffe Camera, heading north
  const rc=buildings.find(b=>b.name==='Radcliffe Camera')||{x:0,z:0};
  [J.x,J.z]=[clamp(rc.x,-MW/2+100,MW/2-100),clamp(rc.z+700,-MH/2+100,MH/2-100)];
  Object.assign(J,{y:110,yaw:0,pitch:0,roll:0,v:75,thr:.45,ab:false,en:1,dry:false,bombs:J_MAG,rel:0,gap:0,gunT:0,firing:false,
    phase:'fly',ox:0,oy:9,oz:32,fovk:0,warn:false,turning:0});
  J.g.visible=J.view==='chase';J.pyl.forEach(p=>p.visible=true);
  document.body.classList[J.view==='cock'?'add':'remove']('jcock');
  xhair.set=false;jetHud();
}
function stopJet(){J.phase='off';J.firing=false;abBtn=false;ccip.visible=false;document.body.classList.remove('jcock');resize();if(J.g)scene.remove(J.g);clearJet()}
function clearJet(){for(const a of [jBombs,jTracers])a.splice(0).forEach(o=>{scene.remove(o.m);if(o.own)o.m.material.dispose()})}
function crashJet(){
  J.phase='dead';J.firing=false;J.g.visible=false;ccip.visible=false;
  explode(J.x,J.z,{key:'meteor',R:20,dmg:150,fall:1,shake:2});
  showSummary('Crashed');
}
function jetBomb(){
  if(mode!=='jet'||J.phase!=='fly'||paused||!G.on||J.bombs<=0||J.gap>0)return;
  J.bombs--;J.gap=J_GAP;
  if(G.stats)G.stats.weapons.jbomb=(G.stats.weapons.jbomb||0)+1;
  const p=J.pyl[J.bombs],w=new THREE.Vector3();p.visible=false;p.getWorldPosition(w);
  const cp=Math.cos(J.pitch),fx=-Math.sin(J.yaw)*cp,fy=Math.sin(J.pitch),fz=-Math.cos(J.yaw)*cp;
  const m=new THREE.Mesh(bombGeo,bombMat);m.scale.set(.42,.42,1.4);m.position.copy(w);m.castShadow=true;scene.add(m);
  jBombs.push({m,vx:fx*J.v,vy:fy*J.v-3,vz:fz*J.v});
  whistle(1300,280,1.6,.04);
}
function fireCannon(){
  const cp=Math.cos(J.pitch),fx=-Math.sin(J.yaw)*cp,fy=Math.sin(J.pitch),fz=-Math.cos(J.yaw)*cp;
  const ox=J.x+fx*11,oy=J.y+fy*11-.3,oz=J.z+fz*11,sp=2,tx=aimP.x+(rr()-.5)*sp,ty=aimP.y+(rr()-.5)*sp*.5,tz=aimP.z+(rr()-.5)*sp;
  const L=Math.hypot(tx-ox,ty-oy,tz-oz)||1;
  const m=new THREE.Mesh(tracerGeo,glow(0xffe08a,.95));m.position.set(ox,oy,oz);m.lookAt(tx,ty,tz);scene.add(m);
  if(G.stats)G.stats.weapons.rounds=(G.stats.weapons.rounds||0)+1;
  jTracers.push({m,own:true,tx,ty,tz,left:L,vx:(tx-ox)/L,vy:(ty-oy)/L,vz:(tz-oz)/L});
  if(ac&&!muted&&rr()<.5){
    const t=ac.currentTime,s=ac.createBufferSource();s.buffer=noise;s.playbackRate.value=1.6;
    const g=ac.createGain();g.gain.setValueAtTime(.16,t);g.gain.exponentialRampToValueAtTime(.001,t+.05);s.connect(g).connect(out);s.start(t,rr()*.5);s.stop(t+.06);
  }
}

/* input: hold the pointer to fire the cannon, right-click to bomb; on touch the joystick flies */
cv.addEventListener('pointerdown',e=>{
  if(mode!=='jet')return;
  cv.setPointerCapture(e.pointerId);
  xhair.x=e.clientX;xhair.y=e.clientY;xhair.set=true;
  if(e.button===2){jetBomb();return}
  J.firing=true;J.firePtr=e.pointerId;
});
cv.addEventListener('pointermove',e=>{
  if(mode!=='jet')return;
  if(e.pointerType==='mouse'||e.pointerId===J.firePtr){xhair.x=e.clientX;xhair.y=e.clientY;xhair.set=true}
});
const jetUp=e=>{if(e.pointerId===J.firePtr){J.firing=false;J.firePtr=null}};
cv.addEventListener('pointerup',jetUp);cv.addEventListener('pointercancel',jetUp);
$('jbomb').addEventListener('click',()=>{ensureAudio();jetBomb()});
$('jview').addEventListener('click',toggleJetView);
let abBtn=false;
$('jab').addEventListener('pointerdown',e=>{e.preventDefault();ensureAudio();abBtn=true;$('jab').setPointerCapture(e.pointerId)});
for(const t of ['pointerup','pointercancel'])$('jab').addEventListener(t,()=>{abBtn=false});

/* per frame */
const jv=new THREE.Vector3();
function updateJet(dt){
  if(bannerT>0&&(bannerT-=dt)<=0)$('banner').hidden=true;
  if(J.phase==='off')return;
  const fly=J.phase==='fly',live=fly&&G.on&&!G.over;
  if(J.phase!=='dead'){
    let kt=0,kp=0,want=false;
    if(live){
      kt=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x;
      kp=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joy.y;
      want=keys.has('ShiftLeft')||keys.has('ShiftRight')||abBtn;
      kt=clamp(kt,-1,1);kp=clamp(kp,-1,1);
    }
    // near the edge of the map the jet turns itself back towards the middle
    const edge=Math.abs(J.x)>MW/2-90||Math.abs(J.z)>MH/2-90;
    if(edge&&fly){
      let d=Math.atan2(J.x,J.z)-J.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));
      kt=clamp(-d*2,-1,1);
      if(!J.turning&&live)banner('Turning back','edge of the map');
      J.turning=1;
    }else J.turning=0;
    if(J.dry&&J.en>=.3)J.dry=false;
    const ab=want&&!J.dry&&J.en>0;
    if(ab&&!J.ab)whistle(250,700,.5,.06);
    J.ab=ab;
    if(ab){J.en-=dt/AB_T;if(J.en<=0){J.en=0;J.dry=true}}else J.en=Math.min(1,J.en+dt/AB_FILL);
    const vt=80+(ab?70:0);
    J.v+=(vt-J.v)*(1-Math.exp(-1.1*dt));
    J.roll+=(-kt*.95-J.roll)*(1-Math.exp(-4*dt));
    J.yaw-=kt*J_TURN*dt;
    J.pitch+=(kp*.42-J.pitch)*(1-Math.exp(-2.5*dt));
    if(J.y>290&&J.pitch>0)J.pitch*=Math.exp(-6*dt);
    const cp=Math.cos(J.pitch),fx=-Math.sin(J.yaw)*cp,fy=Math.sin(J.pitch),fz=-Math.cos(J.yaw)*cp;
    J.x+=fx*J.v*dt;J.y=Math.min(300,J.y+fy*J.v*dt);J.z+=fz*J.v*dt;
    J.x=clamp(J.x,-MW/2,MW/2);J.z=clamp(J.z,-MH/2,MH/2);
    if(live){G.t+=dt;G.stats.dist+=J.v*dt;G.stats.vmax=Math.max(G.stats.vmax||0,J.v)}
    // the ground or a roof: the end of the sortie
    if(fly&&dt>0&&(J.y<=1.5||J.y<=roofUnder(J.x,J.z)+1))crashJet();
    // pull-up warning: where the jet will be in 1.2 s is below a roof or nearly on the ground
    const ax=J.x+fx*J.v*1.2,ay=J.y+fy*J.v*1.2,az=J.z+fz*J.v*1.2;
    J.warn=fly&&(ay<6||ay<roofUnder(ax,az)+3);
    J.g.position.set(J.x,J.y,J.z);J.g.rotation.set(J.pitch,J.yaw,J.roll,'YXZ');
    const fl=.8+(ab?1.1:0);
    for(const f of J.flames){f.scale.set(1+(ab?.25:0),1,fl*(.9+rr()*.2));f.material.color.setHex(ab?0xff7a3a:0xffb060)}
    // weapons
    J.gap-=dt;
    if(J.bombs<J_MAG&&(J.rel+=dt)>=J_RELOAD){J.rel=0;J.bombs++;J.pyl[J.bombs-1].visible=true}
    if(J.bombs>=J_MAG)J.rel=0;
    if(!xhair.set){xhair.x=innerWidth/2;xhair.y=innerHeight*(J.view==='cock'?.5:.56)}
    // the impact point of a bomb dropped now (flat ground): y + vy t - g t^2 / 2 = 0
    const vy=fy*J.v-3,t=(vy+Math.sqrt(vy*vy+2*G_BOMB*Math.max(J.y,0)))/G_BOMB;
    ccip.position.set(J.x+fx*J.v*t,.6,J.z+fz*J.v*t);ccip.visible=fly;
    ccip.material.opacity=J.bombs>0?.75:.25;
  }
  // camera first, so the pointer ray below uses this frame's view
  const sy=Math.sin(J.yaw),cy=Math.cos(J.yaw),s=shake*shake*1.4,cock=J.view==='cock'&&J.phase!=='dead';
  if(J.phase!=='dead'){
    const cp=Math.cos(J.pitch),fx=-sy*cp,fy=Math.sin(J.pitch),fz=-cy*cp;
    if(cock){
      camera.position.set(J.x+fx*4.6+(rr()-.5)*s,J.y+fy*4.6+1.05+(rr()-.5)*s,J.z+fz*4.6+(rr()-.5)*s);
      camera.rotation.set(J.pitch-.05,J.yaw,J.roll,'YXZ');
    }else{
      // chase: the offset behind and above eases towards its target, so turns and climbs swing the view a little
      const k=1-Math.exp(-4*dt);
      J.ox+=(-fx*32-J.ox)*k;J.oy+=(9-fy*32-J.oy)*k;J.oz+=(-fz*32-J.oz)*k;
      camera.position.set(J.x+J.ox+(rr()-.5)*s,J.y+J.oy+(rr()-.5)*s,J.z+J.oz+(rr()-.5)*s);
      camera.lookAt(J.x+fx*45,J.y+fy*45-6,J.z+fz*45);
    }
    J.fovk+=((J.ab?1:0)-J.fovk)*(1-Math.exp(-5*dt));
    const fov=(innerWidth<innerHeight?(cock?76:66):(cock?62:52))+10*J.fovk;
    if(Math.abs(camera.fov-fov)>.05){camera.fov=fov;camera.updateProjectionMatrix()}
    cam.tx=J.x-sy*70;cam.tz=J.z-cy*70;cam.dist=170;
    fitShadow(J.x-sy*50,J.z-cy*50,170,J.yaw);
  }
  camera.updateMatrixWorld();
  if(fly){
    aimRay(xhair.x,xhair.y,aimP);
    J.gunT-=dt;
    if(J.firing&&live)while(J.gunT<=0){fireCannon();J.gunT+=1/J_RATE}
    else J.gunT=Math.max(J.gunT,0);
    // time up: the summary opens and the jet flies on behind it with nobody at the controls
    if(G.on&&!G.over&&G.t>=G.limit){J.firing=false;showSummary("Time's up")}
  }
  for(let i=jBombs.length-1;i>=0;i--){
    const b=jBombs[i],p=b.m.position;
    b.vy-=G_BOMB*dt;p.x+=b.vx*dt;p.y+=b.vy*dt;p.z+=b.vz*dt;
    b.m.lookAt(jv.set(p.x+b.vx,p.y+b.vy,p.z+b.vz));
    if(p.y<=.5||(p.y<75&&p.y<=roofUnder(p.x,p.z))){scene.remove(b.m);jBombs.splice(i,1);explode(p.x,p.z,JBOMB);continue}
  }
  for(let i=jTracers.length-1;i>=0;i--){
    const t=jTracers[i],step=650*dt;t.left-=step;
    if(t.left<=0){
      scene.remove(t.m);t.m.material.dispose();jTracers.splice(i,1);
      spark(t.tx,t.ty,t.tz);damageArea(t.tx,t.tz,3.5,J_DMG,.6,0,4);hud();
      continue;
    }
    t.m.position.x+=t.vx*step;t.m.position.y+=t.vy*step;t.m.position.z+=t.vz*step;
  }
  jetHud();
}
function jetHud(){
  $('jscore').textContent=fmt(score);$('jdown').textContent=fmt(downCount);
  const left=G.on?Math.max(0,Math.ceil(G.limit-G.t)):jetLimit;$('jtime').textContent=clock(left);
  $('jmult').textContent=combo>1&&T-lastDown<COMBO_T?'×'+combo:'';
  const kmh=Math.round(J.v*3.6),alt=Math.max(0,Math.round(J.y));
  $('jspd').textContent=kmh;$('jalt').textContent=alt;$('jhs').textContent=kmh;$('jha').textContent=alt;
  $('jbn').textContent='●'.repeat(J.bombs)+'○'.repeat(J_MAG-J.bombs);
  const jb=$('jbomb');jb.style.setProperty('--cd',J.bombs?0:(1-J.rel/J_RELOAD).toFixed(3));jb.classList[J.bombs?'remove':'add']('cool');
  const a=$('jab');a.style.setProperty('--en',J.en.toFixed(3));a.classList[J.dry?'add':'remove']('cool');a.classList[J.ab?'add':'remove']('on');
  $('jwarn').hidden=!J.warn;
  $('xhair').style.transform='translate('+xhair.x+'px,'+xhair.y+'px)';
}
