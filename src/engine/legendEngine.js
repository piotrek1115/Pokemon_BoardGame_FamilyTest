// DEC-01 — LEGENDARY PERSISTENCE (Piotr's decision, ChatGPT 20.10 10:49): rules.legendStory 'v2' — a versioned DEV pilot,
// OFF in every set (?dev=legends2); 'v1' (the story lines with an inactive end) stays exactly as it was. Zapdos first:
//   one per world   each legendary species exists as AT MOST ONE caught instance in the whole game
//   never gone      a legend waits at its story place until it is caught — a KO (its own or the team's), a run, a failed
//                   throw, no / no more Ultra Balls, the end of a turn or a reload never remove it; the next encounter is a
//                   fresh one (full HP, a new wild instance), costs one action, no new trail and no cooldown
//   Ultra Ball      the only ball in such an encounter (turnEngine); ordinary Pokémon unchanged
//   caught          only a successful Ultra Ball throw: the world records the species, its status, its owner and the UID of
//                   the caught instance; no new encounter afterwards; a trade moves that instance (the owner follows it)
// The world state lives in `state.legends` (only in such a game — older saves have none and never read it). Pure: no
// browser globals, no unseeded randomness (the encounter itself is the ordinary wild battle).
import { KANTO151_EXTRA, getSpecies } from '../data/pokemon.js';
import { log } from './log.js';

export const usesLegendCatch = (config) => ['v2', 'v3'].includes(config?.rules?.legendStory);
// DEC-01 balance (Piotr 20.10, ChatGPT 13:40 — rules.legendStory 'v3' = 'v2' + this; a DEV pilot, ?dev=legends3): EVERY
// legendary species (data/pokemon.js `legendary: true` — Articuno, Zapdos, Moltres, Mewtwo, Mew) is exactly ONE Catch Die
// step harder, only in a catch attempt (captureEngine.catchDie adds it once, beside the other „harder” steps). An Ultra
// Ball then rolls: red HP 2/6, yellow 3/6, green 4/6. No species exception; ordinary Pokémon unchanged.
export const LEGEND_CATCH_STEP = 1;
export const legendCatchStep = (config, species) => (config?.rules?.legendStory === 'v3' && species?.legendary ? LEGEND_CATCH_STEP : 0);
export const LEGEND_BALL = 'ultraball';
export const LEGENDS = Object.freeze(KANTO151_EXTRA.filter((s) => s.legendary).map((s) => s.id)); // the five

// Once, at createGame: every legend waiting (only the Zapdos line can meet one in this pilot).
export function setupLegends(state) {
  if (!usesLegendCatch(state.config)) return;
  state.legends = { v: 1, ...Object.fromEntries(LEGENDS.map((id) => [id, { status: 'waiting' }])) };
}

export const legendState = (state, species) => state.legends?.[species] ?? null;
// May a legend still be met? (a game without the pilot: there is none to meet)
export const legendFree = (state, species) => Boolean(state.legends?.[species]) && state.legends[species].status !== 'caught';

// Could a catch of this legend be recorded now? (a free legend, a player, the instance's UID) — the ONE check, used before
// the throw is rolled (captureEngine: a catch that could never be recorded is never rolled, never counted) and by the record.
export function canRecordLegend(state, player, species, uid) {
  const l = state.legends?.[species];
  return Boolean(l) && l.status !== 'caught' && Boolean(player?.id) && typeof uid === 'string' && uid.length > 0;
}

// A successful Ultra Ball throw: the one instance of this legend in the world. Refused (false, nothing written) without
// a free legend, a player or the caught instance's UID (DEC-01 review 12:07 — the caller then closes nothing).
export function recordLegendCatch(state, player, species, uid) {
  if (!canRecordLegend(state, player, species, uid)) return false;
  state.legends[species] = { status: 'caught', owner: player.id, caughtBy: player.id, uid, round: state.turn.round };
  log(state, 'quest', `⚡ ${player.name} catches the legendary ${getSpecies(species).name} — the only one in Kanto.`, { legend: { event: 'caught', species, player: player.id, uid } });
  return true;
}

// A trade moves the caught instance: the world's owner follows it (never a second instance).
export function legendTraded(state, uid, toPlayerId) {
  for (const [species, l] of Object.entries(state.legends ?? {})) {
    if (species === 'v' || l?.uid !== uid) continue;
    l.owner = toPlayerId;
    log(state, 'action', `⚡ ${getSpecies(species).name} goes to a new trainer by a trade.`, { legend: { event: 'traded', species, uid, to: toPlayerId } });
  }
}
