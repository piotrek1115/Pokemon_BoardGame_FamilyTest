// LIVING KANTO 2.0 — the GAME engine (rules.livingKanto 'v1'; docs/design/LIVING_KANTO_2_0.md, decisions:
// docs/design/RUMOURS_LIVING_KANTO_DECISION_CARD.md). Copied 17.10.2026 from the Living Kanto prototype (c022774 — the prototype
// stays, as the frozen design reference with its own tests) and adapted for the game: the slots come from the game's
// rules (K-07: rumours / expeditions without a limit), the authored rumours and the expedition stay with
// rumourEngine (K-20: a heard rumour stays with its player), no stones from the boards in v1 (decision 5).
// The twelve dynamic quest archetypes (category A, STANDARD CONTRACTS) and their deterministic generator.
//
// Every archetype builds an ordinary quest-book definition ({ stages: [{ objectives }], reward }) with the
// objective kinds engine/questBookEngine.js already plays — the board is a SOURCE of quests for the one
// Questbook, never a second quest engine. Two archetypes need one optional filter on the existing `catch`
// kind (`engine: 'extension'`, two lines in questBookEngine.advance — docs/design/LIVING_KANTO_2_0.md §5).
//
// Determinism: an offer is drawn from its own stream `${seed}:lk1:${stop}:${slot}:${week}` (rng.js
// createRng — never the game's dice), from data lists in data order. Same seed + same board → same offer.
import { createRng, randomInt } from './rng.js';
import { TYPE_IDS } from '../data/types.js';
import { TRAINER_ARCHETYPES } from '../data/trainers.js';
import { LOCAL_POOLS } from '../data/pools.js';
import { NO_BOARD, ROCKET_FIRST_WEEK, biomesOf, catchableSpecies, placeName, placeType, placesWithBiome, rarityOf, speciesOf } from './livingKantoWorld.js';
import { DELIVER_ITEM_TABLE, menuFor } from './livingKantoRewards.js';

// How far (land steps from the posting stop) a target may be, by difficulty — the board talks about
// its own corner of Kanto (★ near, ★★★ a journey).
export const RADIUS = Object.freeze({ 1: 3, 2: 5, 3: 7 });

// Difficulty draw by week (weights ★ / ★★ / ★★★). Week bands follow the game's pace (first badge ≈ week
// 6–8, a median game ≈ 28–30 weeks: docs/SIMULATION.md).
export const DIFFICULTY_BY_WEEK = Object.freeze([
  { until: 6, weights: [7, 3, 0] },
  { until: 16, weights: [8, 9, 3] },
  { until: Infinity, weights: [5, 9, 6] },
]);

// ---- seeded helpers (data order in, one stream per offer) -----------------------------------------

export const offerRng = (seed, stop, slot, week) => createRng(`${seed}:lk1:${stop}:${slot}:${week}`);
const pickOne = (rng, list) => list[randomInt(rng, list.length)];
function pickWeighted(rng, items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let r = randomInt(rng, total);
  for (const it of items) {
    r -= weightOf(it);
    if (r < 0) return it;
  }
  return items.at(-1);
}
function sample(rng, list, n) {
  const pool = [...list];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(randomInt(rng, pool.length), 1)[0]);
  return out;
}
const dist = (world, from, to) => world.distFrom(from)[to] ?? Infinity;
const byDistance = (world, from, places) => [...places].sort((a, b) => dist(world, from, a) - dist(world, from, b) || world.reachable.indexOf(a) - world.reachable.indexOf(b));
// Places of the board's corner: [min, max] land steps from the stop, never the stop itself.
const around = (world, stop, list, min, max) => list.filter((p) => p !== stop && !NO_BOARD.includes(p) && dist(world, stop, p) >= min && dist(world, stop, p) <= max);
const towns = (world) => world.reachable.filter((p) => ['city', 'town'].includes(placeType(p)));
const nearestCatchPlaces = (world, stop, species, radius, n = 3) =>
  byDistance(world, stop, [...new Set(species.flatMap((id) => world.catchable[id].map((e) => e.place)))]).filter((p) => dist(world, stop, p) <= radius).slice(0, n);

export function difficultyFor(rng, week) {
  const band = DIFFICULTY_BY_WEEK.find((b) => week <= b.until);
  return pickWeighted(rng, [1, 2, 3], (d) => band.weights[d - 1]);
}

