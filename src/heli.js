
/* ---------- helicopter mode ---------- */
// A two-round campaign. The helicopter flies a route on autopilot; any flying input takes over (MANUAL), and
// after HANDBACK seconds without input it steers back onto the route. You aim with the pointer, hold to fire
// the door gun and launch missiles; armed dons along the route shoot back.
const ROUNDS=[
  {name:'City centre',via:['Westgate Centre','Christ Church Cathedral','Examination Schools','Radcliffe Camera','Sheldonian Theatre','Ashmolean Museum']},
  {name:'Science Area & North',via:['Oxford University Museum of Natural History','Keble College Chapel','Andrew Wiles Building','Radcliffe Observatory','Denys Wilkinson Building','Clarendon Laboratory','Beecroft Building (Physics)']}
];
const ROUND_T=100,HANDBACK=3,AUTO_V=14,CRUISE=48;
// boost: speed multiplier, seconds a full tank lasts, seconds to refill it, and the level it must refill to after running dry
const BOOST=2.2,BOOST_T=3,BOOST_FILL=7,BOOST_MIN=.25;
// firepower by level: gun rounds per second, damage per round, missile arming time
const MK=[{rate:8,dmg:14,arm:8},{rate:12,dmg:19,arm:6},{rate:16,dmg:25,arm:4}],MK_AT=[0,2500,6000];
const MISSILE={key:'missile',R:18,dmg:170,fall:.9,shake:.8};
const H={g:null,rotor:null,tail:null,x:0,y:CRUISE,z:0,yaw:0,vx:0,vy:0,vz:0,yr:0,bank:0,
  hp:100,auto:true,idle:0,s:0,round:0,phase:'off',t:0,mk:0,gunT:0,arm:0,kills:0,waveT:0,firing:false,
  cx:0,cy:CRUISE+20,cz:0,route:null,len:0,view:'chase',mz:null};
const shots=[],tracers=[],missiles=[];
const xhair={x:innerWidth/2,y:innerHeight*.45,set:false},aimP=new THREE.Vector3();
let heliBest=0;
try{heliBest=+localStorage.getItem('oxford-break-heli-best')||0}catch(e){}

