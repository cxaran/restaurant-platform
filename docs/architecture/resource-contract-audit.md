# Auditoría del contrato automático de recursos y flujo de permisos

> Documento de auditoría previo a **Vertical C1 (filtros declarativos)** y **C2
> (editores administrativos)**. No introduce código funcional. Toda afirmación se
> sustenta en archivos reales del repositorio. La verificación dinámica con datos se
> hace en el stack **E2E aislado**; el dev manual (`localhost:3000`) no se usa para
> crear datos.

## 1. Resumen ejecutivo

El núcleo es **genuinamente declarativo** para catálogo, listado (columnas), detalle,
formularios create/update, acciones y relaciones: el frontend consume capabilities y
no infiere endpoints, métodos ni `id` (usa `item_reference.placeholder`). La
seguridad es real: las capabilities son **guía de UI**, y el backend re-valida cada
mutación (permiso + supervivencia administrativa + invalidación de sesiones); un
cliente que forje una capability recibe 403 (probado).

Las dos brechas que el usuario percibe son reales y precisas:

1. **Filtros**: el contrato publica hoy **un solo control de filtro por campo** (un
   operador declarado en el schema de lista). El motor de query soporta solo
   `eq/gte/lte/in/isnull`. **No** existe un *constructor* campo→operador→valor, ni
   operadores de texto (`contains/starts_with/ends_with/ne`) ni de lista
   (`contains_any/contains_all`). users/roles publican únicamente `q` + `is_active`.
2. **Editores administrativos**: **sí existen y son navegables** (enlaces `Editar`,
   `Roles`, `Permisos` por fila + ruta `/resources/[r]/[id]/[relation]` + renderer de
   catálogo agrupado). La brecha es de **integración/claridad UX** (no hay subnav
   tabs en la pantalla de edición; el editor de permisos es funcional pero austero),
   no de inexistencia.

Conclusión: C1 requiere **extensión de backend** (operadores + contrato de filtros).
C2 es mayormente **mejora de frontend** sobre contratos ya publicados.

## 2. Flujo backend → OpenAPI → frontend (nombres reales)

```text
ResourceDefinition  (backend/app/resources/registry.py: RESOURCE_REGISTRY)
  ├─ ResourceQuery/ListQueryContract  (query/resource.py, query/contracts.py)
  │     └─ CompiledQueryPlan          (query/plans.py)  ← filter_parameters, sort, search
  └─ projection                       (resources/projection.py: _build_capability)
        → ResourceCapability          (schemas/capabilities.py)
GET /api/v1/resources                 (api/v1/resources.py)  ← filtra por read_permission
  → app.openapi()                     (api/main.py)
  → frontend/src/generated/openapi.ts (scripts/generate-openapi.mjs)
  → contracts.ts (aliases type-only)  (core/api/contracts.ts)
  → getResourceCatalog / getResourceCapability  (core/resources/capabilities-client.ts)
  → ResourcePage                      (app/(platform)/resources/[resourceName]/page.tsx)
        ├─ ResourceTable + ResourceListControls + ResourcePagination
        ├─ ResourceCreateForm / ResourceUpdateForm   (forms.create/forms.update)
        ├─ ResourceRowActions + ResourceActionConfirmDialog  (actions)
        ├─ RelationEditor (ruta [id]/[relationName])  (relations)
        └─ GroupedCatalog (view grouped_catalog)
```

Fuente de verdad por recurso: el `ResourceDefinition` en `registry.py`. La metadata
UI de **campos** (label/widget/visibilidad/filtro) vive en los **schemas Pydantic**
(`schemas/role.py`, `schemas/user_admin.py`) vía `json_schema_extra={"ui": {...}}`;
las capacidades **técnicas** (sortable/searchable/operadores) vienen del
`CompiledQueryPlan`. La projection cruza ambas (`resources/projection.py`).

## 3. Inventario de capabilities por recurso

