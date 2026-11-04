
/* ---------- modes ---------- */
// menu: the map turns slowly behind the title; bomb: free destruction; heli: the helicopter campaign.
function setMode(m){
  if(mode==='heli'&&m!=='heli')stopHeli();
  mode=m;
  document.body.className='mode-'+m;
  ptrs.clear();keys.clear();reticle.visible=false;
  const rc=buildings.find(b=>b.name==='Radcliffe Camera');
  if(m==='menu'){
    if(rc){cam.tx=rc.x;cam.tz=rc.z}
    cam.dist=280;cam.pitch=.62;
    $('recLife').textContent=fmt(life);$('recFlight').textContent=heliBest?fmt(heliBest):'—';
  }else if(m==='bomb'){
    reset();
    if(rc){cam.tx=rc.x;cam.tz=rc.z}
    cam.dist=140;cam.pitch=.92;cam.yaw=.55;
  }else{
    ensureAudio();startCampaign();
  }
  try{history.replaceState(null,'',m==='menu'?location.pathname:'?mode='+m)}catch(e){}
}
$('playBomb').addEventListener('click',()=>{ensureAudio();setMode('bomb')});
$('playHeli').addEventListener('click',()=>setMode('heli'));
$('tomenu').addEventListener('click',()=>setMode('menu'));
$('hmenu').addEventListener('click',()=>setMode('menu'));
$('hmute').addEventListener('click',toggleMute);

/* ---------- loop ---------- */
let last=performance.now(),T=0,fr=0;
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min((now-last)/1000,.05);last=now;T+=dt;fr++;
  updateWorld(dt);
  if(mode==='bomb')updateBomb(dt);
  else if(mode==='heli')updateHeli(dt);
  else{cam.yaw+=dt*.06;placeCam()}
  if(fr%20===1)treeVis(cam.tx,cam.tz,cam.dist);
  if(mode!=='heli'){mmDot.style.left=((cam.tx+MW/2)/MW*100)+'%';mmDot.style.top=((cam.tz+MH/2)/MH*100)+'%'}
  renderer.render(scene,camera);
  updateLabels();
}

setTimeout(()=>{
  try{
    buildAll();drawMini();buildLabels();
    hud();
    const q=new URLSearchParams(location.search).get('mode');
    setMode(q==='bomb'||q==='heli'?q:'menu');
    treeVis(cam.tx,cam.tz,cam.dist);
    requestAnimationFrame(frame);
    $('loading').hidden=true;
  }catch(err){
    $('loadmsg').textContent='Could not build the map: '+err.message;
    console.error(err);
  }
},60);
})();
