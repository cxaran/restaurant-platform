"""Fase 2 — Paso 4: tres roles de orden (public/orderable/tie_breakers).

Cubre la diferencia legacy (options: PK solicitable) vs nativo (policy: PK interna),
que default_order puede usar campos orderable no públicos, el desempate por clave
lógica (sin duplicar la PK), y que la policy reemplaza cualquier ORDER BY del stmt
base.
"""

import unittest

from pydantic import BaseModel, ConfigDict
from sqlalchemy import Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from backend.app.query import ListQueryContract, QueryOptions
from backend.app.query.compiler import apply_query_schema
from backend.app.query.validation import QueryParameterError


class Base(DeclarativeBase):
    pass


class Widget(Base):
    __tablename__ = "widget"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)


class WidgetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: int


def _sql(stmt: object) -> str:
    return str(stmt.compile())  # type: ignore[attr-defined]


def _order_by(sql: str) -> str:
    return sql.upper().split("ORDER BY", 1)[1] if "ORDER BY" in sql.upper() else ""


class LegacyVsNativePkTest(unittest.TestCase):
    """Misma config de fields; la PK no está en sort_fields. Legacy la deja
    solicitable; nativo la trata como interna."""

    OPTIONS = QueryOptions(filter_fields=("name",), sort_fields=("name",), default_sort="name")

    def test_legacy_options_allows_sorting_by_pk(self) -> None:
        contract = ListQueryContract(
            name="LegacyPk", model=Widget, schema=WidgetRead, options=self.OPTIONS
        )
        # id no está en sort_fields pero el camino legacy lo añade al público.
        stmt = apply_query_schema(
            stmt=select(Widget), query=contract.Query(sort="id"), plan=contract.plan  # type: ignore[arg-type]
        )
        self.assertIn("WIDGET.ID", _order_by(_sql(stmt)))

    def test_native_policy_treats_pk_as_internal(self) -> None:
        policy = self.OPTIONS.to_policy(WidgetRead, Widget)
        contract = ListQueryContract(name="NativePk", model=Widget, schema=WidgetRead, policy=policy)
        # sort=id es rechazado (la PK no es pública en el camino nativo)...
        with self.assertRaises(QueryParameterError):
            apply_query_schema(
                stmt=select(Widget), query=contract.Query(sort="id"), plan=contract.plan  # type: ignore[arg-type]
            )
        # ...pero sigue presente como tie-breaker al ordenar por un campo público.
        stmt = apply_query_schema(
            stmt=select(Widget), query=contract.Query(sort="name"), plan=contract.plan  # type: ignore[arg-type]
        )
        self.assertIn("WIDGET.ID", _order_by(_sql(stmt)))


class OrderableDefaultTest(unittest.TestCase):
    """default_order puede usar un campo orderable que NO es públicamente
    solicitable."""

    def setUp(self) -> None:
        # price es filtrable (orderable) pero no está en sort_fields (no público).
        options = QueryOptions(
            filter_fields=("name", "price"), sort_fields=("name",), default_sort="-price"
        )
        policy = options.to_policy(WidgetRead, Widget)
        self.contract = ListQueryContract(
            name="OrderableDefault", model=Widget, schema=WidgetRead, policy=policy
        )

    def test_default_order_uses_non_public_orderable_field(self) -> None:
        self.assertEqual(self.contract.Query().sort, "-price")  # type: ignore[call-arg]
        stmt = apply_query_schema(
            stmt=select(Widget), query=self.contract.Query(sort="-price"), plan=self.contract.plan  # type: ignore[arg-type]
        )
        self.assertIn("WIDGET.PRICE DESC", _order_by(_sql(stmt)))

    def test_client_cannot_sort_by_non_public_field(self) -> None:
        with self.assertRaises(QueryParameterError):
            apply_query_schema(
                stmt=select(Widget), query=self.contract.Query(sort="price"), plan=self.contract.plan  # type: ignore[arg-type]
            )


class TieBreakerDedupTest(unittest.TestCase):
    def test_pk_not_duplicated_when_requested(self) -> None:
        options = QueryOptions(sort_fields=("id", "name"), default_sort="name")
        contract = ListQueryContract(name="Dedup", model=Widget, schema=WidgetRead, options=options)
        stmt = apply_query_schema(
            stmt=select(Widget), query=contract.Query(sort="id"), plan=contract.plan  # type: ignore[arg-type]
        )
        # id pedido explícitamente → no se añade otra vez como tie-breaker.
        self.assertEqual(_order_by(_sql(stmt)).count("WIDGET.ID"), 1)


class OrderByReplacementTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all(
                [
                    Widget(id=1, name="b", price=30),
                    Widget(id=2, name="a", price=10),
                    Widget(id=3, name="c", price=20),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)

    def test_policy_replaces_base_stmt_order_by(self) -> None:
        options = QueryOptions(filter_fields=("name", "price"), sort_fields=("price",), default_sort="price")
        contract = ListQueryContract(name="Replace", model=Widget, schema=WidgetRead, options=options)
        base = select(Widget).order_by(Widget.name.desc())  # orden propio del stmt base
        stmt = apply_query_schema(
            stmt=base, query=contract.Query(sort="price"), plan=contract.plan  # type: ignore[arg-type]
        )
        order = _order_by(_sql(stmt))
        self.assertIn("WIDGET.PRICE", order)
        self.assertNotIn("WIDGET.NAME", order)  # el ORDER BY del base fue reemplazado

    def test_replacement_yields_price_order_at_runtime(self) -> None:
        options = QueryOptions(filter_fields=("price",), sort_fields=("price",), default_sort="price")
        contract = ListQueryContract(name="Replace2", model=Widget, schema=WidgetRead, options=options)
        base = select(Widget).order_by(Widget.name.desc())
        with Session(self.engine) as session:
            page = contract.paginate(session, contract.Query(sort="price"), stmt=base)  # type: ignore[arg-type]
        self.assertEqual([w.price for w in page.items], [10, 20, 30])


if __name__ == "__main__":
    unittest.main()