/* model: built once, facing -z. Lathe-turned fuselage, glazed nose, engine deck, four-blade rotor, open door on the right */
function heliModel(){
  const lam=c=>new THREE.MeshLambertMaterial({color:c});
  const navy=lam(0x22406a),deep=lam(0x18304f),stone=lam(0xe6bd62),dark=lam(0x1a2230),steel=lam(0x5b636d),
    glass=new THREE.MeshPhongMaterial({color:0x7fb4cc,specular:0xffffff,shininess:90,transparent:true,opacity:.8});
  const g=new THREE.Group();
  const add=(geo,mat,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0,par=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(rx,ry,rz);m.castShadow=true;par.add(m);return m};
  const cyl=(r0,r1,h,n=10)=>new THREE.CylinderGeometry(r0,r1,h,n);
  const zc=(r0,r1,h,n)=>{const c=cyl(r0,r1,h,n);c.rotateX(Math.PI/2);return c};   // cylinder along +z, r0 at the +z end
  // fuselage: a teardrop profile (radius, z) from the nose at -z to the tail join, turned on a lathe
  const prof=[[0,-4.3],[.55,-4.1],[1,-3.7],[1.38,-3],[1.62,-2],[1.72,-.8],[1.7,.6],[1.55,1.6],[1.15,2.5],[.62,3.3],[.42,3.7]].map(([r,z])=>new THREE.Vector2(r,z));
  const body=new THREE.LatheGeometry(prof,24);body.rotateX(Math.PI/2);
  add(body,navy,0,0,0,1,1.06,1);
  add(body,stone,0,-.2,0,1.02,.13,1.01);                    // the same outline squashed flat: a stone belt round the hull
  add(sphereGeo,deep,0,-.78,-.2,1.42,.72,3.1);              // belly
  // glazing: canopy bubble, chin windows, a cabin window on the left; sensor ball under the nose
  add(sphereGeo,glass,0,.32,-2.55,1.32,1.1,1.75);
  for(const s of [-1,1])add(sphereGeo,glass,s*.55,-.55,-3.35,.45,.35,.55);
  add(boxGeo,glass,-1.66,.35,-.9,.08,.62,1.15);
  add(sphereGeo,dark,0,-1.12,-3.2,.3,.3,.3);
  add(sphereGeo,glass,0,-1.15,-3.42,.16,.16,.12);
  // right side: the open door, the slid-back door panel and the door gun
  add(boxGeo,dark,1.6,.02,.15,.16,1.4,1.95);
  add(boxGeo,navy,1.76,.02,1.65,.06,1.32,1.35);
  add(boxGeo,steel,2.0,-.18,-.25,.18,.18,.5);
  add(zc(.07,.07,1,8),dark,2.0,-.18,-.95);
  // engine deck: cowling, intakes, exhausts angled out and back
  add(sphereGeo,deep,0,1.42,.7,.95,.6,2.3);
  for(const s of [-1,1]){
    add(zc(.26,.26,.3,12),dark,s*.62,1.5,-.9);
    add(cyl(.2,.26,.8),steel,s*.5,1.55,2.75,1,1,1,Math.PI/2-.35,0,s*.3);
  }
  // mast, hub, four blades with a little droop and stone tips
  add(cyl(.13,.16,.75),steel,0,2.2,0);
  add(cyl(.42,.42,.22,12),dark,0,2.55,0);
  const rotor=new THREE.Group();rotor.position.set(0,2.62,0);g.add(rotor);
  for(let k=0;k<4;k++){
    const b=new THREE.Group();b.rotation.y=k*Math.PI/2;rotor.add(b);
    add(boxGeo,dark,3.9,0,0,7.4,.07,.48,0,0,-.025,b);
    add(boxGeo,stone,7.45,-.18,0,.35,.075,.5,0,0,-.025,b);
  }
  // tail: tapered boom, swept fin, stabiliser with end plates, skid, tail rotor on the left
  add(zc(.24,.5,6.2,12),navy,0,.45,6.3,1,1,1,-.04,0,0);
  add(boxGeo,navy,0,1.55,9.2,.14,2.3,1.15,.38,0,0);
  add(boxGeo,stone,0,2.62,9.62,.15,.3,.95,.38,0,0);
  add(boxGeo,navy,0,.55,8.2,3,.08,.75);
  for(const s of [-1,1])add(boxGeo,stone,s*1.5,.75,8.25,.08,.5,.6);
  add(boxGeo,dark,0,-.3,9.4,.06,.7,.06,.5,0,0);
  const tail=new THREE.Group();tail.position.set(-.32,1.6,9.35);g.add(tail);
  add(cyl(.12,.12,.2,8),steel,0,0,0,1,1,1,0,0,Math.PI/2,tail);
  for(const a of [0,Math.PI/2])add(boxGeo,dark,0,0,0,.05,2.6,.2,a,0,0,tail);
  // skids with curled toes and raked cross tubes; stub wings with rocket pods and nav lights
  for(const s of [-1,1]){
    add(zc(.09,.09,5.4,8),dark,s*1.5,-2.15,-.1);
    add(cyl(.09,.09,.9,8),dark,s*1.5,-1.98,-3.05,1,1,1,-.9,0,0);
    for(const z of [-1.3,1.3])add(cyl(.07,.07,1.2,8),dark,s*1.25,-1.6,z,1,1,1,0,0,s*.45);
    add(boxGeo,deep,s*2.2,-.45,1.55,1.3,.12,.8);
    add(zc(.26,.26,1.5,10),dark,s*2.65,-.72,1.5);
    add(sphereGeo,stone,s*2.65,-.72,.72,.24,.24,.12);
    add(sphereGeo,new THREE.MeshBasicMaterial({color:s<0?0xff3b30:0x35e06a}),s*2.88,-.43,1.55,.09,.09,.09);
  }
  add(sphereGeo,new THREE.MeshBasicMaterial({color:0xff5a3a}),0,1.98,1.9,.11,.11,.11);
  g.scale.setScalar(1.3);
  return {g,rotor,tail};
}

/* gunner view: the camera sits in the right-hand door, looking out and down. The minigun, the gunner's gloved hands and
   the door frame live in a small scene of their own, drawn on top with a 5 cm near plane (the map camera's is 4 m). */