| Recurso | Listado | Detail | Create | Update | Actions | Relaciones | Filtros | Renderer | Permiso lectura |
|---|---|---|---|---|---|---|---|---|---|
| **users** | sí (`UserAdminListItem`) | `GET /users/{id}` | sí (`UserAdminCreate`) | sí (`UserAdminUpdate`) | activate, deactivate, revoke_sessions, delete | `roles` (PUT `/users/{id}/roles`) | `q` + `is_active` (eq/select) | TABLE | `users:read` |
| **roles** | sí (`RoleListItem`) | `GET /roles/{id}` | sí (`RoleCreate`) | sí (`RoleUpdate`) | activate, deactivate, delete | `permissions` (PUT `/roles/{id}/permissions`) | `q` + `is_active` (eq/select) | TABLE | `roles:read` |
| **permissions** | no | no | no | no | — | — | no | GROUPED_CATALOG | `permissions:read` |

Notas verificadas en `registry.py`/`projection.py`:
- `actions` activate/deactivate **reutilizan** `PATCH /{id}` con `fixed_body`
  (`{is_active}`) — sin endpoints nuevos. delete/deactivate son **baja lógica**.
- `relations` declaran `selection_url`, `options.url`, `mutation_url`,
  `request_field`, `selection_field`. permissions usa `options.type =
  grouped_catalog`; roles usa `options.type = list`.
- `item_reference = {field:"id", placeholder:"id", type:"uuid"}` para users/roles.

## 4. Trazas (estructura de contrato, valores redactados)

Capability real que recibe un admin con permisos completos para **roles** (forma,
no valores), confirmada en `projection.py` + `schemas/capabilities.py`:

```jsonc
{
  "name": "roles", "label": "Roles", "view": "table",
  "item_reference": { "field": "id", "placeholder": "id", "type": "uuid" },
  "detail": { "method": "GET", "url_template": "/api/v1/roles/{id}" },
  "list": {
    "fields": [ { "name": "name", "label": "Nombre", "type": "string",
                  "sortable": true, "searchable": true, "filter_operators": ["eq"] },
                { "name": "is_active", "label": "Activo", "type": "boolean",
                  "filter_operators": ["eq"] }, /* ... */ ],
    "filters": [ { "field": "is_active", "parameter": "is_active", "operator": "eq",
                   "widget": "select", "options": [ {"value":"true",...} ] } ],
    "pagination": { "default_limit": 20, "max_limit": 100 },
    "search": { "enabled": true }, "sort": { "default_sort": "name", ... }
  },
  "forms": { "create": {...}, "update": { "method":"PATCH",
             "url_template":"/api/v1/roles/{id}", "fields":[name,description,is_active] } },
  "actions": [ { "name":"deactivate", "method":"PATCH", "url_template":"/api/v1/roles/{id}",
                 "request": {"fixed_body":{"is_active":false}}, "confirmation": {...} }, ... ],
  "relations": [ { "name":"permissions", "selection_url":"/api/v1/roles/{id}/permissions",
                   "mutation_url":"/api/v1/roles/{id}/permissions", "request_field":"permissions",
                   "options": {"type":"grouped_catalog","url":"/api/v1/permissions",
                               "value_field":"access","label_field":"label"} } ]
}
```

- **users**: idéntica estructura; `relations[roles]` con `options.type=list`,
  `options.url=/api/v1/roles`, `request_field=role_ids`.
- **permissions**: `view=grouped_catalog`, **sin** list/forms/actions/relations;
  `GET /api/v1/permissions` devuelve `[{name,label,permissions:[{access,label,description}]}]`.
- **Actor sin permiso**: `GET /api/v1/resources` omite el recurso (no `allowed:false`);
  `GET /api/v1/resources/{name}` devuelve **404** igual para inexistente y oculto.

## 5. Matriz de permisos y seguridad

Flujo efectivo (`auth/auth_dependencies.build_current_user` →
`security/admin_survival` → `security/session_invalidation`):
`usuario activo → UserRole (rol activo) → RoleAccess activo → permisos → capability
visible → guard backend (`.requiere`) → mutación`.

