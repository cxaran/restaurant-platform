
Lleva restaurant-platform a un estado de Release Candidate integrado.

Esta es una sola meta amplia, pero debes resolverla mediante etapas internas
en orden. No te detengas al terminar una etapa si la siguiente pertenece a
este alcance. No inicies trabajo fuera de este documento.

La meta final sólo se cumple cuando:

- todas las decisiones funcionales de este prompt están implementadas;
- las migraciones nuevas y previas se ejecutan exitosamente en un entorno
  aislado de prueba;
- backend, frontend y contratos están alineados;
- todas las pruebas canónicas relevantes pasan;
- existe E2E real con stack completo y navegador;
- se prueban roles distintos;
- se prueban móvil, tablet y desktop;
- se compara visualmente la implementación con el diseño aprobado;
- se corrigen los problemas P0 y P1 encontrados;
- se generan reportes Markdown de decisiones, pruebas y hallazgos;
- el repositorio queda con commits lógicos y sin cambios no versionados,
  excepto artefactos explícitamente ignorados.

────────────────────────────────────────────────────────────────────
1. FUENTES DE VERDAD Y REGLAS DE GOBIERNO
────────────────────────────────────────────────────────────────────

Lee primero, antes de editar:

- CLAUDE.md
- GOALS.md
- AUDITORIA_BACKEND.md
- docs/frontend-reuse-and-storefront-plan.md
- package.json raíz y package.json frontend/backend
- scripts canónicos de pruebas, build, lint, typecheck y E2E
- OpenAPI generado y mecanismo check:api
- estado actual de Git
- migraciones pendientes
- contratos reales del backend

Referencia visual aprobada:

https://claude.ai/design/p/a841b70c-947f-4bf3-b46d-027dada3f0ca?file=Tony-Tony+Etapa+1.dc.html

Usa también la copia local importada en:

.design-handoff/tony-tony/

Si el enlace remoto no es accesible desde la sesión, usa la copia local.
No declares haber comparado el diseño aprobado si no pudiste abrir ni la
referencia remota ni la copia local.

Jerarquía de decisiones:

1. Este prompt contiene decisiones explícitas del propietario del producto.
2. GOALS.md.
3. Contratos, modelos y migraciones actuales.
4. Handoff visual aprobado.
5. Decisiones técnicas razonables y documentadas.

Si GOALS.md contradice este prompt, este prompt prevalece.
Actualiza GOALS.md para reflejar la decisión definitiva, con una nota breve
de qué se corrigió y por qué.

No inventes políticas de producto que contradigan estas reglas.
No preguntes por decisiones ya cerradas aquí.
Sólo detente si una operación es destructiva, involucra producción real,
credenciales reales, datos reales de clientes o una contradicción imposible
de resolver técnicamente.

No hagas reset, clean destructivo, force push ni borres trabajo previo.
Primero inspecciona Git. Si hay cambios previos no commiteados:

- identifica cuáles pertenecen al proyecto;
- preserva los cambios relevantes;
- no los descartes;
- intégralos y pruébalos;
- sepáralos en commits lógicos sólo cuando sea seguro hacerlo.

Nunca ejecutes pruebas ni migraciones contra producción.
Usa únicamente un stack local, aislado, temporal o de prueba.

────────────────────────────────────────────────────────────────────
1. ESTRUCTURA DE RUTAS Y ENTORNOS
────────────────────────────────────────────────────────────────────

La plataforma tiene tres experiencias claramente separadas.

Público / cliente:

/
 /menu
 /carrito
 /checkout
 /pedidos
 /pedidos/[id]
 /cuenta
 /creditos

Operación diaria:

/panel
/panel/pedidos
/panel/pedidos/[id]
/panel/pos
/panel/entregas
/panel/reparto
/panel/reparto/[delivery_id]
/panel/tickets

Administración:

/admin
/admin/catalogo
/admin/zona-entrega
/admin/tarifas
/admin/pagos
/admin/finanzas
/admin/usuarios
/admin/roles
/admin/configuracion
/admin/storefront
/admin/auditoria
/admin/codigos-descuento

Reglas:

- / es la portada pública del restaurante.
- /sitio no debe ser ruta canónica.
- Si /sitio existe por compatibilidad, redirígela a /.
- No usar /sitio en links, canonical URLs, CTAs, metadata o navegación.
- /panel no es un admin reducido.
- /panel es operativo, rápido y orientado a pedidos.
- /admin es configuración, gobierno, catálogo, finanzas, usuarios,
  permisos, Storefront y auditoría.
- Un administrador puede usar /panel si tiene capacidades operativas.
- Cajero, cocina y repartidor no deben recibir acceso a /admin sólo por
  ser empleados.
- La navegación y las acciones deben derivarse de capabilities/permisos,
  nunca de role === "admin" o role === "cashier".
- Backend continúa siendo la autoridad final de permisos y transiciones.

Roles que deben verse y probarse:

- visitante público;
- cliente autenticado;
- cajero;
- cocina;
- repartidor;
- supervisor, si existe o puede construirse con permisos existentes;
- administrador.


────────────────────────────────────────────────────────────────────
1-A. CONTRATOS FRONTEND ↔ BACKEND Y REGLA DE NO DUPLICACIÓN
────────────────────────────────────────────────────────────────────

La arquitectura de restaurant-platform depende de tres capas de contrato.

No las reemplaces por interfaces TypeScript manuales, navegación cableada,
formularios locales duplicados ni permisos inferidos desde nombres de roles.

────────────────────────────────────────
A. CONTRATO ESTÁTICO: OPENAPI → TIPOS GENERADOS
────────────────────────────────────────

El backend publica OpenAPI en:

/api/openapi.json

El frontend genera sus tipos mediante:

npm run generate:api

Archivo generado canónico:

src/generated/openapi.ts

Reglas obligatorias:

- Todo request y response del frontend debe provenir de tipos generados
  o ser un alias/adaptador derivado de ellos.

- Usar patrones equivalentes a:

  components["schemas"]["CheckoutRequest"]

  Nunca declarar manualmente una réplica de un request, response, enum,
  estado o modelo del backend.

- No editar src/generated/openapi.ts manualmente.

- Si cambia un endpoint, schema, enum, permiso expuesto, request,
  response o contrato OpenAPI:

  1. actualizar backend;
  2. regenerar tipos mediante el script canónico;
  3. corregir errores de typecheck;
  4. ejecutar check:api contra backend vivo;
  5. no aceptar drift.

- check:api es una guarda obligatoria:
  regenera/compara contratos y debe fallar si backend y frontend
  se desalinean.

- Los ViewModels de interfaz son válidos sólo si:
  - derivan de tipos generados;
  - no duplican contratos;
  - no se usan para inventar campos, estados o permisos;
  - viven en adaptadores centralizados, no dispersos por páginas.

- No escribir fetches ad hoc repetidos dentro de páginas.
  Usar browserApi, serverApi, requestJson y los adaptadores existentes.

────────────────────────────────────────
B. CONTRATO DINÁMICO: RECURSOS Y CAPABILITIES
────────────────────────────────────────

El backend expone:

GET /api/v1/resources

La respuesta está proyectada por la sesión y RBAC actual.

Cada recurso puede declarar, entre otros:

- ResourceCapability;
- visible_in_list;
- campos visibles;
- tipos y alineación;
- filtros;
- búsqueda;
- sorting;
- paginación;
- formularios de create/edit;
- widgets;
- requeridos;
- archivos;
- relaciones editables;
- acciones;
- visible_when;
- enabled_when;
- permisos necesarios.

