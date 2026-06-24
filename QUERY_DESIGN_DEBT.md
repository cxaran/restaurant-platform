# Query Engine Design Debt

Deuda técnica documentada del motor de query actual (`backend/app/query/`).
Cada entrada describe el estado actual, el problema, el riesgo, la decisión
objetivo, la fase prevista y el criterio de aceptación.

---

## 1. Semántica de `sort_fields` vacío vs ausente

### Estado actual

`QueryOptions.sort_fields` es una tupla con default `()`.  El factory
interpreta `()` como "usar todos los campos consultables disponibles"
(`sort_columns.update(all_columns)`).  No existe forma de distinguir
"no configurado" de "prohibir sort del cliente".

### Problema

`sort_fields=()` significaría dos cosas distintos:

- **Modo heredado/derivado:** permitir sort en los campos consultables.
- **Modo estricto:** no exponer campos de sort al cliente.

Hoy ambos casos son indistinguibles porque el dataclass usa `()` como default.

### Riesgo

Un recurso que no configure `sort_fields` expone accidentalmente todos los
campos consultables como ordenables, incluso si el diseñador no lo pretendía.

### Decisión objetivo

```text
sort_fields=None
    Modo heredado o derivado: permitir sort en los campos consultables.

sort_fields=()
    Modo estricto: no exponer campos de sort al cliente.

sort_fields=("created_at", "name")
    Allowlist explícita.
```

Requiere cambiar el tipo de `sort_fields` a `tuple[str, ...] | None` con
default `None`.

### Fase prevista

Fase 2 — Refactorización de `QueryPolicy`.

### Criterio de aceptación

- `QueryOptions(sort_fields=None)` permite sort en todos los campos consultables.
- `QueryOptions(sort_fields=())` genera un schema sin campos de sort públicos
  (el desempate por PK sigue activo internamente).
- `QueryOptions(sort_fields=("name",))` permite sort solo por `name`.
- Tests cubren los tres casos.

---

## 2. PK pública vs desempate interno

### Estado actual

El factory agrega la PK a `sort_columns` cuando está en el schema público
(`resource_schema.model_fields`).  El compiler usa `sort_columns` tanto para
validar los campos que el cliente puede solicitar como para añadir el
desempate interno.

### Problema

Si `id` está en `sort_columns`, el cliente puede pedir `sort=id` aunque el
diseñador no lo haya configurado explícitamente.  La PK se añade para
garantizar orden estable, pero eso la expone como campo de sort público.

### Riesgo

Un recurso puede exponer accidentalmente la PK como campo ordenable por el
cliente, incluso cuando el diseñador no lo pretendía.

### Decisión objetivo

Separar dos conceptos:

```text
public_sort_columns
    Allowlist real del cliente.  Solo estos campos pueden aparecer en sort.

tie_breaker_columns
    Primary key u otra identidad estable, añadida internamente por el
    compiler para garantizar orden determinista.  No es visible para el
    cliente ni configurable vía sort.
```

El compiler debe:

1. Validar que los campos solicitados por el cliente estén en
   `public_sort_columns`.
2. Añadir `tie_breaker_columns` al `ORDER BY` después de los campos del
   cliente, sin exponerlas como opciones de sort.

### Fase prevista

Fase 2 — Refactorización de `QueryPolicy`.

### Criterio de aceptación

- `sort_columns` del compiler se divide en `public_sort_columns` y
  `tie_breaker_columns`.
- Un cliente que pida `sort=id` recibe 422 si `id` no está en
  `public_sort_columns`, incluso si `id` es la PK usada como desempate.
- El `ORDER BY` siempre incluye la PK como desempate, independientemente de
  si es pública o no.
- Tests verifican que la PK no aparece como campo ordenable cuando no está
  en la allowlist pública.

---

## 3. Taxonomía de errores de `default_sort`

### Estado actual

`default_sort="missing"` produce `invalid_schema_column_mapping` porque
`_resolve_column` falla al intentar resolver la columna ORM antes de que
`_validate_default_sort` pueda validarla contra `sort_columns`.

### Problema

El error no refleja la causa raíz: el problema no es que el mapping de
columna falle, sino que la configuración pide ordenar por un campo que no
existe en el contrato público.

### Riesgo

Mensajes de error confusos para el desarrollador que configura el recurso.

### Decisión objetivo

```text
default_sort mal formado ("-", "a,,b", "a,a")
    → invalid_default_sort

default_sort apunta a campo no permitido como sort
    → invalid_default_sort

default_sort apunta a campo que no existe en schema público
    → invalid_default_sort

Campo existe en schema, pero no tiene columna ORM ni binding válido
    → invalid_schema_column_mapping

Binding configurado, pero no es una expresión SQLAlchemy válida
    → invalid_column_binding
```

### Fase prevista

Fase 2 — Refactorización de `QueryPolicy`.

### Criterio de aceptación

- `default_sort="missing"` produce `invalid_default_sort`, no
  `invalid_schema_column_mapping`.
- `default_sort="name,name"` produce `invalid_default_sort` (duplicado).
- `default_sort="-"` produce `invalid_default_sort` (campo vacío).
- Tests cubren cada caso con el error code esperado.

---

## 4. `str_strip_whitespace` en `QuerySchema`

### Estado actual

`QuerySchema` tiene `model_config = ConfigDict(str_strip_whitespace=True)`.
Esto aplica `strip()` a todos los campos de tipo `str` antes de la validación.

### Problema

No está claro si este comportamiento debe afectar:

- Solo los campos definidos como texto humano (`name`, `email`, `q`).
- También los campos técnicos como `sort` (`" -created_at "` → `"-created_at"`).
- También los campos de filtro de texto (`name=" admin "` → `"admin"`).

Hoy afecta a todos los strings por igual, lo que puede ser correcto o no
dependiendo del caso.

### Riesgo

- Si se aplica a `sort`, un cliente que envíe `" -created_at "` con espacios
  accidentales obtiene un sort válido en vez de un error, lo que puede
  enmascarar bugs del cliente.
- Si se aplica a filtros de texto, `" admin "` se convierte en `"admin"`,
  lo que puede ser deseado o no dependiendo del recurso.

### Decisión objetivo

Confirmar explícitamente el comportamiento esperado:

```text
sort:
    Debe aplicar strip (el espacio antes/después es ruido del cliente).

q (búsqueda):
    Debe aplicar strip (el espacio antes/después es ruido del cliente).

Filtros de texto humano (name, email, etc.):
    Debe aplicar strip (el espacio antes/después es ruido del usuario).

Filtros técnicos (códigos, identificadores):
    No debe aplicar strip (el espacio puede ser significativo).
```

Si se requiere control por campo, mover `str_strip_whitespace` de la
config global a una configuración por campo o por tipo.

### Fase prevista

Fase 2 — Refactorización de `QueryPolicy`.

### Criterio de aceptación

- Documentar el comportamiento esperado para cada tipo de campo.
- Si se requiere control por campo, implementarlo en la factory.
- Tests verifican que `sort` con espacios se normaliza, que `q` con
  espacios se normaliza, y que los filtros de texto se comportan según
  la convención.
