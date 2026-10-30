// Poké Stops (the hubs of DQ-33; Macro 01: more of them, data/pokeStops.js).
// Phase 2 / Build 2 games (rules.pokeStop 'v1'): a visit costs 1 action, fully heals the active team and opens the shop (phase
// "shop"); buying and the mission swap are free until the player leaves.
//
// Gameplay P1 (rules.pokeStop 'v2', DQ-89): no heal on entering. Two separate
// actions, 1 each, both allowed in one turn: Leczenie (healAtPokeStop — the
// whole active team to full HP, fainted included) and Sklep (openShop — buy,
// sell (rules.selling, DQ-94) and the mission swap, any number, until the
// player leaves). Both count as a Poké Stop visit for missions.
import { getLocation } from '../data/locations.js';
import { pokeStopPlaces } from '../data/pokeStops.js';
import { ITEMS, STONE_IDS } from '../data/items.js';
import { getSpecies } from '../data/pokemon.js';
import { log } from './log.js';
import { currentPlayer } from './gameState.js';
import { addItem, ballCount, itemCount } from './itemEngine.js';
import { recordQuestEvent, refillQuests } from './questEngine.js';
import { CURE_ITEMS, SHOP_STOCK, STONE_SOURCES } from '../data/economy3.js';
import { usesCombat21 } from './combatMoves.js';

// Macro 01 (rules.pokeStops): which places have one depends on the game.
export function hasPokeStop(locationId, config) {
  if (!config) throw new Error('hasPokeStop needs the game config (rules.pokeStops)');
  return pokeStopPlaces(config).includes(locationId);
}

export function pokeStopV2(state) {
  return state.config.rules.pokeStop === 'v2';
}

// NIGHTSHIFT_015 D / E (PLAYTEST_014 PT014-06 / PT014-05 — DEV pilots, OFF in every set): a place that ONLY heals —
// Leczenie for 1 action, the same full heal as a Poké Stop, and nothing else (no Sklep, no swap, no quest-book contracts,
// no rumours, no Box, no kit, not a Poké Stop visit for the missions). Only with the two Poké Stop actions (pokeStop 'v2').
//   rules.pokeCenter 'cinnabar'  variant B of D: a Poké Center on Cinnabar Island by Blaine's gym (?dev=cinnabarb; variant
//                                A is the whole Poké Stop, rules.pokeStops 'v2c')
//   rules.oakHeal 'v1'           Professor Oak heals the team in his lab in Pallet Town (?dev=oakheal)
// → 'center' | 'oak' | null. A real Poké Stop always wins (it heals the same way and does the rest).
export function healOnlySpot(location, config) {
  const r = config.rules;
  if (r.pokeStop !== 'v2' || hasPokeStop(location, config)) return null;
  if (r.pokeCenter === 'cinnabar' && location === 'cinnabar-island') return 'center';
  if (r.oakHeal === 'v1' && location === config.oak?.location) return 'oak';
  return null;
}

// The whole active team back to full HP, fainted Pokémon included (DQ-34). COMBAT 2.1: Leczenie cures the poison too
// (the only status that outlives a battle; `mon.status` exists only in those games). COMBAT 2.2: every status lives on
// the Pokémon — the line names the one cured (a Combat 2.1 game's line, „cured of poison”, is the same as before).
function healTeam(player) {
  const cured = player.team.filter((p) => p.status).map((p) => {
    const id = p.status.id;
    delete p.status;
    return `${getSpecies(p.species).name} cured of ${id}`;
  });
  return [...player.team.filter((p) => p.hp < p.maxHp).map((p) => {
    const before = p.hp;
    p.hp = p.maxHp;
    return `${getSpecies(p.species).name} ${before}→${p.maxHp}${before === 0 ? ' (revived)' : ''}`;
  }), ...cured];
}

function countVisit(state, player) {
  recordQuestEvent(state, player, { kind: 'pokeStopVisit', location: player.location });
  refillQuests(state, player); // top up if the deck could not refill earlier
}

function enterShop(state, player) {
  state.shop = { location: player.location, questSwaps: 0, ...(shopChargesOnTransaction(state.config) ? { paid: false } : {}) };
  state.phase = 'shop';
}

