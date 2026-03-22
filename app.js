const form = document.querySelector("#wallet-form");
const walletInput = document.querySelector("#wallet-input");
const statusEl = document.querySelector("#status");
const card = document.querySelector("#stats-card");
const suggestionsEl = document.querySelector("#suggestions");
const statsView = document.querySelector("#stats-view");
const leaderboardView = document.querySelector("#leaderboard-view");
const statsViewBtn = document.querySelector("#view-stats-btn");
const leaderboardViewBtn = document.querySelector("#view-leaderboard-btn");
const backToStatsBtn = document.querySelector("#back-to-stats-btn");
const statsHeroTitleMain = document.querySelector("#stats-hero-title-main");
const statsHeroTitleAccent = document.querySelector("#stats-hero-title-accent");
const statsHeroCaption = document.querySelector("#stats-hero-caption");
const leaderboardHeroEyebrow = document.querySelector("#leaderboard-hero-eyebrow");
const leaderboardHeroTitleMain = document.querySelector("#leaderboard-hero-title-main");
const leaderboardHeroTitleAccent = document.querySelector("#leaderboard-hero-title-accent");
const leaderboardHeroDescription = document.querySelector("#leaderboard-hero-description");

const walletTitle = document.querySelector("#wallet-title");
const walletSubtitle = document.querySelector("#wallet-subtitle");
const profileAvatar = document.querySelector("#profile-avatar");
const netPill = document.querySelector("#net-pill");
const netPillLabel = document.querySelector("#net-pill-label");
const netPillValue = document.querySelector("#net-pill-value");
const netPillMeta = document.querySelector("#net-pill-meta");
const projectedWeekPill = document.querySelector("#projected-week-pill");
const walletLogLines = document.querySelector("#wallet-log-lines");

const keysEth = document.querySelector("#keys-eth");
const weeklyEth = document.querySelector("#weekly-eth");
const jackpotEth = document.querySelector("#jackpot-eth");
const totalEth = document.querySelector("#total-eth");

const keysCount = document.querySelector("#keys-count");
const weeklyEvents = document.querySelector("#weekly-events");
const jackpotEvents = document.querySelector("#jackpot-events");
const keysBoughtTotal = document.querySelector("#keys-bought-total");
const purchaseEventsTotal = document.querySelector("#purchase-events-total");
const weeksPlayedTotal = document.querySelector("#weeks-played-total");
const jackpotsWonTotal = document.querySelector("#jackpots-won-total");
const statsFooterWallet = document.querySelector("#stats-footer-wallet");
const copyImageBtn = document.querySelector("#copy-image-btn");
const shareStatus = document.querySelector("#share-status");
const panelGhost = document.querySelector(".panel-ghost");
const includeCurrentWeekCheckbox = document.querySelector("#include-current-week");
const projectedWeekNote = document.querySelector("#projected-week-note");
const includeCurrentWeekGlobalCheckbox = document.querySelector("#include-current-week-global");
const globalProjectedWeekNote = document.querySelector("#global-projected-week-note");
const homeGlobalStatus = document.querySelector("#home-global-status");
const homeGlobalCard = document.querySelector("#home-global-card");
const globalPlayers = document.querySelector("#g-players");
const globalKeys = document.querySelector("#g-keys");
const globalKeySpend = document.querySelector("#g-key-spend");
const globalTotalClaims = document.querySelector("#g-total-claims");
const globalWeeklyClaims = document.querySelector("#g-weekly-claims");
const globalJackpotClaims = document.querySelector("#g-jackpot-claims");
const globalTeamRevenue = document.querySelector("#g-team-revenue");
const globalClaimEvents = document.querySelector("#g-claim-events");
const leaderboardStatus = document.querySelector("#leaderboard-status");
const leaderboardCard = document.querySelector("#leaderboard-card");
const leaderboardPageSizeSelect = document.querySelector("#leaderboard-page-size");
const leaderboardCount = document.querySelector("#leaderboard-count");
const leaderboardBody = document.querySelector("#leaderboard-body");
const leaderboardMeta = document.querySelector("#leaderboard-meta");
const leaderboardPrevBtn = document.querySelector("#leaderboard-prev-btn");
const leaderboardNextBtn = document.querySelector("#leaderboard-next-btn");

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;
const WEI_IN_ETH = 10n ** 18n;
const TEAM_REVENUE_BPS = 1000n;
const SEARCH_DEBOUNCE_MS = 180;
const COPY_SOUND_URL = "/assets/copy.mp3";
const DECOR_GHOST_FALLBACK = "/assets/ghost.gif";
const DEFAULT_GLOBAL_LEADERBOARD_LIMIT = 10;
const LOG_TYPING_INTERVAL_MS = 14;
const LOG_LINE_STAGGER_MS = 120;
const HERO_SCRAMBLE_FRAME_MS = 34;
const HERO_SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_/";

let selectedProfile = null;
let lastSearchToken = 0;
let searchDebounceHandle = null;
let currentWallet = "";
let currentCardData = null;
let copyFlashTimer = null;
let copyButtonResetTimer = null;
let copySound = null;
let decorGifOptions = [];
let selectedDecorGif = "";
let includeCurrentWeekProjected = false;
let includeGlobalCurrentWeekProjected = false;
let currentView = "stats";
let overviewLoaded = false;
let overviewLoadedProjectionMode = false;
let overviewLoadedLimit = DEFAULT_GLOBAL_LEADERBOARD_LIMIT;
let overviewLoadedOffset = 0;
let leaderboardPageSize = DEFAULT_GLOBAL_LEADERBOARD_LIMIT;
let leaderboardOffset = 0;
let leaderboardTotalRows = 0;
let logAnimationToken = 0;
let logAnimationTimers = [];
let heroScrambleToken = 0;
let currentStatsHeroMode = "";
let currentLeaderboardHeroMode = "";

const toTeamRevenueWei = (keySpendWei) => (keySpendWei * TEAM_REVENUE_BPS) / 10_000n;

