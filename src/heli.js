
/* ---------- helicopter mode ---------- */
// A two-round campaign. The helicopter flies a route on autopilot; any flying input takes over (MANUAL), and
// after HANDBACK seconds without input it steers back onto the route. You aim with the pointer, hold to fire
// the door gun and launch missiles; armed dons along the route shoot back.
const ROUNDS=[
  {name:'City centre',via:['Westgate Centre','Christ Church Cathedral','Examination Schools','Radcliffe Camera','Sheldonian Theatre','Ashmolean Museum']},
  {name:'Science Area & North',via:['Oxford University Museum of Natural History','Keble College Chapel','Andrew Wiles Building','Radcliffe Observatory','Denys Wilkinson Building','Clarendon Laboratory','Beecroft Building (Physics)']}
];
const ROUND_T=100,HANDBACK=3,AUTO_V=14,CRUISE=48;
// firepower by level: gun rounds per second, damage per round, missile arming time
const MK=[{rate:8,dmg:14,arm:8},{rate:12,dmg:19,arm:6},{rate:16,dmg:25,arm:4}],MK_AT=[0,2500,6000];
const MISSILE={key:'missile',R:18,dmg:170,fall:.9,shake:.8};
const H={g:null,rotor:null,tail:null,x:0,y:CRUISE,z:0,yaw:0,vx:0,vy:0,vz:0,yr:0,bank:0,
  hp:100,auto:true,idle:0,s:0,round:0,phase:'off',t:0,mk:0,gunT:0,arm:0,kills:0,down0:0,waveT:0,firing:false,
  cx:0,cy:CRUISE+20,cz:0,route:null,len:0};
const shots=[],tracers=[],missiles=[];
const xhair={x:innerWidth/2,y:innerHeight*.45,set:false},aimP=new THREE.Vector3();
let heliBest=0;
try{heliBest=+localStorage.getItem('oxford-break-heli-best')||0}catch(e){}

/* model: built once from simple solids, facing -z */
function heliModel(){
  const lam=c=>new THREE.MeshLambertMaterial({color:c});
  const navy=lam(0x22406a),stone=lam(0xe6bd62),dark=lam(0x1a2230),glass=new THREE.MeshLambertMaterial({color:0x9fc8d8,transparent:true,opacity:.8});
  const g=new THREE.Group(),add=(geo,mat,x,y,z,sx,sy,sz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;g.add(m);return m};
  add(sphereGeo,navy,0,0,0,1.9,1.5,3.2);
  add(sphereGeo,glass,0,.25,-2.1,1.4,1.05,1.5);
  add(boxGeo,stone,0,-.2,0,3.85,.35,3.6);
  const boom=new THREE.CylinderGeometry(.22,.42,6.5,8);boom.rotateX(Math.PI/2);
  add(boom,navy,0,.35,5.6,1,1,1);
  add(boxGeo,navy,0,1.25,8.6,.18,2,1.3);
  add(boxGeo,stone,0,.45,8.4,2.4,.12,.8);
  for(const s of [-1,1]){add(boxGeo,dark,s*1.35,-1.85,-.2,.18,.18,5.2);add(boxGeo,dark,s*1.1,-1.3,-1.4,.12,1,.12);add(boxGeo,dark,s*1.1,-1.3,1.1,.12,1,.12)}
  add(boxGeo,dark,0,1.55,0,.5,.6,.5);
  const rotor=new THREE.Group();rotor.position.set(0,1.95,0);g.add(rotor);
  for(const a of [0,Math.PI/2]){const b=new THREE.Mesh(boxGeo,dark);b.scale.set(15,.08,.55);b.rotation.y=a;rotor.add(b)}
  const tail=new THREE.Group();tail.position.set(.25,1.3,8.9);g.add(tail);
  for(const a of [0,Math.PI/2]){const b=new THREE.Mesh(boxGeo,dark);b.scale.set(.06,2.6,.22);b.rotation.x=a;tail.add(b)}
  g.scale.setScalar(1.3);
  return {g,rotor,tail};
}

