/**
 * Web3 portfolio for a connected Solana wallet: SPL token holdings valued in
 * USD, allocation weights and a weighted 24h change.
 *
 * Token accounts come from the Solana RPC (through the `solana-data` edge
 * function); prices come from DexScreener with a CoinGecko fallback. Everything
 * degrades gracefully: a wallet whose RPC call fails yields an empty snapshot
 * instead of breaking the page.
 */

import { solanaRpc } from "./solanaRpc.ts";

export interface PortfolioToken {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  decimals: number;
  price: number | null;
  value: number | null;
  change24h: number | null;
  allocation: number;
  icon: string | null;
}

export interface PortfolioSnapshot {
  address: string;
  totalValue: number | null;
  change24h: number | null;
  tokens: PortfolioToken[];
  updatedAt: number;
  /** True when at least one holding could not be priced. */
  partial: boolean;
}

export const EMPTY_PORTFOLIO: PortfolioSnapshot = {
  address: "",
  totalValue: null,
  change24h: null,
  tokens: [],
  updatedAt: 0,
  partial: false,
};

export const SOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const LAMPORTS_PER_SOL = 1_000_000_000;
const MAX_PRICED_TOKENS = 15;
const FETCH_TIMEOUT_MS = 10_000;

/** Below this USD value a holding is treated as dust and dropped. */
const DUST_USD = 0.01;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Normalises `getParsedTokenAccountsByOwner` (or the token-2022 equivalent)
 * into raw holdings. Accounts with a zero amount are dropped.
 */
