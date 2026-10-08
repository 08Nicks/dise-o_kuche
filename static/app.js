// ================================================================
// APP.JS v4.0 — Portal de Reporte Ciudadano de Infraestructura
// ================================================================

const video     = document.getElementById('video');
const canvas    = document.getElementById('canvas');
const ctx       = canvas ? canvas.getContext('2d') : null;
const sendCanvas = document.createElement('canvas');
const sc        = sendCanvas.getContext('2d');

// Desocultar video dinámicamente para que el navegador mantenga el flujo de frames activo sin tocar el HTML
if (video) {
  video.removeAttribute('hidden');
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:640px;height:480px;opacity:0;pointer-events:none;z-index:-9999;';
}

// ─── Estado global ───────────────────────────────────────────────
let modo                 = 'video';
let cajas                = [];
let mediaStream          = null;
let camaraEncendida      = true;
let pintarActivo         = false;
let timerAnalisis        = null;
let analizando           = false;
let ubiActual            = null;
let wsDeteccion          = null;
let wsReconnecting       = false;
let grabacionActiva      = false;
let segundosRestantes    = 10;
let timerCuentaRegresiva = null;

// Exponer variables clave para acceso externo (oficial.html, etc.)
// Usar funciones porque let variables no pueden ser re-definidas en window directamente
window._kucheGetWS = () => wsDeteccion;
window._kucheGetModo = () => modo;

// ─── Logger en consola (oculto de la interfaz) ────────────────────
function LOG(msg, color) {
  console.log('[KUCHE] ' + msg);
}

// ─── Estado / status bar ─────────────────────────────────────────
const estado = (t, color) => {
  const el = document.getElementById('live');
  if (el) { el.textContent = t; el.style.color = color || '#00ff80'; }
};

// ─── GPS ─────────────────────────────────────────────────────────
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    p => { ubiActual = { lat: p.coords.latitude, lon: p.coords.longitude }; LOG('GPS: ' + p.coords.latitude.toFixed(5) + ',' + p.coords.longitude.toFixed(5), '#555'); },
    e => LOG('GPS no disponible: ' + e.message, '#666'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}
const ubiString = () => ubiActual ? `${ubiActual.lat.toFixed(6)},${ubiActual.lon.toFixed(6)}` : '';

// ─── Tipo de Luminaria (Sin categorías genéricas) ──────────────────
function mapearCategoria(textoIA) {
  return textoIA || 'Luminaria LED Vial Tipo Cobra';
}

// ─── WebSocket ───────────────────────────────────────────────────
function conectarWS() {
  const url = window.KucheAPI ? window.KucheAPI.wsUrl('/api/infraestructura/ws/detectar') : null;

  if (wsDeteccion) {
    if (wsDeteccion.url === url && (wsDeteccion.readyState === WebSocket.OPEN || wsDeteccion.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      wsDeteccion.onclose = null;
      wsDeteccion.onerror = null;
      wsDeteccion.close();
    } catch(e) {}
    wsDeteccion = null;
  }

  // En modo estático puro (GitHub Pages), no abrir WebSocket innecesariamente
  if (!url || url.includes('undefined') || url === 'wss://' || url === 'ws://') {
    estado('Sistema en Línea (Modo Estático)', '#00ff80');
    return;
  }

  LOG('Conectando WS → ' + url, '#ffcc00');
  try {
    wsDeteccion = new WebSocket(url);
    wsDeteccion.binaryType = 'arraybuffer';
  } catch (err) {
    LOG('WS no disponible en este entorno', '#aaa');
    return;
  }

  wsDeteccion.onopen = () => {
    LOG('WebSocket conectado con éxito', '#00ff80');
    estado('IA Kuche lista', '#00ff80');
    wsReconnecting = false;
    analizando = false;
    if (camaraEncendida && modo === 'video') {
      ejecutarAnalisis();
    }
  };

  wsDeteccion.onerror = (e) => {
    analizando = false;
    setProgressBar(false);
  };

  wsDeteccion.onmessage = (event) => {
    analizando = false;
    setProgressBar(false);
    try {
      const j = JSON.parse(event.data);
      cajas = (j.vistas || []).map(c => ({ ...c, ts: Date.now() }));

      if (cajas.length > 0) {
        const nombres = cajas.map(c => `${c.texto} (${Math.round(c.conf * 100)}%)`).join(', ');
        if (grabacionActiva) {
          estado(`Grabando (${segundosRestantes}s): ${nombres}`, '#00ff80');
        } else {
          estado(`IA Kuche: ${nombres}`, '#00ff80');
        }
        LOG(`IA Kuche: ${nombres}`, '#00ff80');
      } else {
        if (grabacionActiva) {
          estado(`Escaneando video IA (${segundosRestantes}s)... Buscando luminarias`, '#00ff80');
        } else {
          estado('IA Kuche lista — Escaneando luminarias en vivo', '#00ff80');
        }
      }
    } catch(err) {
      console.warn('Error decodificando respuesta WS:', err);
    }

    // Programar siguiente frame (rápido en grabación 60ms, suave en reposo 350ms)
    if (camaraEncendida && modo === 'video') {
      programarAnalisis(grabacionActiva ? 60 : 350);
    }
  };

  wsDeteccion.onclose = (e) => {
    analizando = false;
    if (!wsReconnecting && window.KucheAPI && !window.KucheAPI.isStaticMode()) {
      wsReconnecting = true;
      setTimeout(() => {
        wsReconnecting = false;
        conectarWS();
      }, 5000);
    }
  };
}

// Escuchar cambios de URL en vivo desde KucheAPI
if (window.KucheAPI && typeof window.KucheAPI.onStateChange === 'function') {
  window.KucheAPI.onStateChange(({ url, online }) => {
    if (url && online) {
      const targetWs = window.KucheAPI.wsUrl('/api/infraestructura/ws/detectar');
      if (!wsDeteccion || wsDeteccion.url !== targetWs || wsDeteccion.readyState > 1) {
        conectarWS();
      }
    }
  });
}

// ─── Calibración de Lienzos y Cámara ──────────────────────────────
function ajustarDimensionesVideo() {
  if (!video || !video.videoWidth || !video.videoHeight) return false;
  const maxDim = Math.max(video.videoWidth, video.videoHeight) || 1280;
  const s = Math.min(1, 640 / maxDim);
  sendCanvas.width  = Math.round(video.videoWidth  * s);
  sendCanvas.height = Math.round(video.videoHeight * s);
  const sv = Math.min(1, 800 / maxDim);
  if (canvas) {
    canvas.width  = Math.round(video.videoWidth  * sv);
    canvas.height = Math.round(video.videoHeight * sv);
  }
  return true;
}

// ─── Arranque ────────────────────────────────────────────────────
const _esVistaConLogin = () => !!document.getElementById('view-auth-container');

window.addEventListener('load', async () => {
  LOG('Sistema iniciando...', '#ffcc00');
  if (window.KucheAPI && typeof window.KucheAPI.sincronizarUrl === 'function') {
    await window.KucheAPI.sincronizarUrl();
  }
  conectarWS();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    LOG('Camara no compatible con este navegador', '#ff4444');
    estado('Sin soporte de camara', '#ff4444');
    return;
  }
  LOG('API camara disponible', '#00ff80');

  // Si hay pantalla de login (oficial.html), la cámara se arranca después del login
  if (_esVistaConLogin()) {
    LOG('Modo con login detectado — esperando autenticación para iniciar cámara', '#ffcc00');
    return;
  }

  try {
    const pingUrl = window.KucheAPI ? window.KucheAPI.apiUrl('/api/ping') : '/api/ping';
    const resp = await fetch(pingUrl, { signal: AbortSignal.timeout(3500) });
    LOG('Servidor conectado (HTTP ' + resp.status + ')', '#00ff80');
    estado('IA Kuche lista para escanear', '#00ff80');
  } catch (e) {
    LOG('Servidor sin respuesta: ' + e.message, '#ff9800');
    if (window.location.hostname.includes('github.io') && (!window.KucheAPI || !window.KucheAPI.getUrl())) {
      estado('Sistema en Línea (Modo Local)', '#00ff80');
    } else {
      estado('Sin conexion al servidor', '#ff4444');
    }
  }

  LOG('Solicitando cámara...', '#ffcc00');
  const ok = await iniciarCamara();
  if (ok) {
    LOG('Camara activada', '#00ff80');
    if (modo === 'video') programarAnalisis(100);
  } else {
    LOG('Camara no disponible', '#ff4444');
  }
});

