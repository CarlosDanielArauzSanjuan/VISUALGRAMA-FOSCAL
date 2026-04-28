const SNAP = 10;
const MAX_ACTORS = 8;          // tabla define hasta 8 responsables
const MAX_ROWS_PER_PAGE = 16;  // filas totales por página (fila 1 y 16 son terminadores fijos)
const MAX_FLOW_NODES_PER_PAGE = 14; // filas 2-15: actividades (action+decision)
// Sin límite de páginas: calcPages() las genera según necesite
const MAX_FLOW_NODES = MAX_FLOW_NODES_PER_PAGE * 4; // referencia orientativa (4 páginas base)

let actors = [{ name: 'Responsable 1' }];
let nodes  = [];

// ── SESSION ───────────────────────────────────────────────────────
function saveSession() {
  try {
    sessionStorage.setItem('flujograma_session', JSON.stringify({
      actors, nodes,
      processName: document.getElementById('processName').value,
      inputText:   document.getElementById('inputText').value,
    }));
  } catch(e) {}
}
function loadSession() {
  try {
    const raw = sessionStorage.getItem('flujograma_session');
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (d.actors && d.actors.length > 0) actors = d.actors;
    if (d.nodes)       nodes = d.nodes;
    if (d.processName) document.getElementById('processName').value = d.processName;
    if (d.inputText)   document.getElementById('inputText').value   = d.inputText;
    return nodes.length > 0 || actors.length > 1;
  } catch(e) { return false; }
}

// ── UTILIDADES ────────────────────────────────────────────────────
function snap(v) { return isNaN(v) ? 0 : Math.round(v / SNAP) * SNAP; }
function snapVal(el) { el.value = snap(parseInt(el.value) || 0); }
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/\n/g,'<br/>');
}
function showError(msg) { document.getElementById('error-container').innerHTML = `<div class="error-msg">${msg}</div>`; }
function clearError() {
  document.getElementById('error-container').innerHTML = '';
  document.getElementById('parse-summary-box').style.display = 'none';
}
function setImportSplitExpanded(expanded) {
  const split = document.querySelector('#tab-import .import-split');
  if (!split) return;
  split.classList.toggle('import-split--single', !expanded);
}
let nodesToolbarOpen = false;
function setNodesToolbarOpen(open) {
  const drawer = document.getElementById('nodes-toolbar-drawer');
  const tab = document.getElementById('nodes-toolbar-tab');
  const workspace = document.getElementById('nodes-workspace');
  if (!drawer || !tab || !workspace) return;
  nodesToolbarOpen = !!open;
  drawer.classList.toggle('open', nodesToolbarOpen);
  workspace.classList.toggle('toolbar-open', nodesToolbarOpen);
  tab.setAttribute('aria-expanded', nodesToolbarOpen ? 'true' : 'false');
  tab.textContent = nodesToolbarOpen ? 'Cerrar' : 'Herramientas';
  tab.title = nodesToolbarOpen ? 'Ocultar herramientas' : 'Mostrar herramientas';
}
function toggleNodesToolbar(forceOpen) {
  const nextOpen = typeof forceOpen === 'boolean' ? forceOpen : !nodesToolbarOpen;
  setNodesToolbarOpen(nextOpen);
}
function countFlowNodes() { return nodes.filter(n => n.type==='action' || n.type==='decision').length; }
function isFlowType(type) { return type==='action' || type==='decision'; }

function updateCapacityUI() {
  const flowCount = countFlowNodes();
  const atLimit = flowCount >= MAX_FLOW_NODES;
  ['btn-add-action','btn-add-decision'].forEach(id => {
    const b = document.getElementById(id); if (b) b.disabled = atLimit;
  });
  const w = document.getElementById('nodes-limit-warn');
  if (w) {
    w.style.display = atLimit ? 'block' : 'none';
    if (atLimit) w.innerHTML = `⚠ Límite: máximo ${MAX_FLOW_NODES} nodos de flujo (${flowCount}). Los conectores no cuentan.`;
  }
  const atActorLimit = actors.length >= MAX_ACTORS;
  const ba = document.getElementById('btn-add-actor');
  const wa = document.getElementById('actors-limit-warn');
  if (ba) ba.disabled = atActorLimit;
  if (wa) atActorLimit ? wa.classList.remove('hidden') : wa.classList.add('hidden');
}

// ── NAVEGACIÓN ────────────────────────────────────────────────────
function showTab(t) {
  ['import','nodes','output'].forEach(x => {
    document.getElementById('tab-'+ x).classList.toggle('hidden', x !== t);
    document.getElementById('btn-tab-'+ x).classList.toggle('active', x === t);
  });
  if (t === 'nodes')  { renderNodes(); updateCapacityUI(); setNodesToolbarOpen(nodesToolbarOpen); }
}

function continuarAActividades() {
  saveSession();
  showTab('nodes');
}

