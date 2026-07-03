# Reporte integral del proyecto

## `restaurant-platform` — Plataforma de pedidos, operación, reparto, créditos y finanzas para restaurantes

Este documento consolida el análisis funcional, los alcances y el modelado lógico de tablas según todas tus observaciones.

La plataforma debe funcionar como una vertical especializada de `platform-core`: hereda la base genérica de autenticación, permisos, archivos, auditoría y recursos administrativos, pero agrega todo el dominio de restaurante:

```text
platform-core
└── capacidades genéricas reutilizables
    ├── usuarios
    ├── roles y permisos
    ├── sesiones
    ├── auditoría
    ├── archivos
    ├── API y contratos
    └── administración base

restaurant-platform
└── dominio restaurante
    ├── catálogo
    ├── productos y modificadores
    ├── pedidos
    ├── punto de venta
    ├── entregas
    ├── repartidores
    ├── pagos
    ├── créditos
    ├── tickets
    ├── gastos e ingresos
    └── reportes

restausante
└── configuración e información específica
    ├── logo
    ├── teléfonos
    ├── menú
    ├── precios
    ├── créditos por producto
    ├── horarios
    ├── zonas de reparto
    ├── tarifas
    └── personal
```

Tony-Tony será la primera implementación del sistema, pero el núcleo de restaurante/ este proyecto deberá poder utilizarse en una hamburguesería, cafetería, dark kitchen, snack bar o negocio similar.

---

# 1. Alcance funcional consolidado

La plataforma tendrá dos áreas principales.

## 1.1 Sitio público para clientes

El sitio abrirá directamente en la vista de compra. No se debe mostrar una pantalla de inicio de sesión antes de que el cliente pueda explorar el menú.

El visitante podrá:

* Ver categorías, productos, imágenes, precios, descripciones e inclusiones.
* Ver productos destacados y promociones.
* Elegir salsas, extras, complementos u opciones disponibles.
* Agregar productos al carrito sin tener sesión iniciada.
* Modificar cantidades o eliminar productos del carrito.
* Consultar el subtotal y el costo de envío estimado cuando haya ubicación válida.
* Ver los créditos que otorga cada producto, si el negocio decide mostrarlos.
* Ver productos que pueden canjearse con créditos.
* Iniciar sesión o registrarse únicamente al confirmar un pedido.

El carrito puede guardarse localmente en el navegador mientras el visitante navega.

```text
Visita pública
↓
Explora el menú
↓
Agrega productos al carrito
↓
Personaliza salsas y extras
↓
Finalizar pedido
↓
Inicia sesión o se registra
↓
Se crea pedido ligado a un usuario
```

---

## 1.2 Compra final con usuario registrado

Aunque el carrito sea público, todos los pedidos confirmados deben pertenecer a un usuario registrado.

```text
orders.customer_user_id = users.id
```

Esto aplica para:

```text
Pedido web
Pedido por teléfono
Pedido por WhatsApp
Pedido por Facebook o Instagram
Venta a mostrador
Pedido para recoger
Pedido a domicilio
```

No debe existir un pedido sin usuario asociado.

La razón es que el sistema necesita una identidad clara para:

* Consultar historial.
* Asociar direcciones.
* Acumular créditos.
* Canjear productos.
* Mostrar pedidos al cliente.
* Evitar registros duplicados.
* Controlar reembolsos y ajustes.
* Mantener trazabilidad.

Cuando un empleado capture un pedido por llamada, WhatsApp o redes, debe buscar primero al usuario por teléfono o correo. Si no existe, podrá crear una cuenta mínima para ese cliente.

```text
Empleado recibe pedido externo
↓
Busca teléfono o correo
↓
Cliente existente:
selecciona su usuario

Cliente nuevo:
crea cuenta mínima
↓
El pedido queda asociado al usuario
```

Ese usuario podrá reclamar y configurar su acceso después mediante un proceso de verificación.

---

# 2. Principios de diseño

Estas reglas deben guiar toda la implementación.

```text
Un solo negocio.
No habrá multiempresa ni business_id en todas las tablas.

Una sola tabla central de pedidos.
No habrá tablas independientes para pedido web, mostrador,
WhatsApp, teléfono o reparto.

Los precios históricos nunca se reconstruyen.
Cada pedido conserva productos, precios, extras,
descuentos, envío y total del momento.

El catálogo actual sólo sirve para pedidos futuros.

Los créditos no se guardan como saldo editable.
Se calculan desde movimientos inmutables.

Los pedidos requieren aprobación.

El costo de envío puede ser automático o validado
manualmente antes de aprobar un pedido.

La ubicación exacta del cliente es opcional.

La ubicación del repartidor es opcional,
temporal y sólo visible mientras el pedido va en camino.

No se eliminan pedidos, pagos, gastos, créditos
ni movimientos financieros.
Se cancelan, reversan o anulan con historial.
```

---

# 3. Convenciones técnicas

```text
Base de datos: PostgreSQL
Geolocalización: PostGIS
Llaves principales: UUID
Dinero: NUMERIC(12,2)
Créditos: INTEGER
Fechas: TIMESTAMPTZ
Zona horaria principal: America/Mexico_City
Archivos: BYTEA
Ubicaciones: geometry(Point, 4326)
Zonas de reparto: geometry(MultiPolygon, 4326)
```

Los campos técnicos estarán en inglés; la interfaz mostrará etiquetas en español.

Ejemplo:

```text
Campo técnico:
shipping_total_amount

Etiqueta en interfaz:
Costo de envío
```

Para catálogos administrativos se utilizarán campos como:

```text
is_active
is_available
sort_order
created_at
updated_at
created_by
updated_by
```

No todas las tablas requieren todos los campos. Por ejemplo, una bitácora histórica no debería modificarse después de crearla.

---

# 4. Alcance de `platform-core` y `restaurant-platform`

## 4.1 Capacidades heredadas desde `platform-core`

`platform-core` debe seguir siendo genérico. No debe saber qué es boneless, repartidor, salsa, orden de comida o costo de envío.

Capacidades que pueden provenir de la base genérica:

```text
users
roles
permissions
user_roles
role_permissions
sesiones
autenticación
auditoría
archivos
validación
paginación
filtros
búsqueda
metadata de recursos
administración genérica
```

---

## 4.2 Capacidades propias de `restaurant-platform`

Estas entidades y reglas pertenecen al dominio restaurante:

```text
products
modifier_groups
orders
payments
delivery_zones
shipping_rate_rules
delivery_assignments
courier_tracking_sessions
financial_entries
credit_redemptions
ticket_print_logs
```

No deben subir a `platform-core` salvo que, en el futuro, descubras que una pieza es realmente útil para muchos proyectos distintos.

---

# 5. Configuración del negocio único

El restaurante es un solo negocio. No se implementará multiempresa ni múltiples sucursales en esta fase.

## 5.1 `business_profile`

Esta tabla representa el negocio y debe tener exactamente un registro.

