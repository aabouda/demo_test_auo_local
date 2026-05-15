"""
api_client.py — API E2E Framework
──────────────────────────────────
Exécute les steps d'un scénario E2E API.

Chaque step est une requête HTTP. Les valeurs extraites de la réponse
(champ "extract") sont stockées dans le contexte et réutilisées dans
les steps suivants via {{variable}}.

Auth types (alignés avec run_test_apiOnepoint) :
  0 = None
  1 = Basic
  2 = JWT (POST username/password → token)
  3 = Bearer statique
  4 = OAuth2 (client_credentials / password grant)
  5 = API Key (header)
"""

import re
import base64
import random
import string
import uuid
import datetime
import requests

requests.packages.urllib3.disable_warnings()


# ─────────────────────────────────────────────────────────────────────────────
# Résolution des variables {{var}} dans strings, dicts, listes
# ─────────────────────────────────────────────────────────────────────────────

def resolve_vars(value, variables: dict):
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
# Génération de valeurs dynamiques {{uuid}}, {{string_10}}, etc.
# ─────────────────────────────────────────────────────────────────────────────

def generate_random_value(type_key: str):
    match type_key:
        case "uuid":
            return str(uuid.uuid4())
        case "any_valid_email":
            return f"test.{uuid.uuid4().hex[:6]}@example.com"
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
        case _:
            if type_key.startswith("string_"):
                try:
                    length = int(type_key.split("_")[-1])
                    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))
                except ValueError:
                    pass
            return ''.join(random.choices(string.ascii_letters, k=8))


def resolve_random_vars(data, context: dict):
    """Remplace les {{type}} non résolus par une valeur générée, stockée dans context."""
    if isinstance(data, str):
        m = re.fullmatch(r"\{\{(.+?)\}\}", data)
        if m:
            key = m.group(1)
            if key not in context:
                context[key] = generate_random_value(key)
            return context[key]
        return data
    if isinstance(data, dict):
        return {k: resolve_random_vars(v, context) for k, v in data.items()}
    if isinstance(data, list):
        return [resolve_random_vars(v, context) for v in data]
    return data


# ─────────────────────────────────────────────────────────────────────────────
# APIClient E2E
# ─────────────────────────────────────────────────────────────────────────────

class APIClient:

    def execute_step(self, step: dict, context: dict) -> dict:
        """
        Exécute un step HTTP et retourne son résultat.
        Les variables {{var}} sont résolues depuis `context`.
        Les valeurs extraites (step.extract) sont sauvegardées dans `context`.

        Retourne :
        {
          "name": str,
          "status": "passed" | "failed",
          "status_code": int,
          "url": str,
          "method": str,
          "response": dict | str,
          "error": str | None
        }
        """
        result = {
            "name":        step.get("name", ""),
            "status":      "failed",
            "status_code": None,
            "url":         "",
            "method":      "",
            "response":    None,
            "error":       None,
        }

        try:
            # Fusionner variables statiques du step dans le contexte
            context.update(step.get("variables") or {})

            method   = (step.get("method") or "GET").upper()
            base_url = (step.get("base_url") or "").rstrip("/")
            endpoint = resolve_vars((step.get("endpoint") or "").lstrip("/"), context)
            url      = f"{base_url}/{endpoint}"

            headers = resolve_vars(dict(step.get("headers") or {}), context)
            params  = resolve_vars(dict(step.get("params")  or {}), context)
            body    = resolve_vars(step.get("body"), context) if step.get("body") else None

            # Valeurs dynamiques
            body    = resolve_random_vars(body,    context) if body    else body
            params  = resolve_random_vars(params,  context)
            headers = resolve_random_vars(headers, context)
            url     = resolve_vars(url, context)

            # Auth
            auth      = step.get("auth") or {}
            auth_type = int(auth.get("type", 0))
            self._apply_auth(auth_type, auth, headers, params, body)

            result["url"]    = url
            result["method"] = method

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

            # Validation status
            expected_status = int(step.get("expected_status") or 200)
            status_ok = response.status_code == expected_status

            # Validation body
            expected_response = step.get("expected_response") or {}
            body_ok = True
            if expected_response and isinstance(result["response"], dict):
                body_ok = self._validate_response(result["response"], expected_response)

            result["status"] = "passed" if status_ok and body_ok else "failed"
            if not status_ok:
                result["error"] = f"HTTP attendu {expected_status}, reçu {response.status_code}"
            elif not body_ok:
                result["error"] = "La réponse ne correspond pas à expected_response"

            # Extraction des variables pour les steps suivants
            if result["status"] == "passed":
                extract = step.get("extract") or {}
                if isinstance(result["response"], dict):
                    for ctx_key, response_key in extract.items():
                        if response_key in result["response"]:
                            context[ctx_key] = result["response"][response_key]
                            print(f"  🔗 [Context] {ctx_key} = {context[ctx_key]}")
                        else:
                            print(f"  ⚠ extract: clé '{response_key}' absente dans la réponse")

        except Exception as e:
            result["error"] = str(e)

        return result

    # ─────────────────────────────────────────────────────────────────────────
    # Auth — types 0-5 alignés avec run_test_apiOnepoint
    # ─────────────────────────────────────────────────────────────────────────

    def _inject_token(self, token_value: str, auth: dict, headers: dict, params: dict, body):
        if not token_value:
            return
        location    = auth.get("location", "header")
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
            pass

        elif auth_type == 1:  # Basic
            encoded = base64.b64encode(
                f"{auth.get('username','')}:{auth.get('password','')}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {encoded}"

        elif auth_type == 2:  # JWT
            token_endpoint = auth.get("token_endpoint", "")
            if not token_endpoint:
                raise ValueError("auth.token_endpoint requis pour JWT (type 2)")
            resp = requests.post(
                token_endpoint,
                json={"username": auth.get("username"), "password": auth.get("password")},
                timeout=10, verify=False,
            )
            token = resp.json().get("access_token") or resp.json().get("token")
            self._inject_token(token, auth, headers, params, body)

        elif auth_type == 3:  # Bearer statique
            self._inject_token(auth.get("token", ""), auth, headers, params, body)

        elif auth_type == 4:  # OAuth2
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
            }.items() if v}
            resp = requests.post(
                token_endpoint, data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=10, verify=False,
            )
            self._inject_token(resp.json().get("access_token"), auth, headers, params, body)

        elif auth_type == 5:  # API Key
            headers[auth.get("api_key_header") or "X-API-Key"] = auth.get("api_key", "")

    # ─────────────────────────────────────────────────────────────────────────
    # Validation réponse
    # ─────────────────────────────────────────────────────────────────────────

    def _validate_response(self, response: dict, expected: dict) -> bool:
        import re as _re
        for key, expected_value in expected.items():
            if key not in response:
                print(f"  ❌ Clé '{key}' absente dans la réponse")
                return False
            actual = response[key]
            if isinstance(expected_value, str) and expected_value.startswith("regex:"):
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
