(function(){
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rr=Math.random;
const hash=(a,b)=>{let h=Math.imul(a|0,374761393)+Math.imul(b|0,668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296};
const R_BOMB=12;
const D=JSON.parse($('data').textContent);
const MW=D.s[0],MH=D.s[1];
const CH=200;                       // chunk size in metres
const C3=h=>{const c=new THREE.Color(h);return[c.r,c.g,c.b]};

/* ---------- renderer, camera, light ---------- */
const renderer=new THREE.WebGLRenderer({canvas:$('c'),antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.shadowMap.enabled=true;
const SKY=0xaebfcc;
const scene=new THREE.Scene();
scene.background=new THREE.Color(SKY);
scene.fog=new THREE.Fog(SKY,380,1500);
const camera=new THREE.PerspectiveCamera(45,1,4,3200);
scene.add(new THREE.HemisphereLight(0xe3ecf5,0x6f7a58,.62));
const sunT=new THREE.Object3D();scene.add(sunT);
const sun=new THREE.DirectionalLight(0xfff0d2,.8);
const SM=Math.min(innerWidth<700?2048:4096,renderer.capabilities.maxTextureSize);
sun.target=sunT;sun.castShadow=true;sun.shadow.mapSize.set(SM,SM);
Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,near:100,far:1700});
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias=-.00015;sun.shadow.normalBias=.4;
scene.add(sun);

/* ---------- textures and materials ---------- */
function makeWinTex(){
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,64,64);
  g.fillStyle='#d4d4d4';g.fillRect(16,12,32,40);
  g.fillStyle='#3e4a56';g.fillRect(18,14,28,36);
  g.fillStyle='#6b7c8d';g.fillRect(18,14,28,10);
  g.fillStyle='#d4d4d4';g.fillRect(31,14,2,36);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
const winTex=makeWinTex();
// triFace keeps every face wound outward, so back faces can be culled; shadows still use both sides as before.
const bMat=new THREE.MeshLambertMaterial({map:winTex,vertexColors:true});
bMat.shadowSide=THREE.DoubleSide;
const gMat=new THREE.MeshLambertMaterial({vertexColors:true});

/* ---------- chunked geometry ---------- */
class Chunks{
  constructor(){this.m=new Map()}
  get(x,z){
    const ix=Math.floor(x/CH),iz=Math.floor(z/CH),k=ix*4096+iz;
    let c=this.m.get(k);
    if(!c){c={pos:[],nor:[],col:[],uv:[],idx:[],n:0,cx:(ix+.5)*CH,cz:(iz+.5)*CH};this.m.set(k,c)}
    return c;
  }
}
function pushV(c,x,y,z,nx,ny,nz,col,u,v){
  c.pos.push(x,y,z);c.nor.push(nx,ny,nz);c.col.push(col[0],col[1],col[2]);c.uv.push(u,v);return c.n++;
}
// Push a triangle wound so that its geometric normal agrees with the stored vertex normal.
function triFace(c,a,b,d){
  const p=c.pos,o=c.nor;
  const ax=p[a*3],ay=p[a*3+1],az=p[a*3+2];
  const ux=p[b*3]-ax,uy=p[b*3+1]-ay,uz=p[b*3+2]-az,vx=p[d*3]-ax,vy=p[d*3+1]-ay,vz=p[d*3+2]-az;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  if(nx*o[a*3]+ny*o[a*3+1]+nz*o[a*3+2]<0)c.idx.push(a,d,b);else c.idx.push(a,b,d);
}
function finish(chunks,mat,cast,recv,keepBase){
  const list=[];
  chunks.m.forEach(c=>{
    const geo=new THREE.BufferGeometry();
    c.posA=new Float32Array(c.pos);c.colA=new Float32Array(c.col);
    geo.setAttribute('position',new THREE.BufferAttribute(c.posA,3));
    geo.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(c.nor),3));
    geo.setAttribute('color',new THREE.BufferAttribute(c.colA,3));
    geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(c.uv),2));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(c.idx),1));
    geo.computeBoundingSphere();
    const m=new THREE.Mesh(geo,mat);m.castShadow=cast;m.receiveShadow=recv;
    scene.add(m);c.mesh=m;c.geo=geo;
    if(keepBase){
      c.baseY=new Float32Array(c.n);for(let i=0;i<c.n;i++)c.baseY[i]=c.posA[i*3+1];
      c.col0=new Float32Array(c.colA);
    }
    c.pos=c.nor=c.col=c.uv=c.idx=null;list.push(c);
  });
  return list;
}