```text
business_profile
├── id SMALLINT PK CHECK (id = 1)
├── trade_name VARCHAR(120) NOT NULL
├── legal_name VARCHAR(180) NULL
├── slogan VARCHAR(180) NULL
├── email VARCHAR(180) NULL
├── main_address TEXT NULL
├── currency_code CHAR(3) NOT NULL DEFAULT 'MXN'
├── timezone VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City'
├── order_prefix VARCHAR(12) NOT NULL DEFAULT 'TT'
├── logo_file_id UUID NULL FK stored_files.id
├── is_accepting_orders BOOLEAN NOT NULL DEFAULT true
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplo:

```text
id: 1
trade_name: Tony-Tony
slogan: Sabor que te hace volver
order_prefix: TT
currency_code: MXN
```

La restricción `CHECK (id = 1)` evita que por accidente se creen varios negocios.

---

## 5.2 `business_phones`

No se debe limitar el negocio a un solo teléfono.

```text
business_phones
├── id UUID PK
├── label VARCHAR(80) NULL
├── phone VARCHAR(30) NOT NULL
├── phone_normalized VARCHAR(30) NOT NULL
├── is_whatsapp BOOLEAN NOT NULL DEFAULT false
├── is_public BOOLEAN NOT NULL DEFAULT true
├── is_primary BOOLEAN NOT NULL DEFAULT false
├── is_active BOOLEAN NOT NULL DEFAULT true
├── sort_order INTEGER NOT NULL DEFAULT 0
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
Pedidos por WhatsApp
Teléfono principal
Atención a clientes
Teléfono alternativo
```

Debe existir como máximo un teléfono principal activo.

```text
UNIQUE(is_primary)
WHERE is_primary = true
```

---

## 5.3 `business_settings`

Tabla de un solo registro para configuración operativa.

```text
business_settings
├── id SMALLINT PK CHECK (id = 1)
├── allow_online_orders BOOLEAN NOT NULL DEFAULT true
├── allow_delivery BOOLEAN NOT NULL DEFAULT true
├── allow_pickup BOOLEAN NOT NULL DEFAULT false
├── allow_counter_sales BOOLEAN NOT NULL DEFAULT true
├── allow_customer_registration BOOLEAN NOT NULL DEFAULT true
├── require_registered_user_for_checkout BOOLEAN NOT NULL DEFAULT true
├── order_approval_required BOOLEAN NOT NULL DEFAULT true
├── minimum_delivery_order_amount NUMERIC(12,2) NULL
├── free_shipping_global_from_amount NUMERIC(12,2) NULL
├── ticket_footer_text TEXT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Configuraciones importantes:

```text
Permitir o bloquear pedidos web.
Permitir o bloquear entregas.
Permitir ventas a mostrador.
Definir compra mínima a domicilio.
Definir envío gratis global.
Definir si todos los pedidos requieren aprobación.
Personalizar texto final de tickets.
```

---

# 6. Horarios normales, especiales y días no laborales

## 6.1 `business_weekly_hours`

Permite definir el horario semanal y varios rangos por día.

```text
business_weekly_hours
├── id UUID PK
├── day_of_week SMALLINT NOT NULL
├── slot_number SMALLINT NOT NULL DEFAULT 1
├── opens_at TIME NOT NULL
├── closes_at TIME NOT NULL
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplo:

```text
Sábado:
12:00 a 17:00
18:00 a 23:30
```

---

## 6.2 `business_special_dates`

Para días festivos, cierres, mantenimientos o eventos.

```text
business_special_dates
├── id UUID PK
├── calendar_date DATE NOT NULL UNIQUE
├── is_closed BOOLEAN NOT NULL DEFAULT false
├── reason VARCHAR(250) NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

---

## 6.3 `business_special_date_slots`

Permite horarios específicos para fechas especiales.

```text
business_special_date_slots
├── id UUID PK
├── special_date_id UUID NOT NULL FK business_special_dates.id
├── slot_number SMALLINT NOT NULL DEFAULT 1
├── opens_at TIME NOT NULL
├── closes_at TIME NOT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
24 de diciembre:
12:00 a 19:00

25 de diciembre:
Cerrado

Día de evento:
17:00 a 01:00
```

La prioridad para determinar disponibilidad será:

```text
Horario especial del día
↓
Horario semanal normal
↓
Sin horario configurado = cerrado
```

---

# 7. Archivos, imágenes, tickets, evidencias y facturas

## 7.1 `stored_files`

Todos los archivos deben concentrarse en una tabla reutilizable.

```text
stored_files
├── id UUID PK
├── original_filename VARCHAR(255) NOT NULL
├── mime_type VARCHAR(120) NOT NULL
├── byte_size BIGINT NOT NULL
├── sha256 CHAR(64) NOT NULL
├── file_content BYTEA NOT NULL
├── is_active BOOLEAN NOT NULL DEFAULT true
├── uploaded_by UUID NULL FK users.id
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Esta tabla puede almacenar:

```text
Logo del negocio.
Imágenes de productos.
Comprobantes de transferencia.
Tickets de terminal.
Facturas PDF.
Facturas XML.
Fotos de gastos.
Fotos de compras.
Fotos de gasolina.
Comprobantes de devoluciones.
Evidencias de entrega.
```

El archivo debe guardarse como binario:

```text
PostgreSQL:
BYTEA

API:
Archivo descargable, Blob o Base64 temporal

Frontend:
URL protegida o Blob
```

No es recomendable guardar Base64 directamente como texto permanente en la base de datos.

---

# 8. Usuarios, clientes, empleados y repartidores

## 8.1 Usuarios base

La identidad principal será siempre `users`.

```text
users
roles
permissions
user_roles
role_permissions
```

La clasificación será:

```text
Visitante:
No ha iniciado sesión.

Cliente:
Tiene usuario, pero no tiene rol interno.

Empleado:
Tiene usuario y uno o más roles internos.

Administrador:
Tiene usuario y permisos administrativos.

Repartidor:
Tiene usuario y capacidad de reparto.
```

No se requiere un rol específico llamado `customer`.

Un cliente puede usar el sitio y hacer pedidos porque es propietario de sus registros, no porque tenga permisos administrativos.

```text
orders.customer_user_id = current_user.id
```

---

## 8.2 `customer_profiles`

No sustituye a `users`; sólo complementa información comercial del cliente.

```text
customer_profiles
├── user_id UUID PK FK users.id
├── full_name VARCHAR(180) NOT NULL
├── phone VARCHAR(30) NOT NULL
├── phone_normalized VARCHAR(30) NOT NULL
├── email VARCHAR(180) NULL
├── internal_notes TEXT NULL
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

`internal_notes` no debe mostrarse al cliente.

Ejemplos válidos de notas internas:

```text
Cliente prefiere contacto por WhatsApp.
Cliente suele recoger pedidos.
Requiere confirmar dirección antes de enviar.
```

No deben utilizarse para información ofensiva, sensible o innecesaria.

---

## 8.3 Cuentas creadas por empleado

Cuando un pedido venga de teléfono, WhatsApp o redes, el empleado debe poder crear un cliente mínimo.

```text
Nombre
Teléfono
Correo opcional
Estado inicial de cuenta
```

La cuenta puede quedar como:

```text
invited
pending_phone_verification
active
disabled
```

El empleado no debe crear una contraseña que conozca o reutilice.

El cliente podrá reclamar después su acceso mediante verificación.

---

## 8.4 `staff_profiles`

No hace falta `business_memberships`, porque existe un solo negocio y los roles internos ya indican que un usuario pertenece al personal.

Sí conviene una tabla adicional para datos operativos del empleado o repartidor.

```text
staff_profiles
├── user_id UUID PK FK users.id
├── display_name VARCHAR(180) NOT NULL
├── contact_phone VARCHAR(30) NULL
├── contact_phone_normalized VARCHAR(30) NULL
├── public_contact_phone VARCHAR(30) NULL
├── photo_file_id UUID NULL FK stored_files.id
├── can_deliver BOOLEAN NOT NULL DEFAULT false
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Diferencia importante:

```text
contact_phone:
Número interno del empleado.

public_contact_phone:
Número autorizado para mostrarse al cliente.
```

El teléfono personal de un repartidor nunca debe exponerse automáticamente.

---

# 9. Direcciones de cliente y ubicación

## 9.1 `user_addresses`

Direcciones reutilizables del usuario.

```text
user_addresses
├── id UUID PK
├── user_id UUID NOT NULL FK users.id
├── label VARCHAR(80) NULL
├── street VARCHAR(180) NOT NULL
├── external_number VARCHAR(30) NULL
├── internal_number VARCHAR(30) NULL
├── neighborhood VARCHAR(120) NULL
├── city VARCHAR(120) NULL
├── postal_code VARCHAR(20) NULL
├── references TEXT NULL
├── location geometry(Point, 4326) NULL
├── is_default BOOLEAN NOT NULL DEFAULT false
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

