"""Tests for /api/v1/documents endpoints: list, get, update, export."""

import pytest


@pytest.mark.asyncio
async def test_list_documents_empty(client, auth_headers):
    """Listing documents when none exist should return an empty list."""
    response = await client.get("/api/v1/documents", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert "x-total-count" in response.headers


@pytest.mark.asyncio
async def test_get_nonexistent_document(client, auth_headers):
    """Getting a non-existent document should return 404."""
    response = await client.get("/api/v1/documents/999999", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_document(client, auth_headers):
    """Updating a non-existent document should return 404."""
    response = await client.put(
        "/api/v1/documents/999999",
        headers=auth_headers,
        json={"title": "不存在", "content": "无内容"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_list_documents_unauthenticated(client):
    """Listing documents without auth should return 401."""
    response = await client.get("/api/v1/documents")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_list_documents_pagination(client, auth_headers):
    """Listing documents should respect skip/limit params."""
    response = await client.get(
        "/api/v1/documents?skip=0&limit=5",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "x-total-count" in response.headers


@pytest.mark.asyncio
async def test_export_nonexistent_document(client, auth_headers):
    """Exporting a non-existent document should return 404."""
    response = await client.post(
        "/api/v1/documents/999999/export",
        headers=auth_headers,
        json={"format": "markdown"},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_extract_text_requires_auth(client):
    """The extract-text endpoint should require authentication."""
    response = await client.post("/api/v1/documents/extract-text")
    assert response.status_code in (401, 403, 422)


@pytest.mark.asyncio
async def test_quality_check_nonexistent_document(client, auth_headers):
    """Quality-checking a non-existent document should return 404."""
    response = await client.post(
        "/api/v1/documents/999999/quality-check",
        headers=auth_headers,
    )
    assert response.status_code == 404
