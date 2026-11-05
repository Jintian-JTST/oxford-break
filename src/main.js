
/* ---------- a game: booklet → play → summary ---------- */
const LIMITS=[60,120,180,300];
let bombLimit=120,route=0;
try{bombLimit=+localStorage.getItem('oxford-break-limit')||120;route=+localStorage.getItem('oxford-break-route')||0}catch(e){}
if(LIMITS.indexOf(bombLimit)<0)bombLimit=120;
if(!ROUNDS[route])route=0;
const GUIDE={
  bomb:['Click or tap the map to drop. <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> pick bomb, meteor or nuke; each has its own cooldown.',
    'Buildings that fall within two seconds of the last collapse raise the combo multiplier, and a big collapse can shake its neighbours down.',
    'Pan with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or a drag, rotate with <kbd>Q</kbd>/<kbd>E</kbd> or a right-drag, tilt with <kbd>R</kbd>/<kbd>F</kbd>, zoom with the wheel or a pinch.',
    '<kbd>Space</kbd> drops at the centre of the screen; <kbd>L</kbd> shows or hides the place names.',
    'The clock starts with your first bomb. When it runs out you get a summary of the damage.'],
  heli:['The autopilot flies the route. Any flight key takes over; let go for three seconds and it flies back to the route.',
    '<kbd>W</kbd>/<kbd>S</kbd> forward and back, <kbd>A</kbd>/<kbd>D</kbd> turn, <kbd>R</kbd>/<kbd>F</kbd> climb and descend, <kbd>Q</kbd>/<kbd>E</kbd> slide sideways, hold <kbd>Shift</kbd> to boost. On a phone, use the joystick.',
    'Aim with the mouse and hold the button to fire. <kbd>Space</kbd> or a right-click fires a missile once it has recharged; <kbd>C</kbd> switches to the cockpit view, looking ahead over the nose gun.',
    'The gowned figures on the ground with guns shoot back. Score enough and the gun upgrades to MK II, then MK III.',
    'A run lasts 100 seconds. It ends at the end of the route, when time is up, or the moment you are shot down.'],
  jet:['The jet never stops. <kbd>W</kbd>/<kbd>S</kbd> climb and dive, <kbd>A</kbd>/<kbd>D</kbd> bank and turn, hold <kbd>Shift</kbd> for the afterburner. On a phone, use the joystick.',
    '<kbd>Space</kbd> or a right-click drops a bomb. It keeps the jet\'s speed and lands on the white ring ahead; four on the pylons, and they reload.',
    'Aim with the mouse and hold the button for the cannon. <kbd>C</kbd> switches to the cockpit.',
    'Flying into a roof or the ground ends the sortie. Watch for PULL UP; at the edge of the map the jet turns itself back.',
    'Collapses chain into combos, as in bombing. The sortie ends when the clock runs out.']};
