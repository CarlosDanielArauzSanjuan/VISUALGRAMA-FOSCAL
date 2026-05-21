// ── GENERAR XML ───────────────────────────────────────────────────
function generateXML() {
  if (countFlowNodes()===0) { showAlert('Agrega al menos un nodo de flujo (Acción o Decisión).'); return; }
  if (actors.length===0)    { showAlert('Agrega al menos un responsable.'); return; }

  const processName = document.getElementById('processName').value.trim() || 'Proceso';

  // Advertencia responsables
  if (actors.length > 8) {
    showToast(`⚠ Advertencia: ${actors.length} responsables. Se recomiendan máximo 8 por página.`);
  }

  // Garantizar actor válido en todos los nodos
  for (let i=0; i<nodes.length; i++) {
    if (!actors.some(a=>a.name===nodes[i].actor)) nodes[i].actor = actors[0].name;
  }

  // Mapa stepNum → índice nodo
  const stepNumToNodeIdx = {}; let seqCounter = 0;
  nodes.forEach((n,i) => {
    if (n.type==='action' || n.type==='decision') {
      seqCounter++;
      if (n.stepNum != null) stepNumToNodeIdx[n.stepNum] = i;
      if (stepNumToNodeIdx[seqCounter] === undefined) stepNumToNodeIdx[seqCounter] = i;
    }
  });

  const flowNodeCount    = nodes.filter(({type}) => isFlowType(type)).length;
  const pageDistribution = calcPages(flowNodeCount);
  const pageCount        = pageDistribution.length;

  const resolveTarget = val => {
    if (val===undefined||val===null||val==='') return null;
    if (val==='FIN')    return 'term_bot_'+(pageCount-1);
    if (val==='INICIO') return 'term_top_0';
    if (typeof val==='object' && val.stepRef!==undefined) {
      const idx = stepNumToNodeIdx[val.stepRef];
      return idx !== undefined ? idx : null;
    }
    if (typeof val==='string') {
      const idx = nodes.findIndex(nx => nx.type==='conector' && nx.label===val);
      return idx !== -1 ? idx : null;
    }
    return null;
  };

  // Asignar páginas a actividades
  const nodePageMap = new Array(nodes.length).fill(0);
  let adIdx=0, pageAccum=0, currentPage=0;
  for (let i=0; i<nodes.length; i++) {
    const n = nodes[i];
    if (n.type==='action' || n.type==='decision') {
      if (currentPage < pageCount-1 && adIdx >= pageAccum + pageDistribution[currentPage]) {
        pageAccum += pageDistribution[currentPage];
        currentPage++;
      }
      nodePageMap[i] = currentPage;
      adIdx++;
    }
  }
  for (let i=0; i<nodes.length; i++) {
    if (nodes[i].type==='terminator') nodePageMap[i] = -1;
  }
  for (let i=0; i<nodes.length; i++) {
    if (nodes[i].type!=='conector') continue;
    let host = -1;
    for (let k=i-1; k>=0; k--) { if (nodes[k].type!=='conector' && nodePageMap[k]!==-1) { host=k; break; } }
    if (host===-1) for (let k=i+1; k<nodes.length; k++) { if (nodes[k].type!=='conector' && nodePageMap[k]!==-1) { host=k; break; } }
    nodePageMap[i] = host >= 0 ? nodePageMap[host] : 0;
  }

  const baseFont = 'fontFamily=Arial Narrow;fontSize=10;fontColor=#333333;';
  const baseEdge = `edgeStyle=orthogonalEdgeStyle;rounded=0;strokeColor=#000000;strokeWidth=1;sourcePerimeterSpacing=2;targetPerimeterSpacing=2;${baseFont}`;
  const nodeIds  = nodes.map((_,i) => `node_${i+1}`);

  let fullXml = `<mxfile host="app.diagrams.net" modified="" agent="" version="21.0.0" type="device">`;

  for (let pg=0; pg<pageCount; pg++) {
    const pageNodes    = nodes.map((n,i) => ({n,i})).filter(({i}) => nodePageMap[i]===pg);
    const pageFlowCount = pageNodes.filter(({n}) => isFlowType(n.type)).length;

    const pageActorNames = new Set(
      pageNodes.filter(({n}) => isFlowType(n.type)).map(({n}) => n.actor)
    );
    const pageActors     = actors.filter(a => pageActorNames.has(a.name));
    const pageActorCount = Math.max(pageActors.length, 1);
    const actorIndexLocal = {};
    pageActors.forEach((a,li) => { actorIndexLocal[a.name] = li; });

    const totalFilasPagina = Math.min(12, Math.max(1, pageFlowCount));
    const m = getMetrics(totalFilasPagina, pageActorCount);

    // Posiciones
    const positions = new Array(nodes.length).fill(null);
    let rowCounter = 0;
    const nonConnPageNodes = pageNodes.filter(({n}) => n.type!=='conector');
    for (let pi=0; pi<nonConnPageNodes.length; pi++) {
      const {n, i} = nonConnPageNodes[pi];
      const ai    = actorIndexLocal[n.actor] ?? 0;
      const Xcol  = snap(ai * m.CW);
      const Yrow  = snap(HEADER_H + ROW_H_TERM + rowCounter * m.RH);
      const fs    = figSize(n.type, m.RH, m.NW, pageActorCount, totalFilasPagina);
      const mxPx  = snap((m.CW - fs.w) / 2);
      const myPx  = snap((m.RH - fs.h) / 2);
      const Xnode = snap(Xcol + mxPx);
      const Ynode = snap(Yrow + myPx);
      positions[i] = { row:rowCounter, Xcol, Yrow, Xnode, Ynode, actorIdx:ai, fw:fs.w, fh:fs.h, isConnector:false };
      rowCounter++;
    }

    // Conectores: posición junto a su nodo host
    const slotConnCount = {};
    for (let i=0; i<nodes.length; i++) {
      if (nodes[i].type!=='conector') continue;
      if (nodePageMap[i]!==pg) continue;
      let hostIdx = -1;
      for (let k=i-1; k>=0; k--) { if (nodes[k].type!=='conector' && nodePageMap[k]===pg) { hostIdx=k; break; } }
      if (hostIdx===-1) for (let k=i+1; k<nodes.length; k++) { if (nodes[k].type!=='conector' && nodePageMap[k]===pg) { hostIdx=k; break; } }
      const hp = hostIdx>=0 && positions[hostIdx]
        ? positions[hostIdx]
        : { row:0, Xcol:0, Yrow:HEADER_H + ROW_H_TERM, actorIdx:0 };
      const sk  = `${hp.row}:${hp.actorIdx}`;
      const sib = slotConnCount[sk] || 0;
      slotConnCount[sk] = sib + 1;
      const cx = snap(hp.Xcol + m.CW - CONN_SIZE - sib * (CONN_SIZE + 4));
      const cy = snap(hp.Yrow);
      positions[i] = { row:hp.row, Xcol:hp.Xcol, Yrow:hp.Yrow, Xnode:cx, Ynode:cy, actorIdx:hp.actorIdx, fw:CONN_SIZE, fh:CONN_SIZE, isConnector:true };
    }

    // Par de entrada para conectores con target
    const pairMap = {}, slotPairCount = {};
    let pairIdCounter = 800 + pg*100;
    nodes.forEach((n,i) => {
      if (n.type!=='conector' || nodePageMap[i]!==pg) return;
      const tgtIdx = resolveTarget(n.target);
      if (tgtIdx===null || typeof tgtIdx==='string' || tgtIdx>=nodes.length) return;
      const tp = positions[tgtIdx]; if (!tp) return;
      const pk = `pair:${tp.row}:${tp.actorIdx}`;
      const ps = slotPairCount[pk] || 0;
      slotPairCount[pk] = ps + 1;
      const px = snap(tp.Xcol + m.CW - CONN_SIZE - ps * (CONN_SIZE + 4));
      const py = snap(tp.Yrow);
      pairMap[i] = { pairId:`conn_pair_${pairIdCounter++}`, absX:px, absY:py, label:n.label||'?' };
    });

    const poolW = snap(pageActorCount * m.CW);
    const poolH = snap(HEADER_H + ROW_H_TERM * 2 + pageFlowCount * m.RH);

    const pageName = pageCount > 1 ? `Página ${pg+1}` : 'Página 1';
    fullXml += `\n  <diagram name="${esc(pageName)}" id="page_${pg}">\n    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="850" math="0" shadow="0">\n      <root>\n        <mxCell id="0"/>\n        <mxCell id="1" parent="0"/>`;

    // Estilos terminadores
    const termStyle     = `rounded=1;arcSize=38;fillColor=none;strokeColor=#00B400;strokeWidth=2;${baseFont}fontSize=10;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;fontStyle=1;`;
    const offPageStyle  = `shape=offPageConnector;fillColor=none;strokeColor=#000000;strokeWidth=2;${baseFont}fontSize=10;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;fontStyle=1;`;
    const offPageFs     = { w: 30, h: 30 };
    const termFs        = figSize('terminator', m.RH, m.NW);

    const termRow0Y    = snap(HEADER_H);
    const termRowBotY  = snap(HEADER_H + ROW_H_TERM + pageFlowCount * m.RH);

    const labelTop = pg === 0             ? 'INICIO' : `${pg}`;
    const labelBot = pg === pageCount-1   ? 'FIN'    : `${pg+2}`;
    const styleTop = pg === 0             ? termStyle : offPageStyle;
    const styleBot = pg === pageCount-1   ? termStyle : offPageStyle;
    const fsTop    = pg === 0             ? termFs    : offPageFs;
    const fsBot    = pg === pageCount-1   ? termFs    : offPageFs;

    const mxTop = snap((m.CW - fsTop.w) / 2);
    const myTop = snap((ROW_H_TERM - fsTop.h) / 2);
    const mxBot = snap((m.CW - fsBot.w) / 2);
    const myBot = snap((ROW_H_TERM - fsBot.h) / 2);

    fullXml += `\n        <mxCell id="term_top_${pg}" value="${esc(labelTop)}" style="${styleTop}" vertex="1" parent="1">\n          <mxGeometry x="${mxTop}" y="${snap(termRow0Y+myTop)}" width="${fsTop.w}" height="${fsTop.h}" as="geometry"/>\n        </mxCell>`;
    fullXml += `\n        <mxCell id="term_bot_${pg}" value="${esc(labelBot)}" style="${styleBot}" vertex="1" parent="1">\n          <mxGeometry x="${mxBot}" y="${snap(termRowBotY+myBot)}" width="${fsBot.w}" height="${fsBot.h}" as="geometry"/>\n        </mxCell>`;

    const firstAct = pageNodes.find(({n,i}) => isFlowType(n.type) && positions[i]!==null);
    if (firstAct) fullXml += `\n        <mxCell id="edge_term_top_${pg}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="term_top_${pg}" target="${nodeIds[firstAct.i]}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    const lastAct  = [...pageNodes].reverse().find(({n,i}) => isFlowType(n.type) && positions[i]!==null);
    if (lastAct)  fullXml += `\n        <mxCell id="edge_term_bot_${pg}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${nodeIds[lastAct.i]}" target="term_bot_${pg}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;

    // Borde exterior
    fullXml += `\n        <mxCell id="border_${pg}" value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#000000;strokeWidth=1;pointerEvents=0;" vertex="1" parent="1">\n          <mxGeometry x="0" y="0" width="${poolW}" height="${poolH}" as="geometry"/>\n        </mxCell>`;

    // Headers actores
    pageActors.forEach((a,li) => {
      fullXml += `\n        <mxCell id="hdr_${pg}_${li}" value="${esc(a.name.toUpperCase())}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontStyle=1;fontSize=11;fontFamily=Arial Narrow;fontColor=#333333;" vertex="1" parent="1">\n          <mxGeometry x="${snap(li*m.CW)}" y="0" width="${m.CW}" height="${HEADER_H}" as="geometry"/>\n        </mxCell>`;
    });

    // Línea separadora header
    fullXml += `\n        <mxCell id="hline_${pg}" value="" style="shape=line;strokeColor=#000000;strokeWidth=1;fillColor=none;horizontal=1;" vertex="1" parent="1">\n          <mxGeometry x="0" y="${HEADER_H}" width="${poolW}" height="2" as="geometry"/>\n        </mxCell>`;

    // Líneas verticales entre carriles
    for (let li=1; li<pageActorCount; li++) {
      fullXml += `\n        <mxCell id="vline_${pg}_${li}" value="" style="rounded=0;whiteSpace=wrap;html=1;fillColor=none;strokeColor=#000000;strokeWidth=1;pointerEvents=0;" vertex="1" parent="1">\n          <mxGeometry x="${snap(li*m.CW)}" y="0" width="1" height="${poolH}" as="geometry"/>\n        </mxCell>`;
    }

    let edgeId      = 500 + pg*1000;
    let markerIdCtr = 900 + pg*1000;

    // Figuras
    pageNodes.forEach(({n,i}) => {
      const p = positions[i]; if (!p) return;
      const nid   = nodeIds[i];
      const fs2   = p.fw;
      const fh2   = p.fh;
      const drawX = snap(p.Xnode);
      const drawY = snap(p.Ynode);
      const textSz = (n.type!=='conector' && n.label.length > 80) ? 8 : 10;
      let style = '';

      if (n.type==='terminator') {
        style = `rounded=1;arcSize=38;fillColor=none;strokeColor=#00B400;strokeWidth=2;${baseFont}fontSize=${textSz};html=1;whiteSpace=wrap;align=center;verticalAlign=middle;fontStyle=1;`;
      } else if (n.type==='decision') {
        style = `shape=rhombus;perimeter=rhombusPerimeter;fillColor=none;strokeColor=#FF8000;strokeWidth=1;${baseFont}fontSize=${textSz};html=1;whiteSpace=wrap;align=center;verticalAlign=middle;fontStyle=1;`;
      } else if (n.type==='conector') {
        style = `shape=ellipse;fillColor=none;strokeColor=#000000;strokeWidth=1;${baseFont}fontSize=9;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;`;
      } else {
        style = `shape=rectangle;perimeter=rectanglePerimeter;rounded=0;fillColor=none;strokeColor=#0000FF;strokeWidth=1;${baseFont}fontSize=${textSz};html=1;whiteSpace=wrap;align=center;verticalAlign=middle;`;
      }

      fullXml += `\n    <mxCell id="${nid}" value="${esc(n.label)}" style="${style}" vertex="1" parent="1">\n      <mxGeometry x="${drawX}" y="${drawY}" width="${fs2}" height="${fh2}" as="geometry"/>\n    </mxCell>`;

      // Marcador de secuencia
      if (n.type!=='terminator' && n.type!=='conector') {
        const seq = nodes.slice(0,i+1).filter(x=>x.type==='action'||x.type==='decision').length;
        fullXml += `\n    <mxCell id="marker_${markerIdCtr++}" value="${seq}" style="text;html=1;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;fontSize=10;fontFamily=Arial Narrow;fontColor=#333333;fontStyle=1;" vertex="1" parent="1">\n      <mxGeometry x="${snap(drawX+fs2-16)}" y="${snap(drawY-20)}" width="16" height="16" as="geometry"/>\n    </mxCell>`;
      }

      // Par de entrada del conector
      if (n.type==='conector' && pairMap[i]) {
        const pr = pairMap[i];
        fullXml += `\n    <mxCell id="${pr.pairId}" value="${esc(pr.label)}" style="shape=ellipse;fillColor=none;strokeColor=#000000;strokeWidth=1;${baseFont}fontSize=9;html=1;whiteSpace=wrap;align=center;verticalAlign=middle;" vertex="1" parent="1">\n      <mxGeometry x="${pr.absX}" y="${pr.absY}" width="${CONN_SIZE}" height="${CONN_SIZE}" as="geometry"/>\n    </mxCell>`;
      }
    });

    // Aristas
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
    pageNodes.forEach(({n}) => {
      if (n.type==='decision') {
        const si = resolveTarget(n.siTarget), no = resolveTarget(n.noTarget);
        if (si!==null) decisionTargets.add(si);
        if (no!==null) decisionTargets.add(no);
      }
    });

    pageNodes.forEach(({n,i}) => {
      const src = nodeIds[i], p = positions[i]; if (!p) return;

      if (n.type==='decision') {
        // ── Rama SÍ: entra por la parte superior del destino ──────
        const siVal = resolveTarget(n.siTarget);
        const siId  = resolveId(siVal);
        if (siId !== null) {
          const eid = `edge_${edgeId++}`;
          const tp  = resolvePos(siVal);
          if (tp) {
            const sameLane = (tp.actorIdx === p.actorIdx);
            if (sameLane) {
              fullXml += `\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${siId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
            } else {
              fullXml += `\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${siId}" parent="1"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="${snap(p.Xnode+p.fw/2)}" y="${snap(tp.Yrow+tp.fh/2)}"/></Array></mxGeometry></mxCell>`;
            }
          } else {
            fullXml += `\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${siId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
          fullXml += `\n    <mxCell id="elbl_${edgeId++}" value="${esc(n.yes||'Sí')}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];${baseFont}fontStyle=1;" vertex="1" connectable="0" parent="${eid}"><mxGeometry x="-0.8" y="0" relative="1" as="geometry"><mxPoint as="offset" x="-10" y="-12"/></mxGeometry></mxCell>`;
        }

        // ── Rama NO: sale izquierda o derecha según distancia ─────
        const noVal = resolveTarget(n.noTarget);
        const noId  = resolveId(noVal);
        if (noId !== null) {
          const eid    = `edge_${edgeId++}`;
          const tp     = resolvePos(noVal);
          if (tp) {
            const goLeft = tp.actorIdx < p.actorIdx;
            const exitX  = goLeft ? '0' : '1';
            const entryX = goLeft ? '1' : '0';
            const sameRow = (tp.row === p.row);
            if (sameRow) {
              fullXml += `\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=${exitX};exitY=0.5;exitDx=0;exitDy=0;entryX=${entryX};entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${noId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
            } else {
              fullXml += `\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=${exitX};exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${noId}" parent="1"><mxGeometry relative="1" as="geometry"><Array as="points"><mxPoint x="${snap(tp.Xcol+tp.fw/2)}" y="${snap(p.Yrow+p.fh/2)}"/></Array></mxGeometry></mxCell>`;
            }
          } else {
            fullXml += `\n    <mxCell id="${eid}" value="" style="${baseEdge}exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${noId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
          fullXml += `\n    <mxCell id="elbl_${edgeId++}" value="${esc(n.no||'No')}" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];${baseFont}fontStyle=1;" vertex="1" connectable="0" parent="${eid}"><mxGeometry x="-0.8" y="0" relative="1" as="geometry"><mxPoint as="offset" x="10" y="-12"/></mxGeometry></mxCell>`;
        }

      } else if (n.type==='conector') {
        // ── Conector → par de entrada ─────────────────────────────
        const tgtVal = resolveTarget(n.target);
        const tgtId  = resolveId(tgtVal);
        if (tgtId !== null) {
          const pair       = pairMap[i];
          const finalTgtId = pair ? pair.pairId : tgtId;
          const tp = resolvePos(tgtVal);
          const cp = positions[i];
          let exitX='0.5', exitY='1', entryX='0.5', entryY='0';
          if (tp && cp) {
            const goRight = (tp.actorIdx > cp.actorIdx);
            const goUp    = (tp.row < cp.row);
            if (goRight && tp.row === cp.row) { exitX='1'; exitY='0.5'; entryX='0'; entryY='0.5'; }
            else if (goUp)                    { exitX='0.5'; exitY='0'; entryX='0.5'; entryY='1'; }
          }
          fullXml += `\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=${exitX};exitY=${exitY};exitDx=0;exitDy=0;entryX=${entryX};entryY=${entryY};entryDx=0;entryDy=0;" edge="1" source="${src}" target="${finalTgtId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          if (pair) {
            fullXml += `\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${pair.pairId}" target="${tgtId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
        }

      } else {
        // ── Nodos de flujo normales ────────────────────────────────
        if (n._jump !== undefined && n._jump !== null) {
          const jVal = resolveTarget(n._jump);
          const jId  = resolveId(jVal);
          if (jId !== null) {
            fullXml += `\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${jId}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
          }
          return;
        }
        const nextInPage = pageNodes.find(({n:nn,i:ni}) => ni>i && isFlowType(nn.type) && positions[ni]!==null);
        if (!nextInPage) return;
        const {i:nx} = nextInPage;
        const prevIsDec = i>0 && nodes[i-1] && nodes[i-1].type==='decision';
        if (prevIsDec && decisionTargets.has(nx)) return;
        const pn = positions[nx]; if (!pn) return;
        fullXml += `\n    <mxCell id="edge_${edgeId++}" value="" style="${baseEdge}exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;" edge="1" source="${src}" target="${nodeIds[nx]}" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>`;
      }
    });

    fullXml += `\n      </root>\n    </mxGraphModel>\n  </diagram>`;
  }

  fullXml += `\n</mxfile>`;

  document.getElementById('xml-output').textContent = fullXml;
  document.getElementById('xml-output').dataset.filename = processName;
  document.getElementById('output-metrics').innerHTML = `
    <div class="metrics">
      <div class="metric"><div class="val">${countFlowNodes()}</div><div class="lbl">Nodos de flujo</div></div>
      <div class="metric"><div class="val">${nodes.filter(n=>n.type==='conector').length}</div><div class="lbl">Conectores</div></div>
      <div class="metric"><div class="val">${actors.length}</div><div class="lbl">Responsables</div></div>
      <div class="metric"><div class="val">${calcPages(flowNodeCount).length}</div><div class="lbl">Páginas</div></div>
    </div>
    <div style="font-size:9.5pt;color:#444;margin-top:4px;">Archivo sugerido: <b>${esc(processName)}.xml</b></div>`;
  showTab('output');
}

// ── COPIAR / DESCARGAR XML ────────────────────────────────────────
function copyXML() {
  const pre = document.getElementById('xml-output'), txt = pre.textContent;
  if (txt==='— El XML aparecerá aquí —') { showAlert('Genera el XML primero.'); return; }
  const filename = (pre.dataset.filename||'Proceso').replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g,'').trim() || 'Proceso';
  if (window.showSaveFilePicker) {
    window.showSaveFilePicker({ suggestedName: filename+'.xml', types:[{ description:'Archivo XML', accept:{'text/xml':['.xml']} }] })
      .then(h => h.createWritable()).then(w => { w.write(txt); return w.close(); })
      .then(() => showCopyMsg(`✓ Guardado como "${filename}.xml"`))
      .catch(() => fallbackCopy(txt, filename));
  } else {
    fallbackCopy(txt, filename);
  }
}
function fallbackCopy(txt, filename) {
  navigator.clipboard.writeText(txt)
    .then(() => showCopyMsg(`✓ ¡Copiado! Guárdalo como "${filename}.xml"`))
    .catch(err => showAlert('Error al copiar: '+err));
}
function showCopyMsg(msg) {
  const el = document.getElementById('copy-msg');
  el.textContent = msg; el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}

