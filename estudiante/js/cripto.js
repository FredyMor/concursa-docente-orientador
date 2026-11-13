/* Concursa — utilidades de activación compartidas por la app del usuario y la de administrador.
   SHA-256 y HMAC en JavaScript puro (no dependen de crypto.subtle, que file:// puede no ofrecer),
   base 32 de Crockford y las tres derivaciones del sistema:
   - número de equipo: 7 símbolos del ID del teléfono + 1 de control (XXXX-XXXX)
   - huella de código: identifica un código del listado sin guardarlo en claro
   - sello: 5 símbolos que atan un código del listado a un número de equipo (HMAC con la clave secreta)
   - sello de video: 6 símbolos que autentican el enlace del video de la ruta del curso */
(function () {
  'use strict';
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);

  function utf8(s) {
    if (window.TextEncoder) return new TextEncoder().encode(s);
    const b = unescape(encodeURIComponent(s)), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  function sha256(datos) {
    const m = datos instanceof Uint8Array ? datos : utf8(datos);
    const l = m.length, nb = ((l + 9 + 63) >> 6) << 6, p = new Uint8Array(nb);
    p.set(m); p[l] = 0x80;
    const bitsAlto = Math.floor(l / 0x20000000), bitsBajo = (l << 3) >>> 0;
    p[nb - 8] = bitsAlto >>> 24; p[nb - 7] = bitsAlto >>> 16; p[nb - 6] = bitsAlto >>> 8; p[nb - 5] = bitsAlto;
    p[nb - 4] = bitsBajo >>> 24; p[nb - 3] = bitsBajo >>> 16; p[nb - 2] = bitsBajo >>> 8; p[nb - 1] = bitsBajo;
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (p[o + 4 * i] << 24) | (p[o + 4 * i + 1] << 16) | (p[o + 4 * i + 2] << 8) | p[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { out[4 * i] = H[i] >>> 24; out[4 * i + 1] = H[i] >>> 16; out[4 * i + 2] = H[i] >>> 8; out[4 * i + 3] = H[i]; }
    return out;
  }
  function hmac(clave, mensaje) {
    let k = clave instanceof Uint8Array ? clave : utf8(clave);
    if (k.length > 64) k = sha256(k);
    const ki = new Uint8Array(64), ko = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { const v = k[i] || 0; ki[i] = v ^ 0x36; ko[i] = v ^ 0x5c; }
    const m = mensaje instanceof Uint8Array ? mensaje : utf8(mensaje);
    const a = new Uint8Array(64 + m.length); a.set(ki); a.set(m, 64);
    const ih = sha256(a), b = new Uint8Array(96); b.set(ko); b.set(ih, 64);
    return sha256(b);
  }
  const hex = u => Array.from(u, x => x.toString(16).padStart(2, '0')).join('');
  const deHex = h => { const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(2 * i, 2), 16); return u; };

  /* Base 32 de Crockford: sin I, L, O ni U, para dictar y copiar sin confusiones */
  const ALF = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function b32(bytes, n) {
    let s = '', acc = 0, nbits = 0, i = 0;
    while (s.length < n) {
      if (nbits < 5) { acc = (acc << 8) | bytes[i++]; nbits += 8; }
      s += ALF[(acc >>> (nbits - 5)) & 31]; nbits -= 5; acc &= (1 << nbits) - 1;
    }
    return s;
  }
  const normCrockford = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  // Los códigos del listado combinan O/0 e I/L/1; se comparan normalizados (2000 de 2000 siguen siendo únicos).
  const normCodigo = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  const control = s7 => ALF[s7.split('').reduce((t, c, i) => t + (i + 1) * ALF.indexOf(c), 0) % 32];

  function equipoDesdeId(id) {
    const s7 = b32(sha256('concursa-equipo|' + String(id || '').toLowerCase()), 7);
    return s7 + control(s7);
  }
  function equipoValido(e8) { e8 = normCrockford(e8); return e8.length === 8 && /^[0-9A-Z]+$/.test(e8) && !/[ILOU]/.test(e8) && control(e8.slice(0, 7)) === e8[7]; }
  const formatoEquipo = e8 => e8.slice(0, 4) + '-' + e8.slice(4);
  const huella = codigo => hex(sha256('concursa-lic|' + normCodigo(codigo))).slice(0, 16);
  const sello = (claveHex, codigo, e8) => b32(hmac(deHex(claveHex), normCodigo(codigo) + '|' + normCrockford(e8)), 5);
  // Video de la ruta del curso: el administrador lo firma para que la app solo acepte enlaces suyos.
  const normUrl = u => String(u || '').trim().replace(/[.,;:)\]»"']+$/, '');
  const selloVideo = (claveHex, url) => b32(hmac(deHex(claveHex), 'video|' + normUrl(url)), 6);

  window.Cripto = { sha256, hmac, hex, deHex, b32, normCrockford, normCodigo, equipoDesdeId, equipoValido, formatoEquipo, huella, sello, normUrl, selloVideo, ALF };
})();
