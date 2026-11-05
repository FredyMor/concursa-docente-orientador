/* Sala 3D: biblioteca vintage con diez estantes (módulos) y dos mesas
   (sesión sincrónica y simulacro). Three.js r149, sin dependencias externas. */
(function () {
  'use strict';
  const T = window.THREE;
  const Escena = {};
  window.Escena = Escena;

  let renderer, scene, camera, raycaster, lienzo, capaEtq, opts;
  let yaw = 0, pitch = -0.06, fov = 62;
  const pos = new T.Vector3(0, 1.62, 9.2);
  let anim = null, pausada = false, rafId = 0, reloj = null;
  const interactivos = [];      // { tipo, id, obj, ancla, etq, placaMat }
  const pisables = [];
  let resaltado = null, polvo = null, luzFoco = null;
  const LIM = { x: 6.4, zMin: -9.2, zMax: 10.4 };

  /* ───────── Texturas procedurales ───────── */
  function lienzoTex(w, h, dibujar) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    dibujar(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function azar(sem) { let s = sem || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function texPiso() {
    const r = azar(7);
    const t = lienzoTex(512, 512, (g, w, h) => {
      const filas = 8, alto = h / filas;
      for (let f = 0; f < filas; f++) {
        let x = -r() * 200;
        while (x < w) {
          const largo = 160 + r() * 200;
          const b = 70 + r() * 30;
          g.fillStyle = `rgb(${b + 42},${b},${b - 32})`;
          g.fillRect(x, f * alto, largo, alto);
          for (let k = 0; k < 7; k++) {            // vetas
            g.strokeStyle = `rgba(40,22,10,${0.08 + r() * 0.12})`;
            g.lineWidth = 1 + r() * 1.5;
            const y0 = f * alto + r() * alto;
            g.beginPath(); g.moveTo(x, y0);
            g.bezierCurveTo(x + largo * .3, y0 + (r() - .5) * 8, x + largo * .7, y0 + (r() - .5) * 8, x + largo, y0 + (r() - .5) * 6);
            g.stroke();
          }
          g.fillStyle = 'rgba(20,10,4,.55)'; g.fillRect(x, f * alto, 2, alto);
          x += largo;
        }
        g.fillStyle = 'rgba(20,10,4,.6)'; g.fillRect(0, f * alto, w, 2);
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(4, 7);
    return t;
  }
  function texPapelTapiz() {
    const t = lienzoTex(256, 256, (g, w, h) => {
      g.fillStyle = '#1d3a2c'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = (x / 32) % 2 ? '#1a3428' : '#21402f'; g.fillRect(x, 0, 32, h); }
      g.strokeStyle = 'rgba(195,157,82,.22)'; g.lineWidth = 1.2;
      for (let y = 0; y < h; y += 64) for (let x = 16; x < w; x += 64) {   // flor de lis estilizada
        const cx = x + ((y / 64) % 2 ? 32 : 0), cy = y + 32;
        g.beginPath(); g.moveTo(cx, cy - 14); g.quadraticCurveTo(cx + 9, cy - 2, cx, cy + 12); g.quadraticCurveTo(cx - 9, cy - 2, cx, cy - 14); g.stroke();
        g.beginPath(); g.moveTo(cx - 10, cy + 2); g.quadraticCurveTo(cx - 4, cy - 8, cx, cy + 4); g.quadraticCurveTo(cx + 4, cy - 8, cx + 10, cy + 2); g.stroke();
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(6, 2);
    return t;
  }
  function texZocalo() {
    const t = lienzoTex(256, 128, (g, w, h) => {
      g.fillStyle = '#3b2415'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#4a2e1b'; g.fillRect(14, 14, w - 28, h - 28);
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; g.strokeRect(14, 14, w - 28, h - 28);
      g.strokeStyle = 'rgba(255,210,150,.12)'; g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
      g.fillStyle = '#2a1a0e'; g.fillRect(0, 0, w, 6);
    });
    t.wrapS = T.RepeatWrapping; t.repeat.set(10, 1);
    return t;
  }
  function texAlfombra() {
    return lienzoTex(512, 512, (g, w, h) => {
      g.fillStyle = '#5c1d1c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c39d52'; g.lineWidth = 6; g.strokeRect(18, 18, w - 36, h - 36);
      g.fillStyle = '#2b3550'; g.fillRect(34, 34, w - 68, h - 68);
      g.fillStyle = '#6e2523'; g.fillRect(52, 52, w - 104, h - 104);
      g.strokeStyle = 'rgba(195,157,82,.7)'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const m = 80 + i * 26; g.strokeRect(m, m, w - 2 * m, h - 2 * m); }
      g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
      g.fillStyle = '#c39d52'; g.fillRect(-40, -40, 80, 80);
      g.fillStyle = '#2b3550'; g.fillRect(-26, -26, 52, 52); g.restore();
      const r = azar(3);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${r() * .08})`; g.fillRect(r() * w, r() * h, 2, 2); }
    });
  }
  function romano(n) { return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n); }
  function texPlaca(linea1, linea2, oscura) {
    return lienzoTex(512, 160, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      if (oscura) { gr.addColorStop(0, '#24493a'); gr.addColorStop(1, '#10241b'); }
      else { gr.addColorStop(0, '#e2c47f'); gr.addColorStop(.55, '#b38a43'); gr.addColorStop(1, '#8a6528'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = oscura ? '#c39d52' : 'rgba(60,35,5,.7)'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = oscura ? '#f0d896' : '#2a1a08';
      g.font = '48px "IM Fell English", Georgia, serif';
      g.fillText(linea1, w / 2, linea2 ? 58 : h / 2 + 2, w - 40);
      if (linea2) { g.font = '36px "IM Fell English", Georgia, serif'; g.fillText(linea2, w / 2, 112, w - 40); }
    });
  }
  function texRuta() {
    return lienzoTex(1024, 384, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#24493a'); gr.addColorStop(1, '#10241b');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c39d52'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
      g.lineWidth = 3; g.strokeRect(32, 32, w - 64, h - 64);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f0d896';
      g.font = '112px "IM Fell English", Georgia, serif';
      g.fillText('Ruta del curso', w / 2, 140, w - 120);
      // recorrido punteado con cuatro paradas y el botón de reproducir al final
      const y = 268, xs = [150, 330, 510, 690];
      g.strokeStyle = 'rgba(226,196,127,.85)'; g.lineWidth = 6; g.setLineDash([4, 18]); g.lineCap = 'round';
      g.beginPath(); g.moveTo(xs[0], y); g.lineTo(856, y); g.stroke(); g.setLineDash([]);
      xs.forEach((x, i) => { g.fillStyle = i === 0 ? '#e2c47f' : '#24493a'; g.strokeStyle = '#e2c47f'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill(); g.stroke(); });
      g.fillStyle = '#8e2a2a'; g.strokeStyle = '#e2c47f'; g.lineWidth = 6; g.beginPath(); g.arc(872, y, 44, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#f0d896'; g.beginPath(); g.moveTo(860, y - 22); g.lineTo(860, y + 22); g.lineTo(892, y); g.closePath(); g.fill();
    });
  }
  function texVentana() {
    return lienzoTex(256, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#0d1a33'); gr.addColorStop(.6, '#1f3554'); gr.addColorStop(1, '#3b4e6b');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = azar(11);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,240,${.3 + r() * .6})`; g.fillRect(r() * w, r() * h * .6, 1.6, 1.6); }
      g.fillStyle = '#f3ecd0'; g.beginPath(); g.arc(w * .68, h * .2, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1f3554'; g.beginPath(); g.arc(w * .68 + 9, h * .2 - 5, 20, 0, Math.PI * 2); g.fill();
    });
  }
  function texGlobo() {
    return lienzoTex(512, 256, (g, w, h) => {
      g.fillStyle = '#d9c79a'; g.fillRect(0, 0, w, h);
      const r = azar(21);
      g.fillStyle = '#8a7a4a';
      for (let i = 0; i < 26; i++) {
        g.beginPath(); const cx = r() * w, cy = 30 + r() * (h - 60);
        for (let a = 0; a < 6.3; a += .5) { const rr = 12 + r() * 26; g.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr); }
        g.fill();
      }
      g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 1;
      for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    });
  }

  /* ───────── Materiales ───────── */
  const M = {};
  function materiales() {
    M.nogal = new T.MeshLambertMaterial({ color: 0x4a2c18 });
    M.nogalOsc = new T.MeshLambertMaterial({ color: 0x2c190d });
    M.fondo = new T.MeshLambertMaterial({ color: 0x1e120a });
    M.laton = new T.MeshStandardMaterial({ color: 0xc39d52, metalness: .75, roughness: .32 });
    M.cueroVerde = new T.MeshLambertMaterial({ color: 0x1f4a35 });
    M.cueroRojo = new T.MeshLambertMaterial({ color: 0x6a2420 });
    M.vidrioVerde = new T.MeshStandardMaterial({ color: 0x2e8a52, emissive: 0x0d3a1f, metalness: .1, roughness: .2, transparent: true, opacity: .92 });
    M.papel = new T.MeshLambertMaterial({ color: 0xeee2c3 });
    M.vela = new T.MeshLambertMaterial({ color: 0xf3ead0, emissive: 0x332a18 });
    M.llama = new T.MeshBasicMaterial({ color: 0xffd27a });
    M.negro = new T.MeshLambertMaterial({ color: 0x151010 });
    M.arena = new T.MeshLambertMaterial({ color: 0xd9b46a, emissive: 0x2a1c06 });
    M.vidrio = new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .22, roughness: .05, metalness: 0 });
  }

  function caja(w, h, d, mat, x, y, z, padre) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if (padre) padre.add(m); return m;
  }
  function cil(rt, rb, h, mat, x, y, z, padre, seg) {
    const m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 16), mat);
    m.position.set(x, y, z); if (padre) padre.add(m); return m;
  }

  /* ───────── Sala ───────── */
  function construirSala() {
    const W = 16, L = 24, H = 6.2;
    const piso = new T.Mesh(new T.PlaneGeometry(W, L), new T.MeshLambertMaterial({ map: texPiso() }));
    piso.rotation.x = -Math.PI / 2; scene.add(piso); pisables.push(piso);

    const tapiz = new T.MeshLambertMaterial({ map: texPapelTapiz() });
    const zoc = new T.MeshLambertMaterial({ map: texZocalo() });
    const paredes = [
      { w: L, x: -W / 2, z: 0, ry: Math.PI / 2 }, { w: L, x: W / 2, z: 0, ry: -Math.PI / 2 },
      { w: W, x: 0, z: -L / 2, ry: 0 }, { w: W, x: 0, z: L / 2, ry: Math.PI }
    ];
    paredes.forEach(p => {
      const m = new T.Mesh(new T.PlaneGeometry(p.w, H), tapiz);
      m.position.set(p.x, H / 2, p.z); m.rotation.y = p.ry; scene.add(m);
      const z = new T.Mesh(new T.PlaneGeometry(p.w, 1.15), zoc);
      z.position.set(p.x, .575, p.z); z.rotation.y = p.ry; z.translateZ(.02); scene.add(z);
      const moldura = new T.Mesh(new T.BoxGeometry(p.w, .08, .06), M.nogalOsc);
      moldura.position.set(p.x, 1.17, p.z); moldura.rotation.y = p.ry; moldura.translateZ(.04); scene.add(moldura);
      const cornisa = new T.Mesh(new T.BoxGeometry(p.w, .22, .2), M.nogal);
      cornisa.position.set(p.x, H - .11, p.z); cornisa.rotation.y = p.ry; cornisa.translateZ(.1); scene.add(cornisa);
    });
    const techo = new T.Mesh(new T.PlaneGeometry(W, L), new T.MeshLambertMaterial({ color: 0x24160d }));
    techo.rotation.x = Math.PI / 2; techo.position.y = H; scene.add(techo);
    for (let z = -10; z <= 10; z += 2.5) caja(W, .24, .26, M.nogalOsc, 0, H - .12, z, scene);   // vigas

    // ventana arqueada en la pared del fondo
    const vent = new T.Group(); vent.position.set(0, 0, -L / 2 + .03); scene.add(vent);
    const vidrio = new T.Mesh(new T.PlaneGeometry(2.2, 3.4), new T.MeshBasicMaterial({ map: texVentana() }));
    vidrio.position.set(0, 3.1, 0); vent.add(vidrio);
    const arco = new T.Mesh(new T.CircleGeometry(1.1, 32, 0, Math.PI), new T.MeshBasicMaterial({ color: 0x0f1d38 }));
    arco.position.set(0, 4.8, 0); vent.add(arco);
    caja(2.4, .12, .14, M.nogal, 0, 1.38, .05, vent); caja(.12, 3.5, .14, M.nogal, -1.14, 3.1, .05, vent); caja(.12, 3.5, .14, M.nogal, 1.14, 3.1, .05, vent);
    caja(.06, 3.4, .1, M.nogalOsc, 0, 3.1, .06, vent); caja(2.2, .06, .1, M.nogalOsc, 0, 3.1, .06, vent); caja(2.2, .06, .1, M.nogalOsc, 0, 4.0, .06, vent);
    const luzLuna = new T.SpotLight(0x9fb6e8, .5, 14, .6, .8, 2); luzLuna.position.set(0, 4, -11.5); luzLuna.target.position.set(0, 0, -6); scene.add(luzLuna, luzLuna.target);

    // alfombra bajo las mesas
    const alf = new T.Mesh(new T.PlaneGeometry(6.2, 10.5), new T.MeshLambertMaterial({ map: texAlfombra() }));
    alf.rotation.x = -Math.PI / 2; alf.position.set(0, .006, .4); scene.add(alf); pisables.push(alf);
  }

  /* ───────── Estantes ───────── */
  const PALETA = ['#5a1f22', '#23412f', '#2b3550', '#4a3420', '#6b2a1a', '#3d4a22', '#2f2a44', '#1f4a4a', '#5b4a1a', '#3a1f3a', '#7a5a2a', '#2a2622', '#6a4a3a', '#8a6a3a', '#40302a'];
  let geoLibro, matLibro;
  function construirEstante(mod, x, z, ry) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const A = 2.5, H = 4.3, P = .52;
    caja(.1, H, P, M.nogal, -A / 2, H / 2, 0, g); caja(.1, H, P, M.nogal, A / 2, H / 2, 0, g);
    caja(A, H, .04, M.fondo, 0, H / 2, -P / 2 + .02, g);
    caja(A + .3, .28, P + .14, M.nogal, 0, H + .1, .04, g);           // corona
    caja(A + .4, .06, P + .2, M.nogalOsc, 0, H + .26, .06, g);
    caja(A + .12, .22, P + .06, M.nogalOsc, 0, .11, .02, g);          // zócalo
    const niveles = [.24, 1.04, 1.84, 2.64, 3.44];
    niveles.forEach(y => caja(A - .02, .05, P - .04, M.nogal, 0, y, 0, g));
    caja(A - .02, .05, P - .04, M.nogal, 0, 4.22, 0, g);

    // libros (instanciados)
    const r = azar(mod.id * 97 + 5);
    const libros = [];
    niveles.forEach((y, ni) => {
      let cx = -A / 2 + .08;
      while (cx < A / 2 - .14) {
        if (r() < .05) { cx += .1 + r() * .14; continue; }          // hueco
        const w = .045 + r() * .05, h = .5 + r() * .22, d = .3 + r() * .08;
        const col = r() < .42 ? mod.lomo : PALETA[(r() * PALETA.length) | 0];
        const incl = (cx > A / 2 - .4 && r() < .5) ? -(.12 + r() * .18) : 0;
        libros.push({ x: cx + w / 2, y: y + .025 + h / 2, z: .02 + (r() - .5) * .03, w, h, d, col, incl });
        cx += w + .003;
      }
    });
    const inst = new T.InstancedMesh(geoLibro, matLibro, libros.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3(), c = new T.Color();
    libros.forEach((b, i) => {
      e.set(0, 0, b.incl); q.setFromEuler(e); s.set(b.w, b.h, b.d); p.set(b.x, b.y, b.z);
      m4.compose(p, q, s); inst.setMatrixAt(i, m4);
      c.set(b.col); c.offsetHSL(0, 0, (r() - .5) * .08); inst.setColorAt(i, c);
    });
    g.add(inst);

    // placa de latón
    const placaMat = new T.MeshStandardMaterial({ map: texPlaca(romano(mod.id), mod.corto), metalness: .55, roughness: .38, emissive: 0x000000 });
    const placa = new T.Mesh(new T.PlaneGeometry(1.7, .53), placaMat);
    placa.position.set(0, H + .1, P / 2 + .115); g.add(placa);
    // escalerilla de bronce (riel)
    const riel = cil(.014, .014, A + .2, M.laton, 0, 3.98, P / 2 + .12, g, 8); riel.rotation.z = Math.PI / 2;

    // volumen de selección invisible
    const zona = new T.Mesh(new T.BoxGeometry(A + .3, H + .5, P + .3), new T.MeshBasicMaterial({ visible: false }));
    zona.position.set(0, H / 2 + .1, .05); g.add(zona);
    const ancla = new T.Vector3(0, H + .55, P / 2 + .1); g.localToWorld(ancla);
    registrar('estante', mod.id, zona, ancla, `<b>${romano(mod.id)}</b>${mod.corto}`, placaMat, g);
  }

  /* ───────── Muebles ───────── */
  function silla(x, z, ry) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].forEach(([a, b]) => caja(.05, .46, .05, M.nogalOsc, a, .23, b, g));
    caja(.5, .06, .5, M.cueroRojo, 0, .48, 0, g);
    caja(.5, .6, .05, M.nogal, 0, .8, -.23, g);
    caja(.42, .4, .03, M.cueroRojo, 0, .82, -.205, g);
  }
  function lamparaBanquero(x, y, z, padre) {
    const g = new T.Group(); g.position.set(x, y, z); padre.add(g);
    cil(.11, .13, .03, M.laton, 0, .015, 0, g);
    cil(.012, .012, .32, M.laton, 0, .18, 0, g);
    const pant = new T.Mesh(new T.CylinderGeometry(.08, .17, .14, 20, 1, true, 0, Math.PI), M.vidrioVerde);
    pant.rotation.z = Math.PI / 2; pant.rotation.y = Math.PI / 2; pant.position.set(0, .36, 0); g.add(pant);
    const foco = new T.Mesh(new T.SphereGeometry(.035, 10, 8), M.llama); foco.position.set(0, .33, 0); g.add(foco);
    const luz = new T.PointLight(0xffc98a, .8, 3.2, 2); luz.position.set(0, .28, .05); g.add(luz);
    return g;
  }
  function mesaSesion(z) {
    const g = new T.Group(); g.position.set(0, 0, z); scene.add(g);
    caja(3.8, .08, 1.3, M.nogal, 0, .78, 0, g);
    caja(3.4, .012, .95, M.cueroVerde, 0, .826, 0, g);
    [[-1.75, -.55], [1.75, -.55], [-1.75, .55], [1.75, .55]].forEach(([a, b]) => cil(.06, .045, .74, M.nogalOsc, a, .37, b, g, 10));
    caja(3.5, .12, .05, M.nogalOsc, 0, .68, .6, g); caja(3.5, .12, .05, M.nogalOsc, 0, .68, -.6, g);
    lamparaBanquero(-1.25, .83, -.25, g); lamparaBanquero(1.25, .83, -.25, g);
    // radio de válvulas: «en vivo»
    const radio = new T.Group(); radio.position.set(0, .83, -.2); g.add(radio);
    caja(.62, .44, .3, M.nogal, 0, .22, 0, radio);
    const tela = new T.Mesh(new T.CircleGeometry(.15, 24), new T.MeshLambertMaterial({ color: 0xb69a68 })); tela.position.set(-.1, .25, .151); radio.add(tela);
    const dial = new T.Mesh(new T.PlaneGeometry(.16, .08), new T.MeshBasicMaterial({ color: 0xffd98a })); dial.position.set(.17, .3, .151); radio.add(dial);
    cil(.025, .025, .03, M.laton, .12, .12, .16, radio, 10).rotation.x = Math.PI / 2;
    cil(.025, .025, .03, M.laton, .22, .12, .16, radio, 10).rotation.x = Math.PI / 2;
    // micrófono de cinta
    const mic = new T.Group(); mic.position.set(.75, .83, .15); g.add(mic);
    cil(.07, .08, .02, M.laton, 0, .01, 0, mic); cil(.01, .01, .26, M.laton, 0, .14, 0, mic);
    const cap = new T.Mesh(new T.CapsuleGeometry(.045, .09, 6, 12), M.laton); cap.position.set(0, .32, 0); mic.add(cap);
    // libros abiertos y cuadernos
    caja(.5, .03, .34, M.papel, -.7, .845, .25, g).rotation.y = .2;
    caja(.46, .03, .32, M.papel, .35, .845, .3, g).rotation.y = -.15;
    const letrero = new T.Mesh(new T.PlaneGeometry(.9, .28), new T.MeshStandardMaterial({ map: texPlaca('Sesión sincrónica', null, true), metalness: .2, roughness: .6 }));
    letrero.position.set(0, 1.42, -.2); g.add(letrero);
    silla(-1.2, z - .95, 0); silla(1.2, z - .95, 0); silla(-1.2, z + .95, Math.PI); silla(1.2, z + .95, Math.PI); silla(0, z + .95, Math.PI);
    const zona = new T.Mesh(new T.BoxGeometry(4.2, 1.8, 2.4), new T.MeshBasicMaterial({ visible: false })); zona.position.set(0, .9, 0); g.add(zona);
    registrar('mesa', 'sesion', zona, new T.Vector3(0, 1.85, z), 'Sesión sincrónica', letrero.material, g, true);
  }
  function relojArena(x, y, z, padre) {
    const g = new T.Group(); g.position.set(x, y, z); padre.add(g);
    cil(.11, .11, .025, M.nogal, 0, .012, 0, g); cil(.11, .11, .025, M.nogal, 0, .36, 0, g);
    [[.08, 0], [-.04, .07], [-.04, -.07]].forEach(([a, b]) => cil(.008, .008, .34, M.nogalOsc, a, .186, b, g, 6));
    const sup = new T.Mesh(new T.ConeGeometry(.07, .15, 18, 1, true), M.vidrio); sup.rotation.x = Math.PI; sup.position.y = .27; g.add(sup);
    const inf = new T.Mesh(new T.ConeGeometry(.07, .15, 18, 1, true), M.vidrio); inf.position.y = .1; g.add(inf);
    const ar = new T.Mesh(new T.ConeGeometry(.055, .07, 16), M.arena); ar.position.y = .06; g.add(ar);
    const ar2 = new T.Mesh(new T.ConeGeometry(.04, .05, 16), M.arena); ar2.rotation.x = Math.PI; ar2.position.y = .22; g.add(ar2);
    return g;
  }
  function mesaSimulacro(z) {
    const g = new T.Group(); g.position.set(0, 0, z); scene.add(g);
    caja(2.6, .08, 1.15, M.nogal, 0, .78, 0, g);
    caja(2.3, .012, .85, M.cueroRojo, 0, .826, 0, g);
    caja(2.4, .6, .05, M.nogalOsc, 0, .46, -.5, g); caja(.05, .6, 1, M.nogalOsc, -1.2, .46, 0, g); caja(.05, .6, 1, M.nogalOsc, 1.2, .46, 0, g);
    relojArena(-.75, .83, -.1, g);
    for (let i = 0; i < 7; i++) caja(.3, .006, .42, M.papel, .15 + (i % 2) * .01, .836 + i * .007, .05 + (i % 3) * .008, g).rotation.y = (i - 3) * .03;
    cil(.05, .06, .07, M.negro, .62, .87, -.2, g, 12);                        // tintero
    const pluma = new T.Mesh(new T.ConeGeometry(.02, .32, 6), M.papel); pluma.position.set(.66, 1, -.18); pluma.rotation.z = -.5; g.add(pluma);
    const relojB = cil(.07, .07, .018, M.laton, .45, .845, .3, g, 24);       // reloj de bolsillo
    const cara = new T.Mesh(new T.CircleGeometry(.058, 24), M.papel); cara.rotation.x = -Math.PI / 2; cara.position.set(.45, .855, .3); g.add(cara);
    lamparaBanquero(-.25, .83, -.32, g);
    const letrero = new T.Mesh(new T.PlaneGeometry(.8, .25), new T.MeshStandardMaterial({ map: texPlaca('Simulacro', null, true), metalness: .2, roughness: .6 }));
    letrero.position.set(0, 1.3, -.35); g.add(letrero);
    silla(-.5, z + .85, Math.PI); silla(.5, z + .85, Math.PI);
    const zona = new T.Mesh(new T.BoxGeometry(3, 1.7, 2.2), new T.MeshBasicMaterial({ visible: false })); zona.position.set(0, .85, .1); g.add(zona);
    registrar('mesa', 'simulacro', zona, new T.Vector3(0, 1.7, z), 'Simulacro', letrero.material, g, true);
  }
  function arana(x, z) {
    const g = new T.Group(); g.position.set(x, 4.9, z); scene.add(g);
    cil(.012, .012, 1.2, M.laton, 0, .7, 0, g, 6);
    const aro = new T.Mesh(new T.TorusGeometry(.62, .025, 8, 40), M.laton); aro.rotation.x = Math.PI / 2; g.add(aro);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, cx = Math.cos(a) * .62, cz = Math.sin(a) * .62;
      cil(.025, .025, .14, M.vela, cx, .08, cz, g, 8);
      const ll = new T.Mesh(new T.SphereGeometry(.022, 8, 6), M.llama); ll.position.set(cx, .17, cz); ll.scale.y = 1.6; g.add(ll);
    }
    const luz = new T.PointLight(0xffbd78, 1.35, 15, 2); luz.position.set(0, -.2, 0); g.add(luz);
  }
  function globo(x, z) {
    const g = new T.Group(); g.position.set(x, 0, z); scene.add(g);
    [0, 2.1, 4.2].forEach(a => { const p = caja(.04, .8, .04, M.nogalOsc, Math.cos(a) * .2, .4, Math.sin(a) * .2, g); p.rotation.z = Math.cos(a) * .15; p.rotation.x = -Math.sin(a) * .15; });
    const aro = new T.Mesh(new T.TorusGeometry(.36, .015, 6, 40), M.laton); aro.position.y = 1.15; g.add(aro);
    const esf = new T.Mesh(new T.SphereGeometry(.33, 32, 20), new T.MeshLambertMaterial({ map: texGlobo() }));
    esf.position.y = 1.15; esf.rotation.z = .41; g.add(esf); g.userData.esfera = esf;
    caja(.5, .05, .5, M.nogal, 0, .8, 0, g);
    return g;
  }
  function escalera(x, z, ry) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const inc = .2;
    [-.22, .22].forEach(dx => { const r = caja(.05, 4.2, .06, M.nogal, dx, 2.05, 0, g); r.rotation.x = -inc; });
    for (let i = 0; i < 12; i++) { const y = .3 + i * .33; caja(.44, .04, .05, M.nogalOsc, 0, y, -Math.tan(inc) * (y - 2.05), g); }
  }

  // Señal colgante sobre el pasillo central, visible desde la entrada
  function senalRuta() {
    const Y = 3.55, W = 2.5, H = .94;
    const g = new T.Group(); g.position.set(0, Y, 0); scene.add(g);
    caja(W + .14, H + .14, .07, M.nogal, 0, 0, 0, g);
    const mat = new T.MeshStandardMaterial({ map: texRuta(), metalness: .12, roughness: .62, emissive: 0x000000 });
    const cara = new T.Mesh(new T.PlaneGeometry(W, H), mat); cara.position.z = .037; g.add(cara);
    const dorso = new T.Mesh(new T.PlaneGeometry(W, H), mat); dorso.rotation.y = Math.PI; dorso.position.z = -.037; g.add(dorso);
    const arriba = Y + H / 2 + .07, viga = 6.2 - .24, largo = viga - arriba;
    [-W * .38, W * .38].forEach(x => {
      cil(.009, .009, largo, M.laton, x, H / 2 + .07 + largo / 2, 0, g, 6);
      const argolla = new T.Mesh(new T.TorusGeometry(.035, .01, 6, 14), M.laton); argolla.position.set(x, H / 2 + .1, 0); g.add(argolla);
    });
    const zona = new T.Mesh(new T.BoxGeometry(W + .5, H + .5, .6), new T.MeshBasicMaterial({ visible: false })); g.add(zona);
    const icono = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1l7 4-7 4z"/></svg>';
    registrar('ruta', 'ruta', zona, new T.Vector3(0, Y + H / 2 + .42, 0), icono + 'Ruta del curso', mat, g, true);
  }

  function crearPolvo() {
    const n = 380, geo = new T.BufferGeometry(), arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = (Math.random() - .5) * 13; arr[i * 3 + 1] = Math.random() * 5.5; arr[i * 3 + 2] = (Math.random() - .5) * 20; }
    geo.setAttribute('position', new T.BufferAttribute(arr, 3));
    const mota = lienzoTex(32, 32, (g) => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,240,210,1)'); r.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
    polvo = new T.Points(geo, new T.PointsMaterial({ color: 0xffe2a8, map: mota, size: .03, transparent: true, opacity: .5, depthWrite: false, blending: T.AdditiveBlending }));
    scene.add(polvo);
  }

  function registrar(tipo, id, zona, ancla, html, placaMat, grupo, esMesa) {
    zona.userData = { tipo, id };
    const etq = document.createElement('div');
    etq.className = 'etq' + (esMesa ? ' mesa' : ''); etq.innerHTML = html; etq.style.opacity = 0;
    capaEtq.appendChild(etq);
    interactivos.push({ tipo, id, obj: zona, ancla, etq, placaMat, grupo });
  }

  /* ───────── Cámara y controles ───────── */
  function dir() { return new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
  function aplicarCamara() {
    camera.position.copy(pos);
    camera.lookAt(pos.clone().add(dir()));
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  function animar(destPos, destYaw, destPitch, dur, fin) {
    const ini = { p: pos.clone(), y: yaw, pi: pitch }, t0 = performance.now();
    let dy = destYaw - ini.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const d = opts.reducido ? 1 : dur;
    anim = (t) => {
      const k = Math.min(1, (t - t0) / d), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      if (destPos) pos.lerpVectors(ini.p, destPos, e);
      yaw = ini.y + dy * e; if (destPitch != null) pitch = ini.pi + (destPitch - ini.pi) * e;
      if (k >= 1) { anim = null; if (fin) fin(); }
    };
  }
  function enfocar(it, fin) {
    const centro = new T.Vector3(); it.obj.getWorldPosition(centro);
    const v = centro.clone().sub(pos); v.y = 0;
    const dist = v.length();
    let destino = null;
    if (dist > 4.2) { destino = pos.clone().add(v.clone().setLength(dist - 3.6)); destino.y = 1.62; limitar(destino); }
    const desde = destino || pos;
    const w = centro.clone().sub(desde);
    const ny = Math.atan2(w.x, -w.z);
    const np = Math.atan2(centro.y - 1.62, Math.hypot(w.x, w.z)) * .6;
    animar(destino, ny, np, 650, fin);
  }
  function limitar(v) {
    v.x = Math.max(-LIM.x, Math.min(LIM.x, v.x));
    v.z = Math.max(LIM.zMin, Math.min(LIM.zMax, v.z));
    // no atravesar las mesas
    const mesas = [{ z: -3.2, a: 2.5, p: 1.75 }, { z: 3.6, a: 1.9, p: 1.6 }];
    mesas.forEach(m => {
      if (Math.abs(v.x) < m.a && Math.abs(v.z - m.z) < m.p) v.z = m.z + (v.z >= m.z ? m.p : -m.p);
    });
    return v;
  }

  function controles() {
    const punteros = new Map();
    let arrastre = null, pinza = null;
    lienzo.addEventListener('pointerdown', e => {
      lienzo.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 1) arrastre = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, movido: false, t: performance.now() };
      if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pinza = { d: Math.hypot(a.x - b.x, a.y - b.y), fov }; arrastre = null; }
      ocultarPista();
    });
    lienzo.addEventListener('pointermove', e => {
      if (!punteros.has(e.pointerId)) { hover(e); return; }
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinza && punteros.size === 2) {
        const [a, b] = [...punteros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        fov = Math.max(38, Math.min(78, pinza.fov * pinza.d / d));
        return;
      }
      if (!arrastre) return;
      const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
      arrastre.x = e.clientX; arrastre.y = e.clientY;
      if (Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) > 9) arrastre.movido = true;
      if (arrastre.movido) {
        anim = null;
        const k = 2.2 / Math.min(innerWidth, innerHeight) * (fov / 62);
        yaw -= dx * k; pitch = Math.max(-.75, Math.min(.6, pitch + dy * k));
      }
    });
    const soltar = e => {
      const a = arrastre;
      punteros.delete(e.pointerId);
      if (punteros.size < 2) pinza = null;
      if (a && !a.movido && punteros.size === 0 && e.type === 'pointerup') tocar(e.clientX, e.clientY);
      if (punteros.size === 0) arrastre = null;
    };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    lienzo.addEventListener('wheel', e => { e.preventDefault(); fov = Math.max(38, Math.min(78, fov + e.deltaY * .03)); }, { passive: false });
    addEventListener('keydown', e => {
      if (pausada) return;
      const paso = .5, f = new T.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)), l = new T.Vector3(f.z, 0, -f.x);
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') limitar(pos.addScaledVector(f, paso));
      else if (k === 'arrowdown' || k === 's') limitar(pos.addScaledVector(f, -paso));
      else if (k === 'arrowleft' || k === 'a') yaw -= .12;
      else if (k === 'arrowright' || k === 'd') yaw += .12;
    });
  }
  function rayo(x, y) {
    const r = lienzo.getBoundingClientRect();
    const ptr = new T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ptr, camera);
  }
  function tocar(x, y) {
    rayo(x, y);
    const hit = raycaster.intersectObjects(interactivos.map(i => i.obj), false)[0];
    const hitPiso = raycaster.intersectObjects(pisables, false)[0];
    if (hit && (!hitPiso || hit.distance <= hitPiso.distance + .5)) {
      const it = interactivos.find(i => i.obj === hit.object);
      marcar(it);
      if (opts.sonidoToque) opts.sonidoToque();
      enfocar(it, () => opts.onSeleccion && opts.onSeleccion(it.tipo, it.id));
      return;
    }
    if (hitPiso) {
      const dest = hitPiso.point.clone(); dest.y = 1.62; limitar(dest);
      const v = dest.clone().sub(pos);
      if (v.length() > .3) animar(dest, Math.atan2(v.x, -v.z), pitch * .5, Math.min(1400, 300 + v.length() * 140));
    }
  }
  let ultHover = 0;
  function hover(e) {
    if (e.pointerType !== 'mouse') return;
    const t = performance.now(); if (t - ultHover < 60) return; ultHover = t;
    rayo(e.clientX, e.clientY);
    const hit = raycaster.intersectObjects(interactivos.map(i => i.obj), false)[0];
    const it = hit ? interactivos.find(i => i.obj === hit.object) : null;
    lienzo.style.cursor = it ? 'pointer' : 'grab';
    marcar(it);
  }
  function marcar(it) {
    if (resaltado === it) return;
    if (resaltado && resaltado.placaMat) resaltado.placaMat.emissive.setHex(0x000000);
    resaltado = it || null;
    if (it && it.placaMat) it.placaMat.emissive.setHex(0x4a3208);
    if (it) { const c = new T.Vector3(); it.obj.getWorldPosition(c); luzFoco.position.set(c.x * .8, 3.2, c.z); luzFoco.intensity = .9; }
    else luzFoco.intensity = 0;
  }
  function ocultarPista() { const p = document.getElementById('pista'); if (p && !p.hidden) { p.hidden = true; try { if (window.Almacen) Almacen.set('bdo.pista', '1'); else localStorage.setItem('bdo.pista', '1'); } catch (e) {} } }

  /* ───────── Etiquetas HTML proyectadas ───────── */
  const tmp = new T.Vector3();
  function etiquetas() {
    const w = lienzo.clientWidth, h = lienzo.clientHeight;
    interactivos.forEach(it => {
      tmp.copy(it.ancla).project(camera);
      const dist = it.ancla.distanceTo(pos);
      const lejos = it.tipo === 'mesa' ? 16 : it.tipo === 'ruta' ? 19 : 11.5;
      const visible = tmp.z < 1 && tmp.x > -1.1 && tmp.x < 1.1 && tmp.y > -1.1 && tmp.y < 1.2 && dist < lejos;
      it._op = visible ? Math.max(0, Math.min(1, (lejos - dist) / 3.5)) : 0;
      it._x = (tmp.x * .5 + .5) * w; it._y = (-tmp.y * .5 + .5) * h; it._d = dist;
    });
    // las etiquetas cercanas tienen prioridad; se ocultan las que se solapan
    const puestas = [];
    interactivos.filter(it => it._op > 0).sort((a, b) => a._d - b._d).forEach(it => {
      if (!it._w) it._w = it.etq.offsetWidth || 120;
      const r = { x0: it._x - it._w / 2 - 4, x1: it._x + it._w / 2 + 4, y0: it._y - 30, y1: it._y + 2 };
      if (puestas.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) it._op = 0; else puestas.push(r);
    });
    interactivos.forEach(it => {
      it.etq.style.opacity = it._op.toFixed(2);
      if (it._op > 0) it.etq.style.transform = `translate(${it._x}px,${it._y}px) translate(-50%,-100%)`;
    });
  }

  /* ───────── Bucle ───────── */
  let globoObj = null;
  function cuadro(t) {
    rafId = 0;
    if (pausada) return;
    if (anim) anim(t);
    aplicarCamara();
    if (polvo && !opts.reducido) {
      const a = polvo.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) { let y = a.getY(i) - .0016; if (y < 0) y = 5.5; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * .0003 + i) * .0008); }
      a.needsUpdate = true;
    }
    if (globoObj && !opts.reducido) globoObj.userData.esfera.rotation.y += .002;
    if (resaltado && resaltado.placaMat) { const k = .55 + .45 * Math.sin(t * .006); resaltado.placaMat.emissive.setRGB(.3 * k, .2 * k, .04 * k); }
    renderer.render(scene, camera);
    etiquetas();
    rafId = requestAnimationFrame(cuadro);
  }
  function redimensionar() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fov = w < h ? Math.max(fov, 70) : fov;
    camera.updateProjectionMatrix();
  }

  Escena.iniciar = function (canvas, capa, o) {
    opts = o || {};
    lienzo = canvas; capaEtq = capa;
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .92;
    scene = new T.Scene();
    scene.background = new T.Color(0x140c07);
    scene.fog = new T.Fog(0x140c07, 12, 26);
    camera = new T.PerspectiveCamera(fov, innerWidth / innerHeight, .05, 60);
    raycaster = new T.Raycaster();
    materiales();
    geoLibro = new T.BoxGeometry(1, 1, 1);
    matLibro = new T.MeshLambertMaterial({ color: 0xffffff });

    scene.add(new T.HemisphereLight(0xffe3b8, 0x2a1a10, .5));
    scene.add(new T.AmbientLight(0x3d2817, .38));
    luzFoco = new T.PointLight(0xffd9a0, 0, 6, 2); scene.add(luzFoco);

    construirSala();
    const mods = window.MODULOS;
    const izq = [-7.3, -2.6, 2.1, 6.8], der = [-7.3, -2.6, 2.1, 6.8];
    // pared izquierda: estantes 1 a 4; pared derecha: 5 a 8; fondo: 9 y 10
    izq.forEach((z, i) => construirEstante(mods[i], -7.66, z, Math.PI / 2));
    der.forEach((z, i) => construirEstante(mods[4 + i], 7.66, z, -Math.PI / 2));
    construirEstante(mods[8], -4.2, -11.66, 0);
    construirEstante(mods[9], 4.2, -11.66, 0);
    mesaSesion(-3.2);
    mesaSimulacro(3.6);
    arana(0, -3.2); arana(0, 3.6);
    senalRuta();
    globoObj = globo(-5.6, 9.8);
    escalera(-7.05, -4.95, Math.PI / 2);
    crearPolvo();
    controles();
    addEventListener('resize', redimensionar);
    redimensionar();
    aplicarCamara();
    reloj = performance.now();
    rafId = requestAnimationFrame(cuadro);
    return true;
  };
  Escena.pausar = function (p) {
    pausada = !!p;
    if (!pausada && !rafId) rafId = requestAnimationFrame(cuadro);
    if (pausada) interactivos.forEach(i => i.etq.style.opacity = 0);
  };
  Escena.ir = function (tipo, id) {
    const it = interactivos.find(i => i.tipo === tipo && String(i.id) === String(id));
    if (it) { marcar(it); enfocar(it); }
  };
  Escena.quitarResaltado = function () { marcar(null); };
})();