function openGuide(){
  const heli=mode==='heli',jet=mode==='jet';
  $('gT').textContent=heli?'Helicopter':jet?'Fighter jet':'Bombing';
  $('gList').innerHTML=GUIDE[mode].map(t=>'<li>'+t+'</li>').join('');
  $('gOptL').textContent=heli?'Route':jet?'Sortie length':'Round length';
  const opts=heli?ROUNDS.map((r,i)=>[i,r.name]):(jet?JET_LIMITS:LIMITS).map(s=>[s,s/60+' min']),cur=heli?route:jet?jetLimit:bombLimit,box=$('gOpt'),bs=[];
  box.innerHTML='';
  for(const [v,label] of opts){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.className=v===cur?'on':'';bs.push(b);
    b.addEventListener('click',()=>{
      if(heli)route=v;else if(jet)jetLimit=v;else bombLimit=v;
      try{localStorage.setItem(heli?'oxford-break-route':jet?'oxford-break-jet-limit':'oxford-break-limit',String(v))}catch(e){}
      bs.forEach(c=>c.className=c===b?'on':'');
    });
    box.appendChild(b);
  }
  $('summary').hidden=true;$('guide').hidden=false;paused=true;
}
function startGame(){
  const heli=mode==='heli';
  $('guide').hidden=true;paused=false;ensureAudio();
  if(heli&&route!==H.round)startCampaign(route);
  const jet=mode==='jet';
  Object.assign(G,{on:true,started:heli||jet,over:false,limit:heli?ROUND_T:jet?jetLimit:bombLimit,t:0,endT:0,shownLeft:null,stats:newStats()});
  $('btime').textContent='Clock starts with your first bomb';$('btime').classList.remove('low');
}
function playAgain(){
  if(mode==='heli')startCampaign(route);else if(mode==='jet')prepJet();else reset();
  G.on=false;G.over=false;openGuide();
}
// a one-word name ("Hall", "Chapel") gets the nearest college after it
function placeName(n,x,z){
  const t=BUILDINGS[n]||n;if(/\s/.test(t))return t;
  let best=null,bd=180*180;
  for(const [cx,cz,cn] of D.l||[]){const d=(cx-x)**2+(cz-z)**2;if(d<bd){bd=d;best=cn}}
  return best?t+' · '+best:t;
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function showSummary(title){
  if(!G.on)return;
  G.over=true;G.on=false;
  const heli=mode==='heli',jet=mode==='jet',s=G.stats,key=heli?'oxford-break-heli-best':jet?'oxford-break-jet-best':'oxford-break-bomb-best-'+G.limit;
  let best=0;try{best=+localStorage.getItem(key)||0}catch(e){}
  const rec=score>best;if(rec){best=score;try{localStorage.setItem(key,String(best))}catch(e){}}
  if(heli)heliBest=Math.max(heliBest,best);
  if(jet)jetBest=Math.max(jetBest,best);
  saveLife();
  const kind=heli?'Helicopter · '+ROUNDS[H.round].name:(jet?'Fighter jet · ':'Bombing · ')+G.limit/60+' min';
  const time=clock(Math.round(G.t)),dons=heli?H.kills:donCount;
  $('sumKind').textContent=kind;$('sumT').textContent=title;$('sumScore').textContent=fmt(score);
  $('sumBest').textContent=rec?'New personal best':'Best '+fmt(best);$('sumBest').className=rec?'rec':'';
  const cell=(v,l)=>'<div><b>'+esc(v)+'</b><small>'+l+'</small></div>';
  // four headline numbers: what matters differs between the two modes
  const w=s.weapons,n=k=>w[k]||0,names=[...new Set(s.named.map(([nm,x,z])=>placeName(nm,x,z)))];
  $('sumGrid').innerHTML=cell(time,'played')+cell(fmt(downCount),'collapsed')+(heli
    ?cell(dons,'dons down')+cell(Math.max(0,Math.ceil(H.hp)),'HP left')
    :jet?cell(n('jbomb'),'bombs dropped')+cell('×'+s.combo,'best combo')
    :cell(dons,'dons launched')+cell('×'+s.combo,'best combo'));
  const pl=(k,a)=>n(k)+' '+a+(n(k)===1?'':'s');
  const used=heli?[n('rounds')+' rounds',pl('missile','missile')]:jet?[pl('jbomb','bomb'),n('rounds')+' rounds']:WEAPONS.map(W=>pl(W.key,W.key));
  const rows=[['Mode',kind],['Score',fmt(score)],['Personal best',fmt(best)],['Time played',time],
    ['Buildings collapsed',fmt(downCount)],['Landmarks destroyed',names.length],['Weapons used',used.join(' · ')],
    [heli?'Dons shot down':'Dons launched',dons],['Best combo','×'+s.combo]];
  if(heli)rows.push(['Distance flown',fmt(Math.round(s.dist))+' m'],['HP left',Math.max(0,Math.ceil(H.hp))]);
  if(jet)rows.push(['Distance flown',fmt(Math.round(s.dist))+' m'],['Top speed',Math.round(s.vmax*3.6)+' km/h']);
  $('sumList').innerHTML=rows.map(([a,b])=>'<dt>'+esc(a)+'</dt><dd>'+esc(b)+'</dd>').join('');
  // named buildings in the order they fell, under their label names where labels.js has one
  $('sumBld').innerHTML=(names.map(nm=>'<li>'+esc(nm)+'</li>').join('')
    +(s.other?'<li>'+fmt(s.other)+' other building'+(s.other===1?'':'s')+'</li>':''))||'<li>None</li>';
  $('sumMore').hidden=true;$('sumDet').textContent='Details';
  $('banner').hidden=true;$('summary').hidden=false;
}
$('gStart').addEventListener('click',startGame);
$('gMenu').addEventListener('click',()=>setMode('menu'));
$('sumAgain').addEventListener('click',playAgain);
$('sumMenu').addEventListener('click',()=>setMode('menu'));
$('sumDet').addEventListener('click',()=>{const m=$('sumMore');m.hidden=!m.hidden;$('sumDet').textContent=m.hidden?'Details':'Hide details'});
// Info: from the menu and from either game, where it pauses play while it is open
let infoPaused=false;
function openInfo(){infoPaused=!paused;paused=true;$('info').hidden=false}
function closeInfo(){$('info').hidden=true;if(infoPaused)paused=false}
for(const id of ['infoBtn','binfo','hinfo','jinfo'])$(id).addEventListener('click',openInfo);
$('infoClose').addEventListener('click',closeInfo);

/* time of day: switched on the main menu only, remembered */
function pickNight(on){
  setNight(on);$('todDay').className=on?'':'on';$('todNight').className=on?'on':'';
  try{localStorage.setItem('oxford-break-night',on?'on':'off')}catch(e){}
}
$('todDay').addEventListener('click',()=>pickNight(false));
$('todNight').addEventListener('click',()=>pickNight(true));

/* ---------- modes ---------- */
// menu: the map turns slowly behind the title; bomb: free destruction; heli: the helicopter campaign.
function setMode(m){
  if(mode==='heli'&&m!=='heli')stopHeli();
  if(mode==='jet'&&m!=='jet')stopJet();
  mode=m;G.on=false;G.over=false;paused=false;
  for(const id of ['guide','summary','info'])$(id).hidden=true;
  document.body.className='mode-'+m;edgeCaps();
  ptrs.clear();keys.clear();reticle.visible=false;
  const rc=buildings.find(b=>b.name==='Radcliffe Camera');
  if(m==='menu'){
    if(rc){cam.tx=rc.x;cam.tz=rc.z}
    cam.dist=280;cam.pitch=.62;
    $('recLife').textContent=fmt(life);$('recFlight').textContent=heliBest?fmt(heliBest):'—';$('recJet').textContent=jetBest?fmt(jetBest):'—';
  }else if(m==='bomb'){
    reset();
    if(rc){cam.tx=rc.x;cam.tz=rc.z}
    cam.dist=140;cam.pitch=.92;cam.yaw=.55;
    openGuide();
  }else if(m==='jet'){
    ensureAudio();prepJet();openGuide();
  }else{
    ensureAudio();startCampaign(route);openGuide();
  }
  try{history.replaceState(null,'',m==='menu'?location.pathname:'?mode='+m)}catch(e){}
}
$('playBomb').addEventListener('click',()=>{ensureAudio();setMode('bomb')});
$('playHeli').addEventListener('click',()=>setMode('heli'));
$('playJet').addEventListener('click',()=>setMode('jet'));
$('jmenu').addEventListener('click',()=>setMode('menu'));
$('tomenu').addEventListener('click',()=>setMode('menu'));
$('hmenu').addEventListener('click',()=>setMode('menu'));
$('hmute').addEventListener('click',toggleMute);
$('view').addEventListener('click',toggleView);

/* ---------- loop ---------- */
let last=performance.now(),T=0,fr=0;
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min((now-last)/1000,.05);last=now;T+=dt;fr++;
  // while the booklet or Info is open the game modes run with dt = 0: the camera stays put, nothing moves
  const d=paused&&mode!=='menu'?0:dt;
  updateWorld(d);
  updateAudio(dt);
  if(mode==='bomb')updateBomb(d);
  else if(mode==='heli')updateHeli(d);
  else if(mode==='jet')updateJet(d);
  else{cam.yaw+=dt*.06;placeCam()}
  if(fr%20===1)treeVis(cam.tx,cam.tz,cam.dist);
  if(mode==='bomb'||mode==='menu'){mmDot.style.left=((cam.tx+MW/2)/MW*100)+'%';mmDot.style.top=((cam.tz+MH/2)/MH*100)+'%'}
  renderer.render(scene,camera);
  renderCockpit();renderJetCockpit();
  updateLabels();
}

// audio starts with the first click, tap or key anywhere (and straight away if the browser allows it)
for(const t of ['pointerdown','keydown','touchstart'])addEventListener(t,()=>ensureAudio(),true);

setTimeout(()=>{
  try{
    ensureAudio();
    buildAll();drawMini();buildLabels();
    let nt=false;try{nt=localStorage.getItem('oxford-break-night')==='on'}catch(e){}
    pickNight(nt);
    hud();
    const q=new URLSearchParams(location.search).get('mode');
    setMode(q==='bomb'||q==='heli'||q==='jet'?q:'menu');
    treeVis(cam.tx,cam.tz,cam.dist);
    requestAnimationFrame(frame);
    $('loading').hidden=true;
  }catch(err){
    $('loadmsg').textContent='Could not build the map: '+err.message;
    console.error(err);
  }
},60);
})();
