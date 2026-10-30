// Build 3.3 E3 — Questbook 2.0 (rules.questBook 'v2'; data/questBook.js;
// docs/BUILD_3_3_SPEC.md §11.1). One engine for Oak contracts, people's quests and
// (E5) Gym Trials. The old two mission cards (questEngine.js) live on beside it.
//
// Definition ≠ occurrence: taking quest Q for the n-th time creates the occurrence
// 'Q#n' (n = this player's own count — deterministic, so a reload or a replay
// rebuilds the same ids). Everything about an attempt is keyed by its occurrence:
//   player.questBook.active[]   { occ, questId, stage, progress: {objIdx: n},
//                                 places: {objIdx: [place…]}, waited, startedRound }
//   player.questRecords.occ     { [occ]: { startedRound, completedRound?,
//                                 abandonedRound?, credited: {objIdx: [battleSeq…]},
//                                 paid: [rewardIdx…], claimedRound? } }
//   player.questRecords.byQuest { [questId]: { started, completed, lastCompletedRound } }
//   player.questBook.keyItems   key items a stage gave (the Old Amber …)
// Idempotence: a battle has one id (state.battleSeq → encounter.seq, given when
// it starts); a battle objective credits each id once per occurrence; a claim pays
// only reward indices not yet in `paid`. A double tap, a reload, a replay or a
// duplicate event pays nothing twice. A real new cycle of a repeatable quest is a
// new occurrence and pays again (after its cooldown, at most maxPerGame).
// Quest challenges („Wyzwanie z misji”): a fixed team at a fixed place, always
// there — never a random roll; 1 action, at most once per own turn per quest; a
// loss costs the action and the HP, a retry later; Growth only for a slot never
// beaten before (growthEngine.creditKey), no money, no loot.
import { EPIC_QUESTS, EXPEDITIONS, INCIDENT_QUESTS, OAK_POSTS, OBTAIN151_QUESTS, PT016_QUESTS, QUEST_BOOK, QUEST_BOOK_KEY_ITEMS, QUEST_PACK, RUMOUR_QUESTS, STORY_QUESTS, WORLD_QUESTS } from '../data/questBook.js';
import { setWorldFlag, usesIncidents, worldFlag } from './incidentEngine.js';
import { LEGEND_BALL, legendFree, legendState, usesLegendCatch } from './legendEngine.js';
import { RUMOURS } from '../data/rumours.js';
import { ROCKET_PLOTS_BY_ID } from '../data/rocketPlots.js';
import { rumourOpenFor, usesRumours } from './rumourEngine.js';
import { STONE_SOURCES } from '../data/economy3.js';
import { ALL_TRIALS, GYM_TRIALS } from '../data/gymTrials.js';
import { GYMS_BY_ID, gymInCity } from '../data/gyms.js';
import { CHARACTERS_BY_ID } from '../data/characters.js';
import { travelDistances } from './travelEngine.js';
import { createRng, hashIndex, pickWith } from './rng.js';
import { pokeStopPlaces } from '../data/pokeStops.js';
import { getSpecies } from '../data/pokemon.js';
import { ITEMS } from '../data/items.js';
import { FISHING } from '../data/fishing.js';
import { pickVersion } from '../rules.js';
import { log } from './log.js';
import { addCaughtPokemon, createPokemonInstance, currentPlayer, hasHealthyPokemon, markSeen, startLocationOf } from './gameState.js';
import { addItem, itemCount } from './itemEngine.js';
import { hasPokeStop } from './pokeStopEngine.js';
import { markLeadPick } from './leadPickEngine.js';
import { locationBiomes } from '../data/locations.js';
import { abandonContract, claimContract, completeContract } from './livingKantoBoard.js';

export function usesQuestBook(config) {
  return config.rules.questBook === 'v2';
}

export function bookQuests(config) {
  if (!usesQuestBook(config)) return [];
  const quests = pickVersion(QUEST_BOOK, 'v1', 'quest book');
  // PLAYTEST_006 DEV pilots: C4 the expedition, C5 the rumours' quests
  return swapVersions(config, [...quests, ...(usesExpeditions(config) ? EXPEDITIONS.v1 : []), ...(usesRumours(config) ? RUMOUR_QUESTS.v1 : []), ...(usesQuestPack(config) ? QUEST_PACK.day14 : []), ...(usesEpicQuests(config) ? EPIC_QUESTS.v1 : []), ...(usesIncidents(config) && usesQuestBook(config) ? INCIDENT_QUESTS.pilot : []), ...(usesLegendStory(config) ? (usesLegendCatch(config) ? [...STORY_QUESTS.v2, ...STORY_QUESTS.v1.filter((q) => q.id !== 'story-zapdos')] : STORY_QUESTS.v1) : []), ...(usesObtain151(config) ? OBTAIN151_QUESTS.v1 : []), ...(usesWorldQuests(config) ? WORLD_QUESTS.w1 : [])]);
}

// PLAYTEST_016 PT016-07 (rules.powerPlant 'v2'): a quest's new version takes its old one's place in the book (`replaces`) —
// the old definition never changes and stays in every older game
const versionsOf = (config) => (config.rules.powerPlant === 'v2' ? PT016_QUESTS.v2 : []);
const swapVersions = (config, list) => {
  const next = versionsOf(config);
  if (!next.length) return list;
  return list.map((q) => next.find((n) => n.replaces === q.id) ?? q);
};
// The quest a rumour leads to in this game (its new version, when the game plays one)
export const questForRumour = (config, questId) => versionsOf(config).find((n) => n.replaces === questId)?.id ?? questId;

// KANTO WORLD DISTRIBUTION (rules.worldQuests 'w1', a DEV pilot): the regional side missions (data/questBook.js WORLD_QUESTS).
export const usesWorldQuests = (config) => config.rules.worldQuests === 'w1' && usesQuestBook(config);
// …a mission's first week: one week of its `openFrom` range, drawn by the game's seed (a pure hash — no die, no battle roll changes)
export const worldFromWeek = (state, q) => (q.openFrom ? q.openFrom[0] + hashIndex(`${state.seed}:wq:${q.id}`, q.openFrom[1] - q.openFrom[0] + 1) : 0);

// NIGHTSHIFT_014 B (rules.obtain151 'player' / 'world', a prototype): the ways to the 7 species without one (OBTAIN151_QUESTS)
// — a game of the full Pokédex only.
export const usesObtain151 = (config) => Boolean(config.rules.obtain151) && config.rules.roster === 'kanto151' && usesQuestBook(config);

// NIGHTSHIFT E (rules.legendStory 'v1', a prototype): Zapdos / Mewtwo story lines with an inactive end (STORY_QUESTS).
// DEC-01 ('v2', a DEV pilot): the Zapdos line WITH its end — the legend waits in the Power Plant (legendEngine.js).
export const usesLegendStory = (config) => ['v1', 'v2', 'v3'].includes(config.rules.legendStory) && usesQuestBook(config);
// The legend step of a quest (an `encounter` objective with `legend: true`), or null.
export const legendStep = (q) => q?.stages?.flatMap((st) => st.objectives).find((o) => o.kind === 'encounter' && o.legend) ?? null;

// NIGHTSHIFT C (rules.epicQuests 'v1'): the epic lines (data/questBook.js EPIC_QUESTS) — in the book at their place.
export const usesEpicQuests = (config) => config.rules.epicQuests === 'v1' && usesQuestBook(config);

// One Kanto day 14.10 (rules.questPack 'day14'): four quests with new small steps (data/questBook.js QUEST_PACK).
export const usesQuestPack = (config) => config.rules.questPack === 'day14' && usesQuestBook(config);

