import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
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
const CARD_IMAGE_HEIGHT = 460;
const CARD_BG_ASSET = "assets/bg-main.png";
const KEY_ICON_ASSET = "assets/key_big.png";
const JACKPOT_ICON_ASSET = "assets/jackpot_big.png";
const CARD_FONT_SANS_REGULAR_ASSET = "assets/fonts/NotoSans-Regular.ttf";
const CARD_FONT_SANS_BOLD_ASSET = "assets/fonts/NotoSans-Bold.ttf";
const CARD_FONT_MONO_REGULAR_ASSET = "assets/fonts/NotoSansMono-Regular.ttf";
const PROJECT_ROOT = fileURLToPath(new URL("./", import.meta.url));
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

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

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
query GlobalStatsAndLeaderboard($limit: Int!) {
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
    netProfitAmount
    updatedAtTimestamp
  }
  PlayerStats(
    order_by: [{ netProfitAmount: desc }, { totalClaimAmount: desc }, { wallet: asc }]
    limit: $limit
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
    netProfitAmount
  }
}
`;

const GLOBAL_STATS_AND_LEADERBOARD_QUERY_LEGACY = `
query GlobalStatsAndLeaderboard($limit: Int!) {
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
    netProfitAmount
    updatedAtTimestamp
  }
  PlayerStats(
    order_by: [{ netProfitAmount: desc }, { totalClaimAmount: desc }, { wallet: asc }]
    limit: $limit
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
    netProfitAmount
  }
}
`;

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
};

const sendFile = async (res, path, headOnly = false) => {
  try {
    const file = await readFile(path);
    const ext = extname(path);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(headOnly ? undefined : file);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
};

const parseRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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
  const summaryEth = normalizeEthString(body.summaryEth, totalClaimsEth);

  const keysBought = normalizeIntegerString(body.keysBought, "0");
  const purchaseEvents = normalizeIntegerString(body.purchaseEvents, "0");
  const weeklyEvents = normalizeIntegerString(body.weeklyEvents, "0");
  const jackpotEvents = normalizeIntegerString(body.jackpotEvents, "0");
  const avatarUrl = toLimitedString(body.avatarUrl, 600);
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
    keysBought,
    purchaseEvents,
    weeklyEvents,
    jackpotEvents,
    avatarUrl,
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

const listDecorGifs = async () => {
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

const buildPlayerCardSvg = (
  payload,
  avatarDataUrl = "",
  icons = { keyIcon: "", jackpotIcon: "", bgImage: "" },
  decorDataUrl = "",
) => {
  const width = CARD_IMAGE_WIDTH;
  const height = CARD_IMAGE_HEIGHT;
  const panelX = 20;
  const panelY = 20;
  const panelW = width - panelX * 2;
  const panelH = height - panelY * 2;
  const innerX = panelX + 18;
  const chipY = panelY + 22;
  const heroY = panelY + 62;
  const avatarSize = 72;
  const heroTextX = innerX + avatarSize + 18;
  const safeDisplayName = payload.displayName.length > 18 ? `${payload.displayName.slice(0, 17)}...` : payload.displayName;
  const summaryLabel = `TOTAL REWARDS ${payload.summaryEth} ETH`;
  const summaryPillW = Math.max(330, Math.min(480, 120 + summaryLabel.length * 14));
  const summaryPillX = panelX + panelW - summaryPillW - 22;
  const summaryPillY = heroY + 4;
  const cardsY = panelY + 150;
  const cardGap = 1;
  const cardW = (panelW - 36 - cardGap * 3) / 4;
  const cardH = 112;
  const metaY = cardsY + cardH;
  const metaH = 42;
  const purchaseMetaW = (panelW - 36) * 0.5;
  const logPanelY = metaY + metaH + 12;
  const logPanelH = panelY + panelH - logPanelY - 18;

  const metricCard = (x, label, value, detail = "", options = {}) => `
    <g>
      <rect x="${x}" y="${cardsY}" width="${cardW}" height="${cardH}" fill="${options.primary ? "url(#metricPrimaryFill)" : "url(#metricFill)"}" />
      <line x1="${x}" y1="${cardsY}" x2="${x}" y2="${cardsY + cardH}" stroke="rgba(223,255,0,0.08)" stroke-width="1"/>
      <text x="${x + 18}" y="${cardsY + 24}" fill="#8d8a8a" font-size="11" font-family="Noto Sans Mono, monospace" letter-spacing="3.2">${escapeXml(
        label,
      )}</text>
      <text x="${x + 18}" y="${cardsY + 58}" fill="#ffffff" font-size="30" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
        `${value} ETH`,
      )}</text>
      ${
        options.meter
          ? `<rect x="${x + 18}" y="${cardsY + 72}" width="200" height="5" fill="rgba(0,0,0,0.5)"/>
             <rect x="${x + 18}" y="${cardsY + 72}" width="126" height="5" fill="#dfff00"/>`
          : ""
      }
      ${
        detail
          ? `<text x="${x + 18}" y="${cardsY + 88}" fill="#767171" font-size="11" font-family="Noto Sans Mono, monospace" letter-spacing="2.1">${escapeXml(
              detail.toUpperCase(),
            )}</text>`
          : ""
      }
    </g>
  `;

  const avatarMarkup = avatarDataUrl
    ? `
      <clipPath id="avatarClip"><rect x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" rx="0"/></clipPath>
      <rect x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" fill="#131212" stroke="rgba(223,255,0,0.20)" stroke-width="1.5"/>
      <image href="${avatarDataUrl}" x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />
    `
    : `
      <rect x="${innerX}" y="${heroY}" width="${avatarSize}" height="${avatarSize}" fill="#dfff00"/>
      <text x="${innerX + avatarSize / 2}" y="${heroY + 49}" text-anchor="middle" fill="#212700" font-size="34" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
        safeDisplayName.slice(0, 1).toUpperCase() || "?",
      )}</text>
    `;

  const decorMarkup = decorDataUrl
    ? `<image href="${decorDataUrl}" x="${panelX + panelW - 168}" y="${cardsY + 32}" width="126" height="126" preserveAspectRatio="xMidYMid meet" opacity="0.92"/>`
    : "";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgFallbackGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#111010"/>
      <stop offset="100%" stop-color="#090909"/>
    </linearGradient>
    <clipPath id="panelClip">
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="0"/>
    </clipPath>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(33, 30, 30, 0.98)"/>
      <stop offset="100%" stop-color="rgba(22, 20, 20, 0.98)"/>
    </linearGradient>
    <linearGradient id="metricFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(32,30,30,0.98)"/>
      <stop offset="100%" stop-color="rgba(27,25,25,0.98)"/>
    </linearGradient>
    <linearGradient id="metricPrimaryFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(37,34,34,1)"/>
      <stop offset="100%" stop-color="rgba(31,29,29,1)"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgFallbackGrad)"/>
  <rect width="${width}" height="${height}" fill="rgba(8,8,8,0.72)"/>
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="0" fill="url(#panelGrad)" stroke="rgba(73,72,71,0.38)" stroke-width="1.2"/>
  <rect x="${panelX}" y="${panelY}" width="2" height="164" fill="#dfff00"/>
  <rect x="${panelX + 1}" y="${panelY}" width="${panelW - 2}" height="1" fill="rgba(255,255,255,0.02)"/>
  <g opacity="0.18">
    <line x1="${panelX + 320}" y1="${panelY}" x2="${panelX + 320}" y2="${panelY + panelH}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <line x1="${panelX + 640}" y1="${panelY}" x2="${panelX + 640}" y2="${panelY + panelH}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <line x1="${panelX + 960}" y1="${panelY}" x2="${panelX + 960}" y2="${panelY + panelH}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
    <line x1="${panelX}" y1="${panelY + 128}" x2="${panelX + panelW}" y2="${panelY + 128}" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  </g>

  <rect x="${innerX}" y="${chipY}" width="156" height="28" fill="rgba(0,0,0,0.7)" stroke="rgba(223,255,0,0.18)" stroke-width="1"/>
  <text x="${innerX + 12}" y="${chipY + 18}" fill="#dfff00" font-size="11" font-family="Noto Sans Mono, monospace" letter-spacing="2.6">WALLET_NODE.JSON</text>
  ${avatarMarkup}

  <text x="${heroTextX}" y="${heroY + 28}" fill="#ffffff" font-size="56" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
    safeDisplayName,
  )}</text>
  <text x="${heroTextX}" y="${heroY + 58}" fill="#8d8a8a" font-size="18" font-family="Noto Sans Mono, monospace" letter-spacing="2.4">${escapeXml(
    payload.shortWallet,
  )}</text>

  <rect x="${summaryPillX}" y="${summaryPillY}" width="${summaryPillW}" height="44" fill="rgba(223,255,0,0.08)" stroke="rgba(223,255,0,0.18)" stroke-width="1"/>
  <text x="${summaryPillX + 16}" y="${summaryPillY + 28}" fill="#f6ffc0" font-size="21" font-family="Noto Sans, sans-serif" font-weight="700">${escapeXml(
    summaryLabel,
  )}</text>

  ${metricCard(panelX + 18, "TOTAL REWARDS", payload.totalClaimsEth, "", { primary: true, meter: true })}
  ${metricCard(panelX + 18 + (cardW + cardGap), "KEY SPEND", payload.keySpendEth, `Keys bought: ${payload.keysBought}`)}
  ${metricCard(panelX + 18 + (cardW + cardGap) * 2, "WEEKLY CLAIMS", payload.weeklyClaimsEth, `Weekly events: ${payload.weeklyEvents}`)}
  ${metricCard(panelX + 18 + (cardW + cardGap) * 3, "JACKPOT CLAIMS", payload.jackpotClaimsEth, `Jackpot events: ${payload.jackpotEvents}`)}

  <rect x="${panelX + 18}" y="${metaY}" width="${purchaseMetaW}" height="${metaH}" fill="rgba(20,20,20,0.96)"/>
  <rect x="${panelX + 18 + purchaseMetaW + 1}" y="${metaY}" width="${panelW - 37 - purchaseMetaW}" height="${metaH}" fill="rgba(20,20,20,0.96)"/>
  <text x="${panelX + 34}" y="${metaY + 25}" fill="#8d8a8a" font-size="13" font-family="Noto Sans Mono, monospace" letter-spacing="2.2">PURCHASE EVENTS: ${escapeXml(
    payload.purchaseEvents,
  )}</text>
  <text x="${panelX + 18 + purchaseMetaW + 22}" y="${metaY + 25}" fill="#8d8a8a" font-size="13" font-family="Noto Sans Mono, monospace" letter-spacing="2.2">WEEKLY/JACKPOT EVENTS: ${escapeXml(
    `${payload.weeklyEvents}/${payload.jackpotEvents}`,
  )}</text>

  <rect x="${panelX + 18}" y="${logPanelY}" width="${panelW - 36}" height="${logPanelH}" fill="rgba(0,0,0,0.82)" stroke="rgba(73,72,71,0.24)" stroke-width="1"/>
  <rect x="${panelX + 18}" y="${logPanelY}" width="${panelW - 36}" height="1" fill="rgba(255,255,255,0.03)"/>
  <text x="${panelX + 32}" y="${logPanelY + 22}" fill="#dfff00" font-size="11" font-family="Noto Sans Mono, monospace" letter-spacing="2.8">SYSTEM_LOGS_V2.0.4</text>
  <circle cx="${panelX + panelW - 42}" cy="${logPanelY + 18}" r="3" fill="#dfff00"/>
  <circle cx="${panelX + panelW - 58}" cy="${logPanelY + 18}" r="3" fill="rgba(255,255,255,0.18)"/>
  <circle cx="${panelX + panelW - 74}" cy="${logPanelY + 18}" r="3" fill="rgba(255,255,255,0.18)"/>
  <line x1="${panelX + 18}" y1="${logPanelY + 30}" x2="${panelX + panelW - 18}" y2="${logPanelY + 30}" stroke="rgba(73,72,71,0.22)" stroke-width="1"/>
  <text x="${panelX + 26}" y="${logPanelY + 54}" fill="#8d8a8a" font-size="11" font-family="Noto Sans Mono, monospace">[WALLET]</text>
  <text x="${panelX + 120}" y="${logPanelY + 54}" fill="#dfff00" font-size="11" font-family="Noto Sans Mono, monospace">${escapeXml(
    `${safeDisplayName} // ${payload.shortWallet}`,
  )}</text>
  <text x="${panelX + 26}" y="${logPanelY + 76}" fill="#8d8a8a" font-size="11" font-family="Noto Sans Mono, monospace">[CLAIMS]</text>
  <text x="${panelX + 120}" y="${logPanelY + 76}" fill="#ffffff" font-size="11" font-family="Noto Sans Mono, monospace">${escapeXml(
    `TOTAL ${payload.totalClaimsEth} ETH // WEEKLY ${payload.weeklyClaimsEth} ETH // JACKPOT ${payload.jackpotClaimsEth} ETH`,
  )}</text>
  <text x="${panelX + 26}" y="${logPanelY + 98}" fill="#8d8a8a" font-size="11" font-family="Noto Sans Mono, monospace">[KEYS]</text>
  <text x="${panelX + 120}" y="${logPanelY + 98}" fill="#ffffff" font-size="11" font-family="Noto Sans Mono, monospace">${escapeXml(
    `SPEND ${payload.keySpendEth} ETH // BOUGHT ${payload.keysBought} // EVENTS ${payload.purchaseEvents}`,
  )}</text>

  ${decorMarkup}