const GUN_PITCH=.78;
const fp={scene:new THREE.Scene(),cam:new THREE.PerspectiveCamera(60,1,.05,30),gun:null,barrels:null,flash:null,posts:[],sill:null,spin:0};
const fpV=new THREE.Vector3(),Y_UP=new THREE.Vector3(0,1,0);
function cockpitRig(){
  const lam=c=>new THREE.MeshLambertMaterial({color:c});
  const steel=lam(0x4a525c),black=lam(0x15181d),glove=lam(0x2b2420),sleeve=lam(0x22406a),cuff=lam(0xe6bd62),frame=lam(0x18304f);
  const add=(par,geo,mat,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(rx,ry,rz);par.add(m);return m};
  const cyl=(r0,r1,h,n=12)=>new THREE.CylinderGeometry(r0,r1,h,n);
  const zc=(r0,r1,h,n)=>{const c=cyl(r0,r1,h,n);c.rotateX(Math.PI/2);return c};
  fp.scene.add(new THREE.AmbientLight(0xffffff,.55));
  const L=new THREE.DirectionalLight(0xfff1dc,.85);L.position.set(1.5,3,1);fp.scene.add(L);
  // the gun looks down its +z (the barrels); the spade grips are at -z, towards the gunner
  const gun=new THREE.Group();gun.scale.setScalar(.85);fp.scene.add(gun);fp.gun=gun;
  add(gun,boxGeo,steel,0,0,0,.2,.19,.46);
  add(gun,boxGeo,black,0,.12,.02,.12,.05,.36);
  add(gun,boxGeo,black,-.14,-.04,.04,.08,.14,.22);              // feed chute
  add(gun,zc(.065,.065,.07,14),steel,0,0,.27);
  add(gun,cyl(.035,.035,.5,8),black,0,-.33,0);                  // pintle post
  const barrels=new THREE.Group();barrels.position.set(0,0,.3);gun.add(barrels);fp.barrels=barrels;
  for(let k=0;k<6;k++){const a=k*Math.PI/3;add(barrels,zc(.019,.019,.95,8),black,Math.cos(a)*.048,Math.sin(a)*.048,.47)}
  add(barrels,zc(.075,.075,.05,14),steel,0,0,.62);
  add(barrels,zc(.072,.072,.04,14),steel,0,0,.93);
  fp.flash=add(gun,sphereGeo,glow(0xffd27a,.9),0,0,1.32,.12,.12,.2);fp.flash.visible=false;
  add(gun,boxGeo,black,0,0,-.27,.38,.04,.06);
  add(gun,boxGeo,steel,0,.03,-.33,.2,.05,.02);                  // butterfly trigger
  for(const s of [-1,1]){
    add(gun,cyl(.024,.024,.17,10),black,s*.19,.01,-.32);
    // a gloved fist round each grip: palm, knuckle row, thumb on the trigger, gauntlet, stone cuff and sleeve
    const h=new THREE.Group();h.position.set(s*.19,.01,-.32);gun.add(h);
    add(h,sphereGeo,glove,s*.03,0,-.005,.052,.078,.056);
    for(let k=0;k<4;k++)add(h,sphereGeo,glove,s*.008,.052-k*.034,.042,.03,.02,.026);
    add(h,boxGeo,glove,-s*.045,.07,-.005,.075,.026,.032,0,0,-s*.2);
    const a=new THREE.Vector3(s*.04,-.03,-.05),b=new THREE.Vector3(s*.24,-.34,-.52),d=b.clone().sub(a),len=d.length();d.normalize();
    const seg=(geo,mat,f)=>{const m=add(h,geo,mat,a.x+d.x*len*f,a.y+d.y*len*f,a.z+d.z*len*f);m.quaternion.setFromUnitVectors(Y_UP,d);return m};
    seg(cyl(.05,.047,.1),glove,.06);
    seg(cyl(.054,.054,.035),cuff,.15);
    seg(cyl(.06,.05,len*.8),sleeve,.57);
  }
  // door frame: two posts on the screen edges and the cabin floor sill along the bottom (placed per frame to suit the aspect)
  for(let k=0;k<2;k++)fp.posts.push(add(fp.scene,boxGeo,frame,0,0,-1.6,.26,4.2,.16));
  fp.sill=add(fp.scene,boxGeo,frame,0,0,-1.6,5,.16,.6);
}
function toggleView(){
  if(mode!=='heli'||!H.g)return;
  H.view=H.view==='gun'?'chase':'gun';
  if(H.view==='gun'&&!fp.gun)cockpitRig();
  H.g.visible=H.view==='chase'&&H.phase!=='dead';
  H.mz=null;xhair.set=false;
  $('viewT').textContent=H.view==='gun'?'Chase view':'Gunner view';
}
function updateRig(dt){
  const c=fp.cam;
  if(c.fov!==camera.fov||c.aspect!==camera.aspect){c.fov=camera.fov;c.aspect=camera.aspect;c.updateProjectionMatrix()}
  // the barrels spin up while firing; the gun shakes and kicks back a little
  fp.spin+=((H.firing?1:0)-fp.spin)*(1-Math.exp(-6*dt));
  fp.barrels.rotation.z+=fp.spin*40*dt;
  const j=H.firing?.006:0;
  fp.gun.position.set(.16+(rr()-.5)*j,-.4+(rr()-.5)*j,-1.3+(H.firing?rr()*.012:0));
  // point it at the crosshair: the screen point as a direction in camera space
  const t=Math.tan(c.fov*Math.PI/360);
  fp.gun.lookAt(fpV.set((xhair.x/innerWidth*2-1)*t*c.aspect*40,(1-xhair.y/innerHeight*2)*t*40,-40));
  fp.flash.visible=H.firing&&rr()<.6;
  if(fp.flash.visible){fp.flash.scale.set(.08+rr()*.1,.08+rr()*.1,.2);fp.flash.rotation.z=rr()*3}
  // the muzzle in world space, where the tracers start
  fp.gun.updateMatrixWorld();fp.gun.localToWorld(fpV.set(0,0,1.3));camera.localToWorld(fpV);H.mz=[fpV.x,fpV.y,fpV.z];
  const hh=1.6*t,hw=hh*c.aspect;
  fp.posts[0].position.x=-hw-.04;fp.posts[1].position.x=hw+.04;fp.sill.position.y=-hh-.02;
}
function renderCockpit(){
  if(mode!=='heli'||H.view!=='gun'||!fp.gun||H.phase==='off'||H.phase==='dead')return;
  renderer.autoClear=false;renderer.clearDepth();renderer.render(fp.scene,fp.cam);renderer.autoClear=true;
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

/* one run: a single route per game, then the summary card */
function startCampaign(ri){
  if(!H.g){const m=heliModel();H.g=m.g;H.rotor=m.rotor;H.tail=m.tail}
  scene.add(H.g);
  H.hp=100;H.mk=0;H.kills=0;
  startRound(ri||0);
}
function startRound(i){
  reset();clearHeli();
  H.round=i;H.route=buildRoute(ROUNDS[i].via);H.s=0;H.t=ROUND_T;
  const [x,z]=routeAt(0),[x2,z2]=routeAt(30);
  H.x=x;H.z=z;H.y=CRUISE;H.vx=H.vy=H.vz=0;H.yaw=Math.atan2(-(x2-x),-(z2-z));H.auto=true;H.idle=0;H.arm=0;H.gunT=0;H.waveT=8;
  H.en=1;H.boosting=false;H.dry=false;H.fovk=0;
  H.cx=H.x+Math.sin(H.yaw)*45;H.cz=H.z+Math.cos(H.yaw)*45;H.cy=H.y+22;
  H.phase='fly';H.g.visible=H.view==='chase';H.mz=null;
  for(let k=0;k<14;k++)spawnArmed(rr()*H.route.len);
  drawRoute();
  $('hround').textContent=ROUNDS[i].name;
  banner(ROUNDS[i].name,'100 seconds');
  heliHud();
}
function endRound(){
  H.phase='done';H.firing=false;
  showSummary(H.s>=H.route.len-5?'Route complete':"Time's up");
}
function shotDown(){
  H.phase='crash';H.firing=false;H.t=0;boom(1.6);shake=1.5;
  showSummary('Shot down');   // straight to game over; the crash plays out behind the card
}
function finishCrash(){
  explode(H.x,H.z,MISSILE);H.g.visible=false;H.phase='dead';
}
function stopHeli(){H.phase='off';H.firing=false;boostBtn=false;resize();if(H.g)scene.remove(H.g);clearHeli()}
function clearHeli(){
  for(const a of [shots,tracers,missiles])a.splice(0).forEach(o=>{scene.remove(o.m);o.m.material.dispose()});
  for(let i=dons.length-1;i>=0;i--)if(dons[i].st==='arm'){scene.remove(dons[i].g);dons.splice(i,1)}
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
  if(H.view==='gun'&&H.mz)return H.mz;
  const s=Math.sin(H.yaw),c=Math.cos(H.yaw);   // the door is on the right-hand side
  return [H.x+c*2.4,H.y-.8,H.z-s*2.4];
}
const tracerGeo=new THREE.BoxGeometry(.25,.25,3.2);
function fireGun(){
  const [ox,oy,oz]=gunPos(),sp=1.6,tx=aimP.x+(rr()-.5)*sp,ty=aimP.y+(rr()-.5)*sp*.5,tz=aimP.z+(rr()-.5)*sp;
  const L=Math.hypot(tx-ox,ty-oy,tz-oz)||1;
  const m=new THREE.Mesh(tracerGeo,glow(0xffe08a,.95));m.position.set(ox,oy,oz);m.lookAt(tx,ty,tz);scene.add(m);
  if(G.stats)G.stats.weapons.rounds=(G.stats.weapons.rounds||0)+1;
  tracers.push({m,tx,ty,tz,left:L,vx:(tx-ox)/L,vy:(ty-oy)/L,vz:(tz-oz)/L});
  if(ac&&!muted&&rr()<.5){
    const t=ac.currentTime,s=ac.createBufferSource();s.buffer=noise;s.playbackRate.value=2.2;
    const g=ac.createGain();g.gain.setValueAtTime(.18,t);g.gain.exponentialRampToValueAtTime(.001,t+.06);s.connect(g).connect(out);s.start(t,rr()*.5);s.stop(t+.07);
  }
}
function fireMissile(){
  if(mode!=='heli'||H.phase!=='fly'||H.arm>0)return;
  H.arm=MK[H.mk].arm;
  if(G.stats)G.stats.weapons.missile=(G.stats.weapons.missile||0)+1;
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
// Boost is held: Shift on a keyboard, the Boost button on touch.
let boostBtn=false;
$('boost').addEventListener('pointerdown',e=>{e.preventDefault();ensureAudio();boostBtn=true;$('boost').setPointerCapture(e.pointerId)});
for(const t of ['pointerup','pointercancel'])$('boost').addEventListener(t,()=>{boostBtn=false});

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
    // W/S forward and back, A/D (or the arrows, or the joystick) turn, Q/E sideways, R/F climb and descend
    const kt=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joy.x;
    const ks=(keys.has('KeyE')?1:0)-(keys.has('KeyQ')?1:0);
    const kl=(keys.has('KeyR')?1:0)-(keys.has('KeyF')?1:0);
    if(Math.abs(kf)>.15||Math.abs(kt)>.15||ks||kl){
      if(H.auto)banner('Manual','you have the controls');
      H.auto=false;H.idle=0;
    }else if(!H.auto&&(H.idle+=dt)>HANDBACK){H.auto=true;H.s=nearestS(H.x,H.z);banner('Autopilot','back on the route')}
    // boost: drains while held, refills when released; once empty it needs BOOST_MIN back before it works again
    const want_b=keys.has('ShiftLeft')||keys.has('ShiftRight')||boostBtn;
    if(H.dry&&H.en>=BOOST_MIN)H.dry=false;
    const b=want_b&&!H.dry&&H.en>0;
    if(b&&!H.boosting)whistle(300,900,.35,.05);
    H.boosting=b;
    if(b){H.en-=dt/BOOST_T;if(H.en<=0){H.en=0;H.dry=true}}
    else H.en=Math.min(1,H.en+dt/BOOST_FILL);
    const bm=b?BOOST:1;
    const fwx=-Math.sin(H.yaw),fwz=-Math.cos(H.yaw);
    if(H.auto){
      // advance along the route while close to it; aim 40 m ahead
      const [rx,rz]=routeAt(H.s),off=Math.hypot(rx-H.x,rz-H.z);
      if(off<30)H.s+=AUTO_V*bm*dt;
      const [tx,tz]=routeAt(H.s+40*bm),want_=Math.atan2(-(tx-H.x),-(tz-H.z));
      let dy=want_-H.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));
      H.yr=clamp(dy*1.5,-1.1,1.1);
      const v=AUTO_V*bm+Math.min(14,off*.3),k=1-Math.exp(-(b?2:1.2)*dt);
      H.vx+=(fwx*v-H.vx)*k;H.vz+=(fwz*v-H.vz)*k;
      const want=clamp(Math.max(CRUISE,roofUnder(H.x+fwx*25,H.z+fwz*25)+22),30,85);
      H.vy=clamp((want-H.y)*1.2,-10,10);
      if(H.s>=H.route.len-5)H.t=Math.min(H.t,0);
    }else{
      H.yr=-kt*1.4;
      // boosting with no forward input still dashes forward
      const thrust=(b&&kf<.15?1:kf)*22*bm;
      H.vx+=fwx*thrust*dt;H.vz+=fwz*thrust*dt;
      H.vx-=fwz*ks*16*dt;H.vz+=fwx*ks*16*dt;      // right of the nose is (-fwz, fwx)
      const dr=Math.exp(-.8*dt);H.vx*=dr;H.vz*=dr;
      // R / F climb and descend; with neither held it hovers at the current height
      H.vy+=((kl?kl*12:0)-H.vy)*(1-Math.exp(-3*dt));
    }
    H.yaw+=H.yr*dt;
    if(G.on){G.t+=dt;G.stats.dist+=Math.hypot(H.vx,H.vz)*dt}
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
    if(!xhair.set){xhair.x=innerWidth/2;xhair.y=innerHeight*(H.view==='gun'?.5:.58)}
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
  const s=shake*shake*1.4,gv=H.view==='gun';
  if(gv){
    // gunner view: in the right-hand door (right of the nose is (cos yaw, -sin yaw)), looking out and down; it sways with the bank
    const d=2.3*1.3,fwd=-(H.vx*sy+H.vz*cy);
    camera.position.set(H.x+cy*d+(rr()-.5)*s,H.y-.4+(rr()-.5)*s,H.z-sy*d+(rr()-.5)*s);
    camera.rotation.set(-GUN_PITCH+H.bank*.6,H.yaw-Math.PI/2,clamp(fwd*.006,-.15,.15),'YXZ');
  }else{
    camera.position.set(H.cx+(rr()-.5)*s,H.cy+(rr()-.5)*s,H.cz+(rr()-.5)*s);
    camera.lookAt(H.x-sy*30,H.y-10,H.z-cy*30);
  }
  // the view widens a little while boosting
  H.fovk+=((H.boosting?1:0)-H.fovk)*(1-Math.exp(-5*dt));
  const fov=(innerWidth<innerHeight?(gv?74:62):(gv?60:45))+10*H.fovk;
  if(Math.abs(camera.fov-fov)>.05){camera.fov=fov;camera.updateProjectionMatrix()}
  camera.updateMatrixWorld();
  if(gv){
    cam.tx=H.x+cy*60;cam.tz=H.z-sy*60;
    fitShadow(H.x+cy*35,H.z-sy*35,120,H.yaw-Math.PI/2);
    if(fp.gun)updateRig(dt);
  }else{
    cam.tx=H.x-sy*60;cam.tz=H.z-cy*60;
    fitShadow(H.x,H.z,150,H.yaw);
  }
  cam.dist=150;
  heliHud();
}
function hurt(n){
  if(H.phase!=='fly')return;
  H.hp-=n;
  if(n>=2){clank();const e=$('hurt');e.classList.remove('go');void e.offsetWidth;e.classList.add('go')}
  if(H.hp<=0){H.hp=0;shotDown()}
}
function heliHud(){
  $('hscore').textContent=fmt(score);$('hkills').textContent=H.kills;
  const t=Math.max(0,Math.ceil(H.t));$('htime').textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
  $('hpv').textContent=Math.ceil(H.hp);$('hpfill').style.transform='scaleX('+(H.hp/100).toFixed(3)+')';
  $('hmk').textContent='MK '+['I','II','III'][H.mk];
  $('boost').style.setProperty('--en',H.en.toFixed(3));$('boost').classList[H.dry?'add':'remove']('cool');$('boost').classList[H.boosting?'add':'remove']('on');
  $('hauto').textContent=H.auto?'Autopilot':'Manual · autopilot in '+Math.max(0,Math.ceil(HANDBACK-H.idle))+'s';
  $('hauto').classList[H.auto?'remove':'add']('man');
  $('missile').style.setProperty('--cd',(H.arm/MK[H.mk].arm).toFixed(3));$('missile').classList[H.arm>0?'add':'remove']('cool');
  $('xhair').style.transform='translate('+xhair.x+'px,'+xhair.y+'px)';
  mmDot.style.left=((H.x+MW/2)/MW*100)+'%';mmDot.style.top=((H.z+MH/2)/MH*100)+'%';
}