export function bookQuest(id) {
  return QUEST_BOOK.v1.find((q) => q.id === id) ?? EXPEDITIONS.v1.find((q) => q.id === id) ?? RUMOUR_QUESTS.v1.find((q) => q.id === id) ?? QUEST_PACK.day14.find((q) => q.id === id) ?? EPIC_QUESTS.v1.find((q) => q.id === id) ?? INCIDENT_QUESTS.pilot.find((q) => q.id === id) ?? STORY_QUESTS.v1.find((q) => q.id === id) ?? STORY_QUESTS.v2.find((q) => q.id === id) ?? OBTAIN151_QUESTS.v1.find((q) => q.id === id) ?? WORLD_QUESTS.w1.find((q) => q.id === id) ?? PT016_QUESTS.v2.find((q) => q.id === id) ?? ALL_TRIALS.find((t) => t.id === id) ?? null;
}
// Living Kanto 2.0 (rules.livingKanto 'v1'): a board card is a quest-book occurrence that CARRIES its definition
// (`a.def`, stored with the card when it was posted — card ids repeat across games, so never a global registry).
// Every other occurrence keeps its authored definition. The one lookup for an occurrence.
export const questOf = (a) => a.def ?? bookQuest(a.questId);
// The SPECIAL slots (K-07: no limit in dev-1610-pt009final / lk2 — rumourSlotMax): a rumour's quest, the expedition (it is
// found as a rumour) and a Living Kanto ★★★ offer (`special`). Everything else is ORDINARY (maxActive: 2). The one rule for
// the quest book, the boards and the Journal — a game without the boards has no `special`, so it counts exactly as before.
export const isSpecialQuest = (q) => Boolean(q?.rumour || q?.special);

// PLAYTEST_006 C4 (rules.expeditions 'pilot'): Rare Expeditions — the `encounter` step (data/questBook.js EXPEDITIONS).
export function usesExpeditions(config) {
  return config.rules.expeditions === 'pilot' && usesQuestBook(config);
}

// ---- Build 3.3 E5: Gym Trials (rules.gymTrials 'pilot', data/gymTrials.js) ------------
export function usesTrials(config) {
  return config.rules.gymTrials === 'pilot' && usesQuestBook(config); // a trial lives in the quest book
}

// Once, at createGame (its own stream): every pilot gym's mode and trial; then every
// player learns the trial of their start city.
export function setupTrials(state) {
  if (!usesTrials(state.config)) return;
  state.trialRng = createRng(`${state.seed}:trials`);
  const weights = state.config.gymTrials.modes;
  const bag = Object.entries(weights).flatMap(([mode, n]) => Array.from({ length: n }, () => mode));
  const mix = state.config.gymTrials.mix ?? 'perGym'; // EREV: 'perGym' (A, E5) · 'oneShort' (B) · 'one' (C) · 'fair' (D)
  const pilot = Object.keys(GYM_TRIALS.pilot);
  const modes = {};
  if (mix === 'oneShort' || mix === 'one') {
    // one trial in the whole game, at a gym drawn once; the others open
    const at = pickWith(state, 'trialRng', 'Gym Trial gym', pilot, String);
    const mode = mix === 'oneShort' ? 'short' : pickWith(state, 'trialRng', `Gym Trial mode (${at})`, ['short', 'special'], String);
    for (const gymId of pilot) modes[gymId] = gymId === at ? mode : 'open';
  } else {
    for (const gymId of pilot) modes[gymId] = pickWith(state, 'trialRng', `Gym Trial mode (${gymId})`, bag, String);
    // 'fair' (D): every character at the table keeps an OPEN pilot gym that is not their
    // hometown gym — the nearest such gym is opened when the draw closed them all
    if (mix === 'fair') {
      for (const p of state.players) {
        const home = CHARACTERS_BY_ID[p.id]?.homeGym;
        const mine = pilot.filter((g) => g !== home);
        if (mine.some((g) => modes[g] === 'open')) continue;
        const dist = travelDistances(p, p.location, state.config);
        const nearest = [...mine].sort((a, b) => (dist[GYMS_BY_ID[a].city] ?? 99) - (dist[GYMS_BY_ID[b].city] ?? 99) || (a < b ? -1 : 1))[0];
        modes[nearest] = 'open';
        log(state, 'info', `Gym Trials (fair): ${nearest} stays open for ${p.name}.`);
      }
    }
  }
  state.gymTrials = { version: 'pilot', mix, byGym: {} };
  for (const [gymId, pools] of Object.entries(GYM_TRIALS.pilot)) {
    const mode = modes[gymId];
    const trial = mode === 'open' ? null : pickWith(state, 'trialRng', `Gym Trial (${gymId})`, pools[mode], (t) => t.id);
    state.gymTrials.byGym[gymId] = { mode, ...(trial ? { trialId: trial.id } : {}) };
  }
  for (const p of state.players) learnTrialsAt(state, p, p.location);
}

// A player arriving in a pilot gym's city learns its trial (no spoilers before).
export function learnTrialsAt(state, player, place) {
  if (!usesTrials(state.config)) return;
  const gym = gymInCity(place, state.config);
  const entry = gym && state.gymTrials.byGym[gym.id];
  if (!entry || player.knownTrials.includes(gym.id)) return;
  player.knownTrials.push(gym.id);
  if (entry.mode === 'open') return;
  const occ = `${entry.trialId}#1`;
  player.questRecords.occ[occ] = { startedRound: state.turn.round, credited: {}, paid: [] };
  player.questRecords.byQuest[entry.trialId] = { started: 1, completed: 0, lastCompletedRound: null };
  player.questBook.trials.push({ occ, questId: entry.trialId, gym: gym.id, stage: 0, progress: {}, places: {}, waited: 0, signatureBase: [...(player.signature?.seen ?? [])], startedRound: state.turn.round });
  log(state, 'quest', `🏟️ ${player.name} learns the ${gym.id} gym's trial (${entry.mode}).`, { book: { event: 'trial', gym: gym.id, mode: entry.mode, occ } });
}

// The gym's trial still stands between this player and its leader (gymUnlock).
export function trialMissing(state, player, gymId) {
  if (!usesTrials(state.config)) return false;
  const entry = state.gymTrials.byGym[gymId];
  return Boolean(entry) && entry.mode !== 'open' && !player.trialsDone.includes(gymId);
}

// Every quest-book entry of this player that is still running (quests and trials).
const running = (player) => [...player.questBook.active, ...(player.questBook.trials ?? []).filter((t) => !isDone(t))];
export const findOcc = (player, occ) => player.questBook.active.find((a) => a.occ === occ) ?? (player.questBook.trials ?? []).find((a) => a.occ === occ);

// Both live on the player from createPlayer in a quest-book game (gameState.js); read-only here
// when a check runs (legal actions never change the state).
const records = (player) => player.questRecords;
const book = (player) => player.questBook;

export function maxActive(config) {
  return config.questBook?.maxActive ?? 2;
}
// PLAYTEST_009 K-07 (rules.rumourSlots 'unlimited', OFF until Piotr decides): rumours / expeditions without a limit —
// each its own progress; never the same quest twice (the `active` check); the book's ordinary quests stay at 2
export function rumourSlotMax(config) {
  return config.rules.rumourSlots === 'unlimited' ? Infinity : RUMOURS.maxActive;
}

const atPlace = (state, player, where) => (where === 'pokeStop' ? hasPokeStop(player.location, state.config) : player.location === where);