La ubicación exacta será opcional.

El cliente podrá capturar únicamente:

```text
Calle.
Número.
Colonia.
Referencias.
```

Ejemplo:

```text
Calle Independencia 120
Colonia Anáhuac
Casa azul frente a la tienda
Ubicación exacta: no proporcionada
```

En ese caso el pedido puede recibirse, pero el sistema no podrá calcular automáticamente el costo de envío.

---

# 10. Zonas de reparto y tarifas

## 10.1 `delivery_zones`

Las zonas de entrega deben configurarse desde la primera versión mediante polígonos en mapa.

```text
delivery_zones
├── id UUID PK
├── code VARCHAR(40) UNIQUE NOT NULL
├── name VARCHAR(120) NOT NULL
├── description TEXT NULL
├── coverage_geometry geometry(MultiPolygon, 4326) NOT NULL
├── priority INTEGER NOT NULL DEFAULT 0
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
Zona cercana.
Zona media.
Zona lejana.
Zona especial.
```

El backend determinará si un punto pertenece a una zona usando PostGIS.

```sql
ST_Covers(coverage_geometry, customer_location)
```

La prioridad resuelve casos donde dos polígonos se superponen.

---

## 10.2 `shipping_rate_rules`

Lista editable de tarifas aplicables a zonas.

```text
shipping_rate_rules
├── id UUID PK
├── delivery_zone_id UUID NOT NULL FK delivery_zones.id
├── name VARCHAR(120) NOT NULL
├── base_fee NUMERIC(12,2) NOT NULL
├── minimum_order_amount NUMERIC(12,2) NULL
├── free_shipping_from_amount NUMERIC(12,2) NULL
├── estimated_minutes INTEGER NULL
├── priority INTEGER NOT NULL DEFAULT 0
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
Zona cercana: $20
Zona media: $30
Zona lejana: $45
Zona especial: monto definido manualmente
```

La regla de envío gratis puede venir de:

```text
Tarifa específica de zona.
↓
Configuración global de negocio.
```

---

# 11. Catálogo de productos

## 11.1 `product_categories`

Representa grupos visibles en el menú.

```text
product_categories
├── id UUID PK
├── name VARCHAR(100) NOT NULL
├── description TEXT NULL
├── sort_order INTEGER NOT NULL DEFAULT 0
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
Boneless
Litros y medios litros
Papas y extras
Promociones
Productos canjeables
```

`sort_order` permite que el administrador cambie el orden de los grupos.

```text
10 = Promociones
20 = Boneless
30 = Papas y extras
40 = Productos canjeables
```

---

## 11.2 `products`

Cada presentación vendible se representa como un producto.

```text
products
├── id UUID PK
├── category_id UUID NOT NULL FK product_categories.id
├── sku VARCHAR(80) NULL
├── name VARCHAR(180) NOT NULL
├── description TEXT NULL
├── money_price_amount NUMERIC(12,2) NULL
├── is_money_purchase_available BOOLEAN NOT NULL DEFAULT true
├── credits_awarded_per_unit INTEGER NOT NULL DEFAULT 0
├── credit_redemption_price INTEGER NULL
├── is_available BOOLEAN NOT NULL DEFAULT true
├── is_featured BOOLEAN NOT NULL DEFAULT false
├── preparation_minutes INTEGER NULL
├── sort_order INTEGER NOT NULL DEFAULT 0
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Reglas importantes:

```text
Si is_money_purchase_available = true:
money_price_amount debe tener valor mayor o igual a cero.

Si credit_redemption_price IS NOT NULL:
El producto puede canjearse con créditos.

Si credits_awarded_per_unit > 0:
El producto otorga créditos cuando se compra con dinero.

Un producto puede venderse con dinero,
con créditos o con ambos métodos.
```

Ejemplos:

```text
Orden de boneless:
Precio: $230
Créditos otorgados: 3
Canje: no disponible
```

```text
Papas a la francesa:
Precio: $35
Créditos otorgados: 1
Canje: 5 créditos
```

```text
Producto promocional:
Precio monetario: no disponible
Canje: 8 créditos
Créditos otorgados: 0
```

---

## 11.3 `product_images`

```text
product_images
├── id UUID PK
├── product_id UUID NOT NULL FK products.id
├── file_id UUID NOT NULL FK stored_files.id
├── alt_text VARCHAR(180) NULL
├── sort_order INTEGER NOT NULL DEFAULT 0
├── is_primary BOOLEAN NOT NULL DEFAULT false
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

---

## 11.4 `product_inclusions`

Representa productos o elementos incluidos sin cargo adicional.

```text
product_inclusions
├── id UUID PK
├── product_id UUID NOT NULL FK products.id
├── name VARCHAR(180) NOT NULL
├── description TEXT NULL
├── sort_order INTEGER NOT NULL DEFAULT 0
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplo:

```text
Orden de boneless:
- 12 piezas
- Papas gajo
- Zanahoria
- Apio
- Aderezo ranch
```

---

# 12. Salsas, extras y modificadores

No conviene crear tablas separadas para salsa, aderezo, extras y complementos. Un sistema genérico permite reutilizar la lógica.

## 12.1 `modifier_groups`

```text
modifier_groups
├── id UUID PK
├── name VARCHAR(120) NOT NULL
├── selection_type VARCHAR(20) NOT NULL
├── min_selections INTEGER NOT NULL DEFAULT 0
├── max_selections INTEGER NULL
├── is_required BOOLEAN NOT NULL DEFAULT false
├── sort_order INTEGER NOT NULL DEFAULT 0
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
Salsas
Extras
Aderezos
Complementos
Tamaños
```

---

## 12.2 `modifier_options`

```text
modifier_options
├── id UUID PK
├── modifier_group_id UUID NOT NULL FK modifier_groups.id
├── name VARCHAR(120) NOT NULL
├── description TEXT NULL
├── price_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0
├── sort_order INTEGER NOT NULL DEFAULT 0
├── is_available BOOLEAN NOT NULL DEFAULT true
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
Buffalo
BBQ
Mango habanero
Papas gajo
Papas a la francesa
Dip de ranch
```

---

## 12.3 `product_modifier_groups`

Relaciona un producto con los grupos de modificadores que le aplican.

```text
product_modifier_groups
├── id UUID PK
├── product_id UUID NOT NULL FK products.id
├── modifier_group_id UUID NOT NULL FK modifier_groups.id
├── min_selections_override INTEGER NULL
├── max_selections_override INTEGER NULL
├── sort_order INTEGER NOT NULL DEFAULT 0
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplo:

```text
Orden de boneless:
1. Salsa, obligatoria.
2. Extras, opcionales.

Papas a la francesa:
No requiere salsa.
```

---

## 12.4 Política de créditos en modificadores

Para la primera versión:

```text
Los modificadores no generan créditos.

Los modificadores no pueden pagarse con créditos.

Los créditos aplican a productos,
no a salsas o extras internos.
```

Si un producto se canjea con créditos y el usuario agrega un modificador de pago, el comportamiento recomendado es:

```text
Producto base:
Se paga con créditos.

Extra con costo:
Se paga con dinero.

Envío:
Siempre se paga con dinero.
```

Ejemplo:

```text
Papas canjeadas:
5 créditos

Dip de ranch adicional:
$15

Envío:
$20

Total monetario:
$35

Total de créditos:
5
```

---

# 13. Orden visual personalizable del menú

El administrador debe poder modificar el orden de todo lo que ve el cliente.

```text
Categorías.
Productos dentro de cada categoría.
Grupos de modificadores por producto.
Opciones de cada grupo.
```