Este catálogo es la fuente de verdad de experiencia para el shell
administrativo genérico.

Reglas obligatorias:

- PlatformShell deriva navegación administrativa desde el catálogo
  declarado por backend.

- No crear un menú administrativo hardcodeado en frontend con recursos,
  permisos o rutas que el backend no haya declarado.

- /admin/resources/[resourceName] debe seguir reutilizando:
  - ResourceTable;
  - filtros declarativos;
  - búsqueda;
  - sorting;
  - paginación;
  - formularios declarativos;
  - acciones condicionales;
  - estados y errores estándar.

- El frontend puede tener pantallas especializadas para experiencias que
  realmente lo necesitan:

  - Storefront;
  - POS;
  - pedidos;
  - cocina;
  - reparto;
  - ticket;
  - carrito;
  - checkout;
  - créditos;
  - códigos de descuento.

  Pero incluso esas pantallas deben usar:
  - tipos OpenAPI generados;
  - API centralizada;
  - capabilities reales;
  - permisos reales;
  - respuestas y errores reales del backend.

- No usar:

  role === "admin"
  role === "cashier"
  role === "cook"
  role === "courier"

  como fuente única de autorización o navegación.

- Roles agrupan permisos.
  Capabilities determinan qué se muestra.
  Backend determina qué se permite realmente.

────────────────────────────────────────
C. EXTENSIÓN AL DOMINIO: STOREFRONT Y SCHEMA FORMS
────────────────────────────────────────

La misma filosofía de contratos dinámicos aplica al Storefront.

El backend debe exponer:

- templates disponibles;
- key;
- versión;
- label;
- JSON Schema de configuraciones;
- JSON Schema de HeaderConfig;
- JSON Schema de FooterConfig;
- contratos de layout;
- contratos de media;
- contratos de páginas y revisiones.

El frontend debe:

- generar formularios Storefront desde schemas conocidos;
- reutilizar SchemaForm o el motor equivalente;
- evitar espejos locales de HeaderConfig/FooterConfig;
- evitar formularios manuales duplicados cuando el schema backend existe;
- no permitir HTML, CSS o JavaScript libre;
- no interpretar configuraciones arbitrarias como código.

Si una plantilla, campo o schema aún no existe en backend:

- no inventarlo permanentemente en frontend;
- no persistir configuración local falsa;
- mostrar capability pendiente de API;
- documentar qué contrato falta.

────────────────────────────────────────
D. AUTORIZACIÓN EN TRES NIVELES
────────────────────────────────────────

La experiencia y la seguridad tienen capas distintas:

Frontend:
- oculta navegación, campos, botones y acciones no disponibles;
- deriva UI desde capabilities;
- muestra errores de backend de forma comprensible;
- nunca considera ocultar un botón como defensa de seguridad.

Backend:
- rechaza cualquier operación sin permiso;
- aplica ownership;
- valida transiciones;
- valida reglas económicas;
- responde 403, 404, 409 o errores de dominio reales.

Base de datos:
- mantiene invariantes;
- CHECKs;
- únicos parciales;
- FKs;
- locks;
- constraints de dinero, créditos y estados.

No debilites ninguna capa para “hacer funcionar” el frontend.

────────────────────────────────────────
E. RESOURCEDEFINITIONS DEL DOMINIO RESTAURANTE
────────────────────────────────────────

El dominio restaurante debe registrar ResourceDefinitions en el registry
backend para que el shell administrativo contract-driven pueda descubrir
y administrar recursos estándar.

No resolver este hueco escribiendo pantallas CRUD manuales primero.

Analiza los recursos del dominio y registra los que encajen en el motor
genérico, como mínimo cuando sus contratos lo permitan:

- categorías;
- productos;
- imágenes de producto;
- inclusiones;
- grupos de modificadores;
- opciones de modificadores;
- métodos de pago configurables;
- zonas de entrega;
- reglas/tarifas de envío;
- categorías financieras;
- códigos de descuento;
- configuraciones administrativas simples;
- recursos de auditoría o consulta que ya tengan contrato compatible.

Para cada ResourceDefinition:

- declarar campos de lista;
- filtros;
- sorting;
- búsqueda;
- formularios create/edit;
- relaciones editables;
- acciones;
- permisos;
- labels;
- widgets;
- validaciones visuales permitidas;
- metadata necesaria para navegación.

No fuerces al motor genérico a resolver experiencias que son
intrínsecamente especializadas.

Experiencias especializadas como Storefront, POS, pedidos, cocina,
reparto, checkout y ticket pueden mantener rutas propias, pero su acceso
debe ser declarable por backend o derivable desde capabilities, nunca
agregado como navegación cliente-only sin contrato.

Si el catálogo actual sólo soporta recursos genéricos y no puede exponer
un módulo especializado en navegación:

- implementa la extensión mínima y declarativa del contrato backend;
- no agregues un segundo menú hardcodeado;
- documenta el nuevo tipo de entrada de navegación;
- protégelo con capacidades/permisos reales.

────────────────────────────────────────
F. TESTS-GUARDA DEL CATÁLOGO
────────────────────────────────────────

Los siguientes tests son parte de la arquitectura, no ruido de suite:

- test_security_catalog;
- test_resources_capabilities;
- test_bootstrap_routes;
- equivalentes actuales si sus nombres cambiaron.

Cada permiso, grupo, ResourceDefinition, acción o bootstrap route nuevo
debe actualizar conscientemente los tests-guarda correspondientes.

Nunca:

- borres tests-guarda;
- los conviertas en skip;
- relajes listas exactas para evitar fallos;
- declares permisos sólo en frontend;
- dejes un recurso nuevo fuera del catálogo sin documentar el motivo.

El objetivo es que cambios de catálogo y permisos fallen en CI antes
de convertirse en bugs de navegación, autorización o drift.

────────────────────────────────────────────────────────────────────
2. ETAPA 0 — BASELINE, DOCUMENTACIÓN Y PREPARACIÓN
────────────────────────────────────────────────────────────────────

Antes de implementar:

1. Ejecuta y documenta:

- git status --short
- git diff --check
- git log -10 --oneline
- versión de Node, Python, Docker y herramientas relevantes;
- scripts disponibles;
- estado de migraciones;
- estado actual de OpenAPI;
- pruebas existentes.

2. Determina el flujo canónico para levantar el stack aislado:

- PostgreSQL con PostGIS;
- backend;
- frontend;
- worker Taskiq si aplica;
- Mailpit o equivalente de pruebas, si corresponde;
- navegador/Playwright;
- fixtures/seed de datos.

3. Actualiza CLAUDE.md para que una sesión futura conozca:

- dominio restaurante;
- módulos principales;
- Storefront;
- arquitectura pública /panel /admin;
- reglas de dinero vs créditos;
- códigos de descuento;
- comandos canónicos;
- restricciones importantes;
- ubicación de documentación relevante.

No conviertas CLAUDE.md en un duplicado completo de GOALS.md.
Debe ser conciso y útil.

4. Crea o actualiza:

docs/deployment-runbook.md

Debe cubrir:

- PostGIS externo;
- APP_ENCRYPTION_KEY;
- variables obligatorias;
- reconciliación de permisos;
- migraciones;
- backup;
- permisos de archivos;
- workers Taskiq;
- estrategia de rollback;
- health checks;
- despliegue de frontend;
- riesgos de favicon/SVG;
- checklist preproducción.

5. Crea o actualiza:

docs/release-candidate-plan.md

