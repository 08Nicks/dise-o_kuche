/**
 * =====================================================================
 * KUCHE API BRIDGE & PWA ENGINE (kuche-api.js) — v7.0 Static & Resilient
 * Conexión institucional 100% estática para GitHub Pages.
 * Desacoplado de túneles externos. Eliminación total de Cloudflare de URLs.
 * Instalador Universal PWA para Modo Demo y Modo Logueo.
 * =====================================================================
 */
(function() {
  // ─── 1. CAPTURA TRANSPARENTE DEL BACKEND Y LIMPIEZA DE BARRA DEL NAVEGADOR ───
  // Si la URL trae parámetros (?api=... o ?backend=...), se extraen para conectar
  // y se remueven de INMEDIATO de la barra del navegador sin recargar.
  // La barra del navegador muestra SIEMPRE una URL 100% limpia en GitHub Pages.
  let backendUrl = localStorage.getItem('kuche_backend_url') || '';

  try {
    const params = new URLSearchParams(window.location.search);
    const paramApi = params.get('api') || params.get('backend');
    if (paramApi && paramApi.startsWith('http')) {
      backendUrl = paramApi.trim().replace(/\/+$/, '');
      localStorage.setItem('kuche_backend_url', backendUrl);
    }
    // Si había cualquier parámetro en la URL, limpiarlo al instante de la barra del navegador
    if (window.location.search && (window.location.search.includes('api=') || window.location.search.includes('backend='))) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('api');
      cleanUrl.searchParams.delete('backend');
      const searchStr = cleanUrl.searchParams.toString();
      const cleanPath = cleanUrl.pathname + (searchStr ? '?' + searchStr : '') + cleanUrl.hash;
      window.history.replaceState({}, document.title, cleanPath);
    }
  } catch(e) {}

  const LOCAL_JSON_PATH = './backend_url.json';
  let isOnline = false;
  let listeners = [];
  let sincronizando = false;

  const isGitHubPages = window.location.hostname.includes('github.io');
  const isDirectBackend = window.location.port === '8000' || 
                          window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

  function notificar() {
    listeners.forEach(fn => {
      try { fn({ url: backendUrl, online: isOnline, staticMode: !backendUrl }); } catch(e) {}
    });
    actualizarBanner();
  }

  async function verificarPing(url) {
    if (!url) return false;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(url.replace(/\/+$/, '') + '/api/ping', { 
        cache: 'no-store',
        signal: ctrl.signal 
      });
      clearTimeout(tid);
      return res.ok;
    } catch(e) {
      return false;
    }
  }

  function aplicarConfig(cfg) {
    if (!cfg) return false;
    const nuevaUrl = (cfg.backend_url || '').trim().replace(/\/+$/, '');
    if (nuevaUrl && nuevaUrl.startsWith('http')) {
      backendUrl = nuevaUrl;
      localStorage.setItem('kuche_backend_url', backendUrl);
      return true;
    }
    return false;
  }

  async function sincronizarUrl() {
    if (sincronizando) return backendUrl;
    sincronizando = true;

    try {
      // Caso 1: Servidor directo local
      if (isDirectBackend) {
        backendUrl = window.location.origin;
        isOnline = true;
        notificar();
        return backendUrl;
      }

      // Caso 2: Probar la URL que ya tengamos guardada
      if (backendUrl) {
        const sigueViva = await verificarPing(backendUrl);
        if (sigueViva) {
          isOnline = true;
          notificar();
          return backendUrl;
        }
      }

      // Caso 3: Probar backend_url.json (local y fallback raw GitHub directo)
      const fuentesJson = [
        `${LOCAL_JSON_PATH}?_t=${Date.now()}`,
        `https://raw.githubusercontent.com/08Nicks/dise-o_kuche/main/backend_url.json?_t=${Date.now()}`,
        `https://raw.githubusercontent.com/08Nicks/dise-o_kuche/gh-pages/backend_url.json?_t=${Date.now()}`
      ];
      for (const fuente of fuentesJson) {
        try {
          const r = await fetch(fuente, { cache: 'no-store' });
          if (r.ok) {
            const cfg = await r.json();
            if (aplicarConfig(cfg)) {
              const viva = await verificarPing(backendUrl);
              if (viva) {
                isOnline = true;
                notificar();
                return backendUrl;
              }
            }
          }
        } catch(e) {}
      }

      // Caso 4: Probar conexión directa a localhost:8000
      try {
        const vivaLocal = await verificarPing('http://127.0.0.1:8000');
        if (vivaLocal) {
          backendUrl = 'http://127.0.0.1:8000';
          localStorage.setItem('kuche_backend_url', backendUrl);
          isOnline = true;
          notificar();
          return backendUrl;
        }
      } catch(e) {}

      // Caso 5: Probar IP local de red Wi-Fi (para celulares y dispositivos en la misma red)
      try {
        const vivaLan = await verificarPing('http://192.168.100.13:8000');
        if (vivaLan) {
          backendUrl = 'http://192.168.100.13:8000';
          localStorage.setItem('kuche_backend_url', backendUrl);
          isOnline = true;
          notificar();
          return backendUrl;
        }
      } catch(e) {}

      // Si no hay respuesta
      isOnline = false;
      notificar();
      return backendUrl;
    } finally {
      sincronizando = false;
    }
  }

  function inyectarEstilosIndicador() {
    if (document.getElementById('kuche-server-badge-styles')) return;
    const style = document.createElement('style');
    style.id = 'kuche-server-badge-styles';
    style.textContent = `
      .kuche-server-pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        font-family: inherit;
        font-size: 11px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.25s ease;
        text-decoration: none;
        user-select: none;
        outline: none;
      }
      .kuche-server-pill-btn.online {
        background: rgba(16, 185, 129, 0.14);
        border: 1px solid rgba(16, 185, 129, 0.5);
        color: #10b981;
      }
      .kuche-server-pill-btn.online:hover {
        background: rgba(16, 185, 129, 0.25);
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
      }
      .kuche-server-pill-btn.offline {
        background: rgba(239, 68, 68, 0.14);
        border: 1px solid rgba(239, 68, 68, 0.5);
        color: #ef4444;
      }
      .kuche-server-pill-btn.offline:hover {
        background: rgba(239, 68, 68, 0.25);
        box-shadow: 0 0 10px rgba(239, 68, 68, 0.35);
      }
      .kuche-pill-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        display: inline-block;
      }
      .kuche-server-pill-btn.online .kuche-pill-dot {
        background: #10b981;
        box-shadow: 0 0 6px #10b981;
        animation: kuchePulseGreen 2s infinite ease-in-out;
      }
      .kuche-server-pill-btn.offline .kuche-pill-dot {
        background: #ef4444;
        box-shadow: 0 0 6px #ef4444;
        animation: kuchePulseRed 1.8s infinite ease-in-out;
      }
      @keyframes kuchePulseGreen {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.35); opacity: 0.6; }
      }
      @keyframes kuchePulseRed {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.35); opacity: 0.5; }
      }

      /* Modal de Estado de Servidor */
      .kuche-server-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        z-index: 999999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .kuche-server-modal-backdrop.active {
        display: flex;
      }
      .kuche-server-modal-card {
        background: #181517;
        border: 1px solid #332d30;
        border-radius: 14px;
        width: 100%;
        max-width: 440px;
        padding: 24px 22px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.8);
        color: #f1ecee;
        position: relative;
        font-family: inherit;
      }
      .kuche-server-modal-card h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        font-weight: 800;
        color: #E6D194;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .kuche-server-modal-card .close-btn {
        background: none;
        border: none;
        color: #A69CA1;
        font-size: 18px;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .kuche-server-modal-card .close-btn:hover {
        color: #fff;
      }
      .kuche-server-info-box {
        padding: 12px 14px;
        border-radius: 8px;
        margin-bottom: 16px;
        font-size: 12px;
        line-height: 1.5;
      }
      .kuche-server-info-box.online {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.4);
        color: #a7f3d0;
      }
      .kuche-server-info-box.offline {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.4);
        color: #fca5a5;
      }
      .kuche-input-group {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .kuche-modal-input {
        flex: 1;
        background: #0f0d0f;
        border: 1px solid #3a3236;
        color: #fff;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        outline: none;
      }
      .kuche-modal-input:focus {
        border-color: #9B2247;
      }
      .kuche-modal-btn {
        background: #9B2247;
        color: #fff;
        border: none;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.2s;
      }
      .kuche-modal-btn:hover {
        background: #b82954;
      }
      .kuche-modal-sec-btn {
        background: #252124;
        color: #E6D194;
        border: 1px solid #3a3236;
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        text-decoration: none;
        display: inline-block;
        text-align: center;
      }
      .kuche-modal-sec-btn:hover {
        background: #332d30;
      }
    `;
    document.head.appendChild(style);
  }

  function actualizarIndicadorServidor() {
    inyectarEstilosIndicador();

    const statusClass = isOnline ? 'online' : 'offline';
    const statusText  = isOnline ? 'Server Online' : 'Server Offline';
    const statusTitle = isOnline 
      ? `Servidor KUCHE En Línea (${backendUrl}). IA YOLO-World activa.` 
      : 'Servidor KUCHE Desconectado (Offline). Clic para conectar o ver opciones.';

    // Actualizar todos los botones de estado existentes
    const pills = document.querySelectorAll('.kuche-server-pill-btn');
    if (pills.length > 0) {
      pills.forEach(p => {
        p.className = `kuche-server-pill-btn ${statusClass}`;
        p.title = statusTitle;
        p.innerHTML = `<span class="kuche-pill-dot"></span><span>${statusText}</span>`;
      });
    } else {
      // Crear un botón en los lugares estándar
      const targets = [
        document.querySelector('.app-header > div:last-child'),
        document.querySelector('.auth-header-brand'),
        document.getElementById('brand-auth-container'),
        document.querySelector('#view-auth-container .auth-card-box')
      ];

      let montado = false;
      for (const t of targets) {
        if (t) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `kuche-server-pill-btn ${statusClass}`;
          btn.title = statusTitle;
          btn.innerHTML = `<span class="kuche-pill-dot"></span><span>${statusText}</span>`;
          btn.onclick = () => window.KucheAPI && window.KucheAPI.abrirModalServidor();
          
          if (t.classList.contains('auth-header-brand')) {
            btn.style.marginTop = '8px';
            t.appendChild(btn);
          } else if (t.classList.contains('auth-card-box')) {
            btn.style.marginBottom = '12px';
            t.insertBefore(btn, t.firstChild);
          } else {
            t.insertBefore(btn, t.firstChild);
          }
          montado = true;
          break;
        }
      }

      // Si no se encontró ningún contenedor, crear como botón flotante fijo
      if (!montado && document.body) {
        const floatDiv = document.createElement('div');
        floatDiv.id = 'kuche-server-floating-badge';
        floatDiv.style.cssText = 'position:fixed; top:12px; right:12px; z-index:99998;';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `kuche-server-pill-btn ${statusClass}`;
        btn.title = statusTitle;
        btn.innerHTML = `<span class="kuche-pill-dot"></span><span>${statusText}</span>`;
        btn.onclick = () => window.KucheAPI && window.KucheAPI.abrirModalServidor();
        floatDiv.appendChild(btn);
        document.body.appendChild(floatDiv);
      }
    }

    actualizarContenidoModal();
  }

  function abrirModalServidor() {
    inyectarEstilosIndicador();
    let modal = document.getElementById('kuche-server-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'kuche-server-modal';
      modal.className = 'kuche-server-modal-backdrop';
      modal.innerHTML = `
        <div class="kuche-server-modal-card">
          <h3>
            <span>Estado del Servidor IA</span>
            <button type="button" class="close-btn" onclick="window.KucheAPI.cerrarModalServidor()">✕</button>
          </h3>
          <div id="kuche-modal-status-body"></div>
          <div style="margin-top:14px; font-size:12px; color:#A69CA1;">
            <span style="font-weight:700; color:#E6D194; display:block; margin-bottom:4px;">Conectar a otra URL de backend:</span>
            <div class="kuche-input-group">
              <input type="text" id="kuche-custom-url-input" class="kuche-modal-input" placeholder="https://ejemplo.trycloudflare.com">
              <button type="button" class="kuche-modal-btn" onclick="window.KucheAPI.conectarUrlPersonalizada()">Conectar</button>
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:16px;">
            <button type="button" class="kuche-modal-sec-btn" style="flex:1;" onclick="window.KucheAPI.reintentar()">↻ Reintentar Detección</button>
            <a href="http://localhost:8000/app.html" id="kuche-link-local-app" class="kuche-modal-sec-btn" style="flex:1; border-color:#9B2247; color:#fff; background:#9B2247;">Abrir Localhost</a>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModalServidor();
      });
    }
    actualizarContenidoModal();
    modal.classList.add('active');
  }

  function cerrarModalServidor() {
    const modal = document.getElementById('kuche-server-modal');
    if (modal) modal.classList.remove('active');
  }

  function actualizarContenidoModal() {
    const body = document.getElementById('kuche-modal-status-body');
    const input = document.getElementById('kuche-custom-url-input');
    const linkLocal = document.getElementById('kuche-link-local-app');
    if (!body) return;

    if (input && !input.value) {
      input.value = backendUrl || '';
    }

    if (linkLocal) {
      const currentFile = window.location.pathname.includes('portal.html') ? 'portal.html' : 'app.html';
      linkLocal.href = `http://localhost:8000/${currentFile}`;
    }

    if (isOnline) {
      body.innerHTML = `
        <div class="kuche-server-info-box online">
          <div style="display:flex; align-items:center; gap:6px; font-weight:800; font-size:13px; margin-bottom:4px;">
            <span class="kuche-pill-dot" style="background:#10b981; box-shadow:0 0 6px #10b981;"></span>
            <span>Servidor En Línea (Online)</span>
          </div>
          <div style="color:#d1fae5;">Conectado a: <strong>${backendUrl}</strong></div>
          <div style="color:#a7f3d0; margin-top:2px;">Motor YOLO-World activo y listo para detección en vivo.</div>
        </div>
      `;
    } else {
      body.innerHTML = `
        <div class="kuche-server-info-box offline">
          <div style="display:flex; align-items:center; gap:6px; font-weight:800; font-size:13px; margin-bottom:4px;">
            <span class="kuche-pill-dot" style="background:#ef4444; box-shadow:0 0 6px #ef4444;"></span>
            <span>Servidor Desconectado (Offline)</span>
          </div>
          <div>Esta página no detecta una conexión activa con el backend de IA.</div>
          <div style="margin-top:8px;">
            <div style="font-size:11px; font-weight:700; color:#E6D194; margin-bottom:4px;">OPCIONES DE CONEXIÓN RÁPIDA:</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
              <button type="button" onclick="window.KucheAPI.probarYConectar('https://undefined-zoloft-pads-curious.trycloudflare.com')" style="background:rgba(155,34,71,0.25); border:1px solid #9B2247; color:#fff; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; text-align:left;">
                ☁️ Conectar Túnel Seguro (trycloudflare)
              </button>
              <button type="button" onclick="window.KucheAPI.probarYConectar('http://192.168.100.13:8000')" style="background:rgba(188,149,92,0.2); border:1px solid #BC955C; color:#E6D194; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; text-align:left;">
                📶 Conectar Red Wi-Fi Local (192.168.100.13:8000)
              </button>
              <a href="http://192.168.100.13:8000/app.html" target="_blank" style="background:rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:700; text-decoration:none; display:block; text-align:left;">
                🚀 Abrir App Directa en Wi-Fi Local
              </a>
            </div>
          </div>
        </div>
      `;
    }
  }

  async function conectarUrlPersonalizada() {
    const input = document.getElementById('kuche-custom-url-input');
    if (!input || !input.value.trim()) return;
    const url = input.value.trim().replace(/\/+$/, '');
    input.disabled = true;
    const ok = await verificarPing(url);
    input.disabled = false;
    if (ok) {
      backendUrl = url;
      localStorage.setItem('kuche_backend_url', backendUrl);
      isOnline = true;
      notificar();
      cerrarModalServidor();
    } else {
      alert(`No se pudo conectar a "${url}".\nAsegúrate de que el servidor esté activo y acepte peticiones.`);
    }
  }

  function actualizarBanner() {
    actualizarIndicadorServidor();
  }

  window.KucheAPI = {
    getUrl: () => backendUrl,
    isOnline: () => isOnline,
    isStaticMode: () => !backendUrl,
    apiUrl: function(path) {
      if (!path) return '';
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:') || path.startsWith('blob:')) {
        return path;
      }
      let p = path;
      if (p.startsWith('./')) p = p.substring(1);
      if (!p.startsWith('/')) p = '/' + p;
      if (isDirectBackend || !backendUrl) return p;
      return backendUrl.replace(/\/+$/, '') + p;
    },
    wsUrl: function(path) {
      if (!isDirectBackend && !backendUrl) return null;
      if (isGitHubPages && !backendUrl) return null;
      const p = path.startsWith('/') ? path : '/' + path;
      let host = location.host;
      let proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      if (!isDirectBackend && backendUrl) {
        try {
          const u = new URL(backendUrl);
          host = u.host;
          proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        } catch(e) {}
      } else if (isDirectBackend) {
        host = location.host;
        proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      } else {
        return null;
      }
      return `${proto}//${host}${p}`;
    },
    onStateChange: function(fn) {
      listeners.push(fn);
      fn({ url: backendUrl, online: isOnline, staticMode: !backendUrl });
    },
    sincronizarUrl: sincronizarUrl,
    probarYConectar: async function(url) {
      if (!url) return false;
      const target = url.trim().replace(/\/+$/, '');
      const ok = await verificarPing(target);
      if (ok) {
        backendUrl = target;
        localStorage.setItem('kuche_backend_url', backendUrl);
        isOnline = true;
        notificar();
        cerrarModalServidor();
        return true;
      } else {
        alert('No se pudo conectar a: ' + target + '\nVerifica que el servidor esté activo en ese host.');
        return false;
      }
    },
    reportarErrorConexion: async function() {
      try { localStorage.removeItem('kuche_backend_url'); } catch(e) {}
      backendUrl = '';
      isOnline = false;
      notificar();
      return backendUrl;
    },
    reintentar: function() {
      try { localStorage.removeItem('kuche_backend_url'); } catch(e) {}
      backendUrl = '';
      return sincronizarUrl();
    },
    abrirModalServidor: abrirModalServidor,
    cerrarModalServidor: cerrarModalServidor,
    conectarUrlPersonalizada: conectarUrlPersonalizada
  };

  // ─── 2. INSTALADOR UNIVERSAL PWA (MODO DEMO & MODO LOGUEO) ───────────
  let deferredPromptPWA = null;

  // Registrar Service Worker automáticamente
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./static/sw.js', { scope: './' })
        .then(r => console.log('[KUCHE PWA] Service Worker activo en:', r.scope))
        .catch(e => console.warn('[KUCHE PWA] Advertencia SW:', e));
    });
  }

  // Capturar evento de instalación de inmediato
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPromptPWA = e;
    window._deferredPromptPWA = e;
    console.log('[KUCHE PWA] Evento beforeinstallprompt capturado con éxito.');
    actualizarBotonesInstalacion(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPromptPWA = null;
    window._deferredPromptPWA = null;
    actualizarBotonesInstalacion(false, true);
    console.log('[KUCHE PWA] Aplicación instalada con éxito en pantalla de inicio.');
  });

  function esPWAStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
  }

  function actualizarBotonesInstalacion(disponible, instalada) {
    const yaEstaInstalada = instalada || esPWAStandalone();
    const btns = document.querySelectorAll('.btn-instalar-pwa');
    btns.forEach(btn => {
      if (yaEstaInstalada) {
        btn.innerHTML = `
          <svg class="icon-svg" viewBox="0 0 24 24" style="width:13px;height:13px;stroke-width:2.5;"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Instalada</span>
        `;
        btn.title = "KUCHE ya está instalada en tu dispositivo";
        btn.style.opacity = '0.75';
      } else {
        btn.style.display = 'inline-flex';
      }
    });
  }

  // Inyección del modal institucional de instrucciones de instalación si no existe
  function asegurarModalPWA() {
    if (document.getElementById('modal-instalar-pwa')) return;

    const modalDiv = document.createElement('div');
    modalDiv.id = 'modal-instalar-pwa';
    modalDiv.className = 'modal-pwa-overlay';
    modalDiv.onclick = (e) => {
      if (e.target === modalDiv) window.cerrarModalPWA();
    };
    modalDiv.innerHTML = `
      <div class="modal-pwa-card" onclick="event.stopPropagation()">
        <div class="modal-pwa-header">
          <div class="modal-pwa-icon">
            <svg class="icon-svg" viewBox="0 0 24 24" style="width:24px;height:24px;stroke-width:2.2;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <h3 id="modal-pwa-titulo" class="modal-pwa-title">Instalar Aplicación KUCHE</h3>
            <span id="modal-pwa-subtitulo" class="modal-pwa-sub">Acceso rápido desde la pantalla de inicio</span>
          </div>
        </div>
        <ul id="modal-pwa-pasos" class="modal-pwa-steps"></ul>
        <button type="button" class="modal-pwa-btn-close" onclick="window.cerrarModalPWA()">Entendido</button>
      </div>
    `;
    document.body.appendChild(modalDiv);
  }

  window.cerrarModalPWA = function() {
    const el = document.getElementById('modal-instalar-pwa');
    if (el) el.classList.remove('active');
  };

  window.iniciarInstalacionPWA = async function(tipo) {
    asegurarModalPWA();
    const tituloEl = document.getElementById('modal-pwa-titulo');
    const subEl = document.getElementById('modal-pwa-subtitulo');
    const pasosEl = document.getElementById('modal-pwa-pasos');
    const modalEl = document.getElementById('modal-instalar-pwa');

    const esDemo = tipo === 'demo' || window.location.pathname.includes('app.html');
    const nombreModo = esDemo ? 'KUCHE — Modo Demo' : 'KUCHE — App Oficial';

    if (esPWAStandalone()) {
      tituloEl.textContent = 'Aplicación Ya Instalada';
      subEl.textContent = `${nombreModo} ya se encuentra instalada en este dispositivo.`;
      pasosEl.innerHTML = `
        <li class="modal-pwa-step-item">
          <div class="modal-pwa-step-num">✓</div>
          <div>Estás usando KUCHE en modo nativo a pantalla completa sin elementos del navegador.</div>
        </li>
      `;
      modalEl.classList.add('active');
      return;
    }

    const promptEvt = window._deferredPromptPWA || deferredPromptPWA;
    if (promptEvt) {
      try {
        promptEvt.prompt();
        const { outcome } = await promptEvt.userChoice;
        if (outcome === 'accepted') {
          window._deferredPromptPWA = null;
          deferredPromptPWA = null;
          actualizarBotonesInstalacion(false, true);
        }
        return;
      } catch (err) {
        console.warn('[KUCHE PWA] Error al invocar prompt:', err);
      }
    }

    // Guía para dispositivos donde el prompt nativo no está disponible o es iOS
    const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

    if (esIOS) {
      tituloEl.textContent = `Instalar ${nombreModo} en iPhone o iPad`;
      subEl.textContent = 'Agrega el acceso directo para abrir como app nativa.';
      pasosEl.innerHTML = `
        <li class="modal-pwa-step-item">
          <div class="modal-pwa-step-num">1</div>
          <div>Toca el botón <strong>Compartir</strong> (icono de cuadrado con flecha hacia arriba <span style="font-size:14px;">⎋</span>) en la barra inferior de Safari.</div>
        </li>
        <li class="modal-pwa-step-item">
          <div class="modal-pwa-step-num">2</div>
          <div>Desplaza el menú hacia abajo y presiona <strong>«Agregar a inicio»</strong> (+).</div>
        </li>
        <li class="modal-pwa-step-item">
          <div class="modal-pwa-step-num">3</div>
          <div>Pulsa <strong>«Agregar»</strong> en la esquina superior derecha. ¡Listo! Abre la app directamente desde tu pantalla de inicio.</div>
        </li>
      `;
    } else {
      tituloEl.textContent = `Instalar ${nombreModo}`;
      subEl.textContent = 'Agrega KUCHE a tu dispositivo para acceso directo e inspección en campo.';
      pasosEl.innerHTML = `
        <li class="modal-pwa-step-item">
          <div class="modal-pwa-step-num">1</div>
          <div>Abre el menú de opciones de tu navegador (los tres puntos verticales <strong>⋮</strong> o el icono de instalación <span style="font-size:13px;">⤓</span> en la barra de URL).</div>
        </li>
        <li class="modal-pwa-step-item">
          <div class="modal-pwa-step-num">2</div>
          <div>Selecciona la opción <strong>«Instalar aplicación»</strong> o <strong>«Agregar a la pantalla principal»</strong>.</div>
        </li>
        <li class="modal-pwa-step-item">
          <div class="modal-pwa-step-num">3</div>
          <div>Confirma la instalación para disfrutar de pantalla completa, cámara optimizada y trabajo sin conexión.</div>
        </li>
      `;
    }

    modalEl.classList.add('active');
  };

  // Inicializar estado de botones e indicador al cargar el DOM
  document.addEventListener('DOMContentLoaded', () => {
    actualizarBotonesInstalacion(false, esPWAStandalone());
    actualizarIndicadorServidor();
  });

  // Verificar periódicamente el estado del servidor (cada 5s si offline, 12s si online)
  async function loopAutosync() {
    await sincronizarUrl();
    const tiempo = isOnline ? 12000 : 5000;
    setTimeout(loopAutosync, tiempo);
  }

  loopAutosync();
})();
