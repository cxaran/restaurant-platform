"""Cobertura única no incluida en el resto de la suite de query:

- Rechazo de abusos por límites configurables (``max_in_values``,
  ``max_sort_terms``, ``max_filter_text_length``, ``sort`` vacío).
- Recurso de referencia (``User``): el contrato de query compila end-to-end,
  validando el vínculo schema público -> columnas ORM sin levantar un endpoint.

El escape de búsqueda, el orden estable (PK simple y compuesta), el statement base
y el envelope de error viven en ``test_query.py`` y ``test_error_contract.py``.
"""

import unittest

import pydantic
from sqlalchemy import Integer, String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from backend.app.models.user import User
from backend.app.query import QueryOptions, ResourceQuery, make_offset_query_schema
from backend.app.query.compiler import apply_query_schema
from backend.app.query.validation import QueryParameterError
from backend.app.schemas.base import ApiReadSchema
from backend.app.schemas.user import UserListItem, UserRead


class Base(DeclarativeBase):
    pass


class Thing(Base):
    __tablename__ = "thing"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)


class ThingRead(ApiReadSchema):
    id: int
    name: str
    price: int


# Límites pequeños para ejercitar el rechazo de abusos.
ThingQuery = make_offset_query_schema(
    name="ThingLimitsQuery",
    resource_schema=ThingRead,
    orm_model=Thing,
    options=QueryOptions(
        filter_fields=("name", "price"),
        sort_fields=("id", "name", "price"),
        in_fields=("id",),
        default_sort="price",
        max_in_values=3,
        max_sort_terms=2,
        max_filter_text_length=5,
    ),
)


class LimitRejectionTest(unittest.TestCase):
    def test_empty_sort_is_rejected_at_validation(self) -> None:
        with self.assertRaises(pydantic.ValidationError):
            ThingQuery(sort="")

    def test_in_filter_over_max_is_rejected(self) -> None:
        with self.assertRaises(pydantic.ValidationError):
            ThingQuery(id_in=[1, 2, 3, 4])

    def test_text_filter_over_max_length_is_rejected(self) -> None:
        with self.assertRaises(pydantic.ValidationError):
            ThingQuery(name="demasiado-largo")

    def test_too_many_sort_terms_is_rejected(self) -> None:
        with self.assertRaises(QueryParameterError):
            apply_query_schema(stmt=select(Thing), query=ThingQuery(sort="name,price,id"))


class ReferenceResourceTest(unittest.TestCase):
    """El recurso de referencia (User) compila el contrato de query end-to-end:
    valida el vínculo schema público -> columnas ORM sin levantar un endpoint."""

    def test_user_resource_query_compiles(self) -> None:
        resource: ResourceQuery[UserListItem] = ResourceQuery(
            name="UserReferenceQuery",
            model=User,
            schema=UserListItem,
            options=QueryOptions(
                filter_fields=("is_active", "email"),
                sort_fields=("created_at", "email", "id"),
                search_fields=("name", "last_name", "email"),
                in_fields=("id",),
            ),
        )

        fields = resource.Query.model_fields
        self.assertIn("is_active", fields)
        self.assertIn("q", fields)
        self.assertIn("id_in", fields)
        self.assertEqual(resource.Query().sort, "-created_at")

    def test_user_read_validates_from_orm_attributes(self) -> None:
        self.assertTrue(UserRead.model_config.get("from_attributes"))


if __name__ == "__main__":
    unittest.main()
