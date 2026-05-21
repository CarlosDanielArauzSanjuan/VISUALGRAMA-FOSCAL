// ── MÉTRICAS ──────────────────────────────────────────────────────
// [RH, CW] — Alto fila × Ancho carril — máx RH=100, máx CW=200
const DIM_TABLE = {
  //     2          3          4          5          6          7          8     actores
   1: [[100,200],[100,200],[100,200],[100,200],[100,180],[100,150],[100,130]],
   2: [[100,200],[100,200],[100,200],[100,200],[100,180],[100,150],[100,130]],
   3: [[100,200],[100,200],[100,200],[100,200],[100,180],[100,150],[100,130]],
   4: [[100,200],[100,200],[100,200],[100,200],[100,180],[100,150],[100,130]],
   5: [[100,200],[100,200],[100,200],[100,200],[100,180],[100,150],[100,130]],
   6: [[100,200],[100,200],[100,200],[100,200],[100,180],[100,150],[100,130]], // 
   7: [[100,200],[100,200],[100,200],[100,200],[110,180],[100,150],[100,130]],
   8: [[100,200],[100,200],[100,200],[100,200],[100,180],[100,150],[100,130]],
   9: [[ 90,200],[ 90,200],[ 90,200],[ 90,200],[ 90,180],[ 90,150],[ 90,130]],
  10: [[ 80,200],[ 80,200],[ 80,200],[ 80,200],[ 80,180],[ 80,150],[ 80,130]],
  11: [[ 70,200],[ 70,200],[ 70,200],[ 70,200],[ 70,180],[ 70,150],[ 70,130]],
  12: [[ 60,200],[ 60,200],[ 60,200],[ 60,200],[ 60,180],[ 60,150],[ 60,130]],
};

const HEADER_H  = 50;
const CONN_SIZE = 30;
const MARGIN_X  = 5;
const MARGIN_Y  = 10;

const FIG_MIN = {
  action:     { w: 110, h: 40 },
  decision:   { w: 110, h: 50 },
};

const FIG_MAX = {
  action:     { w: 140, h: 60 },
  decision:   { w: 140, h: 60 },
};

function lookupDim(flowNodesForPage, actorCount) {
  const row = Math.min(Math.max(flowNodesForPage, 1), 12);
  const col = Math.min(Math.max(actorCount, 2), 8) - 2;
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

function figSize(type, RH, NW, actorCount = 1, flowNodesForPage = 1) {
  if (type === 'conector')   return { w: CONN_SIZE, h: CONN_SIZE };
  if (type === 'terminator') return { w: 70, h: 20 };

  const min = FIG_MIN[type];
  const max = FIG_MAX[type];
  if (!min || !max) return { w: snap(NW), h: snap(RH) };

  if (actorCount > 6 || flowNodesForPage > 10) return { ...min };

  const w = Math.min(Math.max(snap(NW), min.w), max.w);
  const h = Math.min(Math.max(snap(RH - MARGIN_Y * 2), min.h), max.h);
  return { w, h };
}

function getMetrics(flowNodesForPage, actorCount) {
  const aCnt    = Math.min(Math.max(actorCount, 2), 8);
  const aCntRaw = Math.max(actorCount, 1);
  const [RH, CW_base] = lookupDim(flowNodesForPage, aCnt);
  const CW   = (actorCount === 1) ? CW_base * 2 : CW_base;
  const NW   = snap(CW - MARGIN_X * 2);
  const NH   = snap(RH - MARGIN_Y * 2);
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
  if (actors.length >= 20) { showToast('⚠ Límite: máximo 20 responsables.'); return; }
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

// ── DRAG & DROP (legacy) ──────────────────────────────────────────
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
          decision:   `<svg width="22" height="16" viewBox="0 0 22 16"><polygon points="11,1 21,8 11,15 1,8" stroke="#ff7d04" stroke-width="2" fill="none"/></svg>`,
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
  let sc = 0;
  for (let k=0; k<=i; k++) { if (isFlowType(nodes[k].type)) sc++; }
  const stepNum = isFlowType(n.type) ? sc : null;

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
  const newType  = document.getElementById('ned-type').value;
  const labelEl  = document.getElementById('ned-label');
  const actorEl  = document.getElementById('ned-actor');
  const siEl     = document.getElementById('ned-si');
  const noEl     = document.getElementById('ned-no');
  const targetEl = document.getElementById('ned-target');

  const curIsFlow = isFlowType(nodes[i].type);
  const newIsFlow = isFlowType(newType);
  if (!curIsFlow && newIsFlow && countFlowNodes() >= MAX_FLOW_NODES) {
    showToast(`⚠ Límite: máximo ${MAX_FLOW_NODES} nodos de flujo.`);
    return;
  }

  if (newType === 'conector') {
    nodes[i].siTarget = undefined; nodes[i].noTarget = undefined;
    if (labelEl)  nodes[i].label  = labelEl.value.trim() || 'A';
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
  const list  = document.getElementById('nodes-list');
  const rowNums = Array.from(document.querySelectorAll('#nodes-list .kanban-row-num'));
  if (!panel || !list || rowNums.length === 0) return nodes.length;

  const panelRect  = panel.getBoundingClientRect();
  const listRect   = list.getBoundingClientRect();
  const topLimit   = Math.max(0, panelRect.top, listRect.top);
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
  if (isFlowType(type) && countFlowNodes() >= MAX_FLOW_NODES) { showToast(`⚠ Límite: máximo ${MAX_FLOW_NODES} nodos de flujo.`); updateCapacityUI(); return; }
  const insertIdx = getVisibleInsertIndex();
  nodes.splice(insertIdx, 0, {
    type, actor: actors[0].name,
    label: type==='terminator' ? (nodes.filter(n=>n.type==='terminator').length===0 ? 'INICIO' : 'FIN')
         : type==='conector'   ? 'A'
         : 'Nueva actividad',
    yes:'Sí', no:'No', siTarget:undefined, noTarget:undefined, target:undefined
  });
  saveSession(); renderNodes(); updateCapacityUI();
}