// NIGHTSHIFT_015 B (PLAYTEST_014 PT014-02 / 03 / 07, rules.questDist 'v2' — a DEV pilot, OFF in every set; ?dev=questdist):
// Quest Distribution v2 — the same quests, other places and times (no quest added, moved or removed; claims unchanged):
//   - Professor Oak's contracts (giver 'oak', taken at a Poké Stop: oak-water, oak-rocket, oak-habitats, oak-field-research):
//     each land Poké Stop gives TWO of them — dealt round the Stops from a seeded start, so neighbouring towns give different
//     pairs and another town has each one in each game (no longer the same four in every city) — and his lab in Pallet Town
//     gives two as well (another seeded pair): Ash and Gary no longer start with nothing to take; collected at any Stop;
//   - the Mt. Moon fossil (Pewter) from week 3 — never on Brock's first turn in his own town;
//   - the Living Kanto boards post 3 cards each, not 4 (LK_RULES 'v2', livingKantoBoard.js): fewer offers piled in one city.
// Measured before this one (NIGHTSHIFT_015 report): all four in the lab + one per Stop (Pallet became the new pile), two in
// the lab + one per Stop (the AI's early claims halved: a town gave one, often hard, contract).
// The seed only picks the start of the deals (a pure hash: no die, no battle roll ever changes).
export const usesQuestDist = (config) => config.rules.questDist === 'v2';
// NIGHTSHIFT_015 E2 (rules.oakDeal 'v2', a DEV pilot): the Oak deal of v2 alone — no fossil week, no 3-card boards.
export const usesOakDeal = (config) => config.rules.oakDeal === 'v2' || usesQuestDist(config);
export const QD2_FROM_WEEK = Object.freeze({ 'mt-moon-fossil': 3 });
const isOakContract = (q) => q.giver === 'oak' && q.takeAt === 'pokeStop';
// Oak's contracts given HERE in a questDist 'v2' game: his lab → a seeded pair; land Poké Stop i → the pair at deal
// positions i, i + 1 (a seeded start) — neighbouring towns never give the same two; any other place → none.
export function qd2OakAt(state, place) {
  const ids = bookQuests(state.config).filter(isOakContract).map((q) => q.id);
  if (!ids.length) return [];
  const pair = (h) => [...new Set([ids[h % ids.length], ids[(h + 1) % ids.length]])];
  if (place === state.config.oak?.location) return pair(hashIndex(`${state.seed}:qd2lab`, ids.length));
  const stops = pokeStopPlaces(state.config).filter((id) => id !== 'indigo-plateau');
  const i = stops.indexOf(place);
  return i < 0 ? [] : pair(i + hashIndex(`${state.seed}:qd2`, ids.length));
}
// KANTO WORLD DISTRIBUTION (rules.worldDist 'w1', a DEV pilot; PT014-02 / 07): Oak's four contracts are not in every city
// any more — his lab gives a seeded pair (Ash and Gary start with two things to take) and each contract has two research
// posts of his aides on the routes, one in the west and one in the east of Kanto (data/questBook.js OAK_POSTS; a seeded
// deal, every post at most one contract): each big city loses four offers, the routes gain them. Collected at any Poké
// Stop, as before. A pure hash of the seed — no die, no battle roll changes.
export const usesWorldDist = (config) => config.rules.worldDist === 'w1';
export const usesClaimAll = (config) => config.rules.claimAll === 'v1'; // re-review 25.10 §5: split from worldDist
export function worldOakAt(state, place) {
  const ids = bookQuests(state.config).filter(isOakContract).map((q) => q.id);
  if (!ids.length) return [];
  if (place === state.config.oak?.location) {
    // the lab's pair: his SHORT contract (look at 3 new species — done in the first weeks) and one of the others, seeded: 3
    // pairs, so a start in Pallet is never only long work (the first measurement: Ash / Gary took his long contracts first
    // and collected less by week 10; re-review 25.10 P1: the habitats were no short one — 8.6 weeks on average)
    const quick = [OAK_QUICK, OAK_QUICK_FALLBACK].map((list) => list.filter((id) => ids.includes(id))).find((list) => list.length) ?? [];
    if (!quick.length) { const h = hashIndex(`${state.seed}:w1lab`, ids.length); return [...new Set([ids[h % ids.length], ids[(h + 1) % ids.length]])]; }
    const first = quick[hashIndex(`${state.seed}:w1lab`, quick.length)];
    if (state.config.rules.questStart === 'e1' && state.turn.round < QUEST_START_WEEK) return [first]; // PT016-02 'e1': one offer at the start
    const rest = ids.filter((id) => id !== first);
    return [first, rest[hashIndex(`${state.seed}:w1lab2`, rest.length)]];
  }
  const { west, east } = OAK_POSTS.w1;
  const hw = hashIndex(`${state.seed}:w1west`, west.length);
  const he = hashIndex(`${state.seed}:w1east`, east.length);
  return ids.filter((id, i) => west[(hw + i) % west.length] === place || east[(he + i) % east.length] === place);
}
// PLAYTEST_016 PT016-02 (rules.questStart, two exclusive DEV pilots): the start's LOCAL offers were not the same for every
// character (Pallet: Oak's two contracts and the Route 22 patrol; Cerulean / Pewter: one pack quest each). Two answers:
//   'w4'  no local quest before week 4 for anyone — Oak's contracts, the authored and pack quests, the regional missions
//         (and the Living Kanto boards: livingKantoEngine): the two personal missions, the gyms, the rumours and the
//         stories are the start, the same for all
//   'e1'  one local offer at every start place in weeks 1–3: Oak's lab gives only its short contract (worldOakAt), the
//         regional missions wait for week 4
//   'eq'  (ChatGPT review 27.10: w4 left weeks 1–5 almost without a reward, e1 left Brock with the long fossil) the SAME
//         first local offer for everyone: Oak's short contract on each player's own start place in weeks 1–2 (the lab
//         for Ash and Gary, Cerulean for Misty, Pewter for Brock; his route posts give it too) — every other local quest
//         and the boards from week 3
export const QUEST_START_WEEK = 4;
export const EQUAL_START_WEEK = 3;
export const questStartWeek = (config) => (config.rules.questStart === 'eq' ? EQUAL_START_WEEK : QUEST_START_WEEK);
const LOCAL_OFFERS = new Set([...QUEST_BOOK.v1, ...QUEST_PACK.day14, ...WORLD_QUESTS.w1].map((q) => q.id));
export function questStartBlock(state, q) {
  const v = state.config.rules.questStart;
  if (!v || state.turn.round >= questStartWeek(state.config) || isSpecialQuest(q)) return null;
  if (v === 'eq' && q.id === oakQuick(state.config)) return null;
  if ((v === 'w4' || v === 'eq') && LOCAL_OFFERS.has(q.id)) return { code: 'fromWeek', week: questStartWeek(state.config) };
  if (v === 'e1' && q.openFrom) return { code: 'fromWeek', week: QUEST_START_WEEK };
  return null;
}
// KANTO WORLD: his short contract — look at 3 new species (day-14 pack; done in the first weeks); without the pack, the
// habitats (re-review 25.10 P1: the habitats took 8.6 weeks on average, the observation pays early)
const OAK_QUICK = Object.freeze(['oak-field-research']);
const OAK_QUICK_FALLBACK = Object.freeze(['oak-habitats']);
const oakQuick = (config) => {
  const ids = new Set(bookQuests(config).map((q) => q.id));
  return [...OAK_QUICK, ...OAK_QUICK_FALLBACK].find((id) => ids.has(id)) ?? null;
};
// questStart 'eq': Oak's short contract is given on the player's OWN start place too in weeks 1–2
const equalStarter = (state, player, q) => state.config.rules.questStart === 'eq' && state.turn.round < EQUAL_START_WEEK && q.id === oakQuick(state.config) && player.location === startLocationOf(player.id, state.config);
// Oak's contracts given HERE when they are not given at every Poké Stop (worldDist, or questDist / oakDeal)
const oakGiversAt = (state, place) => (usesWorldDist(state.config) ? worldOakAt(state, place) : qd2OakAt(state, place));
const dealtOak = (config) => usesWorldDist(config) || usesOakDeal(config);
function takeHere(state, player, q) {
  if (equalStarter(state, player, q)) return true; // PT016-02 'eq'
  if (dealtOak(state.config) && isOakContract(q)) return oakGiversAt(state, player.location).includes(q.id);
  return atPlace(state, player, q.takeAt);
}
// Where this player can take an Oak contract in a questDist 'v2' game (the take block's „goTo”): the nearest place that
// REALLY gives it in this game (his lab or a land Poké Stop, by the player's own travel), the first in order on a tie;
// null when no such place can be reached by this player now (the neutral „elsewhere”). ChatGPT review 21.10
// 00:35 (P2): it used to say Pallet for every contract, but the lab gives only two of the four.
export function qd2OakPlace(state, player, q) {
  const posts = usesWorldDist(state.config) ? [...OAK_POSTS.w1.west, ...OAK_POSTS.w1.east] : pokeStopPlaces(state.config).filter((id) => id !== 'indigo-plateau'); // KANTO WORLD: the aides' posts
  const places = [state.config.oak?.location, ...posts].filter((id) => id && oakGiversAt(state, id).includes(q.id));
  const d = travelDistances(player, player.location, state.config);
  const reach = places.filter((id) => d[id] !== undefined); // review 22.10: never a giver this player cannot travel to
  if (!reach.length) return null;
  return reach.reduce((best, id) => (d[id] < d[best] ? id : best), reach[0]);
}