/* route: Catmull-Rom through the landmarks of the round, resampled every 2 m */
function buildRoute(names){
  const pts=[];
  for(const n of names){
    let best=null;for(const b of buildings)if(b.name===n&&(!best||b.area>best.area))best=b;
    if(best)pts.push([best.x,best.z]);
  }
  if(pts.length<2){const c=buildings.find(b=>b.name==='Radcliffe Camera')||{x:0,z:0};pts.length=0;for(let i=0;i<6;i++)pts.push([c.x+Math.cos(i)*200,c.z+Math.sin(i)*200])}
  // lead-in: start 120 m before the first landmark
  const [ax,az]=pts[0],[bx,bz]=pts[1],l=Math.hypot(bx-ax,bz-az)||1;pts.unshift([ax-(bx-ax)/l*120,az-(bz-az)/l*120]);
  const out=[],P=i=>pts[clamp(i,0,pts.length-1)];
  for(let i=0;i<pts.length-1;i++){
    const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2),seg=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]),n=Math.max(2,Math.ceil(seg/2));
    for(let k=0;k<n;k++){
      const t=k/n,t2=t*t,t3=t2*t,f=(a,b,c,d)=>.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t2+(-a+3*b-3*c+d)*t3);
      out.push(onMap(f(p0[0],p1[0],p2[0],p3[0]),f(p0[1],p1[1],p2[1],p3[1])));
    }
  }
  out.push(pts[pts.length-1]);
  const cum=[0];for(let i=1;i<out.length;i++)cum.push(cum[i-1]+Math.hypot(out[i][0]-out[i-1][0],out[i][1]-out[i-1][1]));
  return {pts:out,cum,len:cum[cum.length-1]};
}
function routeAt(s){
  const r=H.route;s=clamp(s,0,r.len);
  let lo=0,hi=r.cum.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(r.cum[m]<=s)lo=m;else hi=m}
  const k=(s-r.cum[lo])/((r.cum[hi]-r.cum[lo])||1),a=r.pts[lo],b=r.pts[hi];
  return [a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k];
}
function nearestS(x,z){
  const r=H.route;let best=0,bd=1e18;
  for(let i=0;i<r.pts.length;i+=3){const d=(r.pts[i][0]-x)**2+(r.pts[i][1]-z)**2;if(d<bd){bd=d;best=r.cum[i]}}
  return best;
}
function drawRoute(){
  const o=mmo.getContext('2d');o.strokeStyle='rgba(230,189,98,.9)';o.lineWidth=1.6;o.setLineDash([4,3]);o.beginPath();
  H.route.pts.forEach(([x,z],i)=>i?o.lineTo(mx(x),mz(z)):o.moveTo(mx(x),mz(z)));o.stroke();o.setLineDash([]);
}

