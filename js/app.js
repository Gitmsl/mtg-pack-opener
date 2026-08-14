const API = "https://api.scryfall.com";
const CACHE_KEY = "blb-catalog-v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_DELAY_MS = 550;
const SEARCHES = [
  { q: "e:blb", extras: false },
  { q: "e:tblb OR e:ablb", extras: true },
];

const statusEl = document.getElementById("status");
const openBtn = document.getElementById("open-btn");
const packEl = document.getElementById("pack");

let pools = null;
let packsOpened = 0;

function log(...args) {
  console.log("[pack]", ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
}

function imageUri(card) {
  return (
    card.image_uris?.normal ||
    card.card_faces?.[0]?.image_uris?.normal ||
    ""
  );
}

function slim(card) {
  return {
    id: card.id,
    name: card.name,
    rarity: card.rarity,
    type_line: card.type_line || card.card_faces?.[0]?.type_line || "",
    set: card.set,
    booster: Boolean(card.booster),
    foil: card.foil !== false,
    image: imageUri(card),
  };
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (res.status === 429) {
    await sleep(30_000);
    return fetchPage(url);
  }
  if (!res.ok) {
    throw new Error(`Scryfall ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchSearch(q, includeExtras) {
  const params = new URLSearchParams({ q, unique: "prints", order: "set" });
  if (includeExtras) params.set("include_extras", "true");
  let url = `${API}/cards/search?${params.toString()}`;
  const cards = [];
  let first = true;
  while (url) {
    if (!first) await sleep(PAGE_DELAY_MS);
    first = false;
    const data = await fetchPage(url);
    cards.push(...(data.data || []));
    url = data.has_more ? data.next_page : null;
  }
  return cards;
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!Array.isArray(parsed?.cards) || !parsed.cards.length || !parsed.fetchedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cards) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), cards }));
  } catch {
    /* ignore quota */
  }
}

async function loadCatalog() {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    setStatus(`Loaded ${cached.cards.length} cached Bloomburrow cards.`);
    return { cards: cached.cards, stale: false };
  }

  try {
    const batches = [];
    for (let i = 0; i < SEARCHES.length; i += 1) {
      if (i > 0) await sleep(PAGE_DELAY_MS);
      const { q, extras } = SEARCHES[i];
      setStatus(`Fetching ${q} from Scryfall…`);
      batches.push(await fetchSearch(q, extras));
    }
    const seen = new Set();
    const cards = [];
    for (const card of batches.flat().map(slim)) {
      if (!card.image || seen.has(card.id)) continue;
      seen.add(card.id);
      cards.push(card);
    }
    writeCache(cards);
    return { cards, stale: false };
  } catch (err) {
    if (cached?.cards?.length) {
      setStatus("Using cached cards (Scryfall unavailable).", "warn");
      return { cards: cached.cards, stale: true };
    }
    throw err;
  }
}

function isBasicLand(card) {
  return /\bBasic\b/i.test(card.type_line) && /\bLand\b/i.test(card.type_line);
}

function pick(pool) {
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildPools(cards) {
  const blb = cards.filter((card) => card.set === "blb" && card.booster);
  return {
    commons: blb.filter((card) => card.rarity === "common" && !isBasicLand(card)),
    uncommons: blb.filter((card) => card.rarity === "uncommon"),
    rares: blb.filter((card) => card.rarity === "rare"),
    mythics: blb.filter((card) => card.rarity === "mythic"),
    basics: blb.filter(isBasicLand),
    wildcard: blb,
    foilable: blb.filter((card) => card.foil).length ? blb.filter((card) => card.foil) : blb,
    tokens: cards.filter((card) => card.set === "tblb"),
    artCards: cards.filter((card) => card.set === "ablb"),
  };
}

function generatePack(currentPools) {
  const slot = (card, label, foil = false) => ({ card, label, foil });
  const pack = [];
  for (let i = 0; i < 6; i += 1) pack.push(slot(pick(currentPools.commons), "Common"));
  pack.push(
    slot(
      pick(Math.random() < 0.5 ? currentPools.commons : currentPools.uncommons),
      "Bonus"
    )
  );
  for (let i = 0; i < 3; i += 1) pack.push(slot(pick(currentPools.uncommons), "Uncommon"));
  const mythic = Math.random() < 0.125;
  pack.push(
    slot(pick(mythic ? currentPools.mythics : currentPools.rares), mythic ? "Mythic" : "Rare")
  );
  pack.push(slot(pick(currentPools.basics), "Land"));
  pack.push(slot(pick(currentPools.wildcard), "Wildcard"));
  pack.push(slot(pick(currentPools.foilable), "Foil", true));

  const hasTokens = currentPools.tokens.length > 0;
  const hasArt = currentPools.artCards.length > 0;
  if (hasTokens || hasArt) {
    const useToken = hasTokens && (!hasArt || Math.random() < 0.7);
    pack.push(
      slot(pick(useToken ? currentPools.tokens : currentPools.artCards), useToken ? "Token" : "Art Card")
    );
  } else {
    pack.push(slot(pick(currentPools.commons), "Common"));
  }
  return pack;
}

function renderPack(pack) {
  packEl.innerHTML = "";
  pack.forEach((entry, index) => {
    if (!entry.card) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = entry.foil ? "card foil" : "card";
    button.style.setProperty("--delay", `${index * 45}ms`);
    button.dataset.name = entry.card.name;
    button.dataset.label = entry.label;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${entry.label}: ${entry.card.name}. Click to reveal.`);
    button.onclick = function onCardClick() {
      window.appFlipCard(button);
    };

    button.innerHTML = `
      <span class="card-stack">
        <span class="card-face card-back">
          <span class="card-back-mark">BLB</span>
          <span class="card-back-hint">Flip</span>
        </span>
        <span class="card-face card-front">
          <img alt="${entry.card.name.replace(/"/g, "&quot;")}" src="${entry.card.image}" draggable="false">
        </span>
      </span>
      <span class="card-caption">${entry.label}</span>
    `;
    packEl.append(button);
  });
}

