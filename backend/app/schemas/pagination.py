from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel
from typing_extensions import Annotated


T = TypeVar("T")

Limit = Annotated[int, Query(ge=1)]
Offset = Annotated[int, Query(ge=0)]


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
