# Manual de Identidad Visual — Proyecto Kuche

Documento de especificación gráfica y funcional para el sistema **Kuche**, centrado exclusivamente en el censo, monitoreo y verificación de **Luminarias y Alumbrado Público** con patrimonio biocultural popoloca (*ngigua/ngwa*).

---

## 1. Alcance Exclusivo del Sistema

> [!IMPORTANT]
> **El sistema Kuche se enfoca ÚNICA Y EXCLUSIVAMENTE en Luminarias y Alumbrado Público:**
> 1. **Luminarias LED Viales (150W / 100W):** Alumbrado público en avenidas principales, cruces y vialidades urbanas. Detección de módulos LED apagados, fotoceldas averiadas y brazos dañados.
> 2. **Luminarias Coloniales y Tradicionales (80W):** Faroles ornamentales en centros históricos, plazas cívicas y andadores peatonales.
> 3. **Luminarias Solares / Autónomas:** Puntos de iluminación con panel solar y batería en tramos periféricos.
> 
> *El sistema se enfoca exclusivamente en la red de luminarias y alumbrado público.*

---

## 2. Identidad y Nomenclatura

* **Nombre Oficial del Proyecto:** **Kuche**
* **Origen Lingüístico:** *Ngwa* / *Ngigua* (Popoloca), lengua perteneciente a la familia lingüística otomangue (región del Valle de Tehuacán y Sierra Negra, Puebla / Oaxaca).
* **Simbolismo Cultural:** La luz y guía comunal que orienta los caminos y espacios públicos en el territorio tradicional.

---

## 3. Paleta Cromática y Tipografía

* **Fondo Principal:** **Blanco puro institucional** (`#FFFFFF`) y grises de soporte suaves (`#F4F6F9`, `#F9FAFB`).
* **Tipografía Oficial:** **Montserrat** para toda la interfaz (títulos, subtítulos, botones, tablas y métricas).
* **Paleta Cromática Oficial:**
  * **Guinda Profundo / Obscuro:** `#611232` (Pantone 7421 C) — Barras de navegación superior, cabeceras y títulos destacados.
  * **Guinda Estándar:** `#9B2247` (Pantone 7420 C) — Botones de acción principal, badges y acentos.
  * **Dorado Metálico:** `#BC955C` (Pantone 465 C) — Plecas doradas inferiores de 3px, bordes de distinción e iconos.
  * **Dorado Claro / Arena:** `#E6D194` (Pantone 7402 C) — Subtítulos y elementos de realce.
  * **Barro Terracota Popoloca:** `#A84A32` y `#C87D55` (Los Reyes Metzontla).

---

## 4. Las 3 Disposiciones Estructurales (Layouts) y Matriz de 3 Estilos

### Matriz de Estilos Visuales:
* **Estilo A (Institucional Clásico):** Guinda profundo (`#611232`) y dorado metálico (`#BC955C`), fondo blanco puro, bordes sutiles de 4px, sobriedad ejecutiva.
* **Estilo B (Fusión Contemporánea):** Geometría rectilínea de alta tecnología con **bordes limpios de 6px** (`--btn-radius: 6px`). **Cero cápsulas, cero píldoras y cero redondeos circulares** (`border-radius: 9999px` erradicado al 100%). Gradientes sobrios guinda y champán metalizado.
* **Estilo C (Raíz Popoloca & Barro Metzontla):** Terracota (`#A84A32`), arcilla bronceada (`#C87D55`) y lino suave (`#FBF9F5`) con bordes de 8px y tipografía limpia.

### Las 3 Disposiciones de la App Móvil Realista (Basadas en la App Existente):
1. **Disposición Móvil 1: Flujo Secuencial Operativo (Disposición Estándar / Progresiva):**
   * Estructura directa 1:1 con la aplicación operativa (`index.html`): Barra superior Kuche con acceso a Mapa GIS $\to$ Selector de modos segmentados (`Video 10s` · `Foto` · `Manual`) + Toggle de cámara $\to$ Visor de inspección IA (195px) con retículas de 4 esquinas, caja delimitadora YOLO (*Luminaria Kuche: 96.4% [Apagada]*), láser de barrido y barra de progreso de 10s $\to$ Botón de grabación táctil $\to$ Panel de incidencia detectada con clasificación exclusiva de luminarias, porcentaje de confianza, notas de campo y confirmación de reporte $\to$ Consola de diagnóstico (WebSocket, FPS, GPS).
2. **Disposición Móvil 2: HUD Inmersivo de Pantalla Completa (Visor Dominante / Operador Táctico):**
   * El visor de cámara domina el 75% de la pantalla para trabajo dinámico en patrullaje. Isla superior flotante translúcida con temporizador REC $\to$ Retículas tácticas angulares $\to$ Sensor fotométrico HUD flotante (*0.0 LUX [APAGADA]* vs norma nocturna >25.0 LUX) $\to$ Chips de categoría flotantes (`Luminaria LED Vial` / `Luminaria Colonial`) $\to$ Cajón inferior (*bottom sheet*) deslizable con datos verificados y botón disparador a pantalla completa para envío a Monitoreo Central.
3. **Disposición Móvil 3: Panel Dividido 50/50 Visor + Mini-Mapa GPS (Orientado a Cuadrilla y Ruta):**
   * Diseñado para cuadrillas operativas en vehículo de alumbrado: Barra superior con identificación de unidad de alumbrado $\to$ Mitad superior (50%): Visor IA de campo con captura rápida de foto/video y detección de luminaria $\to$ Divisor central de telemetría GPS y rumbo $\to$ Mitad inferior (50%): **Mini-mapa interactivo real Leaflet/Esri** con posición en tiempo real de la cuadrilla y pines de luminarias cercanas $\to$ Cédula inferior de luminaria en ruta con acción de registro inmediato.

---

## 5. Proveedor de Cartografía Autorizado (Sin Bloqueos ni Marcas)

* **Proveedor:** **Esri World Street Map / Gray Canvas**
* **Estado:** 100% operativo, libre de API Key, sin marcas de agua y sin restricciones.