/* ---------- buildings ---------- */
const WALL=[
  [0xcdbf9a,0xc9bea5,0xbfb394],                                   // church
  [0xb5755a,0xc08565,0xd8c9a8,0xcfc0a0,0xa9694f,0xdacdb6],         // residential
  [0x9c9a92,0x8e8c85,0xa79f90],                                   // shed
  [0xd6b97b,0xcfae6e,0xdcc48c,0xc9a96a],                          // college / university
  [0xc9bda5,0xb8ad98,0xd3c8b0,0xa99d88,0xbfa58a]                  // other
].map(a=>a.map(C3));
const ROOF_RES=[0x7b4a3b,0x5a4a46,0x4e5760,0x8a5642].map(C3);
const ROOF_OTH=[0x55606a,0x4a535c,0x6a6f73].map(C3);
const ROOF_FLAT=[0x8d8f8f,0x7e8082,0x9a9a96].map(C3);
const DOME=[0x7f8c8d,0x74817f].map(C3);
const CHAR=C3(0x40382f);

const LANDMARK_H={'Radcliffe Camera':19,'Sheldonian Theatre':13,'Carfax Tower':22,'Clarendon Building':16,'Bodleian Library':17,
  'Christ Church Cathedral':22,'Tom Tower':26,'Oxford University Museum of Natural History':16,'Examination Schools':17,'Covered Market':8,
  'Ashmolean Museum':18,'Radcliffe Observatory':24,'Wolfson Library':16};
const bChunks=new Chunks();
const buildings=[];
const GC=40,gk=(ix,iz)=>(ix+200)*1024+(iz+200);
const bGrid=new Map();
let stamp=0;

function ringArea(r){let a=0;const n=r.length/2;for(let i=0;i<n;i++){const j=(i+1)%n;a+=r[i*2]*r[j*2+1]-r[j*2]*r[i*2+1]}return a/2}
function inPoly(r,x,z){
  let c=false;const n=r.length;
  for(let i=0,j=n-2;i<n;j=i,i+=2){
    const xi=r[i],zi=r[i+1],xj=r[j],zj=r[j+1];
    if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)c=!c;
  }
  return c;
}
function segD2(x,z,ax,az,bx,bz){
  const dx=bx-ax,dz=bz-az,l=dx*dx+dz*dz;
  let t=l?((x-ax)*dx+(z-az)*dz)/l:0;t=t<0?0:t>1?1:t;
  const px=ax+t*dx-x,pz=az+t*dz-z;return px*px+pz*pz;
}
function bDist(b,x,z){
  if(x<b.minx-R_BOMB||x>b.maxx+R_BOMB||z<b.minz-R_BOMB||z>b.maxz+R_BOMB)return 1e9;
  if(x>=b.minx&&x<=b.maxx&&z>=b.minz&&z<=b.maxz&&inPoly(b.r,x,z)){
    let inHole=false;for(const h of b.holes)if(inPoly(h,x,z)){inHole=true;break}
    if(!inHole)return 0;
  }
  let d=1e18;
  const rings=[b.r].concat(b.holes);
  for(const r of rings){
    const n=r.length;
    for(let i=0,j=n-2;i<n;j=i,i+=2){const e=segD2(x,z,r[j],r[j+1],r[i],r[i+1]);if(e<d)d=e}
  }
  return Math.sqrt(d);
}
function nearBuildings(x,z,rad,fn){
  stamp++;
  const x0=Math.floor((x-rad)/GC),x1=Math.floor((x+rad)/GC),z0=Math.floor((z-rad)/GC),z1=Math.floor((z+rad)/GC);
  for(let ix=x0;ix<=x1;ix++)for(let iz=z0;iz<=z1;iz++){
    const l=bGrid.get(gk(ix,iz));if(!l)continue;
    for(const b of l){if(b.stamp===stamp)continue;b.stamp=stamp;fn(b)}
  }
}
function insideAlive(x,z,pad){
  let hit=false;
  nearBuildings(x,z,2,b=>{
    if(hit||b.dead)return;
    if(x<b.minx-pad||x>b.maxx+pad||z<b.minz-pad||z>b.maxz+pad)return;
    if(pad>0){if(bDist(b,x,z)<=pad)hit=true;return}
    if(inPoly(b.r,x,z)){let ih=false;for(const h of b.holes)if(inPoly(h,x,z)){ih=true;break}if(!ih)hit=true}
  });
  return hit;
}