// ─── Cámara ──────────────────────────────────────────────────────
async function iniciarCamara() {
  if (!camaraEncendida) return false;
  if (mediaStream) return true;
  estado('Activando cámara...', '#ffcc00');
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia(
      { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } }
    );
    LOG('Stream: ' + mediaStream.getVideoTracks().length + ' track(s)', '#00ff80');
    video.srcObject = mediaStream;

    video.onloadedmetadata = () => {
      ajustarDimensionesVideo();
    };
    video.addEventListener('canplay', () => {
      ajustarDimensionesVideo();
    });

    await video.play().catch(e => LOG('Autoplay: ' + e.message, '#ff9800'));
    ajustarDimensionesVideo();

    if (!pintarActivo) { pintarActivo = true; requestAnimationFrame(pintar); }
    estado('IA Kuche lista — Escaneando en vivo', '#00ff80');
    return true;
  } catch (e) {
    LOG('Camara [' + e.name + ']: ' + e.message, '#ff4444');
    if (e.name === 'NotAllowedError') estado('Permiso de camara denegado', '#ff4444');
    else if (e.name === 'NotFoundError') estado('Sin camara detectada', '#ff4444');
    else estado('Error camara: ' + e.name, '#ff4444');
    mediaStream = null;
    return false;
  }
}

function detenerCamara() {
  if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
  video.srcObject = null; pintarActivo = false; cajas = [];
}