// May this player take quest `q` here and now?
export function canTake(state, player, q) {
  return takeBlock(state, player, q) === null;
}

// PLAYTEST_007 stage 1: WHY quest `q` cannot be taken here and now — null when it can. The one check behind
// canTake (the legal actions) and the table's reason („Masz już misję z plotki…”), in the same order:
//   off · active (already in the book) · slotFull {rumour, max, occ} · needBadges {badges} · rumourClosed ·
//   goTo {place} · never (done or given up for good) · maxPerGame · cooldown {week}
export function takeBlock(state, player, q) {
  if (!usesQuestBook(state.config) || q.giver === 'gym') return { code: 'off' };
  const b = book(player);
  // PLAYTEST_006 C5: a rumour's quest has a slot of its own (RUMOURS.maxActive) — not one of the ordinary ones
  const rumourSlot = (a) => isSpecialQuest(questOf(a)) === isSpecialQuest(q);
  if (b.active.some((a) => a.questId === q.id)) return { code: 'active' };
  const max = isSpecialQuest(q) ? rumourSlotMax(state.config) : maxActive(state.config);
  const inSlot = b.active.filter(rumourSlot);
  if (inSlot.length >= max) return { code: 'slotFull', rumour: isSpecialQuest(q), max, occ: inSlot.map((a) => a.occ) };
  if ((q.unlock?.badges ?? 0) > player.badges.length && !(q.unlock.orWeek && state.turn.round >= q.unlock.orWeek)) return { code: 'needBadges', badges: q.unlock.badges, ...(q.unlock.orWeek ? { orWeek: q.unlock.orWeek } : {}) }; // NIGHTSHIFT E: or from a week
  if (q.rumour && usesRumours(state.config) && !rumourOpenFor(state, player, q.rumour)) return { code: 'rumourClosed' }; // heard (kept) or open in the world (the expedition without rumours: always)
  if (q.world && worldFlag(state, q.world)) return { code: 'worldDone' }; // NIGHTSHIFT D: someone already did it for the whole world
  if (usesQuestDist(state.config) && (QD2_FROM_WEEK[q.id] ?? 0) > state.turn.round) return { code: 'fromWeek', week: QD2_FROM_WEEK[q.id] }; // NS15 B
  if (q.openFrom && usesWorldQuests(state.config) && worldFromWeek(state, q) > state.turn.round) return { code: 'fromWeek', week: worldFromWeek(state, q) }; // KANTO WORLD: the seed's week
  const start = questStartBlock(state, q); // PLAYTEST_016 PT016-02
  if (start) return start;
  if (!takeHere(state, player, q)) {
    if (!dealtOak(state.config) || !isOakContract(q)) return { code: 'goTo', place: q.takeAt };
    const place = qd2OakPlace(state, player, q); // NS15 B: a place that really gives it (review P2)
    return place ? { code: 'goTo', place } : { code: 'elsewhere' };
  }
  const far = usesObtain151(state.config) ? unreachablePlace(state, player, q) : null; // NS15 H (obtain151 prototype)
  if (far) return far;
  // NIGHTSHIFT C: one quest of an `exclusive` group per player (the Dojo: Hitmonlee OR Hitmonchan) — in the book or collected
  if (q.exclusive) {
    const other = bookQuests(state.config).find((x) => x.exclusive === q.exclusive && x.id !== q.id && (b.active.some((a) => a.questId === x.id) || collected(player, x.id)));
    if (other) return { code: 'exclusive', other: other.id, group: q.exclusive };
  }
  // DEC-01: a legend line is never offered once its legend has a trainer (one per world)
  const leg = legendStep(q);
  if (leg && legendState(state, leg.species)?.status === 'caught') return { code: 'legendTaken', species: leg.species, by: legendState(state, leg.species).caughtBy };
  // NIGHTSHIFT_014 B (rules.obtain151 'world'): a `worldUnique` quest (a Mt. Moon fossil) ONCE in the world — not while
  // another player has it in the book or has collected it (given up: free again). 'player': each player their own.
  if (q.worldUnique && state.config.rules.obtain151 === 'world') {
    const holder = state.players.find((x) => x !== player && (book(x).active.some((a) => a.questId === q.id) || collected(x, q.id)));
    if (holder) return { code: 'worldTaken', by: holder.id };
  }
  const rec = records(player).byQuest[q.id];
  if (!rec) return null;
  if (q.repeat === 'never') return state.config.rules.questAbandon === 'v2' && !collected(player, q.id) ? null : { code: 'never' }; // EREV-02: given up ≠ gone
  if (rec.completed >= (q.repeat.maxPerGame ?? Infinity)) return { code: 'maxPerGame' };
  return rec.lastCompletedRound == null || state.turn.round >= rec.lastCompletedRound + q.repeat.cooldownWeeks ? null : { code: 'cooldown', week: rec.lastCompletedRound + q.repeat.cooldownWeeks };
}

// NIGHTSHIFT_015 H (rules.obtain151, a prototype): a line of the prototype is not offered while one of its places is out of
// this player's reach now (Seafoam by sea before the Soul Badge) — { code: 'cantReach', place, needs } says what is
// missing; a quest never waits in the book for a road the player cannot take yet. Only the prototype's lines.
function unreachablePlace(state, player, q) {
  if (!OBTAIN151_QUESTS.v1.includes(q)) return null;
  const places = [...new Set([...q.stages.flatMap((st) => st.objectives).map((o) => o.place).filter(Boolean), q.claimAt])];
  const reach = travelDistances(player, player.location, state.config);
  const place = places.find((x) => reach[x] === undefined);
  if (!place) return null;
  const swim = travelDistances({ ...player, capabilities: { ...player.capabilities, canTravelWater: true } }, player.location, state.config);
  return { code: 'cantReach', place, needs: swim[place] !== undefined ? 'canTravelWater' : null };
}