/* ---------- roofs, landmarks, building assembly ---------- */
// Hand-set roofs for recognisable buildings: wh = wall height, tan = roof pitch, rm = max rise, col = roof colour.
const LM={
  'Radcliffe Camera':{wh:20,wc:0xd8c79b,s:'dome',rise:9.5,col:0x7f9aa8,cup:{r:2.6,h:3.8,col:0xd8c79b,dome:2.2,dcol:0x7f9aa8}},
  'Sheldonian Theatre':{wh:11,s:'field',tan:.28,rm:3.2,col:0x7ea08a,cup:{r:3.1,h:3.6,col:0xd8c79b,dome:2.4,dcol:0x7ea08a}},
  'Clarendon Building':{wh:15,s:'field',tan:.2,rm:2.2,col:0x8a9a96,cup:{r:2.2,h:2.6,col:0xd8c79b,dome:1.6,dcol:0x8a9a96}},
  'Bodleian Library':{wh:15,s:'field',tan:.5,rm:4.5,col:0x8c8674},
  'Christ Church Cathedral':{wh:15,s:'field',tan:.9,rm:7,col:0x626a72,spire:{r:3,H:20,col:0xcdbf9e}},
  'Exeter College Chapel':{wh:15,s:'field',tan:.95,rm:7,col:0x5f666d,spire:{r:.9,H:9,col:0x5f666d}},
  'St Mary the Virgin':{wh:14,s:'field',tan:.8,rm:6,col:0x626a72},
  'The Covered Market':{wh:8,s:'field',tan:.35,rm:3,col:0x6a7078},
  'Examination Schools':{wh:16,s:'field',tan:.45,rm:5,col:0x666e75},
  'Ashmolean Museum':{wh:16,s:'flat',col:0x8d9390},
  'Oxford University Museum of Natural History':{wh:15,s:'field',tan:.5,rm:5,col:0x6b7780},
  'Radcliffe Observatory':{wh:15,s:'field',tan:.4,rm:3,col:0x7da594},
  'Oxford Town Hall':{wh:18,s:'field',tan:.5,rm:5,col:0x666d74},
  'Westgate Centre':{s:'flat',col:0x808284},
  'Carfax Tower':{wh:23,s:'flat',col:0x9a9482}
};
const SLATE=[0x5e676f,0x666d74,0x585f67,0x6b7076].map(C3);
const TILE=[0xa4553b,0x9a5039,0xb0634a,0x8d4a3a].map(C3);
const STONESL=[0x8a8474,0x7d786b].map(C3);
const FLATC=[0x76787a,0x6e7173,0x84827d].map(C3);
const BRICKW=[0xa9654c,0xb5755a,0x9c5a44].map(C3),PLASTW=[0xe0d6bf,0xd8cdb4].map(C3),CONCW=[0xb4b0a6,0xa9a59b].map(C3);
const CHIMNEY=C3(0x94553f);
const MATC={slate:0x5e676f,tile:0xa4553b,concrete:0x7f7f7b,metal:0x7b8791,copper:0x6aa392,tar_paper:0x4a4a4a,glass:0x9fc0bd,stone:0x8a8474};
function pickRoof(id,k,cx,cz,ex,lm,flat){
  if(lm&&lm.col!=null)return C3(lm.col);
  if(ex&&ex.c!=null)return C3(ex.c);
  if(ex&&ex.m&&MATC[ex.m]!=null)return C3(MATC[ex.m]);
  const u=hash(id,2),cen=Math.hypot(cx+1243,cz-1161)<1000;
  if(flat)return FLATC[(u*3)|0];
  if(k===3||k===0)return u<.2?STONESL[(hash(id,3)*2)|0]:SLATE[(hash(id,4)*4)|0];
  if(k===1)return u<(cen?.35:.65)?TILE[(hash(id,4)*4)|0]:SLATE[(hash(id,5)*4)|0];
  return u<.2?TILE[(hash(id,4)*4)|0]:SLATE[(hash(id,5)*4)|0];
}
function pickWall(id,k,ex,lm){
  if(lm&&lm.wc!=null)return C3(lm.wc);
  if(ex&&ex.wc!=null)return C3(ex.wc);
  if(ex&&ex.w==='b')return BRICKW[(hash(id,1)*3)|0];
  if(ex&&ex.w==='s')return WALL[3][(hash(id,1)*4)|0];
  if(ex&&ex.w==='p')return PLASTW[(hash(id,1)*2)|0];
  if(ex&&ex.w==='c')return CONCW[(hash(id,1)*2)|0];
  const wp=WALL[k]||WALL[4];return wp[(hash(id,1)*wp.length)|0];
}

