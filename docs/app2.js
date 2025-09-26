
// 1) Importa SOLO el shim ESM de duckdb-wasm (no importes .wasm ni worker)
import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/+esm";

// 2) Espera el DOM antes de tocar elementos
document.addEventListener("DOMContentLoaded", () => {
  (async function main() {
    // ---------- UI: referencias ----------
    const regionSel = document.getElementById('region');   // <select id="region">
    const comunaInp = document.getElementById('comuna');
    const calleAInp = document.getElementById('calleA');
    const calleBInp = document.getElementById('calleB');
    const pageInp   = document.getElementById('page');
    const statusEl  = document.getElementById('status');
    const tbody     = document.getElementById('tbl').querySelector('tbody');

    // Si por cualquier motivo no existe alguno, salimos con mensaje claro
    if (!regionSel || !tbody) {
      console.error("No se encontraron elementos del DOM (¿coinciden los IDs con index.html?).");
      return;
    }

    // ---------- Carga de opciones de región ----------
    // Opción A: estático
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
    // Opción B: dinámico desde ./regions.json (si lo generaste)
    // const REGIONES = await fetch('./regions.json').then(r => r.json()).then(a => a.map(x => [x.slug, x.label]));

    regionSel.innerHTML = REGIONES
      .map(([val, label]) => `<option value="${val}">${label}</option>`)
      .join('');

    // ---------- Estado de paginación ----------
    let page = 1;
    const LIMIT = 100;

    // ---------- DuckDB-Wasm bootstrap ----------
    const bundles = duckdb.getJsDelivrBundles();
    const bundle  = duckdb.selectBundle(bundles);
    const worker  = new Worker(bundle.worker, { type: "module" });
    const logger  = new duckdb.ConsoleLogger();
    const db      = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    const conn = await db.connect();
    await conn.query("INSTALL httpfs; LOAD httpfs; SET threads=4;");

    // ---------- Helpers ----------
    async function loadRegion(regionSlug){
      const path = `data/region=${regionSlug}/part-*.parquet`;
      await conn.query(`CREATE OR REPLACE VIEW acc AS SELECT * FROM read_parquet('${path}');`);
    }

    function buildFilters(){
      const filtros = [];
      const params  = [];

      const comuna = (comunaInp.value || "").trim();
      if (comuna){
        filtros.push(`LOWER("Comuna") LIKE LOWER(?)`);
        params.push(`%${comuna}%`);
      }

      const a = (calleAInp.value || "").trim();
      const b = (calleBInp.value || "").trim();
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

      const where = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
      return { where, params };
    }

    async function runQuery(){
      statusEl.textContent = 'Buscando…';
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

    // ---------- Eventos ----------
    regionSel.addEventListener('change', async () => {
      page = 1; pageInp.value = 1;
      await loadRegion(regionSel.value);
      await runQuery();
    });

    document.getElementById('buscar').addEventListener('click', async () => {
      page = 1; pageInp.value = 1;
      await runQuery();
    });

    document.getElementById('limpiar').addEventListener('click', async () => {
      comunaInp.value = ''; calleAInp.value = ''; calleBInp.value = '';
      page = 1; pageInp.value = 1;
      await runQuery();
    });

    document.getElementById('prev').addEventListener('click', async () => {
      page = Math.max(1, page - 1); pageInp.value = page;
      await runQuery();
    });

    document.getElementById('next').addEventListener('click', async () => {
      page = page + 1; pageInp.value = page;
      await runQuery();
    });

    pageInp.addEventListener('change', async () => {
      page = Math.max(1, parseInt(pageInp.value || '1', 10));
      await runQuery();
    });

    // ---------- Arranque ----------
    await loadRegion(regionSel.value);
    await runQuery();
  })().catch(err => {
    console.error("Error inicializando la app:", err);
    alert("Ocurrió un error al iniciar la aplicación. Revisa la consola (F12) → pestaña Console.");
  });
});