/* campaign flow */
function startCampaign(){
  if(!H.g){const m=heliModel();H.g=m.g;H.rotor=m.rotor;H.tail=m.tail}
  scene.add(H.g);
  H.hp=100;H.mk=0;H.kills=0;
  startRound(0);
}
function startRound(i){
  // the map is rebuilt for each round, but the score carries over
  const keep=[score,downCount,donCount];
  reset();clearHeli();
  if(i>0){[score,downCount,donCount]=keep;hud()}
  H.round=i;H.route=buildRoute(ROUNDS[i].via);H.s=0;H.t=ROUND_T;H.down0=downCount;H.kills0=H.kills;H.score0=score;
  const [x,z]=routeAt(0),[x2,z2]=routeAt(30);
  H.x=x;H.z=z;H.y=CRUISE;H.vx=H.vy=H.vz=0;H.yaw=Math.atan2(-(x2-x),-(z2-z));H.auto=true;H.idle=0;H.arm=0;H.gunT=0;H.waveT=8;
  H.cx=H.x+Math.sin(H.yaw)*45;H.cz=H.z+Math.cos(H.yaw)*45;H.cy=H.y+22;
  H.phase='fly';H.g.visible=true;
  for(let k=0;k<14;k++)spawnArmed(rr()*H.route.len);
  drawRoute();
  $('hround').textContent='Round '+(i+1)+' · '+ROUNDS[i].name;
  $('card').hidden=true;
  banner('Round '+(i+1),ROUNDS[i].name);
  heliHud();
}
function endRound(){
  H.phase='done';H.firing=false;
  const last=H.round===ROUNDS.length-1;
  const lines=fmt(score-H.score0)+' points · '+(H.kills-H.kills0)+' dons · '+(downCount-H.down0)+' buildings';
  if(last){
    const rec=score>heliBest;if(rec){heliBest=score;try{localStorage.setItem('oxford-break-heli-best',String(heliBest))}catch(e){}}
    showCard(rec?'New best flight!':'Campaign complete',lines+'. Total '+fmt(score)+' · best '+fmt(heliBest)+'.','Fly again',()=>startCampaign(),'Menu',()=>setMode('menu'));
  }else showCard('Round '+(H.round+1)+' clear',lines+'. HP restored to '+Math.min(100,Math.round(H.hp)+30)+'.','Next round →',()=>{H.hp=Math.min(100,H.hp+30);startRound(H.round+1)},'Menu',()=>setMode('menu'));
  saveLife();
}
function shotDown(){
  H.phase='crash';H.firing=false;H.t=0;boom(1.6);shake=1.5;
}
function finishCrash(){
  explode(H.x,H.z,MISSILE);H.g.visible=false;H.phase='dead';
  const rec=score>heliBest;if(rec){heliBest=score;try{localStorage.setItem('oxford-break-heli-best',String(heliBest))}catch(e){}}
  showCard('Shot down','Round '+(H.round+1)+' · '+fmt(score)+' points · '+H.kills+' dons. Best '+fmt(heliBest)+'.','Try again',()=>startCampaign(),'Menu',()=>setMode('menu'));
  saveLife();
}
function stopHeli(){H.phase='off';H.firing=false;if(H.g)scene.remove(H.g);clearHeli();$('card').hidden=true}
function clearHeli(){
  for(const a of [shots,tracers,missiles])a.splice(0).forEach(o=>{scene.remove(o.m);o.m.material.dispose()});
  for(let i=dons.length-1;i>=0;i--)if(dons[i].st==='arm'){scene.remove(dons[i].g);dons.splice(i,1)}
}
function showCard(t,s,a,fa,b,fb){
  $('cardT').textContent=t;$('cardS').textContent=s;
  $('cardA').textContent=a;$('cardA').onclick=fa;$('cardB').textContent=b;$('cardB').onclick=fb;
  $('card').hidden=false;
}
let bannerT=0;
function banner(t,s){$('bannerT').textContent=t;$('bannerS').textContent=s;$('banner').hidden=false;bannerT=2.4}