function appOpenPack() {
  log("Open pack clicked", { ready: Boolean(pools) });
  if (!pools) {
    setStatus("Still loading cards…");
    return;
  }
  packsOpened += 1;
  const pack = generatePack(pools);
  renderPack(pack);
  setStatus(`Pack ${packsOpened} · click a card to flip it`);
}

function appFlipCard(cardEl) {
  log("Flip card", cardEl?.dataset?.label, cardEl?.dataset?.name);
  if (!cardEl || cardEl.classList.contains("revealed")) return;
  cardEl.classList.add("revealed");
  cardEl.setAttribute("aria-pressed", "true");
  cardEl.setAttribute("aria-label", `${cardEl.dataset.label}: ${cardEl.dataset.name}`);
}

function appRevealAll() {
  const cards = [...packEl.querySelectorAll(".card:not(.revealed)")];
  log("Reveal all clicked", { remaining: cards.length });
  if (!cards.length) {
    setStatus(packsOpened ? "All cards are already face up." : "Open a pack first.");
    return;
  }
  cards.forEach((cardEl, index) => {
    window.setTimeout(() => appFlipCard(cardEl), index * 70);
  });
}

window.appOpenPack = appOpenPack;
window.appFlipCard = appFlipCard;
window.appRevealAll = appRevealAll;

async function boot() {
  log("Boot");
  try {
    const { cards, stale } = await loadCatalog();
    pools = buildPools(cards);
    const required = ["commons", "uncommons", "rares", "mythics", "basics"];
    const missing = required.filter((name) => !pools[name].length);
    if (missing.length) {
      throw new Error(`Card pools are empty: ${missing.join(", ")}`);
    }
    const extras = [];
    if (pools.tokens.length) extras.push(`${pools.tokens.length} tokens`);
    if (pools.artCards.length) extras.push(`${pools.artCards.length} art cards`);
    setStatus(
      `${pools.wildcard.length} booster cards ready${extras.length ? ` · ${extras.join(", ")}` : ""}${stale ? " (cached copy; Scryfall unreachable)" : ""}.`,
      stale ? "warn" : ""
    );
    openBtn.disabled = false;
    log("Ready", { booster: pools.wildcard.length });
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Could not load Bloomburrow cards.", "error");
    openBtn.disabled = true;
  }
}

boot();
