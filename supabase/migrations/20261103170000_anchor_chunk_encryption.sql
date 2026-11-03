-- Client-side encryption for full-file anchor chunks.
--
-- 20261103130000 described these chunk objects as "encrypted at rest" while the
-- web client was still uploading them as plaintext. That claim is now true: each
-- operation carries the wrapped form of a fresh AES-256 key, and the key cannot
-- be unwrapped without the anchoring passphrase, which never leaves the browser.
--
-- Storage therefore holds ciphertext for every chunk and for the manifest copy.
-- The manifest kept in this table stays plaintext deliberately: it is the
-- RLS-protected metadata (file name, size, per-chunk digests) that the on-chain
-- digest was computed from, and verification must work without the passphrase.

alter table public.file_anchor_operations
  add column if not exists encryption jsonb;

alter table public.file_anchor_operations
  add constraint file_anchor_operations_encryption_shape
  check (
    encryption is null
    or (
      encryption ?& array['version', 'algorithm', 'kdf', 'iterations', 'salt', 'iv', 'wrapped_key']
      and encryption ->> 'algorithm' = 'AES-256-GCM'
      and encryption ->> 'kdf' = 'PBKDF2-SHA256'
      and jsonb_typeof(encryption -> 'iterations') = 'number'
      and (encryption ->> 'iterations')::numeric >= 100000
    )
  );

comment on column public.file_anchor_operations.encryption is
  'Wrapped AES-256 data key for this operation''s chunks. NULL means the record predates chunk encryption and its stored chunks are plaintext.';

comment on column public.file_anchor_chunks.size_bytes is
  'Plaintext chunk size; the stored object is larger by the 12-byte IV and the 16-byte GCM tag.';

comment on column public.file_anchor_chunks.content_hash is
  'SHA-256 of the plaintext chunk — what the manifest and the chain commit to, not of the stored ciphertext.';
