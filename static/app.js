// ================================================================
// APP.JS v4.0 — Portal de Reporte Ciudadano de Infraestructura
// ================================================================

const video     = document.getElementById('video');
const canvas    = document.getElementById('canvas');
const ctx       = canvas ? canvas.getContext('2d') : null;
const sendCanvas = document.createElement('canvas');
const sc        = sendCanvas.getContext('2d');

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

// ─── Logger visible en pantalla ──────────────────────────────────
function LOG(msg, color) {
  color = color || '#aaa';
  console.log('[AGY] ' + msg);
  const panel = document.getElementById('log-panel');
  if (!panel) return;
  const line = document.createElement('div');
  line.style.cssText = 'font-size:10px; padding:1px 0; border-bottom:1px solid #111;';
  line.style.color = color;
  line.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
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

// ─── Mapeo IA → Categoría de Luminaria ────────────────────────────
function mapearCategoria(textoIA) {
  const t = (textoIA || '').toLowerCase();
  if (t.includes('colonial') || t.includes('farol') || t.includes('ornamental') || t.includes('lantern')) return 'Luminaria Colonial Dañada';
  if (t.includes('solar') || t.includes('bateria') || t.includes('panel')) return 'Luminaria Solar con Falla';
  if (t.includes('fotocelda') || t.includes('sensor') || t.includes('intermitente')) return 'Fotocelda Averiada';
  if (t.includes('brazo') || t.includes('mastil') || t.includes('soporte')) return 'Brazo de Luminaria Dañado';
  return 'Luminaria LED Vial Apagada';
}

// ─── WebSocket ───────────────────────────────────────────────────
function conectarWS() {
  if (wsDeteccion && (wsDeteccion.readyState === WebSocket.OPEN || wsDeteccion.readyState === WebSocket.CONNECTING)) return;
  const url = window.KucheAPI ? window.KucheAPI.wsUrl('/api/infraestructura/ws/detectar') : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/infraestructura/ws/detectar`;
  LOG('Conectando WS → ' + url, '#ffcc00');
  try {
    wsDeteccion = new WebSocket(url);
    wsDeteccion.binaryType = 'arraybuffer';
  } catch (err) {
    LOG('Error inicializando WS: ' + err.message, '#ff4444');
    return;
  }

  wsDeteccion.onopen = () => {
    LOG('WebSocket conectado', '#00ff80');
    estado('IA Kuche lista', '#00ff80');
    wsReconnecting = false;
    analizando = false;
    if (camaraEncendida && modo === 'video') iniciarAnalisisVideo();
  };

  wsDeteccion.onerror = (e) => {
    LOG('Error WS, verificando servidor...', '#ff9800');
    analizando = false;
    setProgressBar(false);
  };

  wsDeteccion.onmessage = (event) => {
    analizando = false;
    setProgressBar(false);
    const j = JSON.parse(event.data);
    cajas = (j.vistas || []).map(c => ({ ...c, ts: Date.now() }));

    // Si detectó algo en modo video: DETIENE LA GRABACIÓN INMEDIATAMENTE
    if (cajas.length > 0 && modo === 'video' && grabacionActiva) {
      const mejor = cajas.reduce((a, b) => a.conf > b.conf ? a : b);
      detenerAnalisisVideo(); // <-- Se detiene la grabación al detectar la luminaria
      mostrarPanelReporte(mejor);
      const nombres = cajas.map(c => `${c.texto} (${Math.round(c.conf * 100)}%)`).join(', ');
      estado(`Detectado: ${nombres} — Grabación finalizada`, '#00ff80');
      LOG(`IA Kuche detecto: ${nombres}`, '#00ff80');
      return;
    }

    if (cajas.length > 0) {
      const mejor = cajas.reduce((a, b) => a.conf > b.conf ? a : b);
      mostrarPanelReporte(mejor);
    } else {
      if (grabacionActiva) {
        estado(`Grabando video IA (${segundosRestantes}s)... Buscando fallas`, '#00ff80');
      }
    }

    // Si sigue grabando dentro del límite de 10s, enviar siguiente frame
    if (grabacionActiva && camaraEncendida && modo === 'video') {
      programarAnalisis(20);
    }
  };

  wsDeteccion.onclose = (e) => {
    LOG('WS cerrado (código ' + e.code + ')', '#ff9800');
    analizando = false;
    if (!wsReconnecting) { wsReconnecting = true; setTimeout(conectarWS, 2000); }
  };

  wsDeteccion.onerror = () => {
    LOG('Error WS — reconectando...', '#ff4444');
    analizando = false;
  };
}

// ─── Arranque ────────────────────────────────────────────────────
window.addEventListener('load', async () => {
  LOG('Sistema iniciando...', '#ffcc00');
  conectarWS();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    LOG('Camara no compatible con este navegador', '#ff4444');
    estado('Sin soporte de camara', '#ff4444');
    return;
  }
  LOG('API camara disponible', '#00ff80');

  try {
    const resp = await fetch('/api/ping', { signal: AbortSignal.timeout(3000) });
    LOG('Servidor conectado (HTTP ' + resp.status + ')', '#00ff80');
  } catch (e) {
    LOG('Servidor sin respuesta: ' + e.message, '#ff4444');
    estado('Sin conexion al servidor', '#ff4444');
  }

  LOG('Solicitando cámara...', '#ffcc00');
  const ok = await iniciarCamara();
  if (ok) {
    LOG('Camara activada', '#00ff80');
    if (modo === 'video') iniciarAnalisisVideo();
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
    video.play().catch(e => LOG('Autoplay: ' + e.message, '#ff9800'));
    video.onloadedmetadata = () => {
      LOG('Video: ' + video.videoWidth + 'x' + video.videoHeight, '#555');
      // Tamaño optimizado a 640px para captar luminarias y alumbrado público
      const maxDim = Math.max(video.videoWidth, video.videoHeight) || 1280;
      const s = Math.min(1, 640 / maxDim);
      sendCanvas.width  = Math.round(video.videoWidth  * s);
      sendCanvas.height = Math.round(video.videoHeight * s);
      const sv = Math.min(1, 800 / maxDim);
      canvas.width  = Math.round(video.videoWidth  * sv);
      canvas.height = Math.round(video.videoHeight * sv);
    };
    if (!pintarActivo) { pintarActivo = true; requestAnimationFrame(pintar); }
    estado('Escaneando luminarias...', '#00ff80');
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
    if (mp) { mp.style.display = 'flex'; mp.textContent = 'Cámara pausada'; }
    estado('Cámara pausada');
  } else {
    camaraEncendida = true;
    btn.textContent = 'Camara: ON';
    canvas.style.display = 'block';
    const mp = document.getElementById('manual-preview');
    if (mp) mp.style.display = 'none';
    const ok = await iniciarCamara();
    if (ok && modo === 'video') iniciarAnalisisVideo();
  }
}

// ─── Loop de pintura ─────────────────────────────────────────────
function pintar() {
  if (!pintarActivo) return;
  if (video.readyState >= 2) {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const ahora = Date.now();
    for (const c of cajas) {
      if (!c.caja || ahora - c.ts > 800) continue;
      const sx = canvas.width / c.w, sy = canvas.height / c.h;
      const [x1, y1, x2, y2] = c.caja;
      const alpha = Math.max(0, 1 - (ahora - c.ts) / 800).toFixed(2);
      ctx.strokeStyle = `rgba(0,255,128,${alpha})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy);
      ctx.fillStyle = `rgba(0,255,128,${alpha})`;
      ctx.font = 'bold 13px Arial';
      ctx.fillText(c.texto + ' ' + Math.round(c.conf * 100) + '%', x1 * sx, Math.max(y1 * sy - 5, 15));
    }
  }
  requestAnimationFrame(pintar);
}