El orden no debe depender del nombre, precio, fecha de creación ni UUID.

## Reglas de orden

```text
product_categories.sort_order:
Orden global de categorías.

products.sort_order:
Orden dentro de su categoría.

product_modifier_groups.sort_order:
Orden de grupos dentro de un producto.

modifier_options.sort_order:
Orden de opciones dentro de su grupo.
```

Ejemplo:

```text
Menú

1. Promociones
2. Boneless
3. Papas y extras

Boneless

1. Litro de boneless
2. Orden de boneless
3. Medio litro de boneless
```

El administrador debe poder arrastrar y soltar elementos desde una pantalla de “Orden del menú”.

El backend debe actualizar el orden de forma atómica.

```text
1. Recibe la lista completa de IDs.
2. Verifica que todos pertenezcan al grupo correcto.
3. Rechaza IDs repetidos o inexistentes.
4. Actualiza las posiciones dentro de una transacción.
5. No modifica pedidos históricos.
```

Se recomienda usar valores espaciados:

```text
10
20
30
40
```

Cuando sea necesario, el backend normaliza nuevamente las posiciones.

---

# 14. Núcleo comercial: pedidos y ventas

## 14.1 Una sola tabla `orders`

No deben existir tablas separadas como:

```text
online_orders
counter_sales
whatsapp_orders
phone_orders
delivery_orders
```

Todas las ventas y pedidos se representan con `orders`.

```text
orders
├── id UUID PK
├── order_number BIGINT NOT NULL
├── public_code VARCHAR(40) NOT NULL
├── customer_user_id UUID NOT NULL FK users.id
├── source VARCHAR(30) NOT NULL
├── fulfillment_type VARCHAR(30) NOT NULL
├── status VARCHAR(40) NOT NULL
├── payment_status VARCHAR(40) NOT NULL
├── customer_name_snapshot VARCHAR(180) NOT NULL
├── customer_phone_snapshot VARCHAR(30) NOT NULL
├── customer_email_snapshot VARCHAR(180) NULL
├── items_subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0
├── discount_total_amount NUMERIC(12,2) NOT NULL DEFAULT 0
├── shipping_total_amount NUMERIC(12,2) NULL
├── total_money_amount NUMERIC(12,2) NULL
├── credits_earned_total_snapshot INTEGER NOT NULL DEFAULT 0
├── credits_redeemed_total INTEGER NOT NULL DEFAULT 0
├── customer_note TEXT NULL
├── internal_note TEXT NULL
├── submitted_at TIMESTAMPTZ NULL
├── approved_by UUID NULL FK users.id
├── approved_at TIMESTAMPTZ NULL
├── completed_at TIMESTAMPTZ NULL
├── cancelled_at TIMESTAMPTZ NULL
├── cancelled_by UUID NULL FK users.id
├── created_by UUID NULL FK users.id
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Valores sugeridos para `source`:

```text
online
counter
phone
whatsapp
social
manual
```

Valores sugeridos para `fulfillment_type`:

```text
delivery
pickup
counter
```

Ejemplos:

```text
Pedido creado desde el sitio:
source = online
fulfillment_type = delivery
```

```text
Pedido tomado por WhatsApp:
source = whatsapp
fulfillment_type = delivery
```

```text
Venta presencial:
source = counter
fulfillment_type = counter
```

---

# 15. Histórico económico inmutable

Esta es una de las reglas más importantes del sistema.

```text
El catálogo actual define ventas futuras.

Las órdenes guardan ventas pasadas.

Nunca se reconstruye un pedido usando precios actuales.
```

Ejemplo:

```text
Lunes:
Orden de boneless = $230
Envío = $20
Total = $250

Miércoles:
Orden de boneless = $250
Envío = $30
```

El pedido del lunes debe seguir mostrando:

```text
Orden de boneless: $230
Envío: $20
Total: $250
```

No debe actualizarse a `$280`.

---

## 15.1 `order_lines`

Cada producto vendido se congela mediante snapshots.

```text
order_lines
├── id UUID PK
├── order_id UUID NOT NULL FK orders.id
├── product_id UUID NULL FK products.id
├── product_name_snapshot VARCHAR(180) NOT NULL
├── product_description_snapshot TEXT NULL
├── quantity NUMERIC(10,2) NOT NULL
├── purchase_mode VARCHAR(20) NOT NULL
├── money_unit_price_snapshot NUMERIC(12,2) NOT NULL
├── modifier_money_total_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0
├── money_line_total_amount NUMERIC(12,2) NOT NULL DEFAULT 0
├── credits_awarded_per_unit_snapshot INTEGER NOT NULL DEFAULT 0
├── credits_earned_total_snapshot INTEGER NOT NULL DEFAULT 0
├── credit_redemption_price_per_unit_snapshot INTEGER NULL
├── credits_redeemed_total INTEGER NOT NULL DEFAULT 0
├── customer_note TEXT NULL
├── sort_order INTEGER NOT NULL DEFAULT 0
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Valores de `purchase_mode`:

```text
money
credits
complimentary
```

Ejemplo de producto comprado con dinero:

```text
Orden de boneless
Cantidad: 2
Precio unitario histórico: $230
Total monetario: $460
Créditos por unidad: 3
Créditos otorgados: 6
```

Ejemplo de producto canjeado:

```text
Papas a la francesa
Cantidad: 1
Precio monetario final: $0
Costo de canje histórico: 5 créditos
Créditos otorgados: 0
```

---

## 15.2 `order_line_modifiers`

Mantiene el histórico de salsas, extras y complementos elegidos.

```text
order_line_modifiers
├── id UUID PK
├── order_line_id UUID NOT NULL FK order_lines.id
├── modifier_option_id UUID NULL FK modifier_options.id
├── group_name_snapshot VARCHAR(120) NOT NULL
├── option_name_snapshot VARCHAR(180) NOT NULL
├── quantity NUMERIC(10,2) NOT NULL DEFAULT 1
├── unit_price_adjustment NUMERIC(12,2) NOT NULL DEFAULT 0
├── total_amount NUMERIC(12,2) NOT NULL DEFAULT 0
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Aunque una salsa cambie de nombre, deje de existir o cambie de precio, el pedido histórico conserva exactamente la selección original.

---

## 15.3 `order_adjustments`

Sirve para descuentos, promociones, cortesías o cargos manuales.

```text
order_adjustments
├── id UUID PK
├── order_id UUID NOT NULL FK orders.id
├── adjustment_type VARCHAR(40) NOT NULL
├── direction VARCHAR(10) NOT NULL
├── amount NUMERIC(12,2) NOT NULL
├── reason TEXT NOT NULL
├── authorized_by UUID NOT NULL FK users.id
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Tipos sugeridos:

```text
discount
promotion
courtesy
manual_fee
```

El envío no debe manejarse aquí, porque tiene su propio historial y reglas.

---

## 15.4 `order_status_history`

Bitácora de estados y acciones.

```text
order_status_history
├── id UUID PK
├── order_id UUID NOT NULL FK orders.id
├── previous_status VARCHAR(40) NULL
├── new_status VARCHAR(40) NOT NULL
├── reason_code VARCHAR(80) NULL
├── internal_note TEXT NULL
├── customer_visible_note TEXT NULL
├── changed_by UUID NULL FK users.id
├── changed_at TIMESTAMPTZ NOT NULL
```

Motivos de cancelación recomendados:

```text
customer_cancelled
outside_coverage
product_unavailable
payment_not_verified
customer_not_reachable
duplicate_order
business_closed
other
```

---

# 16. Estados del pedido y aprobación

Todos los pedidos deben ser aprobados antes de preparación o entrega.

Estados sugeridos:

```text
draft
submitted
pending_shipping_review
pending_payment_verification
pending_approval
approved
preparing
ready
out_for_delivery
completed
cancelled
```

Estados de pago:

