# SiteSurveyor File Record Anchor Program

A minimal Solana Anchor program that anchors SiteSurveyor file content hashes on-chain.

## What it does

- `anchor_file`: creates a program-derived account (PDA) keyed by workspace + file hash.
- `delete_file`: records a soft-delete attestation on-chain.
- `restore_file`: clears the on-chain deletion flag.

## Quick start (Solana Playground)

1. Open [Solana Playground](https://beta.solpg.io/).
2. Create a new Anchor project.
3. Replace the generated `lib.rs` with the content of `programs/file-record/src/lib.rs`.
4. Update `declare_id!(...)` with the program ID Solana Playground generates for you.
5. Build and deploy to devnet.
6. Copy the deployed program ID into:
   - `frontend/src/lib/solana/idl/file_record.json` -> `metadata.address`
   - Your `.env` file as `VITE_SOLANA_FILE_RECORD_PROGRAM_ID=<program_id>`

## Quick start (local Anchor CLI)

```sh
# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Update Anchor.toml and the frontend IDL with the deployed program ID
```

## Workspace identity derivation

The SiteSurveyor workspace UUID is mapped to a Solana Pubkey deterministically:

```ts
const uuidBytes = Buffer.from(workspaceUuid.replace(/-/g, ""), "hex");
const [workspacePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("workspace"), uuidBytes],
  programId,
);
```

This lets the frontend re-derive the same workspace PDA for verification without storing extra state.

## File record PDA

```ts
const fileHashBytes = Buffer.from(contentHash, "hex");
const [recordPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("file-record"), workspacePda.toBuffer(), fileHashBytes],
  programId,
);
```
