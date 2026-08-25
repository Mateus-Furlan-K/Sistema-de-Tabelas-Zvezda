const params = new URLSearchParams(location.search);
const systemId = params.get('id');
if (!systemId) location.href = 'index.html';

let system, teams = [], years = [], divisions = [], appearances = [], groups = [], knockouts = [], systems = [];
let editingTeamId = null, editingAppearanceId = null, editingKnockoutId = null, continueCreatingTeams = true;
const activeCellTabs = new Map();
let statsSelectedDivisions = new Set(); // vazio = todas
let statsSort = { key: 'titles', dir: 'desc' };
const $ = id => document.getElementById(id);
const toast = $('toast');
const esc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

function showToast(message){
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2500);
}
function sortedYears(){ return [...years].sort((a,b)=>a.year-b.year); }
function sortedDivisions(){ return [...divisions].sort((a,b)=>(a.position||0)-(b.position||0)); }
function teamById(id){ return teams.find(t=>t.id===id); }
function getGroups(yearId, divisionId){
  const custom = groups.filter(g=>g.yearId===yearId && g.divisionId===divisionId).sort((a,b)=>(a.position||0)-(b.position||0));
  const hasUngrouped = appearances.some(a=>a.yearId===yearId && a.divisionId===divisionId && !a.groupId);
  if (hasUngrouped || !custom.length) return [{id:'default',yearId,divisionId,name:'Grupo único',position:0}, ...custom];
  return custom;
}
function getAppearance(teamId,yearId,divisionId,groupId){
  return appearances.find(a=>a.teamId===teamId && a.yearId===yearId && a.divisionId===divisionId && (a.groupId||'default')===groupId);
}
function newAppearance(teamId,yearId,divisionId,groupId){
  return {id:id('appearance'),systemId,teamId,yearId,divisionId,groupId:groupId==='default'?null:groupId,points:0,goalDifference:0,movement:'stay',placement:'',competitions:{champions:false,europa:false,conference:false}};
}
function compare(a,b){
  if((b.points||0)!==(a.points||0)) return (b.points||0)-(a.points||0);
  if((b.goalDifference||0)!==(a.goalDifference||0)) return (b.goalDifference||0)-(a.goalDifference||0);
  return (teamById(a.teamId)?.name||'').localeCompare(teamById(b.teamId)?.name||'','pt-BR');
}

async function load(){
  system = await get('systems',systemId);
  if(!system){ location.href='index.html'; return; }
  [teams,years,divisions,appearances,groups,knockouts,systems] = await Promise.all([
    getByIndex('teams','systemId',systemId), getByIndex('years','systemId',systemId),
    getByIndex('divisions','systemId',systemId), getByIndex('appearances','systemId',systemId),
    getByIndex('groups','systemId',systemId), getByIndex('knockouts','systemId',systemId), getAll('systems')
  ]);
  render();
}
function render(){
  $('systemTitle').textContent=system.name;
  $('systemDescription').textContent=system.description||'Sistema de tabelas';
  renderStats(); renderSelects(); renderTeams(); renderMatrix(); renderHistoryStats();
}
function renderStats(){
  const max=years.length?Math.max(...years.map(y=>y.year)):'—';
  $('statsRow').innerHTML=`<div class="stat-card"><strong>${teams.length}</strong><span>EQUIPES</span></div><div class="stat-card"><strong>${divisions.length}</strong><span>DIVISÕES</span></div><div class="stat-card"><strong>${years.length}</strong><span>ANOS</span></div><div class="stat-card"><strong>${max}</strong><span>ÚLTIMO ANO</span></div>`;
}
function renderSelects(){
  $('teamSelect').innerHTML=teams.length?[...teams].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join(''):`<option value="">Cadastre uma equipe primeiro</option>`;
  $('yearSelect').innerHTML=sortedYears().map(y=>`<option value="${y.id}">${y.year}</option>`).join('');
  $('divisionSelect').innerHTML=sortedDivisions().map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');
  renderGroupSelect();
}
function renderGroupSelect(){
  const gs=getGroups($('yearSelect').value,$('divisionSelect').value);
  $('groupSelect').innerHTML=gs.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
}
$('yearSelect').addEventListener('change',renderGroupSelect); $('divisionSelect').addEventListener('change',renderGroupSelect);

function renderTeams(){
  const c=$('teamsList');
  if(!teams.length){c.innerHTML='<span style="font-size:12px;color:var(--muted)">Nenhuma equipe cadastrada.</span>';return;}
  c.innerHTML=[...teams].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(t=>`<div class="team-card">${t.logo?`<img class="team-logo" src="${esc(t.logo)}" alt="">`:`<div class="team-placeholder">${esc(t.short||t.name.slice(0,2).toUpperCase())}</div>`}<div class="team-card-info"><span class="team-card-name">${esc(t.name)}</span>${t.short?`<span class="team-card-short">${esc(t.short)}</span>`:''}</div><button class="edit-team" data-team="${t.id}">✎</button></div>`).join('');
  c.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>openTeamModal(b.dataset.team));
}