```text
unpaid
pending
pending_verification
paid
partially_refunded
refunded
voided
```

Flujo de un pedido web:

```text
submitted
↓
pending_shipping_review
↓
pending_payment_verification
↓
pending_approval
↓
approved
↓
preparing
↓
ready
↓
out_for_delivery
↓
completed
```

Flujo de mostrador:

```text
submitted
↓
pending_approval
↓
approved
↓
completed
```

La aprobación debe congelar el total monetario final, el costo de envío final y los créditos involucrados.

Después de aprobación no se deben editar libremente productos, precios o envío. Cualquier corrección posterior debe ser mediante reembolso, ajuste registrado o cancelación.

---

# 17. Entrega, dirección y costo de envío

## 17.1 `order_deliveries`

Sólo existe para pedidos de tipo `delivery`.

```text
order_deliveries
├── id UUID PK
├── order_id UUID UNIQUE NOT NULL FK orders.id
├── user_address_id UUID NULL FK user_addresses.id
├── recipient_name VARCHAR(180) NOT NULL
├── recipient_phone VARCHAR(30) NOT NULL
├── street VARCHAR(180) NOT NULL
├── external_number VARCHAR(30) NULL
├── internal_number VARCHAR(30) NULL
├── neighborhood VARCHAR(120) NULL
├── city VARCHAR(120) NULL
├── postal_code VARCHAR(20) NULL
├── references TEXT NULL
├── location geometry(Point, 4326) NULL
├── location_source VARCHAR(40) NOT NULL
├── delivery_note TEXT NULL
├── delivered_at TIMESTAMPTZ NULL
├── delivered_to_name VARCHAR(180) NULL
├── delivery_proof_file_id UUID NULL FK stored_files.id
├── delivery_completion_note TEXT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

La dirección del pedido debe ser un snapshot.

Aunque el cliente edite una dirección guardada después, el pedido conservará los datos reales con los que se solicitó la entrega.

Valores sugeridos para `location_source`:

```text
customer_selected
saved_address
employee_selected
geocoded
not_provided
```

---

## 17.2 `order_shipping`

No se requiere un sistema complejo de cotizaciones. Sí se necesita una sola decisión final de envío por pedido, con información suficiente para auditar cómo se calculó.

```text
order_shipping
├── id UUID PK
├── order_id UUID UNIQUE NOT NULL FK orders.id
├── delivery_zone_id UUID NULL FK delivery_zones.id
├── delivery_zone_name_snapshot VARCHAR(120) NULL
├── shipping_rate_rule_id UUID NULL FK shipping_rate_rules.id
├── shipping_rate_name_snapshot VARCHAR(120) NULL
├── calculation_status VARCHAR(40) NOT NULL
├── calculation_source VARCHAR(40) NOT NULL
├── estimated_amount NUMERIC(12,2) NULL
├── final_amount NUMERIC(12,2) NULL
├── is_free_shipping BOOLEAN NOT NULL DEFAULT false
├── manual_override_reason TEXT NULL
├── finalized_by UUID NULL FK users.id
├── finalized_at TIMESTAMPTZ NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Estados:

```text
calculated
pending_review
finalized
not_available
```

Origen del costo:

```text
polygon_auto
employee_selected_rate
employee_manual_override
free_shipping_rule
```

Reglas de negocio:

```text
Ubicación dentro de zona:
Se calcula una tarifa sugerida.

Ubicación sin zona:
El pedido se recibe, pero queda pendiente de revisión.

Ubicación no proporcionada:
El pedido se recibe, pero el envío debe validarse manualmente.

Empleado o administrador:
Puede seleccionar una tarifa existente.

Empleado o administrador:
Puede definir un monto manual con motivo obligatorio.

Pedido delivery:
No puede aprobarse mientras final_amount sea NULL.
```

---

## 17.3 `order_shipping_history`

Aunque no habrá múltiples cotizaciones, debe conservarse una bitácora si alguien cambia el costo o tarifa.

```text
order_shipping_history
├── id UUID PK
├── order_shipping_id UUID NOT NULL FK order_shipping.id
├── previous_amount NUMERIC(12,2) NULL
├── new_amount NUMERIC(12,2) NULL
├── previous_zone_name_snapshot VARCHAR(120) NULL
├── new_zone_name_snapshot VARCHAR(120) NULL
├── previous_rate_name_snapshot VARCHAR(120) NULL
├── new_rate_name_snapshot VARCHAR(120) NULL
├── reason TEXT NULL
├── changed_by UUID NULL FK users.id
├── changed_at TIMESTAMPTZ NOT NULL
```

Ejemplo:

```text
Monto estimado: $20
Monto final: $35
Motivo: dirección fuera de zona cercana
Autorizó: empleado responsable
```

---

# 18. Métodos de pago

## 18.1 `payment_method_configs`

```text
payment_method_configs
├── id UUID PK
├── code VARCHAR(40) UNIQUE NOT NULL
├── display_name VARCHAR(80) NOT NULL
├── instructions TEXT NULL
├── available_online BOOLEAN NOT NULL DEFAULT true
├── available_pos BOOLEAN NOT NULL DEFAULT true
├── requires_manual_verification BOOLEAN NOT NULL DEFAULT false
├── requires_transaction_reference BOOLEAN NOT NULL DEFAULT false
├── requires_bank_name BOOLEAN NOT NULL DEFAULT false
├── requires_payment_proof BOOLEAN NOT NULL DEFAULT false
├── allows_cash_change BOOLEAN NOT NULL DEFAULT false
├── is_active BOOLEAN NOT NULL DEFAULT true
├── sort_order INTEGER NOT NULL DEFAULT 0
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Métodos iniciales:

```text
cash_delivery
cash_counter
bank_transfer
card_terminal
other
```

Reglas típicas:

| Método                |       Verificación | Referencia |    Banco |    Evidencia |
| --------------------- | -----------------: | ---------: | -------: | -----------: |
| Efectivo a repartidor | No al crear pedido |         No |       No |           No |
| Efectivo en mostrador |                 No |         No |       No |           No |
| Transferencia         |                 Sí |         Sí |       Sí | Recomendable |
| Tarjeta en terminal   |                 Sí |         Sí | Opcional |     Opcional |
| Otro                  |       Configurable |   Opcional | Opcional |     Opcional |

Nunca deben guardarse datos bancarios sensibles.

```text
No guardar número completo de tarjeta.
No guardar CVV.
No guardar fecha de vencimiento.
No guardar token bancario sensible.
```

---

## 18.2 `payments`

La tabla permite pagos y deja abierta la posibilidad de pagos parciales o divididos más adelante.

```text
payments
├── id UUID PK
├── order_id UUID NOT NULL FK orders.id
├── payment_method_config_id UUID NOT NULL FK payment_method_configs.id
├── payment_method_name_snapshot VARCHAR(80) NOT NULL
├── status VARCHAR(40) NOT NULL
├── expected_amount NUMERIC(12,2) NOT NULL
├── received_amount NUMERIC(12,2) NOT NULL DEFAULT 0
├── change_requested_for_amount NUMERIC(12,2) NULL
├── change_amount NUMERIC(12,2) NOT NULL DEFAULT 0
├── transaction_reference VARCHAR(180) NULL
├── bank_name VARCHAR(120) NULL
├── terminal_name VARCHAR(120) NULL
├── card_last_four VARCHAR(4) NULL
├── verified_by UUID NULL FK users.id
├── verified_at TIMESTAMPTZ NULL
├── paid_at TIMESTAMPTZ NULL
├── rejected_reason TEXT NULL
├── notes TEXT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
Transferencia:
status = pending_verification
transaction_reference = 123456789
bank_name = BBVA
```

```text
Tarjeta:
status = pending_verification
transaction_reference = folio de terminal
terminal_name = Clip
```

```text
Efectivo a repartidor:
status = pending
Se marca como paid al entregar.
```

---

## 18.3 `payment_attachments`

```text
payment_attachments
├── id UUID PK
├── payment_id UUID NOT NULL FK payments.id
├── file_id UUID NOT NULL FK stored_files.id
├── attachment_type VARCHAR(40) NOT NULL
├── description VARCHAR(255) NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Tipos:

```text
payment_proof
terminal_receipt
refund_proof
other
```

---

## 18.4 `payment_refunds`

```text
payment_refunds
├── id UUID PK
├── payment_id UUID NOT NULL FK payments.id
├── amount NUMERIC(12,2) NOT NULL
├── transaction_reference VARCHAR(180) NULL
├── bank_name VARCHAR(120) NULL
├── reason TEXT NOT NULL
├── status VARCHAR(40) NOT NULL
├── processed_by UUID NOT NULL FK users.id
├── processed_at TIMESTAMPTZ NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Los reembolsos nunca borran el pago original.

---

# 19. Repartidores y ubicación opcional en tiempo real

## 19.1 `delivery_assignments`

Un pedido puede cambiar de repartidor, por eso no conviene guardar solamente un `courier_user_id` dentro de `orders`.

```text
delivery_assignments
├── id UUID PK
├── order_delivery_id UUID NOT NULL FK order_deliveries.id
├── courier_user_id UUID NOT NULL FK users.id
├── courier_name_snapshot VARCHAR(180) NOT NULL
├── courier_contact_phone_snapshot VARCHAR(30) NULL
├── tracking_session_id UUID NULL FK courier_tracking_sessions.id
├── status VARCHAR(40) NOT NULL
├── is_current BOOLEAN NOT NULL DEFAULT true
├── assigned_by UUID NULL FK users.id
├── assigned_at TIMESTAMPTZ NOT NULL
├── accepted_at TIMESTAMPTZ NULL
├── started_at TIMESTAMPTZ NULL
├── completed_at TIMESTAMPTZ NULL
├── cancelled_at TIMESTAMPTZ NULL
├── cancellation_reason TEXT NULL
├── internal_note TEXT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Estados:

```text
assigned
accepted
in_progress
completed
cancelled
reassigned
```

Sólo debe existir un repartidor actual por pedido.

```text
UNIQUE(order_delivery_id)
WHERE is_current = true
```

---

## 19.2 Visibilidad para el cliente

El cliente no debe ver al repartidor desde que crea el pedido.

La información se muestra únicamente cuando:

```text
orders.status = out_for_delivery
AND delivery_assignments.is_current = true
```

La vista podrá mostrar:

```text
Tu pedido va en camino.

Repartidor:
Carlos

Contacto:
833 XXX XXXX

Ubicación:
Disponible / no disponible

Última actualización:
Hace 1 minuto
```

Al completar, cancelar o reasignar la entrega, el cliente deja de ver:

```text
Teléfono operativo del repartidor.
Ubicación en tiempo real.
Actualizaciones de movimiento.
```

---

## 19.3 `courier_tracking_sessions`

La ubicación será opcional y debe activarse voluntariamente por el repartidor.

```text
courier_tracking_sessions
├── id UUID PK
├── courier_user_id UUID NOT NULL FK users.id
├── status VARCHAR(30) NOT NULL
├── sharing_enabled BOOLEAN NOT NULL DEFAULT false
├── current_location geometry(Point, 4326) NULL
├── current_location_at TIMESTAMPTZ NULL
├── current_accuracy_meters NUMERIC(8,2) NULL
├── started_at TIMESTAMPTZ NULL
├── ended_at TIMESTAMPTZ NULL
├── ended_reason VARCHAR(80) NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Estados:

```text
inactive
active
paused
ended
```

---

## 19.4 `courier_location_events`

Tabla opcional para historial temporal de ubicaciones.

```text
courier_location_events
├── id UUID PK
├── tracking_session_id UUID NOT NULL FK courier_tracking_sessions.id
├── location geometry(Point, 4326) NOT NULL
├── accuracy_meters NUMERIC(8,2) NULL
├── captured_at TIMESTAMPTZ NOT NULL
├── received_at TIMESTAMPTZ NOT NULL
├── created_at TIMESTAMPTZ NOT NULL
```

El cliente no debe ver la ruta completa; sólo la ubicación más reciente.

Política recomendada:

```text
Ubicación actual:
Visible mientras la sesión está activa.

Eventos históricos:
Se eliminan después de 24, 48 o 72 horas.

Pedido completado:
Se detiene ubicación.

Pedido cancelado:
Se detiene ubicación.
```

---

# 20. Tickets e impresión

No hace falta duplicar cada ticket completo como otra entidad de venta.

El ticket se genera desde los snapshots de:

```text
orders
order_lines
order_line_modifiers
order_adjustments
order_deliveries
order_shipping
payments
```

## `ticket_print_logs`

```text
ticket_print_logs
├── id UUID PK
├── order_id UUID NOT NULL FK orders.id
├── print_type VARCHAR(40) NOT NULL
├── printer_name VARCHAR(180) NULL
├── printed_by UUID NULL FK users.id
├── copy_number INTEGER NOT NULL DEFAULT 1
├── printed_at TIMESTAMPTZ NOT NULL
```

Tipos:

```text
customer_receipt
kitchen_ticket
delivery_ticket
counter_ticket
```

El ticket debe incluir:

```text
Logo y nombre del negocio.
Folio.
Fecha y hora.
Tipo de venta.
Nombre y teléfono del cliente.
Dirección y referencias, si aplica.
Productos.
Salsas y extras.
Subtotal.
Descuentos.
Costo de envío.
Total.
Método de pago.
Estado de pago.
Estado del pedido.
Empleado responsable.
Mensaje final.
```

---

# 21. Finanzas: ingresos, gastos, egresos y evidencias

## 21.1 Qué puede calcularse inicialmente

Como no habrá recetas, inventario detallado ni costos históricos de ingredientes, el sistema no podrá calcular margen exacto por platillo.

La cifra correcta será:

```text
Resultado neto registrado
=
Ingresos monetarios registrados
-
Gastos y egresos registrados
-
Reembolsos monetarios
```

No debe presentarse como “ganancia real exacta por producto”, sino como:

```text
Resultado neto del periodo.
Flujo neto registrado.
Utilidad estimada basada en movimientos registrados.
```

---

## 21.2 `financial_categories`

```text
financial_categories
├── id UUID PK
├── direction VARCHAR(10) NOT NULL
├── name VARCHAR(120) NOT NULL
├── parent_id UUID NULL FK financial_categories.id
├── is_active BOOLEAN NOT NULL DEFAULT true
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Categorías de gasto sugeridas:

```text
Insumos
Pollo
Papas
Verduras
Salsas
Aderezos
Empaques
Gas
Gasolina
Pago a repartidor
Publicidad
Luz
Agua
Internet
Renta
Sueldos
Mantenimiento
Reparaciones
Maquinaria
Utensilios
Otros gastos
```

Categorías de ingreso sugeridas:

```text
Ventas
Ingreso manual
Ajuste
Otros ingresos
```

---

## 21.3 `financial_entries`

Esta será la fuente central de movimientos monetarios.