// ─── Análisis video (Máximo 10 Segundos) ──────────────────────────
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
  estado('10s completados — Sin fallas detectadas', '#ff9800');
  LOG('10s transcurridos sin fallas detectadas', '#ff9800');
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
    if (ico) ico.textContent = '';
    if (txt) txt.textContent = `Detener Grabación (${segundosRestantes}s)`;
  } else {
    btn.style.background = '#00d2ff';
    btn.style.color = '#000';
    if (ico) ico.textContent = '';
    if (txt) txt.textContent = 'Iniciar Grabación (10s)';
  }
}

window.toggleGrabacionVideo = function () {
  if (grabacionActiva) {
    detenerAnalisisVideo();
    estado('Grabación detenida manualmente', '#aaa');
  } else {
    if (!camaraEncendida) toggleCamara();
    iniciarAnalisisVideo();
  }
};

function programarAnalisis(delay) {
  if (!camaraEncendida || modo !== 'video' || !grabacionActiva) return;
  if (timerAnalisis) clearTimeout(timerAnalisis);
  timerAnalisis = setTimeout(ejecutarAnalisis, delay !== undefined ? delay : 20);
}

async function ejecutarAnalisis() {
  if (analizando || !mediaStream || video.readyState < 2 || !grabacionActiva) { programarAnalisis(20); return; }
  if (!wsDeteccion || wsDeteccion.readyState !== WebSocket.OPEN) { programarAnalisis(200); return; }
  analizando = true;
  setProgressBar(true);
  try {
    sc.drawImage(video, 0, 0, sendCanvas.width, sendCanvas.height);
    const blob = await new Promise(r => sendCanvas.toBlob(r, 'image/jpeg', 0.55));
    if (!blob) { analizando = false; setProgressBar(false); programarAnalisis(20); return; }
    wsDeteccion.send(await blob.arrayBuffer());
  } catch (e) {
    LOG('Error envío frame: ' + e.message, '#ff4444');
    analizando = false; setProgressBar(false); programarAnalisis(50);
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
    const resp = await fetch(targetUrl, {
      method: 'POST',
      body: blob,
      headers: { 'Content-Type': 'image/jpeg' }
    });
    setProgressBar(false);
    const j = await resp.json();
    const vistas = j.vistas || [];
    
    let itemReporte;
    if (vistas.length > 0) {
      itemReporte = vistas.reduce((a, b) => a.conf > b.conf ? a : b);
      itemReporte.imagen = fotoDataUrl;
      const nombres = vistas.map(v => `${v.texto} (${Math.round(v.conf * 100)}%)`).join(', ');
      estado(`Luminaria detectada: ${nombres}`, '#00ff80');
      LOG('Foto IA Kuche: ' + nombres, '#00ff80');
    } else {
      itemReporte = {
        texto: 'Luminaria LED Vial Apagada',
        conf: 0.0,
        imagen: fotoDataUrl
      };
      estado('Foto capturada — Verifica la categoría de luminaria y confirma', '#00d2ff');
      LOG('Foto capturada: lista para registro', '#aaa');
    }
    
    mostrarPanelReporte(itemReporte);
  } catch (e) {
    setProgressBar(false);
    estado('Error: ' + e.message, '#ff4444');
    LOG('Error capturarFoto: ' + e.message, '#ff4444');
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
        const resp = await fetch(targetUrl, {
          method: 'POST',
          body: blob,
          headers: { 'Content-Type': 'image/jpeg' }
        });
        setProgressBar(false);
        const j = await resp.json();
        const vistas = j.vistas || [];
        
        let itemReporte;
        if (vistas.length > 0) {
          itemReporte = vistas.reduce((a, b) => a.conf > b.conf ? a : b);
          itemReporte.imagen = fotoDataUrl;
          const nombres = vistas.map(v => `${v.texto} (${Math.round(v.conf * 100)}%)`).join(', ');
          estado(`Detectado en archivo: ${nombres}`, '#00ff80');
          LOG('Archivo IA Kuche: ' + nombres, '#00ff80');
        } else {
          itemReporte = {
            texto: 'Luminaria LED Vial Apagada',
            conf: 0.0,
            imagen: fotoDataUrl
          };
          estado('Imagen cargada — Verifica la luminaria y registra', '#00d2ff');
          LOG('Archivo cargado: listo para registro', '#aaa');
        }
        
        mostrarPanelReporte(itemReporte);
      } catch (err) {
        setProgressBar(false);
        estado('Error: ' + err.message, '#ff4444');
        LOG('Error en archivo: ' + err.message, '#ff4444');
      }
    };
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  };
}