| Operación | Capability visible | Permiso efectivo | Guard backend | Riesgo si UI manipulada | Resultado |
|---|---|---|---|---|---|
| Listar usuarios | list users | `users:read` | `UserPermissions.READ.requiere` | ninguno | 403 sin permiso |
| Crear usuario | forms.create | `users:create` | `.requiere` | ninguno | 403 |
| Editar usuario | forms.update | `users:update` | `.requiere` + email→invalidación | ninguno | 403 / 422 |
| Administrar roles de usuario | relation `roles` | `users:manage_roles` | `.requiere` + admin_survival + invalidación | ninguno | 403 / 409 `admin_coverage_required` |
| Crear rol | forms.create | `roles:create` | `.requiere` | ninguno | 403 |
| Editar rol | forms.update | `roles:update` | `.requiere` | ninguno | 403 |
| Administrar permisos de rol | relation `permissions` | `roles:manage_permissions` | `.requiere` + admin_survival + invalidación de miembros | ninguno | 403 / 409 |
| Revocar sesiones | action revoke_sessions | `users:revoke_sessions` | `.requiere` | ninguno | 403 |
| Desactivar usuario | action deactivate | `users:update` | `.requiere` + admin_survival | bloqueo último admin | 409 `admin_coverage_required` |
| Eliminar rol | action delete | `roles:delete` | `.requiere` + admin_survival + protección system_admin_role | no borra rol fundacional | 409 |

- `admin_survival.assert_admin_survival` se ejecuta **en la misma transacción** tras
  el flush, antes del commit (`api/resource_actions.commit_with_admin_survival`).
- `session_invalidation` rota `User.token` del/los afectados dentro de la transacción.
- El frontend **no es frontera de seguridad**: pruebas `test_resources_capabilities`
  y `test_admin_relation_mutations` confirman 403/409 ante peticiones forjadas.

## 6. Consumo en frontend

| Capability | Consumidor frontend | Visible en UI | Usable e2e | Hardcode/inferencia | Acción |
|---|---|---|---|---|---|
| catalog/list | `ResourcePage` + `ResourceTable` | sí | sí | no | — |
| forms.create | `ResourceCreateForm` (`/new`) | sí (botón "Nuevo") | sí | no | — |
| forms.update | `ResourceUpdateForm` (`/[id]/edit`) | sí (enlace "Editar") | sí | no | — |
| actions | `ResourceRowActions` + dialog | sí (botones por fila) | sí | no | — |
| relations | `RelationEditor` (`/[id]/[relationName]`) | sí (enlaces "Roles"/"Permisos") | sí | no | mejorar navegación (tabs) |
| grouped_catalog | `GroupedCatalog` | sí | sí (solo lectura) | no | — |
| **list.filters** | `ResourceListControls` | sí (solo `is_active` + `q`) | parcial | no, pero **contrato limita a 1 operador/campo** | **extender (C1)** |

Server-side: catálogo, detalle, listado y opciones se cargan con cookie reenviada y
`no-store` (`server-client.ts`). Mutaciones: `browserApi` relativo `/api` con
`credentials:"include"`. `BACKEND_INTERNAL_URL` solo en server. URLs se resuelven con
`fillPlaceholder(item_reference.placeholder)`. Manejo de 401→/login, 403→ruta segura,
404→notFound, 409 `admin_coverage_required`→mensaje de negocio, 422→campos, 429→seguro.

## 7. Estado real de filtros y brecha técnica

Motor de query (`query/operators.py`) — operadores **reales** y su parámetro público:

| Operador | Parámetro | Tipos por defecto |
|---|---|---|
| `eq` | `{campo}` | str, bool, uuid, enum, int, decimal |
| `gte` | `{campo}_gte` | int, decimal, date, datetime |
| `lte` | `{campo}_lte` | int, decimal, date, datetime |
| `in` | `{campo}_in` | uuid, enum |
| `isnull` | `{campo}_isnull` | opt-in explícito |
| `range` | (atajo → `gte`+`lte`) | — |
| `q` (search) | `q` (ILIKE global multi-campo) | search_fields |

**El `parameter_name` ya se publica** (`CompiledFilterParameter` →
`ResourceFilterCapability.parameter`): el frontend **no inventa sufijos** hoy.

Respuestas a las preguntas del contrato:

1. ¿Múltiples operadores por campo? El **plan** los tiene (`filter_parameters`), pero
   la **capability publica un solo filtro por campo** (declarado en `ui.filter`). → **brecha de contrato**.
