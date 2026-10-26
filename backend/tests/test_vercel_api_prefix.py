from fastapi.testclient import TestClient

from main import app


def test_api_prefix_routes_to_existing_fastapi_endpoints():
    client = TestClient(app)

    prefixed = client.get("/api/openapi.json")
    root = client.get("/openapi.json")

    assert prefixed.status_code == 200
    assert root.status_code == 200
    assert prefixed.json()["info"]["title"] == root.json()["info"]["title"]
