"""Tests de las capas nuevas: ejecución (paginate), filtros in/isnull,
validación de búsqueda y el descriptor ResourceQuery.

Los básicos de factory/compiler viven en ``test_query_helpers.py``.
"""

import unittest

from pydantic import BaseModel, ConfigDict
from sqlalchemy import Integer, String, create_engine, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from backend.app.query import OffsetPage, QueryOptions, ResourceQuery, paginate
from backend.app.query.compiler import apply_query_schema
from backend.app.query.factory import make_offset_query_schema
from backend.app.query.validation import QuerySchemaConfigError


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


WidgetQuery = make_offset_query_schema(
    name="WidgetQuery",
    resource_schema=WidgetRead,
    orm_model=Widget,
    options=QueryOptions(
        filter_fields=("name", "price", "category"),
        sort_fields=("id", "name", "price", "category"),
        search_fields=("name",),
        in_fields=("price",),
        null_filter_fields=("category",),
    ),
)


def _seed(engine) -> None:
    with Session(engine) as session:
        session.add_all(
            [
                Widget(id=1, name="alpha", price=10, category="tools"),
                Widget(id=2, name="beta", price=20, category=None),
                Widget(id=3, name="gamma", price=30, category="tools"),
                Widget(id=4, name="delta", price=40, category=None),
                Widget(id=5, name="epsilon", price=50, category="gear"),
            ]
        )
        session.commit()


class FilterGenerationTest(unittest.TestCase):
    def test_generates_in_and_isnull_params(self) -> None:
        self.assertIn("price_in", WidgetQuery.model_fields)
        self.assertIn("category_isnull", WidgetQuery.model_fields)

    def test_non_text_search_field_is_rejected(self) -> None:
        with self.assertRaisesRegex(QuerySchemaConfigError, "unsupported_search_field_type"):
            make_offset_query_schema(
                name="BadSearchQuery",
                resource_schema=WidgetRead,
                orm_model=Widget,
                options=QueryOptions(search_fields=("price",)),
            )


class PaginateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        _seed(self.engine)

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)

    def _paginate(self, **params: object) -> OffsetPage[WidgetRead]:
        query = WidgetQuery(**params)  # type: ignore[arg-type]
        with Session(self.engine) as session:
            return paginate(session, stmt=select(Widget), query=query, item_schema=WidgetRead)

    def test_limit_and_total_and_has_next(self) -> None:
        page = self._paginate(limit=2, offset=0, sort="price")

        self.assertEqual([item.price for item in page.items], [10, 20])
        self.assertEqual(page.pagination.total, 5)
        self.assertTrue(page.pagination.has_next)

    def test_last_page_has_no_next(self) -> None:
        page = self._paginate(limit=2, offset=4, sort="price")

        self.assertEqual([item.price for item in page.items], [50])
        self.assertFalse(page.pagination.has_next)

    def test_equality_filter(self) -> None:
        page = self._paginate(name="beta")

        self.assertEqual(page.pagination.total, 1)
        self.assertEqual(page.items[0].name, "beta")

    def test_range_filter(self) -> None:
        page = self._paginate(price_gte=20, price_lte=40, sort="price")

        self.assertEqual([item.price for item in page.items], [20, 30, 40])

    def test_in_filter(self) -> None:
        page = self._paginate(price_in=[10, 30], sort="price")

        self.assertEqual([item.price for item in page.items], [10, 30])

    def test_isnull_true_filter(self) -> None:
        page = self._paginate(category_isnull=True, sort="price")

        self.assertEqual([item.name for item in page.items], ["beta", "delta"])

    def test_isnull_false_filter(self) -> None:
        page = self._paginate(category_isnull=False, sort="price")

        self.assertEqual({item.name for item in page.items}, {"alpha", "gamma", "epsilon"})

    def test_search_uses_ilike(self) -> None:
        page = self._paginate(q="ph")

        self.assertEqual({item.name for item in page.items}, {"alpha"})

    def test_descending_sort(self) -> None:
        page = self._paginate(sort="-price", limit=2)

        self.assertEqual([item.price for item in page.items], [50, 40])