// ── MODAL ─────────────────────────────────────────────────────────
function showConfirm(msg, onOk) {
  const o = document.getElementById('modal-overlay');
  document.getElementById('modal-msg').textContent = msg;
  document.getElementById('modal-cancel').style.display = '';
  o.style.display = 'flex';
  const ok = document.getElementById('modal-ok'), cancel = document.getElementById('modal-cancel');
  const close = () => { o.style.display = 'none'; ok.onclick = null; cancel.onclick = null; };
  ok.onclick = () => { close(); onOk(); };
  cancel.onclick = () => close();
}
function showAlert(msg) {
  const o = document.getElementById('modal-overlay');
  document.getElementById('modal-msg').textContent = msg;
  document.getElementById('modal-cancel').style.display = 'none';
  o.style.display = 'flex';
  const ok = document.getElementById('modal-ok');
  ok.onclick = () => { o.style.display = 'none'; ok.onclick = null; };
}
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── PARSER ────────────────────────────────────────────────────────
function procesarTexto(autoAdvance = true) {
  const logEl = document.getElementById('parse-log');
  logEl.innerHTML = ''; logEl.style.display = 'none';
  clearError();
  setImportSplitExpanded(true);

  const raw = document.getElementById('inputText').value;
  if (!raw.trim()) { showError('Por favor, pega algo de texto para procesar.'); return; }

  const logs = [], addLog = (level, msg) => logs.push({ level, msg });
  const rawLines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const isInicio = l => /^inicio[:\s.]*$/i.test(l);
  const isFin    = l => /^fin[:\s.]*$/i.test(l);
  const isIrAFin = l => /\bir\s+a\s+fin\b/i.test(l);

  function matchStep(line) {
    const m = line.match(/^(\d{1,3})\s*[.):\-]?\s+(.+)$/);
    return m ? { num: parseInt(m[1]), rest: m[2].trim() } : null;
  }
  function extractActorDesc(rest) {
    let m = rest.match(/^\(\s*([^)]+?)\s*\)\s*[,;:\-]?\s*(.+)$/);
    if (m) return { actor: normActor(m[1]), desc: m[2].trim() };
    m = rest.match(/^([A-Za-záéíóúÁÉÍÓÚñÑ\s().\/]+?)\s*[,;:]\s*(.+)$/);
    if (m && m[1].trim().split(/\s+/).length <= 5) return { actor: normActor(m[1]), desc: m[2].trim() };
    return null;
  }
  function normActor(s) {
    return s.replace(/[()]/g,'').trim().toUpperCase();
  }
  const isDecision = desc => desc.includes('?');
  function cleanDecisionLabel(desc) {
    let s = desc.replace(/^\s*¿\s*/,'').trim();
    return s.endsWith('?') ? s : s + '?';
  }
  function extractGotoTarget(s) {
    const mc = s.match(/^\[([A-Za-z0-9])\]/);
    if (mc) return mc[1].toUpperCase();
    if (/^fin$/i.test(s.trim()))    return 'FIN';
    if (/^inicio$/i.test(s.trim())) return 'INICIO';
    const mn = s.match(/(\d{1,3})$/);
    if (mn) return { stepRef: parseInt(mn[1]) };
    return null;
  }
  function matchBranch(line) {
    const m = line.match(/^(s[ií]|no)\s*[:\-]?\s*(.+)$/i);
    if (!m) return null;
    const branch = m[1].toLowerCase().replace('í','i');
    const rest   = m[2].trim().replace(/^ir\s+a\s+/i,'').trim();
    const target = extractGotoTarget(rest);
    return target !== null ? { branch, target } : null;
  }
  function matchGoto(line) {
    const m = line.match(/^ir\s*a(?:l?\s+paso)?\s+(.+)$/i);
    return m ? extractGotoTarget(m[1].trim()) : null;
  }
  function matchConnector(line) {
    const m = line.match(/^\[\s*([A-Za-z0-9])\s*\][.:,]?\s*$/);
    return m ? m[1].toUpperCase() : null;
  }

  let tempNodes = [], tempActors = new Map();
  let hasInicio = false, hasFin = false, warnings = [];

  for (let li = 0; li < rawLines.length; li++) {
    const line = rawLines[li];

   if (hasFin && !isFin(line)) {
      addLog('warn',`L${li+1}: Línea ignorada — el texto no puede continuar después de FIN. <a href="#" onclick="(function(){const ta=document.getElementById('inputText');const lines=ta.value.split('\\n');lines.splice(${li},1);ta.value=lines.join('\\n');saveSession();document.getElementById('parse-log').innerHTML='';soloExtraer();})();return false;" style="color:#fbbf24;text-decoration:underline;">Eliminar línea</a>`);
      continue;
    }
    if (isInicio(line)) {
      if (hasInicio) {
        addLog('warn',`L${li+1}: INICIO duplicado — solo se permite uno. <a href="#" onclick="(function(){const ta=document.getElementById('inputText');const lines=ta.value.split('\\n');lines.splice(${li},1);ta.value=lines.join('\\n');saveSession();document.getElementById('parse-log').innerHTML='';soloExtraer();})();return false;" style="color:#fbbf24;text-decoration:underline;">Eliminar duplicado</a>`);
        continue;
      }
      hasInicio = true;
      tempNodes.push({ type:'terminator', label:'Inicio', actor:'', siTarget:undefined, noTarget:undefined, target:undefined });
      addLog('ok',`L${li+1}: INICIO detectado.`); continue;
    }
    if (isFin(line)) {
      if (hasFin) {
        addLog('warn',`L${li+1}: FIN duplicado — solo se permite uno. <a href="#" onclick="(function(){const ta=document.getElementById('inputText');const lines=ta.value.split('\\n');lines.splice(${li},1);ta.value=lines.join('\\n');saveSession();document.getElementById('parse-log').innerHTML='';soloExtraer();})();return false;" style="color:#fbbf24;text-decoration:underline;">Eliminar duplicado</a>`);
        continue;
      }
      hasFin = true;
      tempNodes.push({ type:'terminator', label:'Fin', actor:'', siTarget:undefined, noTarget:undefined, target:undefined });
      addLog('ok',`L${li+1}: FIN detectado.`); continue;
    }

    const connId = matchConnector(line);
    if (connId !== null) {
      tempNodes.push({ type:'conector', label:connId, actor:'', target:undefined, siTarget:undefined, noTarget:undefined });
      addLog('ok',`L${li+1}: Conector [${connId}] detectado.`); continue;
    }

    const branch = matchBranch(line);
    if (branch !== null) {
      let decIdx = -1;
      for (let k = tempNodes.length-1; k >= 0; k--) { if (tempNodes[k].type==='decision') { decIdx=k; break; } }
      if (decIdx === -1) {
        addLog('warn',`L${li+1}: Rama "${branch.branch}:" sin decisión previa, ignorada.`);
        warnings.push(`Línea ${li+1}: rama "${branch.branch}:" sin decisión asociada.`);
      } else {
        if (branch.branch==='si') tempNodes[decIdx].siTarget = branch.target;
        else                      tempNodes[decIdx].noTarget = branch.target;
        addLog('ok',`L${li+1}: Rama ${branch.branch.toUpperCase()} → ${JSON.stringify(branch.target)}.`);
      }
      continue;
    }

    const gotoTarget = matchGoto(line);
    if (gotoTarget !== null) {
      const lastIdx = tempNodes.length - 1;
      if (lastIdx >= 0 && tempNodes[lastIdx].type === 'conector') {
        tempNodes[lastIdx].target = gotoTarget;
        addLog('ok',`L${li+1}: "ir a" → ${JSON.stringify(gotoTarget)} → conector [${tempNodes[lastIdx].label}].`);
      } else if (lastIdx >= 0) {
        tempNodes[lastIdx]._jump = gotoTarget;
        addLog('ok',`L${li+1}: "ir a" → ${JSON.stringify(gotoTarget)} → nodo ${lastIdx}.`);
      } else { addLog('warn',`L${li+1}: "ir a" sin nodo previo, ignorado.`); }
      continue;
    }

    const step = matchStep(line);
    if (step !== null) {
      const ad = extractActorDesc(step.rest);
      if (!ad) {
        addLog('warn',`L${li+1}: Paso ${step.num} sin actor detectado.`);
        warnings.push(`Línea ${li+1}: Paso ${step.num} sin actor.`);
        const tipo = isDecision(step.rest) ? 'decision' : 'action';
        const lbl  = tipo==='decision' ? cleanDecisionLabel(step.rest) : step.rest;
        tempNodes.push({ type:tipo, label:lbl, actor:'__DEFAULT__', stepNum:step.num, siTarget:undefined, noTarget:undefined, target:undefined });
      } else {
        const { actor, desc } = ad;
        if (!tempActors.has(actor)) tempActors.set(actor, true);
        const tipo = isDecision(desc) ? 'decision' : 'action';
        const lbl  = tipo==='decision' ? cleanDecisionLabel(desc) : desc;
        tempNodes.push({ type:tipo, label:lbl, actor, stepNum:step.num, siTarget:undefined, noTarget:undefined, target:undefined });
        addLog('ok',`L${li+1}: Paso ${step.num} → ${tipo.toUpperCase()} | "${actor}" | "${lbl}"`);
      }
      continue;
    }

    addLog('warn',`L${li+1}: Línea no reconocida: "${line.substring(0,60)}"`);
    warnings.push(`Línea ${li+1}: no reconocida.`);
  }

  if (!hasInicio) { tempNodes.unshift({ type:'terminator', label:'Inicio', actor:'', siTarget:undefined, noTarget:undefined, target:undefined }); warnings.push('INICIO no encontrado, agregado automáticamente.'); }
  if (!hasFin)    { tempNodes.push({ type:'terminator', label:'Fin', actor:'', siTarget:undefined, noTarget:undefined, target:undefined }); warnings.push('FIN no encontrado, agregado automáticamente.'); }

  const flowNodes = tempNodes.filter(n => n.type==='action' || n.type==='decision');
  if (flowNodes.length === 0) { showError('No se detectaron pasos. Formato: <b>N. (Actor), Descripción</b>'); renderLog(logs); return; }

  const firstActor = tempActors.size > 0 ? Array.from(tempActors.keys())[0] : 'Responsable';
  tempNodes.forEach(n => {
    if (n.actor === '__DEFAULT__') { n.actor = firstActor; if (!tempActors.has(firstActor)) tempActors.set(firstActor,true); }
    if ((n.type==='terminator'||n.type==='conector') && !n.actor) n.actor = firstActor;
  });

  actors = tempActors.size > 0 ? Array.from(tempActors.keys()).map(a=>({name:a})) : [{name:'Responsable'}];
  nodes  = tempNodes;
  saveSession();
  renderLog(logs);
  renderSummary(flowNodes.length, tempNodes.filter(n=>n.type==='conector').length, actors.length, warnings, tempNodes.filter(n=>n.type==='decision').length);
if (!logs.some(l=>l.level==='err')) {
  const btnC = document.getElementById('btn-continuar-tab2');
  if (btnC) { btnC.disabled = false; btnC.style.opacity = '1'; }
  renderResponsablesBadges();
  if (autoAdvance) showTab('nodes');
}
}
function soloExtraer() {
  procesarTexto(false);
}

function renderLog(logs) {
  if (!logs || logs.length === 0) return;
  const el = document.getElementById('parse-log');
  el.style.display = 'block';
  el.innerHTML = logs.map(l=>`<span class="log-${l.level}">[${l.level.toUpperCase()}] ${l.msg}</span>`).join('<br>');
}
function renderSummary(flowNodes, connectors, actorsCount, warnings, decisions) {
  const box = document.getElementById('parse-summary-box');
  const warnHtml = warnings.length > 0
    ? `<div style="margin-top:8px;color:#aa6600;font-size:9pt;">⚠ ${warnings.length} advertencia(s):<br>${warnings.map(w=>`— ${w}`).join('<br>')}</div>`
    : `<div style="margin-top:6px;color:#007700;font-size:9pt;">✓ Sin advertencias.</div>`;
  box.innerHTML = `<div class="parse-summary"><b>Resultado del análisis</b>
    <div class="ps-row">
      <div class="ps-item"><span class="ps-dot" style="background:#0055cc"></span> ${flowNodes} nodos de flujo</div>
      <div class="ps-item"><span class="ps-dot" style="background:#ff8000"></span> ${decisions} decisión(es)</div>
      <div class="ps-item"><span class="ps-dot" style="background:#555"></span> ${connectors} conectores</div>
      <div class="ps-item"><span class="ps-dot" style="background:#007700"></span> ${actorsCount} responsable(s)</div>
    </div>${warnHtml}</div>`;
  box.style.display = 'block';
}

// ── MÉTRICAS (tabla estandarizada: Alto×Ancho celda, múltiplos de 10) ─────────
// Filas: #nodos de flujo por página (6-16+), Columnas: #responsables (2-8)
// Formato: [RH, CW]  — Alto fila × Ancho carril
const DIM_TABLE = {
  //     2          3          4          5          6        7        8         9          100,110  responsables
   6: [[100,400],[100,360],[100,270],[100,220],[100,180],[100,150],[100,130],[100,120]], // 
   7: [[100,400],[100,360],[100,270],[100,220],[110,180],[100,150],[100,130],[100,120]],
   8: [[100,400],[100,360],[100,270],[100,220],[100,180],[100,150],[100,130],[100,120]],
   9: [[ 90,400],[ 90,360],[ 90,270],[ 90,220],[ 90,180],[ 90,150],[ 90,130],[ 90,120]],
  10: [[ 80,400],[ 80,360],[ 80,270],[ 80,220],[ 80,180],[ 80,150],[ 80,130],[ 80,120]],
  11: [[ 70,400],[ 70,360],[ 70,270],[ 70,220],[ 70,180],[ 70,150],[ 70,130],[ 70,120]],
  12: [[ 60,400],[ 60,360],[ 60,270],[ 60,220],[ 60,180],[ 60,150],[ 60,130],[ 60,120]],
  13: [[ 60,400],[ 60,360],[ 60,270],[ 60,220],[ 60,180],[ 60,150],[ 60,130],[ 60,120]],
  14: [[ 50,400],[ 50,360],[ 50,270],[ 50,220],[ 50,180],[ 50,150],[ 50,130],[ 50,120]],
  15: [[ 50,400],[ 50,360],[ 50,270],[ 50,220],[ 50,180],[ 50,150],[ 50,130],[ 50,120]],
  16: [[ 50,400],[ 50,360],[ 50,270],[ 50,220],[ 50,180],[ 50,150],[ 50,130],[ 50,120]],
};
const HEADER_H  = 40;
const CONN_SIZE = 20;