// PLAYTEST_009 (rules.shopCharge 'transaction', PT009-06 — Piotr: „samo przeglądanie sklepu nie może kosztować akcji”):
// entering the Sklep, looking, the mission swap and leaving are free; the visit's ONE action is paid by its FIRST buy or
// sell (a transaction that commits — a buy the player cannot afford is never legal, so nothing is charged for it); every
// later buy / sell of the same visit is free, as before. The visit counts for the missions when it is paid (a visit
// still costs an action, as in every older game — no free Poké Stop visits for a mission). Older games: entering pays.
export function shopChargesOnTransaction(config) {
  return config.rules.shopCharge === 'transaction';
}
export function chargeShop(state) {
  if (!shopChargesOnTransaction(state.config) || !state.shop || state.shop.paid) return;
  const player = currentPlayer(state);
  state.turn.actionsRemaining -= 1;
  state.shop.paid = true;
  log(state, 'action', `${player.name} pays the shop visit (1 action) with the first purchase`, { pokeStop: { event: 'paid' } });
  countVisit(state, player);
}

// Phase 2 / Build 2 (rules.pokeStop 'v1'): a visit heals the team and opens the shop.
export function visitPokeStop(state) {
  const player = currentPlayer(state);
  const healed = healTeam(player);
  log(state, 'action', `${player.name} visits the Poké Stop in ${getLocation(player.location).name}: ${healed.length ? `full heal — ${healed.join(', ')}` : 'team already healthy'}`);
  enterShop(state, player);
  countVisit(state, player);
}

// Gameplay P1: Leczenie — only when someone in the team needs it.
export function canHealAtPokeStop(player) {
  return player.team.some((p) => p.hp < p.maxHp || p.status); // COMBAT 2.1: a poisoned one at full HP too
}

export function healAtPokeStop(state) {
  const player = currentPlayer(state);
  const spot = healOnlySpot(player.location, state.config); // NS15 D / E: a heal-only place — the heal, nothing else
  if (spot) {
    const healed = healTeam(player);
    log(state, 'action', `${player.name} heals the team ${spot === 'oak' ? "in Professor Oak's lab" : 'at the Poké Center'} in ${getLocation(player.location).name}: ${healed.join(', ')}`, { pokeStop: { event: 'heal', healed: healed.length, spot } });
    return;
  }
  const healed = healTeam(player);
  log(state, 'action', `${player.name} heals the team at the Poké Stop in ${getLocation(player.location).name}: ${healed.join(', ')}`, { pokeStop: { event: 'heal', healed: healed.length } });
  countVisit(state, player);
}

// Gameplay P1: Sklep — buying, selling and the mission swap; no heal.
export function openShop(state) {
  const player = currentPlayer(state);
  log(state, 'action', `${player.name} goes shopping at the Poké Stop in ${getLocation(player.location).name}`, { pokeStop: { event: 'shop' } });
  enterShop(state, player);
  if (shopChargesOnTransaction(state.config)) state.turn.shopVisits = (state.turn.shopVisits ?? 0) + 1; // PT009-06: the AI enters once a turn
  else countVisit(state, player);
}

export function price(itemId, config) {
  return config.economy[itemId] ?? (usesCombat21(config) ? CURE_ITEMS.prices[itemId] : undefined); // COMBAT 2.1: the cures
}

// What a Poké Stop sells in this game: the stock, plus the Evolution Stones in
// Growth games (a placeholder source until 3B, DQ-78).
export function shopStock(state, place = currentPlayer(state).location) {
  const cfg = state.config;
  const cures = usesCombat21(cfg) ? [...CURE_ITEMS.base, ...(CURE_ITEMS.extra[place] ?? [])] : []; // COMBAT 2.1
  if (cfg.rules.shopStock === 'regional') {
    // Build 3.3 E2 (data/economy3.js): the basics everywhere, a few cities their own
    const { base, extra } = SHOP_STOCK.regional;
    const stones = [...(cfg.rules.stoneSources === 'kanto' ? STONE_SOURCES.kanto.shops[place] ?? [] : []), ...(STONE_SOURCES.shops[cfg.rules.stoneShops]?.[place] ?? [])]; // KANTO WORLD: Cerulean / Vermilion; DEC-4: Fuchsia / Cinnabar
    return [...base, ...(extra[place] ?? []), ...stones, ...cures].filter((id) => id !== 'ultraball' || cfg.rules.ultraBall);
  }
  const stock = cfg.rules.healingItems === 'v2' ? cfg.pokeStop.stockV2 : cfg.pokeStop.stock;
  return [...(cfg.rules.evolution === 'growth' ? [...stock, ...cfg.pokeStop.placeholderStones] : stock), ...cures];
}

