/* Concursa — activación por teléfono.
   El teléfono muestra su número de equipo; el administrador responde con «CÓDIGO-SELLO»:
   un código del listado de 2.000 y un sello de 5 símbolos que solo es válido para ese equipo. */
(function () {
  'use strict';
  const C = window.Cripto, L = window.LIC;
  // Número de WhatsApp del administrador con indicativo de país y sin «+» (ej. 573001234567).
  // Vacío: el botón abre WhatsApp para que la persona elija el chat del administrador.
  const WHATSAPP_ADMIN = '573057842072';
  const CLAVE = 'concursa.act', FALLOS = 'concursa.fallos', VIDEO = 'concursa.video', PRUEBA = 'concursa.prueba';
  const MODO = window.CONCURSA_MODO || {};

  const huellas = new Set();
  for (let i = 0; i < L.h.length; i += 16) huellas.add(L.h.substr(i, 16));

  const ls = {
    get(k) { try { return JSON.parse(Almacen.get(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { Almacen.set(k, JSON.stringify(v)); } catch (e) {} }
  };
  function idTelefono() {
    try { if (window.ConcursaNativo && ConcursaNativo.idEquipo) { const v = ConcursaNativo.idEquipo(); if (v) return v; } } catch (e) {}
    let v = ls.get('concursa.id');                 // solo para pruebas en un navegador
    if (!v) { v = 'web-' + Math.random().toString(16).slice(2) + Date.now().toString(16); ls.set('concursa.id', v); }
    return v;
  }
  const equipo = C.equipoDesdeId(idTelefono());

  // Versión de prueba: dura MODO.horas desde la primera apertura en este teléfono y nunca pasa de MODO.caduca.
  // Si el reloj del teléfono se atrasa, la prueba se da por terminada.
  function prueba() {
    if (MODO.sinLimite) return { vigente: true, resta: Infinity, fin: Infinity };   // versión de prueba en línea
    const ahora = Date.now(), TOL = 10 * 60000;
    let p = ls.get(PRUEBA);
    if (!p || !p.i) { p = { i: ahora, u: ahora }; ls.set(PRUEBA, p); }
    const fin = Math.min(p.i + (MODO.horas || 24) * 3600000, MODO.caduca || Infinity);
    let vencida = !!p.v || ahora >= fin || ahora < p.u - TOL || ahora < p.i - TOL;
    p.u = Math.max(p.u || 0, ahora); if (vencida) p.v = 1;
    ls.set(PRUEBA, p);
    return { vigente: !vencida, resta: vencida ? 0 : fin - ahora, fin };
  }
  function activo() {
    if (MODO.prueba) return prueba().vigente;
    if (MODO.libre) return true;   // Entorno simulado: sin activación
    const a = ls.get(CLAVE);
    return !!(a && a.e === equipo && huellas.has(C.huella(a.c)) && C.sello(L.s, a.c, equipo) === a.s);
  }
  // Acepta el código solo o el mensaje completo pegado desde WhatsApp.
  function extraer(texto) {
    texto = String(texto || '').replace(/https?:\/\/\S+/gi, ' ').replace(/clave del video:?\s*[0-9A-Za-z]+/gi, ' ');
    const m = texto.match(/([0-9A-Za-z]{9})\s*[-–—]\s*([0-9A-Za-z]{5})(?![0-9A-Za-z])/);
    if (m) return C.normCodigo(m[1] + m[2]);
    return C.normCodigo(texto);
  }
  function intentar(texto) {
    const f = ls.get(FALLOS) || { n: 0, hasta: 0 };
    if (Date.now() < f.hasta) return { ok: false, msg: `Demasiados intentos. Espera ${Math.ceil((f.hasta - Date.now()) / 1000)} segundos y vuelve a intentarlo.` };
    const n = extraer(texto);
    let r;
    if (!n) r = { ok: false, msg: 'Pega o escribe el código de activación que te envió el administrador.', vacio: true };
    else if (n.length < 14) r = { ok: false, msg: 'El código está incompleto. Tiene 14 caracteres, por ejemplo 00A0UY9F8-K7Q2M.' };
    else if (n.length > 14) r = { ok: false, msg: 'Hay caracteres de más. Pega solo el código, por ejemplo 00A0UY9F8-K7Q2M.' };
    else {
      const cod = n.slice(0, 9), sel = n.slice(9);
      if (!huellas.has(C.huella(cod))) r = { ok: false, msg: 'Ese código no pertenece al curso. Revisa que lo hayas copiado completo.' };
      else if (C.sello(L.s, cod, equipo) !== sel) r = { ok: false, msg: `Este código no corresponde a este teléfono. Si lo copiaste completo, pide al administrador un código para tu número de equipo, ${C.formatoEquipo(equipo)}.` };
      else { ls.set(CLAVE, { c: cod, s: sel, e: equipo, t: Date.now() }); ls.set(FALLOS, null); leerVideo(texto); return { ok: true }; }
    }
    if (!r.vacio) {
      f.n++;
      if (f.n >= 5) { f.n = 0; f.hasta = Date.now() + 60000; r.msg += ' Por seguridad, espera un minuto antes del siguiente intento.'; }
      ls.set(FALLOS, f);
    }
    return r;
  }
  // Mensaje del administrador: «…https://enlace… Clave del video: XXXXXX»
  function leerVideo(texto) {
    texto = String(texto || '');
    const u = texto.match(/https?:\/\/[^\s<>"']+/i), k = texto.match(/clave\s+del\s+video:?\s*([0-9A-Za-z]{6})/i);
    if (!u) return { ok: false, msg: 'No encontré el enlace del video. Pega el mensaje completo que te envió el administrador.' };
    if (!k) return { ok: false, msg: 'Falta la clave del video. Pega el mensaje completo, incluida la línea «Clave del video».' };
    const url = C.normUrl(u[0]);
    if (C.selloVideo(L.s, url) !== C.normCrockford(k[1])) return { ok: false, msg: 'La clave no corresponde a ese enlace. Pide al administrador que te reenvíe el mensaje del video.' };
    ls.set(VIDEO, { u: url, t: Date.now() });
    return { ok: true, url };
  }
  function video() {
    const v = ls.get(VIDEO);
    return v && v.u && /^https?:\/\//i.test(v.u) ? v.u : null;
  }
  function copiar(texto) {
    try { if (window.ConcursaNativo && ConcursaNativo.copiar) { ConcursaNativo.copiar(texto); return true; } } catch (e) {}
    try {
      const t = document.createElement('textarea'); t.value = texto; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); if (ok) return true;
    } catch (e) {}
    try { navigator.clipboard.writeText(texto); return true; } catch (e) { return false; }
  }
  // Texto de la marca de agua: identifica la licencia de quien ve el documento
  function marca() {
    const autor = '© Fredy Moreno Quintero';
    if (MODO.prueba) return autor + ' · ' + (MODO.nombre || 'Versión de prueba') + ' · uso de prueba';
    if (MODO.libre) return autor + ' · ' + (MODO.nombre || 'Entorno simulado');
    const a = ls.get(CLAVE);
    return a && a.c ? `${autor} · Licencia ${a.c} · Equipo ${C.formatoEquipo(equipo)}` : autor;
  }
  function desinstalar() {
    try { if (window.ConcursaNativo && ConcursaNativo.desinstalar) { ConcursaNativo.desinstalar(); return true; } } catch (e) {}
    return false;
  }
  function enlaceWhatsApp(texto) {
    return 'https://wa.me/' + WHATSAPP_ADMIN + '?text=' + encodeURIComponent(texto);
  }
  function abrir(url) { if (/Android/.test(navigator.userAgent)) location.href = url; else window.open(url, '_blank', 'noopener'); }

  function montar(alActivar) {
    const $ = s => document.querySelector(s);
    const f = $('#activacion'), campo = $('#codigoAct'), err = $('#actError');
    const eq = C.formatoEquipo(equipo);
    $('#numEquipo').textContent = eq;
    f.hidden = false;
    $('#btnEnviarEquipo').onclick = () => abrir(enlaceWhatsApp(`Hola, quiero activar la app Concursa: Docente orientador. Mi número de equipo es ${eq}.`));
    $('#btnCopiarEquipo').onclick = () => { err.textContent = copiar(eq) ? 'Número copiado. Pégalo en tu mensaje al administrador.' : 'No se pudo copiar. Escribe el número tal como aparece.'; };
    campo.addEventListener('focus', () => setTimeout(() => campo.scrollIntoView({ block: 'center' }), 300));
    f.onsubmit = e => {
      e.preventDefault();
      const r = intentar(campo.value);
      if (r.ok) { err.textContent = 'Acceso activado en este teléfono.'; campo.blur(); setTimeout(alActivar, 500); }
      else { err.textContent = r.msg; campo.focus(); }
    };
  }

  window.Activacion = { activo, montar, intentar, leerVideo, video, equipo: () => equipo, prueba, marca, desinstalar,
    whatsapp: texto => abrir(enlaceWhatsApp(texto)) };
})();