// ---- the twelve archetypes ------------------------------------------------------------------------
// id · label (the card's Polish title) · objective (quest-book kind and parameters) · engine ·
// difficulties · minWeek · weight · cooldownWeeks / maxPerGame (per player, per archetype family) ·
// worldCap (live offers of it in the whole world) · generate(rng, ctx) → { params, stages, hints, … } | null

const CATCH_BIOMES = ['cave', 'water', 'beach', 'forest', 'air', 'haunted', 'sea']; // not grass / city: met everywhere
export const RESOURCE_BY_BIOME = Object.freeze({ cave: 'Minerał', forest: 'Zioła', beach: 'Muszla', sea: 'Muszla', water: 'Lilia wodna', grass: 'Jagody', haunted: 'Świeca', air: 'Pióro', city: 'Części' });

export const ARCHETYPES = Object.freeze([
  {
    id: 'catch-species', label: 'Złap {species}', objective: 'catch {species: [id], count: 1}', engine: 'extension',
    difficulties: [1, 2, 3], minWeek: 1, weight: 3, cooldownWeeks: 2, maxPerGame: 4, worldCap: null,
    generate(rng, { world, stop, difficulty: d }) {
      const radius = RADIUS[d];
      const rarities = d === 3 ? ['rare'] : ['common'];
      const cands = catchableSpecies(world, { from: stop, radius, rarities }).filter((id) => d !== 1 || world.catchable[id].some((e) => e.signature && dist(world, stop, e.place) <= radius));
      if (!cands.length) return null;
      const species = pickOne(rng, cands);
      return {
        params: { species, count: 1 },
        stages: [{ objectives: [{ kind: 'catch', species: [species], count: 1 }] }],
        hints: nearestCatchPlaces(world, stop, [species], radius),
        signature: `catch-species:${species}`,
      };
    },
  },
  {
    id: 'catch-type', label: 'Złap Pokémony typu {type}', objective: 'catch {types: [type], count}', engine: 'existing',
    difficulties: [1, 2, 3], minWeek: 1, weight: 3, cooldownWeeks: 2, maxPerGame: 4, worldCap: null,
    generate(rng, { world, stop, difficulty: d }) {
      const count = d;
      const rarities = d === 1 ? ['common'] : ['common', 'rare'];
      const near = (type) => catchableSpecies(world, { from: stop, radius: RADIUS[d], rarities, type });
      const types = TYPE_IDS.filter((t) => near(t).length >= Math.min(2, count));
      if (!types.length) return null;
      const type = pickOne(rng, types);
      return {
        params: { type, count },
        stages: [{ objectives: [{ kind: 'catch', types: [type], count }] }],
        hints: nearestCatchPlaces(world, stop, near(type), RADIUS[d]),
        signature: `catch-type:${type}:${stop}`,
      };
    },
  },
  {
    id: 'catch-biome', label: 'Złap Pokémona: {biome}', objective: 'catch {places: [biome places], count}', engine: 'extension',
    difficulties: [1, 2, 3], minWeek: 1, weight: 2, cooldownWeeks: 3, maxPerGame: 3, worldCap: null,
    generate(rng, { world, stop, difficulty: d }) {
      const biomes = CATCH_BIOMES.filter((b) => around(world, stop, placesWithBiome(world, b), 0, RADIUS[d]).length > 0);
      if (!biomes.length) return null;
      const biome = pickOne(rng, biomes);
      const places = placesWithBiome(world, biome);
      const count = d === 3 ? 2 : 1;
      return {
        params: { biome, count },
        stages: [{ objectives: [{ kind: 'catch', places, count }] }],
        hints: byDistance(world, stop, places).slice(0, 3),
        signature: `catch-biome:${biome}`,
        biome,
      };
    },
  },
  {
    id: 'deliver-pokemon', label: 'Pokaż {count} Pokémony typu {type} w {place}', objective: 'show {types: [type], count, place}', engine: 'existing',
    difficulties: [1, 2, 3], minWeek: 1, weight: 2, cooldownWeeks: 4, maxPerGame: 2, worldCap: null,
    generate(rng, { world, stop, difficulty: d }) {
      // „Deliver” = SHOW: the Pokémon stay with the player (a child never loses a Pokémon to a quest).
      const count = d;
      const types = TYPE_IDS.filter((t) => catchableSpecies(world, { type: t }).length >= count + 1 && catchableSpecies(world, { from: stop, radius: RADIUS[d], type: t }).length > 0);
      const places = around(world, stop, towns(world), 2, RADIUS[d] + 1);
      if (!types.length || !places.length) return null;
      const type = pickOne(rng, types);
      const place = pickOne(rng, places);
      return {
        params: { type, count, place },
        stages: [{ objectives: [{ kind: 'show', types: [type], count, place }] }],
        hints: [place, ...nearestCatchPlaces(world, stop, catchableSpecies(world, { type }), RADIUS[d], 2)],
        signature: `deliver-pokemon:${type}:${place}`,
      };
    },
  },
  {
    id: 'deliver-item', label: 'Zanieś {count}× {item} do {place}', objective: 'give {item, count, place}', engine: 'existing',
    difficulties: [1, 2], minWeek: 1, weight: 2, cooldownWeeks: 3, maxPerGame: 3, worldCap: null,
    generate(rng, { world, stop, difficulty: d }) {
      const places = around(world, stop, towns(world), 2, RADIUS[d] + 1);
      if (!places.length) return null;
      const row = pickOne(rng, DELIVER_ITEM_TABLE[d]);
      const place = pickOne(rng, places);
      return {
        params: { item: row.item, count: row.count, place },
        stages: [{ objectives: [{ kind: 'give', item: row.item, count: row.count, place }] }],
        hints: [place],
        signature: `deliver-item:${row.item}:${place}`,
        reward: row.reward.map((r) => ({ ...r })), // a trade-up, not the menu (rewards.js DELIVER_ITEM_TABLE)
      };
    },
  },
  {
    id: 'collect-resources', label: 'Zbierz: {resource} ({place}) i przynieś', objective: 'explore {place, times} → gives keyItem → bring {keyItem, place: stop}', engine: 'existing',
    difficulties: [1, 2, 3], minWeek: 1, weight: 2, cooldownWeeks: 3, maxPerGame: 3, worldCap: null,
    generate(rng, { world, stop, difficulty: d, offerId }) {
      const places = around(world, stop, world.explorable, d === 1 ? 1 : 2, RADIUS[d]);
      if (!places.length) return null;
      const place = pickOne(rng, places);
      const biome = pickOne(rng, biomesOf(world, place));
      const resource = RESOURCE_BY_BIOME[biome] ?? 'Próbka';
      const keyItem = `lk:${offerId}`; // one key item per offer: two contracts never share (bring hands in every copy)
      const times = d === 1 ? 1 : 2;
      return {
        params: { place, times, resource, biome },
        stages: [
          { objectives: [{ kind: 'explore', place, times }], gives: { keyItem, keyName: `${resource} (${placeName(place)})` } },
          { objectives: [{ kind: 'bring', keyItem, keyName: `${resource} (${placeName(place)})`, place: stop }] },
        ],
        hints: [place, stop],
        signature: `collect:${place}`,
        keyItem: { id: keyItem, name: `${resource} (${placeName(place)})` },
        biome,
      };
    },
  },
  {
    id: 'explore-places', label: 'Zbadaj {places}', objective: 'explore {place, times: 1} × (★+1) places', engine: 'existing',
    difficulties: [1, 2, 3], minWeek: 1, weight: 3, cooldownWeeks: 2, maxPerGame: 4, worldCap: null,
    generate(rng, { world, stop, difficulty: d }) {
      const n = d + 1;
      const cands = around(world, stop, world.explorable, 1, RADIUS[d]);
      if (cands.length < n) return null;
      const places = sample(rng, cands, n).sort((a, b) => world.reachable.indexOf(a) - world.reachable.indexOf(b));
      return {
        params: { places },
        stages: [{ objectives: places.map((place) => ({ kind: 'explore', place, times: 1 })) }],
        hints: places,
        signature: `explore:${places.join(',')}`,
      };
    },
  },
  {
    id: 'observe-species', label: 'Zobacz {count} nowe gatunki', objective: 'observe {count} (new in the Pokédex since taking)', engine: 'existing',
    difficulties: [1, 2], minWeek: 1, weight: 1, cooldownWeeks: 4, maxPerGame: 2, worldCap: 2,
    generate(rng, { stop, difficulty: d }) {
      const count = d + 1;
      return { params: { count }, stages: [{ objectives: [{ kind: 'observe', count }] }], hints: [], signature: `observe:${stop}` };
    },
  },
  {
    id: 'defeat-trainers', label: 'Pokonaj {count} trenerów', objective: 'defeatTrainer {count}', engine: 'existing',
    difficulties: [1, 2, 3], minWeek: 1, weight: 2, cooldownWeeks: 2, maxPerGame: 4, worldCap: null,
    generate(rng, { stop, difficulty: d }) {
      return { params: { count: d }, stages: [{ objectives: [{ kind: 'defeatTrainer', count: d }] }], hints: [], signature: `defeat-trainers:${stop}` };
    },
  },
  {
    id: 'defeat-rocket', label: 'Pokonaj Zespół R', objective: 'defeatRocket {count: 1}', engine: 'existing',
    difficulties: [2], minWeek: ROCKET_FIRST_WEEK + 1, weight: 1, cooldownWeeks: 4, maxPerGame: 2, worldCap: 1, needsRocket: true,
    generate() {
      return { params: { count: 1 }, stages: [{ objectives: [{ kind: 'defeatRocket', count: 1 }] }], hints: [], signature: 'defeat-rocket' };
    },
  },
  {
    id: 'evolve-pokemon', label: 'Rozwiń Pokémona', objective: 'evolve {count}', engine: 'existing',
    difficulties: [2, 3], minWeek: 4, weight: 1, cooldownWeeks: 6, maxPerGame: 2, worldCap: 2,
    generate(rng, { stop, difficulty: d }) {
      const count = d === 3 ? 2 : 1;
      return { params: { count }, stages: [{ objectives: [{ kind: 'evolve', count }] }], hints: [], signature: `evolve:${stop}` };
    },
  },
  {
    id: 'complete-challenge', label: 'Wyzwanie: {name} ({place})', objective: 'challenge {place, name, archetype, teams: [t1, t2, t3]}', engine: 'existing',
    difficulties: [2, 3], minWeek: 2, weight: 2, cooldownWeeks: 3, maxPerGame: 3, worldCap: null,
    generate(rng, { world, stop, difficulty: d }) {
      const places = around(world, stop, world.explorable, 1, RADIUS[d]).filter((p) => LOCAL_POOLS[p]);
      if (!places.length) return null;
      const place = pickOne(rng, places);
      const pool = [...LOCAL_POOLS[place].signature, ...LOCAL_POOLS[place].background].filter((id) => speciesOf(id));
      const commons = pool.filter((id) => rarityOf(id) === 'common');
      const rares = pool.filter((id) => rarityOf(id) === 'rare');
      if (!commons.length) return null;
      const biomes = biomesOf(world, place);
      const classes = TRAINER_ARCHETYPES.filter((t) => t.biomes.some((b) => biomes.includes(b)));
      const cls = pickOne(rng, classes.length ? classes : TRAINER_ARCHETYPES);
      const name = `${cls.name} ${pickOne(rng, cls.names)}`;
      const c0 = pickOne(rng, commons);
      const c1 = pickOne(rng, commons);
      const r0 = rares.length ? pickOne(rng, rares) : c1;
      const r1 = rares.length ? pickOne(rng, rares) : c0;
      const teams = [[c0], [c0, c1], d === 3 ? [r0, r1, c0] : [r0, c0]];
      return {
        params: { place, name, archetype: cls.id, teams },
        stages: [{ objectives: [{ kind: 'challenge', place, name, archetype: cls.id, teams }] }],
        hints: [place],
        signature: `challenge:${place}`,
      };
    },
  },
]);

