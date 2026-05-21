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
  const atActorLimit = actors.length >= 20;
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
    return s.replace(/\?\s*$/, '').trim();
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
      tempNodes.push({ type:'terminator', label:'INICIO', actor:'', siTarget:undefined, noTarget:undefined, target:undefined });
      addLog('ok',`L${li+1}: INICIO detectado.`); continue;
    }
    if (isFin(line)) {
      if (hasFin) {
        addLog('warn',`L${li+1}: FIN duplicado — solo se permite uno. <a href="#" onclick="(function(){const ta=document.getElementById('inputText');const lines=ta.value.split('\\n');lines.splice(${li},1);ta.value=lines.join('\\n');saveSession();document.getElementById('parse-log').innerHTML='';soloExtraer();})();return false;" style="color:#fbbf24;text-decoration:underline;">Eliminar duplicado</a>`);
        continue;
      }
      hasFin = true;
      tempNodes.push({ type:'terminator', label:'FIN', actor:'', siTarget:undefined, noTarget:undefined, target:undefined });
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

  if (!hasInicio) { tempNodes.unshift({ type:'terminator', label:'INICIO', actor:'', siTarget:undefined, noTarget:undefined, target:undefined }); warnings.push('INICIO no encontrado, agregado automáticamente.'); }
  if (!hasFin)    { tempNodes.push({ type:'terminator', label:'FIN', actor:'', siTarget:undefined, noTarget:undefined, target:undefined }); warnings.push('FIN no encontrado, agregado automáticamente.'); }

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

