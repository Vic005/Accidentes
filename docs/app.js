function loadRegion(regionSlug){
  const path = `data/region=${regionSlug}/part-*.parquet`;
  return conn.query(`CREATE OR REPLACE VIEW acc AS SELECT * FROM read_parquet('${path}');`);
}
// y al llamarla:
loadRegion(regionSel.value).then(runQuery).catch(console.error);


// --- Configuración de regiones (slug -> etiqueta). Puedes editar/ordenar a gusto.
const REGIONES = [
  ["region-metropolitana-de-santiago", "Región Metropolitana de Santiago"],
  ["valparaiso", "Valparaíso"],
  ["libertador-general-bernardo-o-higgins", "Libertador General Bernardo O’Higgins"],
  ["maule", "Maule"],
  ["nuble", "Ñuble"],
  ["biobio", "Biobío"],
  ["la-araucania", "La Araucanía"],
  ["los-rios", "Los Ríos"],
  ["los-lagos", "Los Lagos"],
  ["aysen-del-general-carlos-ibanez-del-campo", "Aysén del General Carlos Ibáñez del Campo"],
  ["magallanes-y-de-la-antartica-chilena", "Magallanes y de la Antártica Chilena"],
  ["arica-y-parinacota", "Arica y Parinacota"],
  ["tarapaca", "Tarapacá"],
  ["antofagasta", "Antofagasta"],
  ["atacama", "Atacama"],
  ["coquimbo", "Coquimbo"],
];

// --- Select de región
const regionSel = document.getElementById('region');
regionSel.innerHTML = REGIONES.map(([val,label]) => `<option value="${val}">${label}</option>`).join('');

const comunaInp = document.getElementById('comuna');
const calleAInp = document.getElementById('calleA');
const calleBInp = document.getElementById('calleB');
const pageInp   = document.getElementById('page');
const statusEl  = document.getElementById('status');
const tbody     = document.getElementById('tbl').querySelector('tbody');

let page = 1;
const LIMIT = 100;

// --- DuckDB-Wasm (desde CDN)
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/+esm";
const bundles = duckdb.getJsDelivrBundles();     // catálogos de URLs del CDN
const bundle  = duckdb.selectBundle(bundles);    // elige mvp/eh según soporte

// Arranque estándar
const worker = new Worker(bundle.worker, { type: 'module' });
const logger = new duckdb.ConsoleLogger();
const db     = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

const conn = await db.connect();
await conn.query("INSTALL httpfs; LOAD httpfs; SET threads=4;");

// --- construcción de filtros parametrizados
function buildFilters(){
  const filtros = [];
  const params = [];

  const comuna = comunaInp.value.trim();
  if (comuna){
    filtros.push(`LOWER("Comuna") LIKE LOWER(?)`);
    params.push(`%${comuna}%`);
  }

  const a = calleAInp.value.trim();
  const b = calleBInp.value.trim();
  if (a && b){
    filtros.push(`(
      (LOWER("Calleuno") LIKE LOWER(?) AND LOWER("Calledos") LIKE LOWER(?))
      OR
      (LOWER("Calleuno") LIKE LOWER(?) AND LOWER("Calledos") LIKE LOWER(?))
    )`);
    params.push(`%${a}%`, `%${b}%`, `%${b}%`, `%${a}%`);
  } else if (a || b){
    const s = a || b;
    filtros.push(`(LOWER("Calleuno") LIKE LOWER(?) OR LOWER("Calledos") LIKE LOWER(?))`);
    params.push(`%${s}%`, `%${s}%`);
  }

  const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";
  return { where, params };
}

// --- query y render
async function runQuery(){
  statusEl.textContent = 'Buscando...';
  tbody.innerHTML = '';
  const offset = (page - 1) * LIMIT;
  const { where, params } = buildFilters();

  const sql = `
    SELECT "Fecha","Hora","Región","Comuna","Calleuno","Calledos","Urbano/Rural",
           "Fallecidos","Graves","M/Grave","Leves","Ilesos"
    FROM acc
    ${where}
    ORDER BY "Fecha" DESC, "Hora" DESC
    LIMIT ${LIMIT} OFFSET ${offset};
  `;
  const res = await conn.query(sql, params);
  const rows = res.toArray().map(o => Object.values(o));

  const frag = document.createDocumentFragment();
  for (const r of rows){
    const tr = document.createElement('tr');
    for (const c of r){
      const td = document.createElement('td');
      td.textContent = c == null ? '' : String(c);
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
  statusEl.textContent = `Mostrando ${rows.length} filas (pág. ${page})`;
}

// --- listeners
regionSel.addEventListener('change', async () => { page = 1; pageInp.value = 1; await loadRegion(regionSel.value); await runQuery(); });
document.getElementById('buscar').addEventListener('click', async () => { page = 1; pageInp.value = 1; await runQuery(); });
document.getElementById('limpiar').addEventListener('click', async () => {
  comunaInp.value=''; calleAInp.value=''; calleBInp.value='';
  page = 1; pageInp.value = 1; await runQuery();
});
document.getElementById('prev').addEventListener('click', async () => { page = Math.max(1, page-1); pageInp.value = page; await runQuery(); });
document.getElementById('next').addEventListener('click', async () => { page = page+1; pageInp.value = page; await runQuery(); });
pageInp.addEventListener('change', async () => { page = Math.max(1, parseInt(pageInp.value||'1',10)); await runQuery(); });

// --- arranque
await loadRegion(regionSel.value);
await runQuery();