Debe contener el checklist de etapas de este goal y permitir marcar:

- planeado;
- implementado;
- pruebas unitarias;
- pruebas integración;
- browser/E2E;
- revisión visual;
- commit;
- riesgo restante.

No marques algo como completado sin evidencia real.

6. Inventario de contratos:

Antes de implementar pantallas nuevas, crear o actualizar:

docs/contract-architecture-audit.md

Debe documentar:

- contrato OpenAPI actual;
- comando de generación;
- comando check:api;
- cliente API compartido;
- adaptadores existentes;
- catálogo GET /api/v1/resources;
- ResourceDefinitions existentes;
- recursos del dominio restaurante registrados;
- recursos aún faltantes;
- pantallas especializadas;
- schemas Storefront existentes;
- espejos frontend que deben eliminarse;
- capacidades backend faltantes;
- tests-guarda de security/resources/bootstrap.

7. Prohibición de regresión:

No crear tipos TypeScript manuales que repliquen backend.
No crear navegación admin cableada.
No crear CRUD manual de recursos que el motor genérico pueda resolver.
No introducir un segundo sistema de permisos.
No reemplazar ResourceTable/SchemaForm por formularios locales sin justificarlo.

────────────────────────────────────────────────────────────────────
3. ETAPA 1 — DETALLE DE PRODUCTO Y MODIFICADORES
────────────────────────────────────────────────────────────────────

Implementa el flujo visual y funcional completo de producto configurable.

Reglas:

1. Producto con modificadores requeridos:

- al tocar “Agregar”, abrir modal o drawer de detalle;
- no agregar directamente al carrito;
- permitir seleccionar modificadores;
- validar grupos requeridos;
- validar mínimo/máximo;
- validar single/multiple;
- mostrar precio y selección de forma clara;
- impedir confirmar hasta que la selección sea válida.

2. Producto sin modificadores requeridos:

- conservar agregado rápido;
- si tiene extras opcionales, ofrecer “Personalizar” como acción clara;
- no obligar a abrir detalle cuando no haga falta.

3. Edición:

- una línea existente debe abrir el mismo configurador;
- cargar opciones seleccionadas;
- permitir reemplazar selección;
- preservar cantidades enteras;
- evitar duplicados accidentales.

4. Cantidades:

- únicamente enteros positivos;
- no permitir 0;
- no permitir negativos;
- no permitir 0.5, 1.5 ni texto ambiguo;
- no usar parseInt, Math.floor ni truncamiento silencioso;
- usar steppers y controles claros.

5. Errores backend:

- seleccion_incompleta y equivalentes deben mostrarse con un mensaje útil;
- no modificar silenciosamente el carrito;
- no perder la selección del usuario.

6. Notas:

- no inventar notas libres por línea si backend no tiene contrato real;
- si existe contrato real para observaciones, úsalo;
- si no existe, no crear persistencia local falsa.

Pruebas obligatorias:

- producto sin modificadores;
- producto con un grupo obligatorio;
- producto con múltiples grupos;
- grupo single;
- grupo multiple;
- mínimo y máximo;
- editar línea;
- error de selección incompleta;
- cantidades inválidas;
- móvil y desktop.

────────────────────────────────────────────────────────────────────
4. ETAPA 2 — CANJE DE CRÉDITOS ÍNTEGRO, SIN MEZCLA
────────────────────────────────────────────────────────────────────

Decisión definitiva:

Un pedido es completamente monetario o completamente con créditos.

Nunca existe:

- pedido híbrido;
- una línea con dinero y otra con créditos;
- pago parcial con créditos;
- pago de diferencia con dinero;
- envío pagado con dinero en un pedido de créditos;
- descuento por código en un pedido de créditos.

Reglas:

1. Carrito monetario:

- es el modo inicial;
- puede contener productos monetarios;
- puede tener envío;
- puede usar código de descuento cuando corresponda.

2. Carrito de créditos:

- requiere cliente autenticado;
- requiere customer_user_id;
- todos los productos deben tener precio válido de canje;
- todos los productos deben poder comprarse con créditos;
- saldo suficiente se valida en backend;
- no permite delivery;
- no permite shipping;
- no permite código de descuento;
- no permite producto sin precio de créditos;
- no permite mezcla de purchase_mode;
- no permite diferencia monetaria.

3. Si un cliente desea un producto no canjeable:

- no puede incluirlo en una orden de créditos;
- debe crear otro pedido monetario separado.

4. Interfaz:

- modo money por defecto;
- modo credits elegido explícitamente;
- nunca gastar créditos automáticamente;
- si no hay sesión o saldo suficiente, ocultar o deshabilitar el modo
  de créditos con explicación clara;
- si otro dispositivo consume el saldo, backend rechaza la operación;
- frontend muestra el error sin cambiar el carrito automáticamente;
- no debe caer en dinero como fallback automático.

5. Backend:

- la validación debe existir en servidor y no depender de frontend;
- impedir bypass desde llamadas directas;
- impedir créditos sin customer_user_id;
- impedir shipping en pedido créditos;
- impedir descuento en pedido créditos;
- impedir producto no canjeable;
- impedir compra híbrida;
- mantener consistencia con el ledger y reservas existentes.

Pruebas obligatorias:

- carrito monetario normal;
- crédito completo válido;
- producto no canjeable en carrito créditos;
- crédito insuficiente;
- cliente sin sesión;
- delivery intentado en créditos;
- descuento intentado en créditos;
- mezcla de líneas vía API;
- saldo agotado simultáneamente desde segunda sesión;
- reserva, consumo y liberación correctos.

────────────────────────────────────────────────────────────────────
5. ETAPA 3 — CUENTA PÚBLICA DEL CLIENTE
────────────────────────────────────────────────────────────────────

Implementa /cuenta como experiencia pública real.

Debe incluir:

- resumen de cuenta;
- perfil disponible según contrato;
- pedidos;
- direcciones;
- créditos;
- cerrar sesión;
- accesos coherentes a /pedidos y /creditos.

Reglas:

- no redirigir /cuenta a /admin/account;
- no mezclar shell público con shell administrativo;
- el cliente sólo puede ver o modificar recursos propios;
- cambios de correo, contraseña o identidad deben usar el flujo de
  platform-core existente;
- no duplicar identidad ni autenticación;
- no revelar existencia de pedidos o datos ajenos.

────────────────────────────────────────────────────────────────────
6. ETAPA 4 — PAGOS, CIERRE DE PEDIDO, ENTREGA Y PANEL
────────────────────────────────────────────────────────────────────

Resolver H4, H5, H6, H9 y H10, además de mejorar operación del panel.

Principio central:

Pago confirmado y pedido completado son conceptos distintos.

Pedido completed significa fulfillment real:

- entrega física realizada;
- pickup entregado al cliente;
- venta inmediata de mostrador entregada.

Reglas de pago:

1. Transferencia o terminal:

- la verificación confirma el pago;
- verificar un pago nunca completa automáticamente el pedido;
- un pedido puede estar paid y seguir preparing o ready;
- el fulfillment se completa con transición explícita posterior.

2. Efectivo contra entrega:

- no marcar como cobrado sólo porque existe una instrucción;
- confirmar/cobrar al completar entrega;
- registrar monto recibido y cambio cuando corresponda;
- sólo métodos explícitamente configurados como efectivo/cobro contra
  entrega pueden mostrar “Cobrar efectivo”.

3. Mostrador o pickup:

- si el cajero recibe efectivo al entregar inmediatamente, puede existir
  una acción explícita que registre cobro y complete atómicamente;
