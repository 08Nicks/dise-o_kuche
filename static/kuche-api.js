/**
 * =====================================================================
 * KUCHE API BRIDGE (kuche-api.js) — v5.0 Bulletproof
 * Sincronización dinámica ultra-resistente entre GitHub Pages y Cloudflare.
 * Resuelve la URL aunque el túnel se reinicie 100 veces.
 * =====================================================================
 */
(function() {
  const GITHUB_RAW_URL  = 'https://raw.githubusercontent.com/08Nicks/dise-o_kuche/gh-pages/backend_url.json';
  const GITHUB_REPO_API = 'https://api.github.com/repos/08Nicks/dise-o_kuche/contents/backend_url.json?ref=gh-pages';
  const LOCAL_JSON_PATH = './backend_url.json';

  let backendUrl = localStorage.getItem('kuche_backend_url') || '';
  let isOnline = false;
  let listeners = [];
  let sincronizando = false;

  // 0. Si la URL contiene parámetro directo de API (?api=https://... o ?backend=https://...)
  try {
    const params = new URLSearchParams(window.location.search);
    const paramApi = params.get('api') || params.get('backend');
    if (paramApi && paramApi.startsWith('http')) {
      const limpia = paramApi.trim().replace(/\/+$/, '');
      backendUrl = limpia;
      localStorage.setItem('kuche_backend_url', backendUrl);
    }
  } catch(e) {}

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
    if (!nuevaUrl || nuevaUrl === 'null') return false;
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

      // Paso 1: Si ya tenemos una URL en memoria o query param, probar si sigue viva
      if (backendUrl) {
        isOnline = await verificarPing(backendUrl);
        if (isOnline) {
          notificar();
          return backendUrl;
        } else {
          // La URL anterior murió (por ejemplo reiniciaron Cloudflare)
          console.warn('[KucheAPI] La URL previa ya no responde. Buscando nueva URL de Cloudflare...');
          localStorage.removeItem('kuche_backend_url');
          backendUrl = '';
          isOnline = false;
        }
      }

      let exito = false;
      const t = Date.now();

      // Paso 2: Intentar GitHub Raw con bust de caché estricto
      try {
        const r = await fetch(`${GITHUB_RAW_URL}?_t=${t}`, { cache: 'no-store' });
        if (r.ok) {
          const cfg = await r.json();
          if (aplicarConfig(cfg)) {
            isOnline = await verificarPing(backendUrl);
            if (isOnline) exito = true;
          }
        }
      } catch(e) {}

      // Paso 3: Si falló Raw, consultar GitHub API (no tiene caché CDN)
      if (!exito) {
        try {
          const r = await fetch(`${GITHUB_REPO_API}&_t=${t}`, { 
            cache: 'no-store',
            headers: { 'Accept': 'application/vnd.github.v3.raw' }
          });
          if (r.ok) {
            const cfg = await r.json();
            if (aplicarConfig(cfg)) {
              isOnline = await verificarPing(backendUrl);
              if (isOnline) exito = true;
            }
          }
        } catch(e) {}
      }

      // Paso 4: Si falló, intentar archivo local servido en GitHub Pages
      if (!exito) {
        try {
          const r = await fetch(`${LOCAL_JSON_PATH}?_t=${t}`, { cache: 'no-store' });
          if (r.ok) {
            const d = await r.json();
            if (aplicarConfig(d)) {
              isOnline = await verificarPing(backendUrl);
              if (isOnline) exito = true;
            }
          }
        } catch(e) {}
      }

      notificar();
      return backendUrl;
    } finally {
      sincronizando = false;
    }
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
          <span>Buscando Servidor IA Kuche en vivo...</span>
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
    reportarErrorConexion: async function() {
      console.warn('[KucheAPI] Error de túnel reportado. Forzando búsqueda de nueva URL...');
      localStorage.removeItem('kuche_backend_url');
      backendUrl = '';
      isOnline = false;
      notificar();
      return await sincronizarUrl();
    },
    reintentar: function() {
      const b = document.getElementById('kuche-server-status-banner');
      if (b) b.innerText = 'Sincronizando con el servidor de la PC...';
      localStorage.removeItem('kuche_backend_url');
      backendUrl = '';
      return sincronizarUrl();
    }
  };

  // Ciclo dinámico: sondea cada 3.5s si está offline, o cada 15s si ya está conectado
  async function loopAutosync() {
    await sincronizarUrl();
    const tiempo = isOnline ? 15000 : 3500;
    setTimeout(loopAutosync, tiempo);
  }

  loopAutosync();
})();
