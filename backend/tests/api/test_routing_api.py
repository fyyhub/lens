from __future__ import annotations

from conftest import valid_site_payload

from app.core.runtime_channel_ids import compose_runtime_channel_id
from app.gateway.router.cooldown import ErrorCategory
from app.models.protocols import ProtocolKind
from app.persistence.settings_keys import SETTING_CORS_ALLOW_ORIGINS


def test_router_snapshot_is_empty_without_channels(client, admin_headers) -> None:
    response = client.get("/api/admin/routes", headers=admin_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["health"] == []
    assert payload["routes"]
    assert all(route["channel_ids"] == [] for route in payload["routes"])
    assert all(route["next_channel_id"] is None for route in payload["routes"])


def test_router_snapshot_exposes_credential_cooldown_details(
    client, admin_headers, app_state
) -> None:
    site_payload = valid_site_payload(name="Multi Key Site")
    site_payload["credentials"].append(
        {
            "id": "cred-2",
            "name": "backup-key",
            "api_key": "upstream-secret-2",
            "enabled": True,
        }
    )
    site_payload["protocols"][0]["credential_ids"] = ["cred-1", "cred-2"]
    site_payload["protocols"][0]["models"].append(
        {
            "credential_id": "cred-2",
            "model_name": "gpt-4o",
            "enabled": True,
            "protocol": ProtocolKind.OPENAI_CHAT.value,
        }
    )
    create_resp = client.post(
        "/api/admin/sites", headers=admin_headers, json=site_payload
    )
    assert create_resp.status_code == 201
    created_site = create_resp.json()
    site_id = created_site["id"]
    protocol_config_id = created_site["protocols"][0]["id"]
    cred_1_id = created_site["credentials"][0]["id"]
    cred_2_id = created_site["credentials"][1]["id"]

    runtime_channel_id = compose_runtime_channel_id(
        protocol_config_id, ProtocolKind.OPENAI_CHAT
    )
    app_state.router.record_failure(
        runtime_channel_id,
        "401 Unauthorized: invalid_api_key",
        category=ErrorCategory.AUTH,
        credential_id=cred_1_id,
        model_name="gpt-4o",
        scope="key",
    )

    response = client.get("/api/admin/routes", headers=admin_headers)
    assert response.status_code == 200
    health_items = response.json()["health"]
    assert len(health_items) == 1
    channel_health = health_items[0]
    assert channel_health["channel_id"] == runtime_channel_id
    assert channel_health["site_id"] == site_id
    assert channel_health["channel_name"] == "Multi Key Site"
    assert channel_health["available"] is True
    assert channel_health["available_key_count"] == 1
    assert channel_health["cooled_key_count"] == 1

    cred_by_id = {
        item["credential_id"]: item for item in channel_health["credential_health"]
    }
    assert cred_by_id[cred_1_id]["available"] is False
    assert cred_by_id[cred_1_id]["credential_name"] == "primary-key"
    assert cred_by_id[cred_1_id]["credential_number"] == 1
    assert cred_by_id[cred_1_id]["last_error_category"] == "auth"
    assert "invalid_api_key" in (cred_by_id[cred_1_id]["last_error"] or "")
    assert cred_by_id[cred_1_id]["cooldown_remaining_seconds"] > 0
    assert cred_by_id[cred_2_id]["available"] is True
    assert cred_by_id[cred_2_id]["credential_name"] == "backup-key"
    assert cred_by_id[cred_2_id]["credential_number"] == 2


def test_cors_preflight_allows_any_origin_by_default(client) -> None:
    response = client.options(
        "/anything",
        headers={
            "Origin": "https://app.example",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 204
    assert response.headers["access-control-allow-origin"] == "*"
    assert response.headers["access-control-allow-headers"] == "authorization"


def test_cors_preflight_respects_configured_origins(client, admin_headers) -> None:
    settings_response = client.put(
        "/api/admin/settings",
        headers=admin_headers,
        json={
            "items": [
                {
                    "key": SETTING_CORS_ALLOW_ORIGINS,
                    "value": "https://allowed.example",
                }
            ]
        },
    )
    assert settings_response.status_code == 200

    allowed = client.options(
        "/anything",
        headers={"Origin": "https://allowed.example"},
    )
    blocked = client.options(
        "/anything",
        headers={"Origin": "https://blocked.example"},
    )

    assert allowed.status_code == 204
    assert allowed.headers["access-control-allow-origin"] == "https://allowed.example"
    assert allowed.headers["vary"] == "Origin"
    assert "access-control-allow-origin" not in blocked.headers
