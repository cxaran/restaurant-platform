# Sitio público (editor del storefront)

La portada es una **composición fija**: `heros en carrusel → franja destacada →
menú del catálogo → footer`. Tú editas el **contenido**; el diseño garantiza
que nada rompa el layout. **Guardar publica al instante** — no hay borradores
ni "publicar" aparte; el único apagador es «activo» en cada pieza.

Editor: `/admin/storefront`, cuatro pestañas. Permisos: `storefront:read`
(ver), `storefront:edit` (heros/destacados/footer), `storefront:manage_theme`
(apariencia y metadatos).

## Heros (la pieza de marca)

Uno o varios; los **activos rotan en carrusel**. Cada hero elige su plantilla:

| Plantilla | Cuándo usarla |
|---|---|
| **Split** | Texto + imagen lateral — el clásico de portada |
| **Background** | Imagen a pantalla completa con overlay — máximo impacto |
| **Card** | Imagen enmarcada con acento — editorial, lanzamientos |
| **Showcase** | Producto estrella: se **vincula a un producto real** y muestra su precio y disponibilidad en vivo |
| **Minimal** | Solo texto — anuncios limpios (horario, aviso) |

Por hero: antetítulo, título (con **palabra resaltada** en color de marca),
descripción, hasta 2 botones (enlaces controlados: menú, créditos, WhatsApp,
teléfono, https…), **imagen de escritorio y móvil subidas desde el mismo
formulario** (reemplazar = subir una nueva), estilo (altura, alineación,
esquema de color por tokens, overlay, lado de la imagen) y activo/orden.

Comportamiento del carrusel (pestaña Apariencia): autoplay (se pausa al pasar
el cursor y respeta `prefers-reduced-motion`), intervalo 4–12 s, transición
slide/fade, flechas y puntos. Con un solo hero no se muestran controles.

## Destacados (textos llamativos por superficie)

Mensajes cortos con **slot fijo por pantalla** — eliges contenido, tono y
animación; el diseño fija tamaño y posición para que nunca roben espacio:

| Superficie | Dónde aparece |
|---|---|
| `global` | Cinta superior de todo el sitio (descartable por el cliente) |
| `home` | Franja bajo el hero |
| `login` / `register` | Tarjeta sobre el formulario |
| `cart` | Nudge superior del carrito (el de mayor conversión) |
| `checkout` | Chips de confianza junto al pago |
| `account` | Tarjeta de aviso en Mi cuenta |

Campos: icono/badge corto, antetítulo, título, subtítulo, CTA opcional,
tono (`brand`/`soft`/`accent`), animación (`fade_in`, `slide_down`, `rise`,
`pulse`, `shimmer`, `marquee` — todas solo transform/opacity) y **ventana
temporal opcional** (visible desde/hasta) sin necesidad de programar nada.

## Footer

Singleton con **3 plantillas**: `barra` (franja mínima de una línea),
`columnas` (completo con enlaces y contacto) y `centrado` (compacto). Toggles:
mostrar eslogan (o una nota que lo sustituye), teléfonos públicos, horario de
hoy y columnas de enlaces; **redes sociales** (Facebook, Instagram, TikTok,
WhatsApp, YouTube, X) con enlaces https validados; color oscuro/suave/marca.

El eslogan, los teléfonos, la dirección y el horario **salen del perfil del
negocio** — el footer solo decide si se muestran.

## Apariencia (tema y metadatos)

- **Tema**: presets neutros (`cálido`, `fresco`, `oscuro`) + acento propio.
  Los colores fluyen por tokens a todo el sitio; nunca CSS libre.
- **Metadatos**: título del sitio (por defecto, el nombre comercial),
  descripción para buscadores, favicon e imagen para compartir (solo raster).
- **Mantenimiento**: apaga el sitio público con un mensaje; el panel y el
  admin siguen operando.

## Reglas de seguridad del contenido

- Jamás HTML/CSS/JS libre: todo campo es texto controlado con límites.
- Los enlaces usan **tipos controlados** — `javascript:`/`data:` se rechazan y
  los externos deben ser `https://`.
- Las imágenes pasan por el banco de archivos (validación por contenido real;
  SVG bloqueado).
- Todo cambio queda auditado (nombres de campos, nunca valores).
