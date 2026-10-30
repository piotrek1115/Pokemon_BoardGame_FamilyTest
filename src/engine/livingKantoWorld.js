// LIVING KANTO 2.0 — the GAME engine (rules.livingKanto 'v1'; docs/design/LIVING_KANTO_2_0.md, decisions:
// docs/design/RUMOURS_LIVING_KANTO_DECISION_CARD.md). Copied 17.10.2026 from the Living Kanto prototype (c022774 — the prototype
// stays, as the frozen design reference with its own tests) and adapted for the game: the slots come from the game's
// rules (K-07: rumours / expeditions without a limit), the authored rumours and the expedition stay with
// rumourEngine (K-20: a heard rumour stays with its player), no stones from the boards in v1 (decision 5).
//
// The world model: what the REAL game data says is possible on the family board. Every offer the
// generator makes is checked here (validateOffer) — a species must be catchable at a land-reachable
// place, a place must exist and be reachable on land from every character's start, an item must
// exist and be on sale, a type must be catchable. Read-only imports: src/data/* and two pure engine
// helpers (travelEngine.travelDistances — the one graph of the game — and rng.js via the generator).
import { LOCATIONS, LOCATIONS_BY_ID, locationBiomes } from '../data/locations.js';
import { LOCAL_POOLS } from '../data/pools.js';
import { POKEMON_BY_ID, isWild } from '../data/pokemon.js';
import { TYPE_IDS } from '../data/types.js';
import { BIOME_IDS } from '../data/biomes.js';
import { ITEMS } from '../data/items.js';
import { CHARACTERS } from '../data/characters.js';
import { pokeStopPlaces } from '../data/pokeStops.js';
import { SHOP_STOCK } from '../data/economy3.js';
import { TRAINER_ARCHETYPES_BY_ID } from '../data/trainers.js';
import { QUEST_BOOK_KEY_ITEMS } from '../data/questBook.js';
import { travelDistances } from './travelEngine.js';

// The rules of a NEW game this prototype assumes (a mirror of CONFIG — tests/proto-livingKanto.test.js
// fails when CONFIG drifts away from it). The prototype never imports CONFIG itself.
export const WORLD_CONFIG = Object.freeze({
  map: Object.freeze({ topology: 'kanto45', includeOptionalNodes: true }),
  rules: Object.freeze({ travelNetwork: 'v2', pokeStops: 'v2', localPools: 'v2', questBook: 'v2', shopStock: 'regional' }),
  travel: Object.freeze({ startingCapabilities: Object.freeze({ canTravelWater: false }) }),
});

// Shop prices (mirror of CONFIG.economy) and the selling rate (CONFIG.selling.rate).
export const PRICES = Object.freeze({ pokeball: 2, superball: 4, ultraball: 8, potion: 3, superpotion: 5, revive: 5, thunderstone: 5, waterstone: 5, firestone: 5, leafstone: 5, moonstone: 5 });
export const SELL_RATE = 0.5;
// Team Rocket's first week (mirror of CONFIG.rocket.firstWeek): no Rocket contract before a plot can exist.
export const ROCKET_FIRST_WEEK = 2;
// The League's hub has no pool and nothing to explore: it gets no board (open question Q8).
export const NO_BOARD = Object.freeze(['indigo-plateau']);

const OBJECTIVE_KINDS = ['visit', 'explore', 'catch', 'seeSignature', 'defeatTrainer', 'defeatRocket', 'challenge', 'bring', 'wait', 'evolve', 'show', 'give', 'observe', 'encounter'];
export const KNOWN_OBJECTIVE_KINDS = Object.freeze([...OBJECTIVE_KINDS]);
const COUNTED = ['defeatTrainer', 'defeatRocket', 'evolve', 'observe'];
const SPECIAL_ARCHETYPES = ['jessie']; // authored quest challenges use Team Rocket's own name (celadon-rocket)

