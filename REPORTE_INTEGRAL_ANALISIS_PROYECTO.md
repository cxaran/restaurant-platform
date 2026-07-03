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
    ├── reportes
    └── composición visual del sitio (storefront)

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

## 1.2 Compra final: usuario registrado en web, cliente opcional en pedidos capturados por personal

El carrito es público, pero un pedido web sólo puede finalizarse con un usuario registrado. Nunca aplica el checkout como invitado.

```text
Pedido web (source = online):
orders.customer_user_id = users.id
No se finaliza sin sesión iniciada.
```

No existe una tabla de clientes: usuario = cliente. Un cliente es un usuario sin roles internos, dueño de sus propios registros.

En los pedidos capturados por el personal, el cliente es opcional:

```text
Venta a mostrador
Pedido por teléfono
Pedido por WhatsApp
Pedido por Facebook o Instagram

customer_user_id puede quedar vacío.

Siempre queda registrado:
created_by = empleado (usuario) que registró el pedido
approved_by = empleado (usuario) que aprobó el pedido
```

Así se distingue con certeza un pedido en línea (creado por el propio cliente con su sesión) de uno capturado por el personal (identificable por el UUID del empleado en `created_by`), además del canal registrado en `orders.source` (web, mostrador, teléfono, redes).

La invariante se conserva: **no hay pedido sin usuario**. Todo pedido queda ligado al menos a un usuario real del sistema:

```text
Pedido web:
customer_user_id = el usuario cliente que lo creó.

Pedido capturado por personal:
created_by = el usuario empleado que lo registró.

Regla dura (nivel base de datos):
CHECK (customer_user_id IS NOT NULL OR created_by IS NOT NULL)
```

Un pedido sin cliente asociado (ligado sólo al empleado que lo registró):

* No acumula créditos.
* No puede canjear productos.
* No aparece en el historial de ningún cliente.
* Conserva trazabilidad completa por empleado, canal y snapshots.

Asociar o crear la cuenta del cliente es opcional, no un requisito para registrar la venta. Se hace cuando el cliente quiere créditos, historial o seguimiento:

```text
Empleado recibe pedido externo
↓
¿El cliente quiere créditos / historial / seguimiento?
│
├── No:
│   El pedido se registra sin cliente.
│   created_by identifica al empleado.
│
└── Sí:
    Busca teléfono o correo.
    ├── Cliente existente: selecciona su usuario.
    └── Cliente nuevo: crea cuenta mínima
        (requiere correo: todos los usuarios tienen correo;
        reclamable después mediante verificación).
```

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
Correo (obligatorio)
Estado inicial de cuenta
```

Todos los usuarios tienen correo: es la identidad de acceso y el canal de reclamo de la cuenta. Si el cliente no proporciona un correo, no se crea cuenta y el pedido se registra sin usuario asociado (ver sección 1.2).

La cuenta puede quedar como:

```text
invited
pending_phone_verification
active
disabled
```

El empleado no debe crear una contraseña que conozca o reutilice.

El cliente podrá reclamar después su acceso mediante verificación.

Crear o asociar la cuenta es opcional: si el cliente no la quiere, el pedido se registra sin usuario asociado (ver sección 1.2) y simplemente no acumula créditos ni aparece en un historial de cliente.

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
├── is_delivery_available BOOLEAN NOT NULL DEFAULT false
├── courier_public_note VARCHAR(120) NULL
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

is_delivery_available:
El repartidor indica si está disponible
para tomar envíos en este momento.

courier_public_note:
Descripción breve visible para el cliente
sólo mientras su pedido va en camino.
Ejemplo: «Moto roja».
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
├── max_units_per_order INTEGER NULL
├── daily_unit_limit INTEGER NULL
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

Si max_units_per_order IS NOT NULL:
Un solo pedido no puede incluir más unidades
del producto que ese límite.
Si el cliente quiere más, debe hacer otro pedido
(y pagar otro envío).

Si daily_unit_limit IS NOT NULL:
El sistema deja de aceptar unidades del producto
cuando la suma de unidades en pedidos aceptados del día
alcanza el límite. Evita sobrepedidos.
No hay contador editable: el consumo del día
se calcula desde order_lines.

La disponibilidad se controla manualmente con is_available.
No hay reactivación automática programada.
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
├── customer_user_id UUID NULL FK users.id
├── source VARCHAR(30) NOT NULL
├── fulfillment_type VARCHAR(30) NOT NULL
├── status VARCHAR(40) NOT NULL
├── payment_status VARCHAR(40) NOT NULL
├── customer_name_snapshot VARCHAR(180) NULL
├── customer_phone_snapshot VARCHAR(30) NULL
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

Reglas de identidad por canal:

```text
source = online:
customer_user_id NOT NULL.
El pedido lo crea el propio cliente con sesión iniciada.

source = counter, phone, whatsapp, social, manual:
customer_user_id NULL permitido.
created_by obligatorio a nivel de aplicación
(empleado que registró el pedido).
approved_by registra quién lo aprobó.

fulfillment_type = delivery o pickup:
customer_name_snapshot y customer_phone_snapshot
obligatorios (hay que entregar o avisar a alguien).

Venta a mostrador sin cliente:
los snapshots de nombre y teléfono pueden quedar vacíos.

No existe una serie de folios separada para mostrador:
order_number y public_code son una sola secuencia.
El canal se identifica por source y created_by,
no por el formato del folio.

Invariante global — no hay pedido sin usuario:
CHECK (customer_user_id IS NOT NULL OR created_by IS NOT NULL)
Todo pedido está ligado al cliente que lo creó
o al empleado que lo registró.
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

El ajuste del costo de envío no requiere confirmación del cliente:

```text
El cliente ve el costo final informado en el
estado / seguimiento de su pedido, con el desglose
de lo que se está cobrando por envío.

Si no está de acuerdo, se comunica con el negocio.

Cuando la dirección queda fuera de los polígonos definidos,
lo habitual es que el empleado contacte al cliente
antes de aprobar el pedido.

Las zonas por polígono existen precisamente para que
el ajuste manual sea la excepción, no la regla.
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

El seguimiento del pedido es exclusivo del usuario autenticado que lo hizo: no existe una página pública de rastreo por código. Los pedidos capturados sin usuario asociado se siguen por el canal donde se levantaron (teléfono, WhatsApp, mostrador).

La ubicación del repartidor es opcional en dos sentidos: el repartidor decide compartirla, y sólo puede existir si tiene una sesión activa con conexión.

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

## 19.5 Autoasignación del repartidor

Además de la asignación hecha por un empleado, el repartidor puede tomar envíos por sí mismo desde una cola de pedidos listos.

```text
Cocina marca el pedido como ready
↓
El pedido entra a la cola «listos para salir»
↓
Los usuarios con can_deliver = true
e is_delivery_available = true ven la cola
↓
El repartidor toma un envío
↓
Se crea delivery_assignments con
assigned_by = el propio repartidor
↓
El pedido sale de la cola para los demás
```

Reglas:

```text
La cola sólo muestra pedidos delivery en estado ready
sin asignación vigente.

