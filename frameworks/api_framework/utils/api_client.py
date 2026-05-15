"""
api_client.py
─────────────
Client HTTP pour le framework API TuringOne.

Reproduit exactement la logique de run_test_apiOnepoint :
  - auth_type_id 0=None, 1=Basic, 2=JWT, 3=Bearer, 4=OAuth2, 5=API Key
  - Variables {{var}} résolues dans URL, body, params, headers
  - Une seule API par cas de test (GET, POST, PUT, DELETE, PATCH)
"""

import os
import re
import json
import base64
import random
import string
import uuid
import datetime
import requests

requests.packages.urllib3.disable_warnings()


# ─────────────────────────────────────────────────────────────────────────────
# Résolution des variables {{var}}
# ─────────────────────────────────────────────────────────────────────────────

def resolve_vars(value, variables: dict):
    """Remplace {{var}} par sa valeur dans strings, dicts et listes."""
    if isinstance(value, str):
        for k, v in variables.items():
            value = value.replace(f"{{{{{k}}}}}", str(v))
        return value
    if isinstance(value, dict):
        return {k: resolve_vars(v, variables) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_vars(v, variables) for v in value]
    return value


# ─────────────────────────────────────────────────────────────────────────────
# Génération de valeurs dynamiques (types random)
# ─────────────────────────────────────────────────────────────────────────────

def generate_random_value(type_key: str):
    """Génère une valeur aléatoire selon le type demandé."""
    match type_key:
        case "uuid":
            return str(uuid.uuid4())
        case "any_valid_email":
            return f"test.{uuid.uuid4().hex[:6]}@example.com"
        case "any_invalid_email":
            return f"invalid@@example..com"
        case "any_valid_integer" | "any_positive_integer":
            return random.randint(1, 1000)
        case "any_negative_integer":
            return random.randint(-1000, -1)
        case "boolean":
            return random.choice([True, False])
        case "null":
            return None
        case "any_valid_today":
            return datetime.date.today().strftime("%Y-%m-%d")
        case "future_date":
            return (datetime.date.today() + datetime.timedelta(days=random.randint(1, 365))).strftime("%Y-%m-%d")
        case "past_date":
            return (datetime.date.today() - datetime.timedelta(days=random.randint(1, 365))).strftime("%Y-%m-%d")
        case "any_invalid_date":
            return "2024-13-45"
        case _:
            if type_key.startswith("string_"):
                try:
                    length = int(type_key.split("_")[-1])
                    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))
                except ValueError:
                    pass
            return ''.join(random.choices(string.ascii_letters, k=8))


def resolve_random_vars(data, variables: dict):
    """
    Parcourt data et remplace les valeurs {{type}} non encore résolues
    par une valeur générée dynamiquement, puis les stocke dans variables.
    """
    if isinstance(data, str):
        m = re.fullmatch(r"\{\{(.+?)\}\}", data)
        if m:
            key = m.group(1)
            if key not in variables:
                variables[key] = generate_random_value(key)
            return variables[key]
        return data
    if isinstance(data, dict):
        return {k: resolve_random_vars(v, variables) for k, v in data.items()}
    if isinstance(data, list):
        return [resolve_random_vars(v, variables) for v in data]
    return data


# ─────────────────────────────────────────────────────────────────────────────
# APIClient
# ─────────────────────────────────────────────────────────────────────────────