// The world of a game: built once from the data, read-only afterwards — one per board-relevant configuration (a pure
// function of the data and these config values, so the cache holds no game state).
const WORLDS = new Map();
export function worldFor(config) {
  const key = JSON.stringify([config.map, config.travel?.startingCapabilities, ['travelNetwork', 'pokeStops', 'localPools', 'questBook', 'shopStock', 'travelGraph'].map((k) => config.rules?.[k])]);
  if (!WORLDS.has(key)) WORLDS.set(key, buildWorld(config));
  return WORLDS.get(key);
}
export function buildWorld(config = WORLD_CONFIG) {
  const land = { capabilities: { ...config.travel.startingCapabilities } }; // no Surf — the sea loop is closed
  const starts = [...new Set(CHARACTERS.map((c) => c.start))];
  const fromStart = starts.map((s) => travelDistances(land, s, config));
  const reachable = LOCATIONS.map((l) => l.id).filter((id) => fromStart.every((d) => d[id] !== undefined));
  const reach = new Set(reachable);
  const explorable = reachable.filter((id) => LOCAL_POOLS[id] && locationBiomes(id, config).length > 0);
  const stops = pokeStopPlaces(config).filter((id) => reach.has(id) && !NO_BOARD.includes(id));
  const shop = SHOP_STOCK.regional.base.filter((id) => ITEMS[id]); // on sale at every Poké Stop
  // catchable[species] = [{ place, signature }] — land places whose own pool has it (rules.localPools 'v2')
  const catchable = {};
  for (const place of explorable) {
    const pool = LOCAL_POOLS[place];
    for (const [list, signature] of [[pool.signature, true], [pool.background, false]]) {
      for (const id of list) {
        const sp = POKEMON_BY_ID[id];
        if (!sp || !isWild(sp)) continue;
        const at = (catchable[id] ??= []);
        if (!at.some((e) => e.place === place)) at.push({ place, signature });
      }
    }
  }
  const distCache = {};
  const distFrom = (place) => (distCache[place] ??= travelDistances(land, place, config));
  return Object.freeze({ config, starts, reachable, reach, explorable, stops, shop, catchable, distFrom });
}

export const speciesOf = (id) => POKEMON_BY_ID[id] ?? null;
export const rarityOf = (id) => POKEMON_BY_ID[id]?.rarity ?? null;
export const biomesOf = (world, place) => locationBiomes(place, world.config);
export const placeName = (id) => LOCATIONS_BY_ID[id]?.name ?? id;
export const placeType = (id) => LOCATIONS_BY_ID[id]?.type ?? null;

// Ordinary (non-Super-Rare) species catchable somewhere on land, optionally only within `radius` steps
// of `from` and of the given rarities.
export function catchableSpecies(world, { from = null, radius = Infinity, rarities = ['common', 'rare'], type = null, places = null } = {}) {
  const d = from ? world.distFrom(from) : null;
  return Object.keys(world.catchable).filter((id) => {
    const sp = POKEMON_BY_ID[id];
    if (!rarities.includes(sp.rarity)) return false;
    if (type && !sp.types.includes(type)) return false;
    return world.catchable[id].some((e) => (!places || places.includes(e.place)) && (!d || (d[e.place] ?? Infinity) <= radius));
  });
}

// Reachable explorable places of a biome (as the game's board has them).
export function placesWithBiome(world, biome) {
  return world.explorable.filter((p) => biomesOf(world, p).includes(biome));
}

// ---- validation: an offer the game could not finish is a bug ---------------------------------------

const placeOk = (world, p) => typeof p === 'string' && world.reach.has(p) && !NO_BOARD.includes(p);
const ordinaryCatchable = (world, id) => Boolean(world.catchable[id]) && POKEMON_BY_ID[id].rarity !== 'superRare';