export function takeQuest(state, questId) {
  const player = currentPlayer(state);
  const q = bookQuest(questId);
  const rec = (records(player).byQuest[q.id] ??= { started: 0, completed: 0, lastCompletedRound: null });
  rec.started += 1;
  const occ = `${q.id}#${rec.started}`;
  records(player).occ[occ] = { startedRound: state.turn.round, credited: {}, paid: [] };
  book(player).active.push({ occ, questId: q.id, stage: 0, progress: {}, places: {}, waited: 0, signatureBase: [...(player.signature?.seen ?? [])], startedRound: state.turn.round, ...(q.stages.some((s) => s.objectives.some((o) => o.kind === 'observe')) ? { seenBase: [...player.pokedex.seen] } : {}) });
  log(state, 'quest', `📖 ${player.name} takes a quest: ${q.id} (${occ}).`, { book: { event: 'take', occ, quest: q.id } });
  checkStage(state, player, book(player).active.at(-1)); // a stage already met (e.g. a visit here)
}

// Living Kanto 2.0: a board card taken (livingKantoEngine.takeOffer) — an ordinary occurrence with its definition on it
// (`def`), the board's own occurrence id (`<card>#1`). Then exactly the quest book's flow: progress, done, claim, give up.
export function takeDefinedQuest(state, player, def, occ) {
  const rec = (records(player).byQuest[def.id] ??= { started: 0, completed: 0, lastCompletedRound: null, family: def.family }); // `family`: the trophies count kinds
  rec.started += 1;
  records(player).occ[occ] = { startedRound: state.turn.round, credited: {}, paid: [] };
  book(player).active.push({ occ, questId: def.id, def, stage: 0, progress: {}, places: {}, waited: 0, signatureBase: [...(player.signature?.seen ?? [])], startedRound: state.turn.round, ...(def.stages.some((s) => s.objectives.some((o) => o.kind === 'observe')) ? { seenBase: [...player.pokedex.seen] } : {}) });
  log(state, 'quest', `📋 ${player.name} takes a board offer: ${def.id} (${occ}).`, { book: { event: 'take', occ, quest: def.id, board: true } });
  checkStage(state, player, book(player).active.at(-1));
}

// EREV-02: was any attempt at this quest collected (paid)? Then a „never” quest is over.
const collected = (player, questId) => Object.entries(records(player).occ).some(([occ, r]) => occ.startsWith(`${questId}#`) && r.claimedRound != null);

export function abandonQuest(state, occ) {
  const player = currentPlayer(state);
  const b = book(player);
  if (b.active.find((a) => a.occ === occ)?.def && state.livingKanto) abandonContract(state.livingKanto, player.id, occ); // LK: a standard card is gone for good
  b.active = b.active.filter((a) => a.occ !== occ);
  const rec = records(player).occ[occ];
  rec.abandonedRound = state.turn.round;
  if (state.config.rules.questAbandon === 'v2') {
    // the attempt's key items go back (a retake earns them again — never two Old Ambers)
    for (const key of rec.keys ?? []) {
      const i = b.keyItems.indexOf(key);
      if (i >= 0) b.keyItems.splice(i, 1);
    }
  }
  log(state, 'quest', `📖 ${player.name} gives up the quest ${occ} — no reward.`, { book: { event: 'abandon', occ } });
}

const stageOf = (a) => questOf(a).stages[a.stage] ?? null;
export const isDone = (a) => a.stage >= questOf(a).stages.length;

export function canClaim(state, player, a) {
  return isDone(a) && atPlace(state, player, questOf(a).claimAt);
}

export function claimQuest(state, occ) {
  const player = currentPlayer(state);
  const b = book(player);
  const a = b.active.find((x) => x.occ === occ);
  const q = questOf(a);
  const rec = records(player).occ[occ];
  if (a.def && state.livingKanto) claimContract(state.livingKanto, player.id, occ); // LK: the board's records (paid once — the lines below)
  const lines = rewardLines(state, player, q); // EREV-01: as shown on the card, at this moment
  lines.forEach((r, i) => {
    if (rec.paid.includes(i)) return; // idempotent: never twice
    payReward(state, player, r);
    rec.paid.push(i);
  });
  rec.claimedRound = state.turn.round;
  b.active = b.active.filter((x) => x.occ !== occ);
  log(state, 'quest', `🏆 ${player.name} completes the quest ${occ}!`, { book: { event: 'claim', occ, quest: q.id, reward: lines } });
}

function payReward(state, player, r) {
  if (r.type === 'money') player.money += r.amount;
  else if (r.type === 'pokemon') {
    const mon = createPokemonInstance(state, r.species);
    markSeen(player, r.species);
    const where = addCaughtPokemon(state, player, mon);
    log(state, 'quest', `${getSpecies(r.species).name} joins ${player.name}${where === 'reserve' ? ' (in the reserve: the team is full)' : ''}!`);
  } else if (r.type === 'worldFlag') setWorldFlag(state, r.flag); // NIGHTSHIFT D: the Poké Flute wakes Snorlax — for everyone
  else if (r.type === 'storyEnd') log(state, 'quest', `✨ ${player.name} reaches the end of the ${getSpecies(r.legend).name} story — the legend itself is not in the game yet (Piotr: DEC-01 / DEC-13).`, { book: { event: 'storyEnd', legend: r.legend } }); // NIGHTSHIFT E: words only
  else if (r.type === 'clue') onClue(state, player);
  else if (r.type === 'keyItem') {
    // bonus 14.10: a lasting key item (the Old Rod) — held once
    if (!player.questBook.keyItems.includes(r.id)) player.questBook.keyItems.push(r.id);
    log(state, 'quest', `🎣 ${player.name} gets the ${keyItemName(r.id)}!`, { book: { event: 'keyItem', id: r.id } });
  } else addItem(player, r.type === 'pokeballs' ? 'pokeball' : r.type, r.amount);
}

// E4 hooks a clue here (huntEngine); until then a clue reward is recorded only.
let clueHook = (state, player) => log(state, 'quest', `${player.name} gets a clue (no hunt is running).`, { book: { event: 'clue' } });
let clueUsefulHook = () => false;
export function setClueHook(fn, useful = clueUsefulHook) {
  clueHook = fn;
  clueUsefulHook = useful;
}
const onClue = (state, player) => clueHook(state, player);

// EREV-01 (rules.bookRewards 'v2'): the reward lines this player gets for quest `q` now —
// a line the game cannot use (a clue with no hunt to come for this player) is its
// stated alternative. The card shows these lines and the claim pays them (by index:
// still idempotent). 'v1' (older games): the lines as written.
export function rewardLines(state, player, q) {
  const lines = state.config.rules.bookRewards !== 'v2' ? q.reward : q.reward.map((r) => (r.type === 'clue' && r.otherwise && !clueUsefulHook(state, player) ? r.otherwise : r));
  // EREV measurement (rules.stoneSources 'quests' | 'mixed'): five quests also pay a stone —
  // with 'mixed' only the first time this player collects that quest
  const stone = ['quests', 'mixed'].includes(state.config.rules.stoneSources) && STONE_SOURCES.questStones[q.id];
  // bonus 14.10 (rules.fishing): the sailor's quest also gives the Old Rod
  const rod = state.config.rules.fishing === 'v1' && q.id === FISHING.v1.rodFrom ? [{ type: 'keyItem', id: FISHING.v1.rod }] : [];
  if (!stone || (state.config.rules.stoneSources === 'mixed' && collected(player, q.id))) return [...lines, ...rod];
  return [...lines, { type: stone, amount: 1 }, ...rod];
}

// ---- progress ----------------------------------------------------------------------

