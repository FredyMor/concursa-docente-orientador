/* Visor de documentos: muestra los PDF del anexo dentro de la app, página por página,
   dibujados en lienzos (sin capa de texto, sin enlace de descarga ni menú contextual).
   PDF.js 3.11 se carga solo al abrir un documento y corre en el hilo principal. */
(function () {
  'use strict';
  const cargados = {};
  function script(src) {
    if (cargados[src]) return cargados[src];
    return (cargados[src] = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => { delete cargados[src]; s.remove(); mal(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    }));
  }
  let CLAVE = null;
  function clave() { return CLAVE || (CLAVE = window.Cripto.sha256('concursa-documentos-v1')); }
  function decodificar(b64) {
    const bin = atob(b64), n = bin.length, u = new Uint8Array(n), k = clave();
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i) ^ k[i & 31];
    return u;
  }

  // Marca de agua: texto diagonal repetido sobre la página, dibujado en el mismo lienzo
  function marcaAgua(ctx, w, h) {
    const t = window.Activacion && Activacion.marca ? Activacion.marca() : '';
    if (!t) return;
    const fs = Math.max(11, Math.round(w / 34));
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6);
    ctx.font = `600 ${fs}px Alegreya, Georgia, serif`;
    ctx.fillStyle = 'rgba(114, 2, 11, 0.13)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const paso = fs * 7, ancho = ctx.measureText(t).width + fs * 4, diag = Math.hypot(w, h);
    for (let y = -diag / 2, fila = 0; y <= diag / 2; y += paso, fila++)
      for (let x = -diag / 2 + (fila % 2) * ancho / 2; x <= diag / 2; x += ancho) ctx.fillText(t, x, y);
    ctx.restore();
  }

  const ZOOMS = [1, 1.5, 2, 3];
  let actual = null;   // { id, pdf }
  let v = null;        // estado de la vista abierta

  async function documento(id) {
    if (actual && actual.id === id) return actual.pdf;
    if (actual) { try { actual.pdf.destroy(); } catch (e) {} actual = null; }
    await script('pdfjs/pdf.worker.min.js');
    await script('pdfjs/pdf.min.js');
    if (!window.DOCS || !window.DOCS[id]) { delete cargados['docs/' + id + '.js']; await script('docs/' + id + '.js'); }
    const datos = decodificar(window.DOCS[id]);
    delete window.DOCS[id];                         // libera la copia en texto
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = 'pdfjs/pdf.worker.min.js';
    const pdf = await lib.getDocument({ data: datos, isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
    actual = { id, pdf };
    return pdf;
  }

  function abrir(cont, id, pagina, alCambiarPagina) {
    cerrar();
    const est = v = { cont, id, z: 0, hojas: [], tam: [], tareas: {}, vivo: true, alCambiar: alCambiarPagina };
    cont.innerHTML = `<div class="visor-estado" id="vEstado">Abriendo el documento…</div>`;
    documento(id).then(async pdf => {
      if (!est.vivo) return;
      est.pdf = pdf; est.n = pdf.numPages;
      for (let i = 1; i <= est.n; i++) {                // tamaños de todas las páginas, para reservar su lugar
        const pg = await pdf.getPage(i); if (!est.vivo) return;
        const vp = pg.getViewport({ scale: 1 }); est.tam.push([vp.width, vp.height]);
      }
      montar(est, Math.max(1, Math.min(est.n, pagina || 1)));
    }).catch(() => { if (est.vivo) cont.innerHTML = '<div class="visor-estado">No se pudo abrir el documento. Cierra el visor e inténtalo de nuevo.</div>'; });
  }

  function montar(est, inicio) {
    const c = est.cont;
    c.innerHTML = `<div class="visor-barra">
        <label class="visor-pag">Página <input id="vNum" type="number" inputmode="numeric" min="1" max="${est.n}" value="${inicio}" aria-label="Ir a la página"> de ${est.n}</label>
        <span class="visor-zoom"><button type="button" id="vMenos" aria-label="Alejar">−</button><span id="vZ">100 %</span><button type="button" id="vMas" aria-label="Acercar">+</button></span>
      </div>
      <div class="visor-hojas" id="vHojas"></div>`;
    const hojas = c.querySelector('#vHojas');
    hojas.addEventListener('contextmenu', e => e.preventDefault());
    for (let i = 0; i < est.n; i++) {
      const h = document.createElement('div');
      h.className = 'hoja'; h.dataset.i = i;
      h.innerHTML = `<span class="hoja-num">${i + 1}</span>`;
      hojas.appendChild(h); est.hojas.push(h);
    }
    est.desplaza = c.closest('.libro-cuerpo') || document.scrollingElement;
    est.io = new IntersectionObserver(ents => ents.forEach(e => {
      const i = +e.target.dataset.i;
      if (e.isIntersecting) dibujar(est, i); else if (Math.abs(i - est.pagina) > 3) soltar(est, i);
    }), { root: est.desplaza === document.scrollingElement ? null : est.desplaza, rootMargin: '900px 0px' });
    est.hojas.forEach(h => est.io.observe(h));
    est.alScroll = () => { if (!est.raf) est.raf = requestAnimationFrame(() => { est.raf = 0; seguirPagina(est); }); };
    est.desplaza.addEventListener('scroll', est.alScroll, { passive: true });
    est.alResize = () => { clearTimeout(est.tRes); est.tRes = setTimeout(() => reajustar(est, est.pagina), 200); };
    addEventListener('resize', est.alResize);
    c.querySelector('#vMas').onclick = () => zoom(est, +1);
    c.querySelector('#vMenos').onclick = () => zoom(est, -1);
    const num = c.querySelector('#vNum');
    const irA = () => { const p = Math.max(1, Math.min(est.n, parseInt(num.value, 10) || est.pagina + 1)); num.value = p; num.blur(); ir(est, p - 1); };
    num.addEventListener('change', irA);
    num.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); irA(); } });
    pellizco(est, hojas);
    est.pagina = inicio - 1;
    reajustar(est, inicio - 1);
  }

  function ancho(est) { return Math.max(240, (est.cont.clientWidth || 360) - 16) * ZOOMS[est.z]; }
  function reajustar(est, pagina) {
    const w = ancho(est);
    est.cont.querySelector('#vHojas').style.width = ZOOMS[est.z] > 1 ? (w + 16) + 'px' : '';
    est.hojas.forEach((h, i) => {
      const [pw, ph] = est.tam[i];
      h.style.width = w + 'px'; h.style.height = Math.round(w * ph / pw) + 'px';
      if (h.dataset.w && +h.dataset.w !== Math.round(w)) soltar(est, i);
    });
    est.cont.querySelector('#vZ').textContent = Math.round(ZOOMS[est.z] * 100) + ' %';
    ir(est, pagina, true);
    // las hojas que ya estaban a la vista no generan un aviso nuevo: se vuelven a observar para redibujarlas
    est.hojas.forEach(h => { est.io.unobserve(h); est.io.observe(h); });
  }
  function ir(est, i, sinRedibujo) {
    const h = est.hojas[i]; if (!h) return;
    const barra = est.cont.querySelector('.visor-barra');
    const base = est.desplaza === document.scrollingElement ? 0 : est.desplaza.getBoundingClientRect().top;
    const y = h.getBoundingClientRect().top - base + est.desplaza.scrollTop - (barra ? barra.offsetHeight : 0) - 6;
    est.desplaza.scrollTop = Math.max(0, y);
    est.pagina = i; seguirPagina(est);
  }
  function seguirPagina(est) {
    const base = est.desplaza === document.scrollingElement ? 0 : est.desplaza.getBoundingClientRect().top;
    const ref = base + (est.desplaza.clientHeight || innerHeight) * .35;
    let p = est.pagina;
    for (let i = 0; i < est.hojas.length; i++) { const r = est.hojas[i].getBoundingClientRect(); if (r.top <= ref && r.bottom > ref) { p = i; break; } }
    if (p !== est.pagina || !seguirPagina.ok) {
      est.pagina = p; seguirPagina.ok = true;
      const num = est.cont.querySelector('#vNum'); if (num && document.activeElement !== num) num.value = p + 1;
      if (est.alCambiar) est.alCambiar(p + 1);
    }
  }
  function zoom(est, d) {
    const z = Math.max(0, Math.min(ZOOMS.length - 1, est.z + d));
    if (z === est.z) return;
    est.z = z; reajustar(est, est.pagina);
  }
  function pellizco(est, el) {
    let d0 = 0;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    el.addEventListener('touchstart', e => { if (e.touches.length === 2) d0 = dist(e.touches); }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !d0) return;
      const r = dist(e.touches) / d0;
      if (r > 1.35) { zoom(est, +1); d0 = dist(e.touches); } else if (r < .74) { zoom(est, -1); d0 = dist(e.touches); }
    }, { passive: true });
    el.addEventListener('touchend', () => { d0 = 0; }, { passive: true });
  }

  async function dibujar(est, i) {
    const h = est.hojas[i], w = Math.round(ancho(est));
    if (!est.vivo || est.tareas[i] || (h.dataset.w && +h.dataset.w === w)) return;
    const [pw, ph] = est.tam[i];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let escala = (w / pw) * dpr;
    const maxPx = 5e6; if (pw * ph * escala * escala > maxPx) escala = Math.sqrt(maxPx / (pw * ph));
    try {
      const pg = await est.pdf.getPage(i + 1);
      if (!est.vivo) return;
      const vp = pg.getViewport({ scale: escala });
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.floor(vp.width); lienzo.height = Math.floor(vp.height);
      const tarea = pg.render({ canvasContext: lienzo.getContext('2d', { alpha: false }), viewport: vp, background: '#ffffff' });
      est.tareas[i] = tarea;
      await tarea.promise;
      delete est.tareas[i];
      marcaAgua(lienzo.getContext('2d'), lienzo.width, lienzo.height);
      if (!est.vivo) return;
      h.querySelectorAll('canvas').forEach(x => { x.width = 0; x.remove(); });
      h.appendChild(lienzo); h.dataset.w = w; h.classList.add('lista');
    } catch (e) { delete est.tareas[i]; }
  }
  function soltar(est, i) {
    const h = est.hojas[i]; if (!h) return;
    if (est.tareas[i]) { try { est.tareas[i].cancel(); } catch (e) {} delete est.tareas[i]; }
    h.querySelectorAll('canvas').forEach(x => { x.width = 0; x.height = 0; x.remove(); });
    delete h.dataset.w; h.classList.remove('lista');
  }

  function cerrar() {
    if (!v) return;
    const est = v; v = null; est.vivo = false;
    if (est.io) est.io.disconnect();
    if (est.desplaza && est.alScroll) est.desplaza.removeEventListener('scroll', est.alScroll);
    if (est.alResize) removeEventListener('resize', est.alResize);
    Object.keys(est.tareas).forEach(k => { try { est.tareas[k].cancel(); } catch (e) {} });
    est.hojas.forEach((h, i) => soltar(est, i));
    if (actual) { try { actual.pdf.cleanup(); } catch (e) {} }
  }

  window.Visor = { abrir, cerrar };
})();