/* small solids used for chimneys, lanterns, domes and spires; all pushed into the building's own range */
function addBox(c,cx,cz,sx,sz,y0,y1,col,ux,uz){
  const vx=-uz,vz=ux,hx=sx/2,hz=sz/2;
  const cs=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([a,b])=>[cx+a*ux+b*vx,cz+a*uz+b*vz]);
  for(let i=0;i<4;i++){
    const p=cs[i],q=cs[(i+1)%4],dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz)||1,nx=dz/l,nz=-dx/l;
    const sg=((p[0]+q[0])/2-cx)*nx+((p[1]+q[1])/2-cz)*nz>0?1:-1;
    const a=pushV(c,p[0],y0,p[1],sg*nx,0,sg*nz,col,.02,.02),b=pushV(c,q[0],y0,q[1],sg*nx,0,sg*nz,col,.02,.02),
          d=pushV(c,q[0],y1,q[1],sg*nx,0,sg*nz,col,.02,.02),e=pushV(c,p[0],y1,p[1],sg*nx,0,sg*nz,col,.02,.02);
    triFace(c,a,b,d);triFace(c,a,d,e);
  }
  const t=cs.map(p=>pushV(c,p[0],y1,p[1],0,1,0,col,.02,.02));
  triFace(c,t[0],t[1],t[2]);triFace(c,t[0],t[2],t[3]);
}
function addPrism(c,cx,cz,r,sides,y0,y1,col,rot){
  const ctr=pushV(c,cx,y1,cz,0,1,0,col,.02,.02);
  for(let i=0;i<sides;i++){
    const a0=rot+i/sides*6.2832,a1=rot+(i+1)/sides*6.2832,am=(a0+a1)/2,nx=Math.cos(am),nz=Math.sin(am);
    const x0=cx+Math.cos(a0)*r,z0=cz+Math.sin(a0)*r,x1=cx+Math.cos(a1)*r,z1=cz+Math.sin(a1)*r;
    const a=pushV(c,x0,y0,z0,nx,0,nz,col,.02,.02),b=pushV(c,x1,y0,z1,nx,0,nz,col,.02,.02),
          d=pushV(c,x1,y1,z1,nx,0,nz,col,.02,.02),e=pushV(c,x0,y1,z0,nx,0,nz,col,.02,.02);
    triFace(c,a,b,d);triFace(c,a,d,e);
    const p0=pushV(c,x0,y1,z0,0,1,0,col,.02,.02),p1=pushV(c,x1,y1,z1,0,1,0,col,.02,.02);
    triFace(c,ctr,p0,p1);
  }
}
function addCone(c,cx,cz,r,sides,y0,y1,col,rot){
  const H=y1-y0;
  for(let i=0;i<sides;i++){
    const a0=rot+i/sides*6.2832,a1=rot+(i+1)/sides*6.2832,am=(a0+a1)/2;
    let nx=Math.cos(am)*H,ny=r,nz=Math.sin(am)*H;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    const a=pushV(c,cx+Math.cos(a0)*r,y0,cz+Math.sin(a0)*r,nx,ny,nz,col,.02,.02),
          b=pushV(c,cx+Math.cos(a1)*r,y0,cz+Math.sin(a1)*r,nx,ny,nz,col,.02,.02),
          t=pushV(c,cx,y1,cz,nx,ny,nz,col,.02,.02);
    triFace(c,a,b,t);
  }
}
function addDome(c,cx,cz,r,y0,rise,col){
  const R=6,S=16,idx=[];
  for(let j=0;j<=R;j++){
    const s=j/R,rho=r*s,y=y0+rise*Math.sqrt(Math.max(0,1-s*s)),row=[];
    for(let i=0;i<S;i++){
      const a=i/S*6.2832,dx=Math.cos(a)*rho,dz=Math.sin(a)*rho;
      let nx=dx/(r*r),ny=(y-y0)/(rise*rise),nz=dz/(r*r);
      const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
      if(j===0){nx=0;ny=1;nz=0}
      row.push(pushV(c,cx+dx,y,cz+dz,nx,ny,nz,col,.02,.02));
    }
    idx.push(row);
  }
  for(let j=0;j<R;j++)for(let i=0;i<S;i++){
    const i2=(i+1)%S;
    triFace(c,idx[j][i],idx[j+1][i],idx[j+1][i2]);
    if(j>0)triFace(c,idx[j][i],idx[j+1][i2],idx[j][i2]);
  }
}

