"""Descriptor declarativo que agrupa modelo, schema y opciones de un recurso."""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from backend.app.query.executor import paginate
from backend.app.query.factory import make_offset_query_schema
from backend.app.query.options import QueryOptions
from backend.app.query.schema import OffsetQuerySchema
from backend.app.schemas.pagination import OffsetPage

TItem = TypeVar("TItem", bound=BaseModel)


class ResourceQuery(Generic[TItem]):
    """Une un modelo ORM con su schema de lectura y genera (una sola vez) el
    ``QuerySchema`` de filtros/orden/paginación.

    Se define a nivel de módulo y se reutiliza en el endpoint::

        USERS = ResourceQuery(
            name="UserQuery",
            model=User,
            schema=UserRead,
            options=QueryOptions(search_fields=("name", "email")),
        )

        @router.get("", response_model=OffsetPage[UserRead])
        def list_users(
            session: SessionDep,
            query: Annotated[USERS.Query, Query()],
            _: UserPermissions.READ.requiere,
        ) -> OffsetPage[UserRead]:
            return USERS.paginate(session, query)
    """

    def __init__(
        self,
        *,
        name: str,
        model: type[Any],
        schema: type[TItem],
        options: QueryOptions | None = None,
    ) -> None:
        self.model = model
        self.schema = schema
        self.Query: type[OffsetQuerySchema] = make_offset_query_schema(
            name=name,
            resource_schema=schema,
            orm_model=model,
            options=options,
        )

    def paginate(
        self,
        session: Session,
        query: OffsetQuerySchema,
        *,
        stmt: Select[Any] | None = None,
    ) -> OffsetPage[TItem]:
        """Pagina el recurso. Por defecto consulta ``select(model)``; se puede
        pasar un ``stmt`` propio (p. ej. con joins o filtros de tenant)."""
        statement = stmt if stmt is not None else select(self.model)
        return paginate(session, stmt=statement, query=query, item_schema=self.schema)
