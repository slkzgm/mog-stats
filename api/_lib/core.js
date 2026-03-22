import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://127.0.0.1:8080/v1/graphql";
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || "";
const ABS_SEARCH_ENDPOINT = "https://backend.portal.abs.xyz/api/search/global";
const ABS_SEARCH_BEARER = process.env.ABS_SEARCH_BEARER || "";
const MOG_RUNS_ENDPOINT = "https://mog.onchainheroes.xyz/api/runs";
const ABS_RPC_ENDPOINT = process.env.ABS_RPC_ENDPOINT || "https://api.mainnet.abs.xyz";
const KEY_PURCHASE_CONTRACT_ADDRESS = "0xBDE2483b242C266a97E39826b2B5B3c06FC02916";
const KEY_PURCHASE_TOPIC0 = "0x404d1f54ee326d5c061a2c9116c429c3dd776456700e045b563d2f68bea27089";
const DEFAULT_WEEKLY_SHARE_BPS = 6000;
const DEFAULT_WEEKLY_POOL_CACHE_MS = 45_000;
const ALLOWED_AVATAR_EXACT_HOSTS = new Set(["abs.xyz", "cdn.simplehash.com"]);
const ALLOWED_AVATAR_HOST_SUFFIXES = [".abs.xyz", ".seadn.io", ".simplehash.com"];
const CARD_IMAGE_WIDTH = 1600;
const CARD_IMAGE_HEIGHT = 900;
const CARD_BG_ASSET = "assets/bg-main.png";
const KEY_ICON_ASSET = "assets/key_big.png";
const JACKPOT_ICON_ASSET = "assets/jackpot_big.png";
const CARD_FONT_SANS_REGULAR_ASSET = "assets/fonts/NotoSans-Regular.ttf";
const CARD_FONT_SANS_BOLD_ASSET = "assets/fonts/NotoSans-Bold.ttf";
const CARD_FONT_MONO_REGULAR_ASSET = "assets/fonts/NotoSansMono-Regular.ttf";
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ASSETS_DIR = join(PROJECT_ROOT, "assets");
const CARD_FONT_FILES = [
  join(PROJECT_ROOT, CARD_FONT_SANS_REGULAR_ASSET),
  join(PROJECT_ROOT, CARD_FONT_SANS_BOLD_ASSET),
  join(PROJECT_ROOT, CARD_FONT_MONO_REGULAR_ASSET),
];
let cardRenderAssetsPromise = null;
let decorGifPathsPromise = null;
const rpcBlockTimestampCache = new Map();
const weeklyPoolEstimateCache = new Map();

const PLAYER_STATS_QUERY = `
query WalletOverview($wallet: String!) {
  PlayerStats(where: { wallet: { _eq: $wallet } }) {
    wallet
    profileName
    profileImageUrl
    profileVerification
    profileFetchAttempted
    keyPurchaseAmount
    keyPurchaseEvents
    keysPurchased
    weeklyClaimAmount
    weeklyClaimEvents
    jackpotClaimAmount
    jackpotClaimEvents
    firstSeenBlock
    updatedAtBlock
    updatedAtTimestamp
  }
}
`;

const PLAYER_STATS_QUERY_LEGACY = `
query WalletOverview($wallet: String!) {
  PlayerStats(where: { wallet: { _eq: $wallet } }) {
    wallet
    keyPurchaseAmount
    keyPurchaseEvents
    keysPurchased
    weeklyClaimAmount
    weeklyClaimEvents
    jackpotClaimAmount
    jackpotClaimEvents
    firstSeenBlock
    updatedAtBlock
    updatedAtTimestamp
  }
}
`;

const GLOBAL_STATS_AND_LEADERBOARD_QUERY = `
query GlobalStatsAndLeaderboard($limit: Int!, $offset: Int!) {
  GlobalStats(where: { id: { _eq: "global" } }) {
    totalUniquePlayers
    keyPurchaseEvents
    keysPurchased
    keyPurchaseAmount
    weeklyClaimEvents
    weeklyClaimAmount
    jackpotClaimEvents
    jackpotClaimAmount
    totalClaimAmount
    updatedAtTimestamp
  }
  PlayerStats(
    order_by: [{ totalClaimAmount: desc }, { keyPurchaseAmount: desc }, { wallet: asc }]
    limit: $limit
    offset: $offset
  ) {
    wallet
    profileName
    profileImageUrl
    profileVerification
    keysPurchased
    keyPurchaseEvents
    keyPurchaseAmount
    weeklyClaimEvents
    weeklyClaimAmount
    jackpotClaimEvents
    jackpotClaimAmount
    totalClaimAmount
  }
}
`;

const GLOBAL_STATS_AND_LEADERBOARD_QUERY_LEGACY = `
query GlobalStatsAndLeaderboard($limit: Int!, $offset: Int!) {
  GlobalStats(where: { id: { _eq: "global" } }) {
    totalUniquePlayers
    keyPurchaseEvents
    keysPurchased
    keyPurchaseAmount
    weeklyClaimEvents
    weeklyClaimAmount
    jackpotClaimEvents
    jackpotClaimAmount
    totalClaimAmount
    updatedAtTimestamp
  }
  PlayerStats(
    order_by: [{ totalClaimAmount: desc }, { keyPurchaseAmount: desc }, { wallet: asc }]
    limit: $limit
    offset: $offset
  ) {
    wallet
    keysPurchased
    keyPurchaseEvents
    keyPurchaseAmount
    weeklyClaimEvents
    weeklyClaimAmount
    jackpotClaimEvents
    jackpotClaimAmount
    totalClaimAmount
  }
}
`;