// Every quest event (questEngine.recordQuestEvent calls this first, for every
// game with the quest book): arrive, explore, catch, trainerWin, rocketWin,
// turnStart, questChallengeWin.
export function bookEvent(state, player, event) {
  if (!usesQuestBook(state.config) || !player.questBook) return;
  if (event.kind === 'arrive') learnTrialsAt(state, player, event.location); // E5
  for (const a of running(player)) {
    if (isDone(a)) continue;
    const stage = stageOf(a);
    let changed = false;
    stage.objectives.forEach((o, i) => {
      if (objectiveDone(player, a, o, i)) return;
      if (advance(state, player, a, o, i, event)) changed = true;
    });
    if (changed || event.kind === 'turnStart' || event.kind === 'explore' || stage.objectives.some((o) => o.kind === 'observe')) checkStage(state, player, a);
  }
}

function advance(state, player, a, o, i, event) {
  const credit = (seq) => {
    const rec = records(player).occ[a.occ];
    const list = (rec.credited[i] ??= []);
    if (seq == null || list.includes(seq)) return false; // one credit per battle per occurrence
    list.push(seq);
    a.progress[i] = (a.progress[i] ?? 0) + 1;
    return true;
  };
  switch (o.kind) {
    case 'visit':
      return event.kind === 'arrive' && event.location === o.place ? bump(a, i) : false;
    case 'explore':
      return event.kind === 'explore' && event.location === o.place ? bump(a, i) : false;
    case 'catch': {
      if (event.kind !== 'catch') return false;
      // Living Kanto 2.0: two optional filters (board cards only — an authored quest has neither): a species, places
      if (o.species && !o.species.includes(event.species)) return false;
      if (o.places && !o.places.includes(event.location)) return false;
      const types = getSpecies(event.species).types;
      return !o.types || o.types.some((t) => types.includes(t)) ? bump(a, i) : false;
    }
    case 'defeatTrainer':
      return event.kind === 'trainerWin' && !event.questChallenge ? credit(event.battleSeq) : false;
    case 'defeatRocket':
      return event.kind === 'rocketWin' ? credit(event.battleSeq) : false;
    case 'challenge':
      return event.kind === 'trainerWin' && event.questChallenge?.occ === a.occ && event.questChallenge.objective === i ? credit(event.battleSeq) : false;
    case 'bring':
      if (event.kind === 'arrive' && event.location === o.place && player.questBook.keyItems.includes(o.keyItem)) return bump(a, i);
      return false;
    case 'wait':
      return event.kind === 'turnStart' ? bump(a, i) : false;
    // NIGHTSHIFT E: a step done while the player holds that gym's badge (checked on every event of the book)
    case 'badge':
      if (!player.badges.includes(o.gym)) return false;
      a.progress[i] = 1;
      return true;
    // One Kanto day 14.10 (rules.questPack): the pack's new steps
    case 'evolve':
      return event.kind === 'evolve' ? bump(a, i) : false;
    case 'show': {
      if (player.location !== o.place || !['arrive', 'explore', 'turnStart', 'catch', 'evolve', 'pokeStopVisit'].includes(event.kind)) return false;
      const kinds = new Set(player.team.filter((m) => getSpecies(m.species).types.some((t) => o.types.includes(t))).map((m) => m.species));
      if (kinds.size < o.count) return false;
      a.progress[i] = o.count;
      log(state, 'quest', `📖 ${player.name} shows ${[...kinds].map((sp) => getSpecies(sp).name).join(', ')} at ${o.place}.`, { book: { event: 'show', occ: a.occ, species: [...kinds] } });
      return true;
    }
    case 'give': {
      if (player.location !== o.place || !['arrive', 'explore', 'turnStart', 'pokeStopVisit'].includes(event.kind) || itemCount(player, o.item) < o.count) return false;
      addItem(player, o.item, -o.count);
      a.progress[i] = o.count;
      log(state, 'quest', `📖 ${player.name} hands over ${o.count}× ${ITEMS[o.item].name} at ${o.place}.`, { book: { event: 'give', occ: a.occ, item: o.item, count: o.count } });
      return true;
    }
    case 'encounter': {
      // C4: caught = done; any other end = R2 „Nowy trop” (one Explore here, then the encounter again)
      const mine = event.questEncounter?.occ === a.occ && event.questEncounter.objective === i;
      if (o.legend) {
        // DEC-01: the legend — caught (the world's one instance; the other players' lines end), or it waits here: no new
        // trail, no cooldown, the next encounter is a fresh one for one action
        if (event.kind === 'catch' && mine) {
          // the world's record (written by captureEngine BEFORE the Pokémon joins — atomic) must be THIS catch: the
          // species caught, by this player, with this instance's UID — otherwise NOTHING closes: no other line ends, this
          // step is not done (review 12:07 / 13:40: never a line closed without the world's one record)
          const l = legendState(state, o.species);
          if (!(l?.status === 'caught' && l.caughtBy === player.id && typeof event.legendUid === 'string' && l.uid === event.legendUid)) {
            log(state, 'warn', `${getSpecies(o.species).name}: the catch was not recorded in the world — the line stays open.`, { legend: { event: 'notRecorded', species: o.species, uid: event.legendUid ?? null, status: legendState(state, o.species)?.status ?? null } });
            return false;
          }
          closeLegendLines(state, o.species, player);
          return bump(a, i);
        }
        // P3 (ChatGPT 18:43, before 3.9): the legend got a trainer meanwhile (a stale encounter) — this line ENDS now, exactly
        // as every other line did at the catch (legendGone), so the state and the table's „ta wyprawa się skończyła” agree
        if (event.kind === 'questEncounterLost' && mine && !legendFree(state, o.species)) {
          const l = legendState(state, o.species);
          closeLegendLines(state, o.species, state.players.find((p) => p.id === l?.caughtBy) ?? { id: l?.caughtBy ?? null, name: l?.caughtBy ?? '?' });
          return false;
        }
        if (event.kind === 'questEncounterLost' && mine && event.result !== 'notRecorded') log(state, 'quest', `📖 ${getSpecies(o.species).name} is not caught — it stays at ${o.place} and waits (a new encounter: one action).`, { book: { event: 'legendWaits', occ: a.occ, species: o.species, place: o.place, result: event.result ?? null } });
        return false;
      }
      if (event.kind === 'catch' && mine) return bump(a, i);
      if (event.kind === 'questEncounterLost' && mine) {
        (a.lost ??= {})[i] = true;
        log(state, 'quest', `📖 ${getSpecies(o.species).name} got away — ${player.name} needs a new trail: one Explore at ${o.place}.`, { book: { event: 'encounterLost', occ: a.occ, species: o.species, place: o.place } });
      } else if (event.kind === 'explore' && event.location === o.place && a.lost?.[i]) {
        delete a.lost[i];
        log(state, 'quest', `📖 A new trail! ${getSpecies(o.species).name} is near again — the expedition's encounter is open.`, { book: { event: 'newTrail', occ: a.occ, species: o.species } });
      }
      return false;
    }
    default:
      return false;
  }
}

function bump(a, i) {
  a.progress[i] = (a.progress[i] ?? 0) + 1;
  return true;
}

export function objectiveTarget(o) {
  return o.count ?? o.times ?? o.places ?? o.ownTurns ?? 1;
}

export function objectiveProgress(player, a, o, i) {
  if (o.kind === 'seeSignature') return (player.signature?.seen ?? []).filter((pl) => !a.signatureBase.includes(pl)).length;
  if (o.kind === 'observe') return player.pokedex.seen.filter((sp) => !(a.seenBase ?? []).includes(sp)).length; // day 14: new in the Pokédex
  return a.progress[i] ?? 0;
}

function objectiveDone(player, a, o, i) {
  return objectiveProgress(player, a, o, i) >= objectiveTarget(o);
}

