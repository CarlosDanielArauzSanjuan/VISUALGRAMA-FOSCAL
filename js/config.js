const SNAP = 10;
const DIM_RH_MIN = 60;
const DIM_RH_MAX = 100;
const DIM_CW_MIN = 130;
const DIM_CW_MAX = 200;
const ROW_H_TERM = 40; // alto fijo inicio/fin y salto de página
const MAX_ROWS_PER_PAGE    = 14; // 12 nodos + inicio + fin
const MAX_FLOW_NODES_PER_PAGE = 12;
const MAX_FLOW_NODES = MAX_FLOW_NODES_PER_PAGE * 4;

let actors = [{ name: 'Responsable 1' }];
let nodes  = [];
