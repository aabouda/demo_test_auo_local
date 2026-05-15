"""
test_create.py — API E2E Framework
────────────────────────────────────
Exécute des scénarios E2E API en style BDD :
  - Chaque scénario = plusieurs steps HTTP enchaînés
  - Les valeurs extraites d'un step (champ "extract") alimentent les steps suivants
  - Le scénario passe si TOUS ses steps passent
  - Le résultat est envoyé à TuringOne après chaque scénario (via API ou DB)

Structure test_cases.json :
[
  {
    "test_case_id": 41,          ← ID du cas de test dans TuringOne
    "name": "CRUD Pet ...",
    "test_type": "api_e2e",
    "enabled": true,
    "steps": [
      {
        "name": "POST /pet",
        "method": "POST",
        "base_url": "https://...",
        "endpoint": "pet",
        "auth": { "type": 0 },
        "body": { "id": "{{any_valid_integer}}", ... },
        "expected_status": 200,
        "expected_response": { "status": "available" },
        "extract": { "petId": "id" }   ← sauvegarde response.id dans context["petId"]
      },
      {
        "name": "GET /pet/{petId}",    ← {{petId}} résolu depuis le contexte
        ...
      }
    ]
  }
]
"""

import json
import os
import time

import pytest
import requests
from utils.api_client import APIClient

# ─────────────────────────────────────────────────────────────────────────────
# Configuration TuringOne
# ─────────────────────────────────────────────────────────────────────────────

CALLBACK_URL   = os.getenv("CALLBACK_URL")
CALLBACK_TOKEN = os.getenv("CALLBACK_TOKEN")
EXECUTION_ID   = os.getenv("EXECUTION_ID")

USE_API_CALLBACK = bool(CALLBACK_URL and CALLBACK_TOKEN and EXECUTION_ID)

# ─────────────────────────────────────────────────────────────────────────────
# Chargement des scénarios
# ─────────────────────────────────────────────────────────────────────────────

current_dir    = os.path.dirname(os.path.abspath(__file__))
_test_data_dir = os.getenv("TEST_DATA_DIR") or os.path.join(os.path.dirname(current_dir), "test_data")
test_cases_path = os.path.join(_test_data_dir, "test_cases.json")

print(f"📋 Chargement scénarios E2E depuis : {test_cases_path}")
with open(test_cases_path, "r", encoding="utf-8") as f:
    _all_scenarios = json.load(f)

scenarios = [
    s for s in _all_scenarios
    if s.get("test_type", "api_e2e") == "api_e2e" and s.get("enabled", True)
]
print(f"📋 {len(scenarios)}/{len(_all_scenarios)} scénarios E2E actifs chargés.")

# ─────────────────────────────────────────────────────────────────────────────
# Mapping test_case_id → detail_execution_id
# Écrit par run.py après /public/executions/create
# ─────────────────────────────────────────────────────────────────────────────

_detail_mapping = {}
_mapping_path = os.path.join(_test_data_dir, "detail_mapping.json")
if os.path.exists(_mapping_path):
    with open(_mapping_path, "r", encoding="utf-8") as f:
        _detail_mapping = json.load(f)
    print(f"✅ Mapping detail_execution_id chargé : {len(_detail_mapping)} entrées")
else:
    print("⚠ detail_mapping.json introuvable — résultats non envoyés à TuringOne")


def get_mapping_entry(scenario: dict) -> dict | None:
    """Retourne {detail_execution_id, execution_type} depuis le mapping, ou None si absent."""
    tc_id = str(scenario.get("test_case_id", ""))
    entry = _detail_mapping.get(tc_id)
    if not entry:
        print(f"⚠ Pas de detail_execution_id pour test_case_id={tc_id} ({scenario['name']})")
        return None
    # Supporte ancien format (int) et nouveau format (dict)
    if isinstance(entry, dict):
        return entry
    return {"detail_execution_id": entry, "execution_type": "api_e2e"}


api_client = APIClient()


# ─────────────────────────────────────────────────────────────────────────────
# Envoi des résultats à TuringOne
# ─────────────────────────────────────────────────────────────────────────────

