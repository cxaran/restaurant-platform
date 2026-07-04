# Revisión de fidelidad visual — Tony-Tony Etapa 1

**Referencia:** handoff local `.design-handoff/tony-tony/Tony-Tony-Etapa-1.dc.html` (el enlace
remoto no se consultó; la copia local cubre las escenas 1a–1j, 2a, 3a, 4a, 5a, 6a, 7a/7b).
**Método:** stack Docker aislado real + Chrome DevTools MCP, viewports 390×844 / 768×1024 /
1440×900, con Tony-Tony aplicado COMO CONFIGURACIÓN (trade name, slogan, preset «cálido» con
acento; jamás hardcodeado). Capturas en `.artifacts/browser-validation/screenshots/`.

## Correspondencia con el handoff y calificación (1–5)

| Escena handoff | Pantalla real | Calificación | Notas |
|---|---|---|---|
| 1a Menú móvil | `/menu` (390) | 4 | Tarjetas horizontales, chips de categoría, precio+Agregar, «Gana N créditos»; media de producto pendiente de contenido real |
| 1b Detalle producto | Configurador modal/bottom-sheet | 5 | Grupo requerido con contador «0 de 1 · obligatorio», radios, stepper entero, botón bloqueado con explicación — calca la intención del handoff |
| 1c Carrito | `/carrito` | 4 | Líneas con modificadores, editar/eliminar, toggle créditos, total y saldo |
| 1d Checkout | `/checkout` | 4 | Pickup/domicilio como chips pill, cupón con cotización real, nota de envío por confirmar |
| 1e/2a Seguimiento | `/pedidos/[id]` | 4 | Estados públicos simples, línea de descuento snapshot, envío «por confirmar» (H4) |
| 3a Perfil/créditos | `/cuenta` + `/creditos` | 5 | Resumen, pedidos en $ y créditos, direcciones, saldo destacado — identidad storefront, cero shell admin |
| 1g Pedidos panel | `/panel/pedidos` | 3 | Funcional y claro (cola H5 destacada en acento de alerta); densidad visual menor que el mock — aceptable para pantalla operativa |
| 1h POS | `/panel/pos` | 3 | Flujo completo (líneas, cobro, cambio del backend); estética utilitaria |
| 1j Ticket | `/panel/tickets` | 4 | 58 mm desde snapshots con descuento y créditos por línea |
| 4a Admin catálogo | `/admin/resources/*` | 4 | CRUD 100% contract-driven (categorías/productos/modificadores/zonas/financieras) |
| 5a Apariencia | `/admin/storefront` (Tema) | 4 | Presets + acento; ver limitación de `brand_primary` abajo |
| 6a Editor plantillas | `/admin/storefront` | 5 | Secciones por JSON Schema del backend, media por slot, orden, programar/cancelar con estado real, preview firmado, MISMO renderer que el público |
| 7a/7b Repartidor móvil | `/panel/reparto` (390) | 4 | Disponibilidad, cola, entrega en curso que sobrevive recargas, resumen del día |
| Portada pública (global) | `/` (3 viewports) | 4 | Crema + display slab + botones pill + hero split + footer oscuro: se siente el mismo producto |

**Fidelidad global: 4/5.** Ninguna pantalla pública principal <4; ninguna operativa <3.

## Marca, layout y componentes

- La calidez del handoff (crema `#F6EEDD`-familia, display slab tipo Alfa Slab One, botones
  pill, tarjetas con sombra suave, footer oscuro) vive en TOKENS del tema publicado
  (`--sf-*`) y presets del backend — nada de esto está hardcodeado en componentes.
- BrandLockup, logo, trade name, slogan y metadata son dinámicos; Tony-Tony entra por
  configuración (así se validó: `trade_name` y tema aplicados vía API de admin).
- Responsive: header público envuelve la navegación a segunda fila en móvil (hallazgo P1
  corregido durante esta revisión); carrusel del hero sin autoplay y con reduced motion;
  bottom-sheet del configurador en móvil; `details/summary` nativos en FAQ.

## Hallazgos

| Nivel | Hallazgo | Estado |
|---|---|---|
| P0 | Portada 500 por callback server→client en el hero | **Corregido** (commit `fix(storefront): hero CTAs render server-side`) |
| P1 | Header público encimado en 390px | **Corregido** (`fix(storefront): mobile header wraps cleanly…`) |
| P2 | `favicon.ico` 404 sin favicon dinámico | **Corregido** (icon.png de fallback) |
| P3 | 4 campos del editor sin `id/name` (aviso de DevTools, sin impacto funcional) | Documentado |
| P3 | El banner de checklist del dashboard admin puede tapar una tarjeta en 1440 hasta descartarse | Documentado (es descartable) |

## Elementos que SIGUEN siendo dinámicos por Storefront (por diseño)

Tema/tokens, hero (slides/variantes/media por slot), plantillas de contenido
(image_text/info_cards/faq), banners (promo/créditos/delivery), categorías/destacados
(bindings reales del catálogo), header/footer (schemas del backend), metadata/OG/favicon.

## Limitaciones reales (futuras, documentadas)

1. **`brand_primary` no es configurable por contrato**: el tema expone preset + `accent`;
   el rojo exacto Tony (`#C1272D`) requiere extender `ThemeCreate` (p. ej. `brand` opcional
   con la misma validación hex). Hoy el preset «cálido» da la familia cromática correcta.
2. Media de producto y del hero dependen de contenido cargado por el negocio (el mecanismo
   existe y está probado; las capturas usan placeholders elegantes donde no hay imagen).
3. La tipografía display real del handoff (Alfa Slab One) llega vía `font_family_key`
   (allowlist `display_slab`) — activada por configuración del tema.