```text
financial_entries
├── id UUID PK
├── category_id UUID NULL FK financial_categories.id
├── order_id UUID NULL FK orders.id
├── payment_id UUID NULL FK payments.id
├── reversal_of_entry_id UUID NULL FK financial_entries.id
├── direction VARCHAR(10) NOT NULL
├── entry_type VARCHAR(50) NOT NULL
├── amount NUMERIC(12,2) NOT NULL
├── occurred_at TIMESTAMPTZ NOT NULL
├── status VARCHAR(30) NOT NULL
├── payment_method_config_id UUID NULL FK payment_method_configs.id
├── transaction_reference VARCHAR(180) NULL
├── bank_name VARCHAR(120) NULL
├── terminal_name VARCHAR(120) NULL
├── counterparty_name VARCHAR(180) NULL
├── supplier_rfc VARCHAR(20) NULL
├── invoice_folio VARCHAR(120) NULL
├── invoice_uuid VARCHAR(80) NULL
├── invoice_issued_at TIMESTAMPTZ NULL
├── description TEXT NULL
├── source_type VARCHAR(30) NOT NULL
├── registered_by UUID NULL FK users.id
├── voided_by UUID NULL FK users.id
├── voided_at TIMESTAMPTZ NULL
├── void_reason TEXT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Tipos recomendados:

```text
payment_income
manual_income
expense
delivery_expense
refund
adjustment
```

Ejemplos:

```text
Ingreso:
Pago recibido del pedido TT-000245.
```

```text
Gasto:
Compra de pollo.
```

```text
Gasto:
Gasolina para reparto.
```

```text
Gasto:
Compra de utensilios.
```

```text
Gasto:
Pago de repartidor ligado al pedido TT-000245.
```

```text
Reembolso:
Devolución monetaria de pedido.
```

---

## 21.4 Evitar duplicar ingresos

Un pago marcado como pagado debe crear un solo ingreso monetario.

```text
Pago recibido: $260
↓
financial_entries:
payment_income = $260
```

No se debe crear además otro ingreso de `$230` por productos y otro de `$30` por envío si ambos ya forman parte del mismo pago, porque se duplicaría el dinero.

El desglose de productos y envío debe salir de la orden:

```text
orders.items_subtotal_amount
orders.shipping_total_amount
```

El movimiento financiero conserva el flujo real recibido:

```text
payments.received_amount
```

---

## 21.5 `financial_entry_attachments`

```text
financial_entry_attachments
├── id UUID PK
├── financial_entry_id UUID NOT NULL FK financial_entries.id
├── file_id UUID NOT NULL FK stored_files.id
├── document_type VARCHAR(40) NOT NULL
├── description VARCHAR(255) NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Tipos de documento:

```text
receipt
invoice_pdf
invoice_xml
payment_proof
expense_photo
delivery_evidence
other
```

Esta tabla cubre:

```text
Ticket de supermercado.
Factura PDF.
Factura XML.
Foto de gasolina.
Comprobante de transferencia.
Ticket de compra.
Foto de maquinaria.
Comprobante de devolución.
```

---

# 22. Sistema de créditos

El sistema no manejará “un punto por pedido”. Cada producto puede otorgar créditos al comprarse y algunos productos pueden tener precio de canje en créditos.

## 22.1 Regla comercial

```text
Cada producto puede otorgar una cantidad configurable de créditos.

Cada producto puede tener un precio alternativo en créditos.

Un producto comprado con dinero puede generar créditos.

Un producto canjeado con créditos no genera créditos.

Un producto gratuito o de cortesía no genera créditos.

El envío nunca se paga con créditos.

Los créditos se acreditan cuando el pedido está completado.

Los canjes se reservan antes de aprobar el pedido.

Los créditos no se guardan como saldo editable.
```

---

## 22.2 Ejemplo práctico

```text
Orden de boneless:
Precio: $230
Otorga: 3 créditos
Canje: no disponible
```

```text
Papas a la francesa:
Precio: $35
Otorga: 1 crédito
Canje: 5 créditos
```

Compra:

```text
2 órdenes de boneless:
6 créditos obtenidos.

1 orden de papas:
1 crédito obtenido.

Total:
7 créditos obtenidos al completar.
```

Canje:

```text
Papas a la francesa:
Costo de canje = 5 créditos.
```

---

## 22.3 `credit_redemptions`

Registra cada canje asociado a una línea concreta de pedido.

```text
credit_redemptions
├── id UUID PK
├── user_id UUID NOT NULL FK users.id
├── order_id UUID NOT NULL FK orders.id
├── order_line_id UUID NOT NULL FK order_lines.id
├── credits_spent INTEGER NOT NULL
├── status VARCHAR(30) NOT NULL
├── reserved_at TIMESTAMPTZ NOT NULL
├── consumed_at TIMESTAMPTZ NULL
├── released_at TIMESTAMPTZ NULL
├── release_reason TEXT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Estados:

```text
reserved
consumed
released
```

Flujo:

```text
Cliente selecciona producto canjeable.
↓
Backend calcula créditos disponibles.
↓
Backend reserva créditos.
↓
Pedido queda pendiente.
↓
Pedido se completa.
↓
Canje pasa a consumed.
```

Si el pedido se cancela:

```text
reserved
↓
released
```

---

## 22.4 `credit_ledger_entries`

Aunque no se guarde un saldo editable, sí es recomendable tener un historial contable inmutable de créditos.

```text
credit_ledger_entries
├── id UUID PK
├── user_id UUID NOT NULL FK users.id
├── order_id UUID NULL FK orders.id
├── order_line_id UUID NULL FK order_lines.id
├── credit_redemption_id UUID NULL FK credit_redemptions.id
├── entry_type VARCHAR(40) NOT NULL
├── credit_delta INTEGER NOT NULL
├── description TEXT NULL
├── occurred_at TIMESTAMPTZ NOT NULL
├── created_by UUID NULL FK users.id
├── reversal_of_entry_id UUID NULL FK credit_ledger_entries.id
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Tipos:

```text
earn
redeem_reservation
redemption_release
earn_reversal
redemption_refund
manual_adjustment
```

Ejemplos:

```text
earn:
+3 créditos
Pedido TT-000245 completado.
Producto: Orden de boneless.
```

```text
redeem_reservation:
-5 créditos
Canje reservado.
Producto: Papas a la francesa.
```

```text
redemption_release:
+5 créditos
Pedido cancelado antes de completarse.
```

El saldo disponible será:

```text
SUM(credit_ledger_entries.credit_delta)
```

No existe un campo como:

```text
users.credit_balance
```

porque sería modificable, vulnerable a errores y difícil de auditar.

---

## 22.5 Reembolsos parciales y créditos

Para reembolsar correctamente una parte de un pedido, conviene registrar la relación entre reembolso y línea de producto.

```text
order_line_refund_allocations
├── id UUID PK
├── payment_refund_id UUID NOT NULL FK payment_refunds.id
├── order_line_id UUID NOT NULL FK order_lines.id
├── refunded_quantity NUMERIC(10,2) NOT NULL
├── money_refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0
├── credits_refunded_total INTEGER NOT NULL DEFAULT 0
├── credits_earned_reversed_total INTEGER NOT NULL DEFAULT 0
├── reason TEXT NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplo:

```text
Pedido:
2 órdenes de boneless.

Cada orden otorgó:
3 créditos.

Se reembolsa una orden.

Resultado:
Se devuelve el dinero de una orden.
Se revierten 3 créditos.
La otra orden conserva sus 3 créditos.
```

---

## 22.6 Protección contra manipulación de créditos

```text
El frontend no manda el saldo de créditos.

El backend calcula créditos disponibles.

El backend consulta el costo de canje actual.

El backend toma snapshots al crear el pedido.

El backend valida que el producto siga activo.

El backend valida que el pedido pertenezca al usuario.

La reserva ocurre dentro de una transacción SQL.

El usuario se bloquea temporalmente durante el cálculo.

Un pedido cancelado libera créditos.

Un pedido completado consume el canje.