Tomar un envío ocurre dentro de una transacción:
si dos repartidores lo intentan a la vez, gana el primero
y el segundo recibe aviso de que ya fue tomado.

Sigue existiendo un solo repartidor vigente por pedido:
UNIQUE(order_delivery_id) WHERE is_current = true.

Un empleado con permiso puede seguir asignando
o reasignando manualmente; la autoasignación
es un camino adicional, no un reemplazo.

La vista del repartidor muestra instrucciones de cobro
derivadas de payments:
«Cobrar $295 en efectivo · llevar cambio de $500»
o «Pagado · no cobrar».
```

---

## 19.6 Operación sin conexión del repartidor

Salir a repartir sin internet no debe ser una limitante operativa.

```text
El repartidor puede salir sin conexión.

La ubicación en tiempo real es opcional:
sólo existe mientras haya sesión de tracking
activa y con conexión.

Cualquier empleado con permiso puede marcar
el pedido como entregado en nombre del repartidor.

También es válido esperar a que el repartidor
recupere conexión y lo marque él mismo.

Los registros aceptan captura tardía:
la hora real de entrega puede asentarse
cuando vuelva la conexión.
```

---

## 19.7 Resumen diario del repartidor (derivado)

No hay corte de caja en el sistema. El repartidor y el administrador ven un resumen del día calculado desde los registros existentes:

```text
Entregas del día:
delivery_assignments completadas por el repartidor.

Efectivo cobrado en el día:
payments en efectivo marcados como pagados
en pedidos entregados por él.

Cobros por envío del día:
shipping_total_amount de sus entregas.
```

Todo es derivado: no existen tablas de caja, cortes, turnos ni saldos editables.

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

Sólo los pedidos con usuario asociado
acumulan o canjean créditos.
Una venta registrada sin cliente no genera créditos.
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

No puede existir un pedido sin usuario:
debe tener customer_user_id (cliente)
o created_by (empleado que lo registró).
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

---

# 29. Módulo de configuración visual del sitio (`storefront-composer`)

Esto debe agregarse al proyecto como un módulo de composición visual del sitio público. Permitirá que el administrador configure banners, heroes, secciones promocionales, categorías destacadas, productos recomendados, bloques de créditos, información de entrega, botones, imágenes, colores y estilos, sin editar código.

La regla principal debe ser:

```text
El administrador puede configurar contenido, orden,
imágenes, colores, variantes y estilos permitidos.

El administrador no puede escribir HTML, CSS o JavaScript libre.

Cada elemento visible se construye a partir de plantillas
predefinidas y validadas por el backend.
```

Esto evita que el sitio termine siendo un editor libre difícil de mantener, inseguro o inconsistente, pero permite mucha personalización visual.

---

# 30. Alcance del módulo

El módulo administrará la apariencia y composición del sitio público del negocio. (Tony-Tony aparece en los ejemplos sólo como primera implementación: el módulo es genérico para cualquier restaurante.)

Permitirá configurar:

* Hero principal.
* Banners promocionales.
* Avisos superiores.
* Secciones de productos destacados.
* Secciones de categorías destacadas.
* Productos canjeables con créditos.
* Promociones temporales.
* Información de envíos.
* Información de horarios.
* Botones de WhatsApp.
* Bloques de texto con imagen.
* Bloques de “cómo funciona”.
* Secciones de beneficios.
* Sección de créditos del cliente.
* Tarjetas de contacto.
* Preguntas frecuentes.
* Footer.
* Header y navegación.
* Colores globales.
* Tipografías autorizadas.
* Bordes, radios, botones y tarjetas.
* Orden de secciones.
* Visibilidad temporal de promociones.
* Imágenes para escritorio y móvil.
* Título del sitio y descripción (metadatos del head).
* Favicon.
* Imagen social por defecto (Open Graph).
* Previsualización antes de publicar.

El menú, el carrito y el checkout siguen siendo funciones reales del sistema; no deben convertirse en contenido libre.

```text
Catálogo real:
productos, precios, disponibilidad, créditos y categorías.

Contenido visual:
hero, banners, textos, llamadas a la acción,
orden de secciones, imágenes y estilos permitidos.
```

---

# 31. Regla de experiencia pública

Aunque existan heroes y banners, el sitio debe conservar la prioridad de venta.

El cliente debe poder encontrar productos rápidamente.

```text
Inicio público
├── Header con carrito visible
├── Hero compacto o promocional
├── Botón “Ver menú”
├── Productos o categorías visibles rápidamente
├── Secciones promocionales
└── Información adicional
```

No conviene permitir un hero gigantesco que esconda el menú en móvil.

La configuración debe respetar esta regla:

```text
El hero puede promocionar,
pero no debe bloquear ni reemplazar el acceso al menú.

El catálogo y carrito siempre deben ser accesibles.
```

Una implementación razonable para Tony-Tony sería:

```text
/
├── Hero compacto
├── Categorías principales
├── Menú dinámico
├── Productos destacados
├── Banner de créditos
├── Información de entrega
└── Footer
```

---

# 32. Separación entre `platform-core` y `restaurant-platform`

La infraestructura de páginas, revisiones, plantillas, archivos, publicación y previsualización podría ser útil para otros proyectos.

```text
platform-core
└── capacidades genéricas
    ├── archivos
    ├── auditoría
    ├── control de versiones
    ├── permisos
    ├── publicación de borradores
    └── validación de configuraciones

restaurant-platform
└── plantillas específicas de restaurante
    ├── hero de restaurante
    ├── menú dinámico
    ├── productos destacados
    ├── créditos
    ├── promociones
    ├── delivery
    ├── horarios
    └── banners de comida
```

No obstante, inicialmente puede implementarse dentro de `restaurant-platform` para no aumentar el alcance de `platform-core` demasiado pronto.

La arquitectura debe dejar claro que:

```text
Motor de composición visual:
potencialmente reutilizable.

