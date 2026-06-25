"""``ListQueryContract``: abstracción principal de listado (Fase 2, Paso 3).

Une un modelo ORM, su schema de salida y el plan compilado (schema de query +
``CompiledQueryPlan``). Acepta **exactamente una** fuente de configuración —
``options`` o ``policy``— y siempre pasa el plan explícito al compiler/executor
(no depende del fallback a ``__query_*__``).

No crea rutas ni impone CRUD: la ruta manual sigue siendo dueña de URL, método,
dependencias, permisos, tenant/scopes, joins y ``stmt`` base. ``paginate`` usa
``select(model)`` solo como default.
"""

from dataclasses import replace
from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from backend.app.query.count_strategies import CountStrategy
from backend.app.query.executor import paginate
from backend.app.query.factory import compile_list_query, compile_list_query_from_policy
from backend.app.query.identity import IdentitySpec
from backend.app.query.options import QueryOptions
from backend.app.query.plans import CompiledQueryPlan
from backend.app.query.policies import QueryPolicy
from backend.app.query.schema import OffsetQuerySchema
from backend.app.query.search import SearchStrategy
from backend.app.query.serializers import RowSerializer
from backend.app.query.validation import fail_config
from backend.app.schemas.pagination import OffsetPage

TItem = TypeVar("TItem", bound=BaseModel)


class ListQueryContract(Generic[TItem]):
    def __init__(
        self,
        *,
        name: str,
        model: type[Any],
        schema: type[TItem],
        options: QueryOptions | None = None,
        policy: QueryPolicy | None = None,
        count_strategy: CountStrategy | None = None,
        row_serializer: RowSerializer | None = None,
        search_strategy: SearchStrategy | None = None,
        identity: IdentitySpec | None = None,
    ) -> None:
        if (options is None) == (policy is None):
            fail_config(
                "ambiguous_query_config",
                "Indique exactamente una fuente de configuración: options o policy, nunca ambas.",
            )

        if options is not None:
            compiled = compile_list_query(
                name=name, resource_schema=schema, orm_model=model, options=options
            )
        else:
            assert policy is not None  # garantizado por el guard de fuente única
            compiled = compile_list_query_from_policy(name=name, orm_model=model, policy=policy)

        plan = compiled.plan
        # search_strategy/identity son compile-time: se incrustan en el plan.
        if search_strategy is not None or identity is not None:
            plan = replace(
                plan,
                search_strategy=search_strategy if search_strategy is not None else plan.search_strategy,
                identity=identity if identity is not None else plan.identity,
            )

        self.model = model
        self.schema = schema
        self.Query: type[OffsetQuerySchema] = compiled.schema
        self.plan: CompiledQueryPlan = plan
        # count_strategy/row_serializer son de ejecución: se pasan a paginate.
        self.count_strategy = count_strategy
        self.row_serializer = row_serializer

    def paginate(
        self,
        session: Session,
        query: OffsetQuerySchema,
        *,
        stmt: Select[Any] | None = None,
    ) -> OffsetPage[TItem]:
        statement = stmt if stmt is not None else select(self.model)
        return paginate(
            session,
            stmt=statement,
            query=query,
            item_schema=self.schema,
            plan=self.plan,
            count_strategy=self.count_strategy,
            row_serializer=self.row_serializer,
        )
