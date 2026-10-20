// One Kanto day 14.10 — ACHIEVEMENTS (rules.achievements 'v1'; data/achievements.js). After every action
// (turnEngine.dispatch) each player's measures are read from the game state — the engine's own counters — and
// any achievement whose target is reached is earned ONCE: player.achievements.earned[id] = the week. Idempotent
// (earned stays earned, a reload / replay reads the same state), per player, offline. Points are provisional
// data for a future score; the game's end does not use them.
import { ACHIEVEMENT_SETS, KANTO_TROPHY_CARDS } from '../data/achievements.js';
import { log } from './log.js';
import { createRng, shuffleWith } from './rng.js';
import { getSpecies } from '../data/pokemon.js';

export const usesAchievements = (config) => Boolean(ACHIEVEMENT_SETS[config.rules.achievements]);
// The trophies of this game: 'v1' (dev-1410) or 'v2' (bonus 14.10: + 8 early / middle ones). No config = 'v1'.
export const achievementList = (config = null) => ACHIEVEMENT_SETS[config?.rules.achievements] ?? ACHIEVEMENT_SETS.v1;

// What each measure counts, from the state (no UI counters).
export const MEASURES = {
  pvpWins: (p) => p.stats.pvp?.qualifiedWins ?? 0, // only QUALIFIED wins (pvpEngine — anti-farm)
  trades: (p) => p.stats.trades ?? 0,
  oakJobs: (p) => p.stats.oak?.returned ?? 0, // completed Research Jobs
  rocketPlots: (p) => p.stats.rocket?.cleared ?? 0, // each plot is cleared once, by one player
  places: (p) => (p.visited ?? []).length,
  species: (p) => p.pokedex.caught.length,
  evolutions: (p) => p.stats.evolutions ?? 0,
  // DIFFERENT quests — Living Kanto 2.0: a board card counts by its KIND (`family`), not by its own id (every card is new)
  quests: (p) => new Set(Object.entries(p.questRecords?.byQuest ?? {}).filter(([, q]) => q.completed > 0).map(([id, q]) => q.family ?? id)).size,
  champion: (p) => (p.league?.champion ? 1 : 0),
  // bonus 14.10 ('v2'): real engine counters only
  wildCatches: (p) => p.stats.capture?.catches ?? 0, // wild Pokémon caught (captureEngine)
  teamSize: (p) => p.team.length,
  rocketWins: (p) => p.stats.rocket?.wins ?? 0, // battles won against Team Rocket
  superRareMet: (p) => p.stats.capture?.byRarity?.superRare?.encounters ?? 0, // wild Super Rare encounters (captureEngine)
  fishCaught: (p) => p.stats.fishing?.caught ?? 0, // caught on the Old Rod (fishingEngine)
};

// ---- ACHIEVEMENTS 3.0 (rules.achievements 'v3' — Piotr 18.10, ChatGPT 12:21; the set dev-1610-ach3) -------------------
// FIRST PLAYER WINS: ONE registry for the whole game, `state.trophies.owners[id] = { player, week, seq }` (the log entry
// that awarded it) — a trophy has one owner, forever; a player who meets a taken trophy's condition later gets nothing
// (no points either). The AI plays for them too. Read after every action (turnEngine.dispatch), from the engine's own
// counters; nothing in a 'v1' / 'v2' game changes (their per-player `p.achievements` as before).
// Precedence: a trophy goes to the first player whose action (or whose own event inside an action — the next player's
// Research Job back at the start of their turn) meets it. Only a TRADE changes two players' collections in one step: then
// the player whose action it is (the trade happens in their turn) comes first, then the seats after them in turn order —
// the game's order of play, never the players' place in `state.players`.
// The new counters (`p.stats.ach3`, only in a 'v3' game — every older save keeps its state byte for byte):
//   species   different species CAUGHT by the player (a wild catch, the Old Rod — never a trade, a quest's Pokémon, the starter)
//   rare      of them, the species of the class Rare (getSpecies().rarity === 'rare')
//   biomes    the biomes of those catches (the encounter's biome: grass, cave, water …)
//   trainers  the NPC trainers beaten (a trainer battle — the routes' and a quest's challenge; not a gym, the League or
//             Team Rocket — those have their own trophies): its identity = its type and its name („youngster:Joey”), the
//             same trainer beaten again counts once
//   flawless  of them, those beaten in a battle with no KO of the player's Pokémon (encounter.playerFainted false)
//   stones    the different Evolution Stones used to evolve
// A trophy game: 'v3' (all 20), 'v4' (TROFEA KANTO — 8 of the same 20, below) or 'v5' ('v4' with a trainer's place, below).
// Everything above holds for all three.
export const usesAchievements3 = (config) => ['v3', 'v4', 'v5'].includes(config?.rules?.achievements);
// The game's 20 cards (the same ids, conditions and points; 'v5' has the trainer trophies' new words).
export const trophyList = (config) => ACHIEVEMENT_SETS[config?.rules?.achievements] ?? ACHIEVEMENT_SETS.v3;