function shortAddress(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(valueWei, decimals = 4) {
  const negative = valueWei < 0n;
  const abs = negative ? -valueWei : valueWei;
  const scale = 10n ** BigInt(decimals);

  // Round to the nearest display unit (e.g. 0.0001 when decimals=4).
  const roundedAbs = (abs * scale + WEI_IN_ETH / 2n) / WEI_IN_ETH;
  if (roundedAbs === 0n) return "0";

  const integerPart = roundedAbs / scale;
  const fractionPart = roundedAbs % scale;
  const fractionString = fractionPart.toString().padStart(decimals, "0").replace(/0+$/, "");

  const pretty = fractionString.length ? `${integerPart.toString()}.${fractionString}` : integerPart.toString();
  return `${negative ? "-" : ""}${pretty}`;
}

function formatInt(value) {
  try {
    return BigInt(String(value ?? "0")).toLocaleString("en-US");
  } catch {
    return "0";
  }
}

function parseWei(value) {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "timestamp unavailable";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function clearLogAnimation() {
  logAnimationToken += 1;
  for (const timer of logAnimationTimers) {
    clearTimeout(timer);
  }
  logAnimationTimers = [];
}

function delay(ms) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    logAnimationTimers.push(timer);
  });
}

async function typeLogMessage(node, message, token) {
  for (let index = 0; index <= message.length; index += 1) {
    if (token !== logAnimationToken) return;
    node.textContent = message.slice(0, index);
    if (index < message.length) {
      await delay(LOG_TYPING_INTERVAL_MS);
    }
  }
}

async function animateWalletLogs(lines, token) {
  const rows = [...walletLogLines.querySelectorAll(".log-row")];
  for (let index = 0; index < rows.length; index += 1) {
    if (token !== logAnimationToken) return;
    const row = rows[index];
    const message = row.querySelector(".log-message");
    if (!message) continue;

    row.classList.add("is-visible");
    message.classList.add("is-typing");
    await typeLogMessage(message, lines[index].message, token);
    if (token !== logAnimationToken) return;
    message.classList.remove("is-typing");
    await delay(LOG_LINE_STAGGER_MS);
  }
}

function renderWalletLogs(lines, options = {}) {
  if (!walletLogLines) return;
  clearLogAnimation();

  const animate = options.animate !== false && !prefersReducedMotion();

  walletLogLines.innerHTML = lines
    .map(
      (line) => `
        <div class="log-row${animate ? "" : " is-visible"}">
          <span class="log-time">${escapeHtml(line.time)}</span>
          <span class="log-message${line.accent ? " log-message-accent" : ""}">${animate ? "" : escapeHtml(line.message)}</span>
        </div>
      `,
    )
    .join("");

  if (animate) {
    const token = logAnimationToken;
    void animateWalletLogs(lines, token);
  }
}

function setProjectionModeLabel(enabled) {
  if (!projectedWeekPill) return;
  projectedWeekPill.textContent = enabled ? "Projection mode current week included" : "Projection mode disabled";
}

function setProfitSummary(netProfitWei) {
  if (!netPill || !netPillLabel || !netPillValue || !netPillMeta) return;

  const profitEth = formatEth(netProfitWei);
  const signedProfit = netProfitWei > 0n ? `+${profitEth}` : profitEth;
  let state = "neutral";
  let meta = "Break even";

  if (netProfitWei > 0n) {
    state = "positive";
    meta = "Net return";
  } else if (netProfitWei < 0n) {
    state = "negative";
    meta = "Under water";
  }

  netPill.dataset.state = state;
  netPillLabel.textContent = "Profit";
  netPillValue.textContent = signedProfit;
  netPillMeta.textContent = meta;
}

function renderDefaultLogs() {
  renderWalletLogs([
    { time: "[boot]", message: "SYSTEM IDLE. AWAITING USER INPUT.", accent: true },
    { time: "[hint]", message: "Search by Abstract username or wallet address.", accent: false },
  ], { animate: true });
}

function randomScrambleChar() {
  if (window.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return HERO_SCRAMBLE_CHARS[buf[0] % HERO_SCRAMBLE_CHARS.length];
  }
  return HERO_SCRAMBLE_CHARS[Math.floor(Math.random() * HERO_SCRAMBLE_CHARS.length)];
}

function scrambleText(text, revealedCount) {
  return text
    .split("")
    .map((char, index) => {
      if (char === " ") return " ";
      if (index < revealedCount) return char;
      return randomScrambleChar();
    })
    .join("");
}

function animateScrambleText(element, finalText, stepOffset, token) {
  if (!element) return;

  const steps = Math.max(finalText.replaceAll(" ", "").length + 5, 8);
  let frame = 0;

  const tick = () => {
    if (token !== heroScrambleToken) return;

    const revealedCount = Math.max(0, frame - stepOffset);
    if (revealedCount >= finalText.length) {
      element.textContent = finalText;
      return;
    }

    element.textContent = scrambleText(finalText, revealedCount);
    frame += 1;
    window.setTimeout(tick, HERO_SCRAMBLE_FRAME_MS);
  };

  tick();
}

function setStatsHeroMode(mode, options = {}) {
  const nextMode = mode === "wallet" ? "wallet" : "stats";
  const target =
    nextMode === "wallet"
      ? {
          main: "PLAYER_",
          accent: "STATS",
          caption: "PLAYER INTERFACE // WALLET ACCESS",
        }
      : {
          main: "GLOBAL_",
          accent: "STATS",
          caption: "PROTOCOL INTERFACE // ARCHIVE ACCESS",
        };

  if (
    currentStatsHeroMode === nextMode &&
    !options.force &&
    statsHeroTitleMain?.textContent === target.main &&
    statsHeroTitleAccent?.textContent === target.accent &&
    statsHeroCaption?.textContent === target.caption
  ) {
    return;
  }

  currentStatsHeroMode = nextMode;
  heroScrambleToken += 1;
  const token = heroScrambleToken;

  if (options.animate === false) {
    if (statsHeroTitleMain) statsHeroTitleMain.textContent = target.main;
    if (statsHeroTitleAccent) statsHeroTitleAccent.textContent = target.accent;
    if (statsHeroCaption) statsHeroCaption.textContent = target.caption;
    return;
  }

  animateScrambleText(statsHeroTitleMain, target.main, 0, token);
  animateScrambleText(statsHeroTitleAccent, target.accent, 2, token);
  animateScrambleText(statsHeroCaption, target.caption, 4, token);
}

