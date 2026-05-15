#!/usr/bin/env python3
"""
run.py — Lanceur unique du framework TuringOne
===============================================
Lit config.yml, construit les variables d'environnement, et lance
le bon framework selon campagne_type :

  ui      → Playwright / Cucumber (npm run test:full)
  api     → pytest frameworks/api_framework/
  api_e2e → pytest frameworks/api_e2e_framework/

Les variables d'environnement ont toujours priorité sur config.yml.

Usage :
  python run.py                          # utilise config.yml
  python run.py --config mon_config.yml  # fichier custom
  CAMPAGNE_TYPE=api python run.py        # override le type
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

# ── Dépendance optionnelle PyYAML ────────────────────────────────────────────
try:
    import yaml
except ImportError:
    print("❌ PyYAML manquant. Installe-le : pip install pyyaml")
    sys.exit(1)

# ── Chemins ──────────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent.resolve()   # playwright-ia-simples/
PLAYWRIGHT  = ROOT / "playwright"
FRAMEWORKS  = ROOT / "frameworks"
TEST_DATA   = ROOT / "test-data"

# ─────────────────────────────────────────────────────────────────────────────

def load_config(config_path: Path) -> dict:
    """Charge config.yml et retourne un dict aplati."""
    if not config_path.exists():
        print(f"❌ Fichier de config introuvable : {config_path}")
        sys.exit(1)
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def get(cfg: dict, *keys, default=None):
    """Accès sécurisé à un chemin de clés dans le dict config."""
    val = cfg
    for k in keys:
        if not isinstance(val, dict):
            return default
        val = val.get(k, default)
    return val


_env_overrides = []   # log des variables surchargées par l'env shell

def env_or(cfg_val, env_key: str, cast=None):
    """
    Retourne la variable d'environnement si définie (priorité),
    sinon la valeur de config.yml.
    Logue les overrides pour que l'utilisateur voie clairement la source.
    """
    raw = os.environ.get(env_key)
    if raw is not None:
        _env_overrides.append(f"  ⚡ {env_key}={raw!r}  ← shell (override config.yml)")
        if cast == bool:
            return raw.lower() in ("true", "1", "yes")
        if cast == int:
            return int(raw)
        return raw
    if cfg_val is not None and cast == bool:
        return bool(cfg_val)
    if cfg_val is not None and cast == int:
        return int(cfg_val)
    return cfg_val


def build_env(cfg: dict) -> dict:
    """Construit le dict d'environnement complet pour le sous-processus."""
    env = os.environ.copy()

    # TuringOne
    api_url        = env_or(get(cfg, "turing_one", "api_url"),        "TURING1_API_URL")
    token          = env_or(get(cfg, "turing_one", "security_token"), "TURING1_SECURITY_TOKEN")
    callback_url   = env_or(get(cfg, "turing_one", "callback_url"),   "CALLBACK_URL")
    callback_token = env_or(get(cfg, "turing_one", "callback_token"), "CALLBACK_TOKEN")

    # Exécution
    camp_type = env_or(get(cfg, "execution", "campagne_type"),  "CAMPAGNE_TYPE")
    camp_id   = env_or(get(cfg, "execution", "campagne_id"),    "CAMPAGNE_ID",    cast=int)
    env_id    = env_or(get(cfg, "execution", "environment_id"), "ENVIRONMENT_ID", cast=int)
    create    = env_or(get(cfg, "execution", "create_execution",),"CREATE_EXECUTION", cast=bool)
    exec_id   = env_or(get(cfg, "execution", "execution_id"),   "EXECUTION_ID")

    # Test data
    args_file = env_or(get(cfg, "test_data", "args_file"),      "ARGS_FILE")

    # UI
    headless     = env_or(get(cfg, "ui", "headless"),      "HEADLESS",     cast=bool)
    keep_videos  = env_or(get(cfg, "ui", "keep_videos"),   "KEEP_VIDEOS",  cast=bool)
    slow_mo      = env_or(get(cfg, "ui", "slow_mo"),       "SLOW_MO",      cast=int)
    browser      = env_or(get(cfg, "ui", "browser"),       "BROWSER")

    # Reports
    upload_s3 = env_or(get(cfg, "reports", "upload_to_s3"), "UPLOAD_TO_S3", cast=bool)

    # Callback URL : explicite dans config > auto-calculée depuis api_url
    if not callback_url and api_url:
        callback_url = f"{api_url.rstrip('/')}/public/executions"
    # Callback token : explicite dans config > fallback sur security_token
    if not callback_token:
        callback_token = token

    # Injecter dans l'env
    if api_url:        env["TURING1_API_URL"]        = str(api_url)
    if token:          env["TURING1_SECURITY_TOKEN"]  = str(token)
    if camp_type:      env["CAMPAGNE_TYPE"]           = str(camp_type)
    if camp_id:        env["CAMPAGNE_ID"]             = str(camp_id)
    if env_id:         env["ENVIRONMENT_ID"]          = str(env_id)
    if exec_id:        env["EXECUTION_ID"]            = str(exec_id)
    if args_file:      env["ARGS_FILE"]               = str(args_file)
    if callback_url:   env["CALLBACK_URL"]            = str(callback_url)
    if callback_token: env["CALLBACK_TOKEN"]          = str(callback_token)
    if browser:       env["BROWSER"]                 = str(browser)

    env["HEADLESS"]        = "true"  if headless    else "false"
    env["KEEP_VIDEOS"]     = "true"  if keep_videos else "false"
    env["SLOW_MO"]         = str(slow_mo or 0)
    env["CREATE_EXECUTION"]= "true"  if create      else "false"
    env["UPLOAD_TO_S3"]    = "true"  if upload_s3   else "false"

    # test-data centralisé → transmis au framework Playwright via ARGS_FILE
    # Le chemin absolu est calculé ici pour les frameworks Python
    if args_file:
        test_data_dir = TEST_DATA / args_file
        env["TEST_DATA_DIR"] = str(test_data_dir)

    return env, {
        "camp_type":      camp_type,
        "camp_id":        camp_id,
        "env_id":         env_id,
        "args_file":      args_file,
        "create":         create,
        "exec_id":        exec_id,
        "upload_s3":      upload_s3,
        "api_url":        api_url,
        "token":          token,
        "callback_url":   callback_url,
        "callback_token": callback_token,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Runners
# ─────────────────────────────────────────────────────────────────────────────

def run_ui(env: dict, params: dict) -> int:
    """Lance Playwright/Cucumber via npm run test:full"""
    print("\n🎭 [UI] Lancement Playwright / Cucumber")
    print(f"   test-data : {params['args_file']}")
    print(f"   headless  : {env.get('HEADLESS')}")
    print(f"   videos    : {env.get('KEEP_VIDEOS')}")
    print(f"   campagne  : {params['camp_id']}")

    if not (PLAYWRIGHT / "package.json").exists():
        print(f"❌ package.json introuvable dans {PLAYWRIGHT}")
        return 1

    # Vérifier que le dossier test-data existe dans le bon endroit
    test_data_dir = TEST_DATA / params["args_file"]
    if not test_data_dir.exists():
        print(f"❌ test-data introuvable : {test_data_dir}")
        return 1

    # npm run test:full lance cucumber-js puis post-run.mjs
    result = subprocess.run(
        ["npm", "run", "test:full"],
        cwd=PLAYWRIGHT,
        env=env,
    )
    return result.returncode


def run_api(env: dict, params: dict, framework: str = "api_framework") -> int:
    """Lance pytest pour api_framework ou api_e2e_framework"""
    fw_dir = FRAMEWORKS / framework
    print(f"\n🔌 [{'API' if framework == 'api_framework' else 'API E2E'}] Lancement pytest")
    print(f"   framework : {fw_dir}")
    print(f"   test-data : {env.get('TEST_DATA_DIR')}")
    print(f"   campagne  : {params['camp_id']}")

    if not fw_dir.exists():
        print(f"❌ Dossier framework introuvable : {fw_dir}")
        return 1

    test_data_dir = TEST_DATA / params["args_file"] if params["args_file"] else None
    if test_data_dir and not test_data_dir.exists():
        print(f"❌ test-data introuvable : {test_data_dir}")
        return 1

    # Si create_execution=true → créer l'exécution via API avant pytest
    if params["create"] and params["camp_id"] and params["api_url"] and params["token"]:
        exec_id, detail_items = _create_execution_via_api(params)
        if exec_id:
            env["EXECUTION_ID"] = str(exec_id)
            print(f"✅ Exécution créée : EXECUTION_ID={exec_id} ({len(detail_items)} cas de test)")
            # Écrire le mapping test_case_id → detail_execution_id dans test-data
            # Pytest l'utilise pour reporter les résultats avec le bon ID en base
            if test_data_dir and detail_items:
                import json as _json
                # Stocker aussi execution_type pour que le framework appelle le bon endpoint callback
                execution_type = "api_e2e" if params["camp_type"] == "api_e2e" else "api"
                mapping = {
                    str(item["scenario_id"]): {
                        "detail_execution_id": item["detail_execution_id"],
                        "execution_type":      execution_type,
                    }
                    for item in detail_items
                }
                mapping_path = test_data_dir / "detail_mapping.json"
                mapping_path.write_text(_json.dumps(mapping, indent=2), encoding="utf-8")
                print(f"✅ Mapping test_case_id→detail_execution_id écrit : {mapping_path}")
        else:
            print("⚠️  Impossible de créer l'exécution TuringOne, on continue sans ID")

    result = subprocess.run(
        ["pytest", "test_cases/", "-v",
         "--html=reports/report.html", "--self-contained-html"],
        cwd=fw_dir,
        env=env,
    )

    # Upload rapport si activé
    if params.get("upload_s3") and env.get("EXECUTION_ID"):
        _upload_report(fw_dir / "reports", env, params)

    return result.returncode


def _create_execution_via_api(params: dict):
    """
    Appelle POST /public/executions/create.
    Retourne (execution_id, detail_items) où detail_items est la liste
    [{detail_execution_id, scenario_id, name}] pour chaque cas de test.
    """
    try:
        import requests as req
        url = f"{params['api_url'].rstrip('/')}/public/executions/create"
        camp_type = params["camp_type"]
        if camp_type == "ui":
            turing_type = "ui"
        elif camp_type == "api_e2e":
            turing_type = "api_e2e"
        else:
            turing_type = "api"
        body = {
            "campagne_id":   params["camp_id"],
            "campagne_type": turing_type,
            "executed_by":   "framework-python",
        }
        if params.get("env_id"):
            body["environment_id"] = params["env_id"]
        headers = {
            "X-Turing-Token": params["token"],
            "Content-Type":   "application/json",
        }
        resp = req.post(url, json=body, headers=headers, timeout=15)
        if resp.status_code in (200, 201):
            data = resp.json()
            return data.get("execution_id"), data.get("detail_items", [])
        else:
            print(f"⚠️  create_execution HTTP {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"⚠️  create_execution erreur : {e}")
    return None, []


def _upload_report(reports_dir: Path, env: dict, params: dict):
    """Upload le rapport ZIP via l'API publique TuringOne."""
    import zipfile, io, tempfile
    try:
        import requests as req
    except ImportError:
        return

    if not reports_dir.exists():
        return

    print(f"\n📤 Upload rapport → TuringOne S3")
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in reports_dir.rglob("*"):
            if f.is_file():
                zf.write(f, f.relative_to(reports_dir))
    zip_buffer.seek(0)
    zip_size = zip_buffer.getbuffer().nbytes
    print(f"   ZIP : {zip_size / 1024:.1f} KB")

    execution_id = env.get("EXECUTION_ID")
    camp_type    = params["camp_type"]
    if camp_type == "ui":
        turing_type = "ui"
    elif camp_type == "api_e2e":
        turing_type = "api_e2e"
    else:
        turing_type = "api"
    url = f"{params['api_url'].rstrip('/')}/public/executions/{execution_id}/upload-output"

    try:
        resp = req.post(
            url,
            data={"execution_type": turing_type},
            files={"file": (f"execution_{execution_id}_output.zip", zip_buffer, "application/zip")},
            headers={"X-Turing-Token": params["token"]},
            timeout=180,
        )
        if resp.status_code in (200, 201):
            result = resp.json()
            print(f"✅ Rapport uploadé → {result.get('output_path')}")
        else:
            print(f"⚠️  upload HTTP {resp.status_code}: {resp.text}")
    except Exception as e:
        print(f"⚠️  upload erreur : {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Lanceur TuringOne Framework")
    parser.add_argument("--config", default="config.yml",
                        help="Fichier de configuration (défaut: config.yml)")
    args = parser.parse_args()

    config_path = ROOT / args.config
    cfg = load_config(config_path)
    env, params = build_env(cfg)

    camp_type = params["camp_type"] or "ui"

    print("=" * 60)
    print(f"  TuringOne Framework — type={camp_type.upper()}")
    print(f"  Config  : {config_path}")
    print(f"  Backend : {params['api_url']}")
    print(f"  Token   : {str(params['token'])[:8]}…")
    print(f"  Campagne: {params['camp_id']}  |  args_file: {params['args_file']}")
    if _env_overrides:
        print("\n  ⚠️  Variables surchargées par le shell (priorité sur config.yml) :")
        for msg in _env_overrides:
            print(msg)
        print("  → Pour utiliser config.yml : unset <VARIABLE>")
    print("=" * 60)

    if camp_type == "ui":
        rc = run_ui(env, params)
    elif camp_type == "api":
        rc = run_api(env, params, framework="api_framework")
    elif camp_type == "api_e2e":
        rc = run_api(env, params, framework="api_e2e_framework")
    else:
        print(f"❌ campagne_type inconnu : '{camp_type}' (valeurs: ui | api | api_e2e)")
        sys.exit(1)

    sys.exit(rc)


if __name__ == "__main__":
    main()