// Tamaños mínimos por tipo de figura
const FIG_MIN = {
  action:     { w: 80, h: 40 },
  decision:   { w:100, h: 40 },
  terminator: { w: 60, h: 40 },
  conector:   { w: 20, h: 20 },
};

function lookupDim(flowNodesForPage, actorCount) {
  const row = Math.min(Math.max(flowNodesForPage, 6), 16);
  const col = Math.min(Math.max(actorCount, 2), 8) - 2; // índice 0-6
  return DIM_TABLE[row][col];
}

function calcPages(totalFlowNodes) {
  if (totalFlowNodes <= 0) return [0];
  if (totalFlowNodes <= MAX_FLOW_NODES_PER_PAGE) return [totalFlowNodes];

  const numPages = Math.ceil(totalFlowNodes / MAX_FLOW_NODES_PER_PAGE);

  if (numPages === 2) {
    const ultima    = Math.floor(totalFlowNodes / 2);
    const penultima = totalFlowNodes - ultima;
    return [penultima, ultima];
  }

  const fullPages = numPages - 2;
  const sobrante  = totalFlowNodes - fullPages * MAX_FLOW_NODES_PER_PAGE;
  const ultima    = Math.floor(sobrante / 2);
  const penultima = sobrante - ultima;

  const dist = [];
  for (let i = 0; i < fullPages; i++) dist.push(MAX_FLOW_NODES_PER_PAGE);
  dist.push(penultima);
  dist.push(ultima);
  return dist;
}

function figSize(type, RH, NW) {
  const CONN_S = CONN_SIZE;
  if (type === 'conector')   return { w: CONN_S, h: CONN_S };
  if (type === 'terminator') return { w: 60, h: 40 };
  const minH = (RH === 50) ? 30 : FIG_MIN[type].h;
  const minW = FIG_MIN[type].w;
  const MAX_FIG_W = 200;
  return { w: Math.min(Math.max(NW, minW), MAX_FIG_W), h: Math.max(minH, Math.min(minH, RH - 20)) };
}

function getMetrics(flowNodesForPage, actorCount) {
  const aCnt = Math.min(Math.max(actorCount, 2), 8);
  const aCntRaw = Math.max(actorCount, 1);
  const [RH, CW_base] = lookupDim(flowNodesForPage, aCnt);
  const CW = (actorCount === 1) ? CW_base * 2 : CW_base;
  const marginX = Math.min(20, Math.max(10, snap(Math.round((CW - FIG_MIN.action.w) / 2 / SNAP) * SNAP)));
  const marginY = Math.min(20, Math.max(10, snap(Math.round((RH - FIG_MIN.action.h) / 2 / SNAP) * SNAP)));
  const NW = snap(CW - marginX * 2);
  const NH = snap(RH - marginY * 2);
  const totalW = snap(aCntRaw * CW);
  return { RH, CW, NW, NH, headerH: HEADER_H, actorCount: aCntRaw, totalW };
}

function calcMetrics() {
  const el = document.getElementById('metrics-display');
  if (!el) return;
  const flowCount = nodes.filter(n => n.type==='action' || n.type==='decision').length;
  const pages = calcPages(flowCount);
  const pageSize = pages[0] || flowCount || 6;
  const m = getMetrics(pageSize, actors.length);
  el.innerHTML = `
    <div class="metric"><div class="val">${m.CW}</div><div class="lbl">Ancho Carril (px)</div></div>
    <div class="metric"><div class="val">${m.RH}</div><div class="lbl">Alto Fila (px)</div></div>
    <div class="metric"><div class="val">${m.NW}×${m.NH}</div><div class="lbl">Tamaño Nodo (px)</div></div>
    <div class="metric"><div class="val">${pages.length}</div><div class="lbl">Páginas</div></div>`;
}

// ── RESPONSABLES ──────────────────────────────────────────────────
function renderActors() {
  const el = document.getElementById('actors-list');
  if (!el) { updateCapacityUI(); return; }
  el.innerHTML = actors.map((a,i) => `
    <div class="actor-row">
      <input value="${a.name}" placeholder="Nombre actor ${i+1}"
        onchange="actors[${i}].name=this.value;updateNodesActors();saveSession();">
      ${actors.length>1?`<button class="btn btn-remove" onclick="removeActor(${i})" title="Eliminar responsable" aria-label="Eliminar responsable"></button>`:''}
    </div>`).join('');
  updateCapacityUI();
}
function addActor() {
  if (actors.length >= MAX_ACTORS) { showToast(`⚠ Límite: máximo ${MAX_ACTORS} responsables.`); return; }
  actors.push({ name:`Responsable ${actors.length+1}` }); renderActors(); saveSession();
}
function removeActor(i) {
  if (actors.length > 1) { actors.splice(i,1); renderActors(); saveSession(); }
  else showAlert('Debe haber al menos un responsable.');
}
function updateNodesActors() {
  nodes.forEach(n => { if (!actors.some(a=>a.name===n.actor)) n.actor = actors[0].name; });
}

// ── LIMPIAR ───────────────────────────────────────────────────────
function clearTexto() {
  showConfirm('¿Limpiar el texto ingresado?', () => {
    document.getElementById('inputText').value='';
    document.getElementById('parse-log').innerHTML='';
    document.getElementById('parse-log').style.display='none';
    setImportSplitExpanded(false);
    clearError(); saveSession();
  });
}
function clearActors() {
  showConfirm('¿Eliminar todos los responsables? Se dejará uno por defecto.', () => {
    actors=[{name:'Responsable 1'}]; updateNodesActors(); renderActors(); saveSession();
  });
}
function clearNodes() {
  showConfirm('¿Eliminar todos los nodos?', () => { nodes=[]; saveSession(); renderNodes(); updateCapacityUI(); });
}

// ── DRAG & DROP (legacy - reemplazado por kanban) ─────────────────
let dragSrcIdx = null;
function onDragStart(e,idx) {}
function onDragEnd(e) {}
function onDragOver(e,idx) { e.preventDefault(); }
function onDragLeave(e) {}
function onDrop(e,idx) {}

// ── RENDER NODOS ──────────────────────────────────────────────────
function targetToDisplay(val) {
  if (!val && val!==0) return '';
  if (val==='FIN'||val==='INICIO') return val;
  if (typeof val==='object'&&val.stepRef!==undefined) return String(val.stepRef);
  if (typeof val==='string') return val;
  return '';
}
function parseTargetInput(v) {
  v=v.trim(); if (!v) return undefined;
  if (/^fin$/i.test(v))    return 'FIN';
  if (/^inicio$/i.test(v)) return 'INICIO';
  if (/^\d+$/.test(v))     return { stepRef:parseInt(v) };
  return v.charAt(0).toUpperCase();
}

// ── KANBAN DRAG STATE ─────────────────────────────────────────────
let kanbanDragIdx = null;
let kanbanDragOverIdx = null;