export function buyableItems(state) {
  const player = currentPlayer(state);
  if (!canTransact(state)) return [];
  return shopStock(state).filter((id) => player.money >= price(id, state.config));
}
// PT009-06: an unpaid visit needs an action left to pay with (entering needs one, so this is a guard)
function canTransact(state) {
  return !shopChargesOnTransaction(state.config) || state.shop?.paid || state.turn.actionsRemaining > 0;
}

export function buyItem(state, itemId) {
  const player = currentPlayer(state);
  const cost = price(itemId, state.config);
  player.money -= cost;
  addItem(player, itemId, 1);
  log(state, 'action', `${player.name} buys a ${ITEMS[itemId].name} for ${cost} (money ${player.money}, now ${itemCount(player, itemId)})`);
}

// ---- selling (rules.selling, DQ-94) ---------------------------------------------
// ⌊rate × buy price⌋ — always below the buy price, so a buy / sell loop can
// only lose money. Never key items, never the last ball (Poké Balls and
// Super Balls together, as for a trainer retreat).
export function sellPrice(itemId, config) {
  const buy = price(itemId, config);
  return buy ? Math.floor(buy * config.selling.rate) : 0;
}

export function canSell(player, itemId, config) {
  if (!ITEMS[itemId] || ITEMS[itemId].kind === 'key' || sellPrice(itemId, config) < 1) return false;
  if (itemCount(player, itemId) <= 0) return false;
  if (ITEMS[itemId].kind === 'ball') return ballCount(player) > 1;
  return true;
}

export function sellableItems(state) {
  if (!state.config.rules.selling || !canTransact(state)) return [];
  const player = currentPlayer(state);
  return Object.keys(ITEMS).filter((id) => canSell(player, id, state.config));
}

export function sellItem(state, itemId) {
  const player = currentPlayer(state);
  const gain = sellPrice(itemId, state.config);
  addItem(player, itemId, -1);
  player.money += gain;
  log(state, 'action', `${player.name} sells a ${ITEMS[itemId].name} for ${gain} (money ${player.money}, now ${itemCount(player, itemId)})`, { sell: { item: itemId, gain } });
}

// KANTO WORLD DISTRIBUTION (rules.stoneTrade 'v1', a DEV pilot): in the Sklep, one Evolution Stone for another of the five,
// 1:1 — no money; nothing is created: a stone in, a stone out (the Moon Stone too: traded, never sold — DEC-19, ChatGPT
// 25.10 DEC-1). ONCE PER OWN TURN (state.turn.stoneSwapped — re-review 25.10 P2: „once per visit” let a player leave and
// come back, entering being free); like a buy or a sale, the first transaction of an unpaid visit pays the visit's one
// action (rules.shopCharge 'transaction' — chargeShop), so with no action left an unpaid visit trades nothing.
export const usesStoneTrade = (config) => config.rules.stoneTrade === 'v1';
export function stoneSwaps(state) {
  if (!usesStoneTrade(state.config) || state.phase !== 'shop' || state.turn.stoneSwapped || !canTransact(state)) return [];
  const player = currentPlayer(state);
  return STONE_IDS.filter((give) => itemCount(player, give) > 0).flatMap((give) => STONE_IDS.filter((take) => take !== give).map((take) => ({ give, take })));
}
export function swapStone(state, give, take) {
  const player = currentPlayer(state);
  chargeShop(state); // the visit's action, once, with its first transaction
  addItem(player, give, -1);
  addItem(player, take, 1);
  state.turn.stoneSwapped = true;
  log(state, 'action', `${player.name} swaps a ${ITEMS[give].name} for a ${ITEMS[take].name} (1:1, no money; once a turn)`, { stoneSwap: { give, take } });
}

export function leaveShop(state) {
  log(state, 'action', `${currentPlayer(state).name} leaves the Poké Stop`);
  state.shop = null;
  state.phase = 'turn';
}