// The current stage done → its key item, the next stage (which may already be met).
function checkStage(state, player, a) {
  for (let guard = 0; guard < 8 && !isDone(a); guard++) {
    const stage = stageOf(a);
    if (!stage.objectives.every((o, i) => objectiveDone(player, a, o, i))) return;
    for (const o of stage.objectives) if (o.kind === 'bring') player.questBook.keyItems = player.questBook.keyItems.filter((k) => k !== o.keyItem);
    if (stage.gives?.keyItem) {
      player.questBook.keyItems.push(stage.gives.keyItem);
      if (state.config.rules.questAbandon === 'v2') (records(player).occ[a.occ].keys ??= []).push(stage.gives.keyItem); // EREV-02: whose it is
    }
    a.stage += 1;
    a.progress = {};
    if (isDone(a) && a.gym) {
      // E5: a trial done — the gym's credential (monotone); no reward, nothing to collect
      const rec = records(player);
      rec.occ[a.occ].completedRound = state.turn.round;
      rec.byQuest[a.questId].completed = 1;
      rec.byQuest[a.questId].lastCompletedRound = state.turn.round;
      if (!player.trialsDone.includes(a.gym)) player.trialsDone.push(a.gym);
      log(state, 'quest', `🏟️ ${player.name} passes the ${a.gym} gym's trial — the leader will accept the challenge.`, { book: { event: 'trialDone', gym: a.gym, occ: a.occ } });
    } else if (isDone(a)) {
      const rec = records(player);
      rec.occ[a.occ].completedRound = state.turn.round;
      const q = (rec.byQuest[a.questId] ??= { started: 1, completed: 0, lastCompletedRound: null });
      q.completed += 1;
      q.lastCompletedRound = state.turn.round;
      if (a.def && state.livingKanto) completeContract(state.livingKanto, player.id, a.occ); // LK: the family's cooldown starts
      if (!questOf(a).reward.length) {
        // C4: an expedition whose reward IS the Pokémon caught — nothing to collect; the occurrence closes
        rec.occ[a.occ].claimedRound = state.turn.round;
        player.questBook.active = player.questBook.active.filter((x) => x.occ !== a.occ);
        log(state, 'quest', `🏆 ${player.name} completes the expedition ${a.occ}!`, { book: { event: 'claim', occ: a.occ, quest: a.questId, reward: [] } });
        return;
      }
      log(state, 'quest', `📖 ${player.name}'s quest ${a.occ} is done — collect the reward.`, { book: { event: 'done', occ: a.occ, quest: a.questId } });
    } else {
      log(state, 'quest', `📖 ${player.name}'s quest ${a.occ}: next step.`, { book: { event: 'stage', occ: a.occ, stage: a.stage, ...(stage.gives?.keyItem ? { keyItem: stage.gives.keyItem } : {}) } });
    }
  }
}

// ---- quest challenges ----------------------------------------------------------------

// The challenge objective of this occurrence open at the player's place, or null.
export function openChallenge(state, player, a) {
  if (isDone(a)) return null;
  const stage = stageOf(a);
  const i = stage.objectives.findIndex((o, j) => o.kind === 'challenge' && o.place === player.location && !objectiveDone(player, a, o, j));
  return i < 0 ? null : { objective: i, spec: stage.objectives[i] };
}

export function canQuestChallenge(state, player, a) {
  return Boolean(openChallenge(state, player, a)) && !stepBlock(state, player, a, 'challenge');
}

// PLAYTEST_016 PT016-01: the active Rocket plot that forbids catching at the player's place (the Safari poachers), or
// null — the same test as rocketEngine.catchBlocked (read from the data: no import of the Rocket engine here).
export function catchBlockPlot(state, player) {
  const active = state.rocket?.active;
  const card = active && active.location === player.location ? ROCKET_PLOTS_BY_ID[active.plotId] : null;
  return card?.effect.kind === 'noCatch' ? card.id : null;
}

// PLAYTEST_007 stage 1: why a quest's challenge / expedition encounter at its place cannot start now — null when it
// can. The one check behind canQuestChallenge / canQuestEncounter and the table's reason.
//   busy (another scene is open) · noActions · noHealthy · onceThisTurn
//   rocketCatch (PT016-01, rules.catchGuard 'v1': an expedition's encounter where Team Rocket forbids catching)
export function stepBlock(state, player, a, kind) {
  if (state.phase !== 'turn') return { code: 'busy' };
  if (state.turn.actionsRemaining <= 0) return { code: 'noActions' };
  if (!hasHealthyPokemon(player)) return { code: 'noHealthy' };
  const plot = kind === 'encounter' && state.config.rules.catchGuard === 'v1' ? catchBlockPlot(state, player) : null;
  if (plot) return { code: 'rocketCatch', plot };
  const legend = kind === 'encounter' && openEncounter(state, player, a)?.spec.legend; // DEC-01: no cooldown — the next try costs one action
  if (!legend && (kind === 'challenge' ? state.turn.questChallenged : state.turn.questEncountered)?.includes(a.occ)) return { code: 'onceThisTurn' };
  return null;
}

// DEC-01: a legend has its trainer — every OTHER player's line for it ends (no Pokémon; the occurrence is closed, never
// repeated). Logged per player (the table's notice tells a human).
export function closeLegendLines(state, species, by) {
  for (const p of state.players) {
    if (p === by || !p.questBook) continue;
    for (const a of [...p.questBook.active]) {
      if (legendStep(questOf(a))?.species !== species) continue;
      const rec = records(p).occ[a.occ];
      if (rec) Object.assign(rec, { claimedRound: state.turn.round, closed: 'legendTaken' });
      p.questBook.active = p.questBook.active.filter((x) => x.occ !== a.occ);
      log(state, 'quest', `📖 ${getSpecies(species).name} already has a trainer (${by.name}) — ${p.name}'s line ${a.occ} ends without it.`, { book: { event: 'legendGone', occ: a.occ, quest: a.questId, legend: species, owner: p.id, by: by.id } });
    }
  }
}

export function startQuestChallenge(state, occ) {
  const player = currentPlayer(state);
  const a = findOcc(player, occ);
  const { objective, spec } = openChallenge(state, player, a);
  state.turn.actionsRemaining -= 1;
  (state.turn.questChallenged ??= []).push(occ);
  const tier = Math.min(3, player.badges.length + 1);
  const pokemonTeam = spec.teams[tier - 1].map((id) => createPokemonInstance(state, id));
  for (const p of pokemonTeam) markSeen(player, p.species);
  state.encounter = {
    kind: 'trainer', biome: null, index: 0, playerFainted: false,
    questChallenge: { occ, questId: a.questId, stage: a.stage, objective },
    trainer: { name: spec.name, archetype: spec.archetype, difficulty: 'quest', pokemonTeam, reward: 0 },
  };
  state.phase = 'encounter';
  log(state, 'quest', `⚔ ${player.name} takes on the quest challenge: ${spec.name} (${pokemonTeam.map((p) => getSpecies(p.species).name).join(', ')}).`, { book: { event: 'challenge', occ } });
  markLeadPick(state); // who starts the battle (DQ-107)
}

// ---- PLAYTEST_006 C4: the expedition's encounter ------------------------------------------

// The encounter objective of this occurrence open at the player's place (not waiting for a new trail), or null.
export function openEncounter(state, player, a) {
  if (isDone(a)) return null;
  const stage = stageOf(a);
  // an expedition's step needs the expeditions; DEC-01: a legend's step needs its legend still free (one per world)
  const open = (o) => (o.legend ? usesLegendCatch(state.config) && legendFree(state, o.species) : usesExpeditions(state.config));
  const i = stage.objectives.findIndex((o, j) => o.kind === 'encounter' && o.place === player.location && open(o) && !objectiveDone(player, a, o, j) && !a.lost?.[j]);
  return i < 0 ? null : { objective: i, spec: stage.objectives[i] };
}