// ---- ACHIEVEMENTS 4.0 — TROFEA KANTO (rules.achievements 'v4' — Piotr, wariant A, ChatGPT 18.10 13:04; dev-1610-ach4) --
// A new game shuffles the 20 trophy cards and lays out 8 (KANTO_TROPHY_CARDS) — fully at random, as the physical board
// game: no categories, no guaranteed card, no balancing, no replacement, no filter. `state.trophies.active` = those 8 ids
// in the order drawn; only they can be won and score — the other 12 are out of this game. Drawn once, at setup, on its
// own stream (`state.trophyRng`, seeded `${seed}:trophies`): the same seed lays out the same 8, and no roll of a battle,
// an encounter or any other deck moves. A loaded game keeps its 8 (never drawn again). Everything else is 'v3'.
export const usesTrophyDeck = (config) => ['v4', 'v5'].includes(config?.rules?.achievements);
// The trophies in play, in the list's order (the order a step awards them — ODKRYWCA before OBIEŻYŚWIAT): 'v4' its 8, 'v3' all 20.
export function activeTrophies(state) {
  const active = state.trophies?.active;
  const list = trophyList(state.config);
  return active ? list.filter((a) => active.includes(a.id)) : list;
}
const uniq = (list, value) => (list.includes(value) ? list : list.push(value) && list);
export function trophyCounters(player) {
  return (player.stats.ach3 ??= { species: [], rare: [], biomes: [], trainers: [], flawless: [], stones: [] });
}
// the engine's hooks (only in a 'v3' game): a wild catch, a trainer won, a stone evolution
export function noteTrophyCatch(state, player, species, rarity, biome) {
  if (!usesAchievements3(state.config)) return;
  const c = trophyCounters(player);
  uniq(c.species, species);
  if (rarity === 'rare') uniq(c.rare, species);
  if (biome) uniq(c.biomes, biome);
}
// ACHIEVEMENTS 5.0 ('v5' — Piotr's decision E, ChatGPT 18.10 15:24): a trainer is its type, name AND the place of the
// battle („youngster:Youngster Joey:route-3”) — the same type and name on Route 3 and Route 8 are two trainers; beaten
// again on Route 3, still one. 'v3' / 'v4' keep type + name (their games count as they always did).
export const trainerIdentity = (trainer, place = null) => `${trainer.archetype ?? 'npc'}:${trainer.name}${place ? `:${place}` : ''}`;
export const usesTrainerPlaces = (config) => config?.rules?.achievements === 'v5';
export function noteTrophyTrainer(state, player, enc) {
  if (!usesAchievements3(state.config) || enc.kind !== 'trainer') return;
  const c = trophyCounters(player);
  const id = trainerIdentity(enc.trainer, usesTrainerPlaces(state.config) ? player.location : null);
  uniq(c.trainers, id);
  if (!enc.playerFainted) uniq(c.flawless, id);
}
export function noteTrophyStone(state, player, item) {
  if (usesAchievements3(state.config) && item) uniq(trophyCounters(player).stones, item);
}

