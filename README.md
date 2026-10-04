<div align="center">

# KUCHE
### Plataforma Integral de Gestión, Monitoreo de Alumbrado Público y Dashboard Geoespacial
### Intelligent Urban Infrastructure & Streetlight Monitoring PWA Platform

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-success.svg?style=flat&logo=github)](https://08nicks.github.io/dise-o_kuche/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg?style=flat&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-blueviolet.svg?style=flat&logo=pwa)](https://developer.mozilla.org/es/docs/Web/Progressive_web_apps)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**[Sitio Oficial en GitHub Pages](https://08nicks.github.io/dise-o_kuche/)** • **[Documentación Técnica de Frontend](DOCUMENTACION_KUCHE_FRONTEND.md)** • **[Especificación de Backend y Seguridad](version_portable/DOCUMENTACION_SISTEMA_KUCHE.md)**

---

</div>

## 1. Visión General del Proyecto

**KUCHE** (del vocablo popoloca *ngigua / ngwa*: **«Luz»**) es una solución tecnológica avanzada para la supervisión y mantenimiento del alumbrado público e infraestructura urbana. Integra una aplicación web progresiva (**PWA**) para captura en campo con asistencia de visión artificial (**YOLO-World**), un portal ciudadano con autenticación dual y verificación por código **OTP**, y un centro de mando geoespacial (**GIS**) interactivo.

### Principios de Identidad Institucional
* **Cero Emojis (Zero-Emoji Standard):** Interfaz sobria, institucional y libre de distractores gráficos informales.
* **Logotipo Tipográfico Puro:** Tipografía **Montserrat** en peso 800 (*Black*) con espaciado amplio, prescindiendo de iconos de focos genéricos.
* **Paleta Cromática Biocultural:**
  * **Guinda Institucional:** `#611232` y `#9B2247`
  * **Dorado Metálico:** `#BC955C` y `#C59B27`
  * **Pizarra y Carbón Táctico:** `#0F1117` y `#161922`
  * **Barro Terracota Metzontla:** `#A84A32`

---

## 2. Ecosistema de Módulos Web

```text
dise-o_kuche/
│
├── portal.html                     # Acceso Ciudadano / Oficial con selector y modal OTP
├── oficial.html                    # PWA de Campo con cámara WebRTC, GPS y reporte obligatorio
├── dashboard.html                  # Centro de Mando GIS con Leaflet multi-capa y visor modal
├── index.html                      # Índice general del portal y accesos rápidos
├── propuestas.html                 # Matriz 3x3 de layouts y cédulas técnicas
├── PROPUESTAS_VISUALES_KUCHE.html  # Acervo histórico y propuesta biocultural popoloca
├── backend_url.json                # Sincronización automática de túnel Cloudflare
└── DOCUMENTACION_KUCHE_FRONTEND.md # Especificación técnica exhaustiva de frontend
```

---

## 3. Características Principales

### 3.1 Portal Ciudadano y Autenticación Dual (`portal.html`)
* **Modo Demo Rápido:** Acceso inmediato sin registro para inspección ciudadana de prueba.
* **Modo Oficial con Autenticación:**
  * **Identificación Flexible:** Admite Correo Electrónico Institucional o **CURP oficial** (validada con expresión regular de 18 caracteres de SEGOB/RENAPO).
  * **Verificación de Seguridad OTP:** Modal interactivo con código numérico de 6 dígitos y temporizador (*cooldown*) de 60 segundos para evitar saturación (*anti-bombing*).
  * **Protección Anti-Fuerza Bruta en Frontend:** Bloqueo temporal tras intentos fallidos consecutivos.
  * **Sanitización XSS:** Escape exhaustivo en el renderizado dinámico del DOM.

### 3.2 PWA de Campo con Inferencia IA (`oficial.html`)
* **Cámara Asistida y Ráfaga:** Grabación en ráfaga de 10 segundos con compresión Canvas local para economizar datos celulares.
* **Clasificación Asistida por IA:** Conexión por WebSocket al modelo **YOLO-World** para sugerir la tipología de luminaria (LED Vial, Farol Colonial, Solar, Fotocelda).
* **Reporte Humano Mandatorio:** El usuario debe redactar obligatoriamente la falla observada antes de registrar la incidencia; no se permiten reportes automáticos ciegos.
* **Georreferenciación Satelital:** Obtención automática de latitud y longitud satelital con alta precisión.

### 3.3 Centro de Mando Geoespacial (`dashboard.html`)
* **Cartografía 100% Libre:** Motor Leaflet.js sin marcas de agua ni consumo de APIs con costo.
* **Tres Capas de Visualización:**
  1. **Modo Táctico Cyber Dark:** Mosaico OSM invertido mediante filtro de hardware CSS.
  2. **Modo Satelital de Alta Definición:** Ortofoto aérea provista por Esri World Imagery.
  3. **Modo Urbano Estándar:** Cartografía base de OpenStreetMap.
* **Inspección de Incidencias en Modal:**
  * Despliega la fotografía capturada en campo con zoom al hacer clic.
  * Muestra la descripción exacta redactada por el ciudadano o brigadista.
  * Identifica la cuenta emisora (`demo_ciudadano` o usuario oficial).
  * Coordenadas geográficas con botón de ruta directa hacia Google Maps.

---

## 4. Conexión con el Backend (RepoInf)

El frontend detecta automáticamente el entorno de ejecución:
1. Si existe un túnel activo de Cloudflare registrado en `backend_url.json`, se comunica por HTTPS/WSS cifrado hacia el servidor remoto.
2. Si se ejecuta en local, se conecta a `http://localhost:8000`.

El backend **RepoInf** provee:
* Base de datos relacional **SQLite** (`kuche_alumbrado.db`) en modo **WAL**.
* Escudo de ciberdefensa `SecurityShield` con limitación de tasa por IP (anti-DDoS), protección contra fuerza bruta y cabeceras OWASP.
* Pipeline de visión computacional con **YOLO-World** (`yolov8s-world.pt`).

---

## 5. Acceso Rápido y Despliegue

### Probar en Línea (GitHub Pages)
Ingresa directamente a:
👉 **[https://08nicks.github.io/dise-o_kuche/](https://08nicks.github.io/dise-o_kuche/)**

### Ejecución Local
Basta con abrir cualquier archivo `.html` en tu navegador web moderno preferido (Chrome, Edge, Firefox, Safari) o servir mediante un servidor HTTP local:

```bash
# Con Python
python -m http.server 3000

# Con Node.js (npx)
npx serve .
```

---

## 6. Documentación Técnica Detallada

* **[DOCUMENTACION_KUCHE_FRONTEND.md](DOCUMENTACION_KUCHE_FRONTEND.md)** — Arquitectura de componentes frontend, seguridad en cliente y manual de usuario.
* **[version_portable/DOCUMENTACION_SISTEMA_KUCHE.md](version_portable/DOCUMENTACION_SISTEMA_KUCHE.md)** — Especificación técnica del backend, modelos relacionales DDL, ciberdefensa y catálogo de endpoints.
* **[IDENTIDAD_VISUAL_KUCHE.md](IDENTIDAD_VISUAL_KUCHE.md)** — Fundamentos bioculturales popolocas y paleta cromática.

---

## 7. Licencia y Créditos

* **Desarrollo y Arquitectura:** [08Nicks](https://github.com/08Nicks) (Josué).
* **Licencia:** Distribuido bajo los términos de la **Licencia MIT**.