/* oriented bounding box, long axis first */
function obb(r,n){
  let best=null;
  for(let i=0;i<n;i++){
    const j=(i+1)%n,dx=r[j*2]-r[i*2],dz=r[j*2+1]-r[i*2+1],l=Math.hypot(dx,dz);if(l<.5)continue;
    const ux=dx/l,uz=dz/l,vx=-uz,vz=ux;
    let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(let q=0;q<n;q++){
      const u=r[q*2]*ux+r[q*2+1]*uz,v=r[q*2]*vx+r[q*2+1]*vz;
      if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;
    }
    const a=(u1-u0)*(v1-v0);
    if(!best||a<best.a)best={a,ux,uz,vx,vz,u0,u1,v0,v1};
  }
  if(!best)return null;
  if(best.v1-best.v0>best.u1-best.u0){const o=best;return{a:o.a,ux:o.vx,uz:o.vz,vx:-o.ux,vz:-o.uz,u0:o.v0,u1:o.v1,v0:-o.u1,v1:-o.u0}}
  return best;
}
// One roof face from three points; sloped faces are roof-coloured, vertical gable ends take the wall colour.
function roofFace(c,A,B,Q,rc,wc,cx,cz){
  const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=Q[0]-A[0],vy=Q[1]-A[1],vz=Q[2]-A[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const l=Math.hypot(nx,ny,nz);if(l<1e-6)return;nx/=l;ny/=l;nz/=l;
  let col=rc;
  if(Math.abs(ny)<.25){
    col=wc;const mx=(A[0]+B[0]+Q[0])/3-cx,mz=(A[2]+B[2]+Q[2])/3-cz;
    if(nx*mx+nz*mz<0){nx=-nx;ny=-ny;nz=-nz}
  }else if(ny<0){nx=-nx;ny=-ny;nz=-nz}
  const a=pushV(c,A[0],A[1],A[2],nx,ny,nz,col,.02,.02),b=pushV(c,B[0],B[1],B[2],nx,ny,nz,col,.02,.02),d=pushV(c,Q[0],Q[1],Q[2],nx,ny,nz,col,.02,.02);
  triFace(c,a,b,d);
}
// Exact gable or hip roof for simple, roughly rectangular footprints. Returns the roof rise, or -1 if the footprint is not suitable.
function ridgeRoof(c,r,n,h,area,shape,tan,rc,wc,cx,cz,chim,id){
  if(n<3||n>10)return -1;
  const ob=obb(r,n);if(!ob)return -1;
  const L=ob.u1-ob.u0,W=ob.v1-ob.v0;
  if(W<2.2||area/(L*W)<.72)return -1;
  const vc=(ob.v0+ob.v1)/2,hw=W/2,rh=Math.min(hw*tan,6.5);
  let ru0=shape==='gable'?ob.u0:ob.u0+hw,ru1=shape==='gable'?ob.u1:ob.u1-hw;
  if(ru0>ru1)ru0=ru1=(ob.u0+ob.u1)/2;
  const P=(u,v,y)=>[u*ob.ux+v*ob.vx,y,u*ob.uz+v*ob.vz];
  const ridge=u=>P(clamp(u,ru0,ru1),vc,h+rh);
  for(let i=0;i<n;i++){
    const j=(i+1)%n,ax=r[i*2],az=r[i*2+1],bx=r[j*2],bz=r[j*2+1],dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz);if(l<.05)continue;
    const A=[ax,h,az],B=[bx,h,bz],ui=ax*ob.ux+az*ob.uz,uj=bx*ob.ux+bz*ob.uz;
    if(Math.abs((dx*ob.ux+dz*ob.uz)/l)>.7){
      const Ri=ridge(ui),Rj=ridge(uj);
      roofFace(c,A,B,Rj,rc,wc,cx,cz);
      if(Math.abs(ui-uj)>.05&&Math.abs(clamp(ui,ru0,ru1)-clamp(uj,ru0,ru1))>.05)roofFace(c,A,Rj,Ri,rc,wc,cx,cz);
    }else roofFace(c,A,B,ridge((ui+uj)/2),rc,wc,cx,cz);
  }
  for(let q=0;q<chim;q++){
    const t=chim===1?.3+hash(id,11)*.4:q?.74:.26,u=ru0+(ru1-ru0)*t,p=P(u,vc,0);
    addBox(c,p[0],p[2],.8,.8,h+rh*.55,h+rh+1.5,CHIMNEY,ob.ux,ob.uz);
  }
  return rh;
}