async function toggleCamara() {
  const btn = document.getElementById('btn-cam-toggle');
  if (camaraEncendida) {
    camaraEncendida = false;
    detenerAnalisisVideo();
    detenerCamara();
    btn.textContent = 'Camara: OFF';
    canvas.style.display = 'none';
    const mp = document.getElementById('manual-preview');
    if (modo !== 'manual' && mp) {
      mp.style.display = 'flex';
      const prompt = document.getElementById('manual-upload-prompt');
      const prevBox = document.getElementById('manual-preview-container');
      if (prompt) prompt.style.display = 'none';
      if (prevBox) prevBox.style.display = 'none';
      let pausedEl = document.getElementById('cam-paused-msg');
      if (!pausedEl) {
        pausedEl = document.createElement('div');
        pausedEl.id = 'cam-paused-msg';
        pausedEl.style.cssText = 'display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:var(--text-muted); font-size:13px; padding:20px;';
        pausedEl.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" style="width:32px; height:32px; opacity:0.4;"><path d="M1 1l22 22"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"/></svg><span>Cámara desactivada</span>`;
        mp.appendChild(pausedEl);
      } else {
        pausedEl.style.display = 'flex';
      }
    }
    estado('Cámara pausada');
  } else {
    camaraEncendida = true;
    btn.textContent = 'Camara: ON';
    canvas.style.display = 'block';
    const mp = document.getElementById('manual-preview');
    const pausedEl = document.getElementById('cam-paused-msg');
    if (pausedEl) pausedEl.style.display = 'none';
    if (modo !== 'manual' && mp) mp.style.display = 'none';
    const ok = await iniciarCamara();
    if (ok && modo === 'video') programarAnalisis(100);
  }
}

// ─── Loop de pintura ─────────────────────────────────────────────
function pintar() {
  if (!pintarActivo) return;
  const videoListo = video && video.videoWidth > 0 && (video.readyState >= 2 || video.currentTime > 0);
  if (videoListo && ctx && canvas) {
    if (canvas.width === 0 || canvas.width === 300) {
      ajustarDimensionesVideo();
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const ahora = Date.now();
    for (const c of cajas) {
      if (!c.caja || ahora - c.ts > 1000) continue;
      const sx = canvas.width / c.w, sy = canvas.height / c.h;
      const [x1, y1, x2, y2] = c.caja;
      const alpha = Math.max(0, 1 - (ahora - c.ts) / 1000).toFixed(2);
      ctx.strokeStyle = `rgba(0,255,128,${alpha})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
      ctx.fillStyle = `rgba(0,255,128,${alpha})`;
      ctx.font = 'bold 13px Arial';
      ctx.fillText(c.texto + ' ' + Math.round(c.conf * 100) + '%', x1 * sx, Math.max(y1 * sy - 5, 15));
    }
  }
  requestAnimationFrame(pintar);
}

// ─── Análisis video (Inspección Guiada de 10 Segundos) ───────────
function iniciarAnalisisVideo() {
  detenerAnalisisVideo();
  if (!camaraEncendida || modo !== 'video') return;

  grabacionActiva = true;
  segundosRestantes = 10;
  actualizarBotonGrabacion();
  estado(`Grabando video IA (${segundosRestantes}s)... Buscando fallas`, '#ff4444');
  LOG('Iniciando grabacion y análisis (máx 10 segundos)...', '#ff4444');

  if (timerCuentaRegresiva) clearInterval(timerCuentaRegresiva);
  timerCuentaRegresiva = setInterval(() => {
    segundosRestantes--;
    actualizarBotonGrabacion();
    if (segundosRestantes <= 0) {
      finalizarPorTiempoVideo();
    }
  }, 1000);

  programarAnalisis(20);
}

function finalizarPorTiempoVideo() {
  detenerAnalisisVideo();
  if (cajas && cajas.length > 0) {
    const mejor = cajas.reduce((a, b) => a.conf > b.conf ? a : b);
    mostrarPanelReporte(mejor);
    estado(`10s completados — ${mejor.texto} lista para reporte`, '#00ff80');
    LOG(`10s completados: reporte generado para ${mejor.texto}`, '#00ff80');
  } else {
    estado('10s completados — Sin luminarias detectadas', '#ff9800');
    LOG('10s transcurridos sin luminarias detectadas', '#ff9800');
    // Reanudar escaneo en vivo tras la inspección de 10s
    if (camaraEncendida && modo === 'video') {
      programarAnalisis(350);
    }
  }
}

function detenerAnalisisVideo() {
  grabacionActiva = false;
  if (timerAnalisis) { clearTimeout(timerAnalisis); timerAnalisis = null; }
  if (timerCuentaRegresiva) { clearInterval(timerCuentaRegresiva); timerCuentaRegresiva = null; }
  analizando = false;
  setProgressBar(false);
  actualizarBotonGrabacion();
}

function actualizarBotonGrabacion() {
  const btn = document.getElementById('btn-grabar-video');
  const ico = document.getElementById('ico-grabar');
  const txt = document.getElementById('txt-grabar');
  if (!btn) return;

  if (grabacionActiva) {
    btn.style.background = '#ff4444';
    btn.style.color = '#fff';
    if (ico) ico.innerHTML = '<span class="rec-pulse-icon"></span>';
    const extra = (cajas && cajas.length > 0) ? ' [Detectada]' : '';
    if (txt) txt.textContent = `Detener y Reportar (${segundosRestantes}s)${extra}`;
  } else {
    btn.style.background = '#00d2ff';
    btn.style.color = '#000';
    if (ico) ico.innerHTML = '<span class="rec-pulse-icon"></span>';
    if (txt) txt.textContent = 'Iniciar Grabación (10s con IA)';
  }
}

window.toggleGrabacionVideo = function () {
  if (grabacionActiva) {
    detenerAnalisisVideo();
    if (cajas && cajas.length > 0) {
      const mejor = cajas.reduce((a, b) => a.conf > b.conf ? a : b);
      mostrarPanelReporte(mejor);
      estado(`Grabación detenida — ${mejor.texto} lista para reporte`, '#00ff80');
    } else {
      estado('Grabación detenida — Escaneando en vivo', '#aaa');
      programarAnalisis(350);
    }
  } else {
    if (!camaraEncendida) toggleCamara();
    iniciarAnalisisVideo();
  }
};

function programarAnalisis(delay) {
  if (!camaraEncendida || modo !== 'video') return;
  if (timerAnalisis) clearTimeout(timerAnalisis);
  timerAnalisis = setTimeout(ejecutarAnalisis, delay !== undefined ? delay : (grabacionActiva ? 40 : 350));
}

async function ejecutarAnalisis() {
  if (analizando || !mediaStream) { programarAnalisis(40); return; }
  const videoListo = video && video.videoWidth > 0 && (video.readyState >= 2 || video.currentTime > 0);
  if (!videoListo) { programarAnalisis(40); return; }
  if (!wsDeteccion || wsDeteccion.readyState !== WebSocket.OPEN) { programarAnalisis(300); return; }

  if (sendCanvas.width === 0 || sendCanvas.width === 300) {
    ajustarDimensionesVideo();
  }

  analizando = true;
  setProgressBar(grabacionActiva);

  // Watchdog de seguridad (1.8s) para nunca dejar el análisis trabado
  const watchdog = setTimeout(() => {
    if (analizando) {
      analizando = false;
      setProgressBar(false);
      if (camaraEncendida && modo === 'video') programarAnalisis(60);
    }
  }, 1800);

  try {
    sc.drawImage(video, 0, 0, sendCanvas.width, sendCanvas.height);
    const blob = await new Promise(r => sendCanvas.toBlob(r, 'image/jpeg', 0.55));
    if (!blob) {
      clearTimeout(watchdog);
      analizando = false;
      setProgressBar(false);
      programarAnalisis(40);
      return;
    }
    const buf = await blob.arrayBuffer();
    if (wsDeteccion && wsDeteccion.readyState === WebSocket.OPEN) {
      wsDeteccion.send(buf);
    } else {
      clearTimeout(watchdog);
      analizando = false;
      setProgressBar(false);
      programarAnalisis(300);
    }
  } catch (e) {
    clearTimeout(watchdog);
    LOG('Error envío frame: ' + e.message, '#ff4444');
    analizando = false;
    setProgressBar(false);
    programarAnalisis(100);
  }
}

function setProgressBar(activo) {
  const pb = document.getElementById('progress-bar');
  if (!pb) return;
  pb.style.transition = activo ? 'width 2s linear' : 'none';
  pb.style.width = activo ? '100%' : '0%';
}

// ─── Modo Foto (Ultrarrápido y Visualización Garantizada) ───────
window.capturarFoto = async function () {
  if (!mediaStream || video.readyState < 2) { estado('Cámara no lista', '#ff9800'); return; }
  estado('Capturando y analizando foto...', '#ffcc00');
  setProgressBar(true);
  try {
    const maxDim = Math.max(video.videoWidth, video.videoHeight) || 1280;
    const s = Math.min(1, 640 / maxDim);
    sendCanvas.width = Math.round(video.videoWidth * s);
    sendCanvas.height = Math.round(video.videoHeight * s);
    sc.drawImage(video, 0, 0, sendCanvas.width, sendCanvas.height);

    // Obtener Data URL completa de la foto recién tomada
    const fotoDataUrl = sendCanvas.toDataURL('image/jpeg', 0.85);

    // Congelar visualmente la foto en el canvas para retroalimentación inmediata
    if (ctx && canvas) {
      ctx.drawImage(sendCanvas, 0, 0, canvas.width, canvas.height);
    }

    const blob = await new Promise(r => sendCanvas.toBlob(r, 'image/jpeg', 0.80));
    const targetUrl = window.KucheAPI ? window.KucheAPI.apiUrl('/api/infraestructura/detectar_foto') : '/api/infraestructura/detectar_foto';
    let vistas = [];
    try {
      const resp = await fetch(targetUrl, {
        method: 'POST',
        body: blob,
        headers: { 'Content-Type': 'image/jpeg' }
      });
      if (resp.ok) {
        const j = await resp.json();
        vistas = j.vistas || [];
      }
    } catch(fetchErr) {}
    setProgressBar(false);
    
    let itemReporte;
    const horaActual = new Date().getHours();
    const condHorario = (horaActual >= 6 && horaActual < 19) ? 'Día' : 'Noche';

    if (vistas.length > 0) {
      itemReporte = vistas.reduce((a, b) => a.conf > b.conf ? a : b);
      itemReporte.imagen = fotoDataUrl;
      itemReporte.horario = itemReporte.horario || condHorario;
      const nombres = vistas.map(v => `${v.texto} (${Math.round(v.conf * 100)}%)`).join(', ');
      estado(`Luminaria detectada: ${nombres}`, '#00ff80');
      LOG('Foto IA Kuche: ' + nombres, '#00ff80');
    } else {
      itemReporte = {
        texto: 'Luminaria de Alumbrado Público',
        conf: 0.50,
        horario: condHorario,
        imagen: fotoDataUrl
      };
      estado(`Foto capturada: Sin luminaria detectada automáticamente [${condHorario}]`, '#ff9800');
      LOG('Captura analizada: sin detecciones automáticas con alta certeza', '#ff9800');
    }
    
    mostrarPanelReporte(itemReporte);
  } catch (e) {
    setProgressBar(false);
    estado('Captura lista para reporte', '#00ff80');
  }
};

// Subir imagen (Redimensionado en cliente para análisis en milisegundos)
const fileInput = document.getElementById('file');
if (fileInput) {
  fileInput.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    estado('Cargando y optimizando imagen...', '#ffcc00');
    setProgressBar(true);
    const img = new Image();
    img.onload = async () => {
      try {
        estado('Analizando imagen con IA...', '#ffcc00');
        const maxDim = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height) || 1280;
        const s = Math.min(1, 800 / maxDim);
        sendCanvas.width = Math.round((img.naturalWidth || img.width) * s);
        sendCanvas.height = Math.round((img.naturalHeight || img.height) * s);
        sc.drawImage(img, 0, 0, sendCanvas.width, sendCanvas.height);

        const fotoDataUrl = sendCanvas.toDataURL('image/jpeg', 0.85);
        if (ctx && canvas) {
          ctx.drawImage(sendCanvas, 0, 0, canvas.width, canvas.height);
        }

        const blob = await new Promise(r => sendCanvas.toBlob(r, 'image/jpeg', 0.80));
        const targetUrl = window.KucheAPI ? window.KucheAPI.apiUrl('/api/infraestructura/detectar_foto') : '/api/infraestructura/detectar_foto';
        let vistas = [];
        try {
          const resp = await fetch(targetUrl, {
            method: 'POST',
            body: blob,
            headers: { 'Content-Type': 'image/jpeg' }
          });
          if (resp.ok) {
            const j = await resp.json();
            vistas = j.vistas || [];
          }
        } catch(fetchErr) {}
        setProgressBar(false);
        
        let itemReporte;
        const horaActual = new Date().getHours();
        const condHorario = (horaActual >= 6 && horaActual < 19) ? 'Día' : 'Noche';

        if (vistas.length > 0) {
          itemReporte = vistas.reduce((a, b) => a.conf > b.conf ? a : b);
          itemReporte.imagen = fotoDataUrl;
          itemReporte.horario = itemReporte.horario || condHorario;
          const nombres = vistas.map(v => `${v.texto} (${Math.round(v.conf * 100)}%)`).join(', ');
          estado(`Detectado en archivo: ${nombres}`, '#00ff80');
          LOG('Archivo IA Kuche: ' + nombres, '#00ff80');
        } else {
          itemReporte = {
            texto: 'Luminaria de Alumbrado Público',
            conf: 0.50,
            horario: condHorario,
            imagen: fotoDataUrl
          };
          estado(`Archivo cargado: Sin luminarias detectadas automáticamente [${condHorario}]`, '#ff9800');
          LOG('Archivo procesado: sin detecciones automáticas con alta certeza', '#ff9800');
        }
        
        mostrarPanelReporte(itemReporte);
      } catch (err) {
        setProgressBar(false);
        estado('Archivo listo para reporte', '#00ff80');
      }
    };
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  };
}

