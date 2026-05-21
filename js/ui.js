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
  if (actors.length >= 20) { showToast('⚠ Límite: máximo 20 responsables.'); return; }
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
    if (mapaLetras[letra] === undefined) mapaLetras[letra] = letras[idx++] || letra;
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
  insertSnippet(`\n${n}. (${actor}), Nueva actividad`);
  renumerarPasos();
}

function insertSnippetDecision() {
  const n = getNextStepNum();
  const actor = getActorActivo();
  insertSnippet(`\n${n}. (${actor}), Decisión\nsi: ir a \nno: ir a `);
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
  const tab    = document.getElementById('flujo-toolbar-tab');
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

3. (Presidente CEI-FOSCAL), Es una renuncia, fin periodo, sustitucion, descalificación?
SI ir a 4
NO ir a [A]

4. (Presidente CEI-FOSCAL), Efectuar convocatoria para nuevos miembros

5. (Asistente administrativa y/o profesional administrativa del CEI), Recibir documentos de postulación

6. (Profesional administrativa del CEI), Evaluar documentos radicados

7. (Presidente CEI-FOSCAL), Presentar candidatos para consenso

8. (Presidente CEI-FOSCAL), Efectuar entrevistas para selección de candidatos

9. (Presidente CEI-FOSCAL), Tomar decisión en consenso

10. (Presidente CEI-FOSCAL), Efectuar carta de notificación de nombramiento

11. (Miembro Nuevo del CEI-FOSCAL), Entregar acuerdo de confidencialidad

12. (Presidente CEI-FOSCAL), Realizar inducción
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
  const lista   = document.getElementById('biblioteca-list');
  const overlay = document.getElementById('biblioteca-overlay');
  if (biblioteca.length === 0) {
    lista.innerHTML = '<p style="font-size:9.5pt;color:#000;font-family:Space Grotesk,sans-serif;">No hay guardados aún.</p>';
  } else {
    lista.innerHTML = biblioteca.map((item, i) => `
      <div style="border:3px solid #000;padding:10px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-weight:700;font-size:9.5pt;">${item.nombre}</div>
          <div style="font-size:8pt;color:#000;">${item.fecha}</div>
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
  const ta   = document.getElementById('inputText');
  const list = document.getElementById('autocomplete-list');
  if (!ta || !list) return;
  ta.addEventListener('input', () => { saveSession(); checkAutocomplete(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') list.style.display = 'none'; });
  document.addEventListener('click', e => { if (!list.contains(e.target) && e.target !== ta) list.style.display = 'none'; });
}

function checkAutocomplete() {
  const ta   = document.getElementById('inputText');
  const list = document.getElementById('autocomplete-list');
  const textoBefore = ta.value.substring(0, ta.selectionStart);
  const lineActual  = textoBefore.split('\n').pop();
  const mActor = lineActual.match(/\(\s*([^)]*)$/);
  const mIr    = lineActual.match(/ir\s+a\s+(\w*)$/i);
  let sugerencias = [];

  if (mActor && mActor[1].length > 0) {
    const query   = mActor[1].toLowerCase();
    const actores = [...new Set(ta.value.match(/\(\s*([^)]+?)\s*\)/g)?.map(m => m.replace(/[()]/g,'').trim()) || [])];
    sugerencias   = actores.filter(a => a.toLowerCase().includes(query));
  } else if (mIr) {
    const query = mIr[1];
    const pasos = [...new Set([...ta.value.matchAll(/^(\d+)\./gm)].map(m => m[1]))];
    sugerencias = pasos.filter(p => p.startsWith(query));
  }

  if (!sugerencias.length) { list.style.display = 'none'; return; }

  const rect = ta.getBoundingClientRect();
  list.style.left  = rect.left + 'px';
  list.style.top   = (rect.bottom - 2) + 'px';
  list.style.width = '220px';
  list.innerHTML = sugerencias.map(s =>
    `<div style="padding:7px 12px;cursor:pointer;border-bottom:2px solid #eee;" onmousedown="aplicarAutocomplete('${s}',${!!mActor})">${s}</div>`
  ).join('');
  list.style.display = 'block';
}

function aplicarAutocomplete(valor, esActor) {
  const ta = document.getElementById('inputText');
  const pos    = ta.selectionStart;
  const antes  = ta.value.substring(0, pos);
  const despues= ta.value.substring(pos);
  const nuevo  = esActor
    ? antes.replace(/\(\s*[^)]*$/, '(' + valor + ')')
    : antes.replace(/ir\s+a\s+\w*$/i, 'ir a ' + valor);
  ta.value = nuevo + despues;
  ta.selectionStart = ta.selectionEnd = nuevo.length;
  ta.focus();
  document.getElementById('autocomplete-list').style.display = 'none';
  saveSession();
}

// ── INIT ──────────────────────────────────────────────────────────
async function loadHtmlFragments() {
  const fragments = [
    ['modal-root', 'html/modals.html'],
    ['tab-import-root', 'html/tab-import.html'],
    ['tab-nodes-root', 'html/tab-nodes.html'],
    ['tab-output-root', 'html/tab-output.html'],
  ];

  await Promise.all(fragments.map(async ([targetId, url]) => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
    target.innerHTML = await response.text();
  }));
}

function initApp() {
  loadSession();
  setImportSplitExpanded(false);
  setFlujoToolbarOpen(false);
  setNodesToolbarOpen(false);
  renderResponsablesBadges();
  updateCapacityUI();
  initAutocomplete();
}

window.addEventListener('load', async () => {
  try {
    await loadHtmlFragments();
    initApp();
  } catch (error) {
    document.body.insertAdjacentHTML('afterbegin', `<div class="error-msg">No se pudo cargar la interfaz: ${error.message}</div>`);
  }
});