</svg>
`;
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

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || "GraphQL error");
  }

  return json;
};

const fetchPlayerStats = async (wallet) => {
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

const fetchGlobalStats = async (limit = 100, options = {}) => {
  const cappedLimit = Math.max(1, Math.min(200, Number.parseInt(String(limit), 10) || 100));
  const includeCurrentWeekProjected = Boolean(options?.includeCurrentWeekProjected);
  let body;
  try {
    body = await fetchGraphql(GLOBAL_STATS_AND_LEADERBOARD_QUERY, { limit: cappedLimit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GraphQL error";
    if (
      message.includes("profileName") ||
      message.includes("profileImageUrl") ||
      message.includes("profileVerification")
    ) {
      body = await fetchGraphql(GLOBAL_STATS_AND_LEADERBOARD_QUERY_LEGACY, { limit: cappedLimit });
    } else if (message.includes("netProfitAmount") || message.includes("totalClaimAmount")) {
      throw new Error("Indexer schema is outdated. Deploy the latest mog-indexer and reindex to enable global profit stats.");
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

const fetchCurrentWeekProjectedPayout = async (wallet) => {
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

const fetchCurrentWeekGlobalProjection = async () => {
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

const fetchAbsSearchWithCurl = async (query) => {
  const searchUrl = `${ABS_SEARCH_ENDPOINT}?query=${encodeURIComponent(query)}`;
  const args = [
    "--silent",
    "--show-error",
    "--fail-with-body",
    "--location",
    searchUrl,
    "-H",
    "accept: application/json, text/plain, */*",
    "-H",
    "user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "-H",
    "referer: https://portal.abs.xyz/",
  ];

  if (ABS_SEARCH_BEARER) {
    args.push("-H", `authorization: Bearer ${ABS_SEARCH_BEARER}`);
  }

  const result = await new Promise((resolve, reject) => {
    const child = spawn("curl", args);
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(`ABS search curl failed (${code}): ${err || out}`));
        return;
      }
      resolve(out);
    });
  });

  let json;
  try {
    json = JSON.parse(result);
  } catch {
    throw new Error("ABS search curl returned non-JSON response");
  }

  return normalizeSearchUsers(json?.results?.users ?? []);
};

const searchAbstractProfiles = async (query) => {
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

  const json = await response.json();
  return normalizeSearchUsers(json?.results?.users ?? []);
};

const fetchAvatarImage = async (rawUrl) => {
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
  return { contentType, body };
};

const app = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    const isGetOrHead = req.method === "GET" || req.method === "HEAD";
    const headOnly = req.method === "HEAD";

    if (isGetOrHead && url.pathname === "/") {
      await sendFile(res, join(process.cwd(), "index.html"), headOnly);
      return;
    }

    if (isGetOrHead && (url.pathname === "/styles.css" || url.pathname === "/app.js")) {
      await sendFile(res, join(process.cwd(), url.pathname.slice(1)), headOnly);
      return;
    }

    if (
      isGetOrHead &&
      (url.pathname === "/favicon.ico" ||
        url.pathname === "/favicon-16x16.png" ||
        url.pathname === "/favicon-32x32.png" ||
        url.pathname === "/apple-touch-icon.png")
    ) {
      await sendFile(res, join(process.cwd(), url.pathname.slice(1)), headOnly);
      return;
    }

    if (isGetOrHead && url.pathname.startsWith("/assets/")) {
      if (url.pathname.includes("..")) {
        sendJson(res, 400, { error: "Invalid asset path" });
        return;
      }
      await sendFile(res, join(process.cwd(), url.pathname.slice(1)), headOnly);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/player-stats") {
      const body = await parseRequestBody(req);
      const wallet = (body.wallet || "").trim().toLowerCase();
      const includeCurrentWeekProjected = Boolean(body.includeCurrentWeekProjected);

      if (!WALLET_REGEX.test(wallet)) {
        sendJson(res, 400, { error: "Invalid wallet format" });
        return;
      }

      const stats = await fetchPlayerStats(wallet);
      let currentWeekProjected = null;
      let currentWeekProjectedError = null;

      if (includeCurrentWeekProjected && stats) {
        try {
          currentWeekProjected = await fetchCurrentWeekProjectedPayout(wallet);
        } catch (error) {
          currentWeekProjectedError = error instanceof Error ? error.message : "Projected payout unavailable";
        }
      }

      sendJson(res, 200, { stats, currentWeekProjected, currentWeekProjectedError });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/global-stats") {
      const requestedLimit = url.searchParams.get("limit") || "100";
      const limit = Number.parseInt(requestedLimit, 10);
      const includeProjectedRaw = (url.searchParams.get("includeCurrentWeekProjected") || "").trim().toLowerCase();
      const includeCurrentWeekProjected = includeProjectedRaw === "1" || includeProjectedRaw === "true";
      const payload = await fetchGlobalStats(limit, { includeCurrentWeekProjected });
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=20, stale-while-revalidate=40",
      });
      res.end(JSON.stringify(payload));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/search") {
      const query = (url.searchParams.get("query") || "").trim();
      if (query.length < 2) {
        sendJson(res, 200, { users: [] });
        return;
      }

      let users = [];
      try {
        users = await searchAbstractProfiles(query);
      } catch {
        users = await fetchAbsSearchWithCurl(query);
      }
      sendJson(res, 200, { users });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/decor-gifs") {
      const gifs = await listDecorGifs();
      sendJson(res, 200, { gifs });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/avatar") {
      const sourceUrl = (url.searchParams.get("url") || "").trim();
      if (!sourceUrl) {
        sendJson(res, 400, { error: "Missing avatar URL" });
        return;
      }

      const image = await fetchAvatarImage(sourceUrl);
      res.writeHead(200, {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=3600",
      });
      res.end(image.body);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/player-card-image") {
      const body = await parseRequestBody(req);
      const payload = parseCardPayload(body);
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

      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();

      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      res.end(pngBuffer);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Mog Wallet Stats app running at http://${HOST}:${PORT}`);
  console.log(`Proxying GraphQL to ${GRAPHQL_ENDPOINT}`);
});
