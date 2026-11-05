/* Biblioteca del Orientador — lógica de la aplicación (rutas, lectura, práctica,
   simulacro con calificación psicométrica, sesiones sincrónicas y progreso local). */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const MOD = window.MODULOS, ITEMS = window.ITEMS, COMP = window.COMPETENCIAS, GUIA = window.GUIA;
  const SES = window.SESIONES, AGENDA = window.AGENDA_SESION, DOCS_INFO = window.DOCUMENTOS || {};
  // Simulacro diagnóstico: diez ítems complejos fijos, uno por área del curso
  const DIAG = ['1.09', '2.07', '3.07', '5.08', '6.06', '7.07', '8.06', '8.08', '9.08', '10.05'];
  const DIAG_MIN = 20;
  const porId = {}; ITEMS.forEach(i => (porId[i.id] = i));
  const LETRAS = ['A', 'B', 'C', 'D'];
  const ROM = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Modo de compilación: app de usuarios, Entorno simulado o «Prueba nuestro curso»
  const MODO = window.CONCURSA_MODO || {}, PRUEBA = !!MODO.prueba;
  const TXT_COMPLETO = 'Hola, probé «Prueba nuestro curso» y quiero el curso completo Concursa: Docente orientador.';
  // Retos gamificados: niveles por estante, estrellas, títulos temporales y sellos
  const RETOS = window.RETOS || [];
  const retoPorId = {}; RETOS.forEach(r => (retoPorId[r.id] = r));
  const retosDe = m => RETOS.filter(r => r.m === m).sort((a, b) => a.nivel - b.nivel);
  const APRUEBA = 60, VIGENCIA = 7 * 864e5;
  const MECANICA = { emparejar: 'Rompecabezas', ordenar: 'Prioridades', flujo: 'Diagrama de flujo', clasificar: 'Fichero', veredicto: 'Contrarreloj', decisiones: 'Expediente' };

  /* ───────── Estado persistente ───────── */
  const CLAVE = 'bdo.v1';
  const base = () => ({ leidas: {}, practica: {}, stats: {}, simulacros: [], sesiones: {}, retos: {}, titulos: {}, notasRetos: {}, config: { enlace: '', sonido: true, umbral: 60, largo: 40 }, examen: null });
  let E;
  try { E = Object.assign(base(), JSON.parse(Almacen.get(CLAVE) || '{}')); E.config = Object.assign(base().config, E.config); }
  catch (e) { E = base(); }
  const guardar = () => { try { Almacen.set(CLAVE, JSON.stringify(E)); } catch (e) {} };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const barajar = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pct = x => Math.round(x * 100);
  const mmss = ms => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };
  const fecha = t => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

  /* ───────── Sonido sintetizado ───────── */
  let actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
  function sonar(tipo) {
    if (!E.config.sonido) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime, g = a.createGain(); g.connect(a.destination);
    if (tipo === 'pagina') {
      const n = a.sampleRate * .22, buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2) * Math.sin(Math.PI * i / n);
      const src = a.createBufferSource(); src.buffer = buf;
      const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = .7;
      src.connect(f); f.connect(g); g.gain.value = .35; src.start(t);
    } else {
      const notas = tipo === 'bien' ? [[659, 0], [988, .09]] : tipo === 'mal' ? [[196, 0]] : tipo === 'logro' ? [[523, 0], [659, .11], [784, .22], [1047, .34]] : [[880, 0]];
      notas.forEach(([fr, dt]) => {
        const o = a.createOscillator(), gg = a.createGain();
        o.type = tipo === 'mal' ? 'triangle' : 'sine'; o.frequency.value = fr;
        const dur = tipo === 'toque' ? .07 : .35;
        gg.gain.setValueAtTime(0, t + dt); gg.gain.linearRampToValueAtTime(tipo === 'toque' ? .12 : .16, t + dt + .01); gg.gain.exponentialRampToValueAtTime(.0001, t + dt + dur);
        o.connect(gg); gg.connect(a.destination); o.start(t + dt); o.stop(t + dt + dur + .05);
      });
    }
  }
  const ICO_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const ICO_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  function pintarSonido() { const b = $('#btnSonido'); b.innerHTML = E.config.sonido ? ICO_ON : ICO_OFF; b.setAttribute('aria-label', E.config.sonido ? 'Silenciar sonidos' : 'Activar sonidos'); b.style.color = '#e2c47f'; }

  /* ───────── Progreso ───────── */
  const totalFichas = MOD.filter(m => !m.bloqueado).reduce((s, m) => s + m.fichas.length, 0);
  const leidasDe = m => m.fichas.filter((_, i) => E.leidas[m.id + '-' + i]).length;
  const itemsDe = m => ITEMS.filter(i => i.m === m);
  function mejorSimulacro() { return E.simulacros.filter(s => s.tipo !== 'diag').reduce((b, s) => Math.max(b, s.directo), -1); }
  function pintarDock() {
    const leidas = Object.keys(E.leidas).filter(k => !k.startsWith('g')).length;
    const mejor = mejorSimulacro(), est = totalEstrellas();
    $('#dockProgreso').innerHTML = `<b>${leidas}</b> de ${totalFichas} fichas` + (est ? `&ensp;<span class="dock-est">★</span> <b>${est}</b>` : '') + (mejor >= 0 ? `&ensp;Simulacro <b>${mejor}</b>` : '');
    const sub = $('.placa-sub'); if (pintarDock.sub == null) pintarDock.sub = sub.textContent;
    const tv = tituloVigente();
    if (PRUEBA && MODO.sinLimite) sub.textContent = 'Versión de prueba en línea';
    else if (PRUEBA && window.Activacion) { const pr = Activacion.prueba(); sub.textContent = pr.vigente ? 'Versión de prueba: quedan ' + restaTxt(pr.resta) : 'Terminó la versión de prueba'; }
    else sub.textContent = tv ? 'Título vigente: ' + tv.t : pintarDock.sub;
  }
  function restaTxt(ms) { const m = Math.max(1, Math.ceil(ms / 60000)), h = Math.floor(m / 60); return h ? `${h} h ${m % 60} min` : `${m} min`; }
  const ICO_CANDADO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  function htmlCursoCompleto(txt) {
    return `<div class="bloqueo-caja"><span>${ICO_CANDADO}</span><p><b>Disponible en el curso completo.</b> ${txt || 'En la versión de prueba puedes recorrer los estantes I y II con sus fichas, documentos, retos y práctica, y presentar el simulacro diagnóstico.'}</p>
      <div class="acciones-bloqueo"><button class="btn" data-acc="curso-completo">Quiero el curso completo</button>${MODO.descarga ? `<a class="btn sec" href="${MODO.descarga}" target="_top">Descargar la app</a>` : ''}</div></div>`;
  }
  // Marca de agua de las fichas: el mismo texto de los documentos, en diagonal
  function fondoMarca() {
    const t = window.Activacion && Activacion.marca ? Activacion.marca() : '';
    if (!t) return '';
    if (fondoMarca.t !== t) {
      const ancho = Math.round(t.length * 7.4 + 60);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="150"><text x="${ancho / 2}" y="75" text-anchor="middle" transform="rotate(-24 ${ancho / 2} 75)" font-family="Alegreya, Georgia, serif" font-size="14" font-weight="600" fill="rgba(114,2,11,0.11)">${esc(t)}</text></svg>`;
      fondoMarca.t = t; fondoMarca.v = `background-image:url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
    }
    return fondoMarca.v;
  }
  const totalEstrellas = () => RETOS.reduce((s, r) => s + (E.retos[r.id] ? E.retos[r.id].estrellas || 0 : 0), 0);
  const superado = r => !!(E.retos[r.id] && E.retos[r.id].mejor >= APRUEBA);
  const selloEstante = m => { const rs = retosDe(m); return rs.length > 0 && rs.every(superado); };
  function estrellasDe(p) { return p >= 90 ? 3 : p >= 75 ? 2 : p >= APRUEBA ? 1 : 0; }
  function retoAbierto(r) {
    if (r.nivel === 1) return true;
    const prev = retosDe(r.m).find(x => x.nivel === r.nivel - 1);
    return !prev || superado(prev);
  }
  function tituloVigente() {
    let b = null;
    Object.keys(E.titulos).forEach(t => { const ts = E.titulos[t]; if (Date.now() - ts < VIGENCIA && (!b || ts > b.ts)) b = { t, ts }; });
    return b;
  }
  const diasRestantes = ts => Math.max(1, Math.ceil((ts + VIGENCIA - Date.now()) / 864e5));
  const ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5-4.9-4.6 6.6-.8z"/></svg>';
  const htmlEstrellas = n => `<span class="estrellas" role="img" aria-label="${n} de 3 estrellas">${[0, 1, 2].map(k => `<i class="${k < n ? 'on' : ''}">${ESTRELLA}</i>`).join('')}</span>`;
  function aviso(txt) {
    const a = $('#aviso'); a.textContent = txt; a.hidden = false;
    clearTimeout(aviso.t); aviso.t = setTimeout(() => (a.hidden = true), 2600);
  }

  /* ───────── Rutas ───────── */
  let profundidad = 0, empujando = false, reemplazando = false, escenaOK = false;
  function ir(h) {
    if (h === ruta()) { pintar(); return; }
    empujando = true; location.hash = h;
  }
  function reemplazar(h) {
    if (h === ruta()) { pintar(); return; }
    reemplazando = true; location.replace('#' + h);
  }
  function volver() {
    if (profundidad > 0) history.back();
    else reemplazar(padre(ruta()));
  }
  function cerrar() {
    if (profundidad > 0) { const n = profundidad; profundidad = 0; reemplazando = true; history.go(-n); }
    else reemplazar('/');
  }
  const ruta = () => (location.hash || '#/').slice(1) || '/';
  function padre(r) {
    const p = r.split('/').filter(Boolean);
    if (p[0] === 'estante' && p.length > 2) return '/estante/' + p[1];
    if (p[0] === 'practica') return p[1] === 'repaso' ? '/simulacro' : '/estante/' + p[1];
    if (p[0] === 'simulacro' && p.length > 1) return '/simulacro';
    if (p[0] === 'sesion' && p.length > 1) return '/sesion';
    if (p[0] === 'reto' && retoPorId[p[1]]) return '/estante/' + retoPorId[p[1]].m + '/retos';
    return '/';
  }
  addEventListener('hashchange', () => {
    if (empujando) profundidad++;
    else if (!reemplazando) profundidad = Math.max(0, profundidad - 1);
    empujando = false; reemplazando = false;
    pintar();
  });

  const libro = $('#libro'), cuerpo = $('#libroCuerpo');
  function abrirLibro(kicker, titulo, html, opciones) {
    opciones = opciones || {};
    $('#libroKicker').textContent = kicker || '';
    $('#libroTitulo').textContent = titulo || '';
    const r = ruta(), mismaRuta = r === abrirLibro.ultima;
    abrirLibro.ultima = r;
    const y = cuerpo.scrollTop;
    cuerpo.classList.toggle('modo-visor', !!opciones.visor);
    cuerpo.innerHTML = '<div class="ancho">' + html + '</div>';
    cuerpo.scrollTop = (opciones.mantenerScroll && mismaRuta) ? y : 0;
    document.body.classList.add('leyendo');
    const inicio = !escenaOK && ruta() === '/';
    $('#btnVolver').style.visibility = inicio ? 'hidden' : 'visible';
    $('#btnCerrar').style.visibility = inicio ? 'hidden' : 'visible';
    if (libro.hidden) { libro.hidden = false; if (window.Escena && escenaOK) Escena.pausar(true); }
  }
  function cerrarLibro() {
    if (!libro.hidden) { libro.hidden = true; if (escenaOK) { Escena.pausar(false); Escena.quitarResaltado(); } }
    document.body.classList.remove('leyendo'); abrirLibro.ultima = null;
    detenerReloj();
  }

  function pintar() {
    const p = ruta().split('/').filter(Boolean);
    detenerReloj();
    cerrarProyeccion();
    if (window.Visor) Visor.cerrar();
    if (!p.length) { if (escenaOK) cerrarLibro(); else vistaCatalogo(); pintarDock(); return; }
    switch (p[0]) {
      case 'catalogo': return vistaCatalogo();
      case 'estante': {
        const m = MOD.find(x => x.id === +p[1]); if (!m) return reemplazar('/');
        if (m.bloqueado) return vistaEstanteBloqueado(m);
        if (p[2] === 'ficha') return vistaFicha(m, +p[3] || 0);
        if (p[2] === 'doc') return vistaDocumento(m, p[3], +p[4] || 1);
        return vistaEstante(m, p[2] || 'lectura');
      }
      case 'practica': { const mp = MOD.find(x => x.id === +p[1]); if (mp && mp.bloqueado) return reemplazar('/estante/' + mp.id); return vistaPractica(p[1]); }
      case 'simulacro':
        if (p[1] === 'examen') return vistaExamen();
        if (p[1] === 'resultado') return vistaResultado(p[2]);
        if (p[1] === 'revision') return vistaRevision(p[2], +p[3] || 0);
        if (p[1] === 'guia') return vistaGuia(+p[2] || 0);
        return vistaMesaSimulacro();
      case 'sesion':
        if (p[1]) return vistaSesion(+p[1]);
        return vistaMesaSesion();
      case 'ruta': return vistaRuta();
      case 'reto': return vistaReto(p[1]);
      case 'vitrina': return vistaVitrina();
      default: reemplazar('/');
    }
  }

  /* ───────── Catálogo ───────── */
  function vistaCatalogo() {
    const tarjeta = m => {
      if (m.bloqueado) return `<button class="ficha-idx bloqueada" data-ir="/estante/${m.id}"><span class="sig">Estante ${ROM[m.id]}<span class="candado-mini">${ICO_CANDADO}</span></span>
        <span class="nom">${esc(m.titulo)}</span><span class="det">Disponible en el curso completo.</span></button>`;
      const l = leidasDe(m), pr = E.practica[m.id], rs = retosDe(m.id), rsOk = rs.filter(superado).length;
      const avance = (l / m.fichas.length) * .4 + (rs.length ? rsOk / rs.length * .3 : 0) + (pr ? pr.mejor / 100 * .3 : 0);
      return `<button class="ficha-idx" data-ir="/estante/${m.id}"><span class="sig">Estante ${ROM[m.id]}${selloEstante(m.id) ? '<span class="sello-mini" title="Sello del estante">✦</span>' : ''}</span>
        <span class="nom">${esc(m.titulo)}</span>
        <span class="det">${l} de ${m.fichas.length} fichas leídas; retos ${rsOk} de ${rs.length}${pr ? `; práctica ${pr.mejor} %` : ''}</span>
        <div class="barra"><i style="width:${pct(avance)}%"></i></div></button>`;
    };
    const ex = E.examen;
    abrirLibro('Catálogo de la biblioteca', 'Mesas y estantes', `
      <p class="nota">Toca una ficha para abrirla. En la sala también puedes caminar hasta cada estante o mesa.</p>
      <h3 class="grupo-titulo">Mesas</h3>
      <div class="cajon">
        <button class="ficha-idx mesa" data-ir="/sesion"><span class="sig">Mesa uno</span><span class="nom">Sesión sincrónica</span>
          <span class="det">Diez encuentros en vivo con caso, agenda cronometrada y enlace a la videollamada.</span></button>
        <button class="ficha-idx mesa" data-ir="/simulacro"><span class="sig">Mesa dos</span><span class="nom">Simulacro</span>
          <span class="det">${ex ? 'Tienes un intento en curso.' : PRUEBA ? 'Simulacro diagnóstico de 10 preguntas.' : 'Simulacro diagnóstico de 10 preguntas y simulacro de la prueba escrita.'}</span></button>
        <button class="ficha-idx mesa" data-ir="/ruta"><span class="sig">Señalización</span><span class="nom">Ruta del curso</span>
          <span class="det">Video de la ruta del curso y orden recomendado para recorrer la biblioteca.</span></button>
        <button class="ficha-idx mesa" data-ir="/vitrina"><span class="sig">Vitrina</span><span class="nom">Logros y títulos</span>
          <span class="det">${totalEstrellas()} de ${RETOS.length * 3} estrellas; ${RETOS.filter(superado).length} de ${RETOS.length} retos superados.</span></button>
      </div>
      <h3 class="grupo-titulo">Estantes</h3>
      <div class="cajon">${MOD.map(tarjeta).join('')}</div>`);
  }

  /* ───────── Estante ───────── */
  function vistaEstante(m, pestana) {
    const tab = (id, txt) => `<button class="pestana" role="tab" aria-selected="${pestana === id}" data-reemplazar="/estante/${m.id}${id === 'lectura' ? '' : '/' + id}">${txt}</button>`;
    let html = `<div class="pestanas" role="tablist">${tab('lectura', 'Lectura')}${tab('retos', 'Retos')}${tab('claves', 'Claves')}${tab('practica', 'Práctica')}</div>`;
    if (pestana === 'retos') {
      html += htmlRetosEstante(m);
    } else if (pestana === 'claves') {
      html += `<h2>Claves para la prueba</h2><ul>${m.claves.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
        <div class="fuentes"><b>Fuentes del anexo:</b> ${m.fuentes.map(esc).join('; ')}.</div>`;
    } else if (pestana === 'practica') {
      const pr = E.practica[m.id], n = itemsDe(m.id).length;
      const ses = SES.find(s => s.m === m.id);
      html += `<h2>Práctica con retroalimentación</h2>
        <p>${n} preguntas de juicio situacional construidas desde el anexo. Al responder verás la clave, la justificación y la fuente normativa.</p>
        ${pr ? `<div class="indicadores"><div class="indicador"><span>Mejor</span><strong>${pr.mejor} %</strong></div><div class="indicador"><span>Último</span><strong>${pr.ultimo} %</strong></div><div class="indicador"><span>Intentos</span><strong>${pr.intentos}</strong></div></div>` : ''}
        <div class="acciones"><button class="btn ancho-total" data-acc="practicar" data-m="${m.id}">${pr ? 'Practicar de nuevo' : 'Practicar las ' + n + ' preguntas'}</button></div>
        ${ses ? `<p class="nota">Este estante se trabaja en vivo en la sesión ${ses.n}: <a href="#/sesion/${ses.n}">${esc(ses.titulo)}</a>.</p>` : ''}`;
    } else {
      const l = leidasDe(m), sig = m.fichas.findIndex((_, i) => !E.leidas[m.id + '-' + i]);
      html += `<p><i>${esc(m.proposito)}</i></p>
        ${htmlDocs(m)}
        <h3>Fichas de lectura</h3>
        <ol class="lomos">${m.fichas.map((f, i) => {
          const ok = E.leidas[m.id + '-' + i];
          return `<li class="lomo${ok ? ' leida' : ''}"><button data-ir="/estante/${m.id}/ficha/${i}"><span class="num">${i + 1}</span><span class="tt">${esc(f.t)}</span>${ok ? '<span class="ok">Leída</span>' : ''}</button></li>`;
        }).join('')}</ol>
        <div class="acciones"><button class="btn ancho-total" data-ir="/estante/${m.id}/ficha/${sig < 0 ? 0 : sig}">${l === 0 ? 'Empezar a leer' : sig < 0 ? 'Releer desde el inicio' : 'Continuar con la ficha ' + (sig + 1)}</button></div>
        ${retosDe(m.id).length ? `<div class="aviso-retos"><span>${ICO_RETO.emparejar}</span><p><b>Retos del estante.</b> ${retosDe(m.id).length} juegos cortos para afianzar lo que lees: superados ${retosDe(m.id).filter(superado).length} de ${retosDe(m.id).length}.</p><button class="btn sec" data-reemplazar="/estante/${m.id}/retos">Ir a los retos</button></div>` : ''}`;
    }
    abrirLibro('Estante ' + ROM[m.id], m.titulo, html);
  }

  function vistaEstanteBloqueado(m) {
    abrirLibro('Estante ' + ROM[m.id], m.titulo, `<p><i>${esc(m.proposito)}</i></p>
      ${htmlCursoCompleto()}
      <h3>Lo que encontrarás en este estante</h3>
      <ol class="lomos">${m.fichas.map((f, i) => `<li class="lomo bloqueado"><span class="lomo-fila"><span class="num">${i + 1}</span><span class="tt">${esc(f.t)}</span><span class="candado-mini">${ICO_CANDADO}</span></span></li>`).join('')}</ol>
      <p class="nota">Además: documento técnico completo, retos gamificados y preguntas de práctica con retroalimentación.</p>`);
  }

  function htmlDocs(m) {
    if (!m.docs || !m.docs.length) return '';
    return `<ul class="docs-lista">${m.docs.map(d => { const D = DOCS_INFO[d.d]; return `<li class="doc-ficha">
      <span class="doc-titulo">${esc(D.titulo)}</span>
      <span class="doc-det">${esc(D.autor)}. Abre en «${esc(d.s)}», página ${d.p} de ${D.paginas}.</span>
      <button class="btn" data-ir="/estante/${m.id}/doc/${d.d}/${d.p}">Ver contenido completo</button></li>`; }).join('')}</ul>`;
  }
  function vistaDocumento(m, id, pag) {
    const D = DOCS_INFO[id]; if (!D || !window.Visor) return reemplazar('/estante/' + m.id);
    abrirLibro(`Estante ${ROM[m.id]}, contenido completo`, D.corto || D.titulo, '<div id="visor"></div>', { visor: true });
    Visor.abrir($('#visor'), id, pag);
  }

  function vistaFicha(m, i) {
    i = Math.max(0, Math.min(m.fichas.length - 1, i));
    const f = m.fichas[i];
    if (!E.leidas[m.id + '-' + i]) { E.leidas[m.id + '-' + i] = Date.now(); guardar(); }
    sonar('pagina');
    const ult = i === m.fichas.length - 1;
    abrirLibro(`Estante ${ROM[m.id]}, ficha ${i + 1} de ${m.fichas.length}`, f.t, `
      <article class="pagina" style='${fondoMarca()}'>${f.c}
        <div class="folio"><span>${esc(m.corto)}</span><span>${i + 1} / ${m.fichas.length}</span></div></article>
      <div class="paginacion">
        <button class="btn sec" ${i === 0 ? 'disabled' : ''} data-reemplazar="/estante/${m.id}/ficha/${i - 1}">Página anterior</button>
        ${ult ? `<button class="btn" data-reemplazar="/estante/${m.id}/${retosDe(m.id).length ? 'retos' : 'practica'}">${retosDe(m.id).length ? 'Ir a los retos' : 'Ir a la práctica'}</button>` : `<button class="btn" data-reemplazar="/estante/${m.id}/ficha/${i + 1}">Siguiente página</button>`}
      </div>`);
  }

  /* ───────── Práctica (modo estudio) ───────── */
  let P = null;
  function iniciarPractica(clave) {
    let ids;
    if (clave === 'repaso') ids = ITEMS.filter(i => E.stats[i.id] && E.stats[i.id].u === 0).map(i => i.id);
    else ids = itemsDe(+clave).map(i => i.id);
    if (!ids.length) { aviso('No hay preguntas pendientes de repaso.'); return false; }
    ids = barajar(ids);
    P = { clave: String(clave), ids, i: 0, resp: {}, perm: {}, puntos: 0 };
    ids.forEach(id => (P.perm[id] = barajar([0, 1, 2, 3])));
    return true;
  }
  function credito(it, elegida) { if (elegida == null) return 0; return it.w ? it.w[elegida] : (elegida === it.k ? 1 : 0); }
  function registrarStat(it, c) {
    const s = E.stats[it.id] || { v: 0, a: 0, u: 0 };
    s.v++; s.a += c >= 1 ? 1 : 0; s.u = c >= 1 ? 1 : 0; E.stats[it.id] = s;
  }
  function htmlOpciones(it, perm, elegida, mostrar, accion) {
    return `<ul class="opciones" role="radiogroup">${perm.map((o, pos) => {
      let cls = '';
      if (mostrar) { if (o === it.k) cls = ' correcta'; else if (o === elegida) cls = ' errada'; }
      return `<li><button class="opcion${cls}" role="radio" aria-checked="${o === elegida}" ${mostrar ? 'disabled' : ''} data-acc="${accion}" data-o="${o}"><span class="let">${LETRAS[pos]}</span><span>${esc(it.o[o])}</span></button></li>`;
    }).join('')}</ul>`;
  }
  function htmlRetro(it, elegida, perm, simple) {
    const c = credito(it, elegida);
    const letraK = LETRAS[perm.indexOf(it.k)];
    const titulo = c >= 1 ? 'Respuesta correcta' : c > 0 ? `Respuesta aceptable, crédito ${String(c).replace('.', ',')}` : elegida == null ? 'Sin responder' : 'Respuesta incorrecta';
    return `<div class="retro${c >= 1 ? '' : ' mal'}"><h4>${titulo}</h4>
      ${c >= 1 ? '' : `<p>La opción más ajustada es la <b>${letraK}</b>.</p>`}
      <p>${esc(it.j)}</p><p class="src">Fuente: ${esc(it.f)}.${simple ? '' : ` Competencia: ${esc(COMP[it.c].nombre)}.`}</p></div>`;
  }
  function metaItem(it) {
    const dif = ['', 'baja', 'media', 'alta'][it.n];
    return `<span>${esc(COMP[it.c].area)}</span><span>Dificultad ${dif}</span><span>${esc(it.p)}</span>`;
  }
  function vistaPractica(clave) {
    if (!P || P.clave !== String(clave)) { if (!iniciarPractica(clave)) return volver(); }
    const titulo = clave === 'repaso' ? 'Repaso de mis errores' : MOD.find(m => m.id === +clave).titulo;
    if (P.i >= P.ids.length) return resumenPractica(titulo);
    const it = porId[P.ids[P.i]], el = P.resp[it.id], resp = el != null;
    abrirLibro(`Práctica, pregunta ${P.i + 1} de ${P.ids.length}`, titulo, `
      <div class="q-meta">${metaItem(it)}</div>
      <p class="q-ctx">${esc(it.ctx)}</p><p class="q-enun">${esc(it.q)}</p>
      ${htmlOpciones(it, P.perm[it.id], el, resp, 'resp-practica')}
      ${resp ? htmlRetro(it, el, P.perm[it.id]) : '<p class="nota">Elige una opción para ver la retroalimentación.</p>'}
      <div class="paginacion"><button class="btn" ${resp ? '' : 'disabled'} data-acc="sig-practica">${P.i === P.ids.length - 1 ? 'Ver resumen' : 'Siguiente pregunta'}</button></div>`, { mantenerScroll: resp });
  }
  function resumenPractica(titulo) {
    const n = P.ids.length, pts = P.ids.reduce((s, id) => s + credito(porId[id], P.resp[id]), 0);
    const nota = pct(pts / n);
    if (P.clave !== 'repaso' && !P.guardado) {
      P.guardado = true;
      const pr = E.practica[P.clave] || { mejor: 0, ultimo: 0, intentos: 0 };
      pr.intentos++; pr.ultimo = nota; pr.mejor = Math.max(pr.mejor, nota); E.practica[P.clave] = pr; guardar();
    }
    const errores = P.ids.filter(id => credito(porId[id], P.resp[id]) < 1);
    abrirLibro('Resumen de la práctica', titulo, `
      <div class="sello">${anillo(nota)}<div><div class="cifra">${nota} %</div><div class="leyenda">${pts.toFixed(1).replace('.', ',')} puntos de ${n} posibles</div></div></div>
      <h3>Para repasar</h3>
      ${errores.length ? `<ul>${errores.map(id => `<li>${esc(porId[id].q)} <span class="nota">(${esc(COMP[porId[id].c].nombre)})</span></li>`).join('')}</ul>` : '<p>Respondiste todo de la mejor manera. Pasa a otro estante o prueba el simulacro.</p>'}
      <div class="acciones"><button class="btn" data-acc="repetir-practica">Repetir práctica</button>
      <button class="btn sec" data-reemplazar="${P.clave === 'repaso' ? '/simulacro' : '/estante/' + P.clave}">${P.clave === 'repaso' ? 'Volver a la mesa' : 'Volver al estante'}</button></div>`);
    pintarDock();
  }
  function anillo(v, umbral) {
    const r = 46, c = 2 * Math.PI * r, ok = v >= (umbral == null ? E.config.umbral : umbral);
    return `<svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="${r}" fill="none" stroke="rgba(91,74,55,.18)" stroke-width="9"/>
      <circle cx="55" cy="55" r="${r}" fill="none" stroke="${ok ? '#3c6b47' : '#8e2a2a'}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 55 55)"/>
      <circle cx="55" cy="55" r="34" fill="none" stroke="#c39d52" stroke-width="1"/></svg>`;
  }

  /* ───────── Mesa de simulacro ───────── */
  const LARGOS = { 20: 30, 40: 60, 60: 90 };
  function vistaMesaSimulacro() {
    const ex = E.examen, errores = ITEMS.filter(i => E.stats[i.id] && E.stats[i.id].u === 0).length;
    const opcion = (n, nom) => `<li><button class="opcion" role="radio" aria-checked="${E.config.largo === n}" data-acc="largo" data-n="${n}"><span class="let">${n}</span><span><b>${nom}</b><br>${n} preguntas en ${LARGOS[n]} minutos</span></button></li>`;
    const diags = E.simulacros.filter(s => s.tipo === 'diag'), sims = E.simulacros.filter(s => s.tipo !== 'diag');
    abrirLibro('Mesa de simulacro', 'Simulacros', `
      ${ex ? `<div class="caso"><b>Tienes un ${ex.tipo === 'diag' ? 'simulacro diagnóstico' : 'simulacro'} en curso.</b> Pregunta ${ex.i + 1} de ${ex.ids.length}; quedan ${mmss(ex.fin - Date.now())}.
        <div class="acciones"><button class="btn" data-ir="/simulacro/examen">Continuar intento</button><button class="btn sec" data-acc="abandonar">Abandonar intento</button></div></div>` : ''}
      <h2>Simulacro diagnóstico</h2>
      <p>${DIAG.length} preguntas en ${DIAG_MIN} minutos. Al terminar verás en qué estantes conviene concentrarte.</p>
      ${diags.length ? `<ul class="lista-simple">${diags.slice(0, 3).map(s => `<li><button data-ir="/simulacro/resultado/${s.id}"><div class="fila-flex"><span>${fecha(s.fecha)}<br><span class="nota">Simulacro diagnóstico</span></span><strong>${s.directo}</strong></div></button></li>`).join('')}</ul>` : ''}
      <div class="acciones"><button class="btn ancho-total" data-acc="iniciar-diagnostico" ${ex ? 'disabled' : ''}>${diags.length ? 'Presentar de nuevo el diagnóstico' : 'Iniciar simulacro diagnóstico'}</button></div>
      <h2 class="separado">Simulacro de la prueba escrita</h2>
      ${PRUEBA ? htmlCursoCompleto('El simulacro de 20, 40 o 60 preguntas, con puntaje ponderado, habilidad estimada y perfil por competencias, hace parte del curso completo.') : `
      <h3>Elige la extensión</h3>
      <p class="nota">Las preguntas se toman de los diez estantes en proporción igual y con dificultad equilibrada. La parte final explora competencias comportamentales con crédito graduado.</p>
      <ul class="opciones" role="radiogroup">${opcion(20, 'Corto')}${opcion(40, 'Estándar')}${opcion(60, 'Completo')}</ul>
      <label class="campo" for="umbral">Umbral de referencia para comparar tu puntaje</label>
      <select class="campo" id="umbral" data-cambio="umbral">${[60, 65, 70, 75].map(u => `<option value="${u}" ${E.config.umbral === u ? 'selected' : ''}>${u} sobre 100</option>`).join('')}</select>
      <div class="acciones"><button class="btn ancho-total" data-acc="iniciar-simulacro" ${ex ? 'disabled' : ''}>Iniciar simulacro</button></div>`}
      <h3>Guía del examinado</h3>
      <ol class="lomos">${GUIA.fichas.map((f, i) => `<li class="lomo${E.leidas['g-' + i] ? ' leida' : ''}"><button data-ir="/simulacro/guia/${i}"><span class="num">${i + 1}</span><span class="tt">${esc(f.t)}</span></button></li>`).join('')}</ol>
      <h3>Repaso de errores</h3>
      <p>${errores ? `Tienes ${errores} preguntas cuya última respuesta no fue la mejor.` : 'Aún no hay errores registrados. Aparecerán aquí después de practicar.'}</p>
      ${errores ? '<div class="acciones"><button class="btn sec" data-acc="repaso">Repasar mis errores</button></div>' : ''}
      <h3>Historial</h3>
      ${sims.length ? `<ul class="lista-simple">${sims.map(s => `<li><button data-ir="/simulacro/resultado/${s.id}"><div class="fila-flex"><span>${fecha(s.fecha)}<br><span class="nota">${s.ids.length} preguntas</span></span><strong>${s.directo}</strong></div></button></li>`).join('')}</ul>` : '<p class="vacio">Tus simulacros terminados aparecerán aquí con su análisis.</p>'}`);
  }
  function vistaGuia(i) {
    i = Math.max(0, Math.min(GUIA.fichas.length - 1, i));
    E.leidas['g-' + i] = Date.now(); guardar(); sonar('pagina');
    const f = GUIA.fichas[i], ult = i === GUIA.fichas.length - 1;
    abrirLibro(`Guía del examinado, ficha ${i + 1} de ${GUIA.fichas.length}`, f.t, `<article class="pagina">${f.c}<div class="folio"><span>Guía del examinado</span><span>${i + 1} / ${GUIA.fichas.length}</span></div></article>
      <div class="paginacion"><button class="btn sec" ${i === 0 ? 'disabled' : ''} data-reemplazar="/simulacro/guia/${i - 1}">Página anterior</button>
      ${ult ? '<button class="btn" data-reemplazar="/simulacro">Volver a la mesa</button>' : `<button class="btn" data-reemplazar="/simulacro/guia/${i + 1}">Siguiente página</button>`}</div>`);
  }

  // Tabla de especificaciones: igual número por estante y dificultad equilibrada
  function armarSimulacro(N) {
    const porMod = Math.round(N / 10), p1 = [], p2 = [];
    MOD.forEach(m => {
      let pool = itemsDe(m.id);
      if (m.id === 10) pool = barajar(pool.filter(i => i.w)).concat(barajar(pool.filter(i => !i.w)));
      else {
        const niv = [1, 2, 3].map(n => barajar(pool.filter(i => i.n === n)));
        pool = []; let k = 0;
        while (niv.some(a => a.length)) { const a = niv[k % 3]; if (a.length) pool.push(a.shift()); k++; }
        pool = [pool[1], pool[0], pool[2]].filter(Boolean).concat(pool.slice(3));   // empieza por media
      }
      pool.slice(0, porMod).forEach(it => (it.w ? p2 : p1).push(it.id));
    });
    return barajar(p1).concat(barajar(p2));
  }
  function iniciarSimulacro() {
    const N = E.config.largo, ids = armarSimulacro(N), perm = {};
    ids.forEach(id => (perm[id] = barajar([0, 1, 2, 3])));
    const ahora = Date.now();
    E.examen = { id: 's' + ahora, inicio: ahora, fin: ahora + LARGOS[N] * 60000, dur: LARGOS[N], ids, perm, resp: {}, marcas: {}, i: 0, mapa: false };
    guardar();
    ir('/simulacro/examen');
  }

  function iniciarDiagnostico() {
    const ids = DIAG.filter(id => porId[id]), perm = {};
    ids.forEach(id => (perm[id] = barajar([0, 1, 2, 3])));
    const ahora = Date.now();
    E.examen = { id: 'd' + ahora, tipo: 'diag', inicio: ahora, fin: ahora + DIAG_MIN * 60000, dur: DIAG_MIN, ids, perm, resp: {}, marcas: {}, i: 0, mapa: false };
    guardar();
    ir('/simulacro/examen');
  }

  /* ───────── Examen ───────── */
  let tic = 0;
  function detenerReloj() { if (tic) { clearInterval(tic); tic = 0; } }
  function vistaExamen() {
    const ex = E.examen;
    if (!ex) return reemplazar('/simulacro');
    if (Date.now() >= ex.fin) return terminarExamen(true);
    const it = porId[ex.ids[ex.i]], el = ex.resp[it.id];
    const nP1 = ex.ids.filter(id => !porId[id].w).length;
    const parte = it.w ? 'Parte 2. Competencias comportamentales' : 'Parte 1. Conocimientos específicos y pedagógicos';
    const respondidas = Object.keys(ex.resp).length;
    const mapa = ex.mapa ? `<div class="mapa" role="group" aria-label="Mapa de preguntas">${ex.ids.map((id, k) =>
      `<button class="${ex.resp[id] != null ? 'resp' : ''}${ex.marcas[id] ? ' marc' : ''}${k === ex.i ? ' actual' : ''}" data-acc="saltar" data-k="${k}" aria-label="Pregunta ${k + 1}">${k + 1}</button>`).join('')}</div>
      <p class="nota">Respondidas: ${respondidas} de ${ex.ids.length}. El punto rojo indica pregunta marcada.</p>` : '';
    const diag = ex.tipo === 'diag';
    abrirLibro(diag ? 'Simulacro diagnóstico' : 'Simulacro en curso', `Pregunta ${ex.i + 1} de ${ex.ids.length}`, `
      <div class="examen-barra"><span class="reloj" id="reloj">${mmss(ex.fin - Date.now())}</span>
        <span><button class="btn sec" data-acc="mapa" aria-expanded="${!!ex.mapa}">Mapa</button> <button class="btn lacre" data-acc="terminar">Terminar</button></span></div>
      ${mapa}
      ${diag ? '' : `<p class="parte">${parte}${it.w ? '' : ` (${nP1} preguntas)`}</p>`}
      <div class="q-meta"><b>Pregunta ${ex.i + 1}</b><span>${el != null ? 'Respondida' : 'Sin responder aún'}</span>${diag ? '' : `<span>${it.w ? 'Crédito graduado' : 'Puntúa como 1,00'}</span>`}
        <button class="marcar" data-acc="marcar" aria-pressed="${!!ex.marcas[it.id]}">${ex.marcas[it.id] ? 'Quitar marca' : 'Marcar pregunta'}</button></div>
      <p class="q-ctx">${esc(it.ctx)}</p><p class="q-enun">${esc(it.q)}</p>
      ${htmlOpciones(it, ex.perm[it.id], el, false, 'resp-examen')}
      <div class="paginacion">
        <button class="btn sec" ${ex.i === 0 ? 'disabled' : ''} data-acc="ant">Página anterior</button>
        ${ex.i === ex.ids.length - 1 ? '<button class="btn" data-acc="terminar">Terminar intento</button>' : '<button class="btn" data-acc="sig">Siguiente página</button>'}
      </div>`, { mantenerScroll: true });
    tic = setInterval(() => {
      const r = $('#reloj'); if (!r || !E.examen) return detenerReloj();
      const q = E.examen.fin - Date.now();
      r.textContent = mmss(q); r.classList.toggle('urgente', q < 300000);
      if (q <= 0) { detenerReloj(); terminarExamen(true); }
    }, 1000);
  }
  function confirmarTerminar() {
    const ex = E.examen, sin = ex.ids.filter(id => ex.resp[id] == null).length, marc = Object.keys(ex.marcas).filter(k => ex.marcas[k]).length;
    detenerReloj();
    abrirLibro(ex.tipo === 'diag' ? 'Simulacro diagnóstico' : 'Simulacro en curso', 'Resumen del intento', `
      <p>Respondiste <b>${ex.ids.length - sin}</b> de ${ex.ids.length} preguntas.${sin ? ` Quedan <b>${sin}</b> sin responder; en blanco puntúan cero.` : ''}${marc ? ` Tienes ${marc} marcadas para revisar.` : ''}</p>
      <p class="nota">Tiempo restante: ${mmss(ex.fin - Date.now())}.</p>
      <div class="acciones"><button class="btn sec" data-acc="volver-examen">Volver al intento</button><button class="btn lacre" data-acc="enviar">Enviar todo y terminar</button></div>`);
  }

  // Calificación: directo, ponderado por dificultad y habilidad EAP (modelo de Rasch)
  const B = { 1: -1, 2: 0, 3: 1 };
  function calificar(r) {
    let pts = 0, pond = 0, pondMax = 0;
    const comp = {}, area = {}, mod = {};
    r.ids.forEach(id => {
      const it = porId[id], c = credito(it, r.resp[id]);
      pts += c; pond += c * it.n; pondMax += it.n;
      const ac = (o, k) => { o[k] = o[k] || { s: 0, n: 0 }; o[k].s += c; o[k].n++; };
      ac(comp, it.c); ac(area, COMP[it.c].area); ac(mod, it.m);
    });
    let num = 0, den = 0;
    for (let th = -4; th <= 4.0001; th += .1) {
      let L = Math.exp(-th * th / 2);
      r.ids.forEach(id => { const it = porId[id], p = 1 / (1 + Math.exp(-(th - B[it.n]))); L *= (r.resp[id] === it.k) ? p : 1 - p; });
      num += th * L; den += L;
    }
    return { directo: pct(pts / r.ids.length), ponderado: pct(pond / pondMax), theta: den ? num / den : 0, comp, area, mod, pts };
  }
  function terminarExamen(porTiempo) {
    const ex = E.examen; if (!ex) return;
    const r = { id: ex.id, tipo: ex.tipo || 'sim', fecha: Date.now(), ids: ex.ids, perm: ex.perm, resp: ex.resp, usado: Math.min(Date.now(), ex.fin) - ex.inicio, dur: ex.dur };
    const cal = calificar(r);
    r.directo = cal.directo; r.ponderado = cal.ponderado; r.theta = +cal.theta.toFixed(2);
    ex.ids.forEach(id => registrarStat(porId[id], credito(porId[id], ex.resp[id])));
    E.simulacros.unshift(r); E.simulacros = E.simulacros.slice(0, 30);
    E.examen = null; guardar(); pintarDock();
    if (porTiempo) aviso('Se agotó el tiempo. El intento se envió automáticamente.');
    reemplazar('/simulacro/resultado/' + r.id);
  }

  function filaPerfil(nombre, o, extra) {
    const v = pct(o.s / o.n);
    return `<div class="perfil-fila"><span>${nombre}${extra || ''}</span><em>${v}</em><div class="barra"><i class="${v < E.config.umbral ? 'bajo' : ''}" style="width:${v}%"></i></div></div>`;
  }
  function vistaResultado(id) {
    const r = E.simulacros.find(s => s.id === id); if (!r) return reemplazar('/simulacro');
    if (r.tipo === 'diag') return vistaResultadoDiag(r);
    const cal = calificar(r), ok = cal.directo >= E.config.umbral;
    const compOrden = Object.keys(cal.comp).sort((a, b) => cal.comp[a].s / cal.comp[a].n - cal.comp[b].s / cal.comp[b].n);
    const th = Math.max(-3, Math.min(3, cal.theta));
    const nivelTh = th < -1 ? 'en desarrollo' : th < 0 ? 'básico' : th < 1 ? 'competente' : 'avanzado';
    abrirLibro(fecha(r.fecha), 'Resultado del simulacro', `
      <div class="sello">${anillo(cal.directo)}<div><div class="cifra">${cal.directo}</div>
        <div class="leyenda">Puntaje directo sobre 100. ${ok ? 'Está por encima' : 'Está por debajo'} del umbral de referencia de ${E.config.umbral}.</div></div></div>
      <div class="indicadores">
        <div class="indicador"><span>Ponderado</span><strong>${cal.ponderado}</strong></div>
        <div class="indicador"><span>Habilidad θ</span><strong>${cal.theta.toFixed(2).replace('.', ',')}</strong></div>
        <div class="indicador"><span>Tiempo usado</span><strong>${mmss(r.usado)}</strong></div></div>
      <h3>Habilidad estimada</h3>
      <div class="theta" role="img" aria-label="Habilidad ${nivelTh}"><i style="left:${(th + 3) / 6 * 100}%"></i></div>
      <div class="theta-esc"><span>−3</span><span>0</span><span>+3</span></div>
      <p class="nota">Nivel ${nivelTh}. Estimación tipo Rasch con dificultades a priori; sirve para comparar tus intentos entre sí.</p>
      <h3>Por área de gestión</h3><div class="perfil">${Object.keys(cal.area).map(a => filaPerfil(esc(a), cal.area[a])).join('')}</div>
      <h3>Por competencia, de menor a mayor</h3><div class="perfil">${compOrden.map(c => filaPerfil(esc(COMP[c].nombre), cal.comp[c], ` <span class="nota">(${cal.comp[c].n})</span>`)).join('')}</div>
      <h3>Por estante</h3><div class="perfil">${Object.keys(cal.mod).map(m => filaPerfil(`<a href="#/estante/${m}">${ROM[m]}. ${esc(MOD[m - 1].corto)}</a>`, cal.mod[m])).join('')}</div>
      <h3>Mapa de respuestas</h3>
      <div class="mapa">${r.ids.map((iid, k) => { const c = credito(porId[iid], r.resp[iid]); return `<button class="${c >= 1 ? 'ok' : 'mal'}" data-ir="/simulacro/revision/${r.id}/${k}" aria-label="Revisar pregunta ${k + 1}">${k + 1}</button>`; }).join('')}</div>
      <div class="acciones"><button class="btn" data-ir="/simulacro/revision/${r.id}/0">Revisar respuestas</button><button class="btn sec" data-reemplazar="/simulacro">Volver a la mesa</button></div>`);
  }
  function vistaResultadoDiag(r) {
    const cal = calificar(r), pts = String(+cal.pts.toFixed(1)).replace('.', ',');
    const debiles = Object.keys(cal.mod).filter(m => cal.mod[m].s < cal.mod[m].n).map(Number).sort((a, b) => a - b);
    abrirLibro(fecha(r.fecha), 'Resultado del diagnóstico', `
      <div class="sello">${anillo(cal.directo)}<div><div class="cifra">${cal.directo}</div>
        <div class="leyenda">Puntaje sobre 100: ${pts} de ${r.ids.length} puntos posibles, en ${mmss(r.usado)}.</div></div></div>
      <h3>Estantes para reforzar</h3>
      ${debiles.length ? `<ul class="lista-simple">${debiles.map(m => `<li><button data-ir="/estante/${m}"><div class="fila-flex"><span>Estante ${ROM[m]}<br>${esc(MOD[m - 1].titulo)}</span><strong>›</strong></div></button></li>`).join('')}</ul>`
        : '<p>Respondiste bien las diez preguntas. Pasa al simulacro de la prueba escrita para medir tu avance completo.</p>'}
      <h3>Mapa de respuestas</h3>
      <div class="mapa">${r.ids.map((iid, k) => { const c = credito(porId[iid], r.resp[iid]); return `<button class="${c >= 1 ? 'ok' : 'mal'}" data-ir="/simulacro/revision/${r.id}/${k}" aria-label="Revisar pregunta ${k + 1}">${k + 1}</button>`; }).join('')}</div>
      <div class="acciones"><button class="btn" data-ir="/simulacro/revision/${r.id}/0">Revisar respuestas</button><button class="btn sec" data-reemplazar="/simulacro">Volver a la mesa</button></div>`);
  }
  function vistaRevision(id, k) {
    const r = E.simulacros.find(s => s.id === id); if (!r) return reemplazar('/simulacro');
    k = Math.max(0, Math.min(r.ids.length - 1, k));
    const it = porId[r.ids[k]], el = r.resp[it.id];
    const diag = r.tipo === 'diag';
    abrirLibro(diag ? 'Revisión del diagnóstico' : 'Revisión del simulacro', `Pregunta ${k + 1} de ${r.ids.length}`, `
      ${diag ? '' : `<div class="q-meta">${metaItem(it)}</div>`}
      <p class="q-ctx">${esc(it.ctx)}</p><p class="q-enun">${esc(it.q)}</p>
      ${htmlOpciones(it, r.perm[it.id], el, true, '')}
      ${htmlRetro(it, el, r.perm[it.id], diag)}
      <div class="paginacion"><button class="btn sec" ${k === 0 ? 'disabled' : ''} data-reemplazar="/simulacro/revision/${id}/${k - 1}">Anterior</button>
      ${k === r.ids.length - 1 ? `<button class="btn" data-reemplazar="/simulacro/resultado/${id}">Ver resultado</button>` : `<button class="btn" data-reemplazar="/simulacro/revision/${id}/${k + 1}">Siguiente</button>`}</div>`);
  }

  /* ───────── Retos gamificados ───────── */
  const ICO_RETO = {
    emparejar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v2.2a2 2 0 103.6 0V4H20v6h-2.2a2 2 0 100 3.6H20V20h-6v-2.2a2 2 0 10-3.6 0V20H4v-6h2.2a2 2 0 100-3.6H4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    ordenar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.6"/><text x="2.5" y="8.2" font-size="6.5" fill="currentColor" font-family="serif">1</text><text x="2.5" y="14.2" font-size="6.5" fill="currentColor" font-family="serif">2</text><text x="2.5" y="20.2" font-size="6.5" fill="currentColor" font-family="serif">3</text></svg>',
    flujo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v2.5M12 9.5l4 3-4 3-4-3z M8 12.5H4v5M16 12.5h4v5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><rect x="1.5" y="17.5" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="16.5" y="17.5" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    clasificar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="13" width="18" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 7.5h4M10 16.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    veredicto: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    decisiones: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5V19a1 1 0 001 1h16a1 1 0 001-1V8.5a1 1 0 00-1-1h-8.5L9.8 5H4a1 1 0 00-1 1.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 12.5h8M8 16h5" stroke="currentColor" stroke-width="1.5"/></svg>'
  };
  const MEDALLA = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 2h8l4 14-6 4zM44 2h-8l-4 14 6 4z" fill="#2c5d4a"/><circle cx="32" cy="38" r="22" fill="#8e2a2a"/><circle cx="32" cy="38" r="17" fill="none" stroke="#e2c47f" stroke-width="1.5" stroke-dasharray="2 2.5"/><path d="M32 26l3.4 7 7.6.9-5.6 5.2 1.5 7.5L32 42.9l-6.9 3.7 1.5-7.5-5.6-5.2 7.6-.9z" fill="#e2c47f"/></svg>';

  function htmlRetosEstante(m) {
    const rs = retosDe(m.id); if (!rs.length) return '<p class="vacio">Este estante aún no tiene retos.</p>';
    const l = leidasDe(m);
    return `<h2>Retos del estante</h2>
      <p>Juegos cortos para afianzar lo que lees. Supera cada nivel con ${APRUEBA} % o más para desbloquear el siguiente y ganar un título temporal.</p>
      ${l < m.fichas.length ? `<p class="nota">Te recomendamos leer las fichas antes de jugar: llevas ${l} de ${m.fichas.length}.</p>` : ''}
      <ol class="retos-lista">${rs.map(r => {
        const ab = retoAbierto(r), st = E.retos[r.id], tv = E.titulos[r.titulo];
        return `<li class="reto-carta${ab ? '' : ' bloqueado'}${st && st.mejor >= APRUEBA ? ' superado' : ''}"><button data-acc="abrir-reto" data-id="${r.id}" ${ab ? '' : 'disabled'}>
          <span class="reto-ico">${ab ? ICO_RETO[r.tipo] : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'}</span>
          <span class="reto-txt"><span class="reto-niv">Nivel ${r.nivel} · ${MECANICA[r.tipo]}</span>
            <span class="reto-nom">${esc(r.nombre)}</span>
            <span class="reto-det">${ab ? (st ? `Mejor resultado ${st.mejor} %, ${st.intentos} ${st.intentos === 1 ? 'intento' : 'intentos'}` : esc(r.resumen)) : `Supera el nivel ${r.nivel - 1} para abrirlo.`}</span>
            <span class="reto-premio">Título: «${esc(r.titulo)}»${tv ? (Date.now() - tv < VIGENCIA ? `, vigente ${diasRestantes(tv)} ${diasRestantes(tv) === 1 ? 'día' : 'días'} más` : ', vencido: vuelve a superarlo para renovarlo') : ''}</span></span>
          ${htmlEstrellas(st ? st.estrellas || 0 : 0)}</button></li>`;
      }).join('')}</ol>
      ${selloEstante(m.id) ? `<div class="sello-estante">${MEDALLA}<p><b>Sello del estante ${ROM[m.id]}</b><br>Superaste todos los retos de este estante.</p></div>` : ''}`;
  }

  let G = null;
  function iniciarReto(r) {
    const idx = n => Array.from({ length: n }, (_, i) => i);
    G = { id: r.id, r, t0: Date.now() };
    if (r.tipo === 'emparejar') Object.assign(G, { orden: barajar(idx(r.pares.length)), chips: barajar(idx(r.pares.length)), hecho: {}, int: {}, selS: null, selR: null, msg: null });
    else if (r.tipo === 'ordenar') Object.assign(G, { f: 0, perm: barajar(idx(r.fases[0].items.length)), asig: [], ok: false, pts: [] });
    else if (r.tipo === 'flujo') { const sl = []; recorrer(r.diagrama, n => { if (n.k === 'hueco') sl.push(n.id); }); Object.assign(G, { slots: sl, puesto: {}, sel: sl[0], banco: barajar(r.cartas.map(c => c.id)), ok: false }); }
    else if (r.tipo === 'clasificar' || r.tipo === 'veredicto') Object.assign(G, { orden: barajar(idx(r.cartas.length)), i: 0, resp: {}, racha: 0, max: 0, limite: 0, limiteI: -1 });
    else if (r.tipo === 'decisiones') Object.assign(G, { i: 0, perm: r.escenas.map(e => barajar(idx(e.o.length))), resp: {} });
  }
  function recorrer(lista, fn) { lista.forEach(n => { fn(n); if (n.k === 'rama') { fn(n.d); recorrer(n.si, fn); recorrer(n.no, fn); } }); }

  function vistaReto(id) {
    const r = retoPorId[id]; if (!r) return reemplazar('/');
    if (!retoAbierto(r)) { aviso('Supera el nivel anterior para abrir este reto.'); return reemplazar('/estante/' + r.m + '/retos'); }
    if (!G || G.id !== id) iniciarReto(r);
    if (G.fin) return resultadoReto(r);
    if (r.tipo === 'veredicto' && G.resp[G.i] == null && G.limiteI !== G.i) { G.limite = Date.now() + r.tiempo * 1000; G.limiteI = G.i; }
    const cuerpoReto = { emparejar: htmlEmparejar, ordenar: htmlOrdenar, flujo: htmlFlujo, clasificar: htmlMazo, veredicto: htmlMazo, decisiones: htmlDecisiones }[r.tipo](r);
    abrirLibro(`Estante ${ROM[r.m]}, reto de nivel ${r.nivel}`, r.nombre, `<div class="reto reto-${r.tipo}">${cuerpoReto}</div>`, { mantenerScroll: true });
    if (r.tipo === 'veredicto' && G.resp[G.i] == null) relojVeredicto(r);
  }
  const intro = r => `<p class="reto-intro">${esc(r.intro)}</p>`;

  /* Rompecabezas: cada pareja correcta destapa una pieza de la imagen */
  function htmlEmparejar(r) {
    const n = r.pares.length, cols = n <= 4 ? 2 : n <= 6 ? 3 : 4, filas = Math.ceil(n / cols), hechos = Object.keys(G.hecho).length, completo = hechos === n;
    const fichas = [];
    for (let k = 0; k < cols * filas; k++) {
      const i = G.orden[k], abierta = i == null || G.hecho[i] || completo, c = k % cols, f = Math.floor(k / cols);
      const pos = `${cols > 1 ? c / (cols - 1) * 100 : 0}% ${filas > 1 ? f / (filas - 1) * 100 : 0}%`;
      fichas.push(`<span class="pieza${abierta ? ' abierta' : ''}${i != null && i === G.nueva ? ' nueva' : ''}" style="background-size:${cols * 100}% ${filas * 100}%;background-position:${pos}">${abierta ? '' : k + 1}</span>`);
    }
    const tablero = `<div class="puzzle-marco"><div class="puzzle${completo ? ' completo' : ''}" style="grid-template-columns:repeat(${cols},1fr)">${fichas.join('')}</div></div>`;
    G.nueva = null;
    if (completo) return `${tablero}<div class="retro"><h4>¡Rompecabezas completo!</h4><p>Uniste las ${n} parejas.</p></div>
      <div class="acciones"><button class="btn ancho-total" data-acc="reto-terminar">Ver resultado</button></div>`;
    const msg = G.msg ? `<div class="reto-msg ${G.msg.ok ? 'bien' : 'mal'}" role="status">${esc(G.msg.t)}</div>` : `<div class="reto-msg" role="status">${G.selS != null ? 'Ahora toca la norma o ruta que le corresponde.' : G.selR != null ? 'Ahora toca la situación que le corresponde.' : 'Toca una situación y luego su norma o ruta.'}</div>`;
    return `${intro(r)}${tablero}<p class="nota">${hechos} de ${n} piezas colocadas.</p>
      <ol class="parejas">${G.orden.map((i, k) => `<li><button class="pareja${G.hecho[i] ? ' hecha' : ''}${G.selS === i ? ' sel' : ''}" data-acc="reto-s" data-i="${i}" ${G.hecho[i] ? 'disabled' : ''} aria-pressed="${G.selS === i}">
        <span class="pz-num">${k + 1}</span><span class="pz-txt">${esc(r.pares[i].s)}${G.hecho[i] ? `<span class="pareja-r">${esc(r.pares[i].r)}</span>` : ''}</span></button></li>`).join('')}</ol>
      <div class="bandeja">${msg}<div class="chips">${G.chips.filter(i => !G.hecho[i]).map(i => `<button class="chip${G.selR === i ? ' sel' : ''}" data-acc="reto-r" data-i="${i}" aria-pressed="${G.selR === i}">${esc(r.pares[i].r)}</button>`).join('')}</div></div>`;
  }
  function probarPareja(r) {
    if (G.selS == null || G.selR == null) return;
    const s = G.selS, q = G.selR;
    G.int[s] = (G.int[s] || 0) + 1;
    if (s === q) { G.hecho[s] = true; G.nueva = s; G.msg = { ok: true, t: 'Correcto. ' + r.pares[s].j }; G.selS = G.selR = null; sonar('bien'); }
    else { G.msg = { ok: false, t: `«${r.pares[q].r}» ${r.pares[q].d}. No corresponde a esa situación.` }; G.selR = null; sonar('mal'); }
  }
  const puntajeEmparejar = r => r.pares.reduce((s, _, i) => s + (G.int[i] === 1 ? 1 : G.int[i] === 2 ? .5 : 0), 0) / r.pares.length;

  /* Prioridades: se tocan las acciones en el orden elegido; se califica la concordancia por pares */
  function htmlOrdenar(r) {
    const F = r.fases[G.f], n = F.items.length;
    const cab = `${G.f === 0 ? intro(r) : ''}${r.fases.length > 1 ? `<p class="fase">Fase ${G.f + 1} de ${r.fases.length}</p>` : ''}<p class="q-enun">${esc(F.p)}</p>`;
    if (!G.ok) return `${cab}
      <ul class="orden-lista">${G.perm.map(i => { const pos = G.asig.indexOf(i); return `<li><button class="orden-item${pos >= 0 ? ' asignado' : ''}" data-acc="reto-ord" data-i="${i}"><span class="orden-num">${pos >= 0 ? pos + 1 : ''}</span><span>${esc(F.items[i].x)}</span></button></li>`; }).join('')}</ul>
      <p class="nota">Toca las acciones en el orden en que las harías. Toca otra vez una acción para quitarla.</p>
      <div class="acciones"><button class="btn sec" data-acc="reto-ord-limpiar" ${G.asig.length ? '' : 'disabled'}>Empezar de nuevo</button><button class="btn" data-acc="reto-ord-comprobar" ${G.asig.length === n ? '' : 'disabled'}>Comprobar orden</button></div>`;
    const p = G.pts[G.f], ult = G.f === r.fases.length - 1;
    return `${cab}<div class="retro${p >= 1 ? '' : ' mal'}"><h4>${p >= 1 ? 'Orden correcto' : `Orden ${pct(p)} % ajustado`}</h4><p>${p >= 1 ? 'Ubicaste cada acción en su lugar.' : 'Así es el orden adecuado y la razón de cada paso:'}</p></div>
      <ol class="orden-resuelto">${F.items.map((it, i) => { const tu = G.asig.indexOf(i); return `<li class="${tu === i ? 'ok' : 'mal'}"><b>${esc(it.x)}</b>${tu === i ? '' : `<span class="nota"> Tú la pusiste en el lugar ${tu + 1}.</span>`}<br><span class="porque">${esc(it.j)}</span></li>`; }).join('')}</ol>
      <div class="acciones"><button class="btn ancho-total" data-acc="${ult ? 'reto-terminar' : 'reto-fase'}">${ult ? 'Ver resultado' : 'Siguiente fase'}</button></div>`;
  }
  function concordancia(asig) {
    let bien = 0, tot = 0;
    for (let a = 0; a < asig.length; a++) for (let b = a + 1; b < asig.length; b++) { tot++; if (asig[a] < asig[b]) bien++; }
    return tot ? bien / tot : 1;
  }

  /* Diagrama de flujo: recuadros vacíos que se completan con tarjetas, incluidas tarjetas distractoras */
  function htmlFlujo(r) {
    const carta = id => r.cartas.find(c => c.id === id);
    const llenos = G.slots.filter(s => G.puesto[s]).length, todos = llenos === G.slots.length;
    const nodo = n => {
      if (n.k === 'rama') return `${nodo(n.d)}<div class="rama"><div class="rama-camino"><span class="rama-et si">Sí</span>${lista(n.si)}</div><div class="rama-camino"><span class="rama-et no">No</span>${lista(n.no)}</div></div>`;
      if (n.k === 'hueco') {
        const c = G.puesto[n.id], forma = n.forma || 'paso';
        let est = '', extra = '';
        if (G.ok) { const bien = r.solucion[n.id] === c; est = bien ? ' ok' : ' mal'; if (!bien) extra = `<div class="fl-correccion"><b>Va aquí:</b> ${esc(carta(r.solucion[n.id]).x)}.<br>${esc(carta(c).j)}</div>`; }
        return `<button class="fl-nodo fl-${forma} hueco${c ? ' lleno' : ''}${G.sel === n.id && !G.ok ? ' sel' : ''}${est}" data-acc="reto-hueco" data-id="${n.id}" ${G.ok ? 'disabled' : ''}>${c ? esc(carta(c).x) : (forma === 'decision' ? '¿…? Toca para elegir la pregunta' : 'Toca para completar')}</button>${extra}`;
      }
      return `<div class="fl-nodo fl-${n.k}">${esc(n.x)}</div>`;
    };
    const lista = arr => arr.map(nodo).join('<span class="fl-flecha" aria-hidden="true"></span>');
    const diagrama = `<div class="flujo">${lista(r.diagrama)}</div>`;
    if (G.ok) {
      const bien = G.slots.filter(s => r.solucion[s] === G.puesto[s]).length;
      return `${diagrama}<div class="retro${bien === G.slots.length ? '' : ' mal'}"><h4>${bien} de ${G.slots.length} recuadros correctos</h4><p>${bien === G.slots.length ? 'El diagrama quedó completo y bien armado.' : 'Revisa las correcciones en los recuadros marcados.'}</p></div>
        <div class="acciones"><button class="btn ancho-total" data-acc="reto-terminar">Ver resultado</button></div>`;
    }
    const libres = G.banco.filter(id => !Object.values(G.puesto).includes(id));
    const selLleno = G.sel && G.puesto[G.sel];
    return `${intro(r)}${diagrama}
      <div class="bandeja"><div class="reto-msg" role="status">${todos ? 'Diagrama completo. Revisa y comprueba.' : G.sel ? 'Elige la tarjeta para el recuadro marcado.' : 'Toca un recuadro vacío.'} <span class="nota">${llenos} de ${G.slots.length}</span></div>
        <div class="chips">${libres.map(id => `<button class="chip carta-flujo" data-acc="reto-carta" data-id="${id}" ${G.sel ? '' : 'disabled'}>${esc(carta(id).x)}</button>`).join('')}</div>
        <div class="acciones">${selLleno ? '<button class="btn sec" data-acc="reto-quitar">Quitar tarjeta</button>' : ''}<button class="btn" data-acc="reto-flujo-comprobar" ${todos ? '' : 'disabled'}>Comprobar diagrama</button></div></div>`;
  }

  /* Fichero y contrarreloj: una carta a la vez; se archiva en un cajón */
  function htmlMazo(r) {
    const n = r.cartas.length, ci = G.orden[G.i], c = r.cartas[ci], resp = G.resp[G.i], ver = r.tipo === 'veredicto';
    const cuenta = r.cajones.map((_, b) => Object.keys(G.resp).filter(k => G.resp[k] === b && r.cartas[G.orden[k]].b === b).length);
    const cab = `${G.i === 0 && resp == null ? intro(r) : ''}<div class="mazo-cab"><span>Carta ${G.i + 1} de ${n}</span><span class="racha${G.racha >= 3 ? ' viva' : ''}">Racha ${G.racha}</span></div>
      ${ver ? `<div class="tiempo" aria-hidden="true"><i id="tiempoBarra" style="width:${resp == null ? Math.max(0, (G.limite - Date.now()) / (r.tiempo * 1000) * 100) : 0}%"></i></div>` : ''}
      <div class="carta-fichero${resp != null ? (resp === c.b ? ' ok' : ' mal') : ' nueva'}"><span class="carta-num">№ ${G.i + 1}</span><p>${esc(c.x)}</p></div>`;
    if (resp == null) return `${cab}<div class="cajones n${r.cajones.length}">${r.cajones.map((cj, b) => `<button class="cajon-btn" data-acc="reto-cajon" data-b="${b}"><span class="tirador" aria-hidden="true"></span><span class="cajon-nom">${esc(cj)}</span>${ver ? '' : `<small>${cuenta[b]} archivadas</small>`}</button>`).join('')}</div>`;
    const ok = resp === c.b;
    return `${cab}<div class="retro${ok ? '' : ' mal'}"><h4>${ok ? (ver ? 'Correcto' : 'Bien archivada') : resp === -1 ? 'Se acabó el tiempo' : (ver ? 'Incorrecto' : 'Ese no es su cajón')}</h4>
      ${ok || ver ? '' : `<p>Va en el cajón <b>${esc(r.cajones[c.b])}</b>.</p>`}<p>${esc(c.j)}</p></div>
      <div class="acciones"><button class="btn ancho-total" data-acc="reto-sig">${G.i === n - 1 ? 'Ver resultado' : 'Siguiente carta'}</button></div>`;
  }
  function responderMazo(r, b) {
    if (G.resp[G.i] != null) return;
    G.resp[G.i] = b;
    const ok = b === r.cartas[G.orden[G.i]].b;
    G.racha = ok ? G.racha + 1 : 0; G.max = Math.max(G.max, G.racha);
    sonar(ok ? 'bien' : 'mal');
  }
  function relojVeredicto(r) {
    detenerReloj();
    tic = setInterval(() => {
      const barra = $('#tiempoBarra'); if (!barra || !G || G.resp[G.i] != null) return detenerReloj();
      const q = G.limite - Date.now();
      barra.style.width = Math.max(0, q / (r.tiempo * 1000) * 100) + '%';
      barra.classList.toggle('urgente', q < 6000);
      if (q <= 0) { detenerReloj(); responderMazo(r, -1); pintar(); }
    }, 200);
  }
  const puntajeMazo = r => r.cartas.reduce((s, _, k) => s + (G.resp[k] === r.cartas[G.orden[k]].b ? 1 : 0), 0) / r.cartas.length;

  /* Expediente: escenas con consecuencias y crédito graduado */
  const NIVEL_W = w => w >= 1 ? 'Mejor decisión' : w >= .6 ? 'Decisión aceptable' : w > 0 ? 'Decisión poco adecuada' : 'Decisión inadecuada';
  function htmlDecisiones(r) {
    const e = r.escenas[G.i], el = G.resp[G.i], resp = el != null, n = r.escenas.length;
    const mejor = e.o.reduce((b, o, k) => (o.w > e.o[b].w ? k : b), 0);
    return `${G.i === 0 && !resp ? intro(r) : ''}<p class="fase">Escena ${G.i + 1} de ${n}</p><p class="q-ctx">${esc(e.x)}</p>
      <ul class="opciones" role="radiogroup">${G.perm[G.i].map((o, pos) => {
        let cls = ''; if (resp) { if (o === mejor) cls = ' correcta'; else if (o === el) cls = ' errada'; }
        return `<li><button class="opcion${cls}" role="radio" aria-checked="${o === el}" ${resp ? 'disabled' : ''} data-acc="reto-dec" data-o="${o}"><span class="let">${LETRAS[pos]}</span><span>${esc(e.o[o].x)}</span></button></li>`;
      }).join('')}</ul>
      ${resp ? `<div class="retro${e.o[el].w >= 1 ? '' : ' mal'}"><h4>${NIVEL_W(e.o[el].w)}${e.o[el].w < 1 ? `, crédito ${String(e.o[el].w).replace('.', ',')}` : ''}</h4><p>${esc(e.o[el].c)}</p>
        ${el === mejor ? '' : `<p>La mejor decisión era la <b>${LETRAS[G.perm[G.i].indexOf(mejor)]}</b>: ${esc(e.o[mejor].c)}</p>`}</div>
        <div class="acciones"><button class="btn ancho-total" data-acc="reto-dec-sig">${G.i === n - 1 ? 'Ver resultado' : 'Siguiente escena'}</button></div>` : ''}`;
  }
  const puntajeDecisiones = r => r.escenas.reduce((s, e, k) => s + e.o[G.resp[k]].w, 0) / r.escenas.length;

  /* Cierre: estrellas, título temporal, desbloqueo y sello del estante */
  function terminarReto(r) {
    const f = { emparejar: puntajeEmparejar, ordenar: () => G.pts.reduce((a, b) => a + b, 0) / G.pts.length, flujo: rr => G.slots.filter(s => rr.solucion[s] === G.puesto[s]).length / G.slots.length, clasificar: puntajeMazo, veredicto: puntajeMazo, decisiones: puntajeDecisiones }[r.tipo];
    const p = pct(f(r)), st = E.retos[r.id] || { mejor: 0, intentos: 0 };
    const antes = st.mejor, selloAntes = selloEstante(r.m);
    st.intentos++; st.ultimo = p; st.mejor = Math.max(st.mejor, p); st.estrellas = estrellasDe(st.mejor); st.t = Date.now();
    E.retos[r.id] = st;
    const ok = p >= APRUEBA;
    if (ok) E.titulos[r.titulo] = Date.now();
    const sig = retosDe(r.m).find(x => x.nivel === r.nivel + 1);
    G.fin = { p, ok, nuevo: ok && antes < APRUEBA, sig: ok && antes < APRUEBA && sig ? sig : null, sello: !selloAntes && selloEstante(r.m), racha: G.max };
    guardar(); pintarDock();
    sonar(ok ? 'logro' : 'mal');
    detenerReloj(); cuerpo.scrollTop = 0;
    pintar();
  }
  function resultadoReto(r) {
    const F = G.fin, st = E.retos[r.id], sig = retosDe(r.m).find(x => x.nivel === r.nivel + 1);
    abrirLibro(`Estante ${ROM[r.m]}, reto de nivel ${r.nivel}`, r.nombre, `
      <div class="sello">${anillo(F.p, APRUEBA)}<div><div class="cifra">${F.p} %</div>${htmlEstrellas(estrellasDe(F.p))}
        <div class="leyenda">${F.ok ? 'Reto superado.' : `Necesitas ${APRUEBA} % para superarlo. Cada intento cuenta: vuelve a intentarlo cuando quieras.`}${F.racha >= 3 ? ` Racha máxima: ${F.racha}.` : ''}${st.intentos > 1 ? ` Tu mejor resultado: ${st.mejor} %.` : ''}</div></div></div>
      ${F.ok ? `<div class="titulo-ganado">${MEDALLA}<div><span>${F.nuevo ? 'Nuevo título temporal' : 'Título renovado'}</span><strong>${esc(r.titulo)}</strong><em>Vigente 7 días. Lo verás en la placa de la sala; renuévalo superando de nuevo un reto.</em></div></div>` : ''}
      ${F.sig ? `<div class="desbloqueo"><span>${ICO_RETO[F.sig.tipo]}</span><p><b>Nivel ${F.sig.nivel} desbloqueado:</b> ${esc(F.sig.nombre)}.</p></div>` : ''}
      ${F.sello ? `<div class="sello-estante">${MEDALLA}<p><b>¡Sello del estante ${ROM[r.m]}!</b><br>Superaste todos los retos de este estante.</p></div>` : ''}
      <h3>Para pensar</h3><p>${esc(r.reflexion)}</p>
      <textarea class="campo" data-reto-nota="${r.id}" placeholder="Tu reflexión (se guarda en este teléfono)">${esc(E.notasRetos[r.id] || '')}</textarea>
      <div class="acciones">
        ${F.ok && sig && retoAbierto(sig) ? `<button class="btn" data-acc="abrir-reto" data-id="${sig.id}" data-reemplazar-reto="1">Ir al nivel ${sig.nivel}</button>` : F.ok ? `<button class="btn" data-reemplazar="/estante/${r.m}/practica">Ir a la práctica</button>` : ''}
        <button class="btn${F.ok ? ' sec' : ''}" data-acc="reto-repetir">Repetir reto</button>
        <button class="btn sec" data-reemplazar="/estante/${r.m}/retos">Volver a los retos</button></div>`);
  }

  /* Vitrina de logros */
  function vistaVitrina() {
    const tv = tituloVigente(), sup = RETOS.filter(superado).length, sellos = MOD.filter(m => selloEstante(m.id)).length;
    abrirLibro('Vitrina de logros', 'Logros y títulos', `
      <div class="indicadores"><div class="indicador"><span>Estrellas</span><strong>${totalEstrellas()}<small> / ${RETOS.length * 3}</small></strong></div>
        <div class="indicador"><span>Retos</span><strong>${sup}<small> / ${RETOS.length}</small></strong></div>
        <div class="indicador"><span>Sellos</span><strong>${sellos}<small> / ${MOD.filter(m => !m.bloqueado).length}</small></strong></div></div>
      ${tv ? `<div class="titulo-ganado">${MEDALLA}<div><span>Título vigente</span><strong>${esc(tv.t)}</strong><em>Vence en ${diasRestantes(tv.ts)} ${diasRestantes(tv.ts) === 1 ? 'día' : 'días'}.</em></div></div>`
        : '<p class="vacio">No tienes un título vigente. Supera un reto para ganar uno: dura 7 días y se renueva al volver a superarlo.</p>'}
      <h3>Sellos de los estantes</h3>
      <div class="sellos">${MOD.map(m => { const rs = retosDe(m.id), ok = rs.filter(superado).length; return `<button class="sello-est${selloEstante(m.id) ? ' logrado' : ''}${m.bloqueado ? ' bloqueado' : ''}" data-reemplazar="/estante/${m.id}${m.bloqueado ? '' : '/retos'}" aria-label="Estante ${ROM[m.id]}: ${m.bloqueado ? 'disponible en el curso completo' : ok + ' de ' + rs.length + ' retos'}"><span class="medallon">${ROM[m.id]}</span><span class="sello-txt">${m.bloqueado ? ICO_CANDADO : ok + '/' + rs.length}</span></button>`; }).join('')}</div>
      <h3>Títulos</h3>
      <ul class="lista-simple titulos">${RETOS.map(r => { const ts = E.titulos[r.titulo], vig = ts && Date.now() - ts < VIGENCIA, ab = retoAbierto(r);
        return `<li><button data-acc="abrir-reto" data-id="${r.id}" ${ab ? '' : 'disabled'}><div class="fila-flex"><span><b>${esc(r.titulo)}</b><br><span class="nota">${ROM[r.m]}. ${esc(r.nombre)}</span></span>
          <span class="estado-titulo ${vig ? 'vigente' : ts ? 'vencido' : ''}">${vig ? `Vigente, ${diasRestantes(ts)} d` : ts ? 'Renovar' : ab ? 'Por ganar' : 'Bloqueado'}</span></div></button></li>`; }).join('')}</ul>
      <p class="nota">Los títulos son temporales a propósito: volver a un reto días después ayuda a fijar lo aprendido.</p>`);
  }

  /* ───────── Ruta del curso ───────── */
  function vistaRuta() {
    const url = window.Activacion ? Activacion.video() : null;
    const mp4 = url && /\.(mp4|webm)(\?|#|$)/i.test(url);
    abrirLibro('Señalización de la biblioteca', 'Ruta del curso', `
      ${url ? `<div class="video-ruta">
          ${mp4 ? `<video controls playsinline preload="metadata" src="${esc(url)}"></video>` : `<button class="video-portada" data-acc="ver-video" aria-label="Ver el video de la ruta del curso"><span class="video-play"></span><span>Ver el video de la ruta del curso</span></button>`}
          <p class="nota">${mp4 ? 'Necesitas conexión a internet para reproducirlo.' : 'Se abre en YouTube o en tu navegador. Necesitas conexión a internet.'}</p>
        </div>`
        : PRUEBA ? '<p class="vacio">El video de la ruta del curso hace parte del curso completo.</p>'
        : '<p class="vacio">El video de la ruta del curso aún no está en este teléfono. El administrador te lo enviará por WhatsApp; cuando lo recibas, pega el mensaje al final de esta página.</p>'}
      <h3>Recorrido recomendado</h3>
      <ol class="ruta-pasos">
        <li><b>Simulacro diagnóstico.</b> Diez preguntas para conocer tu punto de partida. <a href="#/simulacro">Ir a la mesa de simulacro</a></li>
        <li><b>Estantes I a X.</b> Lee las fichas, supera los retos, consulta el contenido completo y practica. <a href="#/catalogo">Abrir el catálogo</a></li>
        <li><b>Sesiones sincrónicas.</b> Un encuentro en vivo por estante. <a href="#/sesion">Ir a la mesa de sesión</a></li>
        <li><b>Simulacro de la prueba escrita.</b> Mide tu avance con 20, 40 o 60 preguntas. <a href="#/simulacro">Ir a la mesa de simulacro</a></li>
      </ol>
      ${PRUEBA ? htmlCursoCompleto() : `<h3>${url ? '¿Recibiste un enlace nuevo?' : 'Pega aquí el mensaje del video'}</h3>
      <p class="nota">Copia completo el mensaje del administrador, con el enlace y la clave del video.</p>
      <textarea class="campo" id="msgVideo" spellcheck="false"></textarea>
      <p class="nota" id="videoErr" role="alert"></p>
      <div class="acciones"><button class="btn sec" data-acc="guardar-video">Guardar video</button></div>`}`);
  }

  /* ───────── Mesa de sesión sincrónica ───────── */
  function enlaceValido(u) { u = (u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }
  function abrirExterno(u) {
    if (!u) { aviso('Primero guarda el enlace de la videollamada en la mesa de sesión.'); return; }
    if (/; wv\)|Android/.test(navigator.userAgent)) location.href = u; else window.open(u, '_blank', 'noopener');
  }
  function vistaMesaSesion() {
    const hechas = SES.filter(s => E.sesiones[s.n] && E.sesiones[s.n].hecha).length;
    abrirLibro('Mesa de sesión sincrónica', 'Encuentros en vivo', `
      <p>Diez sesiones de 90 minutos, una por estante. Cada guion trae un caso detonante, preguntas de discusión, agenda cronometrada y ticket de salida.</p>
      <label class="campo" for="enlace">Enlace de la videollamada (Meet, Zoom, Teams o similar)</label>
      <input class="campo" id="enlace" type="url" inputmode="url" placeholder="https://meet.google.com/…" value="${esc(E.config.enlace)}">
      <div class="acciones"><button class="btn sec" data-acc="guardar-enlace">Guardar enlace</button><button class="btn" data-acc="unirse">Unirse a la videollamada</button></div>
      <h3>Agenda tipo de cada sesión</h3>
      <ol class="agenda">${AGENDA.map(a => `<li><span>${esc(a.paso)}</span><span class="min">${a.min} min</span></li>`).join('')}</ol>
      <h3>Sesiones (${hechas} de ${SES.length} realizadas)</h3>
      <ul class="lista-simple">${SES.map(s => { const d = E.sesiones[s.n] || {}; return `<li><button data-ir="/sesion/${s.n}"><div class="fila-flex"><span><span class="nota">Sesión ${s.n}${d.fecha ? ', ' + esc(fecha(d.fecha)) : ''}</span><br>${esc(s.titulo)}</span><strong>${s.bloqueado ? `<span class="candado-mini">${ICO_CANDADO}</span>` : d.hecha ? '✓' : ROM[s.m]}</strong></div></button></li>`; }).join('')}</ul>`);
  }
  let agendaPaso = -1, agendaFin = 0;
  function vistaSesion(n) {
    const s = SES.find(x => x.n === n); if (!s) return reemplazar('/sesion');
    if (s.bloqueado) return abrirLibro(`Sesión ${n} de ${SES.length}`, s.titulo, htmlCursoCompleto('Los guiones de las sesiones sincrónicas, con caso detonante, agenda cronometrada y ticket de salida, hacen parte del curso completo.'));
    const d = E.sesiones[n] || {}, m = MOD[s.m - 1];
    const valorFecha = d.fecha ? new Date(d.fecha - new Date(d.fecha).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
    abrirLibro(`Sesión ${n} de ${SES.length}`, s.titulo, `
      <p><i>${esc(s.proposito)}</i></p>
      <p class="nota">Estante relacionado: <a href="#/estante/${m.id}">${ROM[m.id]}. ${esc(m.titulo)}</a></p>
      <label class="campo" for="fechaSesion">Fecha y hora programadas</label>
      <input class="campo" id="fechaSesion" type="datetime-local" value="${valorFecha}" data-cambio="fecha" data-n="${n}">
      <div class="acciones"><button class="btn" data-acc="unirse">Unirse a la videollamada</button><button class="btn sec" data-acc="proyectar" data-n="${n}">Proyectar caso</button></div>
      <h3>Agenda cronometrada</h3>
      <div class="reloj-sesion" id="relojSesion">${agendaPaso >= 0 ? mmss(agendaFin - Date.now()) : '90:00'}</div>
      <ol class="agenda" id="agendaLista">${AGENDA.map((a, k) => `<li class="${k < agendaPaso ? 'hecho' : k === agendaPaso ? 'activo' : ''}"><span>${esc(a.paso)}</span><span class="min">${a.min} min</span></li>`).join('')}</ol>
      <div class="acciones"><button class="btn sec" data-acc="agenda" data-n="${n}">${agendaPaso < 0 ? 'Iniciar agenda' : agendaPaso >= AGENDA.length - 1 ? 'Reiniciar agenda' : 'Siguiente paso'}</button></div>
      <h3>Caso detonante</h3><div class="caso">${esc(s.caso)}</div>
      <h3>Preguntas para la discusión</h3><ol>${s.preguntas.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
      <div class="acciones"><button class="btn sec" data-acc="practicar" data-m="${m.id}">Practicar las preguntas del estante</button></div>
      <h3>Ticket de salida</h3><p>${esc(s.salida)}</p>
      <textarea class="campo" data-nota="salida" data-n="${n}" placeholder="Tu respuesta">${esc(d.salida || '')}</textarea>
      <h3>Bitácora de la sesión</h3>
      <textarea class="campo" data-nota="notas" data-n="${n}" placeholder="Acuerdos, dudas y tareas">${esc(d.notas || '')}</textarea>
      <div class="acciones"><button class="btn${d.hecha ? ' sec' : ''}" data-acc="hecha" data-n="${n}">${d.hecha ? 'Marcar como pendiente' : 'Marcar sesión como realizada'}</button></div>`, { mantenerScroll: true });
    if (agendaPaso >= 0) relojAgenda();
  }
  function relojAgenda() {
    detenerReloj();
    tic = setInterval(() => {
      const r = $('#relojSesion'); if (!r) return detenerReloj();
      const q = agendaFin - Date.now(); r.textContent = mmss(q);
      if (q <= 0) { detenerReloj(); sonar('bien'); aviso('Terminó el tiempo de este paso.'); }
    }, 1000);
  }
  let proy = null;
  function proyectar(n) {
    const s = SES.find(x => x.n === n);
    proy = document.createElement('div'); proy.className = 'proyeccion'; proy.setAttribute('role', 'dialog');
    proy.innerHTML = `<h2>${esc(s.titulo)}</h2><p>${esc(s.caso)}</p><ol>${s.preguntas.map(q => `<li>${esc(q)}</li>`).join('')}</ol><button class="btn" id="cerrarProy">Cerrar proyección</button>`;
    document.body.appendChild(proy);
    proy.querySelector('#cerrarProy').onclick = cerrarProyeccion;
  }
  function cerrarProyeccion() { if (proy) { proy.remove(); proy = null; } }

  /* ───────── Acciones (delegación) ───────── */
  cuerpo.addEventListener('click', e => {
    const enl = e.target.closest('a[href^="#/"]');
    if (enl) { e.preventDefault(); ir(enl.getAttribute('href').slice(1)); return; }
    const a = e.target.closest('[data-ir],[data-reemplazar],[data-acc]');
    if (!a || a.disabled) return;
    if (a.dataset.ir) { ir(a.dataset.ir); return; }
    if (a.dataset.reemplazar) { reemplazar(a.dataset.reemplazar); return; }
    const acc = a.dataset.acc, ex = E.examen;
    switch (acc) {
      case 'practicar': if (iniciarPractica(a.dataset.m)) ir('/practica/' + a.dataset.m); break;
      case 'repaso': if (iniciarPractica('repaso')) ir('/practica/repaso'); break;
      case 'repetir-practica': { const c = P.clave; if (iniciarPractica(c)) pintar(); break; }
      case 'resp-practica': {
        const it = porId[P.ids[P.i]]; if (P.resp[it.id] != null) break;
        const o = +a.dataset.o; P.resp[it.id] = o;
        const c = credito(it, o); registrarStat(it, c); guardar();
        sonar(c >= 1 ? 'bien' : 'mal'); pintar(); break;
      }
      case 'sig-practica': P.i++; cuerpo.scrollTop = 0; pintar(); sonar('pagina'); break;
      case 'largo': E.config.largo = +a.dataset.n; guardar(); pintar(); break;
      case 'iniciar-simulacro': iniciarSimulacro(); break;
      case 'iniciar-diagnostico': iniciarDiagnostico(); break;
      case 'ver-video': { const u = window.Activacion && Activacion.video(); if (u) abrirExterno(u); break; }
      case 'curso-completo': if (window.Activacion) Activacion.whatsapp(TXT_COMPLETO); break;
      case 'guardar-video': {
        const r = window.Activacion ? Activacion.leerVideo($('#msgVideo').value) : { ok: false, msg: 'No disponible.' };
        if (r.ok) { aviso('Video guardado.'); pintar(); } else $('#videoErr').textContent = r.msg;
        break;
      }
      case 'abandonar': {
        const caja = a.closest('.caso');
        caja.innerHTML = '<b>¿Abandonar el intento?</b> Tus respuestas no se guardarán.<div class="acciones"><button class="btn lacre" data-acc="abandonar-si">Sí, abandonar</button><button class="btn sec" data-acc="abandonar-no">Seguir con el intento</button></div>';
        break;
      }
      case 'abandonar-si': E.examen = null; guardar(); pintar(); aviso('Intento abandonado.'); break;
      case 'abandonar-no': pintar(); break;
      case 'resp-examen': ex.resp[porId[ex.ids[ex.i]].id] = +a.dataset.o; guardar(); sonar('toque'); pintar(); break;
      case 'marcar': { const id = ex.ids[ex.i]; ex.marcas[id] = !ex.marcas[id]; guardar(); pintar(); break; }
      case 'mapa': ex.mapa = !ex.mapa; guardar(); pintar(); break;
      case 'saltar': ex.i = +a.dataset.k; ex.mapa = false; guardar(); cuerpo.scrollTop = 0; pintar(); break;
      case 'ant': ex.i = Math.max(0, ex.i - 1); guardar(); cuerpo.scrollTop = 0; pintar(); sonar('pagina'); break;
      case 'sig': ex.i = Math.min(ex.ids.length - 1, ex.i + 1); guardar(); cuerpo.scrollTop = 0; pintar(); sonar('pagina'); break;
      case 'terminar': confirmarTerminar(); break;
      case 'volver-examen': pintar(); break;
      case 'enviar': terminarExamen(false); break;
      case 'guardar-enlace': { E.config.enlace = enlaceValido($('#enlace').value); guardar(); $('#enlace').value = E.config.enlace; aviso(E.config.enlace ? 'Enlace guardado.' : 'Enlace borrado.'); break; }
      case 'unirse': { const campo = $('#enlace'); if (campo && enlaceValido(campo.value) !== E.config.enlace) { E.config.enlace = enlaceValido(campo.value); guardar(); } abrirExterno(E.config.enlace); break; }
      case 'proyectar': proyectar(+a.dataset.n); break;
      case 'agenda': {
        agendaPaso = agendaPaso >= AGENDA.length - 1 ? -1 : agendaPaso + 1;
        if (agendaPaso >= 0) { agendaFin = Date.now() + AGENDA[agendaPaso].min * 60000; sonar('toque'); }
        pintar(); break;
      }
      case 'hecha': { const n = +a.dataset.n; const d = E.sesiones[n] || {}; d.hecha = !d.hecha; E.sesiones[n] = d; guardar(); pintar(); break; }
      default: if (acc && acc.startsWith('reto') || acc === 'abrir-reto') accionReto(acc, a);
    }
  });
  function accionReto(acc, a) {
    if (acc === 'abrir-reto') { const r = retoPorId[a.dataset.id]; if (!r) return; iniciarReto(r); sonar('pagina'); if (a.dataset.reemplazarReto) reemplazar('/reto/' + r.id); else ir('/reto/' + r.id); return; }
    if (!G) return;
    const r = G.r;
    switch (acc) {
      case 'reto-s': G.selS = G.selS === +a.dataset.i ? null : +a.dataset.i; G.msg = null; sonar('toque'); probarPareja(r); break;
      case 'reto-r': G.selR = G.selR === +a.dataset.i ? null : +a.dataset.i; G.msg = null; sonar('toque'); probarPareja(r); break;
      case 'reto-ord': { const i = +a.dataset.i, pos = G.asig.indexOf(i); if (pos >= 0) G.asig.splice(pos, 1); else G.asig.push(i); sonar('toque'); break; }
      case 'reto-ord-limpiar': G.asig = []; break;
      case 'reto-ord-comprobar': { const p = concordancia(G.asig); G.pts[G.f] = p; G.ok = true; sonar(p >= 1 ? 'bien' : 'mal'); break; }
      case 'reto-fase': G.f++; G.perm = barajar(r.fases[G.f].items.map((_, i) => i)); G.asig = []; G.ok = false; cuerpo.scrollTop = 0; sonar('pagina'); break;
      case 'reto-hueco': G.sel = a.dataset.id; sonar('toque'); break;
      case 'reto-carta': {
        if (!G.sel) break;
        G.puesto[G.sel] = a.dataset.id; sonar('toque');
        const libre = G.slots.find(s => !G.puesto[s]); G.sel = libre || null; break;
      }
      case 'reto-quitar': if (G.sel) delete G.puesto[G.sel]; break;
      case 'reto-flujo-comprobar': { G.ok = true; const bien = G.slots.every(s => r.solucion[s] === G.puesto[s]); sonar(bien ? 'bien' : 'mal'); break; }
      case 'reto-cajon': responderMazo(r, +a.dataset.b); break;
      case 'reto-sig': if (G.i === r.cartas.length - 1) return terminarReto(r); G.i++; sonar('pagina'); break;
      case 'reto-dec': if (G.resp[G.i] != null) break; G.resp[G.i] = +a.dataset.o; sonar(r.escenas[G.i].o[+a.dataset.o].w >= 1 ? 'bien' : 'mal'); break;
      case 'reto-dec-sig': if (G.i === r.escenas.length - 1) return terminarReto(r); G.i++; cuerpo.scrollTop = 0; sonar('pagina'); break;
      case 'reto-terminar': return terminarReto(r);
      case 'reto-repetir': iniciarReto(r); cuerpo.scrollTop = 0; sonar('pagina'); break;
    }
    pintar();
  }
  cuerpo.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.cambio === 'umbral') { E.config.umbral = +t.value; guardar(); }
    if (t.dataset.cambio === 'fecha') { const n = +t.dataset.n, d = E.sesiones[n] || {}; d.fecha = t.value ? new Date(t.value).getTime() : null; E.sesiones[n] = d; guardar(); aviso('Fecha guardada.'); }
  });
  cuerpo.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.retoNota) { E.notasRetos[t.dataset.retoNota] = t.value; clearTimeout(t._t); t._t = setTimeout(guardar, 400); return; }
    if (!t.dataset.nota) return;
    const n = +t.dataset.n, d = E.sesiones[n] || {}; d[t.dataset.nota] = t.value; E.sesiones[n] = d;
    clearTimeout(t._t); t._t = setTimeout(guardar, 400);
  });

  $('#btnVolver').addEventListener('click', volver);
  $('#btnCerrar').addEventListener('click', cerrar);
  $('#btnCatalogo').addEventListener('click', () => { audio(); ir('/catalogo'); });
  const dockP = $('#dockProgreso'); dockP.setAttribute('role', 'button'); dockP.tabIndex = 0; dockP.setAttribute('aria-label', 'Abrir la vitrina de logros');
  dockP.addEventListener('click', () => { audio(); ir('/vitrina'); });
  $('#btnSonido').addEventListener('click', () => { E.config.sonido = !E.config.sonido; guardar(); pintarSonido(); if (E.config.sonido) sonar('toque'); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !libro.hidden && escenaOK) volver(); });

  /* ───────── Portada ───────── */
  // Fin de la versión de prueba: se bloquea la app y se ofrece desinstalarla (Android pide confirmación)
  function finDePrueba() {
    const p = $('#portada');
    cerrarLibro(); if (escenaOK) Escena.pausar(true);
    p.hidden = false; p.classList.remove('saliendo'); p.classList.add('activando');
    $('#btnEntrar').hidden = true; $('#pruebaResta').hidden = true; $('#pruebaFin').hidden = false;
    pintarDock();
    if (!finDePrueba.ofrecido) { finDePrueba.ofrecido = true; setTimeout(() => Activacion.desinstalar(), 1200); }
  }
  function prepararPortada() {
    const p = $('#portada'), b = $('#btnEntrar');
    if (escenaOK) Escena.pausar(true);            // la sala no consume batería mientras la portada está abierta
    if (PRUEBA) {
      $('#btnDesinstalar').onclick = () => { if (!Activacion.desinstalar()) aviso('Mantén presionado el ícono de la app y elige «Desinstalar».'); };
      $('#btnCompleto').onclick = () => Activacion.whatsapp(TXT_COMPLETO);
      const pr = Activacion.prueba();
      if (!pr.vigente) return finDePrueba();
      $('#pruebaResta').hidden = false;
      $('#pruebaResta').textContent = MODO.sinLimite ? 'Versión de prueba en línea: recorre libremente los estantes I y II y el simulacro diagnóstico.' : `Versión de prueba: te quedan ${restaTxt(pr.resta)} para recorrer el curso.`;
      if (!MODO.sinLimite) setInterval(() => { if (!Activacion.prueba().vigente) finDePrueba(); else pintarDock(); }, 60000);
    }
    const habilitar = () => {
      p.classList.remove('activando'); $('#activacion').hidden = true;
      b.hidden = false; b.disabled = false; b.textContent = 'Entrar a la biblioteca'; b.focus();
    };
    const entrar = () => {
      if (PRUEBA && window.Activacion && !Activacion.prueba().vigente) return finDePrueba();
      if (!window.Activacion || !Activacion.activo()) return;
      audio(); sonar('pagina');
      p.classList.add('saliendo');
      setTimeout(() => { p.hidden = true; }, reducido ? 0 : 460);
      if (escenaOK && libro.hidden) {
        Escena.pausar(false);
        if (!Almacen.get('bdo.pista')) $('#pista').hidden = false;
      }
    };
    b.addEventListener('click', entrar);
    if (window.Activacion && Activacion.activo()) habilitar();
    else { b.hidden = true; p.classList.add('activando'); if (window.Activacion) Activacion.montar(() => { sonar('bien'); habilitar(); }); }
  }

  /* ───────── Arranque ───────── */
  function arrancar() {
    if (MODO.nombre) {
      document.title = MODO.nombre;
      $('#portadaNombre').innerHTML = esc(MODO.nombre) + '<small>Concursa: Docente orientador</small>';
      $('.placa-titulo').textContent = MODO.nombre;
      $('.placa-sub').textContent = 'Concursa: Docente orientador';
    }
    pintarSonido(); pintarDock();
    escenaOK = !!(window.THREE && window.Escena && Escena.iniciar($('#lienzo'), $('#etiquetas'), {
      reducido,
      sonidoToque: () => sonar('toque'),
      onSeleccion: (tipo, id) => ir(tipo === 'mesa' ? '/' + id : tipo === 'ruta' ? '/ruta' : '/estante/' + id)
    }));
    if (!escenaOK) { $('#sala').style.display = 'none'; $('#dock').style.display = 'none'; $('#hud').style.display = 'none'; }
    prepararPortada();
    // al abrir con una ruta guardada, regresar a la sala para que el botón atrás funcione
    if (location.hash && location.hash !== '#/' && location.hash !== '#') { reemplazando = true; location.replace('#/'); }
    else pintar();
  }
  const fuentes = document.fonts ? Promise.race([
    Promise.all([document.fonts.load('48px "IM Fell English"'), document.fonts.load('17px "Alegreya"')]),
    new Promise(r => setTimeout(r, 1500))
  ]) : Promise.resolve();
  fuentes.then(arrancar, arrancar);
})();