export const MEASURES3 = {
  places: (p) => (p.visited ?? []).length,
  rocketWins: (p) => p.stats.rocket?.wins ?? 0,
  trainersBeaten: (p) => trophyCounters(p).trainers.length,
  fishCaught: (p) => p.stats.fishing?.caught ?? 0,
  superRareCaught: (p) => p.stats.capture?.byRarity?.superRare?.caught ?? 0, // CAUGHT — never only met
  speciesCaught: (p) => trophyCounters(p).species.length,
  quests: MEASURES.quests,
  oakJobs: (p) => p.stats.oak?.returned ?? 0,
  rocketPlots: (p) => p.stats.rocket?.cleared ?? 0,
  evolutions: (p) => p.stats.evolutions ?? 0,
  pvpWins: (p) => p.stats.pvp?.qualifiedWins ?? 0, // QUALIFIED wins only (pvpEngine's anti-farm, unchanged)
  champion: (p) => (p.league?.champion ? 1 : 0),
  badges: (p) => p.badges?.length ?? 0,
  flawlessTrainers: (p) => trophyCounters(p).flawless.length,
  catchBiomes: (p) => trophyCounters(p).biomes.length,
  // the ACTIVE team: 6 Pokémon whose first types are all different (a fainted one is still in the team)
  elementTeam: (p) => (p.team.length === 6 && new Set(p.team.map((m) => getSpecies(m.species).types[0])).size === 6 ? 1 : 0),
  // different Living Kanto cards of ★★★ done (or done and collected) by this player — each card once
  boardStars3: (p, state) => new Set((state.livingKanto?.contracts?.[p.id] ?? []).filter((c) => c.difficulty === 3 && ['done', 'claimed'].includes(c.status)).map((c) => c.offer)).size,
  stoneEvolutions: (p) => trophyCounters(p).stones.length,
  rareSpecies: (p) => trophyCounters(p).rare.length,
};

export function setupAchievements(state) {
  if (!usesAchievements(state.config)) return;
  if (usesAchievements3(state.config)) {
    state.trophies = { owners: {} };
    for (const p of state.players) trophyCounters(p);
    if (usesTrophyDeck(state.config)) {
      state.trophyRng = createRng(`${state.seed}:trophies`);
      const list = trophyList(state.config); // 'v5': the same 20 ids in the same order — the same seed lays out the same 8
      const deck = shuffleWith(state, 'trophyRng', 'Kanto trophy deck', list.map((a) => a.id));
      state.trophies.active = deck.slice(0, KANTO_TROPHY_CARDS);
      log(state, 'system', `🏆 Kanto trophies in this game: ${state.trophies.active.map((id) => list.find((a) => a.id === id).name).join(', ')}`, { trophyDeck: { active: [...state.trophies.active] } });
    }
    return;
  }
  for (const p of state.players) p.achievements = { earned: {} };
}

