const U = '11111111-1111-4111-8111-111111111111'
const WS = '22222222-2222-4222-8222-222222222222'
const WS2 = '22222222-2222-4222-8222-222222222223'
const WS3 = '22222222-2222-4222-8222-222222222224'
const ORG1 = '33333333-3333-4333-8333-333333333331'
const ORG2 = '33333333-3333-4333-8333-333333333332'
const PROJ1 = '44444444-4444-4444-8444-444444444441'
const PROJ2 = '44444444-4444-4444-8444-444444444442'
const PROJ3 = '44444444-4444-4444-8444-444444444443'
const JOB1 = '55555555-5555-4555-8555-555555555551'
const ATT1 = '66666666-6666-4666-8666-666666666661'
const ATT2 = '66666666-6666-4666-8666-666666666662'
const ATT3 = '66666666-6666-4666-8666-666666666663'
const ATT4 = '66666666-6666-4666-8666-666666666664'
const ANCH1 = '77777777-7777-4777-8777-777777777771'
const ANCH2 = '77777777-7777-4777-8777-777777777772'
const ANCH3 = '77777777-7777-4777-8777-777777777773'
const ANCH4 = '77777777-7777-4777-8777-777777777774'
const CONV = '88888888-8888-4888-8888-888888888881'
const LIST1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const LIST2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const LIST3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
const ASSET1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const ASSET2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
const ASSET3 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3'
const PKG1 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'
const PKG2 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
const PKG3 = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
const RUN1 = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
const TAG1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'
const TAG2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
const FOLDER1 = 'ffffffff-ffff-4fff-8fff-fffffffffff1'

const TODAY = new Date().toISOString().slice(0, 10)
const now = new Date().toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

const TX1 = '5KtPnQvXwRzJmHbYcLdGeSfUiAoNpTrVxWzKyMqJhDfEgCsBuAnMvLoPiQwErTyUiOpAsDfGhJkLzXcVbNmQwErT'
const TX2 = '3JmHbYcLdGeSfUiAoNpTrVxWzKyMqJhDfEgCsBuAnMvLoPiQwErTyUiOpAsDfGhJkLzXcVbNmQwErT5KtPnQvXwRz'
const HASH1 = '9f2c41d7ab08e6531c4f9b2d7e5a80136c4d9e2f7a1b3c5d6e8f0a2b4c6d8e0f'
const HASH2 = '4b8e0f2a6c1d3e5f7a9b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e2f'
const HASH3 = 'c5d7e9f0a2b4c6d8e0f1a3b5c7d9e2f4b8e0f2a6c1d3e5f7a9b0c2d4e6f8a1b3'

const workspace = {
  id: WS,
  name: 'Moyo Geomatics',
  slug: 'moyo-geomatics',
  owner_id: U,
  marketplace_wallet_address: null,
  created_at: daysAgo(210),
  updated_at: now,
}

export const user = {
  id: U,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tendai@moyo-geomatics.example',
  email_confirmed_at: daysAgo(210),
  phone: '',
  confirmed_at: daysAgo(210),
  last_sign_in_at: daysAgo(0),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Tendai Moyo' },
  identities: [],
  factors: [],
  created_at: daysAgo(210),
  updated_at: now,
}

export const session = {
  access_token: 'offline-harness-token',
  refresh_token: 'offline-harness-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
}