/* armed dons stand on open ground near the route and fire glowing rounds at where the helicopter will be */
function spawnArmed(s){
  if(dons.filter(d=>d.st==='arm').length>=22)return;
  for(let k=0;k<6;k++){
    const [x0,z0]=routeAt(s),[x1,z1]=routeAt(s+4),l=Math.hypot(x1-x0,z1-z0)||1,side=rr()<.5?-1:1,off=10+rr()*30;
    const x=x0-(z1-z0)/l*off*side,z=z0+(x1-x0)/l*off*side;
    if(insideAlive(x,z,1.2)||Math.abs(x)>MW/2||Math.abs(z)>MH/2)continue;
    const g=donMesh(x,z);
    // a gun across the chest so armed dons read differently from the ones running away
    const gun=new THREE.Mesh(boxGeo,donMat);gun.scale.set(.12,.12,.9);gun.position.set(.25,1.05,-.3);g.add(gun);
    dons.push({g,x,z,h:0,sp:0,st:'arm',t:rr()*10,tm:0,vx:0,vy:0,vz:0,fire:1+rr()*2});
    return;
  }
}
const shotMat=()=>glow(0xff5a3a,.95);
function armedDon(d,dt){
  d.g.position.set(d.x,0,d.z);
  if(H.phase!=='fly')return;
  const dx=H.x-d.x,dz=H.z-d.z;d.g.rotation.set(0,Math.atan2(-dx,-dz),0);
  if((d.fire-=dt)>0)return;
  d.fire=2.2+rr()*2.2;
  const dist=Math.hypot(dx,H.y,dz);if(dist>140)return;
  const tt=dist/45,px=H.x+H.vx*tt+(rr()-.5)*16,py=H.y+H.vy*tt+(rr()-.5)*8,pz=H.z+H.vz*tt+(rr()-.5)*16;
  const ox=d.x,oy=3.5,oz=d.z,L=Math.hypot(px-ox,py-oy,pz-oz)||1;
  const m=new THREE.Mesh(sphereGeo,shotMat());m.scale.setScalar(.7);m.position.set(ox,oy,oz);scene.add(m);
  shots.push({m,vx:(px-ox)/L*45,vy:(py-oy)/L*45,vz:(pz-oz)/L*45,life:5});
}

/* aiming: march along the pointer ray until it is under a standing roof or the ground */
function aimRay(sx,sy,out){
  ndc.set(sx/innerWidth*2-1,-(sy/innerHeight)*2+1);
  ray.setFromCamera(ndc,camera);
  const o=ray.ray.origin,d=ray.ray.direction;
  for(let t=4;t<700;t+=2.5){
    const x=o.x+d.x*t,y=o.y+d.y*t,z=o.z+d.z*t;
    if(y<=0){const tg=-o.y/(d.y||-1e-6);return out.set(o.x+d.x*tg,0,o.z+d.z*tg)}
    if(y>75)continue;
    let hit=false;
    nearBuildings(x,z,.5,b=>{
      if(hit||b.dead||y>b.h*b.s||x<b.minx||x>b.maxx||z<b.minz||z>b.maxz||!inPoly(b.r,x,z))return;
      for(const h of b.holes)if(inPoly(h,x,z))return;
      hit=true;
    });
    if(hit)return out.set(x,y,z);
  }
  return out.set(o.x+d.x*700,0,o.z+d.z*700);
}
function gunPos(){
  const s=Math.sin(H.yaw),c=Math.cos(H.yaw);   // the door is on the right-hand side
  return [H.x+c*2.4,H.y-.8,H.z-s*2.4];
}
const tracerGeo=new THREE.BoxGeometry(.25,.25,3.2);
function fireGun(){
  const [ox,oy,oz]=gunPos(),sp=1.6,tx=aimP.x+(rr()-.5)*sp,ty=aimP.y+(rr()-.5)*sp*.5,tz=aimP.z+(rr()-.5)*sp;
  const L=Math.hypot(tx-ox,ty-oy,tz-oz)||1;
  const m=new THREE.Mesh(tracerGeo,glow(0xffe08a,.95));m.position.set(ox,oy,oz);m.lookAt(tx,ty,tz);scene.add(m);
  tracers.push({m,tx,ty,tz,left:L,vx:(tx-ox)/L,vy:(ty-oy)/L,vz:(tz-oz)/L});
  if(ac&&!muted&&rr()<.5){
    const t=ac.currentTime,s=ac.createBufferSource();s.buffer=noise;s.playbackRate.value=2.2;
    const g=ac.createGain();g.gain.setValueAtTime(.18,t);g.gain.exponentialRampToValueAtTime(.001,t+.06);s.connect(g).connect(out);s.start(t,rr()*.5);s.stop(t+.07);
  }
}
function fireMissile(){
  if(mode!=='heli'||H.phase!=='fly'||H.arm>0)return;
  H.arm=MK[H.mk].arm;
  const [ox,oy,oz]=gunPos(),tx=aimP.x,ty=aimP.y,tz=aimP.z,L=Math.hypot(tx-ox,ty-oy,tz-oz)||1;
  const m=new THREE.Mesh(tracerGeo,glow(0xffffff,1));m.scale.set(2,2,.9);m.position.set(ox,oy,oz);m.lookAt(tx,ty,tz);scene.add(m);
  missiles.push({m,tx,ty,tz,left:L,vx:(tx-ox)/L,vy:(ty-oy)/L,vz:(tz-oz)/L,smoke:0});
  whistle(500,1400,.5,.06);
}
function spark(x,y,z){
  const m=new THREE.Mesh(sphereGeo,glow(0xffd27a,.95));m.position.set(x,y+.3,z);
  addFx(m,.25,f=>{m.scale.setScalar(.6+f*2.2);m.material.opacity=.95*(1-f)});
}

