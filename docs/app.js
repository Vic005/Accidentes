// app.static.js
document.addEventListener("DOMContentLoaded", () => {
  (async function main(){
    const $ = (id) => document.getElementById(id);
    const regionSel = $('region');
    const comunaInp = $('comuna');   // input de texto (o conviértelo a <select>)
    const calleAInp = $('calleA');
    const calleBInp = $('calleB');
    const pageInp   = $('page');
    const statusEl  = $('status');
    const tbody     = document.querySelector('#tbl tbody');

    const REGIONES = [
      ["region-metropolitana-de-santiago","Región Metropolitana de Santiago"],
      ["valparaiso","Valparaíso"],
      ["libertador-general-bernardo-o-higgins","Libertador General Bernardo O’Higgins"],
      ["maule","Maule"],["nuble","Ñuble"],["biobio","Biobío"],["la-araucania","La Araucanía"],
      ["los-rios","Los Ríos"],["los-lagos","Los Lagos"],
      ["aysen-del-general-carlos-ibanez-del-campo","Aysén del General Carlos Ibáñez del Campo"],
      ["magallanes-y-de-la-antartica-chilena","Magallanes y de la Antártica Chilena"],
      ["arica-y-parinacota","Arica y Parinacota"],["tarapaca","Tarapacá"],
      ["antofagasta","Antofagasta"],["atacama","Atacama"],["coquimbo","Coquimbo"],
    ];
    regionSel.innerHTML = REGIONES.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

    let page = 1, LIMIT = 100;

    const slug = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
                    .toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "sin-dato";

    async function loadComunas(regionSlug){
      const url = `data-json/${regionSlug}/comunas.json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`No pude cargar comunas: ${url}`);
      return r.json();
    }

    async function loadStreets(regionSlug, comuna){
      const url = `data-json/${regionSlug}/streets/${slug(comuna)}.json`;
      const r = await fetch(url);
      if (!r.ok) return [];
      return r.json();
    }

    const comunaCache = new Map(); // cache pack por comuna
    async function loadPack(regionSlug, comuna){
      const key = `${regionSlug}::${comuna}`;
      if (comunaCache.has(key)) return comunaCache.get(key);
      const url = `data-json/${regionSlug}/intersections/${slug(comuna)}/pack.json`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const data = await r.json();
      comunaCache.set(key, data);
      return data;
    }

    async function loadIntersection(regionSlug, comuna, calleA, calleB){
      const A = (calleA||"").trim(), B = (calleB||"").trim();
      if (!A || !B) return [];
      const aSlug = slug(A), bSlug = slug(B);
      const key1  = `${aSlug}__x__${bSlug}`;
      const key2  = `${bSlug}__x__${aSlug}`;
      const pack  = await loadPack(regionSlug, comuna);
      if (!pack) return [];
      const dict  = pack.intersections || {};
      return dict[key1] || dict[key2] || [];
    }

    function renderRows(rows){
      tbody.innerHTML = '';
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
      statusEl.textContent = `Mostrando ${pageRows.length} de ${rows.length} filas (pág. ${page})`;
      window.__lastRows = rows; // para export CSV si quieres
    }

    async function runQuery(){
      try{
        statusEl.textContent = 'Buscando…';
        const regionSlug = regionSel.value;
        const comuna     = comunaInp.value.trim();
        const A          = calleAInp.value.trim();
        const B          = calleBInp.value.trim();
        if (!regionSlug || !comuna){ statusEl.textContent = 'Elige Región y escribe Comuna.'; return; }
        if (!A && !B){ statusEl.textContent = 'Ingresa al menos una calle.'; return; }

        // Si hay solo una calle, muestra coincidencias "contiene"
        if (!A || !B){
          const calle = (A||B).toLowerCase();
          const pack  = await loadPack(regionSlug, comuna);
          if (!pack){ statusEl.textContent = 'Sin datos para esa comuna.'; return; }
          const out = [];
          for (const key in (pack.intersections||{})){
            const arr = pack.intersections[key] || [];
            // conserva filas donde aparezca la calle en Calleuno o Calledos
            arr.forEach(r => {
              const c1 = String(r["Calleuno"]||"").toLowerCase();
              const c2 = String(r["Calledos"]||"").toLowerCase();
              if (c1.includes(calle) || c2.includes(calle)) out.push(r);
            });
          }
          page = 1; pageInp.value = 1;
          renderRows(out);
          return;
        }

        // Intersección exacta (sin orden)
        const rows = await loadIntersection(regionSlug, comuna, A, B);
        page = 1; pageInp.value = 1;
        renderRows(rows);
      }catch(e){
        console.error(e);
        statusEl.textContent = 'Ocurrió un error. Revisa consola.';
      }
    }

    // Eventos UI
    document.getElementById('buscar').addEventListener('click', runQuery);
    document.getElementById('limpiar').addEventListener('click', () => {
      comunaInp.value=''; calleAInp.value=''; calleBInp.value='';
      page=1; pageInp.value=1; tbody.innerHTML=''; statusEl.textContent='Listo';
    });
    document.getElementById('prev').addEventListener('click', () => { page=Math.max(1,page-1); pageInp.value=page; runQuery(); });
    document.getElementById('next').addEventListener('click', () => { page=page+1; pageInp.value=page; runQuery(); });
    pageInp.addEventListener('change', () => { page=Math.max(1, parseInt(pageInp.value||'1',10)); runQuery(); });

    // Ayuda inicial: carga comunas de la región por defecto (opcional)
    try {
      const comunas = await loadComunas(regionSel.value);
      console.log("Comunas (ejemplo):", comunas.slice(0,10), "…");
    } catch {}
  })();
});