Plantillas de comida, pedidos y catálogo:
restaurant-platform.
```

---

# 33. Principio de plantillas definidas

No debe existir una tabla donde el administrador pueda crear “una plantilla HTML nueva”.

Las plantillas deben estar registradas en código y publicadas por el backend como contratos configurables.

Ejemplo conceptual:

```text
storefront.hero.background
storefront.hero.split
storefront.banner.promo
storefront.banner.delivery
storefront.catalog.categories
storefront.catalog.featured_products
storefront.catalog.credit_products
storefront.content.image_text
storefront.content.info_cards
storefront.content.faq
storefront.content.testimonials
storefront.loyalty.credits
storefront.business.hours
storefront.business.contact
storefront.footer.default
```

Cada plantilla define:

```text
template_key
template_version
nombre visible
descripción
campos permitidos
tipos de datos
imágenes requeridas u opcionales
variantes visuales permitidas
opciones de color permitidas
límites de texto
configuración móvil
fuentes de datos dinámicos permitidas
```

El backend debe ser la fuente de verdad de estas definiciones.

```text
El frontend no inventa campos.

El administrador sólo ve opciones válidas
para la plantilla seleccionada.

La API rechaza configuraciones no válidas.
```

---

# 34. Catálogo inicial de plantillas

## 34.1 Heroes

### `storefront.hero.background`

Hero con imagen de fondo, texto superpuesto y botones.

Campos configurables:

```text
Etiqueta superior.
Título.
Texto destacado.
Descripción.
Botón principal.
Botón secundario.
Imagen de escritorio.
Imagen de móvil.
Color de overlay.
Intensidad de overlay.
Alineación del texto.
Altura del hero.
Color de texto.
Variante de botones.
```

Ejemplo:

```text
Etiqueta:
Tony-Tony

Título:
Sabor que te hace volver

Descripción:
Boneless, papas y extras preparados para tu antojo.

Botón principal:
Ver menú

Botón secundario:
Usar mis créditos
```

---

### `storefront.hero.split`

Hero dividido entre contenido e imagen.

```text
Columna izquierda:
Título, subtítulo, botones.

Columna derecha:
Imagen o collage de productos.
```

Opciones:

```text
Texto a la izquierda o derecha.
Imagen redonda, cuadrada o recortada.
Fondo sólido, degradado o neutro.
Estilo de tarjeta.
Alineación vertical.
Variante compacta o amplia.
```

Este tipo es recomendable para una página principal donde el menú debe aparecer poco después.

---

### `storefront.hero.minimal`

Hero reducido para promociones o campañas temporales.

```text
Título corto.
Subtítulo corto.
Un CTA principal.
Color de fondo.
Imagen opcional.
```

Útil para:

```text
Nueva salsa.
Promoción del fin de semana.
Envío gratis.
Horario especial.
Producto nuevo.
```

---

### Rotación de heros en portada

La portada admite varios heros a la vez. Desde el inicio deben ofrecerse varias plantillas de hero para seleccionar y editar, no una sola.

```text
1 hero activo:
Se muestra fijo.

2 o más heros activos:
La portada los rota automáticamente en carrusel.
```

Reglas:

```text
Cada hero usa una de las plantillas definidas
(imagen a la derecha / split, imagen de fondo,
centrado / minimal); el administrador selecciona
la plantilla y sólo edita textos, imagen
y colores permitidos.

Los heros se ordenan arrastrando (sort_order).

Estados por hero:
activo, inactivo, o programado por rango de fechas
(visible_from / visible_until).

No hay recurrencia por día de la semana.
```

---

# 35. Banners promocionales

## 35.1 `storefront.banner.promo`

Banner horizontal configurable.

Campos:

```text
Título.
Descripción.
Imagen.
Imagen móvil.
Etiqueta.
Botón.
Color de fondo.
Color de texto.
Color de botón.
Fecha de inicio.
Fecha de fin.
Prioridad visual.
```

Ejemplo:

```text
Título:
Envío gratis desde $350

Descripción:
Haz crecer tu pedido y recibe envío gratis.

Botón:
Ver menú
```

---

## 35.2 `storefront.banner.credits`

Banner dedicado a créditos.

Campos:

```text
Título.
Descripción.
Imagen o ícono.
Texto de créditos.
Botón “Ver productos canjeables”.
Color principal.
Color de acento.
```

Ejemplo:

```text
Título:
Compra, acumula y disfruta

Descripción:
Algunos productos te dan créditos.
Úsalos después para canjear productos seleccionados.
```

La información numérica del usuario debe ser dinámica.

```text
Cliente sin sesión:
“Regístrate para acumular créditos.”

Cliente con sesión:
“Tienes 12 créditos disponibles.”
```

---

## 35.3 `storefront.banner.delivery`

Banner de cobertura o entrega.

Campos:

```text
Título.
Texto.
Ícono o imagen.
Botón “Verificar mi zona”.
Color.
Estilo.
```

Ejemplo:

```text
¿Llegamos hasta tu zona?

Comparte tu ubicación al pedir y calcularemos
el costo de envío automáticamente.
```

---

## 35.4 Barra superior de envío gratis

La barra fija sobre el header del sitio público informa el umbral de envío gratis. Es un dato de configuración ya definido, no contenido editable.

```text
Fuente del dato:
business_settings.free_shipping_global_from_amount

Texto mostrado (derivado):
«Envío gratis desde $350 · Servicio a domicilio»
```

Reglas:

```text
No es un texto rodante configurable por el administrador.

El administrador sólo decide si la barra se muestra.

Si el umbral cambia en la configuración,
la barra se actualiza sola.

Si no hay umbral configurado,
la barra no muestra la parte de envío gratis.
```

El carrito reutiliza el mismo dato para mostrar el progreso hacia el envío gratis («Te faltan $85 para envío gratis»).

---

# 36. Secciones dinámicas basadas en catálogo

Estas secciones no deben duplicar productos manualmente. Deben leer los productos reales del catálogo.

## 36.1 `storefront.catalog.categories`

Muestra categorías del menú.

Configuración:

```text
Cantidad máxima.
Diseño de tarjetas.
Imagen por categoría.
Mostrar descripción.
Mostrar cantidad de productos.
Mostrar sólo categorías activas.
Orden del catálogo o orden manual de selección.
```

La regla general debe ser:

```text
Por defecto:
respeta product_categories.sort_order.

Opcionalmente:
permite destacar categorías específicas.
```

---

## 36.2 `storefront.catalog.featured_products`

Muestra productos destacados.

Configuración:

```text
Fuente de productos:
- productos con is_featured = true
- categoría específica
- selección manual de productos
- productos más recientes
- productos disponibles actualmente