- si el pedido se paga antes pero sigue en preparación, puede estar paid
  sin estar completed;
- no convertir pago en fulfillment automático.

4. H4:

- al congelar envío y total final, recalcular payment_status contra total
  definitivo;
- si el envío estaba pendiente, no presentar pago como liquidación final
  antes de congelar total;
- UI debe mostrar “Pago registrado; total final pendiente de confirmar”
  cuando corresponda.

5. H5:

Al cancelar un pedido con pagos cobrados, exigir resolución explícita:

- reembolso registrado ahora;
- reembolso pendiente de procesar;
- retención excepcional del pago, con motivo obligatorio.

La UI debe mantener visible un aviso de conciliación hasta resolver el caso.
Cancelar nunca debe presentarse como sinónimo de reembolsar.

6. H6:

- ordenar locks por ID ascendente de forma consistente;
- no introducir nuevos patrones de lock no deterministas;
- cubrir escenarios relevantes con pruebas reales de concurrencia
  PostgreSQL.

7. H9:

- collection_instruction nunca debe etiquetar transferencia pendiente
  como efectivo;
- sólo derivar “cobrar efectivo” de método configurado explícitamente
  para efectivo/cobro contra entrega.

8. H10:

- verificar transferencia POS no completa la venta automáticamente;
- el panel muestra el estado real;
- la transición a completed es separada y autorizada.

Panel operativo:

- cajero: pedidos, POS, cobro, tickets;
- cocina: approved → preparing → ready;
- repartidor: entregas asignadas, contacto autorizado, navegación,
  ubicación voluntaria y completar entrega;
- supervisor: cola, aprobación, ajuste de envío, pagos, reparto,
  incidencias;
- admin: puede operar si tiene capabilities, pero no se confunde
  /admin con /panel.

Implementa endpoint real para entregas activas del repartidor autenticado.

No depender de estado local para recuperar entrega activa tras recargar.

El endpoint debe devolver exclusivamente entregas autorizadas del courier
autenticado, con contacto/dirección/instrucciones limitadas a lo necesario.

Pruebas obligatorias:

- transferencia verificada no completa pedido;
- efectivo delivery se cobra al completar;
- counter inmediato cobra y completa explícitamente;
- pickup pagado antes no se completa antes de entregar;
- envío final modifica correctamente payment_status;
- cancelación pagada exige resolución;
- cash instruction correcta;
- transfer pending no se muestra como cash;
- courier recarga navegador y recupera entrega activa;
- intentos de roles no autorizados;
- dos sesiones con locks relevantes.

────────────────────────────────────────────────────────────────────
7. ETAPA 5 — CÓDIGOS DE DESCUENTO FIJO WEB-ONLY
────────────────────────────────────────────────────────────────────

Implementa esto como módulo pequeño y explícito.

No construyas:

- promotions;
- campaign engine;
- discount percentage;
- free shipping;
- max discount;
- global usage limit;
- usage count;
- segmentación;
- categorías específicas;
- productos específicos;
- reglas por horario;
- compra X recibe Y;
- producto gratis;
- primera compra automática;
- acumulación de códigos;
- múltiples códigos por pedido;
- descuentos en POS;
- descuentos en counter;
- descuentos en llamadas;
- descuentos en WhatsApp;
- descuentos manuales no vinculados;
- descuentos en pedido de créditos.

Regla única:

“Un código descuenta X pesos si el subtotal monetario elegible
de productos y modificadores alcanza o supera Y pesos.”

Debe existir únicamente:

discount_codes
discount_code_redemptions

Reglas de discount_codes:

- código alfanumérico único;
- comparación case-insensitive;
- nombre;
- descripción opcional;
- discount_amount fijo;
- minimum_order_amount;
- valid_from opcional;
- valid_until opcional;
- activo/inactivo;
- target_customer_user_id opcional;
- creado por;
- timestamps.

Reglas:

- si target_customer_user_id es NULL, cualquier cliente registrado puede
  usar el código una vez;
- si target_customer_user_id tiene valor, sólo ese cliente puede usarlo;
- un código puede ser general o personal;
- no hay generador automático de códigos;
- el administrador escribe el código manualmente;
- un cliente sólo puede tener una redención reserved o consumed
  del mismo código;
- un pedido sólo puede tener un código activo;
- el descuento no aplica a envío;
- envío no cuenta para alcanzar el mínimo;
- productos comprados con créditos no cuentan para el mínimo;
- pedido sin customer_user_id no puede usar código;
- sólo orders.source = online puede usar código;
- panel/POS/counter/phone/WhatsApp/social/manual nunca pueden usar código;
- cada descuento debe guardarse como snapshot histórico;
- el descuento debe aparecer en pedido, ticket y auditoría económica.

Para mantener un descuento fijo exacto y evitar totales negativos:

- valida que discount_amount > 0;
- valida minimum_order_amount >= discount_amount;
- valida fechas coherentes;
- nunca recortes el descuento silenciosamente;
- si no cumple mínimo, el código no aplica.

Lifecycle:

1. Cliente web autenticado ingresa código.
2. Backend cotiza y valida.
3. En confirmación de pedido, backend vuelve a validar y reserva.
4. Reserva y pedido deben ser transaccionales.
5. Pedido completed → redención consumed.
6. Pedido cancelled antes de completed → redención released.
7. Pedido expired → redención released.
8. Pedido completed y luego reembolsado → código permanece consumed.
9. Para compensación posterior se crea otro código, posiblemente personal.

Edición de código, decisión explícita:

- después de que un código tenga redenciones, se permite editar todos
  sus campos;
- los cambios aplican sólo a redenciones futuras;
- las reservas y redenciones existentes se gobiernan por sus snapshots;
- nunca reescribir el histórico;
- documentar claramente este comportamiento en UI y auditoría.

Persistencia:

- crear order_adjustment histórico ligado a la redención;
- no reconstruir históricos leyendo el código actual;
- redención debe almacenar snapshots de código, nombre, descuento,
  mínimo y cliente relevante;
- añadir constraints, índices únicos e idempotencia necesarios;
- preparar concurrencia real con locks y/o restricciones de base de datos.

Administración:

/admin/codigos-descuento

Debe permitir:

- crear;
- editar;
- activar/desactivar;
- definir descuento fijo;
- definir mínimo;
- definir vigencia;
- elegir general o cliente específico;
- consultar redenciones reserved/consumed/released;
- ver pedido, usuario y snapshot histórico;
- no mostrar herramientas de campañas complejas;
- no mostrar generador automático.

Permisos:

- crear/editar/activar/desactivar: administrador y/o supervisor con
  permiso específico discount_codes:manage;
- cajeros pueden ver un código aplicado según su acceso al pedido,
  pero no crear campañas;
- no habilitar códigos en panel operativo.

Cliente web:

- input de código sólo en carrito y checkout web;
- frontend envía sólo discount_code;
- frontend nunca envía discount_amount, total, mínimo o elegibilidad;
- backend responde cálculo real;
- mostrar válido, inválido, expirado, mínimo no alcanzado, cupón personal
  ajeno, ya usado, reservado o no disponible;
- no persistir descuentos falsos en localStorage;
- no aplicar código en pedido créditos.

Pruebas obligatorias:

- válido general;
- válido personal;
- código de otro cliente;
- mínimo no alcanzado;
- vigencia antes/después;
- case-insensitive;
- una vez por usuario;
- doble pestaña/sesión;
- una redención activa por pedido;
- cancelación libera;
- expiración libera;
- completed consume;
- reembolso no reactiva;
- pedido manual rechazado;
- POS rechazado;
- pedido créditos rechazado;
- snapshot histórico tras editar código;
- editar código sólo afecta nuevos usos;
- ticket y pedido muestran descuento.

