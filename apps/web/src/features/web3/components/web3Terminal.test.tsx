import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/supabase/client.ts", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { MarketTicker } from "./MarketTicker.tsx";
import { MarketStatTiles } from "./MarketStatTiles.tsx";
import { SolanaMarketChart } from "./SolanaMarketChart.tsx";
import { Web3MarketTerminal } from "./Web3MarketTerminal.tsx";
import { PortfolioPanel } from "./PortfolioPanel.tsx";
import { EMPTY_MARKET_SNAPSHOT } from "../data/solanaMarket.ts";
import type { SolanaMarketSnapshot } from "../data/solanaMarket.ts";
import type { PortfolioSnapshot } from "../data/portfolio.ts";

const SNAPSHOT: SolanaMarketSnapshot = {
  ...EMPTY_MARKET_SNAPSHOT,
  price: 105.03,
  change24h: -1.56,
  marketCap: 61_888_000_000,
  volume24h: 2_830_000_000,
  tvl: 5_909_000_000,
  epoch: 1064,
  slot: 460_069_223,
  updatedAt: 1_700_000_000_000,
};

const PORTFOLIO: PortfolioSnapshot = {
  address: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  totalValue: 1_234.56,
  change24h: 2.5,
  tokens: [
    {
      mint: "So11111111111111111111111111111111111111112",
      symbol: "SOL",
      name: "Solana",
      amount: 10,
      decimals: 9,
      price: 104.5,
      value: 1_045,
      change24h: 2.5,
      allocation: 84.6,
      icon: null,
    },
    {
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      symbol: "USDC",
      name: "USD Coin",
      amount: 189.56,
      decimals: 6,
      price: 1,
      value: 189.56,
      change24h: 0.1,
      allocation: 15.4,
      icon: null,
    },
  ],
  updatedAt: 1_700_000_000_000,
  partial: false,
};

describe("MarketTicker", () => {
  it("renders the live Solana market cells", () => {
    render(
      <MarketTicker
        snapshot={SNAPSHOT}
        loading={false}
        error={null}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText("SOL price")).toBeInTheDocument();
    expect(screen.getByText("$105.03")).toBeInTheDocument();
    expect(screen.getByText("-1.56%")).toBeInTheDocument();
    expect(screen.getByText("$61.89B")).toBeInTheDocument();
    expect(screen.getByText("$5.91B")).toBeInTheDocument();
    expect(screen.getByText("#1064")).toBeInTheDocument();
    expect(screen.getByText("460,069,223")).toBeInTheDocument();
  });

  it("flags an unavailable feed", () => {
    render(
      <MarketTicker
        snapshot={EMPTY_MARKET_SNAPSHOT}
        loading={false}
        error="Market data is unavailable right now."
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("Market data is unavailable right now."),
    ).toBeInTheDocument();
  });
});

describe("PortfolioPanel", () => {
  it("asks for a wallet when none is connected", () => {
    render(
      <MemoryRouter>
        <PortfolioPanel
          address={null}
          snapshot={PORTFOLIO}
          loading={false}
          error={null}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("No wallet connected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /connect wallet/i })).toBeInTheDocument();
  });

  it("renders value, allocation and holdings for a connected wallet", () => {
    render(
      <MemoryRouter>
        <PortfolioPanel
          address={PORTFOLIO.address}
          snapshot={PORTFOLIO}
          loading={false}
          error={null}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("$1,234.56")).toBeInTheDocument();
    expect(screen.getByText("+2.50%")).toBeInTheDocument();
    expect(screen.getByText("84.6%")).toBeInTheDocument();
    // The symbol shows up in both the allocation list and the holdings list.
    expect(screen.getAllByText("SOL").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("USDC").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/read-only · updates every 60s/)).toBeInTheDocument();
  });
});

describe("MarketStatTiles", () => {
  it("renders price, volume, TVL and chain state", () => {
    render(<MarketStatTiles snapshot={SNAPSHOT} />);

    expect(screen.getByText("SOL price")).toBeInTheDocument();
    expect(screen.getByText("Market cap")).toBeInTheDocument();
    expect(screen.getByText("24h volume")).toBeInTheDocument();
    expect(screen.getByText("Solana DeFi TVL")).toBeInTheDocument();
    expect(screen.getByText("Chain state")).toBeInTheDocument();
    expect(screen.getByText("Epoch 1064")).toBeInTheDocument();
  });
});

describe("SolanaMarketChart", () => {
  it("renders Solana candlestick chart and controls", () => {
    render(<SolanaMarketChart snapshot={SNAPSHOT} />);

    expect(screen.getByText("Solana")).toBeInTheDocument();
    expect(screen.getByText("SOL / USD")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1H" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "24H" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30D" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Candlestick Chart" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Line Area Chart" })).toBeInTheDocument();
  });

  it("switches to USDC candlesticks when USDC asset tab is clicked", () => {
    render(<SolanaMarketChart snapshot={SNAPSHOT} />);

    const usdcTab = screen.getByRole("tab", { name: /USDC/i });
    expect(usdcTab).toBeInTheDocument();
    fireEvent.click(usdcTab);

    expect(screen.getByText("USD Coin")).toBeInTheDocument();
    expect(screen.getByText("USDC / USD")).toBeInTheDocument();
    expect(screen.getByText("Powered by Solana Mainnet Data Feed (USDC SPL)")).toBeInTheDocument();
  });
});

describe("Web3MarketTerminal", () => {
  it("renders unified terminal with SOL and USDC asset tabs", () => {
    render(
      <Web3MarketTerminal
        snapshot={SNAPSHOT}
        loading={false}
        error={null}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText("Web3 Market Terminal")).toBeInTheDocument();
    expect(screen.getByText("Solana Mainnet")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /SOL/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /USDC/i })).toBeInTheDocument();
    expect(screen.getByText("Solana On-Chain Telemetry")).toBeInTheDocument();
    expect(screen.getByText("SiteSurveyor SPL Settlement")).toBeInTheDocument();
  });

  it("switches active token between SOL and USDC in terminal", () => {
    render(
      <Web3MarketTerminal
        snapshot={SNAPSHOT}
        loading={false}
        error={null}
        onRefresh={() => {}}
      />,
    );

    const usdcTab = screen.getByRole("tab", { name: /USDC/i });
    fireEvent.click(usdcTab);

    expect(screen.getAllByText("USD Coin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("USDC / USD").length).toBeGreaterThanOrEqual(1);
  });

  it("collapses and expands technical chart view", () => {
    render(
      <Web3MarketTerminal
        snapshot={SNAPSHOT}
        loading={false}
        error={null}
        onRefresh={() => {}}
      />,
    );

    const toggleBtn = screen.getByRole("button", { name: /Collapse Chart/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("Show Technical Candlestick Chart →")).toBeInTheDocument();

    const expandBtn = screen.getByText("Show Technical Candlestick Chart →");
    fireEvent.click(expandBtn);

    expect(screen.getByText("Web3 Market Terminal")).toBeInTheDocument();
  });
});