export const ARCHETYPES_BY_ID = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));
export const familyOf = (archetypeId) => `lk:${archetypeId}`;

// The nearest difficulty this archetype allows (a drawn ★ for a challenge is ★★).
function allowedDifficulty(arch, d) {
  if (arch.difficulties.includes(d)) return d;
  return [...arch.difficulties].sort((a, b) => Math.abs(a - d) - Math.abs(b - d) || a - b)[0];
}

// Offer instance id: stable, unique, readable — one offer per stop, slot and posting week.
export const offerId = (stop, slot, week) => `lk1:${stop}:w${String(week).padStart(2, '0')}:s${slot}`;

// The quest-book definition of an offer: a „never” quest of its own (each offer is taken once) with a
// FAMILY for the per-player anti-farm records (cooldown / maxPerGame by archetype, not by offer).
// `lk`: what the table needs to SAY the card (its Polish title from the archetype and its parameters) — the game
// keeps the definition on the quest-book occurrence (`def`), never in a global registry (card ids repeat across games).
export function questOf(id, stop, arch, made, reward, difficulty = null) {
  return { id, family: familyOf(arch.id), giver: 'board', takeAt: stop, claimAt: 'pokeStop', repeat: 'never', stages: made.stages, reward, lk: { archetype: arch.id, difficulty, stop, params: made.params, hints: made.hints, ...(made.keyItem ? { keyItem: made.keyItem } : {}) } };
}