// ─── Panel de reporte IA ─────────────────────────────────────────
function mostrarPanelReporte(vista) {
  const panel = document.getElementById('panel-reporte');
  if (!panel) return;

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

  // Categoría detectada
  const cat = mapearCategoria(vista ? vista.texto : '');
  const sel = document.getElementById('reporte-categoria');
  if (sel) sel.value = cat;

  // Confianza
  const conf = document.getElementById('reporte-conf');
  if (conf) {
    if (vista && vista.conf > 0) {
      conf.textContent = 'Confianza IA: ' + Math.round(vista.conf * 100) + '% — ' + (vista.texto || '');
    } else {
      conf.textContent = 'Foto capturada — Verifica la categoría antes de enviar';
    }
    conf.style.display = 'block';
  }

  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.descartarReporte = function () {
  const panel = document.getElementById('panel-reporte');
  if (panel) panel.style.display = 'none';
  estado('Buscando fallas...', '#00ff80');
  if (modo === 'video') iniciarAnalisisVideo();
};

// ─── Enviar reporte IA ───────────────────────────────────────────
window.enviarReporteIA = async function () {
  const cat  = document.getElementById('reporte-categoria').value;
  const desc = (document.getElementById('reporte-desc').value || '').trim();
  const img  = document.getElementById('reporte-img');
  const imgB64 = (img && img.src && img.src.startsWith('data:')) ? img.src.split(',')[1] : null;

  await _enviarReporte(cat, desc, imgB64);

  document.getElementById('panel-reporte').style.display = 'none';
  if (modo === 'video') iniciarAnalisisVideo();
};

// ─── Enviar reporte Manual ────────────────────────────────────────
window.enviarReporteManual = async function () {
  const cat  = document.getElementById('infra-categoria-manual').value;
  const desc = (document.getElementById('desc-manual').value || '').trim();
  await _enviarReporte(cat, desc, null);
  document.getElementById('desc-manual').value = '';
};

// ─── Función base de envío ────────────────────────────────────────
async function _enviarReporte(categoria, descripcion, imgB64) {
  const texto = categoria + (descripcion ? ' | ' + descripcion : '');
  try {
    const body = {
      luminaria: texto,
      incidencia: texto,
      placa: texto,
      tipo: 'Inspección Kuche',
      img: imgB64 || null,
      conf: '1.0',
      lat: ubiActual ? ubiActual.lat : null,
      lon: ubiActual ? ubiActual.lon : null
    };
    const targetUrl = window.KucheAPI ? window.KucheAPI.apiUrl('/api/infraestructura/registrar') : '/api/infraestructura/registrar';
    const r = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      mostrarToast('Reporte enviado correctamente');
      LOG('Reporte enviado: ' + texto, '#00ff80');
      estado('Reporte enviado', '#00ff80');
    } else {
      throw new Error('HTTP ' + r.status);
    }
  } catch (e) {
    LOG('Error al enviar: ' + e.message, '#ff4444');
    alert('Error al enviar el reporte: ' + e.message);
  }
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
    if (manPrev) { manPrev.style.display = 'flex'; manPrev.textContent = 'Modo Manual — sin cámara'; }
    estado('Modo Manual: elige categoría y envía', '#aaa');
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