2. ¿contains/starts_with/ends_with/ne? **No** (solo `eq` exacto; "contiene" solo vía `q` global). → **brecha de motor**.
3. ¿Rangos con nombres explícitos? Sí: `{campo}_gte`/`{campo}_lte` publicados, pero **no agrupados** como un operador `between`. → extensión menor de contrato.
4. ¿Serialización de listas declarada? `in` → `{campo}_in` (repeat). No hay csv/json declarado. → menor.
5. ¿contains_member/any/all? **No** (solo `in`). → brecha de motor.
6. ¿Boolean tri-state? Hoy `is_active` es `select` con true/false (sin "todos" explícito; ausencia = todos). → menor (UI).
7. ¿null/not null? `isnull` existe pero **no se publica** en users/roles. → opt-in.
8. ¿date vs datetime + formato? Tipos distinguidos (`FieldValueType.DATE/DATETIME`); formato no declarado explícitamente. → menor.
9. ¿Limitar operadores por permiso/recurso? La capability se filtra por `read_permission`; no hay granularidad por-operador. → suficiente.
10. ¿El compiler valida solo filtros declarados? **Sí** — allowlist estricta, `QueryParameterError`→422 (`query/compiler.py`, `query/validation.py`). → seguro.

| Recurso | Campo | Tipo | Parámetros hoy | Operadores hoy | UI actual | Brecha para builder |
|---|---|---|---|---|---|---|
| users | name/last_name | string | `q` (search) | search | en `q` | falta `contains/starts_with/...` por campo |
| users | email | email | `q` (search) | search | en `q` | idem |
| users | is_active | boolean | `is_active` | eq | select | tri-state explícito |
| users | created_at | datetime | — | (no publicado) | — | publicar `gte/lte`+widget date-range |
| roles | name | string | `q` | search | en `q` | idem texto |
| roles | is_active | boolean | `is_active` | eq | select | tri-state |
| roles | created_at | datetime | — | — | — | publicar rango fecha |
| permissions | — | — | — | — | grouped_catalog | sin filtros de tabla |

## 8. Estado real de editores users/roles/permisos

| Flujo | Backend | Capability | Ruta frontend | Entrada visible | Usable | Problema real |
|---|---|---|---|---|---|---|
| Editar datos usuario | sí | forms.update | `/users/[id]/edit` | enlace "Editar" en fila | sí | — |
| Ver/asignar roles de usuario | sí | relation `roles` | `/users/[id]/roles` | enlace "Roles" en fila | sí | navegación poco prominente |
| Editar datos rol | sí | forms.update | `/roles/[id]/edit` | enlace "Editar" | sí | — |
| Ver permisos asignados | sí | `GET /roles/{id}/permissions` | `/roles/[id]/permissions` | enlace "Permisos" | sí | editor austero |
| Ver permisos disponibles agrupados | sí | `GET /permissions` (options) | (en el editor) | sí | sí | UX mejorable (búsqueda, descripciones) |
| Asignar/quitar permisos | sí | relation `permissions` (PUT) | `/roles/[id]/permissions` | sí | sí | falta contador/búsqueda/cancelar claro |

`RelationEditor` ya: carga selección desde `selection_url`, opciones desde
`options.url`, agrupa cuando `options.type=grouped_catalog`, envía reemplazo atómico,
maneja `admin_coverage_required`. **C2 es pulido + navegación (tabs en edición)**, no
construcción desde cero.

## 9. Duplicaciones, hardcodes e inferencias detectadas

- **No** se detectó hardcode de `resourceName`, sufijos de operador, endpoints ni
  `id` en el frontend de recursos. Las URLs se resuelven por `item_reference`.
- Metadata UI duplicada de forma controlada: `XListItem` redeclara campos con `ui`
  (esperado por convención). No es deuda crítica.
- **Inferencia residual**: ninguna en el frontend de recursos. La única "inferencia"
  está en backend (`default_operators` por tipo), que es la fuente de verdad correcta.

## 10. Riesgos técnicos

- Añadir operadores de texto/lista al motor de query toca `compiler`/`executor`/
  `operators.py`/`plans.py` (núcleo con suite canónica densa). Riesgo medio: requiere
  pruebas de seguridad (allowlist, longitud, ILIKE escaping ya existe).