El envío no puede convertirse en una línea pagada con créditos.
```

---

# 23. Autorización y privacidad

## Cliente

Puede:

```text
Ver el menú.
Usar carrito público.
Crear sus propios pedidos.
Consultar sus propios pedidos.
Consultar sus propias direcciones.
Consultar sus créditos.
Canjear productos si tiene créditos.
Ver repartidor sólo cuando su pedido esté en camino.
```

No puede:

```text
Ver pedidos ajenos.
Modificar precios.
Modificar estados.
Modificar costos de envío.
Validar pagos.
Modificar créditos.
Ver teléfonos internos.
Ver ubicaciones históricas de repartidores.
```

---

## Empleado

Dependiendo de permisos:

```text
Ver pedidos.
Registrar ventas de mostrador.
Registrar pedidos de WhatsApp, teléfono o redes.
Buscar o crear clientes.
Modificar envío antes de aprobación.
Validar pagos.
Aprobar pedidos.
Cambiar estados.
Imprimir tickets.
Registrar gastos autorizados.
Asignar repartidores.
```

---

## Administrador

Puede:

```text
Administrar catálogo.
Cambiar orden de menú.
Administrar precios.
Administrar créditos por producto.
Definir productos canjeables.
Administrar zonas y tarifas.
Administrar horarios.
Administrar teléfonos.
Gestionar usuarios internos.
Gestionar pagos y reembolsos.
Registrar ingresos y egresos.
Consultar reportes.
Ver ubicación activa de repartidores.
```

---

# 24. Tablas que no deben existir por ahora

Estas tablas no se necesitan en la primera versión.

```text
business_memberships
customers
online_orders
counter_sales
whatsapp_orders
phone_orders
product_cost_history
modifier_option_cost_history
order_shipping_quotes
cash_registers
cash_sessions
inventory_movements
recipe_ingredients
users.credit_balance
```

Razones:

| Tabla                         | Razón                                                   |
| ----------------------------- | ------------------------------------------------------- |
| `business_memberships`        | Sólo existe un negocio; roles internos son suficientes. |
| `customers`                   | El cliente es un usuario registrado.                    |
| Tablas separadas por canal    | Todos los canales se resuelven en `orders.source`.      |
| Costos históricos de producto | No habrá margen exacto por receta aún.                  |
| Cotizaciones de envío         | Se usará una decisión final con historial simple.       |
| Caja y turnos                 | No habrá corte de caja en esta fase.                    |
| Inventario y recetas          | Fuera del alcance inicial.                              |
| Saldo de créditos en usuario  | El saldo debe calcularse desde el ledger.               |

---

# 25. Relaciones principales

```text
users
├── customer_profiles
├── staff_profiles
├── user_addresses
├── orders
├── delivery_assignments
├── courier_tracking_sessions
├── credit_redemptions
└── credit_ledger_entries

products
├── product_images
├── product_inclusions
├── product_modifier_groups
└── order_lines

modifier_groups
├── modifier_options
└── product_modifier_groups

delivery_zones
└── shipping_rate_rules

orders
├── order_lines
├── order_line_modifiers
├── order_adjustments
├── order_status_history
├── order_deliveries
├── order_shipping
├── order_shipping_history
├── payments
├── ticket_print_logs
├── financial_entries
└── credit_redemptions

payments
├── payment_attachments
└── payment_refunds

payment_refunds
└── order_line_refund_allocations

order_deliveries
└── delivery_assignments

delivery_assignments
└── courier_tracking_sessions

courier_tracking_sessions
└── courier_location_events

financial_entries
└── financial_entry_attachments

stored_files
├── business_profile.logo_file_id
├── product_images.file_id
├── payment_attachments.file_id
├── financial_entry_attachments.file_id
├── staff_profiles.photo_file_id
└── order_deliveries.delivery_proof_file_id
```

---

# 26. Índices y restricciones críticas

```text
orders:
UNIQUE(order_number)
UNIQUE(public_code)
INDEX(customer_user_id, created_at DESC)
INDEX(status, created_at DESC)
INDEX(source, created_at DESC)

products:
INDEX(category_id, sort_order)
INDEX(is_active, is_available)

product_categories:
INDEX(sort_order)

user_addresses:
INDEX(user_id, is_active)
GIST INDEX(location)

delivery_zones:
GIST INDEX(coverage_geometry)

order_deliveries:
UNIQUE(order_id)
GIST INDEX(location)

order_shipping:
UNIQUE(order_id)

delivery_assignments:
UNIQUE(order_delivery_id)
WHERE is_current = true

payments:
INDEX(order_id, status)
INDEX(transaction_reference)

financial_entries:
INDEX(occurred_at DESC)
INDEX(direction, occurred_at DESC)
INDEX(order_id)
INDEX(payment_id)

credit_redemptions:
UNIQUE(order_line_id)
INDEX(user_id, status)

credit_ledger_entries:
INDEX(user_id, occurred_at DESC)
INDEX(order_id)
```

Reglas lógicas fundamentales:

```text
No puede existir una entrega si fulfillment_type no es delivery.

No puede aprobarse pedido delivery sin final_amount de envío.

No puede completarse pedido sin approved_at.

No puede canjearse producto sin credit_redemption_price.

No puede haber créditos otorgados por producto pagado con créditos.

No puede mostrarse ubicación de repartidor
si el pedido no está out_for_delivery.

No puede existir más de un repartidor actual
por pedido.

No puede eliminarse un pago, gasto, reembolso
o movimiento de créditos.
```

---

# 27. Orden recomendado de implementación

## Fase 1: operación comercial base

```text
Configuración de negocio.
Usuarios, roles y perfiles.
Catálogo.
Orden de categorías y productos.
Salsas y extras.
Carrito público.
Inicio de sesión y registro al checkout.
Pedidos web.
Pedidos por teléfono, WhatsApp y redes.
Ventas de mostrador.
Direcciones.
Mapa.
Zonas de reparto.
Tarifas de envío.
Aprobación de pedidos.
Pagos manuales.
Tickets.
```

Tablas prioritarias:

```text
business_profile
business_phones
business_settings
business_weekly_hours
business_special_dates
business_special_date_slots
stored_files

customer_profiles
staff_profiles
user_addresses

product_categories
products
product_images
product_inclusions
modifier_groups
modifier_options
product_modifier_groups

delivery_zones
shipping_rate_rules

orders
order_lines
order_line_modifiers
order_adjustments
order_status_history
order_deliveries
order_shipping
order_shipping_history

payment_method_configs
payments
payment_attachments
ticket_print_logs
```

---

## Fase 2: reparto, finanzas y créditos

```text
Asignación de repartidores.
Contacto visible al iniciar envío.
Ubicación opcional en tiempo real.
Gastos e ingresos.
Facturas y evidencias.
Reembolsos.
Créditos por producto.
Canjes.
Historial de créditos.
Reportes financieros.
```

Tablas prioritarias:

```text
delivery_assignments
courier_tracking_sessions
courier_location_events

financial_categories
financial_entries
financial_entry_attachments

payment_refunds
order_line_refund_allocations

credit_redemptions
credit_ledger_entries
```

---

# 28. Resultado esperado

La plataforma final tendrá una única fuente de verdad para cada aspecto del negocio.

```text
Catálogo actual:
Define productos y precios para ventas futuras.

Orden:
Conserva exactamente lo vendido, cobrado y aprobado.

Pago:
Conserva método, referencia, banco, comprobante
y estado de verificación.

Envío:
Conserva zona, tarifa, costo final y ajustes.

Entrega:
Conserva dirección, repartidor y evidencia.

Finanzas:
Conservan ingresos, gastos, facturas,
comprobantes y reembolsos.

Créditos:
Se calculan desde productos comprados,
canjes, reservas, liberaciones y reversos.

Menú:
Puede reordenarse libremente sin cambiar
historiales, tickets, pagos ni reportes.
```

La estructura permitirá que cualquier Restaurante venda desde web, mostrador, WhatsApp, teléfono y redes; administre pedidos y repartidores; calcule costos de envío por mapa; use créditos por producto; imprima tickets; registre gastos con evidencia; y mantenga un historial confiable sin que cambios futuros de precios, productos, zonas o promociones alteren pedidos pasados.