Cantidad máxima.
Diseño de tarjetas.
Mostrar créditos otorgados.
Mostrar precio en créditos si aplica.
Mostrar descripción corta.
Mostrar botón “Agregar”.
```

Ejemplo:

```text
Título:
Los favoritos de Tony-Tony

Fuente:
Productos destacados

Máximo:
4 productos
```

---

## 36.3 `storefront.catalog.credit_products`

Sección para productos canjeables.

Configuración:

```text
Título.
Descripción.
Máximo de productos.
Mostrar sólo credit_redemption_price IS NOT NULL.
Mostrar créditos necesarios.
Mostrar créditos otorgados al comprar.
Mostrar botón de canje.
```

Ejemplo:

```text
Título:
Canjea tus créditos

Descripción:
Usa tus créditos en productos seleccionados.
```

Esta sección debe usar datos reales de `products`.

```text
products.credit_redemption_price
products.credits_awarded_per_unit
products.is_available
products.is_active
```

Nunca debe guardar el precio en créditos como texto manual dentro del banner.

---

# 37. Secciones de contenido

## 37.1 `storefront.content.image_text`

Bloque de imagen y texto.

Campos:

```text
Título.
Texto.
Imagen.
Imagen móvil.
Botón opcional.
Posición de imagen.
Fondo.
Alineación.
Estilo de tarjeta.
```

Usos:

```text
Nuestra historia.
Nuevo producto.
Salsas especiales.
Proceso de entrega.
Información de créditos.
```

---

## 37.2 `storefront.content.info_cards`

Tarjetas informativas.

Configuración:

```text
Título general.
Descripción general.
Tarjetas.
Ícono por tarjeta.
Título.
Descripción.
Color.
Estilo.
```

Ejemplos:

```text
Pide fácil.
Elige tus favoritos.

Seguimiento claro.
Consulta el estado de tu pedido.

Créditos.
Compra y canjea productos seleccionados.
```

---

## 37.3 `storefront.content.faq`

Preguntas frecuentes.

Campos:

```text
Título.
Descripción opcional.
Preguntas.
Respuestas.
Orden.
Estilo visual.
```

Preguntas posibles:

```text
¿En qué zonas entregan?
¿Cómo funcionan los créditos?
¿Puedo pagar con transferencia?
¿Puedo pedir sin ubicación exacta?
¿Cuándo se confirma mi pedido?
```

---

## 37.4 `storefront.business.hours`

Bloque dinámico de horarios.

No debe duplicar horarios en contenido manual.

Debe leer de:

```text
business_weekly_hours
business_special_dates
business_special_date_slots
```

Configuración visual:

```text
Título.
Texto de negocio abierto o cerrado.
Estilo.
Ícono.
Mostrar horario de hoy.
Mostrar horario semanal.
Mostrar días especiales.
```

---

## 37.5 `storefront.business.contact`

Bloque de contacto.

Debe leer teléfonos públicos desde:

```text
business_phones
```

Configuración:

```text
Mostrar teléfono principal.
Mostrar WhatsApp.
Mostrar correo.
Mostrar dirección.
Mostrar botón de mapa.
Mostrar redes sociales, si se agregan.
```

---

# 38. Header, navegación y footer

El header y footer deben ser configurables, pero mediante plantillas fijas.

## 38.1 Header

Plantillas sugeridas:

```text
storefront.header.default
storefront.header.compact
storefront.header.transparent
```

Configuración:

```text
Logo.
Nombre comercial.
Eslogan opcional.
Color de fondo.
Color de texto.
Estilo de navegación.
Botón de iniciar sesión.
Botón de carrito.
Botón de WhatsApp.
Sticky header.
Mostrar estado abierto/cerrado.
```

Regla importante:

```text
El carrito debe estar visible o disponible
desde cualquier pantalla pública.

El acceso al menú debe permanecer claro.

El header no puede ocultar funciones esenciales
como carrito, sesión o seguimiento.
```

---

## 38.2 Footer

Plantillas sugeridas:

```text
storefront.footer.default
storefront.footer.compact
```

Configuración:

```text
Logo.
Texto de marca.
Teléfonos.
WhatsApp.
Correo.
Dirección.
Horarios.
Enlaces internos.
Redes sociales.
Aviso de privacidad.
Texto de derechos.
```

---

# 39. Configuración global de tema

La personalización visual no debe hacerse con CSS libre.

Debe basarse en tokens controlados.

## `storefront_theme_revisions`

```text
storefront_theme_revisions
├── id UUID PK
├── version_number INTEGER NOT NULL
├── status VARCHAR(30) NOT NULL
├── theme_name VARCHAR(120) NOT NULL
├── tokens_json JSONB NOT NULL
├── created_by UUID NULL FK users.id
├── published_by UUID NULL FK users.id
├── published_at TIMESTAMPTZ NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Estados:

```text
draft
published
archived
```

Ejemplo de `tokens_json`:

```json
{
  "colors": {
    "brand_primary": "#F97316",
    "brand_secondary": "#7C2D12",
    "accent": "#FACC15",
    "surface": "#FFFFFF",
    "surface_muted": "#FFF7ED",
    "text_primary": "#1F2937",
    "text_inverse": "#FFFFFF",
    "success": "#16A34A"
  },
  "typography": {
    "font_family_key": "modern_sans",
    "heading_weight": "700",
    "body_weight": "400"
  },
  "shape": {
    "button_radius": "rounded",
    "card_radius": "large",
    "image_radius": "large"
  },
  "effects": {
    "card_shadow": "soft",
    "button_style": "solid",
    "page_background_style": "flat"
  }
}
```

El administrador puede elegir:

```text
Paleta de colores.
Color principal.
Color secundario.
Color de acento.
Fondos.
Color de texto.
Variantes de botones.
Radio de botones.
Radio de tarjetas.
Sombras.
Estilo de tarjetas.
Tipografía dentro de una lista autorizada.
```

No debe poder pegar:

```text
CSS personalizado.
JavaScript.
Código HTML.
Fuentes externas arbitrarias.
URLs peligrosas.
```

---

# 40. Configuración por sección

Cada hero, banner o sección puede tener una configuración propia, pero limitada por su plantilla.

Ejemplo de configuración de hero:

