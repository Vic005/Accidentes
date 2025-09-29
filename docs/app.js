// app.static.js — SIN DuckDB
document.addEventListener("DOMContentLoaded", () => {
  (async function main(){
    const $ = (id) => document.getElementById(id);
    const regionSel = $('region');
    const comunaInp = $('comuna');         // convertiremos a <select> dinámico si quieres
    const calleAInp = $('calleA');
    const calleBInp = $('calleB');
    const pageInp   = $('page');
    const statusEl  = $('status');
    const tbody     = document.querySelector('#tbl tbody');

    // Ajusta los slugs EXACTAMENTE a tus carpetas:
    const REGIONES = [
      ["region-metropolitana-de-santiago","Región Metropolitana de Santiago"],
      ["valparaiso","Valparaíso"],
      ["libertador-general-bernardo-o-higgins","Libertador General Bernardo O’Higgins"],
      ["maule","Maule"],["nuble","Ñuble"],["biobio","Biobío"],["la-araucania","La Araucanía"],
      ["los-rios","Los Ríos"],["los-lagos","Los Lagos"],["aysen-del-general-carlos-ibanez-del-campo","Aysén del General Carlos Ibáñez del Campo"],
      ["magallanes-y-de-la-antartica-chilena","Magallanes y de la Antártica Chilena"],["arica-y-parinacota","Arica y Parinacota"],
      ["tarapaca","Tarapacá"],["antofagasta","Antofagasta"],["atacama","Atacama"],["coquimbo","Coquimbo"],
    ];
    regionSel.innerHTML = REGIONES.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
    let page = 1, LIMIT = 100;

    // Helpers
    const slug = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
                      .toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "sin-dato";
    const initial = (s) => ((s||"").trim().toLowerCase()[0] || "_").replace(/[^a-z0-9]/g,"_");

    async function loadComunas(regionSlug){
      const url = `data-json/${regionSlug}/comunas.json`;
      const res = await fetch(url);
      if (!res.ok){ throw new Error(`No pude cargar comunas: ${url}`); }
      const comunas = await res.json();
      // Si quieres, cámbialo a <select>:
      // comunaInp.outerHTML = `<select id="comuna">${comunas.map(c=>`<option>${c}</option>`).join('')}</select>`;
      return comunas;
    }

    async function loadStreets(regionSlug, comuna){
      const url = `data-json/${regionSlug}/streets/${slug(comuna)}.json`;
      const res = await fetch(url);
      if (!res.ok){ throw new Error(`No pude cargar calles: ${url}`); }
      return res.json();
    }

    async function loadIntersection(regionSlug, comuna, calleA, calleB){
      // bucket por letra inicial de calleA normalizada (para equilibrar tamaño)
      const A = (calleA||"").trim(), B = (calleB||"").trim();
      const a = slug(A), b = slug(B);
      if (!a || !b) return [];
      const key1 = `${a}__x__${b}`;
      const key2 = `${b}__x__${a}`;
      const url  = `data-json/${regionSlug}/intersections/${slug(comuna)}/${initial(A)}-bucket.json`;
      const res = await fetch(url);
      if (!res.ok) return []; // bucket sin data
      const { intersections } = await res.json();
      const hit = intersections[key1] || intersections[key2] || [];
      return hit;
    }

    async function runQuery(){
      try{
        statusEl.textContent = 'Buscando…';
        tbody.innerHTML = '';
        const regionSlug = regionSel.value;
        const comuna     = comunaInp.value.trim();
        const A          = calleAInp.value.trim();
        const B          = calleBInp.value.trim();

        if (!regionSlug || !comuna){
          statusEl.textContent = 'Elige Región y escribe Comuna.';
          return;
        }
        if (!A && !B){
          statusEl.textContent = 'Escribe al menos una calle.';
          return;
        }

        // Si sólo hay una calle, muestra cualquier siniestro donde aparezca en Calleuno o Calledos:
        if (!A || !B){
          const calles = await loadStreets(regionSlug, comuna);
          // heurística: si existe la otra calle sugerida exacta, pídela
          statusEl.textContent = 'Ingresa dos calles para intersección exacta. Mostrando coincidencias por 1 calle.';
          // Carga buckets de A por letra (y opcionalmente otra letra vecina)
          const A1 = A || B, B1 = "";
          const rows = await loadIntersection(regionSlug, comuna, A1, A1); // llama un bucket; lo filtramos abajo
          const s = (A || B).toLowerCase();
          const filtered = rows.filter(r =>
            String(r["Calleuno"]||"").toLowerCase().includes(s) ||
            String(r["Calledos"]||"").toLowerCase().includes(s)
          );
          renderRows(filtered);
          return;
        }

        // Intersección canónica (dos calles)
        const rows = await loadIntersection(regionSlug, comuna, A, B);
        renderRows(rows);
      } catch (e){
        console.error(e);
        statusEl.textContent = 'Ocurrió un error. Revisa consola.';
      }
    }

    function renderRows(rows){
      const offset = (page - 1) * LIMIT;
      const pageRows = rows.slice(offset, offset + LIMIT);
      const frag = document.createDocumentFragment();
      pageRows.forEach(r => {
        const tr = document.createElement('tr');
        ["Fecha","Hora","Región","Comuna","Calleuno","Calledos","Urbano/Rural","Fallecidos","Graves","M/Grave","Leves","Ilesos"]
          .forEach(k => {
            const td = document.createElement('td');
            td.textContent = r[k] == null ? '' : String(r[k]);
            tr.appendChild(td);
          });
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
      document.getElementById('status').textContent = `Mostrando ${pageRows.length} de ${rows.length} filas (pág. ${page})`;
      // guarda en window la última respuesta si quieres exportar CSV
      window.__lastRows = rows;
    }

    // Eventos
    document.getElementById('buscar').addEventListener('click', async () => { page=1; pageInp.value=1; await runQuery(); });
    document.getElementById('limpiar').addEventListener('click', async () => {
      comunaInp.value=''; calleAInp.value=''; calleBInp.value=''; page=1; pageInp.value=1; tbody.innerHTML=''; statusEl.textContent='Listo';
    });
    document.getElementById('prev').addEventListener('click', async () => { page=Math.max(1,page-1); pageInp.value=page; await runQuery(); });
    document.getElementById('next').addEventListener('click', async () => { page=page+1; pageInp.value=page; await runQuery(); });
    pageInp.addEventListener('change', async () => { page=Math.max(1, parseInt(pageInp.value||'1',10)); await runQuery(); });

    // Arranque: podrías cargar comunas de la región por defecto para autoayuda
    const first = regionSel.value;
    try {
      const comunas = await loadComunas(first);
      console.log("Comunas disponibles:", comunas.slice(0,10), "…");
    } catch {}
  })();
});
