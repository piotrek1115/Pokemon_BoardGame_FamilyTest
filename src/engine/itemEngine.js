// Inventory and item use. Poké Balls keep their own counter (`pokeballs`,
// from Milestone A); every other item lives in `player.items`.
import { BALL_IDS, CURE_IDS, ITEMS } from '../data/items.js';
import { cureTargets, statusOf, usesCombat21 } from './combatMoves.js';
import { getSpecies } from '../data/pokemon.js';
import { log } from './log.js';
import { currentPlayer, heal } from './gameState.js';

export function itemCount(player, id) {
  return id === 'pokeball' ? player.pokeballs : player.items?.[id] ?? 0;
}

// Every ball the player holds (Build 3.3 E2, AUD-04: one list — data/items.js BALL_IDS —
// never „Poké Balls + Super Balls” by name, so a new ball counts everywhere).
export function ballCount(player) {
  return BALL_IDS.reduce((n, id) => n + itemCount(player, id), 0);
}

export function addItem(player, id, n) {
  if (!ITEMS[id]) throw new Error(`Unknown item: ${id}`);
  if (id === 'pokeball') player.pokeballs = Math.max(0, player.pokeballs + n);
  else player.items[id] = Math.max(0, (player.items[id] ?? 0) + n);
}

// The healing items this game has: Potion and Revive; Gameplay P1
// (rules.healingItems 'v2', DQ-91) adds the Super Potion.
export function healingItems(config) {
  return config.rules.healingItems === 'v2' ? ['potion', 'superpotion', 'revive'] : ['potion', 'revive'];
}

// COMBAT 2.1 (rules.statusRules 'c21'): the cure items of this game (none in an older one).
export function cureItems(config) {
  return usesCombat21(config) ? CURE_IDS : [];
}
// Every item the player can use on a Pokémon in this game: the healing ones, then the cures.
export function usableItems(config) {
  return [...healingItems(config), ...cureItems(config)];
}

// Team Pokémon an item can be used on right now. `state` (Combat 2.1 cures): the battle's statuses count too.
export function itemTargets(player, id, state = null) {
  if (itemCount(player, id) <= 0) return [];
  if (ITEMS[id]?.kind === 'cure') return cureTargets(state ?? { encounter: null }, player, ITEMS[id].cures);
  if (id === 'potion' || id === 'superpotion') return player.team.filter((p) => p.hp > 0 && p.hp < p.maxHp);
  if (id === 'revive') return player.team.filter((p) => p.hp === 0);
  return [];
}

// `battle`: used in a battle — the log entry says so; `free` (Gameplay P1): it
// did not take the place of the attack.
export function useItem(state, id, targetUid, { battle = false, free = false } = {}) {
  const player = currentPlayer(state);
  const pokemon = player.team.find((p) => p.uid === targetUid);
  const name = getSpecies(pokemon.species).name;
  addItem(player, id, -1);
  const data = battle ? { item: { id, target: targetUid, species: pokemon.species, battle: true, ...(free ? { free: true } : {}) } } : undefined;
  if (id === 'potion' || id === 'superpotion') {
    const healed = heal(pokemon, state.config.items[id].heal, false);
    log(state, 'action', `${player.name} uses a ${ITEMS[id].name}: ${name} +${healed} HP (❤ ${pokemon.hp}/${pokemon.maxHp})`, data);
  } else if (id === 'revive') {
    pokemon.hp = Math.max(1, Math.ceil(pokemon.maxHp * state.config.items.revive.hpFraction));
    log(state, 'action', `${player.name} uses a Revive: ${name} is back (❤ ${pokemon.hp}/${pokemon.maxHp})`, data);
  } else if (ITEMS[id]?.kind === 'cure') {
    // COMBAT 2.1: the status goes (the arena's, or the poison on the Pokémon)
    const st = statusOf(state.encounter, pokemon.uid, pokemon);
    if (st && state.encounter?.status?.[pokemon.uid]) delete state.encounter.status[pokemon.uid];
    else delete pokemon.status;
    const cureData = { item: { id, target: targetUid, species: pokemon.species, cured: st?.id ?? null, ...(battle ? { battle: true } : {}), ...(free ? { free: true } : {}) } };
    log(state, 'action', `${player.name} uses ${ITEMS[id].name}: ${name} — ${st?.id ?? 'nothing'} cured`, cureData);
  } else {
    throw new Error(`${id} cannot be used this way`);
  }
}
