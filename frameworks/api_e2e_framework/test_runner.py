import json
from utils.api_client import APIClient
from utils.context_manager import ContextManager
from utils.validator import Validator


class TestRunner:
    def __init__(self, plan_file):
        with open(plan_file, "r", encoding="utf-8") as f:
            self.test_plans = json.load(f)
        self.api_client = APIClient()
        self.ctx = ContextManager()

    def run(self):
        for plan in self.test_plans:
            print(f"\n🟢 Running Test Plan: {plan['name']} ({plan['description']})")
            self.ctx.reset()

            for step in plan.get("steps", []):
                print(f"\n📌 Step {step['id']} - {step['action']}")
                success = self.run_step(step)

                if not success:
                    print(f"❌ Step {step['id']} failed, skipping remaining steps.")
                    break  # stop current case

    def run_step(self, step):
        # 1️⃣ Construire l’URL
        url = self.api_client.replace_url_variables(step["api"], self.ctx.variables)

        # 2️⃣ Construire le payload avec Auto + variables
        payload = {}
        for p in step.get("params", {}).get("inputs", []):
            if not p.get("include", True):
                continue

            if p["value"] == "Auto":
                val = self.api_client.generate_dynamic_value(p["type"])
                self.ctx.set_var(p["name"], val)
            else:
                val = self.ctx.get_var(p["value"], p["value"])

            payload[p["name"]] = val

        # 3️⃣ Construire headers
        headers = self.api_client.get_auth_headers(step, self.ctx)


        # 4️⃣ Exécuter l’API
        response = self.api_client.request_step(
            step, self.ctx
        )

        # 5️⃣ Vérification statut
        expected_status = int(step.get("expected_status", 200))
        try:
            Validator.validate_status(response, expected_status)
        except AssertionError as e:
            print(e)
            return False

        # 6️⃣ Vérification réponse
        try:
            resp_json = response.json()
            Validator.validate_response(
                resp_json,
                step.get("expected_response", {}),
                step.get("is_list", False),
            )

            # Sauvegarde outputs
            for output in step.get("params", {}).get("outputs", []):
                if output["name"] in resp_json:
                    self.ctx.set_var(output["name"], resp_json[output["name"]])

        except Exception as e:
            print(f"⚠️ Error validating response: {e}")
            return False

        print(f"✅ Step {step['id']} success")
        return True


if __name__ == "__main__":
    runner = TestRunner("test_plan.json")
    runner.run()
