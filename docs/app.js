// app.static.js — regiones→comunas, cruce flexible (pack por comuna)
document.addEventListener("DOMContentLoaded", () => {
  (async function main(){
    const $ = (id) => document.getElementById(id);
    const regionSel = $('region');
    let comunaEl    = $('comuna');   // si es <input>, lo convertiremos a <select>
    const calleAInp = $('calleA');
    const calleBInp = $('calleB');
    const pageInp   = $('page');
    const statusEl  = $('status');
    const tbody     = document.querySelector('#tbl tbody');

    // --- regiones (ajusta slugs a tus carpetas) ---
    const REGIONES = [
      ["region-metropolitana-de-santiago","Región Metropolitana de Santiago"],
      ["valparaiso","Valparaíso"],
      ["libertador-general-bernardo-ohiggins","Libertador General Bernardo O’Higgins"],
      ["maule","Maule"],["nuble","Ñuble"],["biobio","Biobío"],["la-araucania","La Araucanía"],
      ["los-rios","Los Ríos"],["los-lagos","Los Lagos"],
      ["aysen-del-general-carlos-ibanez-del-campo","Aysén del General Carlos Ibáñez del Campo"],
      ["magallanes-y-de-la-antartica-chilena","Magallanes y de la Antártica Chilena"],
      ["arica-y-parinacota","Arica y Parinacota"],["tarapaca","Tarapacá"],
      ["antofagasta","Antofagasta"],["atacama","Atacama"],["coquimbo","Coquimbo"],
    ];
    regionSel.innerHTML = REGIONES.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

    let page = 1, LIMIT = 100;

    // --- utilidades ---
    const rmAcc = (s) => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const slug  = (s) => rmAcc(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "sin-dato";

    // normalización de calle para búsqueda flexible (quita prefijos viales)
    function normStreet(s){
      let t = rmAcc(String(s||"")).toLowerCase().trim();
      // quita prefijos comunes al comienzo
      t = t.replace(/^(av(\.|enida)?|avda|calle|cll|pje|psje|pasaje|cam(\.|ino)?|ruta|autopista|costanera|bvd|boulevard|diag(\.|onal)?)\s+/i, "");
      // colapsa espacios y quita puntuación liviana
      t = t.replace(/[.,]/g," ").replace(/\s+/g," ").trim();
      return t;
    }

    // cache
    const comunasCache  = new Map(); // regionSlug -> [comunas]
    const streetsCache  = new Map(); // `${regionSlug}::${comuna}` -> [calles]
    const comunaPackCache = new Map(); // `${regionSlug}::${comuna}` -> {intersections:{}}

    async function loadComunas(regionSlug){
      if (comunasCache.has(regionSlug)) return comunasCache.get(regionSlug);
      const url = `data-json/${regionSlug}/comunas.json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`No pude cargar comunas: ${url}`);
      const js = await r.json();
      comunasCache.set(regionSlug, js);
      return js;
    }

    async function loadStreets(regionSlug, comuna){
      const key = `${regionSlug}::${comuna}`;
      if (streetsCache.has(key)) return streetsCache.get(key);
      const url = `data-json/${regionSlug}/streets/${slug(comuna)}.json`;
      const r = await fetch(url);
      const js = r.ok ? await r.json() : [];
      streetsCache.set(key, js);
      return js;
    }

    async function loadPack(regionSlug, comuna){
      const key = `${regionSlug}::${comuna}`;
      if (comunaPackCache.has(key)) return comunaPackCache.get(key);
      const url = `data-json/${regionSlug}/intersections/${slug(comuna)}/pack.json`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const js = await r.json();
      comunaPackCache.set(key, js);
      return js;
    }

    // convierte input#comuna en select#comuna (si aún no lo es)
    function ensureComunaSelect(){
      if (comunaEl && comunaEl.tagName.toLowerCase() === 'select') return comunaEl;
      const sel = document.createElement('select');
      sel.id = 'comuna';
      sel.className = comunaEl.className || '';
      comunaEl.replaceWith(sel);
      comunaEl = sel;
      return sel;
    }

    async function populateComunas(regionSlug){
      const sel = ensureComunaSelect();
      sel.innerHTML = `<option value="">— Selecciona una comuna —</option>`;
      try{
        const comunas = await loadComunas(regionSlug);
        sel.innerHTML += comunas.map(c => `<option value="${c}">${c}</option>`).join('');
      }catch(e){
        console.error(e);
        sel.innerHTML = `<option value="">(Error cargando comunas)</option>`;
      }
    }

    // datalist para autocompletar calles (opcional, si tu HTML ya lo tiene puedes omitir)
    async function populateStreetDatalists(regionSlug, comuna){
      const listIdA = 'dl-calleA', listIdB = 'dl-calleB';
      let dlA = document.getElementById(listIdA);
      let dlB = document.getElementById(listIdB);
      if (!dlA){ dlA = document.createElement('datalist'); dlA.id = listIdA; document.body.appendChild(dlA); }
      if (!dlB){ dlB = document.createElement('datalist'); dlB.id = listIdB; document.body.appendChild(dlB); }
      calleAInp.setAttribute('list', listIdA);
      calleBInp.setAttribute('list', listIdB);

      const streets = await loadStreets(regionSlug, comuna);
      const opts = streets.map(s => `<option value="${s}"></option>`).join('');
      dlA.innerHTML = opts;
      dlB.innerHTML = opts;
    }

    // encuentra candidatas de una calle libre comparando por substring normalizada
    async function candidateStreets(regionSlug, comuna, query, maxN=8){
      const q = normStreet(query);
      if (!q) return [];
      const streets = await loadStreets(regionSlug, comuna);
      // pre-normaliza
      const scored = [];
      for (const s of streets){
        const ns = normStreet(s);
        if (!ns) continue;
        if (ns.includes(q)){
          // score simple: más corto y más cercano a inicio tiene mejor score
          const idx = ns.indexOf(q);
          const score = idx + ns.length * 0.05;
          scored.push([score, s]);
        }
      }
      scored.sort((a,b)=>a[0]-b[0]);
      return scored.slice(0, maxN).map(x=>x[1]);
    }

    function renderRows(rows){
      tbody.innerHTML = '';
      const offset = (page - 1) * LIMIT;
      const pageRows = rows.slice(offset, offset + LIMIT);
      const frag = document.createDocumentFragment();
      pageRows.forEach(r => {
        const tr = document.createElement('tr');
        ["Fecha","Región","Comuna","Calleuno","Calledos","Urbano/Rural","Siniestros","Causas","Fallecidos","Graves","M/Grave","Leves","Ilesos"]
          .forEach(k => {
            const td = document.createElement('td');
            td.textContent = r[k] == null ? '' : String(r[k]);
            tr.appendChild(td);
          });
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
      statusEl.textContent = `Mostrando ${pageRows.length} de ${rows.length} filas (pág. ${page})`;
      window.__lastRows = rows;
    }

    async function runQuery(){
      try{
        statusEl.textContent = 'Buscando…';
        const regionSlug = regionSel.value;
        const comuna     = (comunaEl.value||"").trim();
        const Araw       = (calleAInp.value||"").trim();
        const Braw       = (calleBInp.value||"").trim();

        if (!regionSlug){ statusEl.textContent='Elige una región.'; return; }
        if (!comuna){ statusEl.textContent='Elige una comuna.'; return; }
        if (!Araw && !Braw){ statusEl.textContent='Ingresa al menos una calle.'; return; }

        const pack = await loadPack(regionSlug, comuna);
        if (!pack){ statusEl.textContent='Sin datos para esa comuna.'; return; }

        // SOLO 1 calle: coincidencia flexible sobre todas las filas del pack
        if (!Araw || !Braw){
          const needle = normStreet(Araw || Braw);
          const out = [];
          const seen = new Set();
          for (const key in (pack.intersections||{})){
            const arr = pack.intersections[key] || [];
            for (const r of arr){
              const c1 = normStreet(r["Calleuno"]);
              const c2 = normStreet(r["Calledos"]);
              if (c1.includes(needle) || c2.includes(needle)){
                const sig = JSON.stringify(r);
                if (!seen.has(sig)){ seen.add(sig); out.push(r); }
              }
            }
          }
          page = 1; pageInp.value = 1;
          statusEl.textContent = `Coincidencias por una calle («${Araw||Braw}»).`;
          renderRows(out);
          return;
        }

        // DOS calles: 1) intento exacto por slug, 2) si no hay, fuzzy por candidatas
        const aSlug = slug(Araw), bSlug = slug(Braw);
        const key1  = `${aSlug}__x__${bSlug}`;
        const key2  = `${bSlug}__x__${aSlug}`;
        const dict  = pack.intersections || {};
        let rows = dict[key1] || dict[key2] || [];

        if (!rows.length){
          // buscar candidatas
          const candA = await candidateStreets(regionSlug, comuna, Araw, 10);
          const candB = await candidateStreets(regionSlug, comuna, Braw, 10);
          const seen  = new Set();
          for (const ca of candA){
            for (const cb of candB){
              const k1 = `${slug(ca)}__x__${slug(cb)}`;
              const k2 = `${slug(cb)}__x__${slug(ca)}`;
              const arr = dict[k1] || dict[k2] || [];
              for (const r of arr){
                const sig = JSON.stringify(r);
                if (!seen.has(sig)){ seen.add(sig); rows.push(r); }
              }
            }
          }
          if (rows.length){
            statusEl.textContent = `Cruce flexible: interpreté «${Araw}» como alguna variante de «${candA[0]||Araw}» y «${Braw}» como «${candB[0]||Braw}».`;
          }else{
            statusEl.textContent = `Sin resultados. Prueba quitar prefijos (ej: “avenida”) o usa una sola calle para ver coincidencias.`;
          }
        }else{
          statusEl.textContent = `Cruce exacto encontrado.`;
        }

        page = 1; pageInp.value = 1;
        renderRows(rows);
      }catch(e){
        console.error(e);
        statusEl.textContent = 'Ocurrió un error. Revisa consola.';
      }
    }

    // eventos
    regionSel.addEventListener('change', async () => {
      await populateComunas(regionSel.value);
      tbody.innerHTML=''; statusEl.textContent='Selecciona una comuna.';
    });

    // cuando cambie la comuna, cargamos catálogo de calles para autocompletar
    document.addEventListener('change', async (ev) => {
      if (ev.target && ev.target.id === 'comuna'){
        const comuna = comunaEl.value;
        if (comuna){
          await populateStreetDatalists(regionSel.value, comuna);
          tbody.innerHTML=''; statusEl.textContent='Ingresa calles y busca.';
        }
      }
    });

    document.getElementById('buscar').addEventListener('click', () => { page=1; pageInp.value=1; runQuery(); });
    document.getElementById('limpiar').addEventListener('click', () => {
      if (comunaEl.tagName.toLowerCase()==='select') comunaEl.selectedIndex = 0; else comunaEl.value='';
      calleAInp.value=''; calleBInp.value='';
      page=1; pageInp.value=1; tbody.innerHTML=''; statusEl.textContent='Listo';
    });
    document.getElementById('prev').addEventListener('click', () => { page=Math.max(1,page-1); pageInp.value=page; runQuery(); });
    document.getElementById('next').addEventListener('click', () => { page=page+1; pageInp.value=page; runQuery(); });
    pageInp.addEventListener('change', () => { page=Math.max(1, parseInt(pageInp.value||'1',10)); runQuery(); });

    // arranque: poblar comunas de la región por defecto
    await populateComunas(regionSel.value);
  })();
});