function addBuilding(id,raw){
  const of=raw[0],n=of.length/2;if(n<3)return;
  const r=new Float32Array(n*2);for(let i=0;i<r.length;i++)r[i]=of[i]/10;
  const holes=(raw[4]||[]).filter(f=>f.length>=6).map(f=>{const a=new Float32Array(f.length);for(let i=0;i<a.length;i++)a[i]=f[i]/10;return a});
  const k=raw[2],name=raw[3]||null,ex=raw[5]||null,lm=name&&LM[name]||null;
  let h=clamp(raw[1]/2,2.8,70);
  const h0=h;
  let minx=1e9,maxx=-1e9,minz=1e9,maxz=-1e9,sx=0,sz=0;
  for(let i=0;i<n;i++){const x=r[i*2],z=r[i*2+1];if(x<minx)minx=x;if(x>maxx)maxx=x;if(z<minz)minz=z;if(z>maxz)maxz=z;sx+=x;sz+=z}
  const cx=sx/n,cz=sz/n;
  let area=Math.abs(ringArea(r));for(const hl of holes)area-=Math.abs(ringArea(hl));
  area=Math.max(area,10);
  // OSM has no height for ~93% of Oxford buildings (they carry a type default), so spread them out plausibly.
  if(h0===6.5||h0===8||h0===11||h0===13||h0===3){
    const u=hash(id,5),u2=hash(id,6);
    const cen=1+Math.max(0,1-Math.hypot(cx+1243,cz-1161)/900)*.35;
    if(k===1)h=5.4+u*4.2;
    else if(k===3)h=(9+u*7)*cen;
    else if(k===0)h=12+u*8;
    else if(k===2)h=2.8+u*1.6;
    else h=(area>1500?11+u*9:area>400?8+u*7:5.5+u*5)*cen;
    h*=.9+u2*.2;
  }
  if(lm&&lm.wh)h=lm.wh;
  h=Math.round(clamp(h,2.8,70)*2)/2;
  const c=bChunks.get(cx,cz);
  const wc=pickWall(id,k,ex,lm);
  const win=k!==2&&h>=4.5;
  const v0=c.n;

  /* walls */
  const walls=(ring,hole)=>{
    const m=ring.length/2,sg=(ringArea(ring)>=0?1:-1)*(hole?-1:1);
    let acc=0;
    for(let i=0;i<m;i++){
      const j=(i+1)%m,ax=ring[i*2],az=ring[i*2+1],bx=ring[j*2],bz=ring[j*2+1];
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.05)continue;
      const nx=sg*dz/len,nz=-sg*dx/len;
      const u0=win?acc/4.5:.02,u1=win?(acc+len)/4.5:.02,v1=win?h/3.4:.02;
      const a=pushV(c,ax,0,az,nx,0,nz,wc,u0,win?0:.02);
      const b=pushV(c,bx,0,bz,nx,0,nz,wc,u1,win?0:.02);
      const d=pushV(c,bx,h,bz,nx,0,nz,wc,u1,v1);
      const e=pushV(c,ax,h,az,nx,0,nz,wc,u0,v1);
      triFace(c,a,b,d);triFace(c,a,d,e);acc+=len;
    }
  };
  walls(r,false);for(const hl of holes)walls(hl,true);
  const vw=c.n-v0;

  /* roof shape */
  const bigFlat=area>2500&&k===4;
  const ob=n>=10&&!holes.length&&area<1500?obb(r,n):null;
  const round=!!ob&&(ob.v1-ob.v0)/(ob.u1-ob.u0)>.8&&area/((ob.u1-ob.u0)*(ob.v1-ob.v0))>.7;
  let shape;
  const es=ex&&ex.s;
  if(lm&&lm.s)shape=lm.s;
  else if(round)shape='dome';
  else if(es==='f'||(ex&&ex.m==='concrete'&&area>200))shape='flat';
  else if(es==='g')shape='gable';
  else if(es==='h')shape='hip';
  else if(k===2||bigFlat)shape='flat';
  else{const u=hash(id,9);shape=k===0?'gable':k===1?(u<.6?'gable':'hip'):k===3?(u<.3?'gable':'hip'):(u<.4?'gable':'hip')}
  const rc=pickRoof(id,k,cx,cz,ex,lm,shape==='flat');
  const tan=(lm&&lm.tan)||(k===1?.68:k===0?.85:.6);
  let done=false;
  if(shape==='gable'||shape==='hip'){
    const chim=(k===1||k===3)&&area>50?(k===3&&area>150?2:hash(id,12)<.55?1:0):0;
    done=ridgeRoof(c,r,n,h,area,shape,tan,rc,wc,cx,cz,chim,id)>=0;
  }
  const contour=[];for(let i=0;i<n;i++)contour.push(new THREE.Vector2(r[i*2],r[i*2+1]));
  const hv=holes.map(a=>{const o=[];for(let i=0;i<a.length;i+=2)o.push(new THREE.Vector2(a[i],a[i+1]));return o});
  const rings=[r].concat(holes);
  const edgeD=(x,z)=>{
    let d=1e18;
    for(const g of rings){const m=g.length;for(let i=0,j=m-2;i<m;j=i,i+=2){const e=segD2(x,z,g[j],g[j+1],g[i],g[i+1]);if(e<d)d=e}}
    return Math.sqrt(d);
  };
  let rho=0;if(shape==='dome'){for(let i=0;i<n;i++)rho+=Math.hypot(r[i*2]-cx,r[i*2+1]-cz);rho/=n}
  const slope=(lm&&lm.tan)||(k===3?.6:.5);
  const rmax=(lm&&lm.rm)||Math.min(4.8,1.4+Math.sqrt(area)*.06);
  const roofY=(x,z)=>h+Math.min(edgeD(x,z)*slope,rmax);
  if(!done){
    let tris=[];try{tris=THREE.ShapeUtils.triangulateShape(contour,hv)}catch(e){tris=[]}
    const all=contour.concat(...hv);
    const flat=shape==='flat'||shape==='dome';
    if(!tris.length){
      const base=c.n;for(const p of all)pushV(c,p.x,h,p.y,0,1,0,rc,.02,.02);
      for(let i=1;i<n-1;i++)triFace(c,base,base+i,base+i+1);
    }else if(flat){
      const base=c.n;for(const p of all)pushV(c,p.x,h,p.y,0,1,0,rc,.02,.02);
      for(const t of tris)triFace(c,base+t[0],base+t[1],base+t[2]);
    }else{
      const lim2=area>6000?260:110;
      const emit=(ax,az,bx,bz,qx,qz,dep)=>{
        const l1=(bx-ax)**2+(bz-az)**2,l2=(qx-bx)**2+(qz-bz)**2,l3=(ax-qx)**2+(az-qz)**2,mx=Math.max(l1,l2,l3);
        if(dep<7&&mx>lim2){
          if(mx===l1){const a=(ax+bx)/2,b=(az+bz)/2;emit(ax,az,a,b,qx,qz,dep+1);emit(a,b,bx,bz,qx,qz,dep+1)}
          else if(mx===l2){const a=(bx+qx)/2,b=(bz+qz)/2;emit(ax,az,bx,bz,a,b,dep+1);emit(ax,az,a,b,qx,qz,dep+1)}
          else{const a=(qx+ax)/2,b=(qz+az)/2;emit(ax,az,bx,bz,a,b,dep+1);emit(a,b,bx,bz,qx,qz,dep+1)}
          return;
        }
        roofFace(c,[ax,roofY(ax,az),az],[bx,roofY(bx,bz),bz],[qx,roofY(qx,qz),qz],rc,wc,cx,cz);
      };
      for(const t of tris){const A=all[t[0]],B=all[t[1]],Q=all[t[2]];emit(A.x,A.y,B.x,B.y,Q.x,Q.y,0)}
    }
  }
  /* landmark extras */
  if(shape==='dome'){
    addDome(c,cx,cz,rho*.97,h,(lm&&lm.rise)||rho*.55,rc);
    if(lm&&lm.cup){
      const top=h+lm.rise*.97;
      addPrism(c,cx,cz,lm.cup.r,8,top-.4,top+lm.cup.h,C3(lm.cup.col),.4);
      addDome(c,cx,cz,lm.cup.r*1.1,top+lm.cup.h,lm.cup.dome,C3(lm.cup.dcol));
    }
  }else if(lm&&lm.cup){
    const top=roofY(cx,cz);
    addPrism(c,cx,cz,lm.cup.r,8,top-.4,top+lm.cup.h,C3(lm.cup.col),.4);
    addDome(c,cx,cz,lm.cup.r*1.1,top+lm.cup.h,lm.cup.dome,C3(lm.cup.dcol));
  }
  if(lm&&lm.spire){
    const top=roofY(cx,cz)-.5;
    addPrism(c,cx,cz,lm.spire.r,8,top,top+2,C3(lm.spire.col),.4);
    addCone(c,cx,cz,lm.spire.r*.9,8,top+2,top+lm.spire.H,C3(lm.spire.col),.4);
  }

  const maxHp=(40+h*3+Math.sqrt(area)*2.5)*(name?1.6:1);
  const b={id,r,holes,h,k,area,name,x:cx,z:cz,minx,maxx,minz,maxz,hp:maxHp,maxHp,s:1,
    pts:Math.round((h*4+Math.sqrt(area)*3)*(name?3:1)),dead:false,seen:false,stamp:0,
    ch:c,v0,vw,v1:c.n,wc,rc};
  buildings.push(b);
  const x0=Math.floor(minx/GC),x1=Math.floor(maxx/GC),z0=Math.floor(minz/GC),z1=Math.floor(maxz/GC);
  for(let ix=x0;ix<=x1;ix++)for(let iz=z0;iz<=z1;iz++){
    const key=gk(ix,iz);let l=bGrid.get(key);if(!l){l=[];bGrid.set(key,l)}l.push(b);
  }
}

