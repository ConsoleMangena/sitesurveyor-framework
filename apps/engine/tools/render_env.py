import re
import sys
from pathlib import Path
import requests

def get_api_key():
    cli_yaml = Path.home() / ".render" / "cli.yaml"
    if not cli_yaml.exists():
        raise FileNotFoundError("Render CLI config not found.")
    text = cli_yaml.read_text(encoding="utf-8")
    m = re.search(r"key:\s*([^\s\n\r]+)", text)
    if not m:
        raise ValueError("API key not found in cli.yaml")
    return m.group(1).strip("\"'")

def get_env_vars(service_id: str):
    key = get_api_key()
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    r = requests.get(f"https://api.render.com/v1/services/{service_id}/env-vars", headers=headers)
    r.raise_for_status()
    return r.json()

if __name__ == "__main__":
    service_id = sys.argv[1] if len(sys.argv) > 1 else "srv-dbmanmdbedkc73bnbkug"
    vars_data = get_env_vars(service_id)
    print("Fetched env vars count:", len(vars_data))
    for item in vars_data:
        env_var = item.get("envVar", {})
        print(f"Key: {env_var.get('key')} | Value: {'***' if env_var.get('value') else '(empty)'}")