```json
{
  "content": {
    "eyebrow": "Tony-Tony",
    "title": "Sabor que te hace volver",
    "description": "Boneless, papas y extras para pedir desde donde estés.",
    "primary_cta": {
      "label": "Ver menú",
      "link_type": "anchor",
      "target": "menu"
    },
    "secondary_cta": {
      "label": "Usar mis créditos",
      "link_type": "internal_route",
      "target": "/credits"
    }
  },
  "style": {
    "variant": "background_overlay",
    "content_alignment": "left",
    "height": "compact",
    "overlay_strength": "medium",
    "color_scheme": "brand_inverse",
    "button_variant": "solid"
  },
  "behavior": {
    "show_on_mobile": true,
    "show_on_desktop": true
  }
}
```

El backend debe validar:

```text
Que title no exceda el límite.

Que el link_type sea válido.

Que target corresponda al tipo de enlace.

Que el color o variante exista.

Que los estilos sean compatibles con la plantilla.

Que los archivos de imagen sean válidos.

Que no existan claves desconocidas.
```

---

# 41. Páginas y revisiones

El sitio público debe usar revisiones para que los cambios no aparezcan automáticamente en producción.

## `storefront_pages`

Representa una página lógica estable.

```text
storefront_pages
├── id UUID PK
├── page_key VARCHAR(80) UNIQUE NOT NULL
├── slug VARCHAR(180) UNIQUE NOT NULL
├── page_type VARCHAR(40) NOT NULL
├── is_system_page BOOLEAN NOT NULL DEFAULT false
├── is_active BOOLEAN NOT NULL DEFAULT true
├── published_revision_id UUID NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos:

```text
page_key: home
slug: /
page_type: storefront_home
is_system_page: true
```

```text
page_key: menu
slug: /menu
page_type: catalog
is_system_page: true
```

```text
page_key: credits
slug: /credits
page_type: loyalty
is_system_page: true
```

```text
page_key: about
slug: /nosotros
page_type: content
is_system_page: false
```

Las páginas del sistema no deben poder eliminarse desde administración.

```text
/
 /menu
 /cart
 /checkout
 /orders
 /account
```

El administrador puede configurar su apariencia pública, pero no eliminar su lógica.

---

## `storefront_page_revisions`

Cada página debe tener borradores y versiones publicadas.

```text
storefront_page_revisions
├── id UUID PK
├── page_id UUID NOT NULL FK storefront_pages.id
├── revision_number INTEGER NOT NULL
├── status VARCHAR(30) NOT NULL
├── page_title VARCHAR(180) NULL
├── meta_description VARCHAR(300) NULL
├── og_image_file_id UUID NULL FK stored_files.id
├── created_by UUID NULL FK users.id
├── published_by UUID NULL FK users.id
├── published_at TIMESTAMPTZ NULL
├── scheduled_publish_at TIMESTAMPTZ NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Estados:

```text
draft
scheduled
published
archived
```

Esto permite:

```text
Editar una campaña sin afectar el sitio visible.

Previsualizar el borrador.

Publicar manualmente.

Programar una promoción.

Volver a una versión publicada anterior.
```

---

# 42. Secciones configurables de cada página

## `storefront_page_sections`

Esta es la tabla principal de composición visual.

```text
storefront_page_sections
├── id UUID PK
├── page_revision_id UUID NOT NULL FK storefront_page_revisions.id
├── template_key VARCHAR(120) NOT NULL
├── template_version INTEGER NOT NULL
├── section_name VARCHAR(180) NULL
├── sort_order INTEGER NOT NULL DEFAULT 0
├── is_visible BOOLEAN NOT NULL DEFAULT true
├── visible_from TIMESTAMPTZ NULL
├── visible_until TIMESTAMPTZ NULL
├── content_config JSONB NOT NULL DEFAULT '{}'
├── style_config JSONB NOT NULL DEFAULT '{}'
├── data_binding_config JSONB NOT NULL DEFAULT '{}'
├── behavior_config JSONB NOT NULL DEFAULT '{}'
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Separar configuraciones ayuda a mantener orden.

```text
content_config:
Textos, títulos, etiquetas, CTA.

style_config:
Variante, colores, tamaño, alineación,
radios, fondo y estilos permitidos.

data_binding_config:
Productos destacados, categorías,
horarios, teléfonos o créditos.

behavior_config:
Visibilidad móvil, carrusel,
fecha de inicio y fin, etc.
```

Ejemplo de una sección de productos destacados:

```json
{
  "content_config": {
    "title": "Los favoritos de Tony-Tony",
    "description": "Lo más pedido por nuestros clientes"
  },
  "style_config": {
    "layout": "horizontal_cards",
    "color_scheme": "surface",
    "show_product_description": true,
    "show_credits": true
  },
  "data_binding_config": {
    "source": "featured_products",
    "max_items": 4
  },
  "behavior_config": {
    "show_on_mobile": true,
    "show_on_desktop": true
  }
}
```

---

# 43. Imágenes y archivos por sección

Aunque podría guardarse el `file_id` dentro de JSON, es mejor tener una relación explícita para imágenes, porque permite validar roles, tamaños, accesos y reemplazos.

## `storefront_section_media`

```text
storefront_section_media
├── id UUID PK
├── section_id UUID NOT NULL FK storefront_page_sections.id
├── slot_key VARCHAR(80) NOT NULL
├── desktop_file_id UUID NULL FK stored_files.id
├── mobile_file_id UUID NULL FK stored_files.id
├── alt_text VARCHAR(255) NULL
├── focal_point_x NUMERIC(5,2) NULL
├── focal_point_y NUMERIC(5,2) NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Ejemplos de `slot_key`:

```text
hero_background
hero_image
promo_image
card_image
mobile_banner
og_image
```

Esto permite que un hero use una imagen amplia para escritorio y otra recortada para móvil.

```text
Hero escritorio:
Imagen horizontal 1920 × 800.

Hero móvil:
Imagen vertical 1080 × 1350.
```

Los puntos focales sirven para que el administrador indique qué parte de la imagen debe conservarse al recortar.

---

# 44. Header y footer configurables

## `storefront_layout_revisions`

El header y footer también deben tener borrador y publicación.

