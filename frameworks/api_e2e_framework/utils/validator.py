import re
import json


class Validator:
    """
    Vérifie les réponses API (status code, JSON attendu, regex, règles métiers).
    """

    @staticmethod
    def validate_status(response, expected_status):
        """Valide le statut HTTP"""
        if response.status_code != expected_status:
            raise AssertionError(
                f"❌ Expected HTTP {expected_status}, got {response.status_code}. Response: {response.text}"
            )
        print(f"✅ Status code {expected_status} valid")

    @staticmethod
    def validate_response(response_json, expected_response=None, is_list=False):
        """Valide la réponse JSON contre un expected_response"""
        if is_list:
            if not isinstance(response_json, list):
                raise AssertionError(f"❌ Expected list, got {type(response_json)}")
            print(f"✅ Response is a list with {len(response_json)} items")

        if expected_response:
            if isinstance(expected_response, str):
                try:
                    expected_response = json.loads(expected_response)
                except json.JSONDecodeError:
                    expected_response = {}

            for key, expected_value in expected_response.items():
                if key not in response_json:
                    raise AssertionError(f"❌ Key '{key}' missing in response")
                if isinstance(expected_value, str) and expected_value.startswith("regex:"):
                    pattern = expected_value.replace("regex:", "")
                    if not re.match(pattern, str(response_json[key])):
                        raise AssertionError(f"❌ {key} does not match {pattern}")
                else:
                    if str(response_json[key]) != str(expected_value):
                        raise AssertionError(
                            f"❌ {key}: expected {expected_value}, got {response_json[key]}"
                        )
            print("✅ Response matches expected values")