function setLeaderboardHeroMode(mode = "leaderboard", options = {}) {
  const nextMode = mode === "leaderboard" ? "leaderboard" : "leaderboard";
  const target = {
    eyebrow: "SYSTEM_ACCESS_GRANTED",
    main: "GLOBAL",
    accent: "LEADERBOARD",
    description: "RANKING THE TOP PLAYERS BY ACCUMULATED REWARDS",
  };

  if (
    currentLeaderboardHeroMode === nextMode &&
    !options.force &&
    leaderboardHeroEyebrow?.textContent === target.eyebrow &&
    leaderboardHeroTitleMain?.textContent === target.main &&
    leaderboardHeroTitleAccent?.textContent === target.accent &&
    leaderboardHeroDescription?.textContent === target.description
  ) {
    return;
  }

  currentLeaderboardHeroMode = nextMode;
  heroScrambleToken += 1;
  const token = heroScrambleToken;

  if (options.animate === false) {
    if (leaderboardHeroEyebrow) leaderboardHeroEyebrow.textContent = target.eyebrow;
    if (leaderboardHeroTitleMain) leaderboardHeroTitleMain.textContent = target.main;
    if (leaderboardHeroTitleAccent) leaderboardHeroTitleAccent.textContent = target.accent;
    if (leaderboardHeroDescription) leaderboardHeroDescription.textContent = target.description;
    return;
  }

  animateScrambleText(leaderboardHeroEyebrow, target.eyebrow, 0, token);
  animateScrambleText(leaderboardHeroTitleMain, target.main, 2, token);
  animateScrambleText(leaderboardHeroTitleAccent, target.accent, 4, token);
  animateScrambleText(leaderboardHeroDescription, target.description, 6, token);
}

function setCurrentView(view, options = {}) {
  const next = view === "leaderboard" ? "leaderboard" : view === "wallet" ? "wallet" : "stats";
  const previousView = currentView;
  currentView = next;
  document.body.dataset.view = next;
  const isLeaderboard = next === "leaderboard";
  const isWallet = next === "wallet";

  statsView.classList.toggle("hidden", isLeaderboard);
  leaderboardView.classList.toggle("hidden", !isLeaderboard);
  card.classList.toggle("hidden", !isWallet);
  backToStatsBtn.classList.toggle("hidden", !isWallet);
  statsViewBtn.classList.toggle("is-active", !isLeaderboard);
  leaderboardViewBtn.classList.toggle("is-active", isLeaderboard);
  if (isLeaderboard) {
    setLeaderboardHeroMode("leaderboard", {
      animate: options.animateHero !== false,
      force: previousView !== next,
    });
  } else {
    setStatsHeroMode(isWallet ? "wallet" : "stats", {
      animate: options.animateHero !== false,
      force: previousView !== next,
    });
  }

  if (isWallet) {
    homeGlobalCard.classList.add("hidden");
  } else if (overviewLoaded) {
    homeGlobalCard.classList.remove("hidden");
  }

  if (isLeaderboard) {
    statusEl.textContent = "";
    clearSuggestions();
  } else {
    leaderboardStatus.textContent = "";
    if (!isWallet) {
      statusEl.textContent = "";
      renderDefaultLogs();
      showShareStatus("");
    }
  }

  const shouldSyncUrl = options.syncUrl !== false;
  if (shouldSyncUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    if (next !== "wallet" || !WALLET_REGEX.test(currentWallet)) {
      url.searchParams.delete("wallet");
    } else {
      url.searchParams.set("wallet", currentWallet);
    }
    window.history.replaceState({}, "", url.toString());
  }
}

function showError(message) {
  statusEl.textContent = message;
  card.classList.add("hidden");
  currentCardData = null;
  projectedWeekNote.textContent = "Share-ready snapshot";
  setProjectionModeLabel(includeCurrentWeekProjected);
  renderWalletLogs([{ time: "[error]", message: message, accent: true }], { animate: true });
  showShareStatus("");
}

function showShareStatus(message) {
  shareStatus.textContent = message;
}

function showOverviewError(message, targetView = currentView) {
  if (targetView === "leaderboard") {
    leaderboardStatus.textContent = message;
    leaderboardCard.classList.add("hidden");
  } else {
    homeGlobalStatus.textContent = message;
    homeGlobalCard.classList.add("hidden");
  }

  if (leaderboardMeta) {
    leaderboardMeta.textContent = targetView === "leaderboard" ? "Leaderboard data unavailable." : "Overview unavailable.";
  }

  if (leaderboardPrevBtn) leaderboardPrevBtn.disabled = true;
  if (leaderboardNextBtn) leaderboardNextBtn.disabled = true;
}

function updateLeaderboardControls(rowsShown, totalRows) {
  const safeTotal = Math.max(totalRows, leaderboardOffset + rowsShown);
  const start = rowsShown ? leaderboardOffset + 1 : 0;
  const end = leaderboardOffset + rowsShown;
  const currentPage = Math.floor(leaderboardOffset / leaderboardPageSize) + 1;
  const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / leaderboardPageSize) : 1;

  if (leaderboardPrevBtn) {
    leaderboardPrevBtn.disabled = leaderboardOffset <= 0;
  }

  if (leaderboardNextBtn) {
    leaderboardNextBtn.disabled = rowsShown < leaderboardPageSize || end >= safeTotal;
  }

  leaderboardCount.textContent = rowsShown ? `${start}-${end} of ${safeTotal} wallets` : "0 wallets";
  if (leaderboardMeta) {
    leaderboardMeta.textContent = rowsShown
      ? `PAGE ${currentPage}/${totalPages} // SORTED BY TOTAL CLAIMS`
      : "No indexed wallets available yet.";
  }
}