// ─── Panel de reporte IA (Obligatorio tras detección) ─────────────────────────
function mostrarPanelReporte(vista) {
  const panel = document.getElementById('panel-reporte');
  if (!panel) return;

  // Pausar cualquier análisis de video mientras el reporte está activo
  detenerAnalisisVideo();

  // Imagen: mostrar foto garantizando formato Data URI correcto (sin doble prefijo)
  const imgEl = document.getElementById('reporte-img');
  if (imgEl) {
    let src = '';
    if (vista && vista.imagen) {
      src = vista.imagen.startsWith('data:') ? vista.imagen : ('data:image/jpeg;base64,' + vista.imagen);
    } else if (sendCanvas && sendCanvas.width > 0) {
      src = sendCanvas.toDataURL('image/jpeg', 0.85);
    }
    if (src) {
      imgEl.src = src;
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }
  }

  // Tipo de luminaria exacto detectado por IA
  const tipoLuminaria = (vista && vista.texto) ? vista.texto : 'Luminaria LED Vial Tipo Cobra';
  const inpTipo = document.getElementById('reporte-tipo-luminaria');
  if (inpTipo) {
    inpTipo.value = tipoLuminaria;
  }
  const selCat = document.getElementById('reporte-categoria');
  if (selCat) {
    selCat.value = tipoLuminaria;
  }

  // Confianza IA detallada
  const conf = document.getElementById('reporte-conf');
  if (conf) {
    if (vista && vista.conf > 0) {
      conf.innerHTML = `<strong>Detección IA:</strong> ${tipoLuminaria} <span style="color:#00ff80;">(${Math.round(vista.conf * 100)}% certeza)</span>`;
    } else {
      conf.innerHTML = `<strong>Captura Directa:</strong> ${tipoLuminaria}`;
    }
    conf.style.display = 'block';
  }

  // Detección de condición horaria: Día o Noche
  const horaActual = new Date().getHours();
  const esDia = horaActual >= 6 && horaActual < 19;
  const condicionHoraria = (vista && vista.horario) ? vista.horario : (esDia ? 'Día' : 'Noche');
  const inpCond = document.getElementById('reporte-condicion-horaria');
  if (inpCond) {
    inpCond.value = condicionHoraria;
    inpCond.style.color = (condicionHoraria === 'Día') ? '#10b981' : '#38bdf8';
    inpCond.style.borderColor = (condicionHoraria === 'Día') ? '#10b981' : '#38bdf8';
  }

  const inpFalla = document.getElementById('reporte-falla');
  if (inpFalla) {
    inpFalla.value = '';
    setTimeout(() => inpFalla.focus(), 300);
  }

  estado('Luminaria detectada: Generación de reporte obligatoria', '#ffcc00');
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.cerrarPanelReporte = function () {
  const panel = document.getElementById('panel-reporte');
  if (panel) panel.style.display = 'none';
  const inpFalla = document.getElementById('reporte-falla');
  if (inpFalla) inpFalla.value = '';
  cajas = [];
  if (modo === 'video' && camaraEncendida) {
    iniciarAnalisisVideo();
  } else {
    estado('IA Kuche lista para escanear', '#00ff80');
  }
};
window.descartarReporte = window.cerrarPanelReporte;

// ─── Enviar reporte IA (Obligatorio con redacción humana de falla) ──
window.enviarReporteIA = async function () {
  const inpTipo = document.getElementById('reporte-tipo-luminaria');
  const selCat  = document.getElementById('reporte-categoria');
  const tipo    = (inpTipo && inpTipo.value) || (selCat && selCat.value) || 'Luminaria de Alumbrado';
  
  const inpFalla = document.getElementById('reporte-falla');
  const falla = (inpFalla && inpFalla.value ? inpFalla.value.trim() : '');
  
  if (!falla || falla.length < 3) {
    alert('Debe escribir la descripción de la falla para generar el reporte oficial.');
    if (inpFalla) inpFalla.focus();
    return;
  }

  const inpCond = document.getElementById('reporte-condicion-horaria');
  const cond = (inpCond && inpCond.value ? inpCond.value : '');
  
  const img  = document.getElementById('reporte-img');
  const imgB64 = (img && img.src && img.src.startsWith('data:')) ? img.src.split(',')[1] : null;

  const btnSubmit = document.querySelector('#panel-reporte .btn-submit-report');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Guardando Reporte Oficial...</span>';
  }

  try {
    const detalleIncidencia = `${falla}${cond ? ' [' + cond + ']' : ''}`;
    await _enviarReporte(tipo, detalleIncidencia, imgB64);
    mostrarToast('Reporte oficial registrado con éxito');
    
    document.getElementById('panel-reporte').style.display = 'none';
    if (inpFalla) inpFalla.value = '';
    
    // Reiniciar para la siguiente luminaria
    if (modo === 'video' && camaraEncendida) {
      setTimeout(iniciarAnalisisVideo, 800);
    } else {
      estado('Reporte guardado — Listo para siguiente luminaria', '#00ff80');
    }
  } catch (err) {
    alert('Error al registrar reporte: ' + err.message);
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Confirmar y Enviar Reporte Oficial</span>`;
    }
  }
};

let fotoManualBase64 = null;

window.cargarFotoManual = function (event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    fotoManualBase64 = evt.target.result;
    const prevBox = document.getElementById('manual-preview-container');
    const prevImg = document.getElementById('manual-preview-img');
    const prompt = document.getElementById('manual-upload-prompt');
    const label = document.getElementById('manual-file-label');
    if (prevBox && prevImg) {
      prevImg.src = fotoManualBase64;
      prevBox.style.display = 'block';
    }
    if (prompt) prompt.style.display = 'none';
    if (label) label.textContent = 'Cambiar Fotografía';

    // Habilitar envío del reporte únicamente cuando la imagen está cargada
    const btnSubmit = document.getElementById('btn-enviar-manual') || document.querySelector('#sec-manual .btn-primary-action');
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '1';
      btnSubmit.style.cursor = 'pointer';
    }
    const avisoFoto = document.getElementById('manual-foto-requerida-msg');
    if (avisoFoto) avisoFoto.style.display = 'none';

    const resBox = document.getElementById('manual-resultado-exito');
    if (resBox) resBox.style.display = 'none';
    estado('Foto cargada — Puede enviar el reporte', '#10b981');
  };
  reader.readAsDataURL(file);
};

window.eliminarFotoManual = function () {
  fotoManualBase64 = null;
  const prevBox = document.getElementById('manual-preview-container');
  const prevImg = document.getElementById('manual-preview-img');
  const prompt = document.getElementById('manual-upload-prompt');
  const input = document.getElementById('manual-foto-input');
  const label = document.getElementById('manual-file-label');
  if (prevBox) prevBox.style.display = 'none';
  if (prevImg) prevImg.src = '';
  if (prompt) prompt.style.display = 'flex';
  if (input) input.value = '';
  if (label) label.textContent = 'Seleccionar Evidencia';

  // Deshabilitar envío del reporte hasta que se vuelva a cargar una foto
  const btnSubmit = document.getElementById('btn-enviar-manual') || document.querySelector('#sec-manual .btn-primary-action');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.5';
    btnSubmit.style.cursor = 'not-allowed';
  }
  const avisoFoto = document.getElementById('manual-foto-requerida-msg');
  if (avisoFoto) avisoFoto.style.display = 'flex';

  estado('Foto removida', '#aaa');
};

// ─── Enviar reporte Manual ────────────────────────────────────────
window.enviarReporteManual = async function () {
  if (!fotoManualBase64) {
    alert('Debe cargar una fotografía de la luminaria antes de enviar el reporte.');
    return;
  }

  const cat  = document.getElementById('infra-categoria-manual').value;
  const desc = (document.getElementById('desc-manual').value || '').trim();
  const btnSubmit = document.getElementById('btn-enviar-manual') || document.querySelector('#sec-manual .btn-primary-action');
  
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.6';
  }

  const fotoEnviada = fotoManualBase64;

  try {
    const resp = await _enviarReporte(cat, desc, fotoEnviada);

    // Mostrar la foto y la confirmación en el modo manual una vez subida
    const resBox = document.getElementById('manual-resultado-exito');
    const resImg = document.getElementById('manual-resultado-img');
    const resFolio = document.getElementById('manual-resultado-folio');
    const resDetalle = document.getElementById('manual-resultado-detalle');

    if (resBox) {
      const folio = (resp && (resp.folio || (resp.item && resp.item.folio))) ? (resp.folio || resp.item.folio) : 'Registrado';
      if (resFolio) resFolio.textContent = folio;
      if (resDetalle) resDetalle.textContent = `${cat} — ${desc || 'Sin notas adicionales'}`;

      if (fotoEnviada && resImg) {
        resImg.src = fotoEnviada;
        resImg.parentElement.style.display = 'block';
      } else if (resImg) {
        resImg.parentElement.style.display = 'none';
      }
      resBox.style.display = 'block';
    }

    document.getElementById('desc-manual').value = '';
    eliminarFotoManual();
  } finally {
    if (btnSubmit && fotoManualBase64) {
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '1';
    }
  }
};

// ─── Función base de envío ────────────────────────────────────────
async function _enviarReporte(categoria, descripcion, imgB64) {
  const texto = categoria + (descripcion ? ' | ' + descripcion : '');
  
  let usuarioActivo = 'Versión Demo';
  try {
    const ses = localStorage.getItem('kuche_basic_session') || sessionStorage.getItem('kuche_basic_session');
    if (ses) {
      const parsed = JSON.parse(ses);
      if (parsed && (parsed.user || parsed.nombre)) usuarioActivo = parsed.user || parsed.nombre;
    }
  } catch(e) {}

  const jwtToken = localStorage.getItem('kuche_jwt_token') || sessionStorage.getItem('kuche_jwt_token') || '';
  const headers = { 'Content-Type': 'application/json' };
  if (jwtToken) {
    headers['Authorization'] = 'Bearer ' + jwtToken;
  }

  const body = {
    luminaria: categoria,
    incidencia: texto,
    placa: texto,
    tipo: 'Inspección Kuche',
    usuario: usuarioActivo,
    img: imgB64 || null,
    conf: '1.0',
    lat: ubiActual ? ubiActual.lat : null,
    lon: ubiActual ? ubiActual.lon : null
  };

  try {
    const targetUrl = window.KucheAPI ? window.KucheAPI.apiUrl('/api/infraestructura/registrar') : '/api/infraestructura/registrar';
    const r = await fetch(targetUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    if (r.ok) {
      const resJson = await r.json().catch(() => ({}));
      const aviso = resJson.aviso_proximidad ? ` (${resJson.aviso_proximidad})` : '';
      mostrarToast('Reporte enviado correctamente' + aviso);
      LOG('Reporte enviado: ' + texto + aviso, '#00ff80');
      estado('Reporte enviado con éxito' + aviso, '#00ff80');
      sincronizarColaOffline();
      return { ok: true, ...resJson };
    } else {
      throw new Error('HTTP ' + r.status);
    }
  } catch (e) {
    LOG('Sin conexión al servidor. Encolando reporte en almacenamiento local...', '#ff9800');
    encolarReporteOffline(body);
    mostrarToast('Sin conexion al servidor. Reporte guardado localmente');
    estado('Guardado en cola offline', '#ff9800');
    return { ok: true, offline: true };
  }
}

// ─── Cola y Sincronización Fuera de Línea (Offline-First) ────────
function encolarReporteOffline(item) {
  try {
    const cola = JSON.parse(localStorage.getItem('kuche_cola_offline') || '[]');
    item._ts = Date.now();
    cola.push(item);
    localStorage.setItem('kuche_cola_offline', JSON.stringify(cola));
    actualizarInsigniaOffline();
  } catch(e) {
    console.error('Error guardando en cola offline:', e);
  }
}

async function sincronizarColaOffline() {
  try {
    const cola = JSON.parse(localStorage.getItem('kuche_cola_offline') || '[]');
    if (!cola.length) {
      actualizarInsigniaOffline();
      return;
    }
    
    // Si KucheAPI puede resolver la URL del backend, invocarlo primero
    if (window.KucheAPI && typeof window.KucheAPI.sincronizarUrl === 'function') {
      await window.KucheAPI.sincronizarUrl();
    }

    const targetUrl = window.KucheAPI ? window.KucheAPI.apiUrl('/api/infraestructura/registrar') : '/api/infraestructura/registrar';

    // En GitHub Pages, si no hay backend activo disponible, esperar sin saturar con errores 404
    if (window.location.hostname.includes('github.io') && (!window.KucheAPI || !window.KucheAPI.getUrl())) {
      actualizarInsigniaOffline();
      return;
    }

    LOG(`Sincronizando ${cola.length} reporte(s) offline pendientes con el servidor...`, '#00d2ff');
    const pendientes = [];
    const jwtToken = localStorage.getItem('kuche_jwt_token') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (jwtToken) headers['Authorization'] = 'Bearer ' + jwtToken;

    let subidos = 0;
    for (const item of cola) {
      try {
        const payload = {
          luminaria: item.luminaria || item.incidencia || item.placa || 'Luminaria Registrada',
          incidencia: item.incidencia || item.luminaria || 'Luminaria Registrada',
          placa: item.placa || item.luminaria || item.incidencia || 'Luminaria Registrada',
          tipo: item.tipo || 'Inspección Kuche',
          usuario: item.usuario || 'Versión Demo',
          img: item.img || item.imagen_base64 || item.foto || null,
          conf: item.conf || '1.0',
          lat: (item.lat !== undefined && item.lat !== null && item.lat !== '') ? Number(item.lat) : (item.ubi && item.ubi.includes(',') ? Number(item.ubi.split(',')[0]) : null),
          lon: (item.lon !== undefined && item.lon !== null && item.lon !== '') ? Number(item.lon) : (item.ubi && item.ubi.includes(',') ? Number(item.ubi.split(',')[1]) : null),
          ubi: item.ubi || ((item.lat && item.lon) ? `${item.lat},${item.lon}` : '')
        };
        const resp = await fetch(targetUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });
        if (resp.ok) {
          subidos++;
        } else {
          pendientes.push(item);
        }
      } catch(err) {
        pendientes.push(item);
      }
    }
    localStorage.setItem('kuche_cola_offline', JSON.stringify(pendientes));
    actualizarInsigniaOffline();
    if (subidos > 0) {
      mostrarToast(`✅ ${subidos} reporte(s) sincronizados y guardados en la base de datos`);
      LOG(`${subidos} reporte(s) offline subidos exitosamente`, '#00ff80');
      estado(`${subidos} reporte(s) sincronizados con éxito`, '#00ff80');
    }
  } catch(e) {
    console.error('Error en sincronización offline:', e);
  }
}

function actualizarInsigniaOffline() {
  try {
    const cola = JSON.parse(localStorage.getItem('kuche_cola_offline') || '[]');
    let badge = document.getElementById('badge-offline-queue');
    if (cola.length > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'badge-offline-queue';
        badge.style.cssText = 'position:fixed; bottom:14px; left:14px; z-index:99999; background:#9B2247; color:#fff; font-size:11px; font-weight:700; padding:6px 14px; border-radius:20px; border:1px solid #E6D194; box-shadow:0 4px 14px rgba(0,0,0,0.6); display:flex; align-items:center; gap:8px; cursor:pointer; font-family:"Montserrat", sans-serif;';
        badge.title = 'Clic para intentar subir ahora';
        badge.onclick = async () => {
          mostrarToast('Sincronizando reportes pendientes...');
          if (window.KucheAPI && typeof window.KucheAPI.sincronizarUrl === 'function') {
            await window.KucheAPI.sincronizarUrl();
          }
          await sincronizarColaOffline();
        };
        document.body.appendChild(badge);
      }
      badge.innerHTML = `<span>⏳ ${cola.length} reporte(s) en cola offline</span> <span style="background:rgba(255,255,255,0.25); padding:2px 6px; border-radius:10px; font-size:10px; text-decoration:underline;">Subir</span>`;
      badge.style.display = 'flex';
    } else if (badge) {
      badge.style.display = 'none';
    }
  } catch(e) {}
}

window.addEventListener('online', () => {
  LOG('Conexión a internet restablecida', '#00ff80');
  sincronizarColaOffline();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sincronizarColaOffline();
});
window.addEventListener('DOMContentLoaded', () => {
  actualizarInsigniaOffline();
  setTimeout(sincronizarColaOffline, 1500);
});

// Reintento continuo automático cada 6 segundos si hay reportes pendientes
setInterval(() => {
  const cola = JSON.parse(localStorage.getItem('kuche_cola_offline') || '[]');
  if (cola.length > 0) {
    sincronizarColaOffline();
  }
}, 6000);

if (window.KucheAPI && typeof window.KucheAPI.onStateChange === 'function') {
  window.KucheAPI.onStateChange(st => {
    if (st && st.online) {
      sincronizarColaOffline();
    }
  });
}

// ─── Toast de confirmación ────────────────────────────────────────
function mostrarToast(msg) {
  const t = document.getElementById('toast-ok');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ─── Cambio de modo ───────────────────────────────────────────────
window.cambiarModo = function (nuevoModo) {
  const panel = document.getElementById('panel-reporte');
  if (panel && panel.style.display === 'block') {
    mostrarToast('Reporte obligatorio pendiente. Envíe el reporte antes de cambiar de sección.');
    return;
  }
  modo = nuevoModo;
  ['video', 'foto', 'manual'].forEach(m => {
    const tab = document.getElementById('tab-' + m);
    if (tab) tab.classList.toggle('activa', m === nuevoModo);
  });

  const secVideo  = document.getElementById('sec-video');
  const secFoto   = document.getElementById('sec-foto');
  const secManual = document.getElementById('sec-manual');
  const visor     = document.getElementById('visor-container');
  const manPrev   = document.getElementById('manual-preview');

  if (secVideo)  secVideo.style.display  = nuevoModo === 'video'  ? 'flex' : 'none';
  if (secFoto)   secFoto.style.display   = nuevoModo === 'foto'   ? 'flex' : 'none';
  if (secManual) secManual.style.display = nuevoModo === 'manual' ? 'flex' : 'none';

  if (nuevoModo === 'manual') {
    detenerAnalisisVideo();
    if (visor) visor.style.display = 'none';
    if (manPrev) {
      manPrev.style.display = 'flex';
      const pausedEl = document.getElementById('cam-paused-msg');
      if (pausedEl) pausedEl.style.display = 'none';
      const prompt = document.getElementById('manual-upload-prompt');
      const prevBox = document.getElementById('manual-preview-container');
      if (fotoManualBase64) {
        if (prevBox) prevBox.style.display = 'block';
        if (prompt) prompt.style.display = 'none';
      } else {
        if (prevBox) prevBox.style.display = 'none';
        if (prompt) prompt.style.display = 'flex';
      }
    }
    const btnSubmit = document.getElementById('btn-enviar-manual') || document.querySelector('#sec-manual .btn-primary-action');
    const avisoFoto = document.getElementById('manual-foto-requerida-msg');
    if (fotoManualBase64) {
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.style.opacity = '1'; btnSubmit.style.cursor = 'pointer'; }
      if (avisoFoto) avisoFoto.style.display = 'none';
      estado('Modo Demo: foto cargada, listo para enviar reporte', '#10b981');
    } else {
      if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.style.opacity = '0.5'; btnSubmit.style.cursor = 'not-allowed'; }
      if (avisoFoto) avisoFoto.style.display = 'flex';
      estado('Modo Demo: cargue una foto ya tomada para habilitar el reporte', '#aaa');
    }
  } else if (nuevoModo === 'foto') {
    detenerAnalisisVideo();
    if (visor) visor.style.display = 'block';
    if (manPrev) manPrev.style.display = 'none';
    estado('Modo Foto: pulsa "Capturar y Analizar" o sube una imagen', '#00d2ff');
  } else {
    // Modo Video
    if (visor) visor.style.display = 'block';
    if (manPrev) manPrev.style.display = 'none';
    if (camaraEncendida) iniciarAnalisisVideo();
    else detenerAnalisisVideo();
  }
};

// ─── PWA: Registro de Service Worker e Instalación ────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btns = document.querySelectorAll('.btn-instalar-pwa');
  btns.forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      if (typeof window.iniciarInstalacionPWA === 'function') {
        const tipo = window.location.pathname.includes('app.html') ? 'demo' : 'oficial';
        window.iniciarInstalacionPWA(tipo);
      }
    };
  });
});

