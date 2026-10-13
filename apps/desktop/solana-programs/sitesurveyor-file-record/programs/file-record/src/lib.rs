use anchor_lang::prelude::*;

// Replace with the program ID generated when you deploy from Solana Playground.
declare_id!("Fg6PaFpoGVkY9jXjCqYj9jXjCqYj9jXjCqYj9jXjCqYj");

/// Storage tier discriminator.
#[repr(u8)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum StorageTier {
    OffChain = 0,
    OnChain = 1,
}

impl Default for StorageTier {
    fn default() -> Self {
        StorageTier::OffChain
    }
}

#[program]
pub mod file_record {
    use super::*;

    /// Anchor a file content hash to the chain.
    ///
    /// `workspace_id` is the Solana-side identity for a SiteSurveyor workspace.
    /// The frontend derives this deterministically from the Supabase workspace UUID
    /// so it can be re-derived later for verification.
    pub fn anchor_file(
        ctx: Context<AnchorFile>,
        file_hash: [u8; 32],
        storage_tier: StorageTier,
    ) -> Result<()> {
        require!(
            file_hash != [0u8; 32],
            FileRecordError::InvalidFileHash
        );

        let record = &mut ctx.accounts.file_record;
        record.workspace_id = ctx.accounts.workspace_id.key();
        record.file_hash = file_hash;
        record.uploader = ctx.accounts.signer.key();
        record.anchored_at = Clock::get()?.unix_timestamp;
        record.storage_tier = storage_tier as u8;
        record.bump = ctx.bumps.file_record;
        Ok(())
    }

    /// Mark an on-chain record as deleted (soft-delete attestation).
    pub fn delete_file(ctx: Context<DeleteFile>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        ctx.accounts.file_record.deleted_at = Some(now);
        Ok(())
    }

    /// Clear the deleted flag (restore attestation).
    pub fn restore_file(ctx: Context<RestoreFile>) -> Result<()> {
        ctx.accounts.file_record.deleted_at = None;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(file_hash: [u8; 32], storage_tier: StorageTier)]
pub struct AnchorFile<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: Workspace identity PDA derived from Supabase workspace UUID.
    pub workspace_id: AccountInfo<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + FileRecord::SIZE,
        seeds = [
            b"file-record",
            workspace_id.key().as_ref(),
            file_hash.as_ref(),
        ],
        bump
    )]
    pub file_record: Account<'info, FileRecord>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeleteFile<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = file_record.uploader == signer.key()
            @ FileRecordError::Unauthorized,
    )]
    pub file_record: Account<'info, FileRecord>,
}

#[derive(Accounts)]
pub struct RestoreFile<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        constraint = file_record.uploader == signer.key()
            @ FileRecordError::Unauthorized,
    )]
    pub file_record: Account<'info, FileRecord>,
}

#[account]
#[derive(Default)]
pub struct FileRecord {
    pub workspace_id: Pubkey,
    pub file_hash: [u8; 32],
    pub uploader: Pubkey,
    pub anchored_at: i64,
    pub storage_tier: u8,
    pub deleted_at: Option<i64>,
    pub bump: u8,
}

impl FileRecord {
    pub const SIZE: usize = 32     // workspace_id
        + 32                       // file_hash
        + 32                       // uploader
        + 8                        // anchored_at
        + 1                        // storage_tier
        + 1 + 8                    // deleted_at Option<i64>
        + 1;                       // bump
}

#[error_code]
pub enum FileRecordError {
    #[msg("Invalid file hash.")]
    InvalidFileHash,

    #[msg("Only the original uploader can modify this record.")]
    Unauthorized,
}
