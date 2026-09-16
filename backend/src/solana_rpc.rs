/**
 * Native Solana JSON-RPC relay for Tauri builds.
 *
 * Mobile WebViews often block direct `fetch()` calls to public Solana RPC
 * endpoints (CORS / network policy). This command forwards the JSON-RPC
 * request through the native layer, where those restrictions do not apply.
 *
 * The caller is trusted frontend code; the RPC URL comes from the build-time
 * `VITE_SOLANA_RPC_URL` env var and is passed explicitly so the same binary
 * can target devnet or mainnet.
 */
use serde_json::{json, Value};

#[tauri::command]
pub async fn solana_rpc_request(
    rpc_url: &str,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    if rpc_url.is_empty() {
        return Err("Solana RPC URL is empty".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let body = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    });

    let response = client
        .post(rpc_url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("RPC request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let text = response
            .text()
            .await
            .unwrap_or_else(|_| format!("HTTP {status}"));
        return Err(format!("RPC returned HTTP {status}: {text}"));
    }

    let json: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse RPC response: {e}"))?;

    if let Some(err) = json.get("error") {
        return Err(format!("RPC error: {err}"));
    }

    Ok(json)
}