function renderNodes() {
  const el = document.getElementById('nodes-list');
  const tabPanel = document.getElementById('tab-nodes');
  const prevScrollTop = tabPanel ? tabPanel.scrollTop : 0;
  const prevScrollLeft = tabPanel ? tabPanel.scrollLeft : 0;
  if (actors.length===0||nodes.length===0) {
    el.innerHTML='<div class="notice">No hay nodos. Usa los botones para agregar.</div>';
    updateCapacityUI(); return;
  }

  const connectorBadges = {};
  const stepToNodeIdx = {};
  let sc = 0;
  nodes.forEach((n,i) => { if (isFlowType(n.type)) { sc++; stepToNodeIdx[sc]=i; } });
  nodes.forEach((n,i) => {
    if (n.type!=='conector'||n.target===undefined||n.target===null) return;
    let tgt=-1;
    if (n.target&&typeof n.target==='object'&&n.target.stepRef!==undefined) tgt=stepToNodeIdx[n.target.stepRef]??-1;
    else if (typeof n.target==='string') tgt=nodes.findIndex(nx=>nx.type==='conector'&&nx.label===n.target);
    if (tgt>=0&&tgt<nodes.length&&tgt!==i&&nodes[tgt].type!=='terminator'&&nodes[tgt].type!=='conector') {
      if (!connectorBadges[tgt]) connectorBadges[tgt]=[];
      connectorBadges[tgt].push(n.label||'?');
    }
  });

  let actCounter = 0;
  const stepNums = nodes.map(n => isFlowType(n.type) ? ++actCounter : null);

  const colCount = actors.length;
  const actorCol = {};
  actors.forEach((a,i) => { actorCol[a.name] = i; });

  const rows = nodes.map((n,i) => {
    const col = actorCol[n.actor] ?? 0;
    return { nodeIdx: i, col };
  });

  let html = `<div class="kanban-wrap">
    <div class="kanban-grid" style="grid-template-columns: 40px repeat(${colCount}, 1fr);">`;

  html += `<div class="kanban-corner"></div>`;
  actors.forEach((a,ci) => {
    html += `<div class="kanban-col-header">${a.name}</div>`;
  });

  rows.forEach((row, rowIdx) => {
    const n = nodes[row.nodeIdx];
    const i = row.nodeIdx;
    const stepNum = stepNums[i];
    const badges = connectorBadges[i] || [];
    const typeLabel = { action:'Acción', decision:'Decisión', terminator:'Inicio/Fin', conector:'Conector' }[n.type] || n.type;
    const shortLabel = n.label ? (n.label.length>32 ? n.label.substring(0,30)+'…' : n.label) : '';

    html += `<div class="kanban-row-num">${stepNum !== null ? stepNum : '·'}</div>`;

    for (let ci=0; ci<colCount; ci++) {
      if (ci === row.col) {
        const isDragOver = kanbanDragOverIdx === i;
        const svgIcon = {
          action:     `<svg width="22" height="14" viewBox="0 0 22 14"><rect x="1" y="1" width="20" height="12" rx="0" stroke="#0000FF" stroke-width="2" fill="none"/></svg>`,
          decision:   `<svg width="22" height="16" viewBox="0 0 22 16"><polygon points="11,1 21,8 11,15 1,8" stroke="#f19a43" stroke-width="2" fill="none"/></svg>`,
          terminator: `<svg width="22" height="14" viewBox="0 0 22 14"><rect x="1" y="1" width="20" height="12" rx="6" stroke="#00B400" stroke-width="2" fill="none"/></svg>`,
          conector:   `<svg width="16" height="16" viewBox="0 0 16 16"><ellipse cx="8" cy="8" rx="7" ry="7" stroke="#555" stroke-width="2" fill="none"/></svg>`,
        }[n.type] || '';
        html += `<div class="kanban-cell kanban-cell--filled type-${n.type}${isDragOver?' drag-over':''}"
          draggable="true"
          ondragstart="kanbanDragStart(event,${i})"
          ondragend="kanbanDragEnd(event)"
          ondragover="kanbanDragOver(event,${i})"
          ondragleave="kanbanDragLeave(event)"
          ondrop="kanbanDrop(event,${i})"
          onclick="openNodeEditor(${i})">
          ${badges.length>0 ? `<div class="kanban-connector-badges">${badges.map(b=>`<span class="kanban-conn-dot" title="Conector ${b}">${b}</span>`).join('')}</div>` : ''}
          <div style="display:flex;align-items:center;gap:6px;margin-top:${badges.length>0?'10':'4'}px;">
            <div style="flex-shrink:0;">${svgIcon}</div>
            <div>
              <div class="kanban-cell-type">${typeLabel}</div>
              <div class="kanban-cell-label">${shortLabel}</div>
            </div>
          </div>
          <div class="kanban-cell-drag">⠿</div>
        </div>`;
      } else {
        html += `<div class="kanban-cell kanban-cell--empty"
          ondragover="kanbanDragOver(event,${i},${ci})"
          ondragleave="kanbanDragLeave(event)"
          ondrop="kanbanDropToCell(event,${i},${ci})"></div>`;
      }
    }
  });

  html += `</div></div>`;
  el.innerHTML = html;
  if (tabPanel) {
    requestAnimationFrame(() => {
      tabPanel.scrollTop = prevScrollTop;
      tabPanel.scrollLeft = prevScrollLeft;
    });
  }
  updateCapacityUI();
}

// ── KANBAN DRAG & DROP ────────────────────────────────────────────
function kanbanDragStart(e, idx) {
  kanbanDragIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(idx));
  const panel = document.getElementById('tab-nodes');
  if (panel) {
    panel.dataset.scrollTop = panel.scrollTop;
    panel.dataset.scrollLeft = panel.scrollLeft;
  }
  setTimeout(() => {
    document.querySelectorAll('[ondragstart]').forEach(c => {
      if (c.getAttribute('ondragstart') === `kanbanDragStart(event,${idx})`) c.style.opacity = '0.3';
    });
  }, 0);
}

function kanbanDragEnd(e) {
  const panel = document.getElementById('tab-nodes');
  if (panel && panel.dataset.scrollTop !== undefined) {
    panel.scrollTop = parseInt(panel.dataset.scrollTop) || 0;
    panel.scrollLeft = parseInt(panel.dataset.scrollLeft) || 0;
  }
  kanbanDragIdx = null;
  kanbanDragOverIdx = null;
  document.querySelectorAll('.kanban-cell').forEach(c => {
    c.classList.remove('drag-over','dragging');
    c.style.opacity = '';
  });
}

function kanbanDragOver(e, targetIdx, targetCol) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move';
  kanbanDragOverIdx = targetIdx;
  document.querySelectorAll('.kanban-cell').forEach(c => c.classList.remove('drag-over'));
  e.currentTarget.classList.add('drag-over');
}
function kanbanDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over');
}
function kanbanDrop(e, targetIdx) {
  e.preventDefault(); e.stopPropagation();
  if (kanbanDragIdx===null || kanbanDragIdx===targetIdx) { kanbanDragEnd(); return; }
  nodes.splice(targetIdx, 0, nodes.splice(kanbanDragIdx, 1)[0]);
  kanbanDragIdx = null; kanbanDragOverIdx = null;
  saveSession(); renderNodes(); updateCapacityUI();
}
function kanbanDropToCell(e, targetIdx, targetCol) {
  e.preventDefault(); e.stopPropagation();
  if (kanbanDragIdx===null) { kanbanDragEnd(); return; }
  const newActor = actors[targetCol];
  if (newActor) nodes[kanbanDragIdx].actor = newActor.name;
  if (kanbanDragIdx !== targetIdx) {
    nodes.splice(targetIdx, 0, nodes.splice(kanbanDragIdx, 1)[0]);
  }
  kanbanDragIdx = null; kanbanDragOverIdx = null;
  saveSession(); renderNodes(); updateCapacityUI();
}

// ── EDITOR DE NODO (OVERLAY) ──────────────────────────────────────
function openNodeEditor(i) {
  const n = nodes[i];
  let stepNum = 0;
  let sc = 0;
  for (let k=0; k<=i; k++) { if (isFlowType(nodes[k].type)) sc++; }
  stepNum = isFlowType(n.type) ? sc : null;

  const title = n.type==='terminator' ? 'Inicio / Fin'
              : n.type==='conector'   ? `Conector [${n.label||''}]`
              : `Paso ${stepNum}`;

  const actorOptions = actors.map(a =>
    `<option value="${a.name}" ${n.actor===a.name?'selected':''}>${a.name}</option>`
  ).join('');

  const conectorFields = n.type==='conector' ? `
    <div class="ned-field">
      <label class="ned-label">Nombre del Conector</label>
      <input id="ned-label" class="ned-input" type="text" value="${(n.label||'').replace(/"/g,'&quot;')}" placeholder="Ej: A">
    </div>
    <div class="ned-field">
      <label class="ned-label">Ir al paso # o Conector ID</label>
      <input id="ned-target" class="ned-input" type="text" value="${targetToDisplay(n.target)}" placeholder="Ej: 5 o B">
    </div>` : `
    <div class="ned-field">
      <label class="ned-label">Descripción</label>
      <input id="ned-label" class="ned-input" type="text" value="${(n.label||'').replace(/"/g,'&quot;')}">
    </div>
    <div class="ned-field">
      <label class="ned-label">Responsable</label>
      <select id="ned-actor" class="ned-input">${actorOptions}</select>
    </div>`;

  const decisionFields = n.type==='decision' ? `
    <div class="ned-decision-block">
      <div class="ned-field">
        <label class="ned-label">Destino SÍ (Paso # o Conector)</label>
        <input id="ned-si" class="ned-input" type="text" value="${targetToDisplay(n.siTarget)}" placeholder="Ej: 5 o A">
      </div>
      <div class="ned-field">
        <label class="ned-label">Destino NO (Paso # o Conector)</label>
        <input id="ned-no" class="ned-input" type="text" value="${targetToDisplay(n.noTarget)}" placeholder="Ej: 7 o A">
      </div>
    </div>` : '';

  const overlay = document.createElement('div');
  overlay.id = 'ned-overlay';
  overlay.innerHTML = `
    <div class="ned-modal" onclick="event.stopPropagation()">
      <div class="ned-header">
        <div class="ned-corner ned-corner--tl"></div>
        <div class="ned-corner ned-corner--tr"></div>
        <div class="ned-corner ned-corner--bl"></div>
        <div class="ned-corner ned-corner--br"></div>
        <div class="ned-scanlines"></div>
        <div class="ned-title-row">
          <span class="ned-badge ned-badge--${n.type}">${title}</span>
          <button class="ned-close" onclick="closeNodeEditor()">✕</button>
        </div>
      </div>
      <div class="ned-body">
        <div class="ned-field">
          <label class="ned-label">Tipo</label>
          <select id="ned-type" class="ned-input">
            <option value="action"     ${n.type==='action'    ?'selected':''}>Acción</option>
            <option value="decision"   ${n.type==='decision'  ?'selected':''}>Decisión</option>
            <option value="terminator" ${n.type==='terminator'?'selected':''}>Inicio/Fin</option>
            <option value="conector"   ${n.type==='conector'  ?'selected':''}>Conector</option>
          </select>
        </div>
        ${conectorFields}
        ${decisionFields}
        <div class="ned-actions">
          <button class="ned-btn ned-btn--danger" onclick="nedDelete(${i})">Eliminar</button>
          <button class="ned-btn ned-btn--primary" onclick="nedSave(${i})">Guardar</button>
        </div>
      </div>
    </div>`;
  overlay.onclick = () => closeNodeEditor();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('ned-visible'));
}

function closeNodeEditor() {
  const o = document.getElementById('ned-overlay');
  if (!o) return;
  o.classList.remove('ned-visible');
  setTimeout(() => o.remove(), 220);
}

