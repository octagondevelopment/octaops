## Sistema de Diseño y UI

- Antes de crear o editar cualquier componente visual en HTML, CSS o JavaScript, lee y aplica estrictamente las pautas de `design.md`.
- Mantén siempre el stack tecnológico aprobado para OctaOps: PWA en JavaScript plano + Supabase (sin React Native ni Expo).

## Registro de estado para el Agente PO

- Cada vez que publiques un cambio (un commit que se sube a `main`), actualiza `docs/DEV_STATUS.md` **en el mismo commit**: la fecha de "Last updated", la versión publicada (`CACHE` en `sw.js`), una entrada nueva arriba del changelog (qué cambió, qué verificar, qué SQL debe correr el dueño) y mueve lo que corresponda entre "Built" y "Not built".
- Ese archivo lo lee el Agente PO desde GitHub: https://raw.githubusercontent.com/octagondevelopment/octaops/main/docs/DEV_STATUS.md
- El repositorio es público: ahí no van nombres de personas, clientes finales, correos, claves ni datos reales. Usa roles (técnico, oficina).
- No marques nada como verificado si no se probó: di qué se probó y qué no.
- Un cambio que solo toca documentación también deja una línea en el changelog.
