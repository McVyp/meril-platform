import numpy as np
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def embed(client, text):
    return client.post("/embed", json={"text": text})


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_returns_384_normalized_numbers(client):
    vec = np.array(embed(client, "railway").json()["embedding"])
    assert vec.shape == (384,)
    assert abs(np.linalg.norm(vec) - 1) < 1e-3


@pytest.mark.parametrize("text", ["", " ", "x" * 201])
def test_rejects_bad_text(client, text):
    assert embed(client, text).status_code == 422


def test_similar_meaning_is_closer(client):
    v = {
        t: np.array(embed(client, t).json()["embedding"])
        for t in ["train", "railway", "ramen"]
    }
    assert v["train"] @ v["railway"] > v["train"] @ v["ramen"]