export function parseTokenAccounts(payload: unknown): {
  mint: string;
  amount: number;
  decimals: number;
}[] {
  const accounts = (payload as { value?: unknown[] } | null)?.value;
  if (!Array.isArray(accounts)) return [];

  const byMint = new Map<string, { mint: string; amount: number; decimals: number }>();

  for (const account of accounts) {
    const info = (
      account as {
        account?: {
          data?: {
            parsed?: {
              info?: {
                mint?: string;
                tokenAmount?: { amount?: string; decimals?: number };
              };
            };
          };
        };
      }
    ).account?.data?.parsed?.info;
    const mint = info?.mint;
    const rawAmount = info?.tokenAmount?.amount;
    const decimals = info?.tokenAmount?.decimals;
    if (!mint || typeof rawAmount !== "string") continue;

    const amount = Number(rawAmount) / 10 ** (decimals ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const existing = byMint.get(mint);
    byMint.set(mint, {
      mint,
      amount: (existing?.amount ?? 0) + amount,
      decimals: decimals ?? 0,
    });
  }

  return [...byMint.values()];
}

interface DexScreenerQuote {
  price: number | null;
  change24h: number | null;
  symbol: string | null;
  name: string | null;
  icon: string | null;
}

/** Picks the deepest DexScreener pair for a mint and extracts its quote. */
export function parseDexScreenerQuote(
  payload: unknown,
): DexScreenerQuote | null {
  const pairs = (payload as { pairs?: unknown[] } | null)?.pairs;
  if (!Array.isArray(pairs) || pairs.length === 0) return null;

  const best = pairs
    .map((pair) => pair as { liquidity?: { usd?: number }; priceUsd?: string; priceChange?: { h24?: number }; baseToken?: { symbol?: string; name?: string; image?: string } })
    .sort(
      (a, b) =>
        (asFiniteNumber(b.liquidity?.usd) ?? 0) -
        (asFiniteNumber(a.liquidity?.usd) ?? 0),
    )[0];

  const price = asFiniteNumber(Number(best.priceUsd));
  const change24h = asFiniteNumber(best.priceChange?.h24);

  return {
    price,
    change24h,
    symbol: best.baseToken?.symbol ?? null,
    name: best.baseToken?.name ?? null,
    icon: best.baseToken?.image ?? null,
  };
}

/** CoinGecko fallback pricing for a batch of Solana token mints. */
export async function fetchCoinGeckoTokenPrices(
  mints: string[],
): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  const url = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${mints.join(",")}&vs_currencies=usd`;
  try {
    const payload = (await fetchJson(url)) as Record<string, { usd?: number }>;
    const prices: Record<string, number> = {};
    for (const [mint, entry] of Object.entries(payload ?? {})) {
      const value = asFiniteNumber(entry?.usd);
      if (value !== null) prices[mint] = value;
    }
    return prices;
  } catch {
    return {};
  }
}

async function fetchSolBalance(address: string): Promise<number | null> {
  const result = await solanaRpc<{ value?: number }>("getBalance", [address]);
  const lamports = asFiniteNumber(result?.value);
  if (lamports === null) return null;
  return lamports / LAMPORTS_PER_SOL;
}

async function fetchTokenHoldings(address: string) {
  const [legacy, token2022] = await Promise.all([
    solanaRpc<{ value?: unknown[] }>("getTokenAccountsByOwner", [
      address,
      { programId: TOKEN_PROGRAM },
      { encoding: "jsonParsed" },
    ]),
    solanaRpc<{ value?: unknown[] }>("getTokenAccountsByOwner", [
      address,
      { programId: TOKEN_2022_PROGRAM },
      { encoding: "jsonParsed" },
    ]),
  ]);

  return [...parseTokenAccounts(legacy), ...parseTokenAccounts(token2022)];
}

/** Builds the portfolio snapshot for a wallet address. */
export async function fetchPortfolio(address: string): Promise<PortfolioSnapshot> {
  const trimmed = address.trim();
  if (!trimmed) return { ...EMPTY_PORTFOLIO };

  const [solAmount, holdings] = await Promise.all([
    fetchSolBalance(trimmed),
    fetchTokenHoldings(trimmed),
  ]);

  const holdingsByMint = new Map<string, { amount: number; decimals: number }>();
  for (const holding of holdings) {
    const existing = holdingsByMint.get(holding.mint);
    holdingsByMint.set(holding.mint, {
      amount: (existing?.amount ?? 0) + holding.amount,
      decimals: existing?.decimals ?? holding.decimals,
    });
  }

  const rawTokens: PortfolioToken[] = [];
  if (solAmount !== null && solAmount > 0) {
    rawTokens.push({
      mint: SOL_MINT,
      symbol: "SOL",
      name: "Solana",
      amount: solAmount,
      decimals: 9,
      price: null,
      value: null,
      change24h: null,
      allocation: 0,
      icon: null,
    });
  }
  for (const [mint, holding] of holdingsByMint) {
    rawTokens.push({
      mint,
      symbol: mint.slice(0, 4),
      name: mint.slice(0, 6),
      amount: holding.amount,
      decimals: holding.decimals,
      price: null,
      value: null,
      change24h: null,
      allocation: 0,
      icon: null,
    });
  }

  if (rawTokens.length === 0) {
    return { ...EMPTY_PORTFOLIO, address: trimmed, updatedAt: Date.now() };
  }

  // Price the holdings: DexScreener first (covers long-tail SPL tokens),
  // CoinGecko for anything DexScreener does not know.
  const priceable = rawTokens.slice(0, MAX_PRICED_TOKENS);
  const quotes = await Promise.all(
    priceable.map(async (token) => {
      try {
        const payload = await fetchJson(
          `https://api.dexscreener.com/latest/dex/tokens/${token.mint}`,
        );
        return parseDexScreenerQuote(payload);
      } catch {
        return null;
      }
    }),
  );

  const missing = priceable
    .filter((_, index) => !quotes[index]?.price)
    .map((token) => token.mint);
  const fallbackPrices = await fetchCoinGeckoTokenPrices(missing);

  const priced: PortfolioToken[] = priceable.map((token, index) => {
    const quote = quotes[index];
    const price = quote?.price ?? fallbackPrices[token.mint] ?? null;
    return {
      ...token,
      symbol: quote?.symbol ?? token.symbol,
      name: quote?.name ?? token.name,
      icon: quote?.icon ?? null,
      price,
      value: price === null ? null : price * token.amount,
      change24h: quote?.change24h ?? null,
    };
  });

  const unpriced = rawTokens.slice(MAX_PRICED_TOKENS).map((token) => ({
    ...token,
    value: null,
  }));

  const all = [...priced, ...unpriced];
  const valued = all.filter((token) => token.value !== null);
  const totalValue = valued.reduce((sum, token) => sum + (token.value ?? 0), 0);

  const withAllocation = all
    .map((token) => ({
      ...token,
      allocation:
        token.value !== null && totalValue > 0
          ? (token.value / totalValue) * 100
          : 0,
    }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) {
        return b.amount - a.amount;
      }
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value;
    });

  const tokens = withAllocation.filter(
    (token) => (token.value ?? 0) >= DUST_USD || token.price === null,
  );

  const weightedChange =
    totalValue > 0
      ? valued.reduce(
          (sum, token) => sum + (token.value ?? 0) * (token.change24h ?? 0),
          0,
        ) / totalValue
      : null;

  return {
    address: trimmed,
    totalValue: valued.length > 0 ? totalValue : null,
    change24h: weightedChange,
    tokens,
    updatedAt: Date.now(),
    partial: valued.length < all.length,
  };
}