// One STANDARD offer for (stop, slot, week), or null when no archetype can make a legal one there.
// `live` = the offers live in the world now (variety: one archetype per board, no two offers with the
// same signature anywhere, the archetype's worldCap).
export function generateStandard(world, live, { seed, stop, slot, week, expiresWeek, options = {} }) {
  const rng = offerRng(seed, stop, slot, week);
  const drawn = difficultyFor(rng, week);
  const id = offerId(stop, slot, week);
  const here = live.filter((o) => o.kind === 'standard' && o.stop === stop);
  const signatures = new Set(live.map((o) => o.signature));
  let cands = ARCHETYPES.filter((a) => a.minWeek <= week && (!a.needsRocket || options.rocket !== false)
    && !here.some((o) => o.archetype === a.id)
    && (a.worldCap == null || live.filter((o) => o.archetype === a.id).length < a.worldCap));
  while (cands.length) {
    const arch = pickWeighted(rng, cands, (a) => a.weight);
    cands = cands.filter((a) => a !== arch);
    const difficulty = allowedDifficulty(arch, drawn);
    for (let attempt = 0; attempt < 3; attempt++) {
      const made = arch.generate(rng, { world, stop, week, difficulty, offerId: id });
      if (!made) break;
      if (signatures.has(made.signature)) continue;
      const reward = made.reward ?? pickOne(rng, menuFor(difficulty, stop, { stones: options.stones !== false }));
      return {
        id, kind: 'standard', archetype: arch.id, family: familyOf(arch.id), stop, slot, postedWeek: week, expiresWeek, difficulty,
        params: made.params, hints: made.hints, signature: made.signature, ...(made.biome ? { biome: made.biome } : {}), ...(made.keyItem ? { keyItem: made.keyItem } : {}),
        quest: questOf(id, stop, arch, made, reward, difficulty), takenBy: null, takenWeek: null,
      };
    }
  }
  return null;
}