/* input: hold the pointer to fire; on touch the joystick (bottom-left) flies, drags elsewhere aim and fire */
const joy={id:null,x:0,y:0,ox:0,oy:0};
cv.addEventListener('pointerdown',e=>{
  if(mode!=='heli')return;
  cv.setPointerCapture(e.pointerId);
  xhair.x=e.clientX;xhair.y=e.clientY;xhair.set=true;
  if(e.button===2){fireMissile();return}
  H.firing=true;H.firePtr=e.pointerId;
});
cv.addEventListener('pointermove',e=>{
  if(mode!=='heli')return;
  if(e.pointerType==='mouse'||e.pointerId===H.firePtr){xhair.x=e.clientX;xhair.y=e.clientY;xhair.set=true}
});
const heliUp=e=>{if(e.pointerId===H.firePtr){H.firing=false;H.firePtr=null}};
cv.addEventListener('pointerup',heliUp);cv.addEventListener('pointercancel',heliUp);
$('joy').addEventListener('pointerdown',e=>{
  e.preventDefault();$('joy').setPointerCapture(e.pointerId);
  const r=$('joy').getBoundingClientRect();joy.id=e.pointerId;joy.ox=r.left+r.width/2;joy.oy=r.top+r.height/2;joyMove(e);
});
function joyMove(e){
  if(e.pointerId!==joy.id)return;
  const r=$('joy').offsetWidth/2||60,dx=clamp((e.clientX-joy.ox)/r,-1,1),dy=clamp((e.clientY-joy.oy)/r,-1,1);
  joy.x=dx;joy.y=dy;$('joyk').style.transform='translate('+(dx*r*.6)+'px,'+(dy*r*.6)+'px)';
}
$('joy').addEventListener('pointermove',joyMove);
const joyEnd=e=>{if(e.pointerId!==joy.id)return;joy.id=null;joy.x=joy.y=0;$('joyk').style.transform=''};
$('joy').addEventListener('pointerup',joyEnd);$('joy').addEventListener('pointercancel',joyEnd);
$('missile').addEventListener('click',()=>{ensureAudio();fireMissile()});