class APIClient:
    """
    Exécute une requête HTTP pour un cas de test API.

    Structure d'un cas de test (test_cases.json) :
    {
      "test_case_id": 101,           # detail_execution_id dans TuringOne (ID du cas de test)
      "name": "GET /pets",
      "enabled": true,
      "method": "GET",              # GET | POST | PUT | DELETE | PATCH
      "base_url": "https://api.example.com",
      "endpoint": "/pets",          # Peut contenir {{variables}}
      "auth": {
        "type": 0,                  # 0=None 1=Basic 2=JWT 3=Bearer 4=OAuth2 5=APIKey
        "username": "",
        "password": "",
        "token": "",
        "token_endpoint": "",
        "grant_type": "password",
        "client_id": "",
        "client_secret": "",
        "scope": "",
        "api_key": "",
        "api_key_header": "X-API-Key",
        "prefix": "Bearer",
        "location": "header"        # header | query | body
      },
      "headers": {},
      "params": {},                 # query params (GET/DELETE)
      "body": {},                   # request body (POST/PUT/PATCH)
      "variables": {                # variables statiques {{key}} → value
        "petId": "123"
      },
      "expected_status": 200,
      "expected_response": {}       # {} = pas de validation de body
    }
    """

    def execute(self, test_case: dict) -> dict:
        """
        Exécute le test_case et retourne :
        {
          "status": "passed" | "failed",
          "status_code": int,
          "url": str,
          "method": str,
          "response": dict | str,
          "error": str | None
        }
        """
        result = {
            "status":      "failed",
            "status_code": None,
            "url":         "",
            "method":      "",
            "response":    None,
            "error":       None,
        }

        try:
            # ── Variables statiques du cas de test ───────────────────────
            variables = dict(test_case.get("variables") or {})

            method   = (test_case.get("method") or "GET").upper()
            base_url = (test_case.get("base_url") or "").rstrip("/")
            endpoint = (test_case.get("endpoint") or "").lstrip("/")

            # Résolution des variables dans l'endpoint
            endpoint = resolve_vars(endpoint, variables)
            url = f"{base_url}/{endpoint}"

            headers = dict(test_case.get("headers") or {})
            params  = dict(test_case.get("params")  or {})
            body    = test_case.get("body")

            # Résolution des variables dans headers, params, body
            headers = resolve_vars(headers, variables)
            params  = resolve_vars(params,  variables)
            body    = resolve_vars(body,    variables) if body else body

            # Résolution des valeurs dynamiques ({{uuid}}, {{string_10}}, etc.)
            body    = resolve_random_vars(body,    variables) if body else body
            params  = resolve_random_vars(params,  variables)
            headers = resolve_random_vars(headers, variables)
            url     = resolve_vars(url, variables)

            # ── Authentification ─────────────────────────────────────────
            auth     = test_case.get("auth") or {}
            auth_type = int(auth.get("type", 0))
            self._apply_auth(auth_type, auth, headers, params, body)

            result["url"]    = url
            result["method"] = method

            # ── Appel HTTP ───────────────────────────────────────────────
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                params=params  if method in ("GET", "DELETE") else None,
                json=body      if method in ("POST", "PUT", "PATCH") and isinstance(body, dict) else None,
                data=body      if method in ("POST", "PUT", "PATCH") and not isinstance(body, dict) else None,
                timeout=30,
                verify=False,
            )

            result["status_code"] = response.status_code
            try:
                result["response"] = response.json()
            except Exception:
                result["response"] = response.text

            # ── Validation ───────────────────────────────────────────────
            expected_status   = int(test_case.get("expected_status") or 200)
            expected_response = test_case.get("expected_response") or {}

            status_ok = response.status_code == expected_status
            body_ok   = True
            if expected_response:
                body_ok = self._validate_response(result["response"], expected_response)

            result["status"] = "passed" if status_ok and body_ok else "failed"
            if not status_ok:
                result["error"] = (
                    f"HTTP attendu {expected_status}, reçu {response.status_code}"
                )
            elif not body_ok:
                result["error"] = "La réponse ne correspond pas à expected_response"

        except Exception as e:
            result["error"] = str(e)

        return result

    # ─────────────────────────────────────────────────────────────────────
    # Auth — aligné avec run_test_apiOnepoint (types 0-5)
    # ─────────────────────────────────────────────────────────────────────

    def _inject_token(self, token_value: str, auth: dict, headers: dict, params: dict, body):
        """Injecte le token dans header, query ou body selon auth.location."""
        if not token_value:
            return
        location   = auth.get("location", "header")
        header_name = auth.get("header_name") or auth.get("api_key_header") or "Authorization"
        prefix      = (auth.get("prefix") or "").strip()
        value       = f"{prefix} {token_value}".strip() if prefix else str(token_value)

        if location == "header":
            headers[header_name] = value
        elif location == "query":
            params[header_name] = token_value
        elif location == "body" and isinstance(body, dict):
            body[header_name] = token_value

    def _apply_auth(self, auth_type: int, auth: dict, headers: dict, params: dict, body):
        if auth_type == 0:
            pass  # Aucune auth

        elif auth_type == 1:  # Basic Auth
            username = auth.get("username", "")
            password = auth.get("password", "")
            encoded  = base64.b64encode(f"{username}:{password}".encode()).decode()
            headers["Authorization"] = f"Basic {encoded}"

        elif auth_type == 2:  # JWT (username/password → token)
            token_endpoint = auth.get("token_endpoint", "")
            if not token_endpoint:
                raise ValueError("auth.token_endpoint requis pour JWT (type 2)")
            resp = requests.post(
                token_endpoint,
                json={"username": auth.get("username"), "password": auth.get("password")},
                timeout=10, verify=False,
            )
            data = resp.json()
            token = data.get("access_token") or data.get("token")
            self._inject_token(token, auth, headers, params, body)

        elif auth_type == 3:  # Bearer Token statique
            token = auth.get("token", "")
            self._inject_token(token, auth, headers, params, body)

        elif auth_type == 4:  # OAuth2 (client_credentials / password)
            token_endpoint = auth.get("token_endpoint", "")
            if not token_endpoint:
                raise ValueError("auth.token_endpoint requis pour OAuth2 (type 4)")
            payload = {k: v for k, v in {
                "grant_type":    auth.get("grant_type", "password"),
                "client_id":     auth.get("client_id"),
                "client_secret": auth.get("client_secret"),
                "username":      auth.get("username"),
                "password":      auth.get("password"),
                "scope":         auth.get("scope"),
                "redirect_uri":  auth.get("redirect_uri"),
            }.items() if v}
            resp = requests.post(
                token_endpoint,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10, verify=False,
            )
            token = resp.json().get("access_token")
            self._inject_token(token, auth, headers, params, body)

        elif auth_type == 5:  # API Key
            api_key        = auth.get("api_key", "")
            api_key_header = auth.get("api_key_header") or "X-API-Key"
            headers[api_key_header] = api_key

    # ─────────────────────────────────────────────────────────────────────
    # Validation de la réponse
    # ─────────────────────────────────────────────────────────────────────

    def _validate_response(self, response, expected: dict) -> bool:
        """Valide les champs de expected_response contre la réponse réelle."""
        if not isinstance(response, dict):
            return False
        for key, expected_value in expected.items():
            if key not in response:
                print(f"  ❌ Clé '{key}' absente dans la réponse")
                return False
            actual = response[key]
            if isinstance(expected_value, str) and expected_value.startswith("regex:"):
                import re as _re
                pattern = expected_value.replace("regex:", "")
                if not _re.match(pattern, str(actual)):
                    print(f"  ❌ {key}: '{actual}' ne correspond pas au pattern {pattern}")
                    return False
            elif isinstance(expected_value, dict) and "greater_than" in expected_value:
                if not (isinstance(actual, (int, float)) and actual > expected_value["greater_than"]):
                    print(f"  ❌ {key}: {actual} n'est pas > {expected_value['greater_than']}")
                    return False
            else:
                if str(actual) != str(expected_value):
                    print(f"  ❌ {key}: attendu '{expected_value}', reçu '{actual}'")
                    return False
        return True