// The players in the order of play from the one whose action it is (the trade's tie — see above).
function playOrder(state, actorId) {
  const i = Math.max(0, state.players.findIndex((p) => p.id === actorId));
  return [...state.players.slice(i), ...state.players.slice(0, i)];
}
function checkTrophies(state, actorId) {
  const owners = state.trophies.owners;
  const v = { v3: 3, v4: 4, v5: 5 }[state.config.rules.achievements];
  for (const a of activeTrophies(state)) {
    if (owners[a.id]) continue;
    const winner = playOrder(state, actorId).find((p) => MEASURES3[a.measure](p, state) >= a.target);
    if (!winner) continue;
    const e = log(state, 'achievement', `🏆 ${winner.name} earns ${a.name} — the first in this game (+${a.points})!`, { achievement: { id: a.id, player: winner.id, v, points: a.points } });
    owners[a.id] = { player: winner.id, week: state.turn.round, seq: e.seq };
  }
}
// A player's points (v3 / v4): the trophies in play they own; a chain (ODKRYWCA → OBIEŻYŚWIAT) only its highest tier they own.
// `upTo` (a log seq): only the trophies won up to that entry (the registry's seq).
export function trophyPoints(state, playerId, upTo = Infinity) {
  const best = {};
  for (const a of activeTrophies(state)) {
    const o = state.trophies?.owners[a.id];
    if (o?.player === playerId && o.seq <= upTo && a.tier > (best[a.chainId]?.tier ?? 0)) best[a.chainId] = a;
  }
  return Object.values(best).reduce((sum, a) => sum + a.points, 0);
}
// What a trophy really added to its owner's points (ChatGPT 18.10 12:54, P1): a chain's higher tier adds only what
// it is worth over the tier its owner already had — ODKRYWCA 10 → OBIEŻYŚWIAT 20 is +10; another player's
// OBIEŻYŚWIAT is +20. Read from the registry (its seq), so the same after a reload; nothing is logged.
export function trophyGain(state, id) {
  const o = state.trophies?.owners[id];
  return o ? trophyPoints(state, o.player, o.seq) - trophyPoints(state, o.player, o.seq - 1) : 0;
}
// A loaded save (gameState.deserialize): a 'v3' / 'v4' game carries its registry (known trophies, real players; 'v4' also
// its 8 cards — owners only among them; 'v3' none); any other carries none. { reason: 'newer' | 'corrupt', message } or null.
export function trophySaveProblem(state) {
  const v3 = usesAchievements3(state.config);
  if (!v3) return state.trophies === undefined ? null : { reason: 'corrupt', message: 'a trophy registry in a game without Achievements 3.0' };
  const t = state.trophies;
  if (!t || typeof t !== 'object' || !t.owners || typeof t.owners !== 'object') return { reason: 'corrupt', message: 'an Achievements 3.0 game without its trophy registry' };
  const ids = new Set(trophyList(state.config).map((a) => a.id));
  const players = new Set((state.players ?? []).map((p) => p.id));
  if (usesTrophyDeck(state.config)) {
    // 'v4': its 8 cards — known, different; an owner only of a card in play
    const active = t.active;
    if (!Array.isArray(active) || active.length !== KANTO_TROPHY_CARDS || new Set(active).size !== active.length) return { reason: 'corrupt', message: 'a Kanto trophy game without its 8 cards' };
    const unknown = active.find((id) => !ids.has(id));
    if (unknown) return { reason: 'newer', message: `an unknown trophy ${unknown}` };
    const outside = Object.keys(t.owners).find((id) => ids.has(id) && !active.includes(id));
    if (outside) return { reason: 'corrupt', message: `the trophy ${outside} is not in this game` };
  } else if (t.active !== undefined) return { reason: 'corrupt', message: 'Kanto trophy cards in an Achievements 3.0 game' };
  for (const [id, o] of Object.entries(t.owners)) {
    if (!ids.has(id)) return { reason: 'newer', message: `an unknown trophy ${id}` };
    if (!o || !players.has(o.player) || !Number.isInteger(o.week) || !Number.isInteger(o.seq)) return { reason: 'corrupt', message: `the trophy ${id}: a broken owner` };
  }
  return null;
}

export function achievementProgress(player, config = null) {
  return achievementList(config).map((a) => ({ ...a, value: Math.min(a.target, MEASURES[a.measure](player)), earned: player.achievements?.earned[a.id] ?? null }));
}

// Provisional points: per chain only the highest earned tier counts (data/achievements.js chainId).
export function achievementPoints(player, config = null) {
  const best = {};
  for (const a of achievementList(config)) if (player.achievements?.earned[a.id] != null && a.tier > (best[a.chainId]?.tier ?? 0)) best[a.chainId] = a;
  return Object.values(best).reduce((sum, a) => sum + a.points, 0);
}

export function checkAchievements(state, actorId = null) {
  if (!usesAchievements(state.config)) return;
  if (usesAchievements3(state.config)) {
    checkTrophies(state, actorId ?? state.players[state.turn.playerIndex]?.id);
    return;
  }
  for (const p of state.players) {
    if (!p.achievements) continue;
    for (const a of achievementList(state.config)) {
      if (p.achievements.earned[a.id] != null || MEASURES[a.measure](p) < a.target) continue;
      p.achievements.earned[a.id] = state.turn.round;
      log(state, 'achievement', `🏆 ${p.name} earns ${a.name}!`, { achievement: { id: a.id, player: p.id } });
    }
  }
}