export const json = (res, statusCode, payload, cache = "no-store") => {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.end(JSON.stringify(payload));
};

export const getQueryParam = (req, key) => {
  if (req.query && key in req.query) {
    const value = req.query[key];
    if (Array.isArray(value)) return String(value[0] || "");
    return String(value || "");
  }

  try {
    const url = new URL(req.url || "", "http://localhost");
    return url.searchParams.get(key) || "";
  } catch {
    return "";
  }
};

export const readJsonBody = async (req) => {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  if (Buffer.isBuffer(req.body)) {
    const raw = req.body.toString("utf8");
    return raw ? JSON.parse(raw) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

export const methodNotAllowed = (res, allowed) => {
  res.setHeader("Allow", allowed);
  json(res, 405, { error: "Method not allowed" });
};

const toLimitedString = (value, maxLen = 120) =>
  typeof value === "string" ? value.trim().slice(0, maxLen) : "";

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const shortAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const normalizeEthString = (value, fallback = "0") => {
  const raw = toLimitedString(value, 40).replaceAll(",", ".");
  const clean = raw.replace(/[^0-9.+-]/g, "");
  if (!clean || clean === "." || clean === "+" || clean === "-" || clean === "+." || clean === "-.") {
    return fallback;
  }
  return clean;
};

const normalizeIntegerString = (value, fallback = "0") => {
  const clean = toLimitedString(value, 30).replace(/[^\d]/g, "");
  return clean || fallback;
};

const normalizeDecorGifPath = (value) => {
  const raw = toLimitedString(value, 160);
  if (!raw) return "";
  if (!raw.startsWith("/assets/")) return "";
  if (!raw.toLowerCase().endsWith(".gif")) return "";
  if (raw.includes("..")) return "";
  return raw;
};

const normalizeSearchUsers = (users) =>
  (users || [])
    .filter((user) => WALLET_REGEX.test(user.address || ""))
    .slice(0, 8)
    .map((user) => ({
      name: user.name || "",
      address: user.address.toLowerCase(),
      image: user.image || "",
      verification: user.verification || null,
    }));

export const fetchPlayerStats = async (wallet) => {
  try {
    const body = await fetchGraphql(PLAYER_STATS_QUERY, { wallet });
    return body.data?.PlayerStats?.[0] || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "GraphQL error";
    if (
      message.includes("profileName") ||
      message.includes("profileImageUrl") ||
      message.includes("profileVerification") ||
      message.includes("profileFetchAttempted")
    ) {
      const legacyBody = await fetchGraphql(PLAYER_STATS_QUERY_LEGACY, { wallet });
      return legacyBody.data?.PlayerStats?.[0] || null;
    }
    throw error;
  }
};

export const fetchGlobalStats = async (limit = 100, options = {}) => {
  const cappedLimit = Math.max(1, Math.min(200, Number.parseInt(String(limit), 10) || 100));
  const offset = Math.max(0, Number.parseInt(String(options?.offset ?? 0), 10) || 0);
  const includeCurrentWeekProjected = Boolean(options?.includeCurrentWeekProjected);
  let body;
  try {
    body = await fetchGraphql(GLOBAL_STATS_AND_LEADERBOARD_QUERY, { limit: cappedLimit, offset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GraphQL error";
    if (
      message.includes("profileName") ||
      message.includes("profileImageUrl") ||
      message.includes("profileVerification")
    ) {
      body = await fetchGraphql(GLOBAL_STATS_AND_LEADERBOARD_QUERY_LEGACY, { limit: cappedLimit, offset });
    } else if (message.includes("totalClaimAmount")) {
      throw new Error("Indexer schema is outdated. Deploy the latest mog-indexer and reindex to enable global stats.");
    } else {
      throw error;
    }
  }

  const payload = {
    global: body.data?.GlobalStats?.[0] || null,
    leaderboard: body.data?.PlayerStats || [],
  };

  if (includeCurrentWeekProjected && payload.global) {
    try {
      payload.currentWeekGlobalProjection = await fetchCurrentWeekGlobalProjection();
      payload.currentWeekGlobalProjectionError = null;
    } catch (error) {
      payload.currentWeekGlobalProjection = null;
      payload.currentWeekGlobalProjectionError =
        error instanceof Error ? error.message : "Projected global payout unavailable";
    }
  } else {
    payload.currentWeekGlobalProjection = null;
    payload.currentWeekGlobalProjectionError = null;
  }

  return payload;
};

const fetchGraphql = async (query, variables = {}) => {
  const headers = {
    "Content-Type": "application/json",
  };
  if (HASURA_ADMIN_SECRET) {
    headers["x-hasura-admin-secret"] = HASURA_ADMIN_SECRET;
  }

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL HTTP ${response.status}: ${text}`);
  }

  const body = await response.json();
  if (body.errors?.length) {
    throw new Error(body.errors[0].message || "GraphQL error");
  }

  return body;
};

const parseEnvInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const WEEKLY_POOL_SHARE_BPS = Math.max(0, Math.min(10_000, parseEnvInt(process.env.MOG_WEEKLY_POOL_SHARE_BPS, DEFAULT_WEEKLY_SHARE_BPS)));
const WEEKLY_POOL_CACHE_MS = Math.max(5_000, parseEnvInt(process.env.MOG_WEEKLY_POOL_CACHE_MS, DEFAULT_WEEKLY_POOL_CACHE_MS));

const parseHexInt = (value, fallback = 0) => {
  if (typeof value !== "string" || !value.startsWith("0x")) return fallback;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const fetchRunsWeeklyStats = async (wallet = "") => {
  const params = new URLSearchParams({
    mode: "weekly",
    sortBy: "treasure",
  });
  if (WALLET_REGEX.test(wallet)) {
    params.set("address", wallet);
  }

  const url = `${MOG_RUNS_ENDPOINT}?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Referer: "https://mog.onchainheroes.xyz/",
    },
  });

  if (!response.ok) {
    throw new Error(`MOG runs HTTP ${response.status}`);
  }

  const body = await response.json();
  const weekStart = typeof body?.weekStart === "string" ? body.weekStart : "";
  const weekEnd = typeof body?.weekEnd === "string" ? body.weekEnd : "";

  const weekStartMs = Date.parse(weekStart);
  const weekEndMs = Date.parse(weekEnd);
  if (!Number.isFinite(weekStartMs) || !Number.isFinite(weekEndMs)) {
    throw new Error("Invalid current week boundaries from MOG runs API");
  }

  return {
    weekNumber: parseNonNegativeInt(body?.weekNumber, 0),
    weekStart,
    weekEnd,
    weekStartSec: Math.floor(weekStartMs / 1000),
    weekEndSec: Math.floor(weekEndMs / 1000),
    userTreasure: parseNonNegativeInt(body?.userStats?.treasure, 0),
    totalGlobalTreasure: parseNonNegativeInt(body?.totalGlobalTreasure, 0),
  };
};

const absRpc = async (method, params) => {
  const response = await fetch(ABS_RPC_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ABS RPC HTTP ${response.status}: ${text}`);
  }

  const body = await response.json();
  if (body.error) {
    const message = body.error.message || "ABS RPC error";
    throw new Error(message);
  }

  return body.result;
};

const getLatestBlockNumber = async () => parseHexInt(await absRpc("eth_blockNumber", []), 0);

const getBlockTimestampSec = async (blockNumber) => {
  const cached = rpcBlockTimestampCache.get(blockNumber);
  if (cached !== undefined) return cached;

  const blockTag = `0x${blockNumber.toString(16)}`;
  const block = await absRpc("eth_getBlockByNumber", [blockTag, false]);
  const timestampSec = parseHexInt(block?.timestamp, 0);
  rpcBlockTimestampCache.set(blockNumber, timestampSec);
  return timestampSec;
};

const findFirstBlockAtOrAfterTimestamp = async (targetTimestampSec) => {
  let low = 0;
  let high = await getLatestBlockNumber();

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const ts = await getBlockTimestampSec(mid);
    if (ts < targetTimestampSec) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

const parseTotalPaidFromLog = (log) => {
  const raw = typeof log?.data === "string" ? log.data : "0x";
  const clean = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!clean) return 0n;
  const totalPaidHex = clean.slice(-64).padStart(64, "0");
  return BigInt(`0x${totalPaidHex}`);
};

const fetchKeysPurchasedLogs = async (fromBlock, toBlock) =>
  absRpc("eth_getLogs", [
    {
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      address: KEY_PURCHASE_CONTRACT_ADDRESS,
      topics: [KEY_PURCHASE_TOPIC0],
    },
  ]);

const sumKeysPurchasedTotalPaid = async (fromBlock, toBlock) => {
  if (fromBlock > toBlock) return 0n;

  try {
    const logs = await fetchKeysPurchasedLogs(fromBlock, toBlock);
    return logs.reduce((sum, log) => sum + parseTotalPaidFromLog(log), 0n);
  } catch (error) {
    if (fromBlock === toBlock) {
      throw error;
    }

    const mid = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      sumKeysPurchasedTotalPaid(fromBlock, mid),
      sumKeysPurchasedTotalPaid(mid + 1, toBlock),
    ]);
    return left + right;
  }
};

const estimateWeeklyPoolWei = async (runsWeekly) => {
  const cacheKey = `${runsWeekly.weekNumber}:${runsWeekly.weekStart}`;
  const cached = weeklyPoolEstimateCache.get(cacheKey);
  if (cached && Date.now() - cached.updatedAtMs < WEEKLY_POOL_CACHE_MS) {
    return cached;
  }

  const latestBlock = await getLatestBlockNumber();
  const startBlock = cached?.startBlock ?? (await findFirstBlockAtOrAfterTimestamp(runsWeekly.weekStartSec));
  const totalPaidWei = await sumKeysPurchasedTotalPaid(startBlock, latestBlock);
  const weeklyPoolWei = (totalPaidWei * BigInt(WEEKLY_POOL_SHARE_BPS)) / 10_000n;

  const nextCache = {
    updatedAtMs: Date.now(),
    startBlock,
    latestBlock,
    totalPaidWei,
    weeklyPoolWei,
  };
  weeklyPoolEstimateCache.set(cacheKey, nextCache);
  return nextCache;
};

export const fetchCurrentWeekProjectedPayout = async (wallet) => {
  const runsWeekly = await fetchRunsWeeklyStats(wallet);
  const poolEstimate = await estimateWeeklyPoolWei(runsWeekly);

  const userTreasure = BigInt(runsWeekly.userTreasure);
  const totalGlobalTreasure = BigInt(runsWeekly.totalGlobalTreasure);
  const projectedPayoutWei =
    totalGlobalTreasure > 0n ? (poolEstimate.weeklyPoolWei * userTreasure) / totalGlobalTreasure : 0n;

  return {
    weekNumber: runsWeekly.weekNumber,
    weekStart: runsWeekly.weekStart,
    weekEnd: runsWeekly.weekEnd,
    userTreasure: String(runsWeekly.userTreasure),
    totalGlobalTreasure: String(runsWeekly.totalGlobalTreasure),
    weeklyPoolWei: poolEstimate.weeklyPoolWei.toString(),
    projectedPayoutWei: projectedPayoutWei.toString(),
    source: "onchain-estimate",
  };
};

export const fetchCurrentWeekGlobalProjection = async () => {
  const runsWeekly = await fetchRunsWeeklyStats();
  const poolEstimate = await estimateWeeklyPoolWei(runsWeekly);

  return {
    weekNumber: runsWeekly.weekNumber,
    weekStart: runsWeekly.weekStart,
    weekEnd: runsWeekly.weekEnd,
    totalGlobalTreasure: String(runsWeekly.totalGlobalTreasure),
    weeklyPoolWei: poolEstimate.weeklyPoolWei.toString(),
    source: "onchain-estimate",
  };
};

export const searchAbstractProfiles = async (query) => {
  const searchUrl = `${ABS_SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const headers = {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    Referer: "https://portal.abs.xyz/",
  };

  if (ABS_SEARCH_BEARER) {
    headers.Authorization = `Bearer ${ABS_SEARCH_BEARER}`;
  }

  const response = await fetch(searchUrl, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`ABS search HTTP ${response.status}`);
  }

  const body = await response.json();
  return normalizeSearchUsers(body?.results?.users ?? []);
};

export const fetchAvatarImage = async (rawUrl) => {
  let avatarUrl;
  try {
    avatarUrl = new URL(rawUrl);
  } catch {
    throw new Error("Invalid avatar URL");
  }

  if (avatarUrl.protocol !== "https:") {
    throw new Error("Only https avatars are allowed");
  }

  const host = avatarUrl.hostname.toLowerCase();
  const allowed =
    ALLOWED_AVATAR_EXACT_HOSTS.has(host) || ALLOWED_AVATAR_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (!allowed) {
    throw new Error("Avatar host is not allowed");
  }

  const response = await fetch(avatarUrl.toString(), {
    headers: {
      Accept: "image/*",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Avatar fetch failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error("Avatar URL is not an image");
  }

  const body = Buffer.from(await response.arrayBuffer());

  try {
    const normalizedBody = await sharp(body, { animated: true }).png().toBuffer();
    return {
      contentType: "image/png",
      body: normalizedBody,
    };
  } catch {
    return { contentType, body };
  }
};

const parseCardPayload = (body) => {
  const wallet = toLimitedString(body.wallet, 42).toLowerCase();
  if (!WALLET_REGEX.test(wallet)) {
    throw new Error("Invalid wallet format");
  }

  const shortWallet = toLimitedString(body.shortWallet, 22) || shortAddress(wallet);
  const displayName = toLimitedString(body.displayName, 22) || shortWallet;

  const keySpendEth = normalizeEthString(body.keySpendEth, "0");
  const weeklyClaimsEth = normalizeEthString(body.weeklyClaimsEth, "0");
  const jackpotClaimsEth = normalizeEthString(body.jackpotClaimsEth, "0");
  const totalClaimsEth = normalizeEthString(body.totalClaimsEth, "0");
  const summaryEth = normalizeEthString(body.summaryEth, "0");
  const netProfitEth = normalizeEthString(body.netProfitEth, "0");

  const keysBought = normalizeIntegerString(body.keysBought, "0");
  const purchaseEvents = normalizeIntegerString(body.purchaseEvents, "0");
  const weeklyEvents = normalizeIntegerString(body.weeklyEvents, "0");
  const jackpotEvents = normalizeIntegerString(body.jackpotEvents, "0");
  const avatarUrl = toLimitedString(body.avatarUrl, 600);
  const verification = toLimitedString(body.verification, 24);
  const projectionMode = toLimitedString(body.projectionMode, 80) || "Disabled";
  const projectionNote = toLimitedString(body.projectionNote, 160);
  const decorGif = normalizeDecorGifPath(body.decorGif);

  return {
    wallet,
    displayName,
    shortWallet,
    keySpendEth,
    weeklyClaimsEth,
    jackpotClaimsEth,
    totalClaimsEth,
    summaryEth,
    netProfitEth,
    keysBought,
    purchaseEvents,
    weeklyEvents,
    jackpotEvents,
    avatarUrl,
    verification,
    projectionMode,
    projectionNote,
    decorGif,
  };
};

const mimeFromAssetPath = (assetPath) => {
  const ext = extname(assetPath).toLowerCase();
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "image/png";
};

const toAssetDataUrl = async (assetPath) => {
  try {
    const body = await readFile(join(PROJECT_ROOT, assetPath));
    const mime = mimeFromAssetPath(assetPath);
    return `data:${mime};base64,${body.toString("base64")}`;
  } catch {
    return "";
  }
};

export const listDecorGifs = async () => {
  if (decorGifPathsPromise) return decorGifPathsPromise;

  decorGifPathsPromise = readdir(ASSETS_DIR)
    .then((entries) =>
      entries
        .filter((entry) => entry.toLowerCase().endsWith(".gif"))
        .sort((a, b) => a.localeCompare(b))
        .map((entry) => `/assets/${entry}`),
    )
    .catch(() => []);

  return decorGifPathsPromise;
};

const loadCardRenderAssets = async () => {
  if (cardRenderAssetsPromise) return cardRenderAssetsPromise;

  cardRenderAssetsPromise = (async () => {
    const [keyIcon, jackpotIcon, bgImage, decorPaths] = await Promise.all([
      toAssetDataUrl(KEY_ICON_ASSET),
      toAssetDataUrl(JACKPOT_ICON_ASSET),
      toAssetDataUrl(CARD_BG_ASSET),
      listDecorGifs(),
    ]);

    const decorEntries = await Promise.all(
      decorPaths.map(async (publicPath) => {
        const assetPath = publicPath.startsWith("/") ? publicPath.slice(1) : publicPath;
        const dataUrl = await toAssetDataUrl(assetPath);
        return [publicPath, dataUrl];
      }),
    );

    const decorByPath = Object.fromEntries(decorEntries.filter(([, value]) => Boolean(value)));
    const decorFallback = decorByPath["/assets/ghost.gif"] || Object.values(decorByPath)[0] || "";

    return {
      keyIcon,
      jackpotIcon,
      bgImage,
      decorByPath,
      decorFallback,
    };
  })();

  return cardRenderAssetsPromise;
};

const cardAmountFontSize = (value, variant = "metric") => {
  const length = String(value || "").length;

  if (variant === "summary") {
    if (length >= 10) return 72;
    if (length >= 8) return 80;
    return 88;
  }

  if (length >= 10) return 42;
  if (length >= 8) return 48;
  return 54;
};

const counterFontSize = (value) => {
  const length = String(value || "").length;
  if (length >= 10) return 40;
  if (length >= 8) return 46;
  return 52;
};

const estimateTextWidth = (value, fontSize, widthFactor = 0.58) => String(value || "").length * fontSize * widthFactor;

const fitFontSize = (value, options = {}) => {
  const {
    baseSize = 16,
    minSize = 12,
    maxWidth = Number.POSITIVE_INFINITY,
    widthFactor = 0.58,
    step = 2,
  } = options;

  let fontSize = baseSize;
  while (fontSize > minSize && estimateTextWidth(value, fontSize, widthFactor) > maxWidth) {
    fontSize -= step;
  }
  return Math.max(fontSize, minSize);
};

const buildPlayerCardSvg = (
  payload,
  avatarDataUrl = "",
  icons = { keyIcon: "", jackpotIcon: "", bgImage: "" },
  decorDataUrl = "",
) => {
  const width = CARD_IMAGE_WIDTH;
  const height = CARD_IMAGE_HEIGHT;
  const panelX = 38;
  const panelY = 34;
  const panelW = width - panelX * 2;
  const panelH = height - panelY * 2;
  const innerX = panelX + 34;
  const contentRight = panelX + panelW - 34;
  const chipY = panelY + 28;
  const heroY = panelY + 86;
  const avatarSize = 136;
  const heroTextX = innerX + avatarSize + 28;
  const summaryW = 452;
  const summaryH = 174;
  const summaryX = contentRight - summaryW;
  const summaryY = heroY + 6;
  const safeDisplayName = payload.displayName.length > 20 ? `${payload.displayName.slice(0, 19)}...` : payload.displayName;
  const statsY = panelY + 296;
  const cardGap = 16;
  const cardW = (panelW - 68 - cardGap * 3) / 4;
  const cardH = 186;
  const secondaryY = statsY + cardH + 18;
  const secondaryH = 118;
  const footerY = secondaryY + secondaryH + 20;
  const footerH = panelY + panelH - footerY - 30;
  const projectionModeText = `PROJECTION MODE ${payload.projectionMode}`.toUpperCase();
  const rawProjectionNoteText = payload.projectionNote ? payload.projectionNote.toUpperCase() : "SHARE-READY SNAPSHOT";
  const projectionNoteText =
    rawProjectionNoteText.length > 54 ? `${rawProjectionNoteText.slice(0, 53)}...` : rawProjectionNoteText;
  const profitIsNegative = payload.netProfitEth.startsWith("-");
  const profitIsZero = payload.netProfitEth === "0";
  const profitDisplay = profitIsZero
    ? "0"
    : profitIsNegative
      ? payload.netProfitEth
      : `+${payload.netProfitEth}`;
  const summaryFill = profitIsNegative ? "rgba(255,115,81,0.10)" : "url(#summaryGrad)";
  const summaryStroke = profitIsNegative ? "rgba(255,115,81,0.24)" : "rgba(223,255,0,0.22)";
  const summaryLabelFill = profitIsNegative ? "#ff9b85" : "#dfff00";
  const summaryValueFill = profitIsNegative ? "#fff1ed" : "#ffffff";
  const summaryUnitFill = profitIsNegative ? "#ffd2c8" : "#f6ffc0";
  const summaryMetaFill = profitIsNegative ? "#d2a097" : "#9ea38f";
  const heroMaxWidth = summaryX - heroTextX - 44;
  const heroNameFontSize = fitFontSize(safeDisplayName, {
    baseSize: 88,
    minSize: 58,
    maxWidth: heroMaxWidth,
    widthFactor: 0.56,
  });
  const heroWalletFontSize = fitFontSize(payload.shortWallet, {
    baseSize: 24,
    minSize: 18,
    maxWidth: heroMaxWidth,
    widthFactor: 0.62,
  });
  const footerWalletFontSize = fitFontSize(payload.shortWallet, {
    baseSize: 30,
    minSize: 24,
    maxWidth: 250,
    widthFactor: 0.6,
  });
  const footerProjectionFontSize = fitFontSize(projectionNoteText, {
    baseSize: 20,
    minSize: 15,
    maxWidth: 470,
    widthFactor: 0.6,
  });

  const renderAmount = (x, y, value, variant = "metric", fill = "#ffffff", unitFill = "#b8b3b3") => {
    const maxWidth = variant === "summary" ? summaryW - 56 : cardW - 48;
    const baseFontSize = cardAmountFontSize(value, variant);
    const minFontSize = variant === "summary" ? 56 : 34;
    const widthFactor = variant === "summary" ? 0.54 : 0.56;
    const unitSize = variant === "summary" ? 32 : 24;
    const gap = variant === "summary" ? 18 : 12;
    const unitWidth = estimateTextWidth("ETH", unitSize, 0.6);
    const valueFontSize = fitFontSize(value, {
      baseSize: baseFontSize,
      minSize: minFontSize,
      maxWidth: maxWidth - unitWidth - gap,
      widthFactor,
    });
    const valueWidth = estimateTextWidth(value, valueFontSize, widthFactor);
    const unitX = x + valueWidth + gap;

    return `
      <text x="${x}" y="${y}" fill="${fill}" font-size="${valueFontSize}" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
        value,
      )}</text>
      <text x="${unitX}" y="${y}" fill="${unitFill}" font-size="${unitSize}" font-family="Noto Sans, sans-serif" font-weight="700">ETH</text>
    `;
  };

  const metricCard = (x, label, value, detail = "", options = {}) => {
    const detailFontSize = fitFontSize(detail.toUpperCase(), {
      baseSize: 13,
      minSize: 10,
      maxWidth: cardW - 48,
      widthFactor: 0.6,
    });

    return `
      <g>
        <rect x="${x}" y="${statsY}" width="${cardW}" height="${cardH}" rx="18" fill="${options.primary ? "url(#metricPrimaryFill)" : "url(#metricFill)"}" stroke="${
          options.primary ? "rgba(223,255,0,0.20)" : "rgba(255,255,255,0.06)"
        }" stroke-width="1.2"/>
        <rect x="${x + 18}" y="${statsY + 18}" width="${cardW - 36}" height="1" fill="rgba(255,255,255,0.04)"/>
        ${
          options.icon
            ? `<image href="${options.icon}" x="${x + cardW - 92}" y="${statsY + 24}" width="58" height="58" opacity="0.16" preserveAspectRatio="xMidYMid meet"/>`
            : ""
        }
        <text x="${x + 24}" y="${statsY + 44}" fill="#8d8a8a" font-size="13" font-family="Noto Sans Mono, monospace" letter-spacing="3">${escapeXml(
          label,
        )}</text>
        ${renderAmount(x + 24, statsY + 112, value, "metric", "#ffffff", "#b8b3b3")}
        ${
          options.meter
            ? `<rect x="${x + 24}" y="${statsY + 136}" width="${cardW - 48}" height="8" rx="4" fill="rgba(0,0,0,0.38)"/>
               <rect x="${x + 24}" y="${statsY + 136}" width="${Math.max(180, cardW * 0.56)}" height="8" rx="4" fill="#dfff00"/>`
            : ""
        }
        ${
          detail
            ? `<text x="${x + 24}" y="${statsY + 164}" fill="#8f8a8a" font-size="${detailFontSize}" font-family="Noto Sans Mono, monospace" letter-spacing="1.6">${escapeXml(
                detail.toUpperCase(),
              )}</text>`
            : ""
        }
      </g>
    `;
  };

  const secondaryCard = (x, label, value, accent = false) => {
    const labelFontSize = fitFontSize(label, {
      baseSize: 13,
      minSize: 10,
      maxWidth: cardW - 48,
      widthFactor: 0.62,
    });
    const valueFontSize = fitFontSize(value, {
      baseSize: counterFontSize(value),
      minSize: 30,
      maxWidth: cardW - 48,
      widthFactor: 0.56,
    });

    return `
      <g>
        <rect x="${x}" y="${secondaryY}" width="${cardW}" height="${secondaryH}" rx="16" fill="${accent ? "rgba(223,255,0,0.08)" : "rgba(15,15,15,0.92)"}" stroke="${
          accent ? "rgba(223,255,0,0.18)" : "rgba(255,255,255,0.06)"
        }" stroke-width="1.1"/>
        <text x="${x + 24}" y="${secondaryY + 38}" fill="#8d8a8a" font-size="${labelFontSize}" font-family="Noto Sans Mono, monospace" letter-spacing="2">${escapeXml(
          label,
        )}</text>
        <text x="${x + 24}" y="${secondaryY + 84}" fill="${accent ? "#f6ffc0" : "#ffffff"}" font-size="${valueFontSize}" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
          value,
        )}</text>
      </g>
    `;
  };

  const avatarMarkup = avatarDataUrl
    ? `
      <clipPath id="avatarClip"><rect x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" rx="22"/></clipPath>
      <rect x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" rx="22" fill="#131212" stroke="rgba(223,255,0,0.24)" stroke-width="1.5"/>
      <image href="${avatarDataUrl}" x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />
    `
    : `
      <rect x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" rx="22" fill="rgba(223,255,0,0.14)" stroke="rgba(223,255,0,0.28)" stroke-width="1.5"/>
      <text x="${innerX + avatarSize / 2}" y="${heroY + 84}" text-anchor="middle" fill="#f6ffc0" font-size="52" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
        safeDisplayName.slice(0, 1).toUpperCase() || "?",
      )}</text>
    `;

  const decorMarkup = decorDataUrl
    ? `<image href="${decorDataUrl}" x="${panelX + panelW - 156}" y="${footerY + 6}" width="118" height="118" preserveAspectRatio="xMidYMid meet" opacity="0.86"/>`
    : "";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgFallbackGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1111"/>
      <stop offset="52%" stop-color="#111010"/>
      <stop offset="100%" stop-color="#070707"/>
    </linearGradient>
    <clipPath id="panelClip">
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="26"/>
    </clipPath>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(27,24,24,0.98)"/>
      <stop offset="100%" stop-color="rgba(13,12,12,0.98)"/>
    </linearGradient>
    <linearGradient id="metricFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(29,27,27,0.98)"/>
      <stop offset="100%" stop-color="rgba(20,19,19,0.98)"/>
    </linearGradient>
    <linearGradient id="metricPrimaryFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(35,34,25,1)"/>
      <stop offset="100%" stop-color="rgba(30,28,22,1)"/>
    </linearGradient>
    <linearGradient id="summaryGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(223,255,0,0.14)"/>
      <stop offset="100%" stop-color="rgba(223,255,0,0.05)"/>
    </linearGradient>
    <linearGradient id="footerGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(14,14,14,0.98)"/>
      <stop offset="100%" stop-color="rgba(18,18,18,0.78)"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgFallbackGrad)"/>
  ${icons.bgImage ? `<image href="${icons.bgImage}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.16"/>` : ""}
  <rect width="${width}" height="${height}" fill="rgba(6,6,6,0.74)"/>
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="26" fill="url(#panelGrad)" stroke="rgba(108,109,109,0.34)" stroke-width="1.2"/>
  <rect x="${panelX}" y="${panelY}" width="4" height="${panelH}" rx="2" fill="#dfff00"/>
  <rect x="${panelX + 1}" y="${panelY}" width="${panelW - 2}" height="1" fill="rgba(255,255,255,0.03)"/>
  <g clip-path="url(#panelClip)" opacity="0.12">
    <path d="M 0 ${height - 240} C 420 ${height - 360}, 760 ${height - 80}, ${width} ${height - 180}" stroke="rgba(223,255,0,0.22)" stroke-width="180" fill="none"/>
  </g>
  <g opacity="0.16">
    <line x1="${panelX + 360}" y1="${panelY}" x2="${panelX + 360}" y2="${panelY + panelH}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    <line x1="${panelX + 720}" y1="${panelY}" x2="${panelX + 720}" y2="${panelY + panelH}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <line x1="${panelX + 1080}" y1="${panelY}" x2="${panelX + 1080}" y2="${panelY + panelH}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <line x1="${panelX}" y1="${panelY + 220}" x2="${panelX + panelW}" y2="${panelY + 220}" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  </g>
  <g opacity="0.14">
    <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bgFallbackGrad)"/>
    <path d="M 0 0 H ${width} V ${height}" fill="none"/>
  </g>

  <rect x="${innerX}" y="${chipY}" width="182" height="34" rx="8" fill="rgba(0,0,0,0.72)" stroke="rgba(223,255,0,0.20)" stroke-width="1"/>
  <text x="${innerX + 14}" y="${chipY + 22}" fill="#dfff00" font-size="12" font-family="Noto Sans Mono, monospace" letter-spacing="2.8">WALLET_NODE.JSON</text>
  ${avatarMarkup}

  <text x="${heroTextX}" y="${heroY + 56}" fill="#ffffff" font-size="${heroNameFontSize}" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
    safeDisplayName,
  )}</text>
  <text x="${heroTextX}" y="${heroY + 98}" fill="#8d8a8a" font-size="${heroWalletFontSize}" font-family="Noto Sans Mono, monospace" letter-spacing="2.4">${escapeXml(
    payload.shortWallet,
  )}</text>
  <rect x="${summaryX}" y="${summaryY}" width="${summaryW}" height="${summaryH}" rx="22" fill="${summaryFill}" stroke="${summaryStroke}" stroke-width="1.4"/>
  <text x="${summaryX + 28}" y="${summaryY + 42}" fill="${summaryLabelFill}" font-size="16" font-family="Noto Sans Mono, monospace" letter-spacing="2.8">PROFIT</text>
  ${renderAmount(summaryX + 28, summaryY + 114, profitDisplay, "summary", summaryValueFill, summaryUnitFill)}
  <text x="${summaryX + 28}" y="${summaryY + 146}" fill="${summaryMetaFill}" font-size="16" font-family="Noto Sans Mono, monospace" letter-spacing="2">${
    profitIsNegative ? "UNDER WATER" : profitIsZero ? "BREAK EVEN" : "NET RETURN"
  }</text>

  ${metricCard(panelX + 34, "TOTAL REWARDS", payload.totalClaimsEth, "Shareable card view", { primary: true, meter: true })}
  ${metricCard(panelX + 34 + (cardW + cardGap), "KEY SPEND", payload.keySpendEth, `Keys bought: ${payload.keysBought}`, {
    icon: icons.keyIcon,
  })}
  ${metricCard(panelX + 34 + (cardW + cardGap) * 2, "WEEKLY CLAIMS", payload.weeklyClaimsEth, `Weeks played: ${payload.weeklyEvents}`)}
  ${metricCard(panelX + 34 + (cardW + cardGap) * 3, "JACKPOT CLAIMS", payload.jackpotClaimsEth, `Jackpots won: ${payload.jackpotEvents}`, {
    icon: icons.jackpotIcon,
  })}

  ${secondaryCard(panelX + 34, "KEYS BOUGHT", payload.keysBought, true)}
  ${secondaryCard(panelX + 34 + (cardW + cardGap), "PURCHASE EVENTS", payload.purchaseEvents)}
  ${secondaryCard(panelX + 34 + (cardW + cardGap) * 2, "WEEKS PLAYED", payload.weeklyEvents)}
  ${secondaryCard(panelX + 34 + (cardW + cardGap) * 3, "JACKPOTS WON", payload.jackpotEvents)}

  <rect x="${panelX + 34}" y="${footerY}" width="${panelW - 68}" height="${footerH}" rx="18" fill="url(#footerGrad)" stroke="rgba(255,255,255,0.06)" stroke-width="1.1"/>
  <text x="${panelX + 62}" y="${footerY + 42}" fill="#8d8a8a" font-size="13" font-family="Noto Sans Mono, monospace" letter-spacing="2.6">WALLET</text>
  <text x="${panelX + 62}" y="${footerY + 80}" fill="#ffffff" font-size="${footerWalletFontSize}" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
    payload.shortWallet,
  )}</text>
  <text x="${panelX + 420}" y="${footerY + 42}" fill="#8d8a8a" font-size="13" font-family="Noto Sans Mono, monospace" letter-spacing="2.6">${escapeXml(
    projectionModeText,
  )}</text>
  <text x="${panelX + 420}" y="${footerY + 80}" fill="#f6ffc0" font-size="${footerProjectionFontSize}" font-family="Noto Sans Mono, monospace" letter-spacing="0.8">${escapeXml(
    projectionNoteText,
  )}</text>
  <text x="${contentRight - 332}" y="${footerY + 42}" fill="#8d8a8a" font-size="13" font-family="Noto Sans Mono, monospace" letter-spacing="2.6">MOG WALLET STATS</text>
  <text x="${contentRight - 332}" y="${footerY + 80}" fill="#ffffff" font-size="30" font-family="Noto Sans, sans-serif" font-weight="700">PLAYER CARD</text>

  ${decorMarkup}
</svg>
`;
};

export const renderPlayerCardImage = async (rawPayload) => {
  const payload = parseCardPayload(rawPayload);
  const assets = await loadCardRenderAssets();

  let avatarDataUrl = "";
  if (payload.avatarUrl) {
    try {
      const avatar = await fetchAvatarImage(payload.avatarUrl);
      avatarDataUrl = `data:${avatar.contentType};base64,${avatar.body.toString("base64")}`;
    } catch {
      avatarDataUrl = "";
    }
  }

  const decorDataUrl = assets.decorByPath[payload.decorGif] || assets.decorFallback;
  const svg = buildPlayerCardSvg(payload, avatarDataUrl, assets, decorDataUrl);
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: CARD_IMAGE_WIDTH,
    },
    font: {
      fontFiles: CARD_FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: "Noto Sans",
    },
  });

  return resvg.render().asPng();
};
