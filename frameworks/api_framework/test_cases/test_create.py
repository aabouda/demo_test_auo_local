import json
import os

import pytest
import requests
from utils.api_client import APIClient

# ─────────────────────────────────────────────────────────────────────────────
# Configuration du mode de résultats
#
#   Mode API (CALLBACK_URL défini) :
#     Les résultats sont envoyés à l'API publique TuringOne.
#     CALLBACK_TOKEN et EXECUTION_ID doivent également être définis.
#
#   Mode DB (défaut) :
#     Les résultats sont écrits directement dans PostgreSQL via db_config.py.
# ─────────────────────────────────────────────────────────────────────────────

CALLBACK_URL   = os.getenv("CALLBACK_URL")
CALLBACK_TOKEN = os.getenv("CALLBACK_TOKEN")
EXECUTION_ID   = os.getenv("EXECUTION_ID")

USE_API_CALLBACK = bool(CALLBACK_URL and CALLBACK_TOKEN and EXECUTION_ID)

# ─────────────────────────────────────────────────────────────────────────────
# Chargement des cas de test
# TEST_DATA_DIR injecté par run.py → test-data centralisé
# Fallback → test_data/ local dans le framework
# ─────────────────────────────────────────────────────────────────────────────

current_dir    = os.path.dirname(os.path.abspath(__file__))
_test_data_dir = os.getenv("TEST_DATA_DIR") or os.path.join(os.path.dirname(current_dir), "test_data")
test_cases_path = os.path.join(_test_data_dir, "test_cases.json")

print(f"📋 Chargement cas de test depuis : {test_cases_path}")
with open(test_cases_path, "r", encoding="utf-8") as f:
    _all_test_cases = json.load(f)

# Filtrer par test_type="api" (ou absent) et enabled=true
test_cases = [
    tc for tc in _all_test_cases
    if tc.get("test_type", "api") == "api" and tc.get("enabled", True)
]
print(f"📋 {len(test_cases)}/{len(_all_test_cases)} cas de test API actifs chargés.")

# ─────────────────────────────────────────────────────────────────────────────
# Mapping test_case_id → detail_execution_id
#
# run.py crée l'exécution via /public/executions/create et écrit ce mapping
# dans detail_mapping.json (test_case_id → ID de la ligne details_execution).
# Sans ce mapping, les résultats ne peuvent pas être associés à la bonne ligne.
# ─────────────────────────────────────────────────────────────────────────────

_detail_mapping = {}
_mapping_path = os.path.join(_test_data_dir, "detail_mapping.json")
if os.path.exists(_mapping_path):
    with open(_mapping_path, "r", encoding="utf-8") as f:
        _detail_mapping = json.load(f)
    print(f"✅ Mapping detail_execution_id chargé : {len(_detail_mapping)} entrées")
else:
    print("⚠ detail_mapping.json introuvable — les résultats ne seront pas envoyés à TuringOne")


def get_detail_execution_id(test_case: dict) -> int | None:
    """Retourne le detail_execution_id depuis le mapping, ou None si absent."""
    tc_id = str(test_case.get("test_case_id", ""))
    entry = _detail_mapping.get(tc_id)
    if not entry:
        print(f"⚠ Pas de detail_execution_id pour test_case_id={tc_id} ({test_case['name']})")
        return None
    # Supporte ancien format (int) et nouveau format (dict)
    return entry["detail_execution_id"] if isinstance(entry, dict) else entry


api_client = APIClient()


# ─────────────────────────────────────────────────────────────────────────────
# Envoi des résultats
# ─────────────────────────────────────────────────────────────────────────────

def send_execution_result(test_case, execution_status="failed", error=None):
    if USE_API_CALLBACK:
        _send_result_via_api(test_case, execution_status, error)
    else:
        _send_result_via_db(test_case, execution_status, error)


def _send_result_via_api(test_case, execution_status: str, error=None):
    detail_execution_id = get_detail_execution_id(test_case)
    if not detail_execution_id:
        return  # pas de mapping → on ne peut pas reporter

    try:
        url = f"{CALLBACK_URL.rstrip('/')}/{EXECUTION_ID}/result"
        payload = {
            "detail_execution_id": detail_execution_id,
            "status":              execution_status,
            "error":               str(error) if error else None,
        }
        headers = {
            "X-Turing-Token": CALLBACK_TOKEN,
            "Content-Type":   "application/json",
        }
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
        if resp.status_code not in (200, 201):
            print(f"⚠ API callback non-200 pour {test_case['name']}: {resp.status_code} {resp.text}")
        else:
            print(f"✅ Résultat envoyé via API pour {test_case['name']} → {execution_status}")
    except Exception as e:
        print(f"⚠ Impossible d'envoyer le résultat via API : {e}")


def _send_result_via_db(test_case, execution_status="failed", error=None):
    detail_execution_id = get_detail_execution_id(test_case)
    if not detail_execution_id:
        return  # pas de mapping → on ne peut pas reporter

    try:
        from config.db_config import get_connection
        conn = get_connection()
        cursor = conn.cursor()

        if execution_status == "in-progress":
            sql = """
                UPDATE details_execution
                SET resultat = %s, duree_execution = %s, flag_status = %s
                WHERE id = %s
            """
            cursor.execute(sql, ("in-progress", 0, 1, detail_execution_id))
        else:
            sql = """
                UPDATE details_execution
                SET resultat = %s, duree_execution = %s, bug_reference = %s, flag_status = %s
                WHERE id = %s
            """
            cursor.execute(sql, (execution_status, 0.7, str(error) if error else None, 2, detail_execution_id))

        conn.commit()
        print(f"✅ Mise à jour DB réussie pour {test_case['name']} (detail_execution_id={detail_execution_id})")

    except Exception as e:
        conn.rollback()
        print(f"⚠ Erreur lors de la mise à jour PostgreSQL : {e}")

    finally:
        cursor.close()
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Tests pytest paramétrés
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("test_case", test_cases, ids=[tc["name"] for tc in test_cases])
def test_api(test_case):
    """
    Exécute un test API selon la config dans test_cases.json.
    Une seule requête HTTP par cas de test (GET, POST, PUT, DELETE, PATCH).
    Résultat envoyé via API publique (CALLBACK_URL) ou directement en DB.
    """
    send_execution_result(test_case, "in-progress")

    result = api_client.execute(test_case)

    execution_status = result["status"]
    error            = result.get("error")

    if execution_status == "passed":
        print(f"✅ {test_case['name']} — {result['method']} {result['url']} → {result['status_code']}")
    else:
        print(f"❌ {test_case['name']} — {result['method']} {result['url']} → {result['status_code']} | {error}")

    send_execution_result(test_case, execution_status, error)

    assert execution_status == "passed", f"❌ {test_case['name']} échoué : {error}"