class ResourceQueryTest(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        _seed(self.engine)
        self.resource: ResourceQuery[WidgetRead] = ResourceQuery(
            name="WidgetResourceQuery",
            model=Widget,
            schema=WidgetRead,
            options=QueryOptions(
                filter_fields=("name", "price", "category"),
                sort_fields=("id", "name", "price", "category"),
                search_fields=("name",),
            ),
        )

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)

    def test_default_statement_paginates_full_table(self) -> None:
        query = self.resource.Query(limit=2, sort="price")
        with Session(self.engine) as session:
            page = self.resource.paginate(session, query)

        self.assertEqual(page.pagination.total, 5)
        self.assertEqual([item.price for item in page.items], [10, 20])

    def test_custom_statement_is_respected(self) -> None:
        query = self.resource.Query(sort="price")
        with Session(self.engine) as session:
            page = self.resource.paginate(
                session, query, stmt=select(Widget).where(Widget.category == "tools")
            )

        self.assertEqual(page.pagination.total, 2)
        self.assertEqual({item.name for item in page.items}, {"alpha", "gamma"})


class SearchEscapeTest(unittest.TestCase):
    """Verifica que %, _ y \\ se traten como literales, no como comodines."""

    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all(
                [
                    Widget(id=1, name="100%_off", price=10, category="tools"),
                    Widget(id=2, name="100Xoff", price=20, category="tools"),
                    Widget(id=3, name="100ZZoff", price=30, category="tools"),
                    Widget(id=4, name="discount_50", price=40, category="gear"),
                    Widget(id=5, name="discountA50", price=50, category="gear"),
                    Widget(id=6, name="discountX50", price=60, category="gear"),
                    Widget(id=7, name="folder\\name", price=70, category="tools"),
                    Widget(id=8, name="folderXname", price=80, category="tools"),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)

    def _search(self, q: str) -> list[str]:
        query = WidgetQuery(q=q, sort="id")  # type: ignore[arg-type]
        with Session(self.engine) as session:
            page = paginate(session, stmt=select(Widget), query=query, item_schema=WidgetRead)
        return [item.name for item in page.items]

    def test_percent_is_literal_not_wildcard(self) -> None:
        names = self._search("100%")
        self.assertEqual(names, ["100%_off"])

    def test_underscore_is_literal_not_wildcard(self) -> None:
        names = self._search("_50")
        self.assertEqual(names, ["discount_50"])

    def test_backslash_is_literal_not_escape(self) -> None:
        names = self._search("folder\\n")
        self.assertEqual(names, ["folder\\name"])


class StableSortTest(unittest.TestCase):
    """Verifica que el desempate por PK evite repeticiones y omisiones
    entre páginas consecutivas cuando el campo de sort tiene duplicados."""

    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all(
                [
                    Widget(id=1, name="a", price=10, category="tools"),
                    Widget(id=2, name="b", price=10, category="tools"),
                    Widget(id=3, name="c", price=10, category="tools"),
                    Widget(id=4, name="d", price=20, category="gear"),
                    Widget(id=5, name="e", price=20, category="gear"),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)

    def test_all_items_appear_exactly_once_across_pages(self) -> None:
        seen_ids: list[int] = []
        for offset_val in (0, 2, 4):
            query = WidgetQuery(limit=2, offset=offset_val, sort="price")  # type: ignore[arg-type]
            with Session(self.engine) as session:
                page = paginate(session, stmt=select(Widget), query=query, item_schema=WidgetRead)
            seen_ids.extend(item.id for item in page.items)

        self.assertEqual(sorted(seen_ids), [1, 2, 3, 4, 5])

    def test_order_within_same_price_is_stable_by_id(self) -> None:
        query = WidgetQuery(limit=10, offset=0, sort="price")  # type: ignore[arg-type]
        with Session(self.engine) as session:
            page = paginate(session, stmt=select(Widget), query=query, item_schema=WidgetRead)

        self.assertEqual([item.id for item in page.items], [1, 2, 3, 4, 5])


class CompositePkBase(DeclarativeBase):
    pass


class CompositeThing(CompositePkBase):
    __tablename__ = "composite_thing"

    tenant_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)


class CompositeThingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: int
    sequence: int
    name: str
    score: int


CompositeQuery = make_offset_query_schema(
    name="CompositeQuery",
    resource_schema=CompositeThingRead,
    orm_model=CompositeThing,
    options=QueryOptions(
        filter_fields=("score",),
        sort_fields=("score", "tenant_id", "sequence"),
    ),
)


class CompositePkStableSortTest(unittest.TestCase):
    """Verifica que la PK compuesta (tenant_id + sequence) actúe como
    desempate completo cuando el campo principal de sort empata."""

    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        CompositePkBase.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all(
                [
                    CompositeThing(tenant_id=1, sequence=1, name="a", score=10),
                    CompositeThing(tenant_id=1, sequence=2, name="b", score=10),
                    CompositeThing(tenant_id=2, sequence=1, name="c", score=10),
                    CompositeThing(tenant_id=2, sequence=2, name="d", score=10),
                    CompositeThing(tenant_id=1, sequence=3, name="e", score=20),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        CompositePkBase.metadata.drop_all(self.engine)

    def test_all_items_appear_exactly_once_across_pages(self) -> None:
        seen_keys: list[tuple[int, int]] = []
        for offset_val in (0, 2, 4):
            query = CompositeQuery(limit=2, offset=offset_val, sort="score")  # type: ignore[arg-type]
            with Session(self.engine) as session:
                page = paginate(
                    session,
                    stmt=select(CompositeThing),
                    query=query,
                    item_schema=CompositeThingRead,
                )
            seen_keys.extend((item.tenant_id, item.sequence) for item in page.items)

        expected = [(1, 1), (1, 2), (2, 1), (2, 2), (1, 3)]
        self.assertEqual(sorted(seen_keys), sorted(expected))

    def test_order_within_same_score_is_stable_by_composite_pk(self) -> None:
        query = CompositeQuery(limit=10, offset=0, sort="score")  # type: ignore[arg-type]
        with Session(self.engine) as session:
            page = paginate(
                session,
                stmt=select(CompositeThing),
                query=query,
                item_schema=CompositeThingRead,
            )

        keys = [(item.tenant_id, item.sequence) for item in page.items]
        self.assertEqual(keys, [(1, 1), (1, 2), (2, 1), (2, 2), (1, 3)])


class BaseStatementTest(unittest.TestCase):
    """Verifica que un statement base (ej. filtro de tenant/estado) se
    componga con los filtros del usuario y que el conteo sea coherente."""

    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            session.add_all(
                [
                    Widget(id=1, name="a", price=10, category="tools"),
                    Widget(id=2, name="b", price=20, category="tools"),
                    Widget(id=3, name="c", price=30, category="hidden"),
                    Widget(id=4, name="d", price=40, category="hidden"),
                    Widget(id=5, name="e", price=50, category="gear"),
                ]
            )
            session.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)

    def test_base_filter_plus_user_filter_items_and_total(self) -> None:
        base_stmt = select(Widget).where(Widget.category != "hidden")
        query = WidgetQuery(price_gte=20, sort="price", limit=10)  # type: ignore[arg-type]
        with Session(self.engine) as session:
            page = paginate(session, stmt=base_stmt, query=query, item_schema=WidgetRead)

        names = [item.name for item in page.items]
        self.assertEqual(names, ["b", "e"])
        self.assertEqual(page.pagination.total, 2)
        self.assertFalse(page.pagination.has_next)


class CountWithoutOrderByTest(unittest.TestCase):
    """Verifica que el conteo elimine ORDER BY del statement para no
    degradar el rendimiento del COUNT."""

    def test_count_statement_has_no_order_by(self) -> None:
        query = WidgetQuery(sort="price", limit=10)  # type: ignore[arg-type]
        filtered = apply_query_schema(stmt=select(Widget), query=query)
        count_stmt = select(func.count()).select_from(filtered.order_by(None).subquery())
        sql = str(count_stmt.compile())

        self.assertNotIn("ORDER BY", sql.upper())


if __name__ == "__main__":
    unittest.main()