function renderMatrix(){
  const m=$('matrix'), ys=sortedYears(), ds=sortedDivisions();
  m.style.gridTemplateColumns=`150px repeat(${ys.length},360px)`;
  m.innerHTML='<div class="corner-cell">DIVISÃO / ANO</div>';
  ys.forEach(y=>m.insertAdjacentHTML('beforeend',`<div class="year-header"><span>${y.year}</span><button class="delete-year-btn" data-year="${y.id}">×</button></div>`));
  m.querySelectorAll('.delete-year-btn').forEach(b=>b.onclick=deleteYear);
  ds.forEach((d,di)=>{
    m.insertAdjacentHTML('beforeend',`<div class="division-label"><strong>${esc(d.name)}</strong><span>Divisão nacional ${di+1}</span></div>`);
    ys.forEach(y=>{const cell=document.createElement('div');cell.className='table-cell';renderCell(cell,y,d,di);m.appendChild(cell);});
  });
}
async function deleteYear(e){
  const y=years.find(x=>x.id===e.currentTarget.dataset.year); if(!y||!confirm(`Excluir ${y.year}? Todos os registros daquele ano serão removidos.`))return;
  for(const a of appearances.filter(a=>a.yearId===y.id))await remove('appearances',a.id);
  for(const g of groups.filter(g=>g.yearId===y.id))await remove('groups',g.id);
  for(const k of knockouts.filter(k=>k.yearId===y.id))await remove('knockouts',k.id);
  await remove('years',y.id);
  appearances=appearances.filter(a=>a.yearId!==y.id);groups=groups.filter(g=>g.yearId!==y.id);knockouts=knockouts.filter(k=>k.yearId!==y.id);years=years.filter(x=>x.id!==y.id);
  await touchSystem(systemId);render();showToast(`Ano ${y.year} excluído.`);
}

