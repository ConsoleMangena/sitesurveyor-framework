import { rpcResults, session, tables, user } from './fixtures'

export const SUPABASE_URL = 'https://offline.invalid'
export const SUPABASE_ANON_KEY = 'offline-harness-anon-key'
export const isOnline = (): boolean => true

type Row = Record<string, unknown>

function coerce(v: string): unknown {
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null') return null
  return v
}

class Query {
  private filters: Array<(r: Row) => boolean> = []
  private orders: Array<[string, boolean]> = []
  private lim: number | null = null
  private off = 0
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: unknown = null
  private wantSingle = false
  private wantMaybe = false

  constructor(private table: string) {}

  select(_cols?: string, _opts?: unknown) { return this }
  insert(data: unknown) { this.mode = 'insert'; this.payload = data; return this }
  update(data: unknown) { this.mode = 'update'; this.payload = data; return this }
  upsert(data: unknown) { this.mode = 'insert'; this.payload = data; return this }
  delete() { this.mode = 'delete'; return this }

  private cmp(key: string, op: string, value: unknown): (r: Row) => boolean {
    const get = (r: Row) => r[key]
    switch (op) {
      case 'eq': return (r) => get(r) === value
      case 'neq': return (r) => get(r) !== value
      case 'is': return (r) => (get(r) ?? null) === (value ?? null)
      case 'in': return (r) => (value as unknown[]).includes(get(r))
      case 'gt': return (r) => (get(r) as number) > (value as number)
      case 'gte': return (r) => (get(r) as number) >= (value as number)
      case 'lt': return (r) => (get(r) as number) < (value as number)
      case 'lte': return (r) => (get(r) as number) <= (value as number)
      case 'like': case 'ilike': {
        const re = new RegExp('^' + String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', op === 'ilike' ? 'i' : '')
        return (r) => re.test(String(get(r) ?? ''))
      }
      case 'not.in': {
        const list = String(value).replace(/^\(|\)$/g, '').split(',').map(coerce)
        return (r) => !list.includes(get(r))
      }
      default: return () => true
    }
  }

  eq(k: string, v: unknown) { this.filters.push(this.cmp(k, 'eq', v)); return this }
  neq(k: string, v: unknown) { this.filters.push(this.cmp(k, 'neq', v)); return this }
  is(k: string, v: unknown) { this.filters.push(this.cmp(k, 'is', v)); return this }
  in(k: string, v: unknown[]) { this.filters.push(this.cmp(k, 'in', v)); return this }
  gt(k: string, v: unknown) { this.filters.push(this.cmp(k, 'gt', v)); return this }
  gte(k: string, v: unknown) { this.filters.push(this.cmp(k, 'gte', v)); return this }
  lt(k: string, v: unknown) { this.filters.push(this.cmp(k, 'lt', v)); return this }
  lte(k: string, v: unknown) { this.filters.push(this.cmp(k, 'lte', v)); return this }
  like(k: string, v: unknown) { this.filters.push(this.cmp(k, 'like', v)); return this }
  ilike(k: string, v: unknown) { this.filters.push(this.cmp(k, 'ilike', v)); return this }
  not(k: string, op: string, v: unknown) { this.filters.push(this.cmp(k, 'not.' + op, v)); return this }
  contains(k: string, v: unknown) { this.filters.push((r) => JSON.stringify(r[k] ?? []).includes(JSON.stringify(v).slice(1, -1))); return this }
  or(expr: string) {
    const parts = expr.split(',').map((p) => p.trim()).filter(Boolean)
    this.filters.push((r) => parts.some((p) => {
      const [k, op, ...rest] = p.split('.')
      return this.cmp(k, op, coerce(rest.join('.')))(r)
    }))
    return this
  }
  filter(k: string, op: string, v: unknown) { this.filters.push(this.cmp(k, op, v)); return this }
  order(k: string, opts?: { ascending?: boolean }) { this.orders.push([k, opts?.ascending !== false]); return this }
  limit(n: number) { this.lim = n; return this }
  range(from: number, to: number) { this.off = from; this.lim = to - from + 1; return this }
  single() { this.wantSingle = true; return this }
  maybeSingle() { this.wantMaybe = true; return this }

  private run(): { data: unknown; error: unknown; count?: number } {
    const store = (tables[this.table] ??= [])
    if (this.mode === 'insert') {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[]
      const added = items.map((it) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...it,
      }))
      store.push(...added)
      return { data: this.wantSingle || this.wantMaybe ? added[0] : added, error: null }
    }
    let rows = store.filter((r) => this.filters.every((f) => f(r)))
    if (this.mode === 'update') {
      const patch = this.payload as Row
      rows = rows.map((r) => Object.assign(r, patch, { updated_at: new Date().toISOString() }))
      return { data: this.wantSingle || this.wantMaybe ? (rows[0] ?? null) : rows, error: null }
    }
    if (this.mode === 'delete') {
      tables[this.table] = store.filter((r) => !this.filters.every((f) => f(r)))
      return { data: rows, error: null }
    }
    for (const [k, asc] of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[k] as string | number | null
        const bv = b[k] as string | number | null
        const c = av == null ? -1 : bv == null ? 1 : typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
        return asc ? c : -c
      })
    }
    const count = rows.length
    if (this.off) rows = rows.slice(this.off)
    if (this.lim != null) rows = rows.slice(0, this.lim)
    if (this.wantSingle) {
      return rows.length ? { data: rows[0], error: null } : { data: null, error: { message: `no rows in ${this.table}` } }
    }
    if (this.wantMaybe) return { data: rows[0] ?? null, error: null }
    return { data: rows, error: null, count }
  }

  then<T>(onOk: (v: { data: unknown; error: unknown; count?: number }) => T, onErr?: (e: unknown) => T) {
    return Promise.resolve().then(() => this.run()).then(onOk, onErr)
  }
}

