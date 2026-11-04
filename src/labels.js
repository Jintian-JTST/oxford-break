
/* ---------- map labels ---------- */
// Colleges are placed at the centre of their grounds (D.l, from OSM); single buildings above their roof.
// Only the names listed here are labelled; the label is just the name.
const COLLEGES=new Set(['University College','Balliol College','Merton College','St Edmund Hall','Exeter College',
  'Oriel College',"The Queen's College",'New College','Lincoln College','All Souls College','Magdalen College',
  'Brasenose College','Corpus Christi College','Christ Church','Trinity College',"St John's College",'Jesus College',
  'Wadham College','Pembroke College','Worcester College','Hertford College','Keble College','Lady Margaret Hall',
  'Somerville College',"St Anne's College","St Hugh's College","St Hilda's College",'Mansfield College',
  'Harris Manchester College',"Regent's Park College","St Peter's College",'Nuffield College',"St Antony's College",
  'Linacre College',"St Catherine's College",'St Cross College','Wolfson College','Kellogg College',
  'Green Templeton College','Reuben College','Science Area','Saïd Business School','Rhodes House']);
// OSM building name -> text shown ('' shows the name as it is)
const BUILDINGS={'Radcliffe Camera':'','Sheldonian Theatre':'','Bodleian Library':'Old Bodleian','The Divinity School':'Divinity School',
  'Clarendon Building':'','Weston Library':'','Ashmolean Museum':'Ashmolean',
  'Oxford University Museum of Natural History':'Museum of Natural History','Pitt Rivers Museum':'',
  'Christ Church Cathedral':'','St Mary the Virgin':'University Church','The Covered Market':'Covered Market',
  'Examination Schools':'','Oxford Town Hall':'Town Hall','Radcliffe Observatory':'','Radcliffe Humanities':'',
  'Westgate Centre':'Westgate','The Union':'Oxford Union','Clarendon Laboratory':'','Beecroft Building (Physics)':'Beecroft Building',
  'Denys Wilkinson Building':'','Andrew Wiles Building':'Mathematical Institute','Oxford Playhouse':'Playhouse',
  'Holywell Music Room':'','Exeter College Chapel':'Exeter Chapel','Keble College Chapel':'Keble Chapel'};
const labels=[];
let labelsOn=true;
try{labelsOn=localStorage.getItem('oxford-break-labels')!=='off'}catch(e){}
function buildLabels(){
  const box=$('labels'),seen=new Set();
  const add=(x,y,z,text,cls,b)=>{
    const e=document.createElement('div');e.className='lbl '+cls;e.textContent=text;
    box.appendChild(e);labels.push({e,x,y,z,b,cls,vis:false,gone:false});
  };
  for(const [x,z,name] of D.l||[]){
    if(!COLLEGES.has(name)||seen.has(name))continue;   // a college can come in several parts
    seen.add(name);add(x,26,z,name,'col',null);
  }
  // the largest footprint carrying the name
  const big=new Map();
  for(const b of buildings)if(b.name&&b.name in BUILDINGS&&(!big.has(b.name)||big.get(b.name).area<b.area))big.set(b.name,b);
  big.forEach((b,name)=>add(b.x,b.h+6,b.z,BUILDINGS[name]||name,'bld',b));
  $('labels').hidden=!labelsOn;
}
function toggleLabels(){
  labelsOn=!labelsOn;$('labels').hidden=!labelsOn;$('lblbtn').textContent=labelsOn?'Labels on':'Labels off';
  try{localStorage.setItem('oxford-break-labels',labelsOn?'on':'off')}catch(e){}
}
// Colleges show from further out than single buildings; both fade with distance from the view centre.
const lv=new THREE.Vector3();
function updateLabels(){
  if(!labelsOn)return;
  for(const L of labels){
    const far=L.cls==='col'?cam.dist*2.4+150:cam.dist*1.4+40;
    const d=Math.hypot(L.x-cam.tx,L.z-cam.tz);
    let show=(L.cls==='col'||cam.dist<260)&&d<far;
    if(show){
      const y=L.b?L.b.h*L.b.s+5:L.y;
      const p=lv.set(L.x,y,L.z).project(camera);
      show=p.z<1&&Math.abs(p.x)<1.05&&Math.abs(p.y)<1.05;
      if(show){
        L.e.style.transform='translate('+((p.x+1)/2*innerWidth).toFixed(1)+'px,'+((1-p.y)/2*innerHeight).toFixed(1)+'px) translate(-50%,-50%)';
        L.e.style.opacity=clamp(1.6-1.6*d/far,0,1).toFixed(2);
      }
    }
    if(show!==L.vis){L.vis=show;L.e.classList[show?'add':'remove']('on')}
    const gone=!!(L.b&&L.b.dead);
    if(gone!==L.gone){L.gone=gone;L.e.classList[gone?'add':'remove']('gone')}
  }
}