// Category B, generated: an exceptional ★★★ offer posted at two boards (first come, first served).
export const WORLD_ARCHETYPES = Object.freeze(['complete-challenge', 'collect-resources', 'catch-species']);
export function generateWorldOffer(world, live, { seed, week, closes, options = {} }) {
  const rng = createRng(`${seed}:lk1:wo:${week}`);
  const anchor = pickOne(rng, world.stops);
  const second = byDistance(world, anchor, world.stops.filter((s) => s !== anchor))[0];
  const id = `lk1:wo:w${String(week).padStart(2, '0')}`;
  const signatures = new Set(live.map((o) => o.signature));
  for (const archId of sample(rng, WORLD_ARCHETYPES, WORLD_ARCHETYPES.length)) {
    const arch = ARCHETYPES_BY_ID[archId];
    const made = arch.generate(rng, { world, stop: anchor, week, difficulty: 3, offerId: id });
    if (!made || signatures.has(made.signature)) continue;
    const reward = pickOne(rng, menuFor(3, anchor, { stones: options.stones !== false }));
    return {
      id, kind: 'world', source: 'generated', archetype: arch.id, family: familyOf(arch.id), stop: anchor, posts: [anchor, second], postedWeek: week, expiresWeek: closes, difficulty: 3,
      params: made.params, hints: made.hints, signature: `wo:${made.signature}`, ...(made.keyItem ? { keyItem: made.keyItem } : {}),
      quest: { ...questOf(id, anchor, arch, made, reward, 3), takeAt: 'board', special: true }, takenBy: null, takenWeek: null, excluded: [],
    };
  }
  return null;
}
