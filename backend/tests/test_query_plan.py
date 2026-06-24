"""Fase 2 — Paso 2: CompiledQueryPlan, CompiledListQuery y compile_list_query.

Demuestra la equivalencia entre la ruta heredada (metadata en __query_*__) y la
nueva (plan explícito): mismos model_fields, misma metadata, mismo SQL compilado
(incluido dialecto PostgreSQL) y mismo resultado de paginación. make_offset_query_schema
conserva su retorno histórico; plan=None mantiene el comportamiento actual.
"""

import unittest

from pydantic import BaseModel, ConfigDict
from sqlalchemy import Integer, String, create_engine, func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from backend.app.query import (
    CompiledListQuery,
    CompiledQueryPlan,
    OffsetQuerySchema,
    QueryOptions,
    apply_query_schema,
    compile_list_query,
    make_offset_query_schema,
    paginate,
)


class Base(DeclarativeBase):
    pass


class Widget(Base):
    __tablename__ = "widget"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str | None] = mapped_column(String, nullable=True)


class WidgetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: int
    category: str | None


_OPTIONS = QueryOptions(
    filter_fields=("name", "price", "category"),
    sort_fields=("id", "name", "price", "category"),
    search_fields=("name",),
    in_fields=("price",),
    null_filter_fields=("category",),
    default_sort="-price",
)


def _compile() -> CompiledListQuery:
    return compile_list_query(
        name="WidgetPlanQuery", resource_schema=WidgetRead, orm_model=Widget, options=_OPTIONS
    )


def _pg(stmt: object) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))  # type: ignore[attr-defined]


def _cols(mapping: object) -> dict[str, str]:
    # Igualdad estructural de un mapping de columnas SIN usar `==` de SQLAlchemy
    # (que produce expresiones, no booleanos): se compara por nombre renderizado.
    return {key: str(value) for key, value in mapping.items()}  # type: ignore[attr-defined]


def _seq(columns: object) -> list[str]:
    return [str(column) for column in columns]  # type: ignore[attr-defined]


class CompileListQueryTest(unittest.TestCase):
    def test_returns_schema_and_plan(self) -> None:
        clq = _compile()
        self.assertIsInstance(clq, CompiledListQuery)
        self.assertTrue(issubclass(clq.schema, OffsetQuerySchema))
        self.assertIsInstance(clq.plan, CompiledQueryPlan)

    def test_make_offset_query_schema_returns_only_schema(self) -> None:
        schema = make_offset_query_schema(
            name="WidgetLegacy", resource_schema=WidgetRead, orm_model=Widget, options=_OPTIONS
        )
        self.assertTrue(issubclass(schema, OffsetQuerySchema))
        clq = _compile()
        self.assertEqual(set(schema.model_fields), set(clq.schema.model_fields))

    def test_plan_metadata_matches_dunders(self) -> None:
        clq = _compile()
        schema = clq.schema
        plan = clq.plan

        # Igualdad estructural (no identidad): el plan es un snapshot.
        self.assertEqual(_cols(plan.filter_columns), _cols(schema.__query_columns__))
        self.assertEqual(_cols(plan.all_columns), _cols(schema.__query_all_columns__))
        self.assertEqual(_cols(plan.sort_columns), _cols(schema.__query_sort_columns__))
        self.assertEqual(_seq(plan.search_columns), _seq(schema.__query_search_columns__))
        self.assertEqual(_seq(plan.primary_keys), _seq(schema.__query_primary_keys__))
        self.assertEqual(plan.range_fields, frozenset(schema.__query_range_fields__))
        self.assertEqual(plan.in_fields, frozenset(schema.__query_in_fields__))
        self.assertEqual(plan.null_filter_fields, frozenset(schema.__query_null_filter_fields__))
        self.assertEqual(plan.max_sort_terms, schema.__query_max_sort_terms__)

    def test_from_schema_reconstructs_equivalent_plan(self) -> None:
        clq = _compile()
        rebuilt = CompiledQueryPlan.from_schema(clq.schema)

        self.assertEqual(_cols(rebuilt.filter_columns), _cols(clq.plan.filter_columns))
        self.assertEqual(_cols(rebuilt.sort_columns), _cols(clq.plan.sort_columns))
        self.assertEqual(rebuilt.in_fields, clq.plan.in_fields)
        self.assertEqual(_seq(rebuilt.primary_keys), _seq(clq.plan.primary_keys))
        self.assertEqual(rebuilt.max_sort_terms, clq.plan.max_sort_terms)

    def test_plan_is_independent_immutable_snapshot(self) -> None:
        clq = _compile()
        # No comparte el contenedor mutable con __query_*__.
        self.assertIsNot(clq.plan.filter_columns, clq.schema.__query_columns__)
        # Mutar la metadata heredada no afecta al plan.
        clq.schema.__query_columns__["__injected__"] = Widget.id
        self.assertNotIn("__injected__", clq.plan.filter_columns)
        # El mapping del plan es de solo lectura.
        with self.assertRaises(TypeError):
            clq.plan.filter_columns["x"] = Widget.id  # type: ignore[index]


class SqlEquivalenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.clq = _compile()

    def _query(self, **params: object) -> OffsetQuerySchema:
        return self.clq.schema(**params)  # type: ignore[arg-type]

    def test_filters_search_sort_sql_is_identical(self) -> None:
        query = self._query(
            price_gte=10, price_lte=90, price_in=[10, 20], category_isnull=True,
            q="a%b_c", sort="-category",
        )
        legacy = apply_query_schema(stmt=select(Widget), query=query)
        planned = apply_query_schema(stmt=select(Widget), query=query, plan=self.clq.plan)

        self.assertEqual(str(legacy), str(planned))
        self.assertEqual(_pg(legacy), _pg(planned))

    def test_pg_dialect_preserves_ilike_escape_and_nulls_last(self) -> None:
        query = self._query(q="x%y", sort="-category")
        planned = _pg(apply_query_schema(stmt=select(Widget), query=query, plan=self.clq.plan))

        self.assertIn("ILIKE", planned)
        self.assertIn("ESCAPE", planned)
        self.assertIn("NULLS LAST", planned.upper())

    def test_count_without_order_by_is_equivalent(self) -> None:
        query = self._query(price_gte=10, sort="price")
        legacy = apply_query_schema(stmt=select(Widget), query=query)
        planned = apply_query_schema(stmt=select(Widget), query=query, plan=self.clq.plan)

        count_legacy = select(func.count()).select_from(legacy.order_by(None).subquery())
        count_planned = select(func.count()).select_from(planned.order_by(None).subquery())

        self.assertEqual(_pg(count_legacy), _pg(count_planned))
        self.assertNotIn("ORDER BY", _pg(count_legacy).upper())


class PaginateEquivalenceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.clq = _compile()
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all(
                [
                    Widget(id=1, name="a", price=10, category="tools"),
                    Widget(id=2, name="b", price=20, category=None),
                    Widget(id=3, name="c", price=20, category="tools"),
                    Widget(id=4, name="d", price=40, category="gear"),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)

    def test_paginate_legacy_and_plan_return_same_page(self) -> None:
        query = self.clq.schema(price_gte=20, sort="price", limit=2)  # type: ignore[arg-type]
        with Session(self.engine) as session:
            legacy = paginate(session, stmt=select(Widget), query=query, item_schema=WidgetRead)
        with Session(self.engine) as session:
            planned = paginate(
                session, stmt=select(Widget), query=query, item_schema=WidgetRead, plan=self.clq.plan
            )

        self.assertEqual([i.id for i in legacy.items], [i.id for i in planned.items])
        self.assertEqual(legacy.pagination.total, planned.pagination.total)
        self.assertEqual(legacy.pagination.has_next, planned.pagination.has_next)
        self.assertEqual(legacy.pagination.limit, planned.pagination.limit)
        self.assertEqual(legacy.pagination.offset, planned.pagination.offset)

    def test_plan_none_keeps_current_behaviour(self) -> None:
        query = self.clq.schema(sort="price", limit=10)  # type: ignore[arg-type]
        with Session(self.engine) as session:
            page = paginate(session, stmt=select(Widget), query=query, item_schema=WidgetRead)
        self.assertEqual([i.id for i in page.items], [1, 2, 3, 4])
        self.assertEqual(page.pagination.total, 4)


if __name__ == "__main__":
    unittest.main()