────────────────────────────────────────────────────────────────────
8. ETAPA 6 — STOREFRONT COMPLETO, SEGURO Y FIEL AL DISEÑO
────────────────────────────────────────────────────────────────────

Completa los pendientes de Fase 1/Fase 2 de Storefront.

Mantén la regla:

El handoff define cómo debe sentirse Tony-Tony.
El Storefront publicado define cómo se ve cada instancia.
El backend define datos, permisos y acciones válidas.
El frontend reutiliza contratos y sólo crea UI especializada donde importa.

Tema y marca:

- tema mediante tokens;
- no hexadecimales Tony-Tony dispersos en componentes;
- Tony-Tony debe ser preset/configuración inicial;
- BrandLockup dinámico;
- logo dinámico;
- trade name dinámico;
- slogan dinámico;
- font-brand derivada de allowlist;
- favicon dinámico seguro;
- metadata, título, OG y descripción dinámicos.

H8 SVG:

- no permitir SVG público por ahora;
- logo y favicon público dinámico deben usar PNG, WEBP, JPEG o ICO;
- nunca insertar SVG remoto inline;
- si hay SVG existente, usar fallback seguro;
- no confiar en sanitización regex de frontend;
- proteger backend y archivos públicos.

Implementar:

1. Media por sección:

- endpoints para agregar, reemplazar y quitar media por slot;
- validar archivo y kind=image;
- soportar desktop/mobile cuando contrato lo requiera;
- alt text;
- focal point;
- render público y preview;
- no Base64;
- no persistencia simulada;
- auditoría y permisos.

2. Header/footer:

- contratos HeaderConfig/FooterConfig;
- JSON Schema expuesto;
- edición/publish real;
- navegación controlada;
- enlaces internos permitidos;
- URLs externas HTTPS;
- teléfonos;
- WhatsApp;
- redes;
- horarios;
- texto footer;
- sin HTML/CSS/JS libre.

3. Templates faltantes:

- storefront.catalog.categories;
- storefront.banner.credits;
- storefront.banner.delivery;
- storefront.content.image_text;
- storefront.content.info_cards;
- storefront.content.faq.

No inventar template keys fuera de contrato.
No permitir configuración libre.

4. Validación:

- validación genérica y recursiva de CTAs;
- no depender sólo de campos llamados cta/slides;
- bloquear javascript:, data:, blob:, file:, http:;
- externos sólo HTTPS;
- category binding requiere category_id válido;
- no aceptar binding vacío que produzca sección silenciosamente vacía;
- en público, fallback elegante si datos vinculados quedan vacíos;
- en editor, advertencia y bloqueo de guardar/publicar cuando corresponde.

5. Reordenamiento:

- endpoint atómico de orden de secciones;
- validación de IDs, página y duplicados;
- frontend drag-and-drop sólo después de que exista operación atómica;
- mantener orden consistente con publish/preview.

6. Páginas:

- endpoint real para listar páginas Storefront;
- no lista hardcodeada de “siete páginas sembradas”;
- frontend usa entidades reales;
- rutas de sistema no deben ser IDs persistidos hardcodeados.

7. JSON Schema:

- exponer schemas tipados de templates;
- incluir HeaderConfig/FooterConfig;
- frontend elimina espejos locales cuando exista contrato;
- no construir editor universal inseguro;
- usar formularios derivados de schemas conocidos.

8. Publicación programada:

- primero resolver H7 usando datetimes aware UTC coherentes;
- implementar job Taskiq para scheduled_publish_at;
- job debe publicar en instante correcto;
- si una revisión más reciente fue publicada después de que se programó
  la revisión, cancelar automáticamente la programación antigua;
- registrar motivo y auditoría;
- no permitir que campaña vieja pise cambios nuevos;
- UI debe reflejar estado real scheduled/published/cancelled;
- no usar temporizador frontend como sustituto.

9. Preview temporal:

- implementar enlace de preview firmado y temporal;
- token opaco, firmado, read-only;
- scope mínimo a revisión/página;
- expiración razonable y documentada, máximo 24 horas;
- invalidación por cambio de revisión/publicación cuando corresponda;
- no exponer borradores por rutas públicas normales;
- no incluir acciones administrativas;
- no filtrar datos privados.

Diseño visual:

- usar handoff como referencia principal;
- preservar calidez, crema, rojo profundo, oscuro/café, tarjetas,
  sombras, botones pill, tipografía display, cuerpo legible,
  barra de anuncio, hero split, imágenes de producto, footer oscuro;
- no convertir esos valores en constantes rígidas de componentes;
- aplicarlos mediante preset y tokens Storefront;
- hero puede tener una o varias secciones/slides;
- carrusel accesible sólo con múltiples slides;
- no autoplay agresivo;
- respetar reduced motion;
- el menú debe ser alcanzable rápidamente en móvil.

────────────────────────────────────────────────────────────────────
10-A. ENTORNO OBLIGATORIO DE PRUEBA: DOCKER + CHROME DEVTOOLS MCP
────────────────────────────────────────────────────────────────────

Las pruebas de integración, navegador, roles, responsive y diseño deben
realizarse contra el stack real levantado localmente con Docker.

No validar integración sólo con mocks, tests unitarios, snapshots,
fixtures frontend ni razonamiento estático.

Antes de las pruebas browser/E2E:

1. Levantar el stack aislado con Docker usando la configuración canónica
   del repositorio.

Debe incluir, cuando corresponda:

- PostgreSQL con PostGIS;
- backend API;
- frontend Next.js;
- worker Taskiq;
- Redis/broker si el proyecto lo requiere;
- Mailpit o servicio de correo de prueba;
- servicios auxiliares definidos por docker-compose.

2. Esperar health checks reales.

No asumir que un contenedor “up” significa que el sistema está listo.

Verificar explícitamente:

- base de datos disponible;
- PostGIS disponible;
- backend responde health/readiness;
- frontend carga;
- worker conectado si aplica;
- Mailpit disponible si se prueban notificaciones;
- OpenAPI disponible;
- autenticación disponible.

3. Ejecutar migraciones contra la base aislada.

4. Ejecutar seed/bootstrap necesario para crear datos controlados y roles
   de prueba.

5. Ejecutar check:api contra el backend vivo.

6. No usar producción.
No usar credenciales reales.
No usar datos reales de clientes.
No conectar Chrome DevTools MCP a una sesión de navegador personal con
cuentas, cookies o información sensible.

────────────────────────────────────────
CHROME DEVTOOLS MCP: USO OBLIGATORIO
────────────────────────────────────────

Usa chrome-devtools MCP para controlar y verificar la aplicación real
en navegador.

No limitarse a Playwright ni a screenshots estáticos.

Chrome DevTools MCP debe usarse para:

- abrir y navegar rutas públicas, /panel y /admin;
- iniciar sesión con cada usuario de prueba;
- interactuar con formularios, modales, steppers, carrito y checkout;
- cambiar viewport;
- validar comportamiento responsive;
- revisar consola;
- revisar errores de red;
- revisar errores HTTP;
- detectar recursos fallidos;
- inspeccionar estados visuales;
- tomar screenshots comparables;
- detectar errores runtime;
- verificar redirecciones;
- recargar páginas;
- verificar persistencia real de sesión;
- verificar recuperación de estado tras refresh;
- comprobar que no haya errores de hidratación;
- comprobar que no haya rutas rotas, 404 inesperados ni 500;
- verificar que no haya llamadas API duplicadas o fallidas críticas;
- inspeccionar que UI y datos mostrados correspondan con respuestas reales.