def send_result(scenario: dict, execution_status: str, error=None, duration: float = 0):
    if USE_API_CALLBACK:
        _send_via_api(scenario, execution_status, error, duration)
    else:
        _send_via_db(scenario, execution_status, error, duration)


def _send_via_api(scenario: dict, execution_status: str, error=None, duration: float = 0):
    entry = get_mapping_entry(scenario)
    if not entry:
        return
    detail_execution_id = entry["detail_execution_id"]
    execution_type      = entry.get("execution_type", "api_e2e")
    # api_e2e → /result-e2e,  api → /result
    endpoint_suffix = "result-e2e" if execution_type == "api_e2e" else "result"
    try:
        url = f"{CALLBACK_URL.rstrip('/')}/{EXECUTION_ID}/{endpoint_suffix}"
        payload = {
            "detail_execution_id": detail_execution_id,
            "status":              execution_status,
            "error":               str(error) if error else None,
            "duration":            duration,
        }
        headers = {"X-Turing-Token": CALLBACK_TOKEN, "Content-Type": "application/json"}
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
        if resp.status_code not in (200, 201):
            print(f"⚠ Callback non-200 pour '{scenario['name']}': {resp.status_code} {resp.text}")
        else:
            print(f"✅ Résultat envoyé → TuringOne : '{scenario['name']}' → {execution_status}")
    except Exception as e:
        print(f"⚠ Impossible d'envoyer le résultat via API : {e}")


def _send_via_db(scenario: dict, execution_status: str, error=None, duration: float = 0):
    entry = get_mapping_entry(scenario)
    if not entry:
        return
    detail_execution_id = entry["detail_execution_id"]
    try:
        from config.db_config import get_connection
        conn = get_connection()
        cursor = conn.cursor()

        if execution_status == "in-progress":
            cursor.execute(
                "UPDATE details_execution SET resultat=%s, duree_execution=%s, flag_status=%s WHERE id=%s",
                ("in-progress", 0, 1, detail_execution_id)
            )
        else:
            cursor.execute(
                "UPDATE details_execution SET resultat=%s, duree_execution=%s, bug_reference=%s, flag_status=%s WHERE id=%s",
                (execution_status, int(duration), str(error) if error else None, 2, detail_execution_id)
            )
        conn.commit()
        print(f"✅ DB mise à jour : '{scenario['name']}' → {execution_status}")
    except Exception as e:
        conn.rollback()
        print(f"⚠ Erreur DB : {e}")
    finally:
        cursor.close()
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Tests pytest — un test par scénario E2E
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("scenario", scenarios, ids=[s["name"] for s in scenarios])
def test_e2e_scenario(scenario):
    """
    Exécute un scénario E2E API : enchaîne tous ses steps dans l'ordre.
    Les valeurs extraites d'un step (extract) sont injectées dans les steps suivants.
    Résultat final envoyé à TuringOne après le dernier step.
    """
    steps   = scenario.get("steps", [])
    context = {}  # contexte partagé entre tous les steps du scénario

    send_result(scenario, "in-progress")

    start_time       = time.time()
    failed_step      = None
    execution_status = "passed"

    print(f"\n{'='*60}")
    print(f"🎬 Scénario : {scenario['name']}")
    print(f"   {len(steps)} step(s) à exécuter")
    print(f"{'='*60}")

    for i, step in enumerate(steps, 1):
        print(f"\n  ▶ Step {i}/{len(steps)} : {step['name']}")

        step_result = api_client.execute_step(step, context)

        if step_result["status"] == "passed":
            print(f"  ✅ {step['method']} {step_result['url']} → {step_result['status_code']}")
        else:
            print(f"  ❌ {step['method']} {step_result['url']} → {step_result['status_code']} | {step_result['error']}")
            execution_status = "failed"
            failed_step      = step_result
            break  # arrêt immédiat — les steps suivants dépendent de celui-ci

    duration = time.time() - start_time
    error    = failed_step["error"] if failed_step else None

    send_result(scenario, execution_status, error, duration)

    if execution_status == "failed":
        step_name = failed_step["name"] if failed_step else "?"
        pytest.fail(f"❌ Step échoué : '{step_name}' — {error}")