```text
storefront_layout_revisions
├── id UUID PK
├── version_number INTEGER NOT NULL
├── status VARCHAR(30) NOT NULL
├── header_template_key VARCHAR(120) NOT NULL
├── header_config JSONB NOT NULL DEFAULT '{}'
├── footer_template_key VARCHAR(120) NOT NULL
├── footer_config JSONB NOT NULL DEFAULT '{}'
├── created_by UUID NULL FK users.id
├── published_by UUID NULL FK users.id
├── published_at TIMESTAMPTZ NULL
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Configuración de header:

```text
Logo.
Nombre.
Color de fondo.
Color de texto.
Sticky header.
Botón de WhatsApp.
Estado abierto/cerrado.
Mostrar inicio de sesión.
Mostrar carrito.
Estilo de navegación.
```

Configuración de footer:

```text
Logo.
Descripción.
Teléfonos.
Correo.
Horario.
Dirección.
Enlaces.
Redes.
Aviso de privacidad.
Texto legal.
```

---

# 45. Configuración global activa

## `storefront_settings`

Tabla de un solo registro para seleccionar qué tema y layout están publicados.

```text
storefront_settings
├── id SMALLINT PK CHECK (id = 1)
├── active_theme_revision_id UUID NULL FK storefront_theme_revisions.id
├── active_layout_revision_id UUID NULL FK storefront_layout_revisions.id
├── storefront_enabled BOOLEAN NOT NULL DEFAULT true
├── maintenance_message TEXT NULL
├── site_title VARCHAR(120) NULL
├── site_description VARCHAR(300) NULL
├── favicon_file_id UUID NULL FK stored_files.id
├── social_image_file_id UUID NULL FK stored_files.id
├── created_at TIMESTAMPTZ NOT NULL
└── updated_at TIMESTAMPTZ NOT NULL
```

Esto permite que el sitio público cargue sólo configuraciones publicadas.

```text
Tema activo.
Layout activo.
Página publicada.
Secciones publicadas.
Catálogo real actual.
Metadatos globales del sitio.
```

## 45.1 Metadatos del sitio (head de la página)

El administrador configura los metadatos que se muestran en el `<head>` del HTML, sin escribir código:

```text
site_title:
Título del sitio (pestaña del navegador y buscadores).
Si no se configura, se usa business_profile.trade_name.

site_description:
Descripción mostrada en buscadores y previews.

favicon_file_id:
Ícono del sitio (favicon).
Formatos permitidos: ICO, PNG, SVG.
Tamaño y dimensiones validados por el backend.

social_image_file_id:
Imagen por defecto al compartir en redes (Open Graph).
```

Cadena de resolución por página:

```text
Título:
storefront_page_revisions.page_title
↓ (si no hay)
site_title
↓ (si no hay)
business_profile.trade_name

Descripción:
storefront_page_revisions.meta_description
↓ site_description

Imagen social:
storefront_page_revisions.og_image_file_id
↓ social_image_file_id
```

---

# 46. Flujo de edición y previsualización

El flujo del administrador debe ser similar a un constructor visual controlado.

```text
Administrador abre “Diseño del sitio”
↓
Selecciona una página
↓
Se crea o abre un borrador
↓
Agrega, elimina o reordena secciones
↓
Edita contenido, imágenes y estilos
↓
Guarda automáticamente el borrador
↓
Previsualiza en escritorio, tableta y móvil
↓
Corrige errores
↓
Publica o programa publicación
```

La pantalla ideal tendría tres zonas:

```text
Izquierda:
Biblioteca de plantillas disponibles.

Centro:
Canvas o vista de página.

Derecha:
Panel de configuración de la sección seleccionada.
```

Ejemplo:

```text
Biblioteca
├── Hero
├── Banner
├── Productos
├── Categorías
├── Créditos
├── Entrega
├── Información
├── FAQ
└── Footer

Canvas
├── Hero principal
├── Categorías
├── Productos destacados
├── Banner de créditos
└── Información de entrega

Inspector
├── Contenido
├── Estilo
├── Imagen
├── Botones
├── Visibilidad
└── Programación
```

---

# 47. Previsualización segura

El borrador no debe ser visible para cualquier visitante público.

La previsualización debe funcionar mediante una ruta privada o firmada.

```text
/admin/storefront/preview?page_revision_id=...
```

O mediante un enlace temporal firmado:

```text
/preview/token-seguro-temporal
```

Reglas:

```text
Sólo administradores autorizados pueden generar preview.

El preview puede mostrar borradores.

El sitio público sólo carga revisiones publicadas.

Los enlaces de preview deben expirar.

El preview no debe indexarse por buscadores.

El preview no debe modificar catálogo, pedidos,
pagos ni datos reales.
```

La previsualización debe permitir cambiar dispositivo:

```text
Desktop.
Tablet.
Mobile.
```

Y mostrar advertencias de diseño:

```text
Texto demasiado largo.
Imagen móvil faltante.
Contraste insuficiente.
CTA sin enlace.
Banner visible sin fecha de fin.
Producto vinculado inactivo.
Sección sin contenido obligatorio.
```

---

# 48. Publicación y rollback

Publicar debe ser una acción explícita.

```text
Borrador
↓
Validación
↓
Publicación
↓
Sitio público actualizado
```

Antes de publicar, el backend debe validar:

```text
La plantilla existe.

La versión de plantilla es compatible.

Todos los campos requeridos existen.

Las imágenes referidas están disponibles.

No existen enlaces inseguros.

No hay colores imposibles de leer.

Las secciones dinámicas tienen una fuente válida.

El orden de las secciones es válido.

No hay dos secciones con posición duplicada.

No hay una promoción vencida configurada como visible.
```

Al publicar:

```text
La revisión anterior se archiva.

La nueva revisión se marca como publicada.

storefront_pages.published_revision_id se actualiza.

Se invalida caché de la página pública.

Se registra auditoría del cambio.
```

Rollback:

```text
Administrador abre historial.
↓
Selecciona versión anterior.
↓
Previsualiza.
↓
Publica nuevamente esa versión.
```

No se deben sobrescribir las versiones anteriores.

---

# 49. Orden de secciones

El administrador debe poder reorganizar las secciones de una página mediante arrastrar y soltar.

```text
Hero
↓
Categorías
↓
Productos destacados
↓
Banner de créditos
↓
Información de entrega
↓
FAQ
```

La posición se guarda en:

```text
storefront_page_sections.sort_order
```

Regla:

```text
El orden de secciones afecta la vista pública.