function renderLeaderboardRows(rows) {
  const sortedRows = [...rows].sort((left, right) => {
    const claimDiff = parseWei(right.totalClaimAmount) - parseWei(left.totalClaimAmount);
    if (claimDiff !== 0n) return claimDiff > 0n ? 1 : -1;

    const revenueDiff = toTeamRevenueWei(parseWei(right.keyPurchaseAmount)) - toTeamRevenueWei(parseWei(left.keyPurchaseAmount));
    if (revenueDiff !== 0n) return revenueDiff > 0n ? 1 : -1;

    return String(left.wallet || "").localeCompare(String(right.wallet || ""));
  });

  if (!sortedRows.length) {
    leaderboardBody.innerHTML = `<tr class="leaderboard-row"><td colspan="3">No player rows available yet.</td></tr>`;
    updateLeaderboardControls(0, leaderboardTotalRows);
    return;
  }

  leaderboardBody.innerHTML = sortedRows
    .map((row, index) => {
      const absoluteRank = leaderboardOffset + index;
      const wallet = (row.wallet || "").toLowerCase();
      const teamRevenue = toTeamRevenueWei(parseWei(row.keyPurchaseAmount));
      const totalClaims = parseWei(row.totalClaimAmount);
      const keySpend = parseWei(row.keyPurchaseAmount);
      const weeklyClaims = parseWei(row.weeklyClaimAmount);
      const jackpotClaims = parseWei(row.jackpotClaimAmount);
      const walletLabel = WALLET_REGEX.test(wallet) ? shortAddress(wallet) : wallet;
      const profileName = typeof row.profileName === "string" ? row.profileName.trim() : "";
      const profileImage = typeof row.profileImageUrl === "string" ? row.profileImageUrl.trim() : "";
      const displayName = profileName || walletLabel;
      const displayNameSafe = escapeHtml(displayName.length > 24 ? `${displayName.slice(0, 23)}...` : displayName);
      const walletLabelSafe = escapeHtml(walletLabel);
      const walletSafe = escapeHtml(wallet);
      const avatarFallback = escapeHtml((displayName.charAt(0) || "?").toUpperCase());
      const avatarMarkup = profileImage
        ? `<img class="leaderboard-avatar" src="${escapeHtml(profileImage)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
        : `<span class="leaderboard-avatar leaderboard-avatar-fallback">${avatarFallback}</span>`;
      const rankIcon =
        absoluteRank === 0
          ? `<span class="material-symbols-outlined leaderboard-rank-icon leaderboard-rank-icon-1">workspace_premium</span>`
          : absoluteRank === 1
            ? `<span class="material-symbols-outlined leaderboard-rank-icon leaderboard-rank-icon-2">military_tech</span>`
            : absoluteRank === 2
              ? `<span class="material-symbols-outlined leaderboard-rank-icon leaderboard-rank-icon-3">military_tech</span>`
              : "";

      return `
        <tr class="leaderboard-row${absoluteRank < 3 ? ` leaderboard-row-top leaderboard-row-top-${absoluteRank + 1}` : ""}" style="--row-index:${index}">
          <td>
            <span class="leaderboard-rank">
              <span class="leaderboard-rank-badge leaderboard-rank-badge-${absoluteRank < 3 ? absoluteRank + 1 : 0}">
                ${rankIcon}
                <span>${String(leaderboardOffset + index + 1).padStart(2, "0")}</span>
              </span>
            </span>
          </td>
          <td>
            <button class="leaderboard-wallet-btn" type="button" data-wallet="${walletSafe}">
              <span class="leaderboard-player">
                ${avatarMarkup}
                <span class="leaderboard-player-meta">
                  <span class="leaderboard-player-name-row">
                    <span class="leaderboard-player-name">${displayNameSafe}</span>
                  </span>
                  <span class="leaderboard-player-address">${walletLabelSafe}</span>
                  <span class="leaderboard-player-submeta">Spend ${formatEth(keySpend)} ETH // Revenue ${formatEth(teamRevenue)} ETH</span>
                </span>
              </span>
            </button>
          </td>
          <td>
            <span class="leaderboard-value">${formatEth(totalClaims)} ETH</span>
            <span class="leaderboard-value-sub">Weekly ${formatEth(weeklyClaims)} ETH // Jackpot ${formatEth(jackpotClaims)} ETH</span>
          </td>
        </tr>
      `;
    })
    .join("");

  updateLeaderboardControls(sortedRows.length, leaderboardTotalRows);
}

function renderGlobalStats(payload) {
  const global = payload?.global;
  if (!global) {
    showOverviewError("Global stats are not available yet.", "stats");
    return;
  }

  const keySpendWei = parseWei(global.keyPurchaseAmount);
  const totalClaimsWei = parseWei(global.totalClaimAmount);
  const weeklyClaimsWei = parseWei(global.weeklyClaimAmount);
  const jackpotClaimsWei = parseWei(global.jackpotClaimAmount);
  const teamRevenueWei = toTeamRevenueWei(keySpendWei);
  const projectedGlobalPoolWei =
    includeGlobalCurrentWeekProjected && payload?.currentWeekGlobalProjection?.weeklyPoolWei
      ? parseWei(payload.currentWeekGlobalProjection.weeklyPoolWei)
      : 0n;
  const weeklyClaimsWithProjectionWei = weeklyClaimsWei + projectedGlobalPoolWei;
  const totalClaimsWithProjectionWei = totalClaimsWei + projectedGlobalPoolWei;

  globalPlayers.textContent = formatInt(global.totalUniquePlayers);
  globalKeys.textContent = formatInt(global.keysPurchased);
  globalKeySpend.textContent = `${formatEth(keySpendWei)} ETH`;
  globalTotalClaims.textContent = `${formatEth(totalClaimsWithProjectionWei)} ETH`;
  globalWeeklyClaims.textContent = `${formatEth(weeklyClaimsWithProjectionWei)} ETH`;
  globalJackpotClaims.textContent = `${formatEth(jackpotClaimsWei)} ETH`;
  globalClaimEvents.textContent = formatInt(parseWei(global.weeklyClaimEvents) + parseWei(global.jackpotClaimEvents));
  globalTeamRevenue.textContent = `${formatEth(teamRevenueWei)} ETH`;
  if (includeGlobalCurrentWeekProjected) {
    const weekNumber = payload?.currentWeekGlobalProjection?.weekNumber ?? "?";
    if (payload?.currentWeekGlobalProjectionError && !payload?.currentWeekGlobalProjection) {
      globalProjectedWeekNote.textContent = "Projected current week global payout is unavailable right now.";
    } else {
      globalProjectedWeekNote.textContent = `Projected current week global payout (Week ${weekNumber}): +${formatEth(projectedGlobalPoolWei)} ETH`;
    }
  } else {
    globalProjectedWeekNote.textContent = "All-time snapshot. Enable projection to include the current week estimate.";
  }

  homeGlobalStatus.textContent = "";
  homeGlobalCard.classList.remove("hidden");
}

function renderLeaderboard(payload) {
  leaderboardTotalRows = Number.parseInt(String(payload?.global?.totalUniquePlayers ?? payload?.leaderboard?.length ?? 0), 10) || 0;
  renderLeaderboardRows(payload?.leaderboard || []);
  leaderboardStatus.textContent = "";
  leaderboardCard.classList.remove("hidden");
}

async function loadOverviewData(force = false) {
  if (
    overviewLoaded &&
    overviewLoadedProjectionMode === includeGlobalCurrentWeekProjected &&
    overviewLoadedLimit === leaderboardPageSize &&
    overviewLoadedOffset === leaderboardOffset &&
    !force
  ) {
    return;
  }

  homeGlobalStatus.textContent = "Loading global stats...";
  homeGlobalCard.classList.add("hidden");
  leaderboardStatus.textContent = "Loading leaderboard...";
  leaderboardCard.classList.add("hidden");
  const includeProjected = includeGlobalCurrentWeekProjected ? "&includeCurrentWeekProjected=1" : "";
  const response = await fetch(`/api/global-stats?limit=${leaderboardPageSize}&offset=${leaderboardOffset}${includeProjected}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Global stats API error");
  }

  const hasGlobal = Boolean(payload?.global);
  renderGlobalStats(payload);
  renderLeaderboard(payload);
  overviewLoaded = hasGlobal;
  overviewLoadedProjectionMode = includeGlobalCurrentWeekProjected;
  overviewLoadedLimit = leaderboardPageSize;
  overviewLoadedOffset = leaderboardOffset;
}

function pickRandomItem(items) {
  if (!items.length) return "";
  if (window.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    window.crypto.getRandomValues(buf);
    return items[buf[0] % items.length];
  }
  return items[Math.floor(Math.random() * items.length)];
}

async function loadDecorGifOptions() {
  let list = [];
  try {
    const response = await fetch("/api/decor-gifs");
    const payload = await response.json();
    if (response.ok) {
      list = (payload.gifs || []).filter(
        (value) =>
          typeof value === "string" &&
          value.startsWith("/assets/") &&
          value.toLowerCase().endsWith(".gif") &&
          !value.includes(".."),
      );
    }
  } catch {
    // fallback handled below
  }

  const deduped = [...new Set(list)];
  if (!deduped.includes(DECOR_GHOST_FALLBACK)) {
    deduped.push(DECOR_GHOST_FALLBACK);
  }
  decorGifOptions = deduped;
}

function applyRandomDecorGif() {
  const nextGif = pickRandomItem(decorGifOptions) || DECOR_GHOST_FALLBACK;
  selectedDecorGif = nextGif;
  if (!panelGhost) {
    return;
  }

  panelGhost.classList.add("hidden");
  panelGhost.src = nextGif;

  const cleanup = () => {
    panelGhost.removeEventListener("load", reveal);
    panelGhost.removeEventListener("error", fail);
  };

  const reveal = () => {
    cleanup();
    panelGhost.classList.remove("hidden");
  };

  const fail = () => {
    cleanup();
    if (selectedDecorGif !== DECOR_GHOST_FALLBACK) {
      selectedDecorGif = DECOR_GHOST_FALLBACK;
      panelGhost.src = DECOR_GHOST_FALLBACK;
      panelGhost.addEventListener("load", reveal, { once: true });
      panelGhost.addEventListener("error", reveal, { once: true });
      return;
    }
    panelGhost.classList.remove("hidden");
  };

  panelGhost.addEventListener("load", reveal, { once: true });
  panelGhost.addEventListener("error", fail, { once: true });

  if (panelGhost.complete && panelGhost.naturalWidth > 0) {
    reveal();
  }
}

function getCopySound() {
  if (copySound) return copySound;
  copySound = new Audio(COPY_SOUND_URL);
  copySound.preload = "auto";
  copySound.volume = 0.72;
  return copySound;
}

async function primeCopySound() {
  const sound = getCopySound();
  if (sound.dataset.primed === "1") return;

  const previousMuted = sound.muted;
  const previousVolume = sound.volume;
  sound.muted = true;
  sound.volume = 0;

  try {
    await sound.play();
  } catch {
    // Some browsers may still block. Keep going.
  } finally {
    sound.pause();
    sound.currentTime = 0;
    sound.muted = previousMuted;
    sound.volume = previousVolume;
    sound.dataset.primed = "1";
  }
}

async function playCopySound() {
  const sound = getCopySound();
  try {
    sound.currentTime = 0;
    await sound.play();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      showShareStatus("Card image copied. Sound is blocked until browser media is enabled.");
      return false;
    }
    showShareStatus("Card image copied. Could not play sound.");
    return false;
  }
}

