import { Resvg } from "@resvg/resvg-js";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || "http://127.0.0.1:8080/v1/graphql";
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || "";
const ABS_SEARCH_ENDPOINT = "https://backend.portal.abs.xyz/api/search/global";
const ABS_SEARCH_BEARER = process.env.ABS_SEARCH_BEARER || "";
const ALLOWED_AVATAR_HOST_SUFFIX = ".abs.xyz";
const CARD_IMAGE_WIDTH = 1600;
const CARD_IMAGE_HEIGHT = 460;
const CARD_BG_ASSET = "assets/bg-main.png";
const KEY_ICON_ASSET = "assets/key_big.png";
const JACKPOT_ICON_ASSET = "assets/jackpot_big.png";
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ASSETS_DIR = join(PROJECT_ROOT, "assets");
let cardRenderAssetsPromise = null;
let decorGifPathsPromise = null;

const PLAYER_STATS_QUERY = `
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
      query: PLAYER_STATS_QUERY,
      variables: { wallet },
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

  return body.data?.PlayerStats?.[0] || null;
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
  if (!(host === "abs.xyz" || host.endsWith(ALLOWED_AVATAR_HOST_SUFFIX))) {
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
  const netEth = normalizeEthString(body.netEth, "0");

  const keysBought = normalizeIntegerString(body.keysBought, "0");
  const purchaseEvents = normalizeIntegerString(body.purchaseEvents, "0");
  const weeklyEvents = normalizeIntegerString(body.weeklyEvents, "0");
  const jackpotEvents = normalizeIntegerString(body.jackpotEvents, "0");
  const avatarUrl = toLimitedString(body.avatarUrl, 600);
  const decorGif = normalizeDecorGifPath(body.decorGif);

  const netNumber = Number(netEth);
  const netTone = Number.isFinite(netNumber) ? (netNumber > 0 ? "positive" : netNumber < 0 ? "negative" : "neutral") : "neutral";

  return {
    wallet,
    displayName,
    shortWallet,
    keySpendEth,
    weeklyClaimsEth,
    jackpotClaimsEth,
    totalClaimsEth,
    netEth,
    keysBought,
    purchaseEvents,
    weeklyEvents,
    jackpotEvents,
    avatarUrl,
    decorGif,
    netTone,
  };
};

const getNetPalette = (tone) => {
  if (tone === "positive") {
    return {
      text: "#bfffd7",
      fill: "rgba(84, 220, 150, 0.17)",
      stroke: "rgba(120, 255, 188, 0.44)",
    };
  }

  if (tone === "negative") {
    return {
      text: "#ffb8bf",
      fill: "rgba(255, 129, 156, 0.16)",
      stroke: "rgba(255, 155, 175, 0.45)",
    };
  }

  return {
    text: "#ffd989",
    fill: "rgba(255, 207, 100, 0.16)",
    stroke: "rgba(255, 207, 100, 0.4)",
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

const buildPlayerCardSvg = (
  payload,
  avatarDataUrl = "",
  icons = { keyIcon: "", jackpotIcon: "", bgImage: "" },
  decorDataUrl = "",
) => {
  const width = CARD_IMAGE_WIDTH;
  const height = CARD_IMAGE_HEIGHT;
  const panelX = 18;
  const panelY = 18;
  const panelW = width - panelX * 2;
  const panelH = height - panelY * 2;
  const leftPad = panelX + 34;
  const topPad = panelY + 34;

  const statY = panelY + 126;
  const statGap = 16;
  const statW = (panelW - 72 - statGap * 3) / 4;
  const statH = 102;
  const metaW = (panelW - 72 - statGap) / 2;
  const metaH = 56;
  const metaBottomPad = 22;
  const metaGapY = 12;
  const metaY2 = panelY + panelH - metaH - metaBottomPad;
  const metaY1 = metaY2 - metaH - metaGapY;

  const safeDisplayName = payload.displayName.length > 18 ? `${payload.displayName.slice(0, 17)}...` : payload.displayName;

  const netPalette = getNetPalette(payload.netTone);
  const netLabel = `Net ${payload.netEth} ETH`;
  const netPillW = Math.max(340, Math.min(520, 90 + netLabel.length * 18));
  const netPillX = panelX + panelW - netPillW - 28;
  const netPillY = topPad + 2;

  const statCard = (x, y, label, value, iconDataUrl = "", iconType = "") => {
    const iconW = iconType === "key" ? 40 : 42;
    const iconH = iconW;
    const iconX = x + statW - iconW - 14;
    const iconY = y + (statH - iconH) / 2;

    const iconMarkup = iconDataUrl
      ? `
      <image href="${iconDataUrl}" x="${iconX}" y="${iconY}" width="${iconW}" height="${iconH}" preserveAspectRatio="xMidYMid meet" opacity="0.96"/>
    `
      : "";

    return `
    <g>
      <rect x="${x}" y="${y}" width="${statW}" height="${statH}" rx="24" fill="url(#statFillGrad)" stroke="rgba(114, 183, 230, 0.3)" stroke-width="2"/>
      ${iconMarkup}
      <text x="${x + 24}" y="${y + 34}" fill="#9eb8d1" font-size="16" font-family="Arial, sans-serif" font-weight="600" letter-spacing="2.2">${escapeXml(
        label,
      )}</text>
      <text x="${x + 24}" y="${y + 78}" fill="#edf7ff" font-size="26" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
        value,
      )} ETH</text>
    </g>
  `;
  };

  const metaCard = (x, y, text) => `
    <g>
      <rect x="${x}" y="${y}" width="${metaW}" height="${metaH}" rx="20" fill="url(#metaFillGrad)" stroke="rgba(114, 183, 230, 0.23)" stroke-width="2"/>
      <text x="${x + 22}" y="${y + 37}" fill="#aac4db" font-size="20" font-family="Arial, sans-serif">${escapeXml(text)}</text>
    </g>
  `;

  const avatarMarkup = avatarDataUrl
    ? `
      <clipPath id="avatarClip"><circle cx="${leftPad + 44}" cy="${topPad + 44}" r="38"/></clipPath>
      <circle cx="${leftPad + 44}" cy="${topPad + 44}" r="40" fill="#18364f" stroke="rgba(110, 198, 255, 0.86)" stroke-width="4"/>
      <image href="${avatarDataUrl}" x="${leftPad + 6}" y="${topPad + 6}" width="76" height="76" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />
    `
    : `
      <defs>
        <linearGradient id="avatarFallbackGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#4bb9ff"/>
          <stop offset="100%" stop-color="#2ce9b8"/>
        </linearGradient>
      </defs>
      <circle cx="${leftPad + 44}" cy="${topPad + 44}" r="40" fill="url(#avatarFallbackGrad)"/>
      <text x="${leftPad + 44}" y="${topPad + 58}" fill="#062638" text-anchor="middle" font-size="40" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
          safeDisplayName.slice(0, 1).toUpperCase() || "?",
        )}</text>
    `;

  const decorMarkup = decorDataUrl
    ? `<image href="${decorDataUrl}" x="${panelX + panelW - 116}" y="${panelY + panelH - 116}" width="92" height="92" preserveAspectRatio="xMidYMid meet" opacity="0.16"/>`
    : "";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgFallbackGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a1727"/>
      <stop offset="52%" stop-color="#123049"/>
      <stop offset="100%" stop-color="#0d2f3f"/>
    </linearGradient>
    <clipPath id="panelClip">
      <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="26"/>
    </clipPath>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(17, 37, 56, 0.42)"/>
      <stop offset="100%" stop-color="rgba(9, 21, 36, 0.52)"/>
    </linearGradient>
    <linearGradient id="panelTopLine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(118, 211, 255, 0.0)"/>
      <stop offset="35%" stop-color="rgba(118, 211, 255, 0.78)"/>
      <stop offset="65%" stop-color="rgba(57, 246, 202, 0.78)"/>
      <stop offset="100%" stop-color="rgba(57, 246, 202, 0.0)"/>
    </linearGradient>
    <linearGradient id="statFillGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(6, 22, 37, 0.60)"/>
      <stop offset="100%" stop-color="rgba(5, 18, 31, 0.50)"/>
    </linearGradient>
    <linearGradient id="metaFillGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(6, 22, 37, 0.52)"/>
      <stop offset="100%" stop-color="rgba(5, 18, 31, 0.42)"/>
    </linearGradient>
  </defs>

  ${
    icons.bgImage
      ? `<image href="${icons.bgImage}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`
      : `<rect width="${width}" height="${height}" fill="url(#bgFallbackGrad)"/>`
  }
  ${
    icons.bgImage
      ? `<image href="${icons.bgImage}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#panelClip)" opacity="0.78"/>`
      : ""
  }
  <rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="26" fill="url(#panelGrad)" stroke="rgba(130, 188, 230, 0.34)" stroke-width="3"/>
  <rect x="${panelX + 8}" y="${panelY + 4}" width="${panelW - 16}" height="2" rx="1" fill="url(#panelTopLine)"/>
  ${decorMarkup}

  ${avatarMarkup}

  <text x="${leftPad + 118}" y="${topPad + 40}" fill="#edf7ff" font-size="56" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
    safeDisplayName,
  )}</text>
  <text x="${leftPad + 118}" y="${topPad + 88}" fill="#9eb8d1" font-size="22" font-family="DejaVu Sans Mono, monospace">${escapeXml(
    `(${payload.shortWallet})`,
  )}</text>

  <rect x="${netPillX}" y="${netPillY}" width="${netPillW}" height="66" rx="33" fill="${netPalette.fill}" stroke="${netPalette.stroke}" stroke-width="2.5"/>
  <text x="${netPillX + netPillW / 2}" y="${netPillY + 44}" text-anchor="middle" fill="${netPalette.text}" font-size="32" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
    netLabel,
  )}</text>

  ${statCard(panelX + 36, statY, "KEY SPEND", payload.keySpendEth, icons.keyIcon, "key")}
  ${statCard(panelX + 36 + (statW + statGap), statY, "WEEKLY CLAIMS", payload.weeklyClaimsEth)}
  ${statCard(
    panelX + 36 + (statW + statGap) * 2,
    statY,
    "JACKPOT CLAIMS",
    payload.jackpotClaimsEth,
    icons.jackpotIcon,
    "jackpot",
  )}
  ${statCard(panelX + 36 + (statW + statGap) * 3, statY, "TOTAL CLAIMS", payload.totalClaimsEth)}

  ${metaCard(panelX + 36, metaY1, `Keys bought: ${payload.keysBought}`)}
  ${metaCard(panelX + 36 + metaW + statGap, metaY1, `Purchase events: ${payload.purchaseEvents}`)}
  ${metaCard(panelX + 36, metaY2, `Weekly events: ${payload.weeklyEvents}`)}
  ${metaCard(panelX + 36 + metaW + statGap, metaY2, `Jackpot events: ${payload.jackpotEvents}`)}
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
  });

  return resvg.render().asPng();
};