function nedSave(i) {
  const newType = document.getElementById('ned-type').value;
  const labelEl = document.getElementById('ned-label');
  const actorEl = document.getElementById('ned-actor');
  const siEl    = document.getElementById('ned-si');
  const noEl    = document.getElementById('ned-no');
  const targetEl= document.getElementById('ned-target');

  const curIsFlow = isFlowType(nodes[i].type);
  const newIsFlow = isFlowType(newType);
  if (!curIsFlow && newIsFlow && countFlowNodes() >= MAX_FLOW_NODES) {
    showToast(`⚠ Límite: máximo ${MAX_FLOW_NODES} nodos de flujo.`);
    return;
  }

  if (newType === 'conector') {
    nodes[i].siTarget = undefined; nodes[i].noTarget = undefined;
    if (labelEl) nodes[i].label = labelEl.value.trim() || 'A';
    if (targetEl) nodes[i].target = parseTargetInput(targetEl.value);
    nodes[i].actor = actors[0]?.name || '';
  } else {
    if (nodes[i].type === 'conector') nodes[i].target = undefined;
    if (labelEl) nodes[i].label = labelEl.value.trim();
    if (actorEl) nodes[i].actor = actorEl.value;
    if (newType === 'decision') {
      if (siEl) nodes[i].siTarget = parseTargetInput(siEl.value);
      if (noEl) nodes[i].noTarget = parseTargetInput(noEl.value);
    } else {
      nodes[i].siTarget = undefined; nodes[i].noTarget = undefined;
    }
  }
  nodes[i].type = newType;
  saveSession(); closeNodeEditor();
  setTimeout(() => { renderNodes(); updateCapacityUI(); }, 230);
}

function nedDelete(i) {
  closeNodeEditor();
  setTimeout(() => {
    showConfirm('¿Eliminar este nodo?', () => {
      nodes.splice(i, 1); saveSession(); renderNodes(); updateCapacityUI();
    });
  }, 250);
}

function removeNode(i) { nodes.splice(i,1); saveSession(); renderNodes(); updateCapacityUI(); }
function getVisibleInsertIndex() {
  if (!nodes.length) return 0;
  const panel = document.getElementById('tab-nodes');
  const list = document.getElementById('nodes-list');
  const rowNums = Array.from(document.querySelectorAll('#nodes-list .kanban-row-num'));
  if (!panel || !list || rowNums.length === 0) return nodes.length;

  const panelRect = panel.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const topLimit = Math.max(0, panelRect.top, listRect.top);
  const bottomLimit = Math.min(window.innerHeight, panelRect.bottom, listRect.bottom);
  if (bottomLimit <= topLimit) return nodes.length;

  for (let i = 0; i < rowNums.length; i++) {
    const r = rowNums[i].getBoundingClientRect();
    if (r.bottom > topLimit && r.top < bottomLimit) return i;
  }
  return nodes.length;
}
function addNode(type) {
  if (actors.length===0) { showToast('⚠ Agrega al menos un responsable primero.'); return; }
  if (isFlowType(type)&&countFlowNodes()>=MAX_FLOW_NODES) { showToast(`⚠ Límite: máximo ${MAX_FLOW_NODES} nodos de flujo.`); updateCapacityUI(); return; }
  const insertIdx = getVisibleInsertIndex();
  nodes.splice(insertIdx, 0, {
    type, actor:actors[0].name,
    label: type==='terminator'?(nodes.filter(n=>n.type==='terminator').length===0?'Inicio':'Fin'):type==='conector'?'A':'Nueva actividad',
    yes:'Sí', no:'No', siTarget:undefined, noTarget:undefined, target:undefined
  });
  saveSession(); renderNodes(); updateCapacityUI();
}

