/* Concursa — ingreso web de estudiantes (documento de identidad + clave asignada).
   El contenido completo del curso no está en el sitio: se descarga de la base de datos
   solo después de verificar documento y clave. */
(function () {
  'use strict';
  const CFG = window.CONCURSA_NUBE || {};
  const SES = 'concursa.web';
  const $ = s => document.querySelector(s);
  const DESPUES = ['js/three.min.js', 'js/licencias.js', 'js/activacion.js'];
  const AL_FINAL = ['js/visor.js', 'js/escena.js', 'js/app.js'];
  const DATOS = ['js/data_modulos.js', 'js/data_items_a.js', 'js/data_items_b.js', 'js/data_sesiones.js', 'js/data_retos.js'];
  let cred = null;

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
  function ejecutar(texto, nombre) { (0, eval)(texto + '\n//# sourceURL=' + nombre); }
  const leer = () => { try { return JSON.parse(localStorage.getItem(SES) || sessionStorage.getItem(SES) || 'null'); } catch (e) { return null; } };
  const guardar = (v, recordar) => { try { (recordar ? localStorage : sessionStorage).setItem(SES, JSON.stringify(v)); } catch (e) {} };
  function salir() {
    try { localStorage.removeItem(SES); sessionStorage.removeItem(SES); } catch (e) {}
    location.href = location.pathname;
  }

  // Los documentos técnicos se piden a la base de datos cuando el estudiante los abre
  window.CargarDocumento = async function (id) {
    const r = await rpc('estudiante_archivo', { p_documento: cred.d, p_clave: cred.c, p_archivo: 'docs/' + id + '.js' });
    if (!r.ok) throw new Error(r.error);
    ejecutar(r.texto, 'docs/' + id + '.js');
  };

  async function entrar(d, c, recordar) {
    const r = await rpc('estudiante_ingresar', { p_documento: d, p_clave: c });
    if (!r.ok) return r;
    cred = { d: r.documento, c, n: r.nombre };
    window.SesionWeb = { documento: r.documento, nombre: r.nombre, salir };
    guardar(cred, recordar);
    $('#ingresoWeb').hidden = true;
    const b = $('#btnEntrar'); b.hidden = false; b.disabled = true; b.textContent = 'Abriendo la biblioteca…';
    for (const s of DESPUES) await script(s);
    DATOS.forEach(k => { if (r.datos[k]) ejecutar(r.datos[k], k); });
    for (const s of AL_FINAL) await script(s);
    return { ok: true };
  }

  function montar() {
    const f = $('#ingresoWeb'), err = $('#webError'), b = $('#btnEntrar');
    if (!CFG.url || !CFG.clave) { b.textContent = 'El ingreso aún no está configurado.'; return; }
    b.hidden = true; f.hidden = false; $('#webDoc').focus();
    f.onsubmit = async e => {
      e.preventDefault();
      const d = $('#webDoc').value.trim(), c = $('#webClave').value;
      if (!d || !c) { err.textContent = 'Escribe tu número de documento y tu clave.'; return; }
      const btn = $('#webEntrar'); btn.disabled = true; err.textContent = 'Verificando…';
      try {
        const r = await entrar(d, c, $('#webRecordar').checked);
        if (!r.ok) { err.textContent = r.error; btn.disabled = false; $('#webClave').select(); }
      } catch (ex) { err.textContent = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'; btn.disabled = false; }
    };
  }

  async function iniciar() {
    const s = leer();
    if (s && s.d && s.c && CFG.url) {
      try { const r = await entrar(s.d, s.c, !!localStorage.getItem(SES)); if (r.ok) return; } catch (e) {}
      try { localStorage.removeItem(SES); sessionStorage.removeItem(SES); } catch (e) {}
    }
    montar();
  }
  window.Nube = { salir };
  iniciar();
})();
