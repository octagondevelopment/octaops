# OctaOps - Sistema de Diseño (Estilo Coinbase iOS)

Última actualización: refinamiento con bordes suaves, píldoras translúcidas, pulso en urgentes e íconos de trazo fino.
Implementación de referencia: `css/app.css` y la tarjeta de ejemplo `design/ticket-card.html`.

## 1. Identidad Visual y Filosofía

- Estilo: interfaz limpia, minimalista y de alto contraste (Fintech/FMS moderno), con acabado de app iOS.
- Formato: PWA construida en HTML5 semántico, CSS3 plano y JavaScript (sin Tailwind ni paso de build).
- Enfoque: tarjetas livianas, tipografía clara y jerarquía visual estricta para técnicos de máquinas de café.
- Texto de la interfaz: en inglés (todo lo que se publica va en inglés).

## 2. Paleta de Colores y Tokens

### Modo claro

- Fondo de aplicación: `#F9FAFB` (off-white / gris neutro ultra claro)
- Tarjetas y contenedores: `#FFFFFF`
- Borde de tarjeta: `1px solid rgba(0, 0, 0, 0.06)`; al pasar el cursor `rgba(0, 0, 0, 0.12)`
- Divisores y bordes de campos: `1px solid #E5E7EB`
- Texto principal (títulos y métricas): `#111827`, en negrita
- Texto secundario (modelos de máquina, SLA, fechas): `#6B7280`
- Acción principal: `#0052FF` (botones y enlaces de la app)

### Modo oscuro (sigue el ajuste del teléfono)

- Fondo `#0B0F19`, tarjetas `#141A26`, relleno `#1D2433`
- Borde de tarjeta: `rgba(255, 255, 255, 0.08)`; al pasar el cursor `rgba(255, 255, 255, 0.16)`
- Texto principal `#F3F5F9`, secundario `#98A2B3`
- Acción principal `#4C8DFF`

### Estados de tickets (píldoras translúcidas)

El fondo es un 10% de opacidad de un tono vivo (16% en modo oscuro, para que se note) y el texto va en un tono oscuro del mismo color.

| Estado | Fondo (10%) | Texto claro | Texto oscuro |
| --- | --- | --- | --- |
| Pending (gris) | `rgb(107 114 128 / 0.10)` | `#4B5563` | `#9CA3AF` |
| In progress (azul) | `rgb(59 130 246 / 0.10)` | `#1E40AF` | `#93B4FF` |
| Awaiting approval / Esperando repuesto (ámbar) | `rgb(245 158 11 / 0.10)` | `#92400E` | `#FBBF24` |
| Invoiced / Listo (verde) | `rgb(16 185 129 / 0.10)` | `#065F46` | `#34D399` |
| Urgent (rojo) | `rgb(239 68 68 / 0.10)` | `#991B1B` | `#F87171` |

Nota: "Esperando repuesto" todavía no es un estado real de la base de datos (hoy existen Pending, In progress, Awaiting approval e Invoiced).

### Urgencia

- Un ticket es urgente si su prioridad empieza con 1 (por ejemplo "1 - High") o dice urgent, critical o emergency. Los facturados nunca se marcan.
- Se agrega una píldora roja "Urgent" con un punto que pulsa (`animation: pulse 1.8s ease-out infinite`).
- El pulso se desactiva con `prefers-reduced-motion`.

## 3. Tipografía y Estructura Visual

- Familia: Inter, system-ui, `-apple-system`, sans-serif.
- Micro-etiquetas (métricas, títulos de sección, nombres de campo, "STEP 1 OF 4"): `11px`, peso 600, mayúsculas, `letter-spacing: 0.05em`, color secundario.
- Datos clave del ticket (número de ticket, WT, tienda, serie, código de error, días restantes, cifras): `font-weight: 700`, con `font-variant-numeric: tabular-nums`.
- Radios de borde:
  - Tarjetas principales: `16px` a `20px`
  - Píldoras de estado: `9999px`
  - Botones de acción: `12px`
- Sombras (siempre suaves y flotantes):
  - Reposo: `0 4px 14px rgba(0, 0, 0, 0.03)`
  - Cursor encima: `0 8px 22px rgba(0, 0, 0, 0.07)`
- Íconos: SVG vectoriales de trazo fino, `stroke-width: 1.5`, `stroke-linecap: round`, `currentColor`. Nunca emojis ni flechas de texto.

## 4. Reglas de Interfaz (UI Rules)

- NO usar sombras oscuras o pesadas.
- Mantener la jerarquía: destacar siempre la marca y modelo de la máquina de café (ej. *La Marzocco Linea PB*) junto con la cafetería cliente.
- Micro-interacciones en tarjetas que se pueden tocar:
  - Cursor encima (solo dispositivos con cursor): sube 1 px, sombra más profunda, borde más marcado.
  - Al tocar o hacer clic: `transform: scale(0.985)`.
  - Botones: `transform: scale(0.98)` al presionar.
- Todas las animaciones o transiciones deben ser ligeras con CSS puro: `transition: all 0.2s ease`.
- Respetar `prefers-reduced-motion`: sin pulso ni transiciones.
- Áreas táctiles de al menos 44 px; inputs de 52 px; botón principal de 56 px.
- Márgenes con zonas seguras: `max(16px, env(safe-area-inset-*))`.
- Ni `alert()`, ni `confirm()`, ni `prompt()`: toda confirmación va dentro de la página.
- Cuando una tarjeta tiene dos píldoras, el título conserva su línea completa y las píldoras bajan alineadas a la derecha.
