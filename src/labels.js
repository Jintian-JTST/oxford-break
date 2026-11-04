
/* ---------- map labels ---------- */
// Colleges are placed at the centre of their grounds (D.l, from OSM); single buildings at their roof.
// Only names listed here get a label, so the notes stay short and checked.
const COLLEGE_NOTE={
  'University College':'founded 1249','Balliol College':'founded 1263','Merton College':'founded 1264 · Mob Quad',
  'St Edmund Hall':'c. 1236 · "Teddy Hall"','Exeter College':'founded 1314','Oriel College':'founded 1326',
  "The Queen's College":'founded 1341','New College':'founded 1379','Lincoln College':'founded 1427',
  'All Souls College':'founded 1438 · fellows only','Magdalen College':'founded 1458 · deer park',
  'Brasenose College':'founded 1509','Corpus Christi College':'founded 1517',
  'Christ Church':'founded 1546 · college and cathedral','Trinity College':'founded 1555',
  "St John's College":'founded 1555','Jesus College':'founded 1571','Wadham College':'founded 1610',
  'Pembroke College':'founded 1624','Worcester College':'founded 1714 · lake and gardens',
  'Hertford College':'refounded 1874 · Bridge of Sighs','Keble College':'founded 1870 · polychrome brick',
  'Lady Margaret Hall':'founded 1878','Somerville College':'founded 1879',"St Anne's College":'founded 1879',
  "St Hugh's College":'founded 1886',"St Hilda's College":'founded 1893','Mansfield College':'in Oxford since 1886',
  'Harris Manchester College':'in Oxford since 1889',"Regent's Park College":'in Oxford since 1927',
  "St Peter's College":'founded 1929','Nuffield College':'founded 1937 · social sciences',
  "St Antony's College":'founded 1950 · graduates','Linacre College':'founded 1962 · graduates',
  "St Catherine's College":'founded 1962 · Arne Jacobsen','St Cross College':'founded 1965 · graduates',
  'Wolfson College':'founded 1966 · graduates','Kellogg College':'founded 1990 · graduates',
  'Green Templeton College':'founded 2008 · graduates','Reuben College':'founded 2019',
  // and a few university sites mapped the same way
  'Science Area':'labs and science departments','Saïd Business School':'business school','Rhodes House':'Rhodes Trust · 1929'
};
const BUILDING_NOTE={
  'Radcliffe Camera':'1749 · Bodleian reading room','Sheldonian Theatre':'1669 · Wren · degree ceremonies',
  'Bodleian Library':'Old Bodleian · opened 1602','The Divinity School':'1488 · oldest teaching room',
  'Clarendon Building':'1715 · built for the University Press','Weston Library':'Bodleian special collections',
  'Ashmolean Museum':'art and archaeology · since 1683',
  'Oxford University Museum of Natural History':'1860 · dinosaurs and the dodo','Pitt Rivers Museum':'anthropology · since 1884',
  'Christ Church Cathedral':'cathedral and college chapel','St Mary the Virgin':'University Church · tower view',
  'The Covered Market':'market since 1774','Examination Schools':'1882 · where exams are sat',
  'Oxford Town Hall':'1897','Radcliffe Observatory':'1794 · Tower of the Winds','Radcliffe Humanities':'old Radcliffe Infirmary',
  'Westgate Centre':'shopping centre','The Union':'Oxford Union · debating since 1823',
  'Clarendon Laboratory':'Physics','Beecroft Building (Physics)':'Physics · 2018','Denys Wilkinson Building':'Physics · astro and particle',
  'Andrew Wiles Building':'Mathematical Institute','Oxford Playhouse':'theatre','Holywell Music Room':'1748 · concert hall',
  'Exeter College Chapel':'1859 · George Gilbert Scott','Keble College Chapel':'1876 · Butterfield'
};
const labels=[];
let labelsOn=true;
try{labelsOn=localStorage.getItem('oxford-break-labels')!=='off'}catch(e){}
function buildLabels(){
  const box=$('labels'),seen=new Set();
  const add=(x,y,z,name,note,cls,b)=>{
    const e=document.createElement('div');e.className='lbl '+cls;
    const t=document.createElement('b');t.textContent=name;e.appendChild(t);
    const s=document.createElement('span');s.textContent=note;e.appendChild(s);
    box.appendChild(e);labels.push({e,x,y,z,b,cls,vis:false,gone:false});
  };
  for(const [x,z,name] of D.l||[]){
    if(!COLLEGE_NOTE[name]||seen.has(name))continue;   // a college can come in several parts
    seen.add(name);add(x,26,z,name,COLLEGE_NOTE[name],'col',null);
  }
  // the largest footprint carrying the name
  const big=new Map();
  for(const b of buildings)if(b.name&&BUILDING_NOTE[b.name]&&(!big.has(b.name)||big.get(b.name).area<b.area))big.set(b.name,b);
  big.forEach((b,name)=>add(b.x,b.h+6,b.z,name,BUILDING_NOTE[name],'bld',b));
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
        L.e.style.transform='translate('+((p.x+1)/2*innerWidth).toFixed(1)+'px,'+((1-p.y)/2*innerHeight).toFixed(1)+'px) translate(-50%,-100%)';
        L.e.style.opacity=clamp(1.6-1.6*d/far,0,1).toFixed(2);
      }
    }
    if(show!==L.vis){L.vis=show;L.e.classList[show?'add':'remove']('on')}
    const gone=!!(L.b&&L.b.dead);
    if(gone!==L.gone){L.gone=gone;L.e.classList[gone?'add':'remove']('gone')}
  }
}
