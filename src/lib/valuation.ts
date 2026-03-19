import type { AppConfig } from "../config.js";
import { fetchJsonWithTimeout } from "./http.js";

export interface AssetForValuation {
  type: "native" | "credit";
  code?: string;
  issuer?: string;
}

interface Sep38QuoteLike {
  buy_amount?: string;
  price?: string;
}

export function toSep38AssetString(asset: AssetForValuation): string {
  if (asset.type === "native") {
    return "stellar:native";
  }
  if (!asset.code || !asset.issuer) {
    throw new Error("Credit asset must include code and issuer.");
  }
  return `stellar:${asset.code}:${asset.issuer}`;
}

export function isCanonicalUsdcAsset(
  asset: AssetForValuation,
  usdcIssuer: string
): boolean {
  return (
    asset.type === "credit" &&
    (asset.code ?? "").toUpperCase() === "USDC" &&
    (asset.issuer ?? "").toUpperCase() === usdcIssuer.toUpperCase()
  );
}

export async function estimateUsdcValue(input: {
  amount: string;
  asset: AssetForValuation;
  config: AppConfig;
}): Promise<number | undefined> {
  const amount = Number.parseFloat(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  if (isCanonicalUsdcAsset(input.asset, input.config.usdcIssuer)) {
    return amount;
  }

  if (!input.config.sep38Url) {
    return undefined;
  }

  const sellAsset = toSep38AssetString(input.asset);
  const buyAsset = `stellar:USDC:${input.config.usdcIssuer}`;
  const query = new URLSearchParams({
    sell_asset: sellAsset,
    buy_asset: buyAsset,
    sell_amount: input.amount
  }).toString();

  const quote = await fetchJsonWithTimeout<Sep38QuoteLike>(
    `${input.config.sep38Url}?${query}`,
    { method: "GET", headers: { accept: "application/json" } },
    input.config.requestTimeoutMs
  );

  if (quote.buy_amount) {
    const parsed = Number.parseFloat(quote.buy_amount);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (quote.price) {
    const price = Number.parseFloat(quote.price);
    if (Number.isFinite(price)) {
      return amount * price;
    }
  }

  return undefined;
}
