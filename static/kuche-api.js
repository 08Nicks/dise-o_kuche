/**
 * =====================================================================
 * KUCHE API BRIDGE (kuche-api.js)
 * Sincronización dinámica entre GitHub Pages y el Backend en la PC.
 * Resuelve la URL de Cloudflare desde backend_url.json / GitHub API.
 * =====================================================================
 */
(function() {
  const GITHUB_RAW_URL  = 'https://raw.githubusercontent.com/08Nicks/dise-o_kuche/gh-pages/backend_url.json';
  const GITHUB_REPO_API = 'https://api.github.com/repos/08Nicks/dise-o_kuche/contents/backend_url.json?ref=gh-pages';
  const LOCAL_JSON_PATH = './backend_url.json';

  let backendUrl = localStorage.getItem('kuche_backend_url') || '';
  let isOnline = false;
  let listeners = [];
  let pollInterval = null;

  // Si estamos navegando directamente en localhost o puerto 8000, usar origen actual
  const isDirectBackend = window.location.port === '8000' || 
                          window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

  function notificar() {
    listeners.forEach(fn => {
      try { fn({ url: backendUrl, online: isOnline }); } catch(e) {}
    });
    actualizarBanner();
  }

  async function verificarPing(url) {
    if (!url) return false;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 3500);
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
    if (!cfg || !cfg.backend_url) return false;
    const nuevaUrl = cfg.backend_url.trim().replace(/\/+$/, '');
    if (!nuevaUrl) return false;
    if (backendUrl !== nuevaUrl) {
      backendUrl = nuevaUrl;
      localStorage.setItem('kuche_backend_url', backendUrl);
    }
    return true;
  }

  async function sincronizarUrl() {
    if (isDirectBackend) {
      backendUrl = window.location.origin;
      isOnline = true;
      notificar();
      return backendUrl;
    }

    let exito = false;

    // 1. Intentar siempre primero con GitHub Raw + cache buster (refleja cambios en 1-2s tras push)
    try {
      const r = await fetch(GITHUB_RAW_URL + '?_t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const cfg = await r.json();
        if (aplicarConfig(cfg)) exito = true;
      }
    } catch(e) {}

    // 2. Si no, consultar backend_url.json servido en GitHub Pages
    if (!exito) {
      try {
        const r = await fetch(LOCAL_JSON_PATH + '?_t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          if (aplicarConfig(d)) exito = true;
        }
      } catch(e) {}
    }

    // 3. Si falló, consultar GitHub API
    if (!exito) {
      try {
        const r = await fetch(GITHUB_REPO_API, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          if (d && d.content) {
            const raw = atob(d.content.replace(/\s/g, ''));
            const cfg = JSON.parse(raw);
            if (aplicarConfig(cfg)) exito = true;
          }
        }
      } catch(e) {}
    }

    // Verificar si la URL responde actualmente
    if (backendUrl) {
      isOnline = await verificarPing(backendUrl);
      // Si la URL no responde y falló, intentar limpiar para volver a sincronizar
      if (!isOnline && !exito) {
        console.warn('[KucheAPI] La URL guardada no responde ping:', backendUrl);
      }
    } else {
      isOnline = false;
    }

    notificar();
    return backendUrl;
  }

  function actualizarBanner() {
    let banner = document.getElementById('kuche-server-status-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'kuche-server-status-banner';
      banner.style.cssText = `
        position: fixed; bottom: 8px; left: 8px; right: 8px; z-index: 99999;
        padding: 7px 14px; border-radius: 8px; font-size: 11px; font-weight: 600;
        display: flex; align-items: center; justify-content: space-between;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35); backdrop-filter: blur(8px);
        font-family: 'Montserrat', system-ui, sans-serif; transition: all 0.3s ease;
      `;
      document.body.appendChild(banner);
    }

    if (isOnline && backendUrl) {
      banner.style.background = 'rgba(16, 185, 129, 0.95)';
      banner.style.color = '#ffffff';
      banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="width:8px; height:8px; border-radius:50%; background:#ffffff; display:inline-block; box-shadow:0 0 6px #fff;"></span>
          <span>PC Conectada &bull; IA Kuche Lista para Detección</span>
        </div>
      `;
    } else {
      banner.style.background = 'rgba(155, 34, 71, 0.95)';
      banner.style.color = '#ffffff';
      banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="width:8px; height:8px; border-radius:50%; background:#E6D194; display:inline-block;"></span>
          <span>Sincronizando con Servidor IA Kuche...</span>
        </div>
        <button onclick="window.KucheAPI.reintentar()" style="background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.4); color:#fff; border-radius:4px; padding:3px 10px; font-size:10px; font-weight:bold; cursor:pointer;">Reintentar</button>
      `;
    }
  }

  window.KucheAPI = {
    getUrl: () => backendUrl,
    isOnline: () => isOnline,
    apiUrl: function(path) {
      const p = path.startsWith('/') ? path : '/' + path;
      if (isDirectBackend || !backendUrl) return p;
      return backendUrl.replace(/\/+$/, '') + p;
    },
    wsUrl: function(path) {
      const p = path.startsWith('/') ? path : '/' + path;
      let host = location.host;
      let proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      if (!isDirectBackend && backendUrl) {
        try {
          const u = new URL(backendUrl);
          host = u.host;
          proto = u.protocol === 'https:' ? 'wss:' : 'ws:';
        } catch(e) {}
      }
      return `${proto}//${host}${p}`;
    },
    onStateChange: function(fn) {
      listeners.push(fn);
      fn({ url: backendUrl, online: isOnline });
    },
    sincronizarUrl: sincronizarUrl,
    reintentar: function() {
      const b = document.getElementById('kuche-server-status-banner');
      if (b) b.innerText = 'Sincronizando con el servidor de la PC...';
      return sincronizarUrl();
    }
  };

  // Inicialización inmediata y periódica
  sincronizarUrl();
  if (!pollInterval) pollInterval = setInterval(sincronizarUrl, 15000);
})();