/* per frame */
function roofUnder(x,z){
  let top=0;
  nearBuildings(x,z,3,b=>{if(!b.dead&&bDist(b,x,z,3)<3)top=Math.max(top,b.h*b.s)});
  return top;
}
const hv=new THREE.Vector3();
function updateHeli(dt){
  if(bannerT>0&&(bannerT-=dt)<=0)$('banner').hidden=true;
  if(H.phase==='off')return;
  const fly=H.phase==='fly';
  if(fly){
    H.t-=dt;
    // input
    const kf=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-joy.y;
    const kt=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x;
    const kl=(keys.has('Space')?1:0)-(keys.has('ShiftLeft')||keys.has('ShiftRight')?1:0);
    if(Math.abs(kf)>.15||Math.abs(kt)>.15||kl){
      if(H.auto)banner('Manual','you have the controls');
      H.auto=false;H.idle=0;
    }else if(!H.auto&&(H.idle+=dt)>HANDBACK){H.auto=true;H.s=nearestS(H.x,H.z);banner('Autopilot','back on the route')}
    const fwx=-Math.sin(H.yaw),fwz=-Math.cos(H.yaw);
    if(H.auto){
      // advance along the route while close to it; aim 40 m ahead
      const [rx,rz]=routeAt(H.s),off=Math.hypot(rx-H.x,rz-H.z);
      if(off<30)H.s+=AUTO_V*dt;
      const [tx,tz]=routeAt(H.s+40),want_=Math.atan2(-(tx-H.x),-(tz-H.z));
      let dy=want_-H.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));
      H.yr=clamp(dy*1.5,-1.1,1.1);
      const v=AUTO_V+Math.min(14,off*.3),k=1-Math.exp(-1.2*dt);
      H.vx+=(fwx*v-H.vx)*k;H.vz+=(fwz*v-H.vz)*k;
      const want=clamp(Math.max(CRUISE,roofUnder(H.x+fwx*25,H.z+fwz*25)+22),30,85);
      H.vy=clamp((want-H.y)*1.2,-10,10);
      if(H.s>=H.route.len-5)H.t=Math.min(H.t,0);
    }else{
      H.yr=-kt*1.4;
      H.vx+=fwx*kf*22*dt;H.vz+=fwz*kf*22*dt;
      const dr=Math.exp(-.8*dt);H.vx*=dr;H.vz*=dr;
      // Space / Shift climb and descend; with neither held it hovers at the current height
      H.vy+=((kl?kl*12:0)-H.vy)*(1-Math.exp(-3*dt));
    }
    H.yaw+=H.yr*dt;
  }else if(H.phase==='crash'){
    H.t+=dt;H.yr=4;H.yaw+=H.yr*dt;H.vy-=18*dt;H.vx*=.99;H.vz*=.99;
    if(rr()<.5){const m=new THREE.Mesh(sphereGeo,glow(0x3a3a3a,.6));m.position.set(H.x,H.y,H.z);addFx(m,1.2,f=>{m.scale.setScalar(1.5+f*4);m.material.opacity=.6*(1-f)})}
  }
  if(fly||H.phase==='crash'){
    H.x+=H.vx*dt;H.y+=H.vy*dt;H.z+=H.vz*dt;
    [H.x,H.z]=onMap(H.x,H.z);H.y=Math.min(H.y,95);
    const roof=roofUnder(H.x,H.z);
    if(H.phase==='crash'&&(H.y<=roof+1||H.y<=1))finishCrash();
    else if(H.y<roof+4){H.y=roof+4;H.vy=Math.max(H.vy,0);if(fly){hurt(14*dt)}}
    else if(H.y<12){H.y=12;H.vy=Math.max(0,H.vy)}
  }
  if(H.g&&H.g.visible){
    const fwd=-(H.vx*Math.sin(H.yaw)+H.vz*Math.cos(H.yaw));
    H.bank+=(clamp(-H.yr*.35,-.5,.5)-H.bank)*(1-Math.exp(-4*dt));
    H.g.position.set(H.x,H.y,H.z);H.g.rotation.set(-clamp(fwd*.012,-.25,.25),H.yaw,H.bank,'YXZ');
    H.rotor.rotation.y+=dt*38;H.tail.rotation.x+=dt*50;
  }
  if(fly){
    // weapons
    const lvl=score>=MK_AT[2]?2:score>=MK_AT[1]?1:0;
    if(lvl>H.mk){H.mk=lvl;banner('MK '+['I','II','III'][lvl],'more firepower');whistle(400,1200,.4,.06)}
    H.arm=Math.max(0,H.arm-dt);
    if(!xhair.set){xhair.x=innerWidth/2;xhair.y=innerHeight*.58}
    aimRay(xhair.x,xhair.y,aimP);
    H.gunT-=dt;
    if(H.firing)while(H.gunT<=0){fireGun();H.gunT+=1/MK[H.mk].rate}
    else H.gunT=Math.max(H.gunT,0);
    // more armed dons further along the route
    if((H.waveT-=dt)<=0){H.waveT=10;for(let k=0;k<4;k++)spawnArmed(H.s+80+rr()*200)}
    if(H.t<=0)endRound();
  }
  for(let i=tracers.length-1;i>=0;i--){
    const t=tracers[i],step=420*dt;t.left-=step;
    if(t.left<=0){
      scene.remove(t.m);t.m.material.dispose();tracers.splice(i,1);
      spark(t.tx,t.ty,t.tz);damageArea(t.tx,t.tz,3.5,MK[H.mk].dmg,.6,0,4);hud();
      continue;
    }
    t.m.position.x+=t.vx*step;t.m.position.y+=t.vy*step;t.m.position.z+=t.vz*step;
  }
  for(let i=missiles.length-1;i>=0;i--){
    const t=missiles[i],step=130*dt;t.left-=step;
    if(t.left<=0){scene.remove(t.m);t.m.material.dispose();missiles.splice(i,1);explode(t.tx,t.tz,MISSILE);continue}
    t.m.position.x+=t.vx*step;t.m.position.y+=t.vy*step;t.m.position.z+=t.vz*step;
    if((t.smoke-=dt)<=0){t.smoke=.03;const m=new THREE.Mesh(sphereGeo,glow(0xcfc8bc,.5));m.position.copy(t.m.position);addFx(m,.8,f=>{m.scale.setScalar(.6+f*2);m.material.opacity=.5*(1-f)})}
  }
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.life-=dt;
    s.m.position.x+=s.vx*dt;s.m.position.y+=s.vy*dt;s.m.position.z+=s.vz*dt;
    const p=s.m.position;
    if(fly&&Math.hypot(p.x-H.x,p.y-H.y,p.z-H.z)<3.4){hurt(6);s.life=0}
    if(s.life<=0||p.y<0){scene.remove(s.m);s.m.material.dispose();shots.splice(i,1)}
  }
  // chase camera: behind and above, looking a little ahead and down
  const sy=Math.sin(H.yaw),cy=Math.cos(H.yaw),k=1-Math.exp(-3.5*dt);
  H.cx+=(H.x+sy*44-H.cx)*k;H.cz+=(H.z+cy*44-H.cz)*k;H.cy+=(H.y+22-H.cy)*k;
  const s=shake*shake*1.4;
  camera.position.set(H.cx+(rr()-.5)*s,H.cy+(rr()-.5)*s,H.cz+(rr()-.5)*s);
  camera.lookAt(H.x-sy*30,H.y-10,H.z-cy*30);
  cam.tx=H.x-sy*60;cam.tz=H.z-cy*60;cam.dist=150;
  fitShadow(H.x,H.z,150,H.yaw);
  heliHud();
}
function hurt(n){
  if(H.phase!=='fly')return;
  H.hp-=n;
  if(n>=2){const e=$('hurt');e.classList.remove('go');void e.offsetWidth;e.classList.add('go')}
  if(H.hp<=0){H.hp=0;shotDown()}
}
function heliHud(){
  $('hscore').textContent=fmt(score);$('hkills').textContent=H.kills;
  const t=Math.max(0,Math.ceil(H.t));$('htime').textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
  $('hpv').textContent=Math.ceil(H.hp);$('hpfill').style.transform='scaleX('+(H.hp/100).toFixed(3)+')';
  $('hmk').textContent='MK '+['I','II','III'][H.mk];
  $('hauto').textContent=H.auto?'Autopilot':'Manual · autopilot in '+Math.max(0,Math.ceil(HANDBACK-H.idle))+'s';
  $('hauto').classList[H.auto?'remove':'add']('man');
  $('missile').style.setProperty('--cd',(H.arm/MK[H.mk].arm).toFixed(3));$('missile').classList[H.arm>0?'add':'remove']('cool');
  $('xhair').style.transform='translate('+xhair.x+'px,'+xhair.y+'px)';
  mmDot.style.left=((H.x+MW/2)/MW*100)+'%';mmDot.style.top=((H.z+MH/2)/MH*100)+'%';
}