- El contrato de filtros nuevo (múltiples operadores/campo) cambia OpenAPI → regen +
  consumidores. Compatible si se añade una sección nueva sin romper `list.filters`.
- Fechas: `date` vs `datetime` y zona horaria — definir semántica inclusiva/exclusiva
  y formato publicado para evitar conversión UTC accidental.

## 11. Extensión mínima propuesta para C1

**Backend (motor):** añadir operadores reales con sufijo público explícito:
`ne` (`_ne`), `contains` (`_contains`, ILIKE `%v%`), `starts_with` (`_startswith`),
`ends_with` (`_endswith`) para texto; mantener `in` para listas (evaluar
`contains_any`/`contains_all` solo si hay un campo de colección real — hoy **no** hay,
así que se difiere con pruebas de contrato/fixtures, no UI fingida).

**Backend (contrato):** nueva sección por recurso, p. ej.
`list.filterable_fields: [{ key, label, value_type, operators: [{ key, label,
value_shape: "single"|"range", parameter_name | parameters:{from,to}, widget,
options? , serialization? }] }]`. Se **añade** junto a `list.filters` (compat) o se
reemplaza con migración del consumidor. El `parameter_name` lo sigue dando
`CompiledFilterParameter` (sin inferencia en frontend).

**Recursos:** publicar para users/roles: texto (`name/last_name/email`) con
`contains/starts_with/eq`; `is_active` boolean tri-state; `created_at` rango
(`gte/lte`) como `between` declarado. Sin migraciones (los campos ya existen).

**Frontend:** `ResourceFilterControls` (builder campo→operador→valor, múltiple,
URL-driven, offset→0, preserva `q/sort/limit` y params ajenos) + helpers puros
testeables. Sin React Query, sin storage, sin `replace+refresh` juntos.

**C1 sin tocar backend** solo permitiría un builder limitado a `eq/gte/lte/in/isnull`
y `q` (sin "contiene" por campo). Para cumplir el wishlist de texto, **el backend
debe extenderse**.

## 12. Orden propuesto C1/C2

```text
C1.1  Extend declarative resource filter capabilities and query operators  (backend)
C1.2  Add capability-driven resource filter controls                       (frontend)
C1.3  Cover declarative resource filters in E2E                            (e2e aislado)
C2.1  Expose capability-driven relation editors in resource edit UI (tabs/subnav)
C2.2  Cover administrative role and permission editors in E2E
```

## 13. Decisiones requeridas antes de escribir código

1. **Operadores de lista** (`contains_any/contains_all`): hoy **no hay** campo de
   colección real en users/roles. ¿Implementar solo contrato + pruebas (sin UI real)
   o diferir hasta que exista un recurso con colección? (Recomiendo diferir.)
2. **`created_at` como filtro**: ¿exponer `created_at` (gte/lte/between) en users y
   roles? Es un campo público y seguro; habilita el widget de rango de fecha real.
3. **Semántica de rango de fecha**: ¿inclusiva en ambos extremos? ¿`date` como fecha
   local literal (sin conversión UTC)? Propongo inclusiva + local.
4. **Compatibilidad del contrato**: ¿añadir `filterable_fields` **junto a**
   `list.filters` (no romper) o reemplazar y migrar el consumidor en el mismo commit?
   Propongo añadir y migrar el consumidor (un solo consumidor: `ResourceListControls`).
5. **Alcance C2**: ¿la mejora de editores es navegación (tabs en `/[id]/edit` con
   pestañas Datos/Roles o Datos/Permisos) + pulido del editor de permisos (búsqueda,
   contador, cancelar), sin cambiar contratos? Propongo sí, sin tocar backend.

---

*Verificación: análisis estático sobre los archivos citados + observaciones de Chrome
MCP previas (dashboard, tabla de recursos, editor de relaciones, wizard). La captura
de JSON autenticado en vivo se realizará en el stack E2E aislado al iniciar C1, no en
dev. Suites a la fecha: backend canonical 273 (0 fallos); frontend canonical verde;
E2E `passed`.*