// ── GENERAR XML ───────────────────────────────────────────────────
function generateXML() {
  if (countFlowNodes()===0)  { showAlert('Agrega al menos un nodo de flujo (Acción o Decisión).'); return; }
  if (actors.length===0) { showAlert('Agrega al menos un responsable.'); return; }

  const processName = document.getElementById('processName').value.trim() || 'Proceso';

  // Garantizar que todos los nodos tienen actor válido
  for (let i=0;i<nodes.length;i++) {
    if (!actors.some(a=>a.name===nodes[i].actor)) nodes[i].actor=actors[0].name;
  }

  // ── Mapa stepNum → índice nodo ────────────────────────────────────
  const stepNumToNodeIdx={}; let seqCounter=0;
  nodes.forEach((n,i)=>{
    if (n.type==='action'||n.type==='decision') {
      seqCounter++;
      if (n.stepNum!=null) stepNumToNodeIdx[n.stepNum]=i;
      if (stepNumToNodeIdx[seqCounter]===undefined) stepNumToNodeIdx[seqCounter]=i;
    }
  });

  // ── Separar nodos de flujo de conectores ──────────────────────────
  const flowNodeCount = nodes.filter(({type})=>isFlowType(type)).length;
  const pageDistribution = calcPages(flowNodeCount);
  const pageCount = pageDistribution.length;

  // ── resolveTarget ─────────────────────────────────────────────────
  const resolveTarget = val => {
    if (val===undefined||val===null||val==='') return null;
    if (val==='FIN')    return 'term_bot_'+(pageCount-1);
    if (val==='INICIO') return 'term_top_0';
    if (typeof val==='object'&&val.stepRef!==undefined) { const idx=stepNumToNodeIdx[val.stepRef]; return idx!==undefined?idx:null; }
    if (typeof val==='string') { const idx=nodes.findIndex(nx=>nx.type==='conector'&&nx.label===val); return idx!==-1?idx:null; }
    return null;
  };

  // ── Asignar páginas solo a actividades (action+decision) ──────────
  const nodePageMap = new Array(nodes.length).fill(0);
  let adIdx=0, pageAccum=0, currentPage=0;
  for (let i=0;i<nodes.length;i++) {
    const n=nodes[i];
    if (n.type==='action'||n.type==='decision') {
      if (currentPage<pageCount-1 && adIdx >= pageAccum+pageDistribution[currentPage]) {
        pageAccum+=pageDistribution[currentPage];
        currentPage++;
      }
      nodePageMap[i]=currentPage;
      adIdx++;
    }
  }
  for (let i=0;i<nodes.length;i++) {
    if (nodes[i].type==='terminator') nodePageMap[i]=-1;
  }
  for (let i=0;i<nodes.length;i++) {
    if (nodes[i].type!=='conector') continue;
    let host=-1;
    for (let k=i-1;k>=0;k--) { if(nodes[k].type!=='conector'&&nodePageMap[k]!==-1){host=k;break;} }
    if (host===-1) for (let k=i+1;k<nodes.length;k++) { if(nodes[k].type!=='conector'&&nodePageMap[k]!==-1){host=k;break;} }
    nodePageMap[i] = host>=0 ? nodePageMap[host] : 0;
  }

  // ── Generar XML por página ────────────────────────────────────────
  const baseFont = 'fontFamily=Arial Narrow;fontSize=10;fontColor=#333333;';
  const baseEdge = `edgeStyle=orthogonalEdgeStyle;rounded=0;strokeColor=#000000;strokeWidth=1;sourcePerimeterSpacing=2;targetPerimeterSpacing=2;${baseFont}`;
  const nodeIds  = nodes.map((_,i)=>`node_${i+1}`);

  let fullXml = `<mxfile host="app.diagrams.net" modified="" agent="" version="21.0.0" type="device">`;

  for (let pg=0; pg<pageCount; pg++) {
    const pageNodes = nodes.map((n,i)=>({n,i})).filter(({i})=>nodePageMap[i]===pg);
    const pageFlowCount = pageNodes.filter(({n})=>isFlowType(n.type)).length;

    // ── Actores activos en esta página (solo action+decision) ─────────
    const pageActorNames = new Set(
      pageNodes.filter(({n})=>isFlowType(n.type)).map(({n})=>n.actor)
    );
    const pageActors = actors.filter(a=>pageActorNames.has(a.name));
    const pageActorCount = Math.max(pageActors.length, 1);
    const actorIndexLocal = {};
    pageActors.forEach((a,li)=>{ actorIndexLocal[a.name]=li; });

    const totalFilasPagina = Math.min(16, Math.max(6, pageFlowCount + 2));
    const m = getMetrics(totalFilasPagina, pageActorCount);

    const positions = new Array(nodes.length).fill(null);
    let currentRow = 1;
    const nonConnPageNodes = pageNodes.filter(({n})=>n.type!=='conector');
    for (let pi=0; pi<nonConnPageNodes.length; pi++) {
      const {n, i} = nonConnPageNodes[pi];
      const ai = actorIndexLocal[n.actor] ?? 0;
      if (pi > 0) currentRow++;
      const Xcol  = snap(ai * m.CW);
      const Yrow  = snap(HEADER_H + currentRow * m.RH);
      const fs    = figSize(n.type, m.RH, m.NW);
      const mxPx  = Math.min(20, Math.max(10, snap(Math.round((m.CW - fs.w) / 2 / SNAP) * SNAP)));
      const myPx  = Math.min(20, Math.max(10, snap(Math.round((m.RH - fs.h) / 2 / SNAP) * SNAP)));
      const Xnode = snap(Xcol + mxPx);
      const Ynode = snap(Yrow + myPx);
      positions[i] = { row:currentRow, Xcol, Yrow, Xnode, Ynode, actorIdx:ai, fw:fs.w, fh:fs.h, isConnector:false };
    }

    const slotConnCount = {};
    for (let i=0;i<nodes.length;i++) {
      if (nodes[i].type!=='conector') continue;
      if (nodePageMap[i]!==pg) continue;
      let hostIdx=-1;
      for (let k=i-1;k>=0;k--) { if(nodes[k].type!=='conector'&&nodePageMap[k]===pg){hostIdx=k;break;} }
      if (hostIdx===-1) for (let k=i+1;k<nodes.length;k++) { if(nodes[k].type!=='conector'&&nodePageMap[k]===pg){hostIdx=k;break;} }
      const hp = hostIdx>=0&&positions[hostIdx]
        ? positions[hostIdx]
        : { row:0, Xcol:0, Yrow:HEADER_H, actorIdx:0 };
      const sk = `${hp.row}:${hp.actorIdx}`;
      const sib = slotConnCount[sk]||0;
      slotConnCount[sk] = sib+1;
      const cx = snap(hp.Xcol + m.CW - CONN_SIZE);
      const cy = snap(hp.Yrow);
      positions[i] = { row:hp.row, Xcol:hp.Xcol, Yrow:hp.Yrow, Xnode:cx, Ynode:cy, actorIdx:hp.actorIdx, fw:CONN_SIZE, fh:CONN_SIZE, isConnector:true };
    }

    const pairMap = {}, slotPairCount = {};
    let pairIdCounter = 800 + pg*100;
    nodes.forEach((n,i)=>{
      if (n.type!=='conector'||nodePageMap[i]!==pg) return;
      const tgtIdx=resolveTarget(n.target); if (tgtIdx===null||typeof tgtIdx==='string'||tgtIdx>=nodes.length) return;
      const tp=positions[tgtIdx]; if (!tp) return;
      const pk=`pair:${tp.row}:${tp.actorIdx}`;
      const ps=slotPairCount[pk]||0;
      slotPairCount[pk]=ps+1;
      const px = snap(tp.Xcol + m.CW - CONN_SIZE);
      const py = snap(tp.Yrow);
      pairMap[i] = { pairId:`conn_pair_${pairIdCounter++}`, absX:px, absY:py, label:n.label||'?' };
    });

    const poolW = snap(pageActorCount * m.CW);
    const poolH = snap(HEADER_H + totalFilasPagina * m.RH);
    const offsetY = 0;

    const pageName = pageCount > 1 ? `Página ${pg+1}` : 'Página 1';
    fullXml += `\n  <diagram name="${esc(pageName)}" id="page_${pg}">\n    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">\n      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>`;

    // Terminadores automáticos
    const termStyle    = `shape=mxgraph.flowchart.terminator;fillColor=none;strokeColor=#00B400;strokeWidth=2;${baseFont}fontSize=10;html=1;whiteSpace=wrap;align=center;`;
    const offPageStyle = `shape=offPageConnector;fillColor=none;strokeColor=#000000;strokeWidth=2;${baseFont}fontSize=10;html=1;whiteSpace=wrap;align=center;`;
    const offPageFs    = { w: 30, h: 30 };
    const termFs     = figSize('terminator', m.RH, m.NW);
    const termRow0Y  = snap(HEADER_H + 0 * m.RH);
    const termRowBotY= snap(HEADER_H + (pageFlowCount + 1) * m.RH);
    const labelTop = pg === 0 ? 'INICIO' : `${pg}`;
    const labelBot = pg === pageCount-1 ? 'FIN' : `${pg+2}`;
    const styleTop   = pg === 0            ? termStyle : offPageStyle;
    const styleBot   = pg === pageCount-1  ? termStyle : offPageStyle;

    const fsTop  = pg === 0           ? termFs : offPageFs;
    const fsBot  = pg === pageCount-1 ? termFs : offPageFs;
    const mxTop  = snap(Math.floor((m.CW - fsTop.w) / 2 / SNAP) * SNAP);
    const myTop  = snap(Math.floor((m.RH - fsTop.h) / 2 / SNAP) * SNAP);
    const mxBot  = snap(Math.floor((m.CW - fsBot.w) / 2 / SNAP) * SNAP);
    const myBot  = snap(Math.floor((m.RH - fsBot.h) / 2 / SNAP) * SNAP);

    fullXml += `\n        <mxCell id="term_top_${pg}" value="${esc(labelTop)}" style="${styleTop}" vertex="1" parent="1">\n          <mxGeometry x="${mxTop}" y="${snap(termRow0Y+myTop)}" width="${fsTop.w}" height="${fsTop.h}" as="geometry"/>\n        </mxCell>`;
    fullXml += `\n        <mxCell id="term_bot_${pg}" value="${esc(labelBot)}" style="${styleBot}" vertex="1" parent="1">\n          <mxGeometry x="${mxBot}" y="${snap(termRowBotY+myBot)}" width="${fsBot.w}" height="${fsBot.h}" as="geometry"/>\n        </mxCell>`;

    const firstAct = pageNodes.find(({n,i})=>isFlowType(n.type)&&positions[i]!==null);
    if (firstAct) fullXml += `\n        <mxCell id="edge_term_top_${pg}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="term_top_${pg}" target="${nodeIds[firstAct.i]}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    const lastAct = [...pageNodes].reverse().find(({n,i})=>isFlowType(n.type)&&positions[i]!==null);
    if (lastAct) fullXml += `\n        <mxCell id="edge_term_bot_${pg}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${nodeIds[lastAct.i]}" target="term_bot_${pg}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;

    // Borde exterior
    fullXml += `\n        <mxCell id="border_${pg}" value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#000000;strokeWidth=1;pointerEvents=0;" vertex="1" parent="1">\n          <mxGeometry x="0" y="0" width="${poolW}" height="${poolH}" as="geometry"/>\n        </mxCell>`;

    // Headers de actores (solo los de esta página)
    pageActors.forEach((a,li)=>{
      fullXml += `\n        <mxCell id="hdr_${pg}_${li}" value="${esc(a.name.toUpperCase())}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontStyle=1;fontSize=11;fontFamily=Arial Narrow;fontColor=#333333;" vertex="1" parent="1">\n          <mxGeometry x="${snap(li*m.CW)}" y="0" width="${m.CW}" height="${HEADER_H}" as="geometry"/>\n        </mxCell>`;
    });

    // Línea separadora header
    fullXml += `\n        <mxCell id="hline_${pg}" value="" style="shape=line;strokeColor=#000000;strokeWidth=1;fillColor=none;horizontal=1;" vertex="1" parent="1">\n          <mxGeometry x="0" y="${HEADER_H}" width="${poolW}" height="2" as="geometry"/>\n        </mxCell>`;

    // Líneas verticales entre carriles (solo actores de esta página)
    for (let li=1;li<pageActorCount;li++) {
      fullXml += `\n        <mxCell id="vline_${pg}_${li}" value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#000000;strokeWidth=1;pointerEvents=0;" vertex="1" parent="1">\n          <mxGeometry x="${snap(li*m.CW)}" y="0" width="1" height="${poolH}" as="geometry"/>\n        </mxCell>`;
    }

    let edgeId      = 500 + pg*1000;
    let markerIdCtr = 900 + pg*1000;

    pageNodes.forEach(({n,i})=>{
      const p=positions[i]; if(!p) return;
      const nid=nodeIds[i];
      const fs2=p.fw, fh2=p.fh;
      const drawX=snap(p.Xnode);
      const drawY=snap(p.Ynode + offsetY);
      const textSz=(n.type!=='conector'&&n.label.length>60)?8:10;
      let style='';

      if (n.type==='terminator') {
        style=`shape=mxgraph.flowchart.label;fillColor=none;strokeColor=#00B400;strokeWidth=2;${baseFont}fontSize=${textSz};html=1;whiteSpace=wrap;align=center;`;
      } else if (n.type==='decision') {
        style=`shape=rhombus;perimeter=rhombusPerimeter;fillColor=none;strokeColor=#f19a43;strokeWidth=2;${baseFont}fontSize=${textSz};html=1;whiteSpace=wrap;align=center;`;
      } else if (n.type==='conector') {
        style=`shape=ellipse;fillColor=none;strokeColor=#000000;strokeWidth=2;${baseFont}fontSize=9;html=1;whiteSpace=wrap;align=center;`;
      } else {
        style=`shape=rectangle;perimeter=rectanglePerimeter;rounded=0;fillColor=none;strokeColor=#0000FF;strokeWidth=2;${baseFont}fontSize=${textSz};html=1;whiteSpace=wrap;align=center;`;
      }

      fullXml += `\n    <mxCell id="${nid}" value="${esc(n.label)}" style="${style}" vertex="1" parent="1">\n      <mxGeometry x="${drawX}" y="${drawY}" width="${fs2}" height="${fh2}" as="geometry"/>\n    </mxCell>`;

      // Marcador de secuencia (número del paso)
      if (n.type!=='terminator'&&n.type!=='conector') {
        const seq=nodes.slice(0,i+1).filter(x=>x.type==='action'||x.type==='decision').length;
        fullXml += `\n    <mxCell id="marker_${markerIdCtr++}" value="${seq}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=10;fontFamily=Arial Narrow;fontColor=#333333;fontStyle=1;" vertex="1" parent="1">\n      <mxGeometry x="${snap(drawX+fs2-16)}" y="${snap(drawY-20)}" width="16" height="16" as="geometry"/>\n    </mxCell>`;
      }

      // Par de entrada del conector
      if (n.type==='conector'&&pairMap[i]) {
        const pr=pairMap[i];
        fullXml += `\n    <mxCell id="${pr.pairId}" value="${esc(pr.label)}" style="shape=ellipse;fillColor=none;strokeColor=#000000;strokeWidth=1;${baseFont}fontSize=9;html=1;whiteSpace=wrap;align=center;" vertex="1" parent="1">\n      <mxGeometry x="${pr.absX}" y="${snap(pr.absY+offsetY)}" width="${CONN_SIZE}" height="${CONN_SIZE}" as="geometry"/>\n    </mxCell>`;
      }
    });

    // ── Aristas (targets) ─────────────────────────────────────────
    const resolveId = val => {
      if (val === null) return null;
      if (typeof val === 'string') return val;
      if (val < nodes.length) return nodeIds[val];
      return null;
    };
    const resolvePos = val => {
      if (val === null || typeof val === 'string') return null;
      return positions[val] || null;
    };

    const decisionTargets = new Set();
    pageNodes.forEach(({n})=>{
      if (n.type==='decision') {
        const si=resolveTarget(n.siTarget), no=resolveTarget(n.noTarget);
        if (si!==null) decisionTargets.add(si);
        if (no!==null) decisionTargets.add(no);
      }
    });

    pageNodes.forEach(({n,i})=>{
      const src=nodeIds[i], p=positions[i]; if(!p) return;

      if (n.type==='decision') {
        // ── Rama SÍ: sale por el borde inferior ──────────────────
        const siVal=resolveTarget(n.siTarget);
        const siId=resolveId(siVal);
        if (siId!==null) {
          const eid=`edge_${edgeId++}`;
          const tp=resolvePos(siVal);
          if (tp) {
            const sameLane=(tp.actorIdx===p.actorIdx);
            if (sameLane) {
              fullXml+=`\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${siId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
            } else {
              fullXml+=`\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${siId}" parent="1"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="${snap(p.Xnode+p.fw/2)}" y="${snap(tp.Yrow+offsetY+tp.fh/2)}"/></Array></mxGeometry></mxCell>`;
            }
          } else {
            fullXml+=`\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${siId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
          // Etiqueta SÍ cerca del source (decisión)
          fullXml+=`\n    <mxCell id="elbl_${edgeId++}" value="${esc(n.yes||'Sí')}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];${baseFont}fontStyle=1;" vertex="1" connectable="0" parent="${eid}"><mxGeometry x="-0.8" y="0" relative="1" as="geometry"><mxPoint as="offset" x="-10" y="-12"/></mxGeometry></mxCell>`;
        }

        // ── Rama NO: sale por el borde derecho ───────────────────
        const noVal=resolveTarget(n.noTarget);
        const noId=resolveId(noVal);
        if (noId!==null) {
          const eid=`edge_${edgeId++}`;
          const tp=resolvePos(noVal);
          if (tp) {
            const sameRow=(tp.row===p.row);
            if (sameRow) {
              fullXml+=`\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${noId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
            } else {
              fullXml+=`\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${noId}" parent="1"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="${snap(tp.Xcol+tp.fw/2)}" y="${snap(p.Yrow+offsetY+p.fh/2)}"/></Array></mxGeometry></mxCell>`;
            }
          } else {
            fullXml+=`\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${noId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
          // Etiqueta NO cerca del source (decisión)
          fullXml+=`\n    <mxCell id="elbl_${edgeId++}" value="${esc(n.no||'No')}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];${baseFont}fontStyle=1;" vertex="1" connectable="0" parent="${eid}"><mxGeometry x="-0.8" y="0" relative="1" as="geometry"><mxPoint as="offset" x="10" y="-12"/></mxGeometry></mxCell>`;
        }

      } else if (n.type==='conector') {
        // ── Conector: arista hacia su par de entrada ──────────────
        const tgtVal=resolveTarget(n.target);
        const tgtId=resolveId(tgtVal);
        if (tgtId!==null) {
          const pair=pairMap[i];
          const finalTgtId=pair?pair.pairId:tgtId;
          const tp=resolvePos(tgtVal);
          const cp=positions[i];
          let exitX='0.5',exitY='1',entryX='0.5',entryY='0';
          if (tp&&cp) {
            const goRight=(tp.actorIdx>cp.actorIdx);
            const goDown=(tp.row>cp.row);
            const goUp=(tp.row<cp.row);
            if (goRight&&!goDown&&!goUp) { exitX='1';exitY='0.5';entryX='0';entryY='0.5'; }
            else if (goUp)              { exitX='0.5';exitY='0';entryX='0.5';entryY='1'; }
            else                        { exitX='0.5';exitY='1';entryX='0.5';entryY='0'; }
          }
          fullXml+=`\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;" edge="1" source="${src}" target="${finalTgtId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          if (pair) {
            fullXml+=`\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${pair.pairId}" target="${tgtId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
        }

      } else {
        // ── Nodos de flujo ─────────────────────────────────────────
        if (n._jump!==undefined&&n._jump!==null) {
          const jVal=resolveTarget(n._jump);
          const jId=resolveId(jVal);
          if (jId!==null) {
            fullXml+=`\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${jId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
          return;
        }
        const nextInPage = pageNodes.find(({n:nn,i:ni})=>ni>i&&isFlowType(nn.type)&&positions[ni]!==null);
        if (!nextInPage) return;
        const {i:nx} = nextInPage;
        const prevIsDec = i>0&&nodes[i-1]&&nodes[i-1].type==='decision';
        if (prevIsDec&&decisionTargets.has(nx)) return;
        const pn=positions[nx]; if(!pn) return;
        fullXml+=`\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${nodeIds[nx]}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
      }
    }); // fin pageNodes.forEach aristas

    fullXml += `\n      </root>\n    </mxGraphModel>\n  </diagram>`;
  } // fin bucle páginas

  fullXml += `\n</mxfile>`;

  document.getElementById('xml-output').textContent = fullXml;
  document.getElementById('xml-output').dataset.filename = processName;
  document.getElementById('output-metrics').innerHTML=`
    <div class="metrics">
      <div class="metric"><div class="val">${countFlowNodes()}</div><div class="lbl">Nodos de flujo</div></div>
      <div class="metric"><div class="val">${nodes.filter(n=>n.type==='conector').length}</div><div class="lbl">Conectores</div></div>
      <div class="metric"><div class="val">${actors.length}</div><div class="lbl">Responsables</div></div>
      <div class="metric"><div class="val">${calcPages(flowNodeCount).length}</div><div class="lbl">Páginas</div></div>
    </div>
    <div style="font-size:9.5pt;color:#444;margin-top:4px;">Archivo sugerido: <b>${esc(processName)}.xml</b></div>`;
  showTab('output');
}

// ── COPIAR XML ────────────────────────────────────────────────────
function copyXML() {
  const pre=document.getElementById('xml-output'), txt=pre.textContent;
  if (txt==='— El XML aparecerá aquí —') { showAlert('Genera el XML primero.'); return; }
  const filename=(pre.dataset.filename||'Proceso').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g,'').trim()||'Proceso';
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({suggestedName:filename+'.xml',types:[{description:'Archivo XML',accept:{'text/xml':['.xml']}}]})
      .then(h=>h.createWritable()).then(w=>{w.write(txt);return w.close();})
      .then(()=>showCopyMsg(`✓ Guardado como "${filename}.xml"`))
      .catch(()=>fallbackCopy(txt,filename));
  } else fallbackCopy(txt,filename);
}
function fallbackCopy(txt,filename) {
  navigator.clipboard.writeText(txt)
    .then(()=>showCopyMsg(`✓ ¡Copiado! Guárdalo como "${filename}.xml"`))
    .catch(err=>showAlert('Error al copiar: '+err));
}
function showCopyMsg(msg) {
  const el=document.getElementById('copy-msg'); el.textContent=msg; el.style.display='block';
  setTimeout(()=>{el.style.display='none';},3500);
}
// ── SNIPPET BADGES ────────────────────────────────────────────────
let responsableActivo = null;

function renderResponsablesBadges() {
  const el = document.getElementById('responsables-badges');
  if (!el) return;
  if (actors.length === 0) {
    el.innerHTML = '<span style="font-size:8pt;color:#555;font-family:Space Grotesk,sans-serif;">Sin responsables</span>';
    return;
  }
  el.innerHTML = actors.map((a, i) => `
    <span class="resp-badge ${responsableActivo === i ? 'active' : ''}"
      onclick="seleccionarResponsable(${i})"
      title="${a.name}">
      <span class="resp-badge-text">${a.name.length > 18 ? a.name.substring(0,16)+'…' : a.name}</span>
      ${a.name.length > 18 ? `<span class="resp-badge-full">${a.name}</span>` : ''}
      <span class="resp-remove" onclick="event.stopPropagation();removeResponsable(${i})">✕</span>
    </span>`).join('');
}

function seleccionarResponsable(i) {
  responsableActivo = (responsableActivo === i) ? null : i;
  renderResponsablesBadges();
}

function addResponsable() {
  if (actors.length >= MAX_ACTORS) { showToast(`⚠ Límite: máximo ${MAX_ACTORS} responsables.`); return; }
  const nombre = prompt('Nombre del responsable:');
  if (!nombre || !nombre.trim()) return;
  actors.push({ name: nombre.trim().toUpperCase() });
  responsableActivo = actors.length - 1;
  renderResponsablesBadges();
  saveSession();
}

function removeResponsable(i) {
  if (actors.length <= 1) { showAlert('Debe haber al menos un responsable.'); return; }
  actors.splice(i, 1);
  if (responsableActivo >= actors.length) responsableActivo = actors.length - 1;
  updateNodesActors();
  renderResponsablesBadges();
  saveSession();
}

function getActorActivo() {
  if (responsableActivo !== null && actors[responsableActivo]) return actors[responsableActivo].name;
  if (actors.length > 0) return actors[0].name;
  return 'ACTOR';
}

function getNextStepNum() {
  const ta = document.getElementById('inputText');
  const matches = ta.value.match(/^(\d+)\./gm);
  if (!matches || matches.length === 0) return 1;
  return Math.max(...matches.map(m => parseInt(m))) + 1;
}

function getNextConnectorLetter() {
  const ta = document.getElementById('inputText');
  const matches = ta.value.match(/\[([A-Z])\]\./g);
  if (!matches || matches.length === 0) return 'A';
  const letters = matches.map(m => m.replace(/[\[\].]/g, ''));
  const last = letters.sort().pop();
  const next = String.fromCharCode(last.charCodeAt(0) + 1);
  return next > 'Z' ? 'A' : next;
}

function renumerarPasos() {
  const ta = document.getElementById('inputText');
  let n = 1;
  ta.value = ta.value.replace(/^(\d+)\./gm, () => `${n++}.`);
  saveSession();
}

function renumerarConectores() {
  const ta = document.getElementById('inputText');
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  let idx = 0;
  const mapaLetras = {};
  ta.value = ta.value.replace(/\[([A-Z])\]/g, (match, letra) => {
    if (mapaLetras[letra] === undefined) {
      mapaLetras[letra] = letras[idx++] || letra;
    }
    return `[${mapaLetras[letra]}]`;
  });
  saveSession();
}

function insertSnippet(text) {
  const ta = document.getElementById('inputText');
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.focus();
  saveSession();
}

function insertSnippetAccion() {
  const n = getNextStepNum();
  const actor = getActorActivo();
  insertSnippet(`\n${n}. (${actor}), Descripción`);
  renumerarPasos();
}

function insertSnippetDecision() {
  const n = getNextStepNum();
  const actor = getActorActivo();
  insertSnippet(`\n${n}. (${actor}), ¿Decisión?\nsi: ir a \nno: ir a `);
  renumerarPasos();
}

function insertSnippetConector() {
  const letra = getNextConnectorLetter();
  insertSnippet(`\n[${letra}].\nir a `);
  renumerarConectores();
}
// ── FLUJO TOOLBAR (Tab 1) ─────────────────────────────────────────
let flujoToolbarOpen = false;
function setFlujoToolbarOpen(open) {
  const drawer = document.getElementById('flujo-toolbar-drawer');
  const tab = document.getElementById('flujo-toolbar-tab');
  if (!drawer || !tab) return;
  flujoToolbarOpen = !!open;
  drawer.classList.toggle('open', flujoToolbarOpen);
  tab.setAttribute('aria-expanded', flujoToolbarOpen ? 'true' : 'false');
  tab.textContent = flujoToolbarOpen ? 'Cerrar' : 'Flujo';
  tab.title = flujoToolbarOpen ? 'Ocultar herramientas' : 'Mostrar herramientas de flujo';
}
function toggleFlujoToolbar() {
  setFlujoToolbarOpen(!flujoToolbarOpen);
}
// ── EJEMPLO ───────────────────────────────────────────────────────
function cargarEjemplo() {
  const ejemplo = `INICIO
1. (Presidente CEI-FOSCAL), Evaluar necesidades de miembros

2. (Presidente CEI-FOSCAL), Requiere Aumentar Número de miembros?
SI ir a 4
NO ir a [A]

[A]. 
ir a fin

3. (Presidente CEI-FOSCAL), Es una renuncai, fin periodo, sustitucion, descalificación?
SI ir a 4
NO ir a [A]

4. (Presidente CEI-FOSCAL), Efectuar comvocatoria para nuevos miembros

5. (Asistente administrativa y/o profesional administrativa del CEI), Recibir documentos de postulación

6. (Profesional administrativa del CEI), Evaluar documentos radicados

7. (Presidente CEI-FOSCAL), Presentar candidatos para consenso

8. (Presidente CEI-FOSCAL), Efectuar entrevistas para selección de candidatos

9. (Presidente CEI-FOSCAL), Tomar decisión en consenso

10. (Presidente CEI-FOSCAL),Efectuar carta de notificación de nombramiento

11. (Miembro Nuevo del CEI-FOSCAL), Entregar acuerdo de confidencialidad

12. (Presidente CEI-FOSCAL), Realizar inducción

13. (Profesional administrativa del CEI), Entregar documentos para lectura cumplimiento de entrenamiento

14. (Profesional administrativa del CEI), Actualizar listado nuevos miembros del comité

15. (Secretaria administrativa), Archiva documentación, informa el ingreso/renuncia de miembros del CEI-Foscal
FIN`;
  showConfirm('¿Reemplazar el texto actual con el ejemplo?', () => {
    document.getElementById('inputText').value = ejemplo;
    saveSession();
  });
}

// ── GUARDAR / BIBLIOTECA ──────────────────────────────────────────
function guardarTexto() {
  const texto = document.getElementById('inputText').value.trim();
  if (!texto) { showAlert('No hay texto para guardar.'); return; }
  const nombre = prompt('Nombre para este guardado:');
  if (!nombre || !nombre.trim()) return;
  const biblioteca = JSON.parse(localStorage.getItem('flujograma_biblioteca') || '[]');
  biblioteca.push({ nombre: nombre.trim(), texto, fecha: new Date().toLocaleDateString() });
  localStorage.setItem('flujograma_biblioteca', JSON.stringify(biblioteca));
  showToast('✓ Guardado: ' + nombre.trim());
}

function abrirBiblioteca() {
  const biblioteca = JSON.parse(localStorage.getItem('flujograma_biblioteca') || '[]');
  const lista = document.getElementById('biblioteca-list');
  const overlay = document.getElementById('biblioteca-overlay');
  if (biblioteca.length === 0) {
    lista.innerHTML = '<p style="font-size:9.5pt;color:#666;font-family:Space Grotesk,sans-serif;">No hay guardados aún.</p>';
  } else {
    lista.innerHTML = biblioteca.map((item, i) => `
      <div style="border:3px solid #000;padding:10px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-weight:700;font-size:9.5pt;">${item.nombre}</div>
          <div style="font-size:8pt;color:#666;">${item.fecha}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn" style="margin:0;padding:5px 10px;font-size:8pt;" onclick="cargarDeBiblioteca(${i})">Cargar</button>
          <button class="btn" style="margin:0;padding:5px 10px;font-size:8pt;border-color:#ff3333;color:#ff3333;" onclick="eliminarDeBiblioteca(${i})">✕</button>
        </div>
      </div>`).join('');
  }
  overlay.style.display = 'flex';
}

function cerrarBiblioteca() {
  document.getElementById('biblioteca-overlay').style.display = 'none';
}

function cargarDeBiblioteca(i) {
  const biblioteca = JSON.parse(localStorage.getItem('flujograma_biblioteca') || '[]');
  if (!biblioteca[i]) return;
  showConfirm(`¿Cargar "${biblioteca[i].nombre}"? Se reemplazará el texto actual.`, () => {
    document.getElementById('inputText').value = biblioteca[i].texto;
    saveSession(); cerrarBiblioteca();
  });
}

function eliminarDeBiblioteca(i) {
  const biblioteca = JSON.parse(localStorage.getItem('flujograma_biblioteca') || '[]');
  biblioteca.splice(i, 1);
  localStorage.setItem('flujograma_biblioteca', JSON.stringify(biblioteca));
  abrirBiblioteca();
}

// ── AUTOCOMPLETADO ────────────────────────────────────────────────
function initAutocomplete() {
  const ta = document.getElementById('inputText');
  const list = document.getElementById('autocomplete-list');
  if (!ta || !list) return;
  ta.addEventListener('input', () => { saveSession(); checkAutocomplete(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') list.style.display = 'none'; });
  document.addEventListener('click', e => { if (!list.contains(e.target) && e.target !== ta) list.style.display = 'none'; });
}

function checkAutocomplete() {
  const ta = document.getElementById('inputText');
  const list = document.getElementById('autocomplete-list');
  const textoBefore = ta.value.substring(0, ta.selectionStart);
  const lineActual = textoBefore.split('\n').pop();
  const mActor = lineActual.match(/\(\s*([^)]*)$/);
  const mIr = lineActual.match(/ir\s+a\s+(\w*)$/i);
  let sugerencias = [];

  if (mActor && mActor[1].length > 0) {
    const query = mActor[1].toLowerCase();
    const actores = [...new Set(ta.value.match(/\(\s*([^)]+?)\s*\)/g)?.map(m => m.replace(/[()]/g,'').trim()) || [])];
    sugerencias = actores.filter(a => a.toLowerCase().includes(query));
  } else if (mIr) {
    const query = mIr[1];
    const pasos = [...new Set([...ta.value.matchAll(/^(\d+)\./gm)].map(m => m[1]))];
    sugerencias = pasos.filter(p => p.startsWith(query));
  }

  if (!sugerencias.length) { list.style.display = 'none'; return; }

  const rect = ta.getBoundingClientRect();
  list.style.left = rect.left + 'px';
  list.style.top = (rect.bottom - 2) + 'px';
  list.style.width = '220px';
  list.innerHTML = sugerencias.map(s =>
    `<div style="padding:7px 12px;cursor:pointer;border-bottom:2px solid #eee;" onmousedown="aplicarAutocomplete('${s}',${!!mActor})">${s}</div>`
  ).join('');
  list.style.display = 'block';
}

function aplicarAutocomplete(valor, esActor) {
  const ta = document.getElementById('inputText');
  const pos = ta.selectionStart;
  const antes = ta.value.substring(0, pos);
  const despues = ta.value.substring(pos);
  const nuevo = esActor
    ? antes.replace(/\(\s*[^)]*$/, '(' + valor + ')')
    : antes.replace(/ir\s+a\s+\w*$/i, 'ir a ' + valor);
  ta.value = nuevo + despues;
  ta.selectionStart = ta.selectionEnd = nuevo.length;
  ta.focus();
  document.getElementById('autocomplete-list').style.display = 'none';
  saveSession();
}
// ── INIT ──────────────────────────────────────────────────────────
window.addEventListener('load',()=>{
  const restored = loadSession();
  setImportSplitExpanded(false);
  setFlujoToolbarOpen(false);
  setNodesToolbarOpen(false);
  renderResponsablesBadges();
  updateCapacityUI();
  initAutocomplete();
});