// Upload only the touched vertex span; three resets updateRange.count to -1 after each upload, so spans painted in the same frame are merged.
function markDirty(attr,v0,v1){
  const r=attr.updateRange,o=v0*3,e=v1*3;
  if(r.count<0){r.offset=o;r.count=e-o}
  else{const a=Math.min(r.offset,o),z=Math.max(r.offset+r.count,e);r.offset=a;r.count=z-a}
  attr.needsUpdate=true;
}
function paintBuilding(b,s,f){
  const c=b.ch,pos=c.posA,col=c.colA,base=c.baseY,c0=c.col0;
  const t=clamp(f,0,1)*.8;b.s=s;
  for(let i=b.v0;i<b.v1;i++){
    pos[i*3+1]=base[i]*s;
    const o=i*3;
    col[o]=c0[o]+(CHAR[0]-c0[o])*t;col[o+1]=c0[o+1]+(CHAR[1]-c0[o+1])*t;col[o+2]=c0[o+2]+(CHAR[2]-c0[o+2])*t;
  }
  markDirty(c.geo.attributes.position,b.v0,b.v1);markDirty(c.geo.attributes.color,b.v0,b.v1);
}

/* ---------- ground layers ---------- */
const gChunks=new Chunks();
const GRASS=[0x86a869,0x7ea062,0x8fb072].map(C3),PITCH=[0x78b360].map(C3),WATER=C3(0x5b92ab);
function flatPoly(flat,y,col){
  const n=flat.length/2;if(n<3)return;
  const pts=[];for(let i=0;i<n;i++)pts.push(new THREE.Vector2(flat[i*2]/10,flat[i*2+1]/10));
  let tris;try{tris=THREE.ShapeUtils.triangulateShape(pts,[])}catch(e){return}
  if(!tris.length)return;
  const c=gChunks.get(pts[0].x,pts[0].y),base=c.n;
  for(const p of pts)pushV(c,p.x,y,p.y,0,1,0,col,0,0);
  for(const t of tris)triFace(c,base+t[0],base+t[1],base+t[2]);
}
function ribbon(flat,w,y,col){
  const n=flat.length/2;
  for(let i=0;i<n-1;i++){
    let ax=flat[i*2]/10,az=flat[i*2+1]/10,bx=flat[i*2+2]/10,bz=flat[i*2+3]/10;
    const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.05)continue;
    const ux=dx/len,uz=dz/len,ext=Math.min(w*.3,len*.3);
    ax-=ux*ext;az-=uz*ext;bx+=ux*ext;bz+=uz*ext;
    const nx=-uz*w/2,nz=ux*w/2;
    const c=gChunks.get((ax+bx)/2,(az+bz)/2);
    const a=pushV(c,ax+nx,y,az+nz,0,1,0,col,0,0),b=pushV(c,ax-nx,y,az-nz,0,1,0,col,0,0),
          d=pushV(c,bx-nx,y,bz-nz,0,1,0,col,0,0),e=pushV(c,bx+nx,y,bz+nz,0,1,0,col,0,0);
    triFace(c,a,b,d);triFace(c,a,d,e);
  }
}
const ROAD_COL=[0x3e3a37,0x4a4d52,0x4a4d52,0x4a4d52,0x585b60,0x585b60,0x6d6f73,0x6d6f73,0x6d6f73,0x80807f,0xb7b09f,0xc5bda8,0x9fb0a8,0xc5bda8,0xb9ad92,0xb5ad99].map(C3);
const ROAD_Y=[.15,.14,.14,.14,.15,.15,.16,.16,.16,.17,.18,.19,.19,.19,.18,.19];