// Every reason this quest definition is impossible (or not allowed) in this world; [] = valid.
export function validateQuest(world, quest, { authored = false } = {}) {
  const problems = [];
  const bad = (msg) => problems.push(`${quest?.id ?? '?'}: ${msg}`);
  if (!quest || !Array.isArray(quest.stages) || quest.stages.length === 0) return [`${quest?.id ?? '?'}: no stages`];
  // 'pokeStop' = any Poké Stop; 'board' = any board the offer is posted at (a World Opportunity)
  for (const where of [quest.takeAt, quest.claimAt]) if (where !== 'pokeStop' && where !== 'board' && !placeOk(world, where)) bad(`take/claim place ${where} not reachable on land`);
  const given = new Set();
  quest.stages.forEach((stage, si) => {
    if (!stage.objectives?.length) bad(`stage ${si} has no objectives`);
    for (const o of stage.objectives ?? []) {
      if (!OBJECTIVE_KINDS.includes(o.kind)) {
        bad(`unknown objective kind ${o.kind}`);
        continue;
      }
      if ('place' in o && !placeOk(world, o.place)) bad(`${o.kind}: place ${o.place} does not exist or is not reachable on land`);
      if (['explore', 'challenge', 'encounter'].includes(o.kind) && !world.explorable.includes(o.place)) bad(`${o.kind}: nothing to explore at ${o.place}`);
      if (o.kind === 'catch') {
        const types = o.types ?? null;
        const species = o.species ?? null;
        const places = o.places ?? null;
        if (types && !types.every((t) => TYPE_IDS.includes(t))) bad(`catch: unknown type in ${types}`);
        if (species && !species.every((id) => ordinaryCatchable(world, id))) bad(`catch: species ${species} not catchable on land (or Super Rare)`);
        if (places && !places.every((p) => world.explorable.includes(p))) bad(`catch: a place in ${places} cannot be explored`);
        const fits = Object.keys(world.catchable).filter((id) => POKEMON_BY_ID[id].rarity !== 'superRare'
          && (!species || species.includes(id))
          && (!types || types.some((t) => POKEMON_BY_ID[id].types.includes(t)))
          && (!places || world.catchable[id].some((e) => places.includes(e.place))));
        if (!fits.length) bad('catch: no ordinary species fits every filter on land');
        if (!(o.count >= 1)) bad('catch: count < 1');
      }
      if (o.kind === 'show') {
        if (!o.types?.length || !o.types.every((t) => TYPE_IDS.includes(t))) bad(`show: bad types ${o.types}`);
        else {
          const kinds = Object.keys(world.catchable).filter((id) => ordinaryCatchable(world, id) && o.types.some((t) => POKEMON_BY_ID[id].types.includes(t)));
          if (kinds.length < o.count) bad(`show: only ${kinds.length} different ${o.types} species catchable, ${o.count} asked`);
        }
      }
      if (o.kind === 'give') {
        if (!ITEMS[o.item]) bad(`give: unknown item ${o.item}`);
        else if (!world.shop.includes(o.item)) bad(`give: ${o.item} is not on sale at every Poké Stop`);
        if (!(o.count >= 1)) bad('give: count < 1');
      }
      if (o.kind === 'challenge') {
        if (!TRAINER_ARCHETYPES_BY_ID[o.archetype] && !(authored && SPECIAL_ARCHETYPES.includes(o.archetype))) bad(`challenge: unknown trainer archetype ${o.archetype}`);
        if (!Array.isArray(o.teams) || o.teams.length !== 3 || o.teams.some((t) => !t.length || !t.every((id) => POKEMON_BY_ID[id]))) bad('challenge: three teams of known species needed');
      }
      if (o.kind === 'bring' && !given.has(o.keyItem)) bad(`bring: key item ${o.keyItem} is never given by an earlier stage`);
      if (o.kind === 'encounter' && !(world.catchable[o.species] ?? []).some((e) => e.place === o.place)) bad(`encounter: ${o.species} does not live at ${o.place}`);
      if (o.kind === 'observe' && !(o.count >= 1 && o.count <= Object.keys(world.catchable).length)) bad('observe: count out of range');
      if (COUNTED.includes(o.kind) && o.kind !== 'observe' && !(o.count >= 1 && o.count <= 3)) bad(`${o.kind}: count must be 1–3`);
      if (o.kind === 'explore' && !(o.times >= 1 && o.times <= 3)) bad('explore: times must be 1–3');
    }
    if (stage.gives?.keyItem) given.add(stage.gives.keyItem);
  });
  for (const r of quest.reward ?? []) {
    const known = r.type === 'money' || r.type === 'pokeballs' || r.type === 'clue' || r.type === 'pokemon' || r.type === 'keyItem' || Boolean(ITEMS[r.type]);
    if (!known) bad(`reward: unknown type ${r.type}`);
    if (r.type === 'keyItem' && !QUEST_BOOK_KEY_ITEMS[r.id]) bad(`reward: unknown key item ${r.id}`);
    if (r.type === 'pokemon' && !POKEMON_BY_ID[r.species]) bad(`reward: unknown species ${r.species}`);
    if (r.type !== 'pokemon' && r.type !== 'keyItem' && !(Number.isInteger(r.amount) && r.amount > 0)) bad(`reward: amount of ${r.type} must be a positive integer`);
    if (r.otherwise && !(r.otherwise.type === 'money' || ITEMS[r.otherwise.type])) bad('reward: bad `otherwise`');
  }
  return problems;
}

// An offer is valid when its quest is, its posting stops are boards of this world and its map hints exist.
export function validateOffer(world, offer) {
  const problems = validateQuest(world, offer.quest, { authored: offer.authored === true });
  const posts = offer.posts ?? [offer.stop];
  for (const s of posts) if (!world.stops.includes(s)) problems.push(`${offer.id}: posted at ${s}, which has no board`);
  for (const p of offer.hints ?? []) if (!placeOk(world, p)) problems.push(`${offer.id}: map hint ${p} is not a reachable place`);
  if (offer.biome && !BIOME_IDS.includes(offer.biome)) problems.push(`${offer.id}: unknown biome ${offer.biome}`);
  return problems;
}
