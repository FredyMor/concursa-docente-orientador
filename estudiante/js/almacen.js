/* Almacenamiento persistente: escribe en el almacenamiento de la página y, en Android,
   también en SharedPreferences a través del puente nativo. Al leer, prefiere la copia nativa;
   si no existe aún (datos de una versión anterior), usa la de la página y la copia al lado nativo. */
(function () {
  'use strict';
  const N = window.ConcursaNativo;
  const nativo = !!(N && typeof N.leer === 'function' && typeof N.guardar === 'function');
  function pagina(op, k, v) {
    try {
      if (op === 'get') return localStorage.getItem(k);
      if (op === 'set') localStorage.setItem(k, v); else localStorage.removeItem(k);
    } catch (e) { return null; }
    return null;
  }
  window.Almacen = {
    get(k) {
      if (nativo) {
        try { const v = N.leer(k); if (v) return v; } catch (e) {}
        const p = pagina('get', k);
        if (p) { try { N.guardar(k, p); } catch (e) {} }
        return p;
      }
      return pagina('get', k);
    },
    set(k, v) {
      v = String(v);
      pagina('set', k, v);
      if (nativo) { try { N.guardar(k, v); } catch (e) {} }
    },
    del(k) {
      pagina('del', k);
      if (nativo) { try { N.guardar(k, null); } catch (e) {} }
    }
  };
})();