/* ---------- trees ---------- */
const crownGeo=new THREE.IcosahedronGeometry(1,0);crownGeo.scale(3.1,2.7,3.1);crownGeo.translate(0,5.6,0);
const trunkGeo=new THREE.CylinderGeometry(.22,.34,3.6,5);trunkGeo.translate(0,1.8,0);
const crownMat=new THREE.MeshLambertMaterial({color:0xffffff});
const trunkMat=new THREE.MeshLambertMaterial({color:0x5b4630});
const LEAF=[0x4f7a3c,0x5f8a44,0x3f6e3a,0x6c8f46,0x57803f,0x4a7438].map(h=>new THREE.Color(h));
const AUTUMN=[0xc99a3a,0xb8693a,0xd0ab4a,0x9c6b2f].map(h=>new THREE.Color(h));
const treeChunks=new Map();
const ZERO=new THREE.Matrix4().makeScale(0,0,0);
function buildTrees(){
  const T=D.t;
  for(let i=0;i<T.length;i+=2){
    const x=T[i]/10,z=T[i+1]/10;
    if(insideAlive(x,z,0))continue;
    const ix=Math.floor(x/CH),iz=Math.floor(z/CH),k=ix*4096+iz;
    let tc=treeChunks.get(k);if(!tc){tc={cx:(ix+.5)*CH,cz:(iz+.5)*CH,list:[]};treeChunks.set(k,tc)}
    tc.list.push({x,z});
  }
  const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  treeChunks.forEach((tc,key)=>{
    const n=tc.list.length;
    tc.crown=new THREE.InstancedMesh(crownGeo,crownMat,n);
    tc.trunk=new THREE.InstancedMesh(trunkGeo,trunkMat,n);
    tc.crown.castShadow=true;tc.crown.frustumCulled=false;tc.trunk.frustumCulled=false;
    for(let i=0;i<n;i++){
      const t=tc.list[i],hh=hash(i,key);
      const sc=.75+hh*.75;
      q.setFromAxisAngle(up,hh*6.28);p.set(t.x,0,t.z);s.set(sc,sc*(.9+hash(key,i)*.3),sc);
      m4.compose(p,q,s);tc.crown.setMatrixAt(i,m4);tc.trunk.setMatrixAt(i,m4);
      const pal=hash(i,key+7)<.22?AUTUMN:LEAF;
      tc.crown.setColorAt(i,pal[(hash(key,i+3)*pal.length)|0]);
    }
    tc.orig=new Float32Array(tc.crown.instanceMatrix.array);
    tc.crown.visible=tc.trunk.visible=false;
    scene.add(tc.crown);scene.add(tc.trunk);
  });
}
function killTrees(x,z,rad){
  const x0=Math.floor((x-rad)/CH),x1=Math.floor((x+rad)/CH),z0=Math.floor((z-rad)/CH),z1=Math.floor((z+rad)/CH);
  let n=0;
  for(let ix=x0;ix<=x1;ix++)for(let iz=z0;iz<=z1;iz++){
    const tc=treeChunks.get(ix*4096+iz);if(!tc)continue;
    let dirty=false;
    for(let i=0;i<tc.list.length;i++){
      const t=tc.list[i];if(t.dead)continue;
      if(Math.hypot(t.x-x,t.z-z)<rad){t.dead=true;tc.crown.setMatrixAt(i,ZERO);tc.trunk.setMatrixAt(i,ZERO);dirty=true;n++}
    }
    if(dirty){tc.crown.instanceMatrix.needsUpdate=true;tc.trunk.instanceMatrix.needsUpdate=true}
  }
  return n;
}
function treeVis(tx,tz,dist){
  const lim=dist*1.5+190;
  treeChunks.forEach(tc=>{const v=Math.hypot(tc.cx-tx,tc.cz-tz)<lim;tc.crown.visible=tc.trunk.visible=v});
}
