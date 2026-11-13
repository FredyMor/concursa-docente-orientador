/* Concursa — versión web: prueba gratuita abierta para todos y curso completo con documento y clave.
   Sin sesión se carga la prueba (estantes I y II, incluidos en el sitio).
   Con documento y clave válidos, el contenido completo llega desde la base de datos;
   no está publicado en el sitio. */
(function () {
  'use strict';
  const CFG = window.CONCURSA_NUBE || {};
  const SES = 'concursa.web';
  const $ = s => document.querySelector(s);
  const ANTES = ['js/three.min.js', 'js/licencias.js', 'js/activacion.js'];
  const DESPUES = ['js/visor.js', 'js/escena.js', 'js/app.js'];
  const DATOS_NUBE = ['js/data_modulos.js', 'js/data_items_a.js', 'js/data_items_b.js', 'js/data_sesiones.js', 'js/data_retos.js'];
  const DATOS_PRUEBA = ['js/data_modulos.js', 'js/data_items_a.js', 'js/data_sesiones.js', 'js/data_retos.js'];
  const MODO_PRUEBA = Object.assign({}, window.CONCURSA_MODO);   // modo.js trae el modo de prueba del sitio
  let cred = null, cargando = false;

  const hayNube = () => !!(CFG.url && CFG.clave);
  async function rpc(fn, args) {
    const r = await fetch(CFG.url.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CFG.clave, Authorization: 'Bearer ' + CFG.clave },
      body: JSON.stringify(args)
    });
    if (!r.ok) throw new Error('servidor ' + r.status);
    return r.json();
  }
  function script(src) {
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error(src)); document.body.appendChild(s); });
  }
  const ejecutar = (texto, nombre) => (0, eval)(texto + '\n//# sourceURL=' + nombre);
  const leer = () => { try { return JSON.parse(localStorage.getItem(SES) || sessionStorage.getItem(SES) || 'null'); } catch (e) { return null; } };
  const guardar = (v, recordar) => { try { (recordar ? localStorage : sessionStorage).setItem(SES, JSON.stringify(v)); } catch (e) {} };
  const borrar = () => { try { localStorage.removeItem(SES); sessionStorage.removeItem(SES); } catch (e) {} };
  const recargar = consulta => { location.href = location.pathname + (consulta || ''); };

  function salir() { borrar(); recargar(); }
  function pedirIngreso() { recargar('?ingreso=1'); }

  // Carga la app con el modo y los datos indicados; luego entra a la sala sin otro toque.
  async function cargarApp(modo, cargarDatos) {
    cargando = true;
    window.CONCURSA_MODO = modo;
    ['#eleccionWeb', '#ingresoWeb'].forEach(s => ($(s).hidden = true));
    const b = $('#btnEntrar'); b.hidden = false; b.disabled = true; b.textContent = 'Abriendo la biblioteca…';
    for (const s of ANTES) await script(s);
    await cargarDatos();
    for (const s of DESPUES) await script(s);
    const t0 = Date.now();
    const espera = setInterval(() => {
      if (!b.disabled && /Entrar/.test(b.textContent)) { clearInterval(espera); b.click(); }
      else if (Date.now() - t0 > 15000) clearInterval(espera);
    }, 150);
  }

  function abrirPrueba() {
    return cargarApp(MODO_PRUEBA, async () => { for (const s of DATOS_PRUEBA) await script(s); });
  }

  async function entrar(d, c, recordar) {
    const r = await rpc('estudiante_ingresar', { p_documento: d, p_clave: c });
    if (!r.ok) return r;
    cred = { d: r.documento, c, n: r.nombre };
    guardar(cred, recordar);
    window.SesionWeb = { documento: r.documento, nombre: r.nombre, salir };
    // Los documentos técnicos se piden a la base de datos al abrirlos
    window.CargarDocumento = async id => {
      const x = await rpc('estudiante_archivo', { p_documento: cred.d, p_clave: cred.c, p_archivo: 'docs/' + id + '.js' });
      if (!x.ok) throw new Error(x.error);
      ejecutar(x.texto, 'docs/' + id + '.js');
    };
    await cargarApp({ libre: true, web: true }, async () => { DATOS_NUBE.forEach(k => { if (r.datos[k]) ejecutar(r.datos[k], k); }); });
    return { ok: true };
  }

  function mostrarIngreso() {
    $('#eleccionWeb').hidden = true; $('#btnEntrar').hidden = true;
    const f = $('#ingresoWeb'); f.hidden = false; $('#webDoc').focus();
  }
  function mostrarEleccion() {
    $('#ingresoWeb').hidden = true; $('#btnEntrar').hidden = true; $('#eleccionWeb').hidden = false;
  }

  function montar() {
    const err = $('#webError');
    $('#btnPruebaWeb').onclick = () => { if (!cargando) abrirPrueba(); };
    $('#btnIngresoWeb').onclick = mostrarIngreso;
    $('#webVolver').onclick = () => { err.textContent = ''; history.replaceState(null, '', location.pathname); mostrarEleccion(); };
    $('#ingresoWeb').onsubmit = async e => {
      e.preventDefault();
      const d = $('#webDoc').value.trim(), c = $('#webClave').value;
      if (!d || !c) { err.textContent = 'Escribe tu número de documento y tu clave.'; return; }
      if (!hayNube()) { err.textContent = 'El ingreso con clave aún no está disponible. Escribe al administrador.'; return; }
      const btn = $('#webEntrar'); btn.disabled = true; err.textContent = 'Verificando…';
      try {
        const r = await entrar(d, c, $('#webRecordar').checked);
        if (!r.ok) { err.textContent = r.error; btn.disabled = false; $('#webClave').select(); }
      } catch (ex) { err.textContent = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'; btn.disabled = false; }
    };
  }

  async function iniciar() {
    montar();
    const s = leer();
    if (s && s.d && s.c && hayNube()) {
      try { const r = await entrar(s.d, s.c, !!localStorage.getItem(SES)); if (r.ok) return; } catch (e) {}
      borrar();
      ['#eleccionWeb', '#ingresoWeb'].forEach(x => ($(x).hidden = true));
    }
    if (/[?&]ingreso=1/.test(location.search)) mostrarIngreso(); else mostrarEleccion();
  }
  window.Nube = { salir, pedirIngreso };
  iniciar();
})();