export const tables: Record<string, Record<string, unknown>[]> = {
  profiles: [
    {
      id: U,
      full_name: 'Tendai Moyo',
      email: user.email,
      auth_signup_account_type: 'personal',
      default_workspace_id: WS,
      is_platform_admin: false,
      avatar_path: null,
      created_at: daysAgo(210),
      updated_at: now,
    },
  ],
  workspaces: [workspace],
  workspace_members: [
    {
      id: '12121212-1212-4121-8121-121212121212',
      workspace_id: WS,
      user_id: U,
      role: 'owner',
      status: 'active',
      joined_at: daysAgo(210),
      workspaces: workspace,
    },
  ],
  notifications: [
    {
      id: '13131313-1313-4131-8131-131313131311',
      workspace_id: WS,
      user_id: U,
      kind: 'anchor',
      status: 'unread',
      title: 'Anchor settled on devnet',
      body: 'gweru-control-network-adjustment.pdf reached slot 412 883 051.',
      created_at: daysAgo(0),
      read_at: null,
    },
    {
      id: '13131313-1313-4131-8131-131313131312',
      workspace_id: WS,
      user_id: U,
      kind: 'market',
      status: 'unread',
      title: 'Marketplace request received',
      body: 'Midlands Exploration Syndicate asked to hire the TS16 for 6 days.',
      created_at: daysAgo(1),
      read_at: null,
    },
  ],
  workspace_ai_credit_accounts: [
    { id: '14141414-1414-4141-8141-141414141411', workspace_id: WS, balance: 96, updated_at: now },
  ],
  organizations: [
    { id: ORG1, workspace_id: WS, name: 'Midlands Exploration Syndicate' },
    { id: ORG2, workspace_id: WS, name: 'Zinwa Sebakwe Catchment' },
  ],
  projects: [
    {
      id: PROJ1,
      workspace_id: WS,
      organization_id: ORG1,
      name: 'Gweru greenstone belt mineral screen',
      status: 'active',
      start_date: daysAgo(24).slice(0, 10),
      end_date: daysAhead(18),
      created_at: daysAgo(24),
      updated_at: daysAgo(0),
      organizations: { name: 'Midlands Exploration Syndicate' },
    },
    {
      id: PROJ2,
      workspace_id: WS,
      organization_id: ORG2,
      name: 'Sebakwe dam bathymetric control',
      status: 'active',
      start_date: daysAgo(10).slice(0, 10),
      end_date: daysAhead(6),
      created_at: daysAgo(10),
      updated_at: daysAgo(1),
      organizations: { name: 'Zinwa Sebakwe Catchment' },
    },
    {
      id: PROJ3,
      workspace_id: WS,
      organization_id: null,
      name: 'Shurugwi farm boundary subdivision',
      status: 'completed',
      start_date: daysAgo(70).slice(0, 10),
      end_date: daysAgo(12).slice(0, 10),
      created_at: daysAgo(70),
      updated_at: daysAgo(12),
      organizations: null,
    },
  ],
  jobs: [
    {
      id: JOB1,
      workspace_id: WS,
      project_id: PROJ1,
      title: 'Gweru EO mineral screen + ground truthing',
      name: 'Gweru EO mineral screen + ground truthing',
      status: 'active',
      client_name: 'Midlands Exploration Syndicate',
      site_address: 'Gweru greenstone belt, Midlands, Zimbabwe',
      created_at: daysAgo(24),
      updated_at: daysAgo(0),
    },
    {
      id: '55555555-5555-4555-8555-555555555552',
      workspace_id: WS,
      project_id: PROJ2,
      title: 'Sebakwe dam bathymetric line run',
      name: 'Sebakwe dam bathymetric line run',
      status: 'active',
      client_name: 'Zinwa Sebakwe Catchment',
      site_address: 'Sebakwe dam, Kwekwe, Zimbabwe',
      created_at: daysAgo(10),
      updated_at: daysAgo(1),
    },
  ],
  invoices: [
    {
      id: '15151515-1515-4151-8151-151515151511',
      workspace_id: WS,
      invoice_number: 'INV-2026-014',
      status: 'sent',
      total: 1850,
      currency_code: 'USD',
      due_date: daysAhead(14),
      issued_date: daysAgo(3).slice(0, 10),
      organization_id: ORG1,
      project_id: PROJ1,
      organizations: { name: 'Midlands Exploration Syndicate' },
      projects: { name: 'Gweru greenstone belt mineral screen' },
      created_at: daysAgo(3),
    },
    {
      id: '15151515-1515-4151-8151-151515151512',
      workspace_id: WS,
      invoice_number: 'INV-2026-011',
      status: 'paid',
      total: 640,
      currency_code: 'USD',
      due_date: daysAgo(20).slice(0, 10),
      issued_date: daysAgo(34).slice(0, 10),
      organization_id: ORG2,
      project_id: PROJ2,
      organizations: { name: 'Zinwa Sebakwe Catchment' },
      projects: { name: 'Sebakwe dam bathymetric control' },
      created_at: daysAgo(34),
    },
  ],
  quotes: [
    { id: '16161616-1616-4161-8161-161616161611', workspace_id: WS, status: 'pending', total: 2400, currency_code: 'USD', created_at: daysAgo(2) },
    { id: '16161616-1616-4161-8161-161616161612', workspace_id: WS, status: 'accepted', total: 640, currency_code: 'USD', created_at: daysAgo(36) },
  ],
  assets: [
    { id: ASSET1, workspace_id: WS, name: 'Leica TS16 total station', status: 'available', type: 'total_station', category: 'survey_equipment', photos: ['/fixtures/media/total-station.jpg'], created_at: daysAgo(180) },
    { id: ASSET2, workspace_id: WS, name: 'Trimble R12i GNSS rover', status: 'deployed', type: 'gnss_receiver', category: 'survey_equipment', photos: ['/fixtures/media/gnss-rover.jpg'], created_at: daysAgo(160) },
    { id: ASSET3, workspace_id: WS, name: 'DJI M350 RTK + Zenmuse P1', status: 'maintenance', type: 'uav', category: 'photogrammetry', photos: ['/fixtures/media/uav.jpg'], created_at: daysAgo(140) },
  ],
  asset_calibrations: [
    { id: '17171717-1717-4171-8171-171717171711', workspace_id: WS, asset_id: ASSET1, next_calibration_date: daysAhead(21), last_calibration_date: daysAgo(344).slice(0, 10) },
    { id: '17171717-1717-4171-8171-171717171712', workspace_id: WS, asset_id: ASSET2, next_calibration_date: daysAhead(160), last_calibration_date: daysAgo(205).slice(0, 10) },
  ],
  job_events: [
    {
      id: '18181818-1818-4181-8181-181818181811',
      workspace_id: WS,
      job_id: '55555555-5555-4555-8555-555555555552',
      event_date: TODAY,
      start_time: '08:30',
      end_time: '12:00',
      title: 'Sebakwe dam — bathymetric line run',
      job_title: 'Sebakwe dam bathymetric line run',
      kind: 'survey',
      type: 'survey',
      location: 'Sebakwe dam wall, Kwekwe',
      status: 'scheduled',
      jobs: { title: 'Sebakwe dam bathymetric line run' },
    },
    {
      id: '18181818-1818-4181-8181-181818181812',
      workspace_id: WS,
      job_id: JOB1,
      event_date: TODAY,
      start_time: '13:00',
      end_time: '15:30',
      title: 'Gweru — ground truthing of target #3',
      job_title: 'Gweru EO mineral screen + ground truthing',
      kind: 'field',
      type: 'field',
      location: 'Target #3, Gweru greenstone belt',
      status: 'scheduled',
      jobs: { title: 'Gweru EO mineral screen + ground truthing' },
    },
    {
      id: '18181818-1818-4181-8181-181818181813',
      workspace_id: WS,
      job_id: '55555555-5555-4555-8555-555555555553',
      event_date: TODAY,
      start_time: null,
      end_time: null,
      title: 'Shurugwi — beacon schedule handover',
      job_title: 'Shurugwi farm boundary subdivision',
      kind: 'delivery',
      type: 'delivery',
      location: 'Shurugwi district office',
      status: 'scheduled',
      jobs: { title: 'Shurugwi farm boundary subdivision' },
    },
  ],
  folders: [{ id: FOLDER1, workspace_id: WS, name: 'Surveys 2026', parent_id: null, created_at: daysAgo(60) }],
  tags: [
    { id: TAG1, workspace_id: WS, name: 'deliverable', color: '#2563eb' },
    { id: TAG2, workspace_id: WS, name: 'anchored', color: '#16a34a' },
  ],
  attachments: [
    {
      id: ATT1, workspace_id: WS, folder_id: null, deleted_at: null,
      storage_path: 'surveys/2026-11/gweru-control-network-adjustment.pdf',
      mime_type: 'application/pdf', size_bytes: 2411724, created_at: daysAgo(2),
      content_hash: HASH1, bucket_name: 'workspace-private',
      chain_status: 'anchored', chain_tx_signature: TX1, chain_network: 'devnet',
      anchor_mode: 'hash', anchor_operation_id: ANCH1, anchor_fee_lamports: 5000,
      uploaded_by: U,
    },
    {
      id: ATT2, workspace_id: WS, folder_id: null, deleted_at: null,
      storage_path: 'surveys/2026-11/sebakwe-bathymetry-soundings.csv',
      mime_type: 'text/csv', size_bytes: 884213, created_at: daysAgo(1),
      content_hash: HASH2, bucket_name: 'workspace-private',
      chain_status: 'pending', chain_tx_signature: TX2, chain_network: 'devnet',
      anchor_mode: 'hash', anchor_operation_id: ANCH2, anchor_fee_lamports: 5000,
      uploaded_by: U,
    },
    {
      id: ATT3, workspace_id: WS, folder_id: null, deleted_at: null,
      storage_path: 'surveys/2026-10/shurugwi-boundary-beacon-schedule.pdf',
      mime_type: 'application/pdf', size_bytes: 1310720, created_at: daysAgo(12),
      content_hash: HASH3, bucket_name: 'workspace-private',
      chain_status: 'failed', chain_tx_signature: null, chain_network: 'devnet',
      anchor_mode: 'hash', anchor_operation_id: ANCH3, anchor_fee_lamports: 5000,
      uploaded_by: U,
    },
    {
      id: ATT4, workspace_id: WS, folder_id: null, deleted_at: null,
      storage_path: 'surveys/2026-11/gweru-mineral-prospectivity-dossier.pdf',
      mime_type: 'application/pdf', size_bytes: 3670016, created_at: daysAgo(0),
      content_hash: null, bucket_name: 'workspace-private',
      chain_status: 'none', chain_tx_signature: null, chain_network: null,
      anchor_mode: null, anchor_operation_id: null, anchor_fee_lamports: null,
      uploaded_by: U,
    },
  ],
  attachment_tags: [
    { attachment_id: ATT1, tag_id: TAG1, tags: { id: TAG1, name: 'deliverable', color: '#2563eb' } },
    { attachment_id: ATT1, tag_id: TAG2, tags: { id: TAG2, name: 'anchored', color: '#16a34a' } },
    { attachment_id: ATT4, tag_id: TAG1, tags: { id: TAG1, name: 'deliverable', color: '#2563eb' } },
  ],
  attachment_versions: [],
  file_anchor_operations: [
    {
      id: ANCH4, workspace_id: WS, attachment_id: ATT1,
      file_name: 'gweru-control-network-adjustment.pdf',
      mode: 'hash', status: 'failed', network: 'devnet',
      fee_lamports: null, tx_signature: null, tx_slot: null,
      file_hash: HASH1, file_size_bytes: 2411724, mime_type: 'application/pdf',
      chunk_count: 1, chunk_size: 2411724, uploaded_chunks: 1,
      wallet_address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      verification_status: 'pending', verified_at: null,
      error_message: 'Transaction not confirmed within 90 s (blockhash expired). No fee was charged; retry is safe.',
      memo: 'sitesurveyor:hash:' + HASH1.slice(0, 32),
      created_by: U, created_at: daysAgo(3), completed_at: null, updated_at: daysAgo(3),
      encryption: 'none',
    },
    {
      id: ANCH1, workspace_id: WS, attachment_id: ATT1,
      file_name: 'gweru-control-network-adjustment.pdf',
      mode: 'hash', status: 'anchored', network: 'devnet',
      fee_lamports: 5000, tx_signature: TX1, tx_slot: 412883051,
      file_hash: HASH1, file_size_bytes: 2411724, mime_type: 'application/pdf',
      chunk_count: 1, chunk_size: 2411724, uploaded_chunks: 1,
      wallet_address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      verification_status: 'verified', verified_at: daysAgo(1),
      error_message: null, memo: 'sitesurveyor:hash:' + HASH1.slice(0, 32),
      created_by: U, created_at: daysAgo(2), completed_at: daysAgo(1), updated_at: daysAgo(1),
      encryption: 'none',
    },
    {
      id: ANCH2, workspace_id: WS, attachment_id: ATT2,
      file_name: 'sebakwe-bathymetry-soundings.csv',
      mode: 'hash', status: 'confirming', network: 'devnet',
      fee_lamports: 5000, tx_signature: TX2, tx_slot: null,
      file_hash: HASH2, file_size_bytes: 884213, mime_type: 'text/csv',
      chunk_count: 1, chunk_size: 884213, uploaded_chunks: 1,
      wallet_address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      verification_status: 'pending', verified_at: null,
      error_message: null, memo: 'sitesurveyor:hash:' + HASH2.slice(0, 32),
      created_by: U, created_at: daysAgo(1), completed_at: null, updated_at: daysAgo(0),
      encryption: 'none',
    },
    {
      id: ANCH3, workspace_id: WS, attachment_id: ATT3,
      file_name: 'shurugwi-boundary-beacon-schedule.pdf',
      mode: 'hash', status: 'failed', network: 'devnet',
      fee_lamports: 5000, tx_signature: null, tx_slot: null,
      file_hash: HASH3, file_size_bytes: 1310720, mime_type: 'application/pdf',
      chunk_count: 1, chunk_size: 1310720, uploaded_chunks: 1,
      wallet_address: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
      verification_status: 'mismatch', verified_at: null,
      error_message: 'On-chain memo failed re-read verification (corrupt memo). The ledger keeps the failure; re-anchor is the only remedy.',
      memo: 'sitesurveyor:hash:' + HASH3.slice(0, 32),
      created_by: U, created_at: daysAgo(12), completed_at: null, updated_at: daysAgo(10),
      encryption: 'none',
    },
  ],
  file_anchor_chunks: [],
  ai_conversations: [
    {
      id: CONV, title: 'Anchoring backlog & Gweru screen', session_key: 'dashboard',
      context: 'dashboard', created_at: daysAgo(0), updated_at: daysAgo(0),
    },
  ],
  ai_messages: [
    {
      id: '99999999-9999-4999-8999-999999999991', conversation_id: CONV, role: 'user',
      content: 'Which files still need anchoring before the Gweru handover?',
      created_at: daysAgo(0),
    },
    {
      id: '99999999-9999-4999-8999-999999999992', conversation_id: CONV, role: 'assistant',
      content:
        'I checked the workspace file ledger (4 deliverables). One is settled on devnet, one is confirming, and one failed verification:\n\n- **gweru-control-network-adjustment.pdf** — anchored, slot 412 883 051, memo verified.\n- **sebakwe-bathymetry-soundings.csv** — confirming; 12 confirmations so far.\n- **shurugwi-boundary-beacon-schedule.pdf** — failed: the on-chain memo did not survive re-read. The failure stays in the ledger; a re-anchor is the only remedy.\n- **gweru-mineral-prospectivity-dossier.pdf** — not anchored yet.\n\n[ASK]\nShall I draft the re-anchor operation for the beacon schedule?\n- Yes, draft it\n- Not now\n[/ASK]',
      created_at: daysAgo(0),
    },
    {
      id: '99999999-9999-4999-8999-999999999993', conversation_id: CONV, role: 'user',
      content: 'Not now. Summarise the mineral screen run instead.',
      created_at: daysAgo(0),
    },
    {
      id: '99999999-9999-4999-8999-999999999994', conversation_id: CONV, role: 'assistant',
      content:
        'The specimen run over the Gweru AOI scores **42.9/100 (very high)**. Iron oxide and bauxite-laterite are the strongest systems; chromite and nickel-PGM are not indicated at the p90 band. Eight ranked targets survived the 500 m spacing rule; target #3 is the closest to the client cell at 1.1 km. Scores are percentiles within this survey area, not grades or tonnages. Open in Satellite Workbench to review the ranked targets and deliverables.\n\n[WORKBENCH runId=' + RUN1 + ' jobId=' + JOB1 + ' projectId=' + PROJ1 + ']',
      created_at: daysAgo(0),
    },
  ],
  marketplace_listings: [
    {
      id: LIST1, workspace_id: WS2, asset_id: ASSET1, is_global: true,
      name: 'Leica TS16 total station (hire)', type: 'total_station', condition: 'good',
      seller: 'Kwekwe Instrument Hire', location: 'Gweru, Zimbabwe', price: 45, currency: 'USD',
      listing_type: 'hire', category: 'survey_equipment',
      description: '1" reflectorless total station, calibrated 2026-01. Daily hire with tripod and two prisms; operator available at extra cost.',
      specs: ['1" angular accuracy', 'Reflectorless 1000 m', 'Calibrated 2026-01'],
      created_at: daysAgo(20),
      assets: { status: 'available', photos: ['/fixtures/media/total-station.jpg'] },
    },
    {
      id: LIST2, workspace_id: WS2, asset_id: ASSET2, is_global: true,
      name: 'Trimble R12i GNSS rover (hire)', type: 'gnss_receiver', condition: 'excellent',
      seller: 'Kwekwe Instrument Hire', location: 'Kwekwe, Zimbabwe', price: 38, currency: 'USD',
      listing_type: 'hire', category: 'survey_equipment',
      description: 'RTK rover with IMU tilt compensation, network or base corrections. Includes controller and pole.',
      specs: ['IMU tilt compensation', 'RTK 8 mm + 1 ppm', 'Controller included'],
      created_at: daysAgo(16),
      assets: { status: 'deployed', photos: ['/fixtures/media/gnss-rover.jpg'] },
    },
    {
      id: LIST3, workspace_id: WS3, asset_id: ASSET3, is_global: true,
      name: 'DJI M350 RTK + Zenmuse P1 (sale)', type: 'uav', condition: 'good',
      seller: 'Midlands UAV Services', location: 'Gweru, Zimbabwe', price: 6900, currency: 'USD',
      listing_type: 'sale', category: 'photogrammetry',
      description: 'Photogrammetry kit: airframe, P1 45 MP full-frame payload, two battery sets and case. 210 flight hours, full service history.',
      specs: ['45 MP full-frame', 'RTK/PPK', '210 flight hours'],
      created_at: daysAgo(8),
      assets: { status: 'maintenance', photos: ['/fixtures/media/uav.jpg'] },
    },
  ],
  marketplace_requests: [],
  payment_methods: [],
  payments: [],
  workspace_pesepay_wallets: [
    { id: '19191919-1919-4191-8191-191919191911', workspace_id: WS, balance: 12.5, currency_code: 'USD', updated_at: now },
  ],
  billing_packages: [
    { id: PKG1, label: 'Field credits — 20', amount: 19, credits: 20, storage_mb: null, duration_days: null, kind: 'ai_credits', description: 'Twenty AI credits for screening runs and agent work. Roughly five mineral screens at specimen AOI size.', active: true, sort_order: 1, currency_code: 'USD' },
    { id: PKG2, label: 'Field credits — 60', amount: 49, credits: 60, storage_mb: null, duration_days: null, kind: 'ai_credits', description: 'Sixty AI credits at the working rate. Best value for a field season of screening and dossier work.', active: true, sort_order: 2, currency_code: 'USD' },
    { id: PKG3, label: 'Storage +1 GB / 90 days', amount: 9, credits: null, storage_mb: 1024, duration_days: 90, kind: 'storage', description: 'One extra gigabyte of private deliverable storage for ninety days, on top of the workspace base quota.', active: true, sort_order: 3, currency_code: 'USD' },
  ],
  workspace_ai_credit_transactions: [
    { id: '20202020-2020-4202-8202-202020202021', workspace_id: WS, kind: 'purchase', description: 'Card checkout · PesePay sandbox · field credits 100', credits_delta: 100, balance_after: 100, created_at: daysAgo(6) },
    { id: '20202020-2020-4202-8202-202020202022', workspace_id: WS, kind: 'usage', description: 'Mineral prospectivity · specimen AOI (695 km²)', credits_delta: -4, balance_after: 96, created_at: daysAgo(0) },
  ],
  workspace_storage_purchases: [],
  workspace_pesepay_transactions: [
    {
      id: '21212121-2121-4212-8212-212121212121', workspace_id: WS, kind: 'package_purchase',
      description: 'Field credits — 100', amount: 79, currency_code: 'USD', status: 'completed',
      provider_status: 'SUCCESS', package_id: PKG2, credit_amount: 100, storage_mb: null, duration_days: null,
      estimated_payment_fee: 2.4, estimated_infrastructure_cost: 0.6, pesepay_reference: 'PP-SBX-88412',
      refunded_at: null, refund_reason: null, created_at: daysAgo(6), completed_at: daysAgo(6),
    },
    {
      id: '21212121-2121-4212-8212-212121212122', workspace_id: WS, kind: 'wallet_deposit',
      description: 'Prepaid balance top-up', amount: 12.5, currency_code: 'USD', status: 'completed',
      provider_status: 'SUCCESS', package_id: null, credit_amount: null, storage_mb: null, duration_days: null,
      estimated_payment_fee: 0.5, estimated_infrastructure_cost: 0.1, pesepay_reference: 'PP-SBX-87990',
      refunded_at: null, refund_reason: null, created_at: daysAgo(30), completed_at: daysAgo(30),
    },
  ],
}