export function canQuestEncounter(state, player, a) {
  return Boolean(openEncounter(state, player, a)) && !stepBlock(state, player, a, 'encounter');
}

// 1 action: a wild battle with the expedition's species (normal stats — not a hunt's exceptional one).
// Returns what appears; turnEngine makes the wild Pokémon (encounterEngine.appearWild) and tags the battle
// with `tag` — this module never imports the encounter engine (no import cycle with the hunts' clue hook).
export function startQuestEncounter(state, occ) {
  const player = currentPlayer(state);
  const a = findOcc(player, occ);
  const { objective, spec } = openEncounter(state, player, a);
  state.turn.actionsRemaining -= 1;
  (state.turn.questEncountered ??= []).push(occ);
  const species = getSpecies(spec.species);
  const biomes = locationBiomes(player.location, state.config);
  log(state, 'quest', `📖 ${player.name} follows the expedition's trail: ${species.name}!`, { book: { event: 'encounter', occ, species: spec.species } });
  return { species, biome: species.biomes.find((b) => biomes.includes(b)) ?? biomes[0], tag: { occ, questId: a.questId, stage: a.stage, objective }, ...(spec.legend ? { legend: spec.species } : {}) };
}

// ---- PLAYTEST_007 stage 1: „what now?” for one quest of the book --------------------------------
// The ONE answer the table shows (the quest book, the action bar, the Trainer Journal): the action open here and
// now, or exactly why not and where to go. Read-only; built from the same checks as the legal actions.
//   { kind: 'claim' | 'challenge' | 'encounter' | 'steps', place, action?, block?, warn?, todo, stage, stages }
//   todo   the open objectives of the current stage: [{ i, kind, place, progress, target }]
//   block  goTo {place} · newTrail {place} · stepsFirst {todo} (an action of a LATER step is here, its stage not
//          yet) · and stepBlock's busy / noActions / noHealthy / onceThisTurn
//   warn   noBalls — the expedition's Pokémon can only be caught with a ball · rocketCatch (PT016-01) — Team Rocket
//          forbids catching here (a game without catchGuard still starts the encounter: said before it)
export function nextStep(state, player, a) {
  const q = questOf(a);
  const base = { stage: Math.min(a.stage, q.stages.length - 1), stages: q.stages.length };
  if (isDone(a)) {
    const at = q.claimAt;
    const here = atPlace(state, player, at);
    return { ...base, kind: 'claim', place: at, todo: [], ...(here && state.phase === 'turn' ? { action: { type: 'claimQuest', occ: a.occ } } : { block: here ? { code: 'busy' } : { code: 'goTo', place: at } }) };
  }
  const stage = stageOf(a);
  const todo = stage.objectives.map((o, i) => ({ i, kind: o.kind, place: o.place ?? null, progress: objectiveProgress(player, a, o, i), target: objectiveTarget(o), o })).filter((t) => t.progress < t.target);
  const step = todo.find((t) => t.kind === 'encounter' || t.kind === 'challenge');
  const out = (x) => ({ ...base, todo: todo.map(({ o, ...t }) => t), ...x });
  if (step) {
    const kind = step.kind;
    if (kind === 'encounter' && a.lost?.[step.i]) return out({ kind, place: step.place, block: { code: 'newTrail', place: step.place } });
    if (step.o.legend && !legendFree(state, step.o.species)) return out({ kind, place: step.place, legend: true, block: { code: 'legendTaken', species: step.o.species, by: legendState(state, step.o.species)?.caughtBy ?? null } });
    if (player.location !== step.place) return out({ kind, place: step.place, ...(step.o.legend ? { legend: true } : {}), block: { code: 'goTo', place: step.place } });
    if (kind === 'encounter' && !step.o.legend && !usesExpeditions(state.config)) return out({ kind, place: step.place, block: { code: 'busy' } });
    const block = stepBlock(state, player, a, kind);
    if (block) return out({ kind, place: step.place, block });
    const action = { type: kind === 'encounter' ? 'questEncounter' : 'questChallenge', occ: a.occ };
    const balls = (player.pokeballs ?? 0) + ['superball', 'ultraball'].reduce((n, b) => n + itemCount(player, b), 0);
    // DEC-01: a legend is caught with an Ultra Ball only — none in the bag: the table warns before the encounter
    if (step.o.legend) return out({ kind, place: step.place, legend: true, action, ...(itemCount(player, LEGEND_BALL) === 0 ? { warn: { code: 'noUltraBall', species: step.o.species } } : {}) });
    const plot = kind === 'encounter' ? catchBlockPlot(state, player) : null;
    if (plot) return out({ kind, place: step.place, action, warn: { code: 'rocketCatch', plot, species: step.o.species } });
    return out({ kind, place: step.place, action, ...(kind === 'encounter' && balls === 0 ? { warn: { code: 'noBalls', species: step.o.species } } : {}) });
  }
  // only steps to do: is an action of a LATER stage waiting HERE? then say what comes first
  const later = q.stages.slice(a.stage + 1).flatMap((st) => st.objectives).find((o) => (o.kind === 'encounter' || o.kind === 'challenge') && o.place === player.location);
  const first = todo.find((t) => t.place && t.place !== player.location) ?? todo[0];
  return out({ kind: 'steps', place: first?.place ?? null, ...(later ? { block: { code: 'stepsFirst', later: { kind: later.kind, place: later.place, species: later.species ?? null, name: later.name ?? null } } } : {}) });
}

// ---- for the table and the AI ------------------------------------------------------

export function bookActions(state, player) {
  if (!usesQuestBook(state.config)) return [];
  const out = questsHere(state, player).map((q) => ({ type: 'takeQuest', quest: q.id }));
  for (const a of player.questBook.active) {
    if (canClaim(state, player, a)) out.push({ type: 'claimQuest', occ: a.occ });
    else if (canQuestChallenge(state, player, a)) out.push({ type: 'questChallenge', occ: a.occ });
    else if (canQuestEncounter(state, player, a)) out.push({ type: 'questEncounter', occ: a.occ }); // C4
    if (!isDone(a) && hasPokeStop(player.location, state.config)) out.push({ type: 'abandonQuest', occ: a.occ });
  }
  for (const t of player.questBook.trials ?? []) if (canQuestChallenge(state, player, t)) out.push({ type: 'questChallenge', occ: t.occ }); // E5: a trial's challenge
  // KANTO WORLD DISTRIBUTION (rules.claimAll 'v1', PT014-07): two or more rewards ready HERE — collect them all at once
  // (one action of the table, one result card); only what is done and collected here: nothing is paid in advance
  if (usesClaimAll(state.config) && out.filter((x) => x.type === 'claimQuest').length >= 2) out.push({ type: 'claimAll' });
  return out;
}

// KANTO WORLD DISTRIBUTION: every reward this player can collect here and now, in the book's order — exactly the single
// claims one after the other (each idempotent, each logged), nothing else.
export function claimAll(state) {
  const player = currentPlayer(state);
  const ready = player.questBook.active.filter((a) => canClaim(state, player, a)).map((a) => a.occ);
  for (const occ of ready) claimQuest(state, occ);
  return ready;
}

export function questsHere(state, player) {
  return bookQuests(state.config).filter((q) => canTake(state, player, q));
}

export function keyItemName(id) {
  return QUEST_BOOK_KEY_ITEMS[id]?.name ?? id;
}

export const isItemReward = (r) => Boolean(ITEMS[r.type]) || r.type === 'pokeballs';