function setCopyButtonState(mode) {
  if (mode === "busy") {
    copyImageBtn.disabled = true;
    copyImageBtn.classList.remove("is-done");
    copyImageBtn.classList.add("is-busy");
    copyImageBtn.textContent = "Copying...";
    return;
  }

  if (mode === "done") {
    copyImageBtn.disabled = false;
    copyImageBtn.classList.remove("is-busy");
    copyImageBtn.classList.add("is-done");
    copyImageBtn.textContent = "Copied";
    return;
  }

  copyImageBtn.disabled = false;
  copyImageBtn.classList.remove("is-busy", "is-done");
  copyImageBtn.textContent = "Copy as Image";
}

function flashCopyFeedback() {
  if (copyFlashTimer) clearTimeout(copyFlashTimer);
  card.classList.remove("copy-success");
  void card.offsetWidth;
  card.classList.add("copy-success");
  copyFlashTimer = setTimeout(() => {
    card.classList.remove("copy-success");
  }, 700);
}

function clearSuggestions() {
  suggestionsEl.innerHTML = "";
  suggestionsEl.classList.add("hidden");
}

function renderSuggestions(users) {
  if (!users.length) {
    clearSuggestions();
    return;
  }

  suggestionsEl.innerHTML = users
    .map((user) => {
      const escapedName = (user.name || "Unnamed").replace(/"/g, "&quot;");
      const escapedAddress = user.address.replace(/"/g, "&quot;");
      const escapedImage = (user.image || "").replace(/"/g, "&quot;");
      return `
        <button
          class="suggestion-item"
          type="button"
          data-name="${escapedName}"
          data-address="${escapedAddress}"
          data-image="${escapedImage}"
          role="option"
        >
          <img class="suggestion-avatar" src="${escapedImage}" alt="${escapedName}" onerror="this.style.visibility='hidden'" />
          <span class="suggestion-main">
            <span class="suggestion-name">${escapedName}</span>
            <span class="suggestion-address">${escapedAddress}</span>
          </span>
        </button>
      `;
    })
    .join("");
  suggestionsEl.classList.remove("hidden");
}

async function searchProfiles(query) {
  const token = ++lastSearchToken;
  const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
  const payload = await response.json();

  if (token !== lastSearchToken) {
    return;
  }

  if (!response.ok) {
    throw new Error(payload.error || "Search API error");
  }

  renderSuggestions(payload.users || []);
  statusEl.textContent = "";
}

function setProfileIdentity(wallet, profile) {
  const profileName = profile?.name?.trim() || "";
  const displayName = profileName || shortAddress(wallet);
  const avatar = profile?.image?.trim();

  walletTitle.textContent = `${displayName}`;
  walletSubtitle.textContent = shortAddress(wallet);

  if (avatar) {
    profileAvatar.src = `/api/avatar?url=${encodeURIComponent(avatar)}`;
    profileAvatar.classList.remove("hidden");
  } else {
    profileAvatar.removeAttribute("src");
    profileAvatar.classList.add("hidden");
  }
}

async function resolveProfileForWallet(wallet) {
  try {
    const response = await fetch(`/api/search?query=${encodeURIComponent(wallet)}`);
    if (!response.ok) return null;

    const payload = await response.json();
    const exact = (payload.users || []).find((user) => (user.address || "").toLowerCase() === wallet);
    if (!exact) return null;

    return {
      name: exact.name || "",
      address: wallet,
      image: exact.image || "",
      verification: exact.verification || null,
    };
  } catch {
    return null;
  }
}

function resolveIndexedProfile(stats) {
  const name = typeof stats?.profileName === "string" ? stats.profileName.trim() : "";
  const image = typeof stats?.profileImageUrl === "string" ? stats.profileImageUrl.trim() : "";
  const verification = typeof stats?.profileVerification === "string" ? stats.profileVerification.trim() : "";

  if (!name && !image) return null;
  return {
    name,
    address: stats.wallet,
    image,
    verification: verification || null,
  };
}

function setWalletInUrl(wallet) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "wallet");
  url.searchParams.set("wallet", wallet);
  window.history.replaceState({}, "", url.toString());
}

function getShareFileName() {
  const fallback = "wallet";
  if (!WALLET_REGEX.test(currentWallet)) {
    return `mog-wallet-${fallback}.png`;
  }

  return `mog-wallet-${currentWallet.slice(2, 10)}.png`;
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
}

async function copyCardAsImage() {
  if (!currentCardData) {
    throw new Error("No card data available");
  }

  const response = await fetch("/api/player-card-image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(currentCardData),
  });

  if (!response.ok) {
    let message = "Could not render image";
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const blob = await response.blob();

  if (navigator.clipboard?.write && window.ClipboardItem) {
    await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
    showShareStatus("Card image copied to clipboard.");
    return "clipboard";
  }

  downloadBlob(blob, getShareFileName());
  showShareStatus("Clipboard image is not supported here. PNG downloaded instead.");
  return "download";
}

function showStats(stats, profile = null, currentWeekProjected = null, includeProjection = false, projectionError = "") {
  const keyPurchaseAmount = BigInt(stats.keyPurchaseAmount);
  const weeklyClaimAmount = BigInt(stats.weeklyClaimAmount);
  const jackpotClaimAmount = BigInt(stats.jackpotClaimAmount);
  const projectedWeekPayoutWei =
    includeProjection && currentWeekProjected?.projectedPayoutWei ? BigInt(currentWeekProjected.projectedPayoutWei) : 0n;

  const weeklyClaimAmountWithProjection = weeklyClaimAmount + projectedWeekPayoutWei;
  const totalClaims = weeklyClaimAmountWithProjection + jackpotClaimAmount;
  const netProfitWei = totalClaims - keyPurchaseAmount;
  currentWallet = stats.wallet;

  setProfileIdentity(stats.wallet, profile);

  const keyPurchaseEth = formatEth(keyPurchaseAmount);
  const weeklyClaimEth = formatEth(weeklyClaimAmountWithProjection);
  const jackpotClaimEth = formatEth(jackpotClaimAmount);
  const totalClaimsEth = formatEth(totalClaims);
  const netProfitEth = formatEth(netProfitWei);
  const shortWalletValue = shortAddress(stats.wallet);
  const profileName = profile?.name?.trim() || "";
  const displayName = profileName || shortWalletValue;
  const avatarUrl = profile?.image?.trim() || "";

  keysEth.textContent = keyPurchaseEth;

  weeklyEth.textContent = weeklyClaimEth;

  jackpotEth.textContent = jackpotClaimEth;

  totalEth.textContent = totalClaimsEth;

  setProfitSummary(netProfitWei);

  const keysPurchased = BigInt(stats.keysPurchased).toString();
  const keyPurchaseEvents = BigInt(stats.keyPurchaseEvents).toString();
  const weeklyClaimEvents = BigInt(stats.weeklyClaimEvents).toString();
  const jackpotClaimEvents = BigInt(stats.jackpotClaimEvents).toString();

  keysCount.textContent = `Keys bought: ${keysPurchased}`;
  weeklyEvents.textContent = `Weeks played: ${weeklyClaimEvents}`;
  jackpotEvents.textContent = `Jackpots won: ${jackpotClaimEvents}`;
  if (keysBoughtTotal) keysBoughtTotal.textContent = keysPurchased;
  if (purchaseEventsTotal) purchaseEventsTotal.textContent = keyPurchaseEvents;
  if (weeksPlayedTotal) weeksPlayedTotal.textContent = weeklyClaimEvents;
  if (jackpotsWonTotal) jackpotsWonTotal.textContent = jackpotClaimEvents;
  if (statsFooterWallet) statsFooterWallet.textContent = shortWalletValue;
  setProjectionModeLabel(includeProjection);

  if (includeProjection) {
    const weekNumber = currentWeekProjected?.weekNumber ?? "?";
    const projectedEth = formatEth(projectedWeekPayoutWei);
    if (projectionError && !currentWeekProjected) {
      projectedWeekNote.textContent = "Projected current week payout is unavailable right now.";
    } else {
      projectedWeekNote.textContent = `Projected current week payout (Week ${weekNumber}): +${projectedEth} ETH`;
    }
  } else {
    projectedWeekNote.textContent = "Share-ready snapshot";
  }

  const projectionLogMessage = includeProjection
    ? currentWeekProjected
      ? `Week ${currentWeekProjected.weekNumber} projection included (+${formatEth(projectedWeekPayoutWei)} ETH).`
      : projectionError || "Projection requested but unavailable."
    : "Projection disabled.";

  renderWalletLogs([
    { time: "[wallet]", message: `${displayName} // ${shortWalletValue}`, accent: true },
    { time: "[claims]", message: `Total ${totalClaimsEth} ETH // Weekly ${weeklyClaimEth} ETH // Jackpot ${jackpotClaimEth} ETH` },
    { time: "[keys]", message: `Spend ${keyPurchaseEth} ETH // Bought ${keysPurchased} // Events ${keyPurchaseEvents}` },
    { time: "[sync]", message: `Last index update ${formatTimestamp(stats.updatedAtTimestamp)}` },
    { time: "[mode]", message: projectionLogMessage },
  ], { animate: true });

  statusEl.textContent = "";
  card.classList.remove("hidden");
  setWalletInUrl(stats.wallet);
  showShareStatus("");
  currentCardData = {
    wallet: stats.wallet,
    displayName,
    shortWallet: shortWalletValue,
    avatarUrl,
    verification: profile?.verification?.trim() || "",
    keySpendEth: keyPurchaseEth,
    weeklyClaimsEth: weeklyClaimEth,
    jackpotClaimsEth: jackpotClaimEth,
    totalClaimsEth,
    summaryEth: totalClaimsEth,
    netProfitEth,
    keysBought: keysPurchased,
    purchaseEvents: keyPurchaseEvents,
    weeklyEvents: weeklyClaimEvents,
    jackpotEvents: jackpotClaimEvents,
    projectionMode: includeProjection ? "Current week included" : "Disabled",
    projectionNote: includeProjection ? projectedWeekNote.textContent : "",
    decorGif: selectedDecorGif || DECOR_GHOST_FALLBACK,
  };
}

async function loadWalletStats(wallet, profile = null, options = {}) {
  const includeProjection = Boolean(options.includeCurrentWeekProjected ?? includeCurrentWeekProjected);
  statusEl.textContent = "Loading wallet stats...";
  card.classList.add("hidden");
  currentCardData = null;
  setProjectionModeLabel(includeProjection);
  renderWalletLogs([
    { time: "[query]", message: `Resolving ${wallet} from indexer...`, accent: true },
    { time: "[mode]", message: includeProjection ? "Current week projection enabled." : "Projection disabled." },
  ], { animate: true });

  const response = await fetch("/api/player-stats", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ wallet, includeCurrentWeekProjected: includeProjection }),
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "API error");
  }

  if (!payload.stats) {
    showError("No data found for this wallet (no indexed events yet).");
    return;
  }

  let effectiveProfile = profile;
  if (!effectiveProfile) {
    effectiveProfile = resolveIndexedProfile(payload.stats);
  }
  if (!effectiveProfile) {
    effectiveProfile = await resolveProfileForWallet(wallet);
  }

  if (effectiveProfile) {
    selectedProfile = effectiveProfile;
  }

  showStats(
    payload.stats,
    effectiveProfile,
    payload.currentWeekProjected || null,
    includeProjection,
    payload.currentWeekProjectedError || "",
  );
}

