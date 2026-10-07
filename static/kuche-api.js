/**
 * =====================================================================
 * KUCHE API BRIDGE (kuche-api.js) — v6.0 Static & Resilient
 * Conexión institucional 100% estática para GitHub Pages.
 * Desacoplado de túneles externos. Soporte híbrido local y offline.
 * =====================================================================
 */
(function() {
  const LOCAL_JSON_PATH = './backend_url.json';

  let backendUrl = localStorage.getItem('kuche_backend_url') || '';
  
  // Limpiar cualquier URL obsoleta de Cloudflare almacenada en localStorage
  if (backendUrl && (backendUrl.includes('trycloudflare.com') || backendUrl.includes('cloudflare'))) {
    try { localStorage.removeItem('kuche_backend_url'); } catch(e) {}
    backendUrl = '';
  }

  let isOnline = true; // En GitHub Pages el sitio está siempre en línea
  let listeners = [];
  let sincronizando = false;

  const isGitHubPages = window.location.hostname.includes('github.io');
  const isDirectBackend = window.location.port === '8000' || 
                          window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

  // 0. Si se proporciona un endpoint explícito en la URL para desarrollo local (?api=http://...)
  try {
    const params = new URLSearchParams(window.location.search);
    const paramApi = params.get('api') || params.get('backend');
    if (paramApi && paramApi.startsWith('http') && !paramApi.includes('trycloudflare.com')) {
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
    if (!nuevaUrl || nuevaUrl === 'null' || nuevaUrl.includes('trycloudflare.com')) {
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
          // Desacoplar y volver al modo estático institucional
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
      // En GitHub Pages puramente estático no hay WebSocket
      if (isGitHubPages && !backendUrl) {
        return null;
      }
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

  // En modo estático verificar periódicamente de forma ligera (cada 60s)
  async function loopAutosync() {
    await sincronizarUrl();
    const tiempo = (isGitHubPages && !backendUrl) ? 60000 : (isOnline ? 20000 : 5000);
    setTimeout(loopAutosync, tiempo);
  }

  loopAutosync();
})();