No afecta productos, pedidos, tickets,
precios, créditos ni reportes.
```

Se recomienda usar posiciones separadas:

```text
10
20
30
40
```

Cuando el administrador cambie el orden, el backend recibe la lista completa de secciones y actualiza todo dentro de una transacción.

---

# 50. Configuración de enlaces y CTA

Los botones no deben aceptar HTML ni enlaces peligrosos.

Los CTA deben usar tipos de enlace controlados.

```text
internal_route
anchor
product
category
credits_page
menu_page
whatsapp
phone
external_https
```

Ejemplos:

```json
{
  "label": "Ver menú",
  "link_type": "anchor",
  "target": "menu"
}
```

```json
{
  "label": "Usar mis créditos",
  "link_type": "credits_page"
}
```

```json
{
  "label": "Pedir por WhatsApp",
  "link_type": "whatsapp",
  "phone_source": "primary_business_whatsapp"
}
```

El backend debe bloquear:

```text
javascript:
data:
iframe:
HTML embebido
URLs no permitidas
```

---

# 51. Datos dinámicos contra contenido manual

Debe existir una distinción clara.

## Contenido manual

```text
Título de campaña.
Texto promocional.
Descripción.
Botón.
Imagen.
Color.
Estilo.
```

## Datos dinámicos

```text
Productos disponibles.
Precios actuales.
Créditos otorgados.
Costo de canje.
Categorías.
Horarios.
Teléfonos.
Estado abierto/cerrado.
Saldo de créditos del cliente.
```

Ejemplo correcto:

```text
Banner:
“Canjea tus créditos por productos seleccionados.”

Sección dinámica:
Lee products.credit_redemption_price.
```

Ejemplo incorrecto:

```text
Banner manual:
“Papas a la francesa por 5 créditos.”

Problema:
Si el precio cambia a 6 créditos,
el banner queda desactualizado.
```

Cuando se quiera mostrar información de producto o crédito, debe vincularse a la entidad real.

---

# 52. Permisos del módulo storefront

Permisos sugeridos:

```text
storefront:read_draft
storefront:edit
storefront:manage_media
storefront:manage_theme
storefront:preview
storefront:publish
storefront:rollback
storefront:manage_navigation
```

Roles prácticos:

| Rol                   | Alcance                                            |
| --------------------- | -------------------------------------------------- |
| Empleado              | No modifica diseño público.                        |
| Editor de contenido   | Puede editar borradores, textos e imágenes.        |
| Administrador         | Puede cambiar tema, publicar y revertir versiones. |
| Administrador técnico | Puede registrar o actualizar plantillas de código. |

La edición del diseño no debe otorgar automáticamente permisos para modificar:

```text
Productos.
Precios.
Pagos.
Pedidos.
Créditos.
Gastos.
Usuarios.
```

---

# 53. Seguridad y consistencia

Reglas críticas:

```text
No HTML libre.

No CSS libre.

No JavaScript libre.

No archivos sin validar.

No URLs peligrosas.

No publicación directa sin validación.

No borradores visibles al público.

No modificación de plantillas desde interfaz administrativa.

No eliminación física de imágenes usadas por contenido publicado.

No modificación de precios mediante banners o secciones visuales.
```

Los archivos deben validarse por:

```text
Tipo MIME.
Tamaño máximo.
Extensión.
Hash.
Permisos.
Relación con una entidad válida.
```

Las imágenes pueden tener límites iniciales, por ejemplo:

```text
JPG, PNG, WEBP.
Tamaño máximo configurable.
Resolución mínima para hero.
Recorte automático optimizado.
Versión móvil opcional.
```

---

# 54. Tablas resumidas del módulo

```text
storefront_settings
└── Registro único con tema y layout activos,
   más metadatos globales del sitio
   (título, descripción, favicon, imagen social).

storefront_theme_revisions
└── Paleta, tipografías, botones, bordes, tarjetas y estilos globales.

storefront_layout_revisions
└── Configuración versionada de header y footer.

storefront_pages
└── Página lógica estable: inicio, menú, créditos, nosotros.

storefront_page_revisions
└── Borradores, publicadas, programadas y archivadas.

storefront_page_sections
└── Instancias de heroes, banners, productos, FAQ y demás bloques.

storefront_section_media
└── Imágenes desktop/móvil, alt text y punto focal.

stored_files
└── Archivos binarios reutilizados por logo, productos, banners,
   comprobantes, tickets y evidencias.
```

---

# 55. Relación con el resto del proyecto

```text
business_profile
└── Logo, nombre, eslogan.

business_phones
└── Teléfonos y WhatsApp visibles.

business_weekly_hours
business_special_dates
└── Horarios dinámicos.

product_categories
products
modifier_groups
modifier_options
└── Catálogo real.

orders
payments
order_shipping
└── Operación real, no editable por banners.

credit_ledger_entries
credit_redemptions
└── Créditos reales del usuario.

storefront_*
└── Composición visual y promoción del sitio público.
```

La configuración visual no debe cambiar la lógica comercial.

```text
El banner puede promocionar un producto.

El banner no puede modificar su precio.

La sección puede mostrar créditos.

La sección no puede aumentar créditos.

El hero puede enlazar al carrito.

El hero no puede crear pedidos sin validación.
```

---

# 56. Fases de implementación del módulo storefront

## Fase 1: configuración visual esencial

```text
Tema global.
Logo.
Header.
Footer.
Hero.
Banners.
Secciones de categorías.
Productos destacados.
Sección de menú dinámico.
Orden de secciones.
Imágenes desktop y móvil.
Borrador.
Preview.
Publicación manual.
```

Tablas prioritarias:

```text
storefront_settings
storefront_theme_revisions
storefront_layout_revisions
storefront_pages
storefront_page_revisions
storefront_page_sections
storefront_section_media
```

Plantillas iniciales:

```text
storefront.hero.split
storefront.hero.background
storefront.banner.promo
storefront.catalog.categories
storefront.catalog.featured_products
storefront.catalog.credit_products
storefront.banner.delivery
storefront.business.hours
storefront.business.contact
storefront.footer.default
```

---

## Fase 2: mejoras editoriales

```text
Programación de campañas.
Preview mediante enlace temporal.
Rollback visual.
FAQ.
Tarjetas informativas.
Bloques de imagen y texto.
Campañas por fechas.
Promociones de temporada.
SEO por página.
Open Graph personalizado.
```

---

## Fase 3: funciones avanzadas

```text
A/B testing de hero.
Banners segmentados por cliente.
Contenido diferente según créditos.
Campañas por zona de reparto.
Analytics de clics por sección.
Métricas de conversión por banner.
Recomendaciones dinámicas.
```

Estas funciones no deben formar parte de la primera versión.

---

# 57. Resultado esperado del módulo storefront

El administrador tendrá un editor visual controlado donde podrá modificar el sitio sin depender de código para cada campaña.

```text
Cambiar hero.
Cambiar colores.
Cambiar imágenes.
Mover banners.
Publicar promociones.
Destacar productos.
Mostrar créditos.
Modificar estilo de botones.
Reordenar bloques.
Previsualizar desktop y móvil.
Publicar o revertir cambios.
```

Pero el sitio seguirá siendo consistente y seguro porque:

```text
Las plantillas están definidas por el sistema.