Usar una instancia de Chrome dedicada al entorno de prueba.

No conectar el MCP a una ventana con sesiones reales del usuario.

────────────────────────────────────────
PROTOCOLO DE PRUEBA EN NAVEGADOR
────────────────────────────────────────

Para cada escenario browser/E2E:

1. Preparar datos de prueba reproducibles.
2. Abrir sesión limpia o perfil de navegador limpio.
3. Iniciar sesión con el rol correspondiente, cuando aplique.
4. Ejecutar el flujo completo mediante UI real.
5. Verificar:
   - estado visual;
   - URL;
   - respuesta backend;
   - consola;
   - red;
   - efectos persistidos;
   - refresh;
   - rol/permisos;
   - screenshot antes/después cuando aporte evidencia.
6. Si se detecta error:
   - capturar consola;
   - capturar request/response relevante;
   - capturar screenshot;
   - corregir;
   - reiniciar el caso desde estado limpio;
   - volver a ejecutar hasta pasar.

No declarar un flujo como aprobado sólo porque no apareció un error visible.
Debe verificarse que el estado final en UI, backend y base aislada sea el
esperado.

────────────────────────────────────────
MATRIZ MÍNIMA DE NAVEGADOR Y VIEWPORTS
────────────────────────────────────────

Ejecutar con Chrome DevTools MCP, como mínimo:

Desktop:
1440 × 900

Tablet:
768 × 1024

Mobile:
390 × 844

Roles:

- visitante;
- cliente autenticado;
- cajero;
- cocina;
- repartidor;
- supervisor, si existe;
- administrador.

Flujos mínimos:

A. Visitante / cliente:

- portada;
- navegación;
- hero;
- menú;
- producto sin modificadores;
- producto con modificadores requeridos;
- carrito;
- login previo a checkout;
- checkout monetario;
- seguimiento de pedido;
- cuenta;
- créditos;
- descuento web cuando corresponda.

B. Cliente con créditos:

- cambiar explícitamente a carrito de créditos;
- agregar sólo productos canjeables;
- intentar producto no canjeable;
- intentar delivery;
- intentar descuento;
- verificar rechazo y mensajes correctos;
- simular saldo modificado desde otra sesión;
- verificar rechazo backend sin fallback automático a dinero.

C. Cajero:

- abrir panel;
- crear pedido/POS;
- registrar cobro;
- verificar que pago y completed sean acciones distintas cuando aplique;
- generar/ver ticket;
- refrescar y confirmar persistencia.

D. Cocina:

- sólo ve pedidos autorizados;
- transición approved → preparing → ready;
- no ve configuraciones o finanzas no permitidas.

E. Repartidor:

- ve sólo entregas propias;
- recarga y recupera entrega activa desde endpoint real;
- navegación/contacto permitido;
- completar entrega;
- confirmar que deja de ver datos privados después de completed.

F. Administrador:

- navega recursos declarados desde catálogo dinámico;
- abre Storefront;
- cambia configuración permitida;
- preview;
- publicación;
- códigos de descuento;
- verifica que recursos estándar aparecen vía ResourceDefinitions,
  no sólo por URL hardcodeada.

────────────────────────────────────────
VALIDACIÓN DE CONSOLE Y RED
────────────────────────────────────────

En cada flujo crítico, Chrome DevTools MCP debe verificar:

- no errores uncaught;
- no errores React/hydration;
- no errores de CORS;
- no 401/403 inesperados;
- no 404 de assets/rutas;
- no 500;
- no fallos de carga de favicon/logo/media;
- no requests duplicados críticos;
- no error de schema/configuración Storefront;
- no errores de assets SVG;
- no secretos expuestos en consola o respuestas;
- no warnings graves ignorados sin documentar.

Un warning conocido sólo puede aceptarse si:

- se documenta;
- no afecta funcionalidad o seguridad;
- tiene causa y plan de resolución;
- no es un error de React, permisos, API, hidratación, datos o seguridad.

────────────────────────────────────────
EVIDENCIA OBLIGATORIA DE BROWSER TESTING
────────────────────────────────────────

Generar y conservar en una carpeta ignorada por Git, por ejemplo:

.artifacts/browser-validation/

Estructura sugerida:

.artifacts/browser-validation/
├── screenshots/
├── console/
├── network/
├── traces/
└── role-scenarios/

No subir automáticamente artefactos pesados al repositorio.

El reporte docs/browser-e2e-validation-report.md debe incluir:

- fecha;
- commit probado;
- Docker compose/profile usado;
- contenedores levantados;
- migraciones aplicadas;
- usuarios de prueba;
- roles;
- URLs;
- viewports;
- escenarios;
- resultado;
- errores de consola;
- errores de red;
- screenshots relevantes;
- rutas de artefactos;
- incidencias corregidas;
- incidencias diferidas;
- comandos exactos ejecutados.

────────────────────────────────────────
CONDICIÓN DE BLOQUEO
────────────────────────────────────────

No declarar COMPLETED si:

- no se levantó Docker;
- no se aplicaron migraciones en base aislada;
- no se usó Chrome DevTools MCP;
- no se probaron roles distintos;
- no se probaron desktop, tablet y móvil;
- no se revisaron consola y red;
- no se ejecutó check:api contra backend vivo;
- no se ejecutó el E2E existente;
- no existe evidencia documentada de las pruebas browser.

────────────────────────────────────────────────────────────────────
9. ETAPA 7 — PERFILES, REGISTRY, EXPIRACIÓN, NOTIFICACIONES Y REPORTES
────────────────────────────────────────────────────────────────────

Implementar API operativa de perfiles:

- customer_profiles;
- staff_profiles;
- búsqueda de clientes por teléfono para personal autorizado;
- resultados mínimos y protegidos;
- crear/editar repartidores únicamente por administrador o supervisor
  con permiso específico;
- can_deliver no puede ser autocontrolado por el repartidor;
- pedido manual puede vincular opcionalmente a cliente existente;
- si cliente no existe, el pedido manual puede seguir sin cliente;
- no crear cuentas automáticamente;
- no crear cuentas mínimas/invitaciones en esta etapa;
- no crear usuario por teléfono/nombre sin consentimiento.

Cerrar el hueco de ResourceDefinitions del dominio restaurante.

La meta no es sólo que /admin/storefront o módulos nuevos sean accesibles
por URL. Deben poder descubrirse mediante contrato backend y aparecer
en navegación administrativa según capabilities.

Implementar ResourceDefinitions para los recursos del restaurante que
puedan usar CRUD/listado genérico.

Para cada recurso registrado:

- navegación derivada del catálogo;
- listados declarativos;
- filtros;
- búsqueda;
- sorting;
- paginación;
- formularios;
- acciones;
- permisos;
- labels;
- widgets;
- relaciones;
- manejo de archivos cuando aplique.

Reutilizar el motor genérico existente antes de construir interfaces nuevas.

Mantener UI especializada únicamente donde la experiencia realmente lo exige:

- pedidos;
- POS;
- cocina;
- reparto;
- ticket;
- Storefront;
- preview;
- editor visual;
- checkout;
- carrito;
- créditos;
- detalle de producto configurable.

Para módulos especializados:

- el acceso debe estar derivado de backend/capabilities;
- no añadir entradas de navegación hardcodeadas sólo en frontend;
- si el contrato de navegación no soporta módulos especializados,
  extenderlo de forma mínima, declarativa y testeada;
- actualizar test_security_catalog, test_resources_capabilities y
  test_bootstrap_routes.

Implementar expiración de pedidos:

- pedidos submitted abandonados sin pago ni revisión activa expiran a los
  60 minutos;
- pedidos pending_payment_verification no se deben borrar silenciosamente;
- mantenerlos en revisión humana o usar política explícita documentada;
- al expirar:
  - status cancelled;
  - reason_code expired;
  - liberar créditos reservados;
  - liberar códigos de descuento reservados;
  - liberar cupo diario;
  - registrar auditoría;
  - no generar reembolso automático.

Notificaciones iniciales:

A. Cliente: pedido recibido.
C. Cliente: pedido listo o en camino.
G. Administrador: pedido cancelado con pago cobrado sin reembolso resuelto.

Usar infraestructura existente.
No simular envío real.
Usar Mailpit o equivalente en pruebas.

Rate limiting:

- límites moderados por IP + usuario + sesión;
- aplicados en checkout y validación/aplicación de código;
- no bloquear navegación de menú;
- mensajes claros;
- no depender sólo de IP.

Reportes iniciales de dashboard:

- ventas por hora;
- productos más vendidos;
- usar datos históricos/snapshots;
- no reconstruir ventas usando catálogo actual;
- lenguaje financiero correcto: resultado neto registrado / estimado,
  no prometer utilidad exacta sin costos de receta/inventario.

────────────────────────────────────────────────────────────────────
10. ETAPA 8 — PRUEBAS REALES, CONCURRENCIA Y E2E
────────────────────────────────────────────────────────────────────

No des por resuelto algo por lectura estática.

Ejecuta pruebas reales en stack aislado.

Obligatorio:

1. Migraciones:

- crear base limpia PostgreSQL/PostGIS;
- ejecutar upgrade completo;
- validar migración e8b2c47f91a3 y todas las posteriores;
- probar downgrade cuando las convenciones del proyecto lo permitan;
- validar constraints, índices parciales y datos de seed;
- no truncar ni ignorar errores de migración.

2. Contratos:

- correr check:api contra backend vivo;
- regenerar OpenAPI si procede;
- no aceptar drift;
- typecheck frontend posterior.

3. Backend:

- pruebas unitarias;
- integración relevante;
- pruebas nuevas para cada regla agregada;
- no dejar tests nuevos skip;
- no convertir tests fallidos en skip;
- no eliminar tests para hacer verde la suite.

4. Concurrencia PostgreSQL con dos sesiones reales:

- reserva de créditos;
- límite diario;
- tomar entrega;
- redención del mismo código de descuento;
- reembolso de línea;
- locks ordenados;
- verificar ausencia de doble reserva/doble devolución;
- verificar manejo comprensible de conflictos.

5. Frontend:

- typecheck;
- lint;
- build;
- pruebas de componentes;
- pruebas de rutas afectadas;
- no usar fixtures demo como sustituto del backend real.

6. Playwright/E2E:

Usar el framework E2E existente.
No crear un framework paralelo.

Escenarios obligatorios:

A. Público y pedido monetario configurable:

- visitante navega portada;
- hero, categorías, producto destacado y menú;
- producto con modificadores requeridos;
- producto sin modificadores;
- carrito;
- login antes de checkout;
- pedido monetario;
- shipping quote;
- seguimiento.

B. Créditos:

- cliente autenticado;
- producto canjeable;
- carrito completo de créditos;
- sin delivery;
- sin código;
- producto no canjeable bloqueado;
- crédito insuficiente;
- intento de mezcla por UI y API rechazado.

C. Códigos:

- código válido;
- código expirado;
- mínimo no alcanzado;
- código personal ajeno;
- segundo uso bloqueado;
- cancelación libera;
- completed consume;
- pedido crédito no permite código;
- POS no permite código.

D. Panel:

- cajero crea/gestiona pedido;
- cocina cambia approved → preparing → ready;
- supervisor aprueba o asigna;
- repartidor toma/recarga/continúa entrega;
- entrega completion;
- ticket;
- créditos acreditados donde aplique.

E. Pagos:

- transferencia verificada no completa pedido;
- cash delivery se cobra al entregar;
- counter inmediato cobra/completa explícitamente;
- shipping pendiente no se presenta como total final liquidado;
- cancelación con pago exige resolución.

F. Storefront:

- admin cambia tema/configuración permitida;
- publica;
- portada pública refleja revisión publicada;
- preview borrador no se filtra al público;
- publicación programada;
- conflicto de programación antigua cancelado;
- media por sección;
- header/footer;
- templates nuevas;
- reorder.

G. Seguridad y roles:

- cliente no accede a panel/admin;
- cajero no administra usuarios;
- cocina no ve pagos globales;
- courier no ve pedidos ajenos;
- admin puede operar y configurar según permissions;
- rutas devuelven comportamiento consistente sin revelar datos ajenos.

────────────────────────────────────────────────────────────────────
11. ETAPA 9 — REVISIÓN VISUAL Y BROWSER TESTING
────────────────────────────────────────────────────────────────────

Actúa también como el cliente que aprobó el diseño Tony-Tony Etapa 1.

No limites esta revisión a “la página no se rompe”.
Compara identidad, jerarquía, flujo visual, densidad, respuesta y calidad.

Viewports obligatorios:

- móvil: aproximadamente 390 × 844;
- tablet: aproximadamente 768 × 1024;
- desktop: aproximadamente 1440 × 900.

Prueba en navegador real o automatización de navegador real.

Revisa:

Público:

- portada;
- header;
- BrandLockup;
- favicon/metadata si es verificable;
- hero;
- anuncios;
- categorías;
- productos;
- detalle;
- modificadores;
- carrito;
- checkout;
- pedidos;
- cuenta;
- créditos;
- footer.

Panel:

- home operativo;
- cola de pedidos;
- detalle;
- POS;
- ticket;
- cocina;
- reparto;
- móvil courier.

Admin:

- catálogo;
- configuración;
- usuarios/roles;
- Storefront;
- editor;
- preview;
- códigos de descuento.

Evalúa desde:

- visitante;
- cliente;
- cajero;
- cocina;
- courier;
- supervisor;
- administrador.

Busca y corrige:

- problemas de responsive;
- contenido cortado;
- botones inaccesibles;
- modales imposibles de cerrar;
- navegación confusa;
- estados vacíos débiles;
- contraste insuficiente;
- scroll bloqueado;
- tamaño de touch targets;
- layout inconsistente;
- CTA ambiguas;
- fallbacks visuales pobres;
- fugas entre shell público/panel/admin;
- componentes genéricos que rompan la fidelidad visual;
- errores de diseño del flujo;
- errores visuales al cambiar de rol;
- errores de diseño al recargar;
- errores en tablet;
- problemas de foco y teclado;
- reduced motion.

Corrección visual:

- corrige todos los hallazgos P0 y P1;
- deja P2/P3 documentados si no justifican más cambios;
- no sacrifiques Storefront dinámico para copiar HTML estático;
- no hardcodees Tony-Tony en componentes donde debe existir token, config,
  branding, hero, layout o contenido dinámico;
- no elimines contratos, guards o accesibilidad sólo para parecerse al diseño.

Criterio mínimo:

- fidelidad visual global al diseño aprobado: 4/5 o más;
- ninguna pantalla pública principal con calificación menor a 4/5;
- ninguna pantalla operativa principal con calificación menor a 3/5;
- ningún P0/P1 visual o responsive pendiente;
- el diseño se debe sentir como el mismo producto aprobado, no como una
  plataforma genérica con colores parecidos.

────────────────────────────────────────────────────────────────────
12. REPORTES MARKDOWN OBLIGATORIOS
────────────────────────────────────────────────────────────────────

Genera o actualiza estos reportes:

1. GOALS.md

- decisiones finales;
- checklist real de implementación;
- estado factual;
- pruebas realizadas;
- riesgos restantes;
- no reescribir historia ni marcar falsos completados.

2. docs/implementation-completion-report.md

Debe incluir:

- alcance implementado;
- etapas;
- modelos/migraciones;
- endpoints;
- contratos;
- frontend;
- Storefront;
- roles;
- códigos;
- pruebas;
- commits;
- riesgos restantes.

3. docs/browser-e2e-validation-report.md

Debe incluir:

- entorno;
- versiones;
- datos de prueba;
- usuarios/roles;
- escenarios;
- resultados;
- screenshots/rutas de capturas si existen;
- errores encontrados;
- errores corregidos;
- errores diferidos;
- comandos de ejecución.

4. docs/tony-tony-visual-fidelity-review.md

Debe incluir:

- comparación contra el handoff;
- calificación 1–5 por pantalla;
- marca;
- layout;
- componentes;
- flujo visual;
- responsive;
- Storefront;
- público;
- panel;
- admin;
- hallazgos P0/P1/P2/P3;
- decisiones de diseño tomadas;
- elementos que siguen dinámicos por Storefront;
- limitaciones futuras reales.

5. docs/design-decisions.md

Debe explicar decisiones relevantes:

- público /panel /admin;
- crédito íntegro;
- pagos vs fulfillment;
- descuentos fijos web-only;
- Storefront dinámico;
- SVG;
- scheduling;
- preview;
- rutas;
- responsive;
- roles.

6. docs/release-candidate-plan.md

Debe terminar con checklist verificable de Release Candidate.

Los reportes no deben ser relleno.
Deben indicar hechos, comandos, resultados y decisiones reales.

────────────────────────────────────────────────────────────────────
13. COMMITS Y CIERRE
────────────────────────────────────────────────────────────────────

Crea commits lógicos sólo después de pruebas relevantes.

Sugerencia de agrupación, ajustable según diff real:

- feat(ordering): product configuration and all-credit checkout
- fix(orders): align payment, delivery and fulfillment lifecycle
- feat(discounts): add fixed web discount codes
- feat(storefront): complete dynamic media, layouts and publishing
- feat(operations): add profiles, courier recovery and admin registry
- test(e2e): validate integrated restaurant workflows
- docs(restaurant): add runbook, decisions and validation reports

No hagas commit de pruebas fallidas.
No escondas cambios sin commit.
No incluyas .env, secretos, dumps, credenciales ni datos reales.
No añadas el handoff temporal al repositorio si está marcado como ignorado.

────────────────────────────────────────────────────────────────────
14. DEFINICIÓN ESTRICTA DE TERMINADO
────────────────────────────────────────────────────────────────────

No declares este goal como completado si ocurre cualquiera de estas cosas:

- no se levantó stack integrado;
- no se ejecutaron migraciones reales en entorno aislado;
- no corrió check:api contra backend vivo;
- no corrieron E2E browser reales;
- no se probaron roles;
- no se probaron móvil/tablet/desktop;
- no se revisó diseño frente al handoff;
- queda un P0/P1 visual o funcional dentro de este alcance;
- se simuló una capacidad de backend en frontend;
- se mezclaron dinero y créditos;
- se permitió shipping en créditos;
- se permitió código de descuento fuera de web;
- se creó motor de promociones fuera de alcance;
- se verificó pago y se auto-completó fulfillment;
- se dejó SVG público inseguro;
- no existen reportes Markdown reales;
- quedan cambios no versionados relevantes.
- se crearon interfaces TypeScript manuales que duplican OpenAPI;
- se editó src/generated/openapi.ts a mano;
- check:api no corrió contra backend vivo;
- existe drift entre backend y frontend;
- se agregó navegación administrativa hardcodeada para recursos
  que debían venir de GET /api/v1/resources;
- recursos estándar del dominio siguen siendo accesibles sólo por URL
  sin una razón documentada;
- se reescribió CRUD genérico que ResourceTable/SchemaForm podía resolver;
- se creó un segundo sistema de capabilities o permisos en frontend;
- se dejó un espejo local de schema Storefront cuando backend ya expone
  el JSON Schema correspondiente;
- se modificaron permisos, ResourceDefinitions o bootstrap routes
  sin actualizar tests-guarda.

Si aparece un bloqueo genuino de infraestructura:

- intenta resolverlo dentro del entorno de prueba;
- documenta logs y causa exacta;
- no marques completo;
- termina como BLOCKED sólo si no existe alternativa segura.

────────────────────────────────────────────────────────────────────
15. FORMATO FINAL OBLIGATORIO
────────────────────────────────────────────────────────────────────

Antes de terminar, imprime exactamente:

GOAL EVIDENCE

- Estado final: COMPLETED / BLOCKED / INCOMPLETE
- Alcance completado:
- Etapas terminadas:
- Decisiones de producto aplicadas:
- Archivos principales modificados:
- Migraciones creadas o ajustadas:
- Endpoints/contratos agregados o modificados:
- Rutas frontend finales:
- Roles y capabilities verificados:
- Pruebas backend ejecutadas:
- Pruebas frontend ejecutadas:
- Pruebas de concurrencia ejecutadas:
- Pruebas browser/E2E ejecutadas:
- Viewports revisados:
- Hallazgos visuales P0/P1 corregidos:
- Hallazgos P2/P3 pendientes:
- Reportes Markdown generados:
- Commits creados:
- Estado de Git final:
- Riesgos fuera de alcance que permanecen:
- Recomendación concreta de siguiente paso:
- Contrato OpenAPI y check:api:
- ResourceDefinitions agregadas o ajustadas:
- Recursos descubiertos en navegación dinámica:
- Módulos especializados y por qué no usan CRUD genérico:
- Schemas Storefront expuestos/consumidos:
- Tests-guarda de catálogo ejecutados:
- Drift detectado y resuelto:
- Docker stack usado:
- Migraciones ejecutadas en entorno aislado:
- Chrome DevTools MCP usado:
- Navegador/instancia de prueba utilizada:
- Roles probados con navegador:
- Escenarios browser ejecutados:
- Console errors encontrados/corregidos:
- Network errors encontrados/corregidos:
- Screenshots/artefactos generados:
- Playwright/E2E ejecutado:
- check:api contra backend vivo:


────────────────────────────────────────────────────────────────────
16. RUMBO DE ACCIONES Y ANALISIS EN LA TOMA DE DESISICIONES 
────────────────────────────────────────────────────────────────────

IMPORTANTE:
- No inicies una nueva iniciativa fuera de este goal.
- No construir una plataforma bonita que conozca Tony-Tony de antemano.
- Construir una plataforma cuyos contratos permiten que Tony-Tony sea
la primera configuración real, mientras otro restaurante puede cambiar
recursos, permisos, navegación, formularios y Storefront sin reescribir
el frontend.
- No afirmes “validado visualmente”, “probado en navegador” ni
“integración completa” si no levantaste el stack Docker y no usaste
chrome-devtools MCP contra la aplicación real.