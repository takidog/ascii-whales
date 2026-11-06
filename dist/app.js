(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const canvas = $('#scene'), ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;
  const ocean = $('#ocean'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2, LENGTH = 610, NODES = 35;
  const PART_BODY = 0, PART_FIN = 1, PART_TAIL = 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
  const hash = n => { const v = Math.sin(n * 127.13 + 18.17) * 43758.5453; return v - Math.floor(v); };
  const normalize = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const glyphs = ['·', ':', '+', '=', '×', '*', '#', '%'];
  const light = normalize(-0.35, -0.42, 0.84);
  const halfLight = normalize(light[0], light[1], light[2] + 1);
  const state = {
    width: 1, height: 1, dpr: 1, mobile: false, time: 0,
    mode: 'auto', manualDepth: 0.08, speed: 1, paused: reducedMotion.matches,
    cell: 6, cols: 1, rows: 1, dirty: true, lastUI: -1, pointerAge: 99,
  };
  let whales = [], buffer = null;
  const rings = [], model = [];

  // y: nose to tail. z: toward the overhead camera. The profile is a volume.
  const profile = [
    [0, 0, 0, 0], [14, 35, 23, 0], [38, 64, 43, 2],
    [85, 79, 60, 2], [155, 83, 65, 0], [235, 74, 57, -4],
    [325, 57, 43, -7], [410, 34, 27, -12], [490, 18, 14, -14],
    [560, 11, 9, -17], [590, 10, 7, -19],
  ];
  function section(y) {
    y = clamp(y, 0, 590);
    let i = 0;
    while (i < profile.length - 2 && y > profile[i + 1][0]) i++;
    const a = profile[i], b = profile[i + 1];
    const prev = profile[Math.max(0, i - 1)], next = profile[Math.min(profile.length - 1, i + 2)];
    const span = b[0] - a[0], t = (y - a[0]) / span, t2 = t * t, t3 = t2 * t;
    const result = [];
    for (let k = 1; k <= 3; k++) {
      const m0 = (b[k] - prev[k]) / (b[0] - prev[0] || 1), m1 = (next[k] - a[k]) / (next[0] - a[0] || 1);
      result.push((2*t3-3*t2+1)*a[k] + (t3-2*t2+t)*span*m0 + (-2*t3+3*t2)*b[k] + (t3-t2)*span*m1);
    }
    return result;
  }
  function addPoint(x, y, z, nx, ny, nz, part, u = 0, side = 0) {
    const n = normalize(nx, ny, nz);
    model.push({ x, y, z, nx:n[0], ny:n[1], nz:n[2], part, u, side, id:model.length, noise:hash(model.length+1) });
  }

  // Full elliptical rings; back-facing samples are culled after 3D rotation.
  for (let y = 2; y <= 590; y += 4) {
    const [rx, rz, cz] = section(y), lo = section(y-0.5), hi = section(y+0.5);
    const drx = hi[0]-lo[0], drz = hi[1]-lo[1], dcz = hi[2]-lo[2];
    const count = Math.max(18, Math.ceil(TAU * Math.max(rx,rz) / 4));
    for (let j = 0; j < count; j++) {
      const theta = j/count*TAU, sn = Math.sin(theta), cs = Math.cos(theta);
      const nx = sn/Math.max(rx,1), nz = cs/Math.max(rz,1);
      addPoint(rx*sn, y, cz+rz*cs, nx, -nx*drx*sn-nz*(dcz+drz*cs), nz, PART_BODY);
    }
  }
  function finSurface(u, v, side) {
    const x = side*(66+145*u-24*u*u), y = 199+116*u+18*Math.sin(Math.PI*u);
    const dx = side*(145-48*u), dy = 116+18*Math.PI*Math.cos(Math.PI*u), len = Math.hypot(dx,dy);
    const width = 26*Math.pow(Math.sin(Math.PI*u),0.65)*(1-0.24*u);
    return [x-dy/len*width*v, y+dx/len*width*v, -13-26*u+5*Math.sin(Math.PI*u)*Math.sqrt(Math.max(0,1-v*v))];
  }
  function tailSurface(u, v, side) {
    const leading = 565-33*u+6*Math.sin(Math.PI*u), trailing = 590+36*Math.sin(Math.PI*u)-58*u;
    return [side*156*u, mix(leading,trailing,(v+1)/2), -20-16*u+5*Math.sin(Math.PI*u)*Math.sqrt(Math.max(0,1-v*v))];
  }
  function sampleSheet(fn, part, nu, nv) {
    for (const side of [-1,1]) for (let i = 0; i <= nu; i++) {
      const u = clamp(i/nu,0.002,0.998);
      for (let j = 0; j <= nv; j++) {
        const v = -1+2*j/nv, p = fn(u,v,side);
        const a = fn(clamp(u-.001,.001,.999),v,side), b = fn(clamp(u+.001,.001,.999),v,side);
        const c = fn(u,clamp(v-.001,-.999,.999),side), d = fn(u,clamp(v+.001,-.999,.999),side);
        const du = [b[0]-a[0],b[1]-a[1],b[2]-a[2]], dv = [d[0]-c[0],d[1]-c[1],d[2]-c[2]];
        let nx = du[1]*dv[2]-du[2]*dv[1], ny = du[2]*dv[0]-du[0]*dv[2], nz = du[0]*dv[1]-du[1]*dv[0];
        if (nz < 0) { nx=-nx; ny=-ny; nz=-nz; }
        addPoint(p[0],p[1],p[2],nx,ny,nz,part,u,side);
      }
    }
  }
  sampleSheet(finSurface,PART_FIN,47,16);
  sampleSheet(tailSurface,PART_TAIL,51,18);

  function makeWhale(id,cx,cy,angle,size,phase,depth) {
    const scale = size/LENGTH, headX = cx+Math.cos(angle)*size*.43, headY = cy+Math.sin(angle)*size*.43;
    const spine = [{x:headX,y:headY}];
    const spacing = scale*LENGTH/(NODES-1);
    for(let i=1;i<NODES;i++){
      const a=angle+Math.PI+i/(NODES-1)*.32,previous=spine[i-1];
      spine.push({x:previous.x+Math.cos(a)*spacing,y:previous.y+Math.sin(a)*spacing});
    }
    return {
      id,scale,size,angle,phase,depth,spine,
      goal:{x:state.width*(id===0?.73:id===1?.35:.65),y:state.height*(id===0?.58:id===1?.65:.28)},
      goalAge:0,turn:0,lastRing:-10,buffer:null,
      stats:{total:0,visible:0,body:0,fin:0,tail:0,bodyTotal:0,finTotal:0,tailTotal:0},
    };
  }
  function initialiseWhales() {
    const w = state.width,h = state.height;
    const length = Math.min(w*(state.mobile?.78:.43),h*(state.mobile?.48:.66),540);
    whales = state.mobile ? [
      makeWhale(0,w*.51,h*.44,-1.06,length,-2.45,.08),
      makeWhale(1,w*.22,h*.30,1.1,length*.64,.20,.48),
      makeWhale(2,w*.77,h*.65,-2.2,length*.54,2.8,.66),
    ] : [
      makeWhale(0,w*.51,h*.50,-.60,length,-2.45,.08),
      makeWhale(1,w*.20,h*.34,-2.00,length*.65,.20,.48),
      makeWhale(2,w*.80,h*.66,1.85,length*.56,2.80,.66),
    ];
    whales.forEach(confineWhale);
  }
  // Keep the entire projected silhouette in view while the head turns on a
  // wide arc. Moving the whole chain preserves its curvature and volume.
  function confineWhale(whale) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    function sample(x,y) {
      const u=clamp(y/LENGTH*(NODES-1),0,NODES-1.001),i=Math.floor(u),f=u-i;
      const a=whale.spine[i],b=whale.spine[i+1],l=Math.hypot(b.x-a.x,b.y-a.y)||1;
      const sx=mix(a.x,b.x,f)+(b.y-a.y)/l*x*whale.scale;
      const sy=mix(a.y,b.y,f)-(b.x-a.x)/l*x*whale.scale;
      minX=Math.min(minX,sx);maxX=Math.max(maxX,sx);minY=Math.min(minY,sy);maxY=Math.max(maxY,sy);
    }
    for(let i=0;i<NODES;i++){
      const y=i/(NODES-1)*590,width=section(y)[0];sample(-width,y);sample(width,y);
    }
    for(const side of [-1,1])for(let i=0;i<=8;i++)for(const v of [-1,1]){
      const fin=finSurface(i/8,v,side),tail=tailSurface(i/8,v,side);
      sample(fin[0],fin[1]);sample(tail[0],tail[1]);
    }
    const left=15,right=state.width-15,top=70,bottom=state.height-(state.mobile?150:90);
    const dx=maxX-minX>right-left?(left+right-minX-maxX)/2:minX<left?left-minX:maxX>right?right-maxX:0;
    const dy=maxY-minY>bottom-top?(top+bottom-minY-maxY)/2:minY<top?top-minY:maxY>bottom?bottom-maxY:0;
    if(dx||dy)for(const p of whale.spine){p.x+=dx;p.y+=dy;}
  }
  function makeBuffer() {
    const n = state.cols*state.rows;
    return {
      depth:new Float32Array(n),visibility:new Float32Array(n),light:new Float32Array(n),
      glint:new Float32Array(n),point:new Int32Array(n),part:new Int8Array(n),
      owner:new Int8Array(n),occupied:new Int32Array(n),count:0,
    };
  }
  function resetBuffer(b) { b.depth.fill(Infinity);b.count=0; }
  function chooseGoal(whale) {
    const t = state.time+whale.id*31;
    whale.goal.x=state.width*(.22+hash(Math.floor(t/7)*3+whale.id*11)*.56);
    whale.goal.y=state.height*(.22+hash(Math.floor(t/7)*3+whale.id*11+1)*(state.mobile?.44:.52));
    whale.goalAge=0;
  }
  function moveWhale(whale,dt) {
    const head=whale.spine[0],w=state.width,h=state.height;
    whale.goalAge+=dt;
    if (Math.hypot(whale.goal.x-head.x,whale.goal.y-head.y)<62 || whale.goalAge>17) chooseGoal(whale);
    let gx=whale.goal.x-head.x,gy=whale.goal.y-head.y;
    const gl=Math.hypot(gx,gy)||1;gx/=gl;gy/=gl;
    const radius=whale.size*.60;
    const look=radius*1.05,px=head.x+Math.cos(whale.angle)*look,py=head.y+Math.sin(whale.angle)*look;
    const mx=Math.min(w*.19,140),my=Math.min(h*.18,120);
    if(px<mx)gx+=(mx-px)/mx*3;
    if(px>w-mx)gx-=(px-(w-mx))/mx*3;
    if(py<my)gy+=(my-py)/my*3;
    if(py>h-my-45)gy-=(py-(h-my-45))/my*3;
    const difference=wrapAngle(Math.atan2(gy,gx)-whale.angle);
    const speed=(state.mobile?21:30)*(.65+whale.scale*.35)*(1-Math.min(.25,Math.abs(difference)*.06));
    // Curvature is bounded by body length, not a fixed angular speed.
    const limit=speed/radius*dt,turn=clamp(difference*.42*dt,-limit,limit);
    whale.angle+=turn;
    whale.turn+=((dt?turn/dt:0)-whale.turn)*(1-Math.exp(-dt*2));
    head.x+=Math.cos(whale.angle)*speed*dt;head.y+=Math.sin(whale.angle)*speed*dt;
    const spacing=whale.scale*LENGTH/(NODES-1);
    let previousAngle=whale.angle+Math.PI;
    for(let i=1;i<NODES;i++){
      const previous=whale.spine[i-1],p=whale.spine[i],raw=Math.atan2(p.y-previous.y,p.x-previous.x);
      const bendLimit=.028+i/NODES*.020,a=previousAngle+clamp(wrapAngle(raw-previousAngle),-bendLimit,bendLimit);
      p.x=previous.x+Math.cos(a)*spacing;p.y=previous.y+Math.sin(a)*spacing;previousAngle=a;
    }
    confineWhale(whale);
  }
  function update(dt) {
    state.pointerAge+=dt;
    for(const whale of whales){
      moveWhale(whale,dt);
      const target=state.mode==='surface'?0:state.mode==='dive'?1:state.mode==='manual'?state.manualDepth:clamp(.44+.56*Math.sin(state.time*.12+whale.phase),0,1);
      whale.depth+=(target-whale.depth)*(1-Math.exp(-dt*.85));
      if(whale.depth<.065 && state.time-whale.lastRing>3.8){
        const p=whale.spine[7];
        rings.push({x:p.x,y:p.y,born:state.time,scale:whale.scale,owner:whale.id,pointer:false});whale.lastRing=state.time;
      }
    }
    for(let i=rings.length-1;i>=0;i--)if(state.time-rings[i].born>4)rings.splice(i,1);
  }
  function waterVisibility(depth) {
    const local=Math.max(0,depth);
    return Math.exp(-local*.0048)*smooth((168-local)/125);
  }
  function projectWhale(whale) {
    const b=whale.buffer;resetBuffer(b);
    const t=state.time,s=whale.scale;
    const pitch=Math.sin(t*.52+whale.phase)*.023;
    const roll=Math.sin(t*.42+whale.phase*2)*.026+clamp(whale.turn*.08,-.026,.026);
    const cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll),baseDepth=60+whale.depth*190;
    for(const p of model){
      let x=p.x,y=p.y,z=p.z,nx=p.nx,ny=p.ny,nz=p.nz;
      // Both flukes share vertical motion, rather than a fish-like lateral flap.
      const tailWeight=Math.pow(clamp((y-310)/280,0,1),1.7),phase=t*2.15+whale.phase-y*.0105,amplitude=21*tailWeight;
      z+=Math.sin(phase)*amplitude;
      const derivative=Math.cos(phase)*-.0105*amplitude+(y>310?Math.sin(phase)*21*1.7*Math.pow(clamp((y-310)/280,0,1),.7)/280:0);
      ny-=nz*derivative;
      if(p.part===PART_FIN){const a=Math.sin(t*1.35+whale.phase+p.side*.2)*.055;z+=p.u*130*a;nx-=nz*a*p.side;}
      if(p.part===PART_TAIL){const a=Math.sin(t*2.15+whale.phase-5.9)*.18;z+=(y-565)*a;ny-=nz*a;}
      // Genuine xyz roll and pitch, applied to positions and normals alike.
      const xr=x*cr+z*sr,zr=-x*sr+z*cr,yr=(y-260)*cp-zr*sp+260,zz=(y-260)*sp+zr*cp;
      const nxr=nx*cr+nz*sr,nzr=-nx*sr+nz*cr,nyr=ny*cp-nzr*sp,nzz=ny*sp+nzr*cp;
      if(nzz<=.015)continue;
      const u=clamp(yr/LENGTH*(NODES-1),0,NODES-1.001),i=Math.floor(u),f=u-i;
      const a=whale.spine[i],c=whale.spine[i+1],len=Math.hypot(c.x-a.x,c.y-a.y)||1;
      const tx=(c.x-a.x)/len,ty=(c.y-a.y)/len,rx=ty,ry=-tx;
      const lateral=Math.sin(t*1.6+whale.phase-yr*.007)*2*tailWeight;
      const screenX=mix(a.x,c.x,f)+rx*(xr+lateral)*s,screenY=mix(a.y,c.y,f)+ry*(xr+lateral)*s;
      const col=Math.round(screenX/state.cell),row=Math.round(screenY/state.cell);
      if(col<0||col>=state.cols||row<0||row>=state.rows)continue;
      const index=row*state.cols+col,localDepth=baseDepth-zz;
      if(localDepth>=b.depth[index])continue;
      if(b.depth[index]===Infinity)b.occupied[b.count++]=index;
      b.depth[index]=localDepth;b.visibility[index]=waterVisibility(localDepth);
      const n=normalize(rx*nxr+tx*nyr,ry*nxr+ty*nyr,nzz);
      const diffuse=Math.max(0,n[0]*light[0]+n[1]*light[1]+n[2]*light[2]);
      const specular=Math.pow(Math.max(0,n[0]*halfLight[0]+n[1]*halfLight[1]+n[2]*halfLight[2]),21);
      b.light[index]=.19+diffuse*.81;b.glint[index]=specular*.32;b.point[index]=p.id;b.part[index]=p.part;
    }
    const stats=whale.stats;
    stats.total=b.count;stats.visible=stats.body=stats.fin=stats.tail=0;stats.bodyTotal=stats.finTotal=stats.tailTotal=0;
    for(let i=0;i<b.count;i++){
      const index=b.occupied[i],part=b.part[index],id=b.point[index];
      if(part===PART_BODY)stats.bodyTotal++;else if(part===PART_FIN)stats.finTotal++;else stats.tailTotal++;
      if(b.visibility[index]<=.026+model[id].noise*.014)continue;
      stats.visible++;if(part===PART_BODY)stats.body++;else if(part===PART_FIN)stats.fin++;else stats.tail++;
      if(b.depth[index]>=buffer.depth[index])continue;
      if(buffer.depth[index]===Infinity)buffer.occupied[buffer.count++]=index;
      buffer.depth[index]=b.depth[index];buffer.visibility[index]=b.visibility[index];buffer.light[index]=b.light[index];
      buffer.glint[index]=b.glint[index];buffer.point[index]=id;buffer.part[index]=part;buffer.owner[index]=whale.id;
    }
  }
  function drawWhales() {
    const cell=state.cell;
    ctx.font='600 '+(cell*1.12).toFixed(2)+'px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';
    for(let i=0;i<buffer.count;i++){
      const index=buffer.occupied[i],p=model[buffer.point[index]],x=(index%state.cols)*cell,y=Math.floor(index/state.cols)*cell;
      const vis=buffer.visibility[index],lighting=buffer.light[index],glint=buffer.glint[index];
      const strength=vis*(buffer.owner[index]===0?1.22:1.03)*(buffer.part[index]===PART_BODY?1:.94);
      const r=Math.min(255,(42*lighting+92*glint)*strength)|0,g=Math.min(255,(128*lighting+114*glint)*strength)|0,b=Math.min(255,(247*lighting+85*glint)*strength)|0;
      // Dim coloured tiles carry the volume; bright monospace marks sit above.
      ctx.fillStyle='rgb('+(r*.25|0)+','+(g*.26|0)+','+(b*.30|0)+')';
      ctx.fillRect(x-cell*.43,y-cell*.43,cell*.86,cell*.86);
      ctx.fillStyle='rgb('+r+','+g+','+b+')';
      if(p.noise>.87&&vis>.15){const size=cell*(p.noise>.96?.76:.62);ctx.fillRect(x-size/2,y-size/2,size,size);}
      else{const glyph=vis<.12?(p.noise>.5?'·':':'):glyphs[Math.floor(p.noise*glyphs.length)];ctx.fillText(glyph,x,y+cell*.035);}
    }
  }
  function drawRings() {
    for(const ring of rings){
      const whale=whales[ring.owner];
      if(!whale||whale.depth>.8||whale.stats.visible===0)continue;
      const age=state.time-ring.born,radius=(8+age*21)*(ring.pointer?1:ring.scale);
      const strength=Math.pow(Math.max(0,1-age/4),2)*(ring.pointer?.28:.12);
      ctx.strokeStyle='rgba(87,133,181,'+strength+')';ctx.lineWidth=.7;
      ctx.beginPath();ctx.arc(ring.x,ring.y,radius,0,TAU);ctx.stroke();
      if(age>.3){ctx.strokeStyle='rgba(58,103,158,'+(strength*.45)+')';ctx.beginPath();ctx.arc(ring.x,ring.y,radius*.72,0,TAU);ctx.stroke();}
    }
  }
  function draw(forceUI=false) {
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);ctx.globalAlpha=1;
    ctx.fillStyle='#000';ctx.fillRect(0,0,state.width,state.height);resetBuffer(buffer);
    for(const whale of whales)projectWhale(whale);
    drawWhales();drawRings();state.dirty=false;syncUI(forceUI);
  }
  function syncUI(force=false) {
    if(!whales.length||(!force&&state.time-state.lastUI<.15))return;
    state.lastUI=state.time;
    const main=whales[0],stats=main.stats;
    $('#depth-value').textContent=(main.depth*32).toFixed(1)+' m';
    if(document.activeElement!==$('#depth')||state.mode!=='manual')$('#depth').value=String(Math.round(main.depth*100));
    $('#depth').setAttribute('aria-valuetext',(main.depth*32).toFixed(1)+' 公尺');
    const labels={auto:'自由巡游',surface:'緩緩上浮',dive:'沉入黑暗',manual:'手動深度'};
    const label=state.paused?'已暫停':state.pointerAge<4?'小藍正在靠近':labels[state.mode];
    if($('#state-label').textContent!==label)$('#state-label').textContent=label;
    ocean.dataset.mode=state.mode;ocean.dataset.paused=String(state.paused);
    ocean.dataset.depth=(main.depth*32).toFixed(2);ocean.dataset.depthNormalized=main.depth.toFixed(4);
    ocean.dataset.time=state.time.toFixed(2);ocean.dataset.coverage=(stats.visible/Math.max(1,stats.total)).toFixed(4);
    ocean.dataset.mainVisibleCells=String(stats.visible);ocean.dataset.mainTotalCells=String(stats.total);
    ocean.dataset.mainBodyCells=String(stats.body);ocean.dataset.mainFinCells=String(stats.fin);ocean.dataset.mainTailCells=String(stats.tail);
    ocean.dataset.mainBodyTotal=String(stats.bodyTotal);ocean.dataset.mainFinTotal=String(stats.finTotal);ocean.dataset.mainTailTotal=String(stats.tailTotal);
    ocean.dataset.visibleCells=String(buffer?buffer.count:0);
    ocean.dataset.projection='orthographic-top-down';ocean.dataset.geometry='xyz-surface-normals';
    ocean.dataset.phase=main.depth>.96?'hidden':main.depth<.12?'shallow':main.depth<.55?'revealing':'deep';
  }
  function refreshModes() {
    document.querySelectorAll('.mode-button').forEach(button=>{
      const active=button.dataset.mode===state.mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    });
  }
  function setMode(mode) {
    state.mode=mode;refreshModes();
    // Paused mode switches expose inspectable still endpoints.
    if(state.paused&&mode!=='auto'){
      for(const whale of whales)whale.depth=mode==='surface'?0:1;
      if(mode==='dive')rings.length=0;
    }
    state.dirty=true;draw(true);
  }
  function setPaused(paused) {
    state.paused=paused;$('#pause-icon').toggleAttribute('hidden',paused);$('#play-icon').toggleAttribute('hidden',!paused);
    $('#pause-button').setAttribute('aria-label',paused?'繼續動畫':'暫停動畫');
    $('#pause-button').setAttribute('aria-pressed',String(paused));$('#pause-button').title=paused?'繼續 · 空白鍵':'暫停 · 空白鍵';
    state.dirty=true;syncUI(true);
  }
  function setManualDepth(value) {
    state.mode='manual';state.manualDepth=clamp(value,0,1);
    for(const whale of whales)whale.depth=state.manualDepth;
    if(state.manualDepth>.8)rings.length=0;
    refreshModes();state.dirty=true;draw(true); // Works synchronously while paused.
  }
  function resize() {
    const previousWidth=state.width,previousHeight=state.height,wasMobile=state.mobile;
    state.width=ocean.clientWidth;state.height=ocean.clientHeight;state.mobile=state.width<=700;
    state.dpr=Math.min(devicePixelRatio||1,2);state.cell=state.mobile?4:6;
    state.cols=Math.ceil(state.width/state.cell)+1;state.rows=Math.ceil(state.height/state.cell)+1;
    canvas.width=Math.round(state.width*state.dpr);canvas.height=Math.round(state.height*state.dpr);
    if(!whales.length||wasMobile!==state.mobile){
      initialiseWhales();
      if(state.mode==='manual'||state.mode==='surface'||state.mode==='dive'){
        const depth=state.mode==='manual'?state.manualDepth:state.mode==='surface'?0:1;
        whales.forEach(whale=>{whale.depth=depth;});
      }
    }else{
      const sx=state.width/previousWidth,sy=state.height/previousHeight;
      for(const whale of whales){whale.spine.forEach(p=>{p.x*=sx;p.y*=sy;});whale.goal.x*=sx;whale.goal.y*=sy;}
    }
    buffer=makeBuffer();whales.forEach(whale=>{whale.buffer=makeBuffer();});
    rings.length=0;state.dirty=true;draw(true);
  }

  document.querySelectorAll('.mode-button').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  $('#pause-button').addEventListener('click',()=>setPaused(!state.paused));
  $('#depth').addEventListener('input',event=>setManualDepth(Number(event.target.value)/100));
  $('#speed').addEventListener('input',event=>{
    state.speed=Number(event.target.value);$('#speed-value').textContent=state.speed.toFixed(1)+'×';
    $('#speed').setAttribute('aria-valuetext',state.speed.toFixed(1)+' 倍速');ocean.dataset.speed=state.speed.toFixed(1);
  });
  canvas.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    whales[0].goal={x:clamp(x,35,state.width-35),y:clamp(y,70,state.height-120)};whales[0].goalAge=0;
    state.pointerAge=0;rings.push({x,y,born:state.time,scale:1,owner:0,pointer:true});state.dirty=true;
    if(state.paused)draw(true);
  });
  const dialog=$('#about-dialog');
  $('#about-open').addEventListener('click',()=>dialog.showModal());$('#about-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  document.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||dialog.open||/INPUT|TEXTAREA|BUTTON|A/.test(document.activeElement.tagName))return;
    if(event.code==='Space'){event.preventDefault();setPaused(!state.paused);}
    else if(event.key==='1')setMode('auto');else if(event.key==='2')setMode('surface');else if(event.key==='3')setMode('dive');
  });
  reducedMotion.addEventListener('change',event=>{if(event.matches)setPaused(true);});
  window.addEventListener('resize',resize);
  let previous=performance.now();
  document.addEventListener('visibilitychange',()=>{previous=performance.now();});
  function frame(now) {
    const elapsed=Math.min(.045,(now-previous)/1000);previous=now;
    if(!state.paused&&!document.hidden){const dt=elapsed*state.speed;state.time+=dt;update(dt);draw();}
    else if(state.dirty)draw(true);
    requestAnimationFrame(frame);
  }
  resize();setPaused(state.paused);requestAnimationFrame(frame);
})();