Los estilos se limitan a opciones permitidas.

El backend valida toda configuración.

El catálogo y pedidos siguen siendo fuentes reales de datos.

Las promociones no alteran precios históricos.

Los borradores no afectan el sitio público.

Las versiones publicadas pueden restaurarse.
```

---

# 58. Fidelidad al diseño visual (prototipo «Tony-Tony Etapa 1»)

El prototipo visual de Etapa 1 (sitio público móvil y escritorio, detalle de producto, carrito, checkout, seguimiento, perfil con créditos, panel de empleado, punto de venta, panel de administrador, catálogo, apariencia, editor del sitio, vistas de repartidor móvil/web y ticket de 58 mm) se contrastó pantalla por pantalla contra este reporte. Las decisiones resultantes ya quedaron integradas en las secciones correspondientes; aquí se consolidan como registro.

## 58.1 Decisiones tomadas

| Tema surgido del diseño | Decisión | Sección |
| --- | --- | --- |
| Checkout como invitado | No aplica. Un pedido web sólo se finaliza con usuario registrado. | 1.2 |
| Cliente en ventas capturadas por personal | El cliente es opcional (`customer_user_id NULL`); siempre quedan `created_by` y `approved_by`. Usuario = cliente; no hay tabla de clientes. | 1.2, 14.1 |
| Corte de caja | No aplica para este proyecto. Sólo resúmenes derivados: del negocio y del día del repartidor. | 19.7, 24 |
| Folio separado para mostrador («TT-M-…») | No aplica. Una sola secuencia de folios; el canal se identifica por `source` y `created_by`. | 14.1 |
| Programación de contenido por día de la semana | No aplica. Sólo estados activo/inactivo y rango de fechas. | 34.1 |
| Varios heros con rotación | Sí aplica. Varias plantillas de hero seleccionables y editables; con 2 o más activos, carrusel automático. | 34.1 |
| Barra de anuncio | Sólo para el envío gratis: dato fijo derivado de la configuración, no texto rodante editable. | 35.4 |
| Autoasignación del repartidor | Sí aplica: cola de pedidos listos, «tomar envío», disponibilidad del repartidor. | 19.5, 8.4 |
| Descripción pública del repartidor | Sí aplica (`courier_public_note` en `staff_profiles`). | 8.4 |
| Confirmación del cliente ante ajuste de envío | No aplica. El cliente ve el costo final informado en el seguimiento; si no está de acuerdo, se comunica. El empleado contacta cuando la dirección quede fuera de los polígonos. | 17.2 |
| Reactivación automática de disponibilidad | No aplica. Desactivación manual + límites de venta por producto (`max_units_per_order`, `daily_unit_limit`). | 11.2 |
| Rastreo público de pedido por código | No aplica. Seguimiento sólo para el usuario autenticado dueño del pedido. | 19.2 |
| Repartidor sin internet | No debe ser limitante: otro empleado puede marcar entregado, o se espera la reconexión. | 19.6 |

## 58.2 Estados públicos del pedido (mapeo)

El cliente ve una línea de tiempo simple. Los estados internos granulares se agrupan en etiquetas públicas; los pasos de verificación interna no se le exponen como estados, aunque el seguimiento sí informa el costo de envío final y el método de pago.

| Estado interno | Etiqueta pública |
| --- | --- |
| `draft`, `submitted`, `pending_shipping_review`, `pending_payment_verification`, `pending_approval` | Pedido recibido |
| `approved` | Confirmado |
| `preparing` | En preparación |
| `ready` | Listo |
| `out_for_delivery` | En camino |
| `completed` | Entregado |
| `cancelled` | Cancelado |

## 58.3 Funciones confirmadas por el diseño (derivadas, sin cambios de modelo)

```text
Barra de progreso hacia envío gratis en el carrito,
derivada de free_shipping_global_from_amount
o de la tarifa de la zona.

«Repetir pedido» desde el historial del cliente:
clona las líneas de un pedido anterior a un carrito nuevo
con precios y disponibilidad ACTUALES.
Nunca reutiliza precios históricos.

Tarjeta de créditos del perfil
(disponibles / ganados / canjeados):
tres agregaciones del credit_ledger_entries.

«Más vendidos» incluyendo salsas y extras elegidos:
agregación sobre order_lines y order_line_modifiers.

Instrucciones de cobro para el repartidor
derivadas de payments:
cobrar y cambio a llevar, o pagado / no cobrar.

Duplicar producto en el catálogo administrativo.

Estado abierto / cerrado en el header del sitio,
derivado de horarios semanales y fechas especiales.

Toggle «Aceptando pedidos»
(business_profile.is_accepting_orders),
visible también para el personal.

El catálogo se publica al instante (sin revisiones);
el flujo borrador → publicar aplica sólo
al contenido visual del storefront.
```

## 58.4 Presets de paleta del tema

En lugar de exponer los tokens uno por uno, el selector de apariencia ofrece paletas predefinidas en código más la elección del color de acento. La selección se guarda como tokens en `storefront_theme_revisions.tokens_json`. Los colores configurables por sección referencian tokens del tema, nunca valores hexadecimales libres.

Regla importante: **no existe ningún preset de marca**. Los presets integrados son genéricos y neutros (por ejemplo: «Cálido», «Oscuro», «Fresco», «Terroso»), pensados para cualquier restaurante. Cada negocio construye su identidad configurando paleta, acento, tipografía autorizada, logo, favicon y metadatos — nunca editando código.

## 58.5 Dirección visual de referencia (ejemplo de configuración)

El prototipo de la primera implementación demuestra el nivel de identidad visual que las plantillas del storefront deben poder reproducir sólo con configuración:

```text
Paleta: rojo #C1272D · negro #1C1512 · cremas #F6EEDD / #FBF5E9.

Tipografía display para títulos y marca
(estilo Alfa Slab One) + sans para texto (estilo Archivo).

Botones y chips redondeados (pill), tarjetas con
radios amplios y bordes suaves.

Fotos de producto en PNG con fondo transparente
sobre fondos crema.

Paneles internos con barra lateral oscura
y acento en la sección activa.

Ticket de 58 mm monoespaciado con separadores punteados.
```

Estos valores NO se incluyen como preset del sistema: son la configuración que la primera implementación cargará sobre los presets neutros y los campos del tema. La vara de calidad es que cualquier restaurante alcance un resultado igual de propio usando únicamente el editor.
