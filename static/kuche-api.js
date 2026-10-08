/**
 * =====================================================================
 * KUCHE API BRIDGE & PWA ENGINE (kuche-api.js) — v7.0 Static & Resilient
 * Conexión institucional 100% estática para GitHub Pages.
 * Desacoplado de túneles externos. Eliminación total de Cloudflare de URLs.
 * Instalador Universal PWA para Modo Demo y Modo Logueo.
 * =====================================================================
 */
(function() {
  // ─── 1. LIMPIEZA ABSOLUTA DE CLOUDFLARE EN LA BARRA DEL NAVEGADOR ───
  // Si la URL en GitHub Pages trae parámetros o rastros de Cloudflare (?api=...trycloudflare...),
  // se remueven al instante sin recargar la página para que la URL sea 100% limpia en GitHub.
  try {
    if (window.location.search && (window.location.search.toLowerCase().includes('cloudflare') || window.location.search.toLowerCase().includes('trycloudflare'))) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('api');
      cleanUrl.searchParams.delete('backend');
      const searchStr = cleanUrl.searchParams.toString();
      const cleanPath = cleanUrl.pathname + (searchStr ? '?' + searchStr : '') + cleanUrl.hash;
      window.history.replaceState({}, document.title, cleanPath);
    }
  } catch(e) {}

  const LOCAL_JSON_PATH = './backend_url.json';

  let backendUrl = localStorage.getItem('kuche_backend_url') || '';
  
  // Limpiar cualquier URL obsoleta de Cloudflare almacenada en localStorage o sessionStorage
  if (backendUrl && (backendUrl.includes('trycloudflare.com') || backendUrl.includes('cloudflare'))) {
    try { localStorage.removeItem('kuche_backend_url'); } catch(e) {}
    try { sessionStorage.removeItem('kuche_backend_url'); } catch(e) {}
    backendUrl = '';
  }

  let isOnline = true; // En GitHub Pages el sitio está siempre en línea
  let listeners = [];
  let sincronizando = false;

  const isGitHubPages = window.location.hostname.includes('github.io');
  const isDirectBackend = window.location.port === '8000' || 
                          window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

  // Endpoint explícito en la URL para desarrollo local (nunca Cloudflare)
  try {
    const params = new URLSearchParams(window.location.search);
    const paramApi = params.get('api') || params.get('backend');
    if (paramApi && paramApi.startsWith('http') && !paramApi.includes('cloudflare')) {
      backendUrl = paramApi.trim().replace(/\/+$/, '');
      localStorage.setItem('kuche_backend_url', backendUrl);
    }
  } catch(e) {}

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
      const tid = setTimeout(() => ctrl.abort(), 2500);
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
    if (cfg.static_mode || !cfg.backend_url) {
      backendUrl = '';
      isOnline = true;
      return true;
    }
    const nuevaUrl = (cfg.backend_url || '').trim().replace(/\/+$/, '');
    if (!nuevaUrl || nuevaUrl === 'null' || nuevaUrl.includes('trycloudflare.com') || nuevaUrl.includes('cloudflare')) {
      backendUrl = '';
      isOnline = true;
      return true;
    }
    if (backendUrl !== nuevaUrl) {
      backendUrl = nuevaUrl;
      localStorage.setItem('kuche_backend_url', backendUrl);
    }
    return true;
  }

  async function sincronizarUrl() {
    if (sincronizando) return backendUrl;
    sincronizando = true;

    try {
      if (isDirectBackend) {
        backendUrl = window.location.origin;
        isOnline = true;
        notificar();
        return backendUrl;
      }

      // Si estamos en GitHub Pages sin URL específica, operar en modo estático limpio
      if (isGitHubPages && !backendUrl) {
        try {
          const t = Date.now();
          const r = await fetch(`${LOCAL_JSON_PATH}?_t=${t}`, { cache: 'no-store' });
          if (r.ok) {
            const cfg = await r.json();
            aplicarConfig(cfg);
          }
        } catch(e) {}
        isOnline = true;
        notificar();
        return backendUrl;
      }

      // Si existe una URL configurada, verificar si sigue activa
      if (backendUrl) {
        const sigueViva = await verificarPing(backendUrl);
        if (sigueViva) {
          isOnline = true;
          notificar();
          return backendUrl;
        } else {
          try { localStorage.removeItem('kuche_backend_url'); } catch(e) {}
          backendUrl = '';
          isOnline = true;
        }
      }

      notificar();
      return backendUrl;
    } finally {
      sincronizando = false;
    }
  }

  function actualizarBanner() {
    const banner = document.getElementById('kuche-server-status-banner');
    if (banner) banner.remove();
  }

  window.KucheAPI = {
    getUrl: () => backendUrl,
    isOnline: () => isOnline,
    isStaticMode: () => !backendUrl,
    apiUrl: function(path) {
      const p = path.startsWith('/') ? path : '/' + path;
      if (isDirectBackend || !backendUrl) return p;
      return backendUrl.replace(/\/+$/, '') + p;
    },
    wsUrl: function(path) {
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
    reportarErrorConexion: async function() {
      try { localStorage.removeItem('kuche_backend_url'); } catch(e) {}
      backendUrl = '';
      isOnline = true;
      notificar();
      return backendUrl;
    },
    reintentar: function() {
      try { localStorage.removeItem('kuche_backend_url'); } catch(e) {}
      backendUrl = '';
      return sincronizarUrl();
    }
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

  // Inicializar estado de botones al cargar el DOM
  document.addEventListener('DOMContentLoaded', () => {
    actualizarBotonesInstalacion(false, esPWAStandalone());
  });

  // En modo estático verificar periódicamente de forma ligera (cada 60s)
  async function loopAutosync() {
    await sincronizarUrl();
    const tiempo = (isGitHubPages && !backendUrl) ? 60000 : (isOnline ? 20000 : 5000);
    setTimeout(loopAutosync, tiempo);
  }

  loopAutosync();
})();