async function openWalletView(wallet, profile = null, options = {}) {
  setCurrentView("wallet");
  await loadWalletStats(wallet, profile, options);
}

suggestionsEl.addEventListener("click", async (event) => {
  const button = event.target.closest(".suggestion-item");
  if (!button) return;

  const profile = {
    name: button.dataset.name || "",
    address: (button.dataset.address || "").toLowerCase(),
    image: button.dataset.image || "",
  };

  selectedProfile = profile;
  walletInput.value = profile.address;
  clearSuggestions();

  try {
    await openWalletView(profile.address, profile);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

walletInput.addEventListener("input", () => {
  const value = walletInput.value.trim();
  const lowered = value.toLowerCase();

  if (!selectedProfile || selectedProfile.address !== lowered) {
    selectedProfile = null;
  }

  if (searchDebounceHandle) {
    clearTimeout(searchDebounceHandle);
  }

  if (!value || WALLET_REGEX.test(lowered)) {
    clearSuggestions();
    return;
  }

  searchDebounceHandle = setTimeout(async () => {
    try {
      await searchProfiles(value);
    } catch (error) {
      clearSuggestions();
      statusEl.textContent = error instanceof Error ? error.message : "Search failed";
    }
  }, SEARCH_DEBOUNCE_MS);
});

document.addEventListener("click", (event) => {
  if (!form.contains(event.target)) {
    clearSuggestions();
  }
});

async function resolveWalletOrUsername(rawInput) {
  const input = rawInput.trim();
  const lowered = input.toLowerCase();
  if (!input) {
    throw new Error("Enter an Abstract username or wallet address.");
  }

  if (WALLET_REGEX.test(lowered)) {
    const profile = selectedProfile && selectedProfile.address === lowered ? selectedProfile : null;
    return { wallet: lowered, profile };
  }

  const response = await fetch(`/api/search?query=${encodeURIComponent(input)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Search API error");
  }

  const users = payload.users || [];
  if (!users.length) {
    throw new Error("No profile found for this username.");
  }

  const exactName = users.find((user) => (user.name || "").trim().toLowerCase() === lowered);
  const match = exactName || users[0];
  return {
    wallet: (match.address || "").toLowerCase(),
    profile: {
      name: match.name || "",
      address: (match.address || "").toLowerCase(),
      image: match.image || "",
      verification: match.verification || null,
    },
  };
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const { wallet, profile } = await resolveWalletOrUsername(walletInput.value);
    if (profile?.name) {
      selectedProfile = profile;
    }
    await openWalletView(wallet, profile);
    walletInput.value = wallet;
    clearSuggestions();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

copyImageBtn.addEventListener("click", async () => {
  if (card.classList.contains("hidden")) return;

  setCopyButtonState("busy");
  try {
    await primeCopySound();
    await copyCardAsImage();
    await playCopySound();
    flashCopyFeedback();
    setCopyButtonState("done");
    if (copyButtonResetTimer) clearTimeout(copyButtonResetTimer);
    copyButtonResetTimer = setTimeout(() => {
      setCopyButtonState("idle");
    }, 1300);
  } catch {
    showShareStatus("Could not copy card image.");
    setCopyButtonState("idle");
  }
});

includeCurrentWeekCheckbox.addEventListener("change", async () => {
  includeCurrentWeekProjected = includeCurrentWeekCheckbox.checked;

  if (!currentWallet || card.classList.contains("hidden")) return;

  try {
    const profile = selectedProfile && selectedProfile.address === currentWallet ? selectedProfile : null;
    await openWalletView(currentWallet, profile, { includeCurrentWeekProjected });
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

includeCurrentWeekGlobalCheckbox.addEventListener("change", async () => {
  includeGlobalCurrentWeekProjected = includeCurrentWeekGlobalCheckbox.checked;
  try {
    await loadOverviewData(true);
  } catch (error) {
    showOverviewError(error instanceof Error ? error.message : "Global stats unavailable", "stats");
  }
});

leaderboardPageSizeSelect.addEventListener("change", async () => {
  leaderboardPageSize = Number.parseInt(leaderboardPageSizeSelect.value, 10) || DEFAULT_GLOBAL_LEADERBOARD_LIMIT;
  leaderboardOffset = 0;
  try {
    await loadOverviewData(true);
  } catch (error) {
    showOverviewError(error instanceof Error ? error.message : "Leaderboard unavailable", currentView === "leaderboard" ? "leaderboard" : "stats");
  }
});

leaderboardPrevBtn.addEventListener("click", async () => {
  if (leaderboardOffset <= 0) return;

  const previousOffset = leaderboardOffset;
  leaderboardOffset = Math.max(0, leaderboardOffset - leaderboardPageSize);

  try {
    await loadOverviewData(true);
  } catch (error) {
    leaderboardOffset = previousOffset;
    showOverviewError(error instanceof Error ? error.message : "Leaderboard unavailable", "leaderboard");
  }
});

leaderboardNextBtn.addEventListener("click", async () => {
  if (leaderboardOffset + leaderboardPageSize >= leaderboardTotalRows) return;

  const previousOffset = leaderboardOffset;
  leaderboardOffset += leaderboardPageSize;

  try {
    await loadOverviewData(true);
  } catch (error) {
    leaderboardOffset = previousOffset;
    showOverviewError(error instanceof Error ? error.message : "Leaderboard unavailable", "leaderboard");
  }
});

statsViewBtn.addEventListener("click", async () => {
  setCurrentView("stats");
  try {
    await loadOverviewData();
  } catch (error) {
    showOverviewError(error instanceof Error ? error.message : "Global stats unavailable", "stats");
  }
});

leaderboardViewBtn.addEventListener("click", async () => {
  setCurrentView("leaderboard");
  try {
    await loadOverviewData();
  } catch (error) {
    showOverviewError(error instanceof Error ? error.message : "Leaderboard unavailable", "leaderboard");
  }
});

backToStatsBtn.addEventListener("click", async () => {
  setCurrentView("stats");
  try {
    await loadOverviewData();
  } catch (error) {
    showOverviewError(error instanceof Error ? error.message : "Global stats unavailable", "stats");
  }
});

leaderboardBody.addEventListener("click", async (event) => {
  const walletButton = event.target.closest(".leaderboard-wallet-btn");
  if (!walletButton) return;

  const wallet = (walletButton.dataset.wallet || "").toLowerCase();
  if (!WALLET_REGEX.test(wallet)) return;

  walletInput.value = wallet;
  clearSuggestions();

  try {
    await openWalletView(wallet);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Unexpected error");
  }
});

async function bootstrapFromQueryParam() {
  const url = new URL(window.location.href);
  const view = (url.searchParams.get("view") || "stats").trim().toLowerCase();
  if (view === "leaderboard") {
    setCurrentView("leaderboard", { syncUrl: false, animateHero: false });
    try {
      await loadOverviewData();
    } catch (error) {
      showOverviewError(error instanceof Error ? error.message : "Leaderboard unavailable", "leaderboard");
    }
    return;
  }

  const wallet = (url.searchParams.get("wallet") || "").trim().toLowerCase();
  if (view === "wallet" && WALLET_REGEX.test(wallet)) {
    setCurrentView("wallet", { syncUrl: false });
    walletInput.value = wallet;
    try {
      await openWalletView(wallet, null);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unexpected error");
    }
    return;
  }

  setCurrentView("stats", { syncUrl: false, animateHero: false });
  try {
    await loadOverviewData();
  } catch (error) {
    showOverviewError(error instanceof Error ? error.message : "Global stats unavailable", "stats");
  }
}

async function initializePage() {
  includeCurrentWeekProjected = Boolean(includeCurrentWeekCheckbox.checked);
  includeGlobalCurrentWeekProjected = Boolean(includeCurrentWeekGlobalCheckbox.checked);
  leaderboardPageSize = Number.parseInt(leaderboardPageSizeSelect.value, 10) || DEFAULT_GLOBAL_LEADERBOARD_LIMIT;
  leaderboardOffset = 0;
  setStatsHeroMode("stats", { animate: false, force: true });
  setLeaderboardHeroMode("leaderboard", { animate: false, force: true });
  await loadDecorGifOptions();
  applyRandomDecorGif();
  await bootstrapFromQueryParam();
}

initializePage();