function currentSession() {
  const p = window.location.pathname
  if (p === '/login' || p === '/signup' || p === '/forgot-password') return null
  return session
}

const auth = {
  getSession: async () => ({ data: { session: currentSession() }, error: null }),
  getUser: async () => ({ data: { user: currentSession()?.user ?? null }, error: null }),
  onAuthStateChange: (_cb: unknown) => ({ data: { subscription: { unsubscribe() {} } } }),
  signOut: async () => ({ error: null }),
  signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: 'Offline harness: sign-in disabled.' } }),
  signInWithOAuth: async () => ({ data: { url: null, provider: '' }, error: { message: 'Offline harness: OAuth disabled.' } }),
  signUp: async () => ({ data: { user: null, session: null }, error: { message: 'Offline harness: sign-up disabled.' } }),
  resetPasswordForEmail: async () => ({ data: {}, error: { message: 'Offline harness: email disabled.' } }),
  updateUser: async () => ({ data: { user }, error: null }),
  exchangeCodeForSession: async () => ({ data: { session: null }, error: { message: 'Offline harness.' } }),
  verifyOtp: async () => ({ data: { session: null }, error: { message: 'Offline harness.' } }),
  startAutoRefresh: () => {},
  stopAutoRefresh: () => {},
}

function storageBucket(bucket: string) {
  const url = (p: string) => (p.startsWith('/') || p.startsWith('http') ? p : `/fixtures/media/${p}`)
  return {
    getPublicUrl: (p: string) => ({ data: { publicUrl: url(p) } }),
    createSignedUrl: async (p: string, _ttl: number) => ({ data: { signedUrl: url(p) }, error: null }),
    createSignedUrls: async (ps: string[], _ttl: number) => ({ data: ps.map((p) => ({ path: p, signedUrl: url(p) })), error: null }),
    upload: async (p: string, _f: unknown) => ({ data: { path: p }, error: null }),
    update: async (p: string, _f: unknown) => ({ data: { path: p }, error: null }),
    remove: async (_ps: string[]) => ({ data: [], error: null }),
    list: async (_p: string) => ({ data: [], error: null }),
    download: async (p: string) => ({ data: new Blob(), error: null }),
    bucket,
  }
}

export const supabase = {
  from: (table: string) => new Query(table),
  rpc: async (name: string, _args?: unknown) => ({ data: rpcResults[name] ?? null, error: null }),
  auth,
  storage: { from: storageBucket },
  channel: (_name: string) => ({
    on() { return this },
    subscribe(cb?: (s: string) => void) { if (cb) setTimeout(() => cb('SUBSCRIBED'), 0); return this },
    unsubscribe() { return this },
  }),
  removeChannel: (_c: unknown) => {},
  functions: {
    invoke: async (_n: string, _a?: unknown) => ({ data: null, error: { message: 'Offline harness: edge functions disabled.' } }),
  },
  rest: () => ({}),
}

export function getRecoveryClient() {
  return supabase
}