for (const rows of Object.values(tables)) {
  for (const r of rows) if (!('_deleted' in r)) r._deleted = false
}

export const rpcResults: Record<string, unknown> = {
  get_workspace_storage_usage: {
    used_mb: 7.6, limit_mb: 1024, percent: 0.7, file_count: 4,
    over_quota: false, upload_allowed: true, base_limit_mb: 1024, expiring_storage_mb: 0,
  },
  list_workspace_activity_log: [
    { id: '22222222-2222-4222-8222-222222222221', created_at: daysAgo(0), actor_name: 'Tendai Moyo', action: 'attachment.upload', entity_label: 'gweru-mineral-prospectivity-dossier.pdf', detail: '3.5 MB · private bucket' },
    { id: '22222222-2222-4222-8222-222222222222', created_at: daysAgo(1), actor_name: 'Tendai Moyo', action: 'anchor.anchored', entity_label: 'gweru-control-network-adjustment.pdf', detail: 'devnet · slot 412 883 051' },
    { id: '22222222-2222-4222-8222-222222222223', created_at: daysAgo(10), actor_name: 'Tendai Moyo', action: 'anchor.failed', entity_label: 'shurugwi-boundary-beacon-schedule.pdf', detail: 'memo re-read mismatch' },
  ],
  get_workspace_billing_overview: {},
}