function renderCell(cell,year,division,dIndex){
  const gs=getGroups(year.id,division.id);
  const wrap=document.createElement('div'); wrap.className='cell-tabs-wrap';
  const tabs=document.createElement('div'); tabs.className='cell-tabs';
  const content=document.createElement('div'); content.className='cell-tab-content';
  const stateKey=`${year.id}|${division.id}`;
  let activeId=activeCellTabs.get(stateKey);
  if(activeId && !gs.some(g=>g.id===activeId) && !knockouts.some(k=>k.yearId===year.id&&k.divisionId===division.id&&activeId==='__knockout__')) activeId=gs[0]?.id;
  if(!activeId) activeId=gs[0]?.id;
  gs.forEach(g=>{
    const b=document.createElement('button'); b.className='cell-tab'+(activeId===g.id?' active':''); b.textContent=g.name; b.dataset.groupId=g.id;
    b.addEventListener('dragover',e=>{e.preventDefault();b.classList.add('drop-target')});
    b.addEventListener('dragleave',()=>b.classList.remove('drop-target'));
    b.addEventListener('drop',async e=>{e.preventDefault();b.classList.remove('drop-target');const aid=e.dataTransfer.getData('text/plain');await moveAppearanceToGroup(aid,g.id,year.id,division.id);});
    b.onclick=()=>{activeCellTabs.set(stateKey,g.id);tabs.querySelectorAll('.cell-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderGroupContent(content,year,division,dIndex,g);};
    tabs.appendChild(b);
  });
  const ko=knockouts.find(k=>k.yearId===year.id&&k.divisionId===division.id);
  if(ko){const b=document.createElement('button');b.className='cell-tab knockout-tab'+(activeId==='__knockout__'?' active':'');b.textContent='Mata-mata';b.onclick=()=>{activeCellTabs.set(stateKey,'__knockout__');tabs.querySelectorAll('.cell-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderKnockoutContent(content,ko,year,division);};tabs.appendChild(b);}
  const addG=document.createElement('button');addG.className='cell-tab add-tab';addG.textContent='+';addG.title='Novo grupo';addG.onclick=()=>addGroup(year,division);tabs.appendChild(addG);
  const addK=document.createElement('button');addK.className='cell-tab add-tab';addK.textContent='⚔';addK.title='Criar/editar mata-mata';addK.onclick=()=>openKnockoutModal(year,division);tabs.appendChild(addK);
  wrap.append(tabs,content);cell.replaceChildren(wrap);
  if(activeId==='__knockout__' && ko) renderKnockoutContent(content,ko,year,division);
  else { const g=gs.find(x=>x.id===activeId)||gs[0]; if(g){activeCellTabs.set(stateKey,g.id);renderGroupContent(content,year,division,dIndex,g);} }
}
async function moveAppearanceToGroup(aid,groupId,yearId,divisionId){
  const a=appearances.find(x=>x.id===aid);if(!a||a.yearId!==yearId||a.divisionId!==divisionId)return;
  const targetGroupId=groupId==='default'?null:groupId;
  if(a.groupId===targetGroupId)return;
  const duplicate=appearances.find(x=>x.id!==a.id&&x.teamId===a.teamId&&x.yearId===yearId&&x.divisionId===divisionId&&(x.groupId||'default')===groupId);
  if(duplicate){showToast('Essa equipe já está no grupo de destino.');return;}
  a.groupId=targetGroupId;await put('appearances',a);await touchSystem(systemId);render();showToast('Equipe movida de grupo.');
}

function renderGroupContent(c,year,division,dIndex,g){
  const gid=g.id==='default'?'default':g.id;
  const rows=appearances.filter(a=>a.yearId===year.id&&a.divisionId===division.id&&(a.groupId||'default')===gid).sort(compare);
  const customGroups=groups.filter(x=>x.yearId===year.id&&x.divisionId===division.id);
  c.innerHTML=`<div class="cell-header"><strong>${esc(g.name)} · ${rows.length} equipe${rows.length===1?'':'s'}</strong><div class="cell-header-actions"><button class="small-btn add-team-cell">+ equipe</button><button class="small-btn advance-cell">→ próximo ano</button>${g.id!=='default'?`<button class="small-btn delete-group">× grupo</button>`:(customGroups.length&&rows.length===0?`<button class="small-btn delete-empty-default">× grupo único</button>`:'')}</div></div>`;
  c.querySelector('.add-team-cell').onclick=()=>openAddAppearanceModal(year,division,g);
  c.querySelector('.advance-cell').onclick=()=>advanceGroup(year,division,g);
  const dg=c.querySelector('.delete-group'); if(dg)dg.onclick=()=>deleteGroup(g);
  const dd=c.querySelector('.delete-empty-default'); if(dd)dd.onclick=()=>removeDefaultGroup(year,division);
  if(!rows.length){c.insertAdjacentHTML('beforeend','<div class="empty-cell"><div>Nenhuma equipe<span>Arraste uma equipe para esta aba ou use “+ equipe”.</span></div></div>');return;}
  const showPromotion=dIndex>0;
  const table=document.createElement('table'); table.className='standings';
  table.innerHTML=`<thead><tr><th>#</th><th>Equipe</th><th>Pts</th>${showPromotion?'<th>↑</th>':''}<th>↓</th></tr></thead>`;
  const tb=document.createElement('tbody');
  rows.forEach((a,i)=>{
    const t=teamById(a.teamId);if(!t)return;
    const tr=document.createElement('tr');tr.draggable=true;tr.dataset.appearance=a.id;tr.className='team-row '+(a.movement==='promote'?'promoted':a.movement==='relegate'?'relegated':'');
    tr.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',a.id);tr.classList.add('dragging')});
    tr.addEventListener('dragend',()=>tr.classList.remove('dragging'));
    const marks=[];if(a.competitions?.champions)marks.push('<span class="badge champions">CL</span>');if(a.competitions?.europa)marks.push('<span class="badge europa">EL</span>');if(a.competitions?.conference)marks.push('<span class="badge conference">CO</span>');
    const place=a.placement?`<span class="placement-mini">${a.placement==='champion'?'🏆':a.placement==='vice'?'🥈':'🥉'}</span>`:'';
    tr.innerHTML=`<td class="position">${i+1}</td><td><div class="team-info"><span class="drag-handle">☷</span>${t.logo?`<img class="standing-logo" src="${esc(t.logo)}" alt="">`:`<div class="standing-placeholder">${esc(t.short||t.name.slice(0,2).toUpperCase())}</div>`}<div><div class="team-name">${esc(t.name)} ${place}</div>${t.short?`<span class="team-short">${esc(t.short)}</span>`:''}</div><div class="competition-markers">${marks.join('')}</div></div></td><td class="points">${a.points||0}</td>${showPromotion?'<td class="movement"><button class="movement-btn promote-btn">↑</button></td>':''}<td class="movement"><button class="movement-btn relegate-btn">↓</button></td>`;
    tr.querySelector('.points').onclick=()=>openAppearanceModal(a.id);tr.querySelector('td:nth-child(2)').onclick=e=>{if(!e.target.closest('.drag-handle'))openAppearanceModal(a.id)};
    if(showPromotion)tr.querySelector('.promote-btn').onclick=()=>toggleMovement(a.id,'promote');tr.querySelector('.relegate-btn').onclick=()=>toggleMovement(a.id,'relegate');tb.appendChild(tr);
  });
  table.appendChild(tb);c.appendChild(table);
}

async function addGroup(year,division){
  const n=groups.filter(g=>g.yearId===year.id&&g.divisionId===division.id).length+1;
  const name=prompt(`Nome do grupo em ${year.year} — ${division.name}:`,`Grupo ${n}`);if(!name?.trim())return;
  const g={id:id('group'),systemId,yearId:year.id,divisionId:division.id,name:name.trim(),position:n};await put('groups',g);groups.push(g);await touchSystem(systemId);render();showToast('Grupo criado.');
}
async function deleteGroup(g){
  if(!confirm(`Excluir ${g.name}? As equipes serão devolvidas ao Grupo único.`))return;
  for(const a of appearances.filter(a=>a.groupId===g.id)){a.groupId=null;await put('appearances',a);}
  await remove('groups',g.id);groups=groups.filter(x=>x.id!==g.id);appearances.forEach(a=>{if(a.groupId===g.id)a.groupId=null});await touchSystem(systemId);render();
}
async function removeDefaultGroup(year,division){
  const custom=groups.filter(g=>g.yearId===year.id&&g.divisionId===division.id);if(!custom.length)return;
  if(appearances.some(a=>a.yearId===year.id&&a.divisionId===division.id&&!a.groupId))return alert('O Grupo único ainda possui equipes.');
  render();showToast('Grupo único removido da visualização.');
}

$('appearanceForm').addEventListener('submit',async e=>{e.preventDefault();await addAppearanceFromValues($('teamSelect').value,$('yearSelect').value,$('divisionSelect').value,$('groupSelect').value);});
async function addAppearanceFromValues(tid,yid,did,gid){
  if(!tid)return alert('Cadastre uma equipe primeiro.');if(getAppearance(tid,yid,did,gid))return alert('Essa equipe já está nessa tabela/grupo.');
  const a=newAppearance(tid,yid,did,gid);await put('appearances',a);appearances.push(a);await touchSystem(systemId);render();showToast('Equipe adicionada.');
}
function openAddAppearanceModal(year,division,g){
  $('cellAddYear').textContent=year.year;$('cellAddDivision').textContent=division.name;$('cellAddGroup').textContent=g.name;
  $('cellTeamPicker').innerHTML=teams.length?[...teams].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(t=>`<label><input type="checkbox" value="${t.id}"> ${esc(t.name)}</label>`).join(''):'<span>Nenhuma equipe cadastrada.</span>';
  $('cellAddModal').dataset.year=year.id;$('cellAddModal').dataset.division=division.id;$('cellAddModal').dataset.group=g.id;$('cellAddModal').classList.remove('hidden');
}
function closeCellAddModal(){$('cellAddModal').classList.add('hidden');}
$('closeCellAddModal').onclick=closeCellAddModal;$('cancelCellAddBtn').onclick=closeCellAddModal;$('saveCellAddBtn').onclick=async()=>{const md=$('cellAddModal'),y=md.dataset.year,d=md.dataset.division,g=md.dataset.group;let added=0;for(const input of md.querySelectorAll('input:checked')){if(!getAppearance(input.value,y,d,g)){const a=newAppearance(input.value,y,d,g);await put('appearances',a);appearances.push(a);added++;}}closeCellAddModal();await touchSystem(systemId);render();showToast(`${added} equipe${added===1?'':'s'} adicionada${added===1?'':'s'}.`)};

$('newTeamBtn').addEventListener('click', e=>{e.preventDefault();openTeamModal();});
let logoCropSource=null, logoCropObjectUrl=null;
function openTeamModal(tid=null){editingTeamId=tid;const t=teams.find(x=>x.id===tid);$('teamModalTitle').textContent=t?'Editar equipe':'Nova equipe';$('teamNameInput').value=t?.name||'';$('teamShortInput').value=t?.short||'';$('teamLogoInput').value=t?.logo||'';if(tid===null)$('continueTeamInput').checked=continueCreatingTeams;updateLogoPreview(t?.logo||'');$('teamModal').classList.remove('hidden');$('teamNameInput').focus();}
function updateLogoPreview(src){const w=$('logoPreviewWrap'),img=$('logoPreview');if(src){img.src=src;w.classList.remove('hidden');}else{img.removeAttribute('src');w.classList.add('hidden');}}

$('continueTeamInput').addEventListener('change',e=>{continueCreatingTeams=e.target.checked;});
function closeTeamModal(){$('teamModal').classList.add('hidden');editingTeamId=null;}
$('closeTeamModal').onclick=closeTeamModal;$('cancelTeamBtn').onclick=closeTeamModal;$('teamModal').onclick=e=>{if(e.target===$('teamModal'))closeTeamModal()};
$('saveTeamBtn').onclick=async()=>{
  const name=$('teamNameInput').value.trim();if(!name)return alert('Digite o nome da equipe.');if(teams.some(t=>t.id!==editingTeamId&&t.name.toLowerCase()===name.toLowerCase()))return alert('Já existe uma equipe com esse nome.');
  if(editingTeamId){const t=teams.find(x=>x.id===editingTeamId);t.name=name;t.short=$('teamShortInput').value.trim().toUpperCase();t.logo=$('teamLogoInput').value.trim();await put('teams',t);closeTeamModal();await touchSystem(systemId);render();showToast('Equipe atualizada em todas as temporadas.');return;}
  const t={id:id('team'),systemId,name,short:$('teamShortInput').value.trim().toUpperCase(),logo:$('teamLogoInput').value.trim(),createdAt:new Date().toISOString()};await put('teams',t);teams.push(t);await touchSystem(systemId);render();showToast('Equipe criada.');
  if($('continueTeamInput').checked){openTeamModal();}else closeTeamModal();
};


$('teamLogoInput').addEventListener('input',()=>updateLogoPreview($('teamLogoInput').value.trim()));
$('clearLogoBtn').addEventListener('click',()=>{$('teamLogoInput').value='';updateLogoPreview('');});
$('teamLogoFileInput').addEventListener('change',e=>{
  const file=e.target.files?.[0]; if(!file)return;
  if(!file.type.startsWith('image/'))return alert('Escolha uma imagem válida.');
  if(logoCropObjectUrl)URL.revokeObjectURL(logoCropObjectUrl);
  logoCropObjectUrl=URL.createObjectURL(file); logoCropSource=new Image();
  logoCropSource.onload=()=>{$('logoZoomInput').value=1;$('logoXInput').value=0;$('logoYInput').value=0;drawLogoCrop();$('logoCropModal').classList.remove('hidden');};
  logoCropSource.src=logoCropObjectUrl;
});
function drawLogoCrop(){
  const canvas=$('logoCropCanvas'),ctx=canvas.getContext('2d'),img=logoCropSource;if(!img)return;
  const size=canvas.width,zoom=Number($('logoZoomInput').value),x=Number($('logoXInput').value),y=Number($('logoYInput').value);
  ctx.clearRect(0,0,size,size);ctx.fillStyle='#eef1f3';ctx.fillRect(0,0,size,size);
  const scale=Math.max(size/img.width,size/img.height)*zoom, w=img.width*scale,h=img.height*scale;
  const maxX=Math.max(0,(w-size)/2),maxY=Math.max(0,(h-size)/2);
  const dx=(size-w)/2+x*maxX*2,dy=(size-h)/2+y*maxY*2;
  ctx.drawImage(img,dx,dy,w,h);
}
['logoZoomInput','logoXInput','logoYInput'].forEach(id=>$(id).addEventListener('input',drawLogoCrop));
function closeLogoCrop(){ $('logoCropModal').classList.add('hidden'); }
$('closeLogoCropModal').onclick=closeLogoCrop;$('cancelLogoCropBtn').onclick=closeLogoCrop;
$('saveLogoCropBtn').onclick=()=>{const c=$('logoCropCanvas');const data=c.toDataURL('image/png');$('teamLogoInput').value=data;updateLogoPreview(data);closeLogoCrop();$('teamLogoFileInput').value='';};

$('importTeamsBtn').onclick=()=>openImportTeamsModal();
function openImportTeamsModal(){
  const other=systems.filter(s=>s.id!==systemId);
  $('sourceSystemSelect').innerHTML=other.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')||'<option value="">Nenhum outro sistema</option>';
  $('sourceSystemSelect').onchange=renderImportTeamPicker;
  renderImportTeamPicker();
  $('importTeamsModal').classList.remove('hidden');
}
async function renderImportTeamPicker(){
  const sid=$('sourceSystemSelect').value;
  if(!sid){$('importTeamPicker').innerHTML='<span>Nenhum outro sistema disponível.</span>';return;}
  const source=await getByIndex('teams','systemId',sid);
  $('importTeamPicker').innerHTML=source.length?source.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(t=>`<label class="import-team-option"><input type="checkbox" value="${t.id}"><span class="team-info-mini">${t.logo?`<img class="standing-logo" src="${esc(t.logo)}" alt="">`:`<span class="standing-placeholder">${esc(t.short||t.name.slice(0,2).toUpperCase())}</span>`}<span>${esc(t.name)}</span></span></label>`).join(''):'<span>Nenhuma equipe neste sistema.</span>';
}
function closeImportTeamsModal(){$('importTeamsModal').classList.add('hidden')}
$('closeImportTeamsModal').onclick=closeImportTeamsModal;$('cancelImportTeamsBtn').onclick=closeImportTeamsModal;
$('saveImportTeamsBtn').onclick=async()=>{
  const sid=$('sourceSystemSelect').value;
  if(!sid)return alert('Selecione um sistema de origem.');
  const sourceTeams=await getByIndex('teams','systemId',sid);
  const selected=[...$('importTeamPicker').querySelectorAll('input:checked')];let added=0;
  for(const inp of selected){const src=sourceTeams.find(t=>t.id===inp.value);if(!src)continue;if(teams.some(t=>t.systemId===systemId&&t.name.toLowerCase()===src.name.toLowerCase()))continue;const copy={...src,id:id('team'),systemId,createdAt:new Date().toISOString()};await put('teams',copy);teams.push(copy);added++;}
  closeImportTeamsModal();await touchSystem(systemId);render();showToast(`${added} equipe${added===1?'':'s'} importada${added===1?'':'s'}.`);
};

async function addYear(y){if(!Number.isInteger(y)||y<1800||y>3000)throw Error('Ano inválido.');if(years.some(x=>x.year===y))return false;const v={id:id('year'),systemId,year:y,createdAt:new Date().toISOString()};await put('years',v);years.push(v);return true;}
$('addBeforeYearBtn').onclick=async()=>{if(!years.length)return alert('Não há nenhum ano cadastrado.');const y=Math.min(...years.map(x=>x.year))-1;if(await addYear(y)){await touchSystem(systemId);render();showToast(`Ano ${y} adicionado.`)}};
$('addAfterYearBtn').onclick=async()=>{if(!years.length)return alert('Não há nenhum ano cadastrado.');const y=Math.max(...years.map(x=>x.year))+1;if(await addYear(y)){await touchSystem(systemId);render();showToast(`Ano ${y} adicionado.`)}};
$('addYearRangeBtn').onclick=()=>{$('rangeStartInput').value=years.length?Math.min(...years.map(x=>x.year)):'';$('rangeEndInput').value=years.length?Math.max(...years.map(x=>x.year)):'';$('yearRangeModal').classList.remove('hidden')};
function closeYearRangeModal(){$('yearRangeModal').classList.add('hidden')}$('closeYearRangeModal').onclick=closeYearRangeModal;$('cancelYearRangeBtn').onclick=closeYearRangeModal;
$('saveYearRangeBtn').onclick=async()=>{const s=Number($('rangeStartInput').value),e=Number($('rangeEndInput').value);if(!Number.isInteger(s)||!Number.isInteger(e)||s<1800||e>3000||s>e)return alert('Intervalo inválido.');let n=0;for(let y=s;y<=e;y++)if(await addYear(y))n++;await touchSystem(systemId);closeYearRangeModal();render();showToast(n?`${n} anos adicionados.`:'Nenhum ano novo.')};
$('addDivisionBtn').onclick=async()=>{const p=divisions.length+1,d={id:id('division'),systemId,name:`${p}ª Divisão`,position:p};await put('divisions',d);divisions.push(d);await touchSystem(systemId);render();showToast('Divisão criada.')};

async function advanceGroup(year,division,g){
  let ny=years.find(y=>y.year===year.year+1);if(!ny){ny={id:id('year'),systemId,year:year.year+1,createdAt:new Date().toISOString()};await put('years',ny);years.push(ny);}
  const di=sortedDivisions().findIndex(d=>d.id===division.id);const source=appearances.filter(a=>a.yearId===year.id&&a.divisionId===division.id&&(a.groupId||'default')===g.id);
  for(const a of source){let ti=di;if(a.movement==='promote'&&di>0)ti--;if(a.movement==='relegate'&&di<sortedDivisions().length-1)ti++;const td=sortedDivisions()[ti];if(!td)continue;if(!getAppearance(a.teamId,ny.id,td.id,'default')){const c=newAppearance(a.teamId,ny.id,td.id,'default');await put('appearances',c);appearances.push(c);}}
  await touchSystem(systemId);render();showToast(`Equipes passadas para ${ny.year}.`);
}
$('advanceSeasonBtn').onclick=async()=>{const y=Math.max(...years.map(x=>x.year)),obj=years.find(x=>x.year===y);if(!confirm(`Passar todas as equipes de ${y} para ${y+1}?`))return;for(const d of sortedDivisions())for(const g of getGroups(obj.id,d.id))await advanceGroup(obj,d,g);showToast(`Temporada ${y+1} criada.`)};

function toggleMovement(aid,type){const a=appearances.find(x=>x.id===aid);if(!a)return;a.movement=a.movement===type?'stay':type;put('appearances',a).then(()=>{render();});}
function openAppearanceModal(aid){const a=appearances.find(x=>x.id===aid);if(!a)return;editingAppearanceId=aid;$('appearanceTitle').textContent=teamById(a.teamId)?.name||'Editar temporada';$('pointsInput').value=a.points||0;$('gdInput').value=a.goalDifference||0;$('placementInput').value=a.placement||'';$('championsInput').checked=!!a.competitions?.champions;$('europaInput').checked=!!a.competitions?.europa;$('conferenceInput').checked=!!a.competitions?.conference;$('appearanceModal').classList.remove('hidden')}
function closeAppearanceModal(){$('appearanceModal').classList.add('hidden');editingAppearanceId=null}
$('closeAppearanceModal').onclick=closeAppearanceModal;$('saveAppearanceBtn').onclick=async()=>{const a=appearances.find(x=>x.id===editingAppearanceId);if(!a)return;a.points=Math.max(0,Number($('pointsInput').value)||0);a.goalDifference=Number($('gdInput').value)||0;a.placement=$('placementInput').value;a.competitions={champions:$('championsInput').checked,europa:$('europaInput').checked,conference:$('conferenceInput').checked};await put('appearances',a);closeAppearanceModal();await touchSystem(systemId);render()};
$('deleteAppearanceBtn').onclick=async()=>{const a=appearances.find(x=>x.id===editingAppearanceId);if(!a)return;if(!confirm('Remover esta equipe da tabela?'))return;await remove('appearances',a.id);appearances=appearances.filter(x=>x.id!==a.id);closeAppearanceModal();await touchSystem(systemId);render();showToast('Equipe removida.')};

function renderHistoryStats(){
  const c=$('historyStats');
  const filter=$('statsDivisionFilter');
  if(!c || !filter)return;

  const divs=sortedDivisions();
  const allSelected=statsSelectedDivisions.size===0;

  filter.innerHTML=`<div class="stats-filter-label">Divisões:</div><label class="stats-filter-option"><input type="checkbox" data-stats-all ${allSelected?'checked':''}> Todas</label>${divs.map(d=>`<label class="stats-filter-option"><input type="checkbox" data-stats-division="${esc(d.id)}" ${!allSelected&&statsSelectedDivisions.has(d.id)?'checked':''}> ${esc(d.name)}</label>`).join('')}`;

  const byTeam=new Map();
  teams.forEach(t=>byTeam.set(t.id,{team:t,titles:0,vices:0,thirds:0,promotions:0,relegations:0,points:0}));

  appearances.forEach(a=>{
    if(!allSelected && !statsSelectedDivisions.has(a.divisionId))return;
    const st=byTeam.get(a.teamId);if(!st)return;
    if(a.placement==='champion')st.titles++;
    if(a.placement==='vice')st.vices++;
    if(a.placement==='third')st.thirds++;
    if(a.movement==='promote')st.promotions++;
    if(a.movement==='relegate')st.relegations++;
    st.points+=Number(a.points)||0;
  });

  const valueFor=(st,key)=>key==='team'?st.team.name.toLocaleLowerCase('pt-BR'):Number(st[key]||0);
  const rows=[...byTeam.values()].filter(st=>st.titles+st.vices+st.thirds+st.promotions+st.relegations+st.points>0);
  rows.sort((a,b)=>{
    const av=valueFor(a,statsSort.key),bv=valueFor(b,statsSort.key);
    let cmp=typeof av==='string'?av.localeCompare(bv,'pt-BR'):av-bv;
    if(cmp===0 && statsSort.key!=='team')cmp=a.team.name.localeCompare(b.team.name,'pt-BR');
    return statsSort.dir==='asc'?cmp:-cmp;
  });

  if(!rows.length){c.innerHTML='<div class="empty-stats">Ainda não há estatísticas para as divisões selecionadas.</div>';}
  else {
    const sortButton=(key,label)=>`<button class="stats-sort-btn" data-sort="${key}" title="Ordenar por ${label}">${statsSort.key===key?(statsSort.dir==='asc'?'↑':'↓'):'↕'}</button>`;
    c.innerHTML=`<table class="stats-table"><colgroup><col class="stats-col-team"><col class="stats-col-stat"><col class="stats-col-stat"><col class="stats-col-stat"><col class="stats-col-stat"><col class="stats-col-stat"><col class="stats-col-points"></colgroup><thead><tr><th>Equipe ${sortButton('team','equipe')}</th><th>Títulos ${sortButton('titles','títulos')}</th><th>Vices ${sortButton('vices','vices')}</th><th>3º ${sortButton('thirds','terceiros lugares')}</th><th>Prom. ${sortButton('promotions','promoções')}</th><th>Reb. ${sortButton('relegations','rebaixamentos')}</th><th>Pontos ${sortButton('points','pontos')}</th></tr></thead><tbody>${rows.map(st=>`<tr><td><strong>${esc(st.team.name)}</strong></td><td>${st.titles}</td><td>${st.vices}</td><td>${st.thirds}</td><td>${st.promotions}</td><td>${st.relegations}</td><td>${st.points}</td></tr>`).join('')}</tbody></table>`;
  }

  const allBox=filter.querySelector('[data-stats-all]');
  allBox.onchange=()=>{
    statsSelectedDivisions.clear();
    renderHistoryStats();
  };
  filter.querySelectorAll('[data-stats-division]').forEach(box=>box.onchange=()=>{
    if(allBox.checked)statsSelectedDivisions.clear();
    if(box.checked)statsSelectedDivisions.add(box.dataset.statsDivision);
    else statsSelectedDivisions.delete(box.dataset.statsDivision);
    if(statsSelectedDivisions.size===divs.length)statsSelectedDivisions.clear();
    renderHistoryStats();
  });
  c.querySelectorAll('.stats-sort-btn').forEach(btn=>btn.onclick=()=>{
    const key=btn.dataset.sort;
    if(statsSort.key===key)statsSort.dir=statsSort.dir==='asc'?'desc':'asc';
    else {statsSort.key=key;statsSort.dir=key==='team'?'asc':'desc';}
    renderHistoryStats();
  });
}
function teamLogoHtml(t, cls='knockout-logo'){
  if(!t)return '';
  return t.logo?`<img class="${cls}" src="${esc(t.logo)}" alt="">`:`<span class="${cls} knockout-placeholder">${esc(t.short||t.name.slice(0,2).toUpperCase())}</span>`;
}
function knockoutTeamIds(year,division){
  return [...new Set(appearances.filter(a=>a.yearId===year.id&&a.divisionId===division.id).map(a=>a.teamId))];
}
function openKnockoutModal(year,division){
  editingKnockoutId=knockouts.find(k=>k.yearId===year.id&&k.divisionId===division.id)?.id||null;
  const k=knockouts.find(x=>x.id===editingKnockoutId)||{id:id('knockout'),systemId,yearId:year.id,divisionId:division.id,name:'Mata-mata',size:8,slots:[],rounds:[]};
  $('knockoutModal').dataset.year=year.id;$('knockoutModal').dataset.division=division.id;$('knockoutTitle').textContent=`Mata-mata — ${division.name} ${year.year}`;$('knockoutNameInput').value=k.name||'Mata-mata';
  $('knockoutSizeInput').value=String(k.size||8);
  renderKnockoutSlotsModal(k,year,division);
  $('knockoutModal').classList.remove('hidden');
}
function renderKnockoutSlotsModal(k,year,division){
  const size=Number($('knockoutSizeInput').value)||8, ids=knockoutTeamIds(year,division), old=k.slots||[];
  const slots=Array.from({length:size},(_,i)=>old[i]||null);
  $('knockoutSlots').innerHTML=slots.map((tid,i)=>`<label class="knockout-slot-label">Vaga ${i+1}<select data-slot="${i}"><option value="">— vazio —</option>${ids.map(id=>{const t=teamById(id);return `<option value="${id}" ${tid===id?'selected':''}>${esc(t?.name||'')}</option>`}).join('')}</select></label>`).join('');
}
$('knockoutSizeInput').addEventListener('change',()=>{const y=years.find(x=>x.id===$('knockoutModal').dataset.year),d=divisions.find(x=>x.id===$('knockoutModal').dataset.division);if(y&&d)renderKnockoutSlotsModal({slots:[]},y,d);});
function closeKnockoutModal(){$('knockoutModal').classList.add('hidden')}
$('closeKnockoutModal').onclick=closeKnockoutModal;$('cancelKnockoutBtn').onclick=closeKnockoutModal;
$('saveKnockoutBtn').onclick=async()=>{
  const md=$('knockoutModal'),yid=md.dataset.year,did=md.dataset.division,size=Number($('knockoutSizeInput').value);if(![2,4,8,16,32].includes(size))return alert('O tamanho deve ser 2, 4, 8, 16 ou 32.');
  let k=knockouts.find(x=>x.id===editingKnockoutId);if(!k){k={id:editingKnockoutId||id('knockout'),systemId,yearId:yid,divisionId:did,name:'Mata-mata',size,slots:[],rounds:[],championTeamId:null};knockouts.push(k);}
  k.name=$('knockoutNameInput').value.trim()||'Mata-mata';k.size=size;k.slots=[...$('knockoutSlots').querySelectorAll('select')].map(s=>s.value||null);k.rounds=[{name:roundName(size),matches:makeBracketMatches(k.slots)}];k.championTeamId=null;
  await put('knockouts',k);closeKnockoutModal();await touchSystem(systemId);render();showToast('Mata-mata criado.');
};
function roundName(size){if(size===2)return'Final';if(size===4)return'Semifinais';if(size===8)return'Quartas de final';if(size===16)return'Oitavas de final';return'Rodada';}
function makeBracketMatches(slots){const matches=[];for(let i=0;i<slots.length;i+=2)matches.push({a:slots[i]||null,b:slots[i+1]||null,events:[],winner:null});return matches;}
function matchCurrentWinner(m){return m.winner||null;}
async function advanceKnockoutMatch(k,roundIndex,matchIndex,teamId){
  const r=k.rounds[roundIndex],m=r.matches[matchIndex];if(!teamId||![m.a,m.b].includes(teamId))return;
  m.winner=teamId;
  if(r.matches.length===1){
    k.championTeamId=teamId;
    const a=appearances.find(x=>x.teamId===teamId&&x.yearId===k.yearId&&x.divisionId===k.divisionId);
    if(a){a.placement='champion';await put('appearances',a);}
    await saveKnockout(k);activeCellTabs.set(`${k.yearId}|${k.divisionId}`,'__knockout__');render();return showToast(`${teamById(teamId)?.name||'Equipe'} é a campeã!`);
  }
  const nextIndex=roundIndex+1;
  if(!k.rounds[nextIndex]){
    const count=Math.ceil(r.matches.length/2);
    k.rounds.push({name:roundName(count*2),matches:Array.from({length:count},()=>({a:null,b:null,events:[],winner:null}))});
  }
  const next=k.rounds[nextIndex].matches[Math.floor(matchIndex/2)];
  if(matchIndex%2===0)next.a=teamId;else next.b=teamId;
  await saveKnockout(k);activeCellTabs.set(`${k.yearId}|${k.divisionId}`,'__knockout__');render();
}
async function saveKnockout(k){await put('knockouts',k);const i=knockouts.findIndex(x=>x.id===k.id);if(i<0)knockouts.push(k);else knockouts[i]=k;}
async function deleteKnockout(k,year,division){
  if(!confirm(`Excluir o mata-mata "${k.name}" de ${year.year} — ${division.name}?`))return;
  await remove('knockouts',k.id);
  knockouts=knockouts.filter(x=>x.id!==k.id);
  const key=`${year.id}|${division.id}`;
  activeCellTabs.set(key, getGroups(year.id,division.id)[0]?.id||'default');
  await touchSystem(systemId);render();showToast('Mata-mata excluído.');
}

function renderKnockoutContent(c,k,year,division){
  c.innerHTML=`<div class="knockout-head"><strong>${esc(k.name)}</strong><div><button class="small-btn edit-ko">Editar</button><button class="small-btn delete-ko">× excluir</button></div></div>`;
  if(!k.rounds?.length){c.insertAdjacentHTML('beforeend','<div class="empty-cell"><div>Configure o tamanho e preencha os participantes.<span>Use “Editar”.</span></div></div>');c.querySelector('.edit-ko').onclick=()=>openKnockoutModal(year,division);return;}
  const nav=document.createElement('div');nav.className='cell-tabs';const box=document.createElement('div');box.className='knockout-bracket';c.append(nav,box);let active=0;
  k.rounds.forEach((r,i)=>{const b=document.createElement('button');b.className='cell-tab'+(i===0?' active':'');b.textContent=r.name;b.onclick=()=>{active=i;nav.querySelectorAll('.cell-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');draw(i)};nav.appendChild(b)});
  function aggregateScore(m){
    let a=0,b=0,pa=null,pb=null;
    (m.events||[]).forEach(ev=>{
      const ea=Number(ev.a),eb=Number(ev.b); if(!Number.isFinite(ea)||!Number.isFinite(eb))return;
      if(ev.type==='penalties'||ev.label==='Pênaltis'){pa=ea;pb=eb;return;}
      a+=ea;b+=eb;
    });
    const base=(m.events||[]).some(ev=>ev.a!==''&&ev.b!=='')?`${a} × ${b}`:'—';
    return pa!==null?`${base} (${pa} × ${pb})`:base;
  }
  function draw(index){
    box.innerHTML='';const r=k.rounds[index];
    r.matches.forEach((m,mi)=>{
      const a=teamById(m.a),b=teamById(m.b),card=document.createElement('div');card.className='match-card';
      if(!m.events?.length)m.events=[{label:'Jogo 1',type:'game',a:'',b:''}];
      const eventRows=(m.events||[]).map((ev,ei)=>`<div class="score-row event-score"><span>${esc(ev.label||'Jogo')}</span><input type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(ev.a??'')}" data-event="${ei}" data-side="a" aria-label="Gols ${esc(a?.name||'equipe A')}"><span>×</span><input type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(ev.b??'')}" data-event="${ei}" data-side="b" aria-label="Gols ${esc(b?.name||'equipe B')}"><button class="small-btn remove-score" data-event="${ei}" title="Remover este resultado">×</button></div>`).join('');
      card.innerHTML=`<button class="bracket-team ${m.winner===m.a?'winner':''} ${a?'':'empty'}" data-team="a">${teamLogoHtml(a)}<span>${esc(a?.name||'Vaga')}</span></button><div class="score-area"><div class="aggregate-score">${aggregateScore(m)}</div><div class="score-events">${eventRows}</div><div class="score-extra-actions"><button class="small-btn add-game">+ jogo</button><button class="small-btn add-penalties">+ pênaltis</button></div><div class="score-hint">Clique no time vencedor para avançar</div></div><button class="bracket-team ${m.winner===m.b?'winner':''} ${b?'':'empty'}" data-team="b">${teamLogoHtml(b)}<span>${esc(b?.name||'Vaga')}</span></button>`;
      card.querySelectorAll('[data-event]').forEach(inp=>inp.oninput=async()=>{const ev=m.events[Number(inp.dataset.event)];if(!ev)return;ev[inp.dataset.side]=inp.value.replace(/[^0-9]/g,'');card.querySelector('.aggregate-score').textContent=aggregateScore(m);await saveKnockout(k)});
      card.querySelectorAll('.add-game').forEach(btn=>btn.onclick=async()=>{m.events.push({label:`Jogo ${m.events.filter(e=>e.type!=='penalties').length+1}`,type:'game',a:'',b:''});await saveKnockout(k);draw(index)});
      card.querySelector('.add-penalties').onclick=async()=>{if(m.events.some(e=>e.type==='penalties'))return alert('Este confronto já possui pênaltis.');m.events.push({label:'Pênaltis',type:'penalties',a:'',b:''});await saveKnockout(k);draw(index)};
      card.querySelectorAll('.remove-score').forEach(btn=>btn.onclick=async()=>{const ei=Number(btn.dataset.event);if(ei===0)return;m.events.splice(ei,1);await saveKnockout(k);draw(index)});
      card.querySelectorAll('.bracket-team').forEach(btn=>btn.onclick=()=>advanceKnockoutMatch(k,index,mi,m[btn.dataset.team]));
      box.appendChild(card);
    });
  }

  draw(active);c.querySelector('.edit-ko').onclick=()=>openKnockoutModal(year,division);c.querySelector('.delete-ko').onclick=()=>deleteKnockout(k,year,division);
  if(k.championTeamId){const t=teamById(k.championTeamId);c.insertAdjacentHTML('beforeend',`<div class="knockout-champion">🏆 <strong>Campeão: ${esc(t?.name||'')}</strong> ${teamLogoHtml(t)}</div>`)}
}

$('exportSystemBtn').onclick=async()=>{const b=await exportSystemData(systemId),blob=new Blob([JSON.stringify(b,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=`${system.name.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-backup.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};

load().catch(e=>{console.error(e);alert('Erro ao carregar o sistema: '+e.message)});
