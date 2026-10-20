// COMBAT MVP (rules.combatMoves 'mvp1' — the ruleset dev-1510-combat only; ChatGPT „COMBAT 2.0 — EMERGENCY PLAYABLE
// MVP”, Piotr 15.10.2026). The Combat 2.0 data (src/combat2: 110 moves, 132 learnsets, the S1 statuses) inside TODAY's
// battle (combatEngine) — no second combat engine:
//   basic     every Pokémon's attack has its learnset's name („Iskra”, „Drapnięcie” …); the roll is today's
//   special   once per battle, if THIS Pokémon knows one: the same roll + its trick (a status on a hit, drain, guard,
//             +1, or exactly 1 heart without a roll)
//   powerful  once per battle, if it knows one: the roll +2, but it misses on 1–2
// What an instance knows is decided ONCE, when it is created, from its uid (no unseeded randomness, no re-roll on a reload) and
// stored on it (`mon.moves`); a starter knows its family's first Special; a wild / trainer Pokémon MAY know one Special
// and, more rarely, one Powerful (an evolved or rarer one more often) — so two Pikachu can differ.
// Statuses live in the ARENA only (encounter.status[uid]): they go with a switch, a faint, a Potion or the battle's end;
// they never knock out (S1: the tick stops at 1 heart). Older rulesets: none of this (the switch is missing = off).
// COMBAT 2.1: poison lives on the Pokémon (`mon.status`); COMBAT 2.2: every status does (statuses.js `persists`).
import { getSpecies } from '../data/pokemon.js';
import { getMove, moveText } from '../combat2/moves.js';
import { learnsetFor } from '../combat2/learnsets.js';
import { STATUS_DEFINITIONS, STATUS_PROC, applyStatus, beforeAttack, cureStatus, endOfRound, statusBlocker, statusRules } from '../combat2/statuses.js';
import { d6, hashIndex } from './rng.js';
import { log } from './log.js';

export const usesCombatMoves = (config) => config?.rules?.combatMoves === 'mvp1';
// COMBAT 2.1 (rules.statusRules 'c21', Piotr 16.10 — the set dev-1610-c21): a status may knock out, poison stays on the
// Pokémon after the battle (`mon.status`, ticks at the start of its owner's turn), burn rolls, the cure items.
// 'c21b' (dev-1610-c21b, ChatGPT review 16.10 12:14): the same, with the end of an exchange corrected (exchangeRule).
// COMBAT 2.2 ('c22', ChatGPT 18.10 10:23 — the set dev-1610-c22): every status stays on the Pokémon; burn −1 to hit; the
// counted sleep (statuses.js C22) — C21B's exchange, cures and Poké Stop.
const C21_SETS = Object.freeze({ c21: 'C21', c21b: 'C21B', 'c21b-o': 'C21B_O', c22: 'C22' }); // 'c21b-o': the double-KO control variant (no set)
export const usesCombat21 = (config) => usesCombatMoves(config) && Boolean(C21_SETS[config?.rules?.statusRules]);
export const SLOT_PL = Object.freeze({ basic: 'Atak', special: 'Ruch specjalny', powerful: 'Potężny ruch' });
const RULES = statusRules('S1');
export const statusRulesOf = (config) => (usesCombat21(config) ? statusRules(C21_SETS[config.rules.statusRules]) : RULES);
// How the end of an exchange settles (C21B): { ticks: 'both', doubleKo, tickUnanswered } — null in C21 and older games.
export const exchangeRule = (config) => (usesCombat21(config) ? statusRulesOf(config).exchange ?? null : null);
// PT009-19 (rules.statusProc 'd6' — OFF in every set): the faces on which a status move's status lands, or null.
export const statusProcFaces = (config) => (usesCombatMoves(config) && config.rules.statusProc ? STATUS_PROC[config.rules.statusProc] : null);
// A status that lives ON the Pokémon (not only in the arena): Combat 2.1 poison.
const persistent = (config, id) => Boolean(statusRulesOf(config)[id]?.persists);
const RARITY_STEP = { common: 0, rare: 1, superRare: 2 };

// The basic attack's move (its name) for a species.
export const basicMoveOf = (speciesId) => getMove(learnsetFor(speciesId).basic);

// What a new Pokémon knows: { special, powerful } (move ids or null). `origin`: 'starter' | 'wild' (also a trainer's
// Pokémon) | 'none'. Decided by its uid — the same uid always knows the same.
export function rollKnownMoves(speciesId, origin, uid) {
  const l = learnsetFor(speciesId);
  const s = getSpecies(speciesId);
  const known = { special: null, powerful: null };
  if (origin === 'none') return known;
  if (origin === 'starter') {
    known.special = l.special[0] ?? null;
    return known;
  }
  const h = (key, n) => hashIndex(`${uid}|${speciesId}|${key}`, n);
  const step = (s.stage - 1) + (RARITY_STEP[s.rarity] ?? 0);
  if (l.special.length && h('has-special', 100) < 45 + 15 * step) known.special = l.special[h('special', l.special.length)];
  if (l.powerful.length && h('has-powerful', 100) < 10 + 15 * step) known.powerful = l.powerful[h('powerful', l.powerful.length)];
  return known;
}

// Give a Pokémon its moves (once). Nothing when the rule is off or it already has them.
export function giveMoves(state, mon, origin = 'wild') {
  if (usesCombatMoves(state.config) && mon && !mon.moves) mon.moves = rollKnownMoves(mon.species, origin, mon.uid);
  return mon;
}

// PLAYTEST_013 (rules.balance013 'v1' — a PROPOSAL, OFF in every set; ?dev=pt013. Piotr 19.10: „Scyther z eventu mógłby
// być ciut mocniejszy … Jigglypuff mógłby mieć ten atak usypiający”): what a Pokémon surely knows ON A CATCH — never in the
// wild battle itself (the battle stays as it was) and never a trainer's Pokémon. Only that slot is set; the other stays as
// rolled; a Pokémon caught before keeps what it knew (no save changes). No global change to any species.
//   questEncounter  the expedition's own Pokémon (encounter.questEncounter.questId): the Safari Scyther — Slash (Powerful)
//   species         every one of that species caught: Jigglypuff — Sing (Special); it keeps it when it evolves
export const BALANCE_013 = Object.freeze({
  questEncounter: Object.freeze({ 'safari-scyther': Object.freeze({ species: 'scyther', powerful: 'slash' }) }),
  species: Object.freeze({ jigglypuff: Object.freeze({ special: 'sing' }) }),
});
// The moves a Pokémon caught in `enc` surely knows ({ slot: moveId } — empty without the rule).
// 'v2' (ChatGPT review 20.10 09:27 — the variant for Piotr's decision, also OFF; ?dev=pt013b): the expedition's move only
// FILLS an empty slot — a Scyther that already knows a Powerful (Wing Attack) keeps it; one without gets Slash. Jigglypuff:
// Sing in both variants.
export function catchGuarantee(config, mon, enc) {
  const v = config?.rules?.balance013;
  if ((v !== 'v1' && v !== 'v2') || !usesCombatMoves(config) || !mon) return {};
  const q = BALANCE_013.questEncounter[enc?.questEncounter?.questId];
  const { species, ...fromQuest } = q && q.species === mon.species ? q : {};
  if (v === 'v2') for (const slot of Object.keys(fromQuest)) if (mon.moves?.[slot]) delete fromQuest[slot];
  return { ...(BALANCE_013.species[mon.species] ?? {}), ...fromQuest };
}
// Sets them on the caught Pokémon (captureEngine, right after the catch) — once: a slot already holding the move is left.
export function applyCatchGuarantee(state, mon, enc) {
  const sure = catchGuarantee(state.config, mon, enc);
  for (const [slot, id] of Object.entries(sure)) {
    mon.moves ??= { special: null, powerful: null };
    if (mon.moves[slot] === id) continue;
    const was = mon.moves[slot];
    mon.moves[slot] = id;
    log(state, 'capture', `${getSpecies(mon.species).name} knows ${getMove(id).pl} (PLAYTEST_013).`, { balance013: { uid: mon.uid, species: mon.species, slot, move: id, was } });
  }
  return mon;
}

export function knownMove(mon, slot) {
  const id = mon?.moves?.[slot];
  return id ? getMove(id) : null;
}
export const movesUsed = (enc, uid) => enc?.movesUsed?.[uid] ?? [];
// The move of `slot` this Pokémon may use now in this battle (known, not used yet), or null.
export function moveAvailable(state, mon, slot) {
  if (!usesCombatMoves(state.config) || !state.encounter || !mon || mon.hp <= 0 || slot === 'basic') return null;
  const m = knownMove(mon, slot);
  return m && !movesUsed(state.encounter, mon.uid).includes(slot) ? m : null;
}
export function markUsed(enc, uid, slot) {
  ((enc.movesUsed ??= {})[uid] ??= []).push(slot);
}
export const moveCardText = (m) => moveText(m);

// The modifiers of an attack with move `m` (performAttack's `mods`): powerful +2 / misses on 1–2; boost +1.
export function attackMods(m) {
  if (!m) return null;
  if (m.slot === 'powerful') return { bonus: 2, label: m.pl, missFaces: [1, 2] };
  if (m.effect.kind === 'boost') return { bonus: m.effect.bonus, label: m.pl };
  return null;
}

// ---- statuses: in the arena (and Combat 2.1 poison on the Pokémon) ----------------------------------------------------
// `mon` (optional): its Combat 2.1 poison, kept on the Pokémon itself (`mon.status` — never set in an older game).
export const statusOf = (enc, uid, mon = null) => enc?.status?.[uid] ?? mon?.status ?? null;
function side(state, mon) {
  return { mon, status: statusOf(state.encounter, mon.uid, mon) };
}
function keep(state, s) {
  const enc = state.encounter;
  const onMon = Boolean(s.status) && persistent(state.config, s.status.id);
  if (s.status && !onMon) (enc.status ??= {})[s.mon.uid] = s.status;
  else if (enc?.status) delete enc.status[s.mon.uid];
  if (onMon) s.mon.status = s.status;
  else if (s.mon.status) delete s.mon.status;
}
// A status die: the world's roll (seeded — the same game always rolls the same; never asked of a player).
const statusDie = (state, mon) => (purpose) => {
  let v;
  d6(state, `Status: ${getSpecies(mon.species).name}: ${purpose}`, (x) => { // the table says it in its note (flow.js)
    v = x;
    return String(x);
  }, 'system');
  return v;
};

// A move's status on a hit. Returns the status id when it landed, else null (immune, already one, fainted).
// PT009-19 (rules.statusProc 'd6', OFF in every set): a status that CAN land rolls its own visible d6 first — it lands
// only on STATUS_PROC's faces (3–6); a miss is logged („procFailed”, with the face) and the hit's damage stays.
export function tryStatus(state, target, statusId) {
  const s = side(state, target);
  const why = statusBlocker(target, getSpecies(target.species), s.status, statusId);
  if (why) {
    log(state, 'combat', `${getSpecies(target.species).name}: no ${statusId} (${why}).`, { status: { event: 'blocked', uid: target.uid, species: target.species, id: statusId, why } });
    return null;
  }
  const faces = statusProcFaces(state.config);
  let proc = null;
  if (faces) {
    d6(state, `Status proc: ${getSpecies(target.species).name}: ${statusId}`, (x) => { // the table shows it as its own die (flow.js)
      proc = x;
      return String(x);
    }, 'system');
    if (!faces.includes(proc)) {
      log(state, 'combat', `${getSpecies(target.species).name}: no ${statusId} (rolled ${proc}).`, { status: { event: 'procFailed', uid: target.uid, species: target.species, id: statusId, roll: proc, faces: [...faces] } });
      return null;
    }
  }
  applyStatus(s, statusId);
  keep(state, s);
  log(state, 'combat', `${STATUS_DEFINITIONS[statusId].icon} ${getSpecies(target.species).name} — ${STATUS_DEFINITIONS[statusId].name}!`, { status: { event: 'applied', uid: target.uid, species: target.species, id: statusId, ...(faces ? { roll: proc, faces: [...faces] } : {}) } });
  return statusId;
}

// Before `mon` attacks: sleep / paralysis. Returns true when it attacks.
export function statusLetsAttack(state, mon) {
  const enc = state.encounter;
  if (!usesCombatMoves(state.config) || !enc || !statusOf(enc, mon.uid, mon)) return true;
  const s = side(state, mon);
  const r = beforeAttack(s, statusRulesOf(state.config), statusDie(state, mon));
  keep(state, s);
  // PLAYTEST_009 (PT009-13 / 14): the log is the Combat MVP's, byte for byte (its saves continue as recorded) — the table
  // reads the status from the event's name and a paralysis roll that LET it attack from the roll itself (flow.buildReveal)
  // COMBAT 2.2: the counted sleep says which attempt it was and how many blocked ones are still to come (`left`)
  if (r.event) log(state, 'combat', `${getSpecies(mon.species).name}: ${r.event}${r.roll ? ` (${r.roll})` : ''}`, { status: { event: r.event, uid: mon.uid, species: mon.species, roll: r.roll, ...(r.attempt ? { attempt: r.attempt, ...(r.left !== undefined ? { left: r.left } : {}) } : {}) } });
  return r.attacks;
}

// COMBAT 2.2 burn (B2): how much harder this Pokémon's attack is TO HIT now — 0 without a burn or in an older set; a move
// without a roll never pays it (combatEngine.strikeWithMove).
export function hitPenaltyOf(state, mon) {
  if (!usesCombat21(state.config) || statusOf(state.encounter, mon.uid, mon)?.id !== 'burn') return 0;
  return statusRulesOf(state.config).burn.hitPenalty ?? 0;
}

// The end of an exchange: poison / burn tick on whoever is still in the arena. S1 (the Combat MVP): never the last heart.
// Combat 2.1: one Pokémon at a time (statusTickOne) — a tick may knock out; the battle's own KO path follows
// (combatEngine.endOfExchange).
export function statusEndOfRound(state, mons) {
  const enc = state.encounter;
  if (!usesCombatMoves(state.config) || !enc) return;
  for (const mon of mons) statusTickOne(state, mon);
}
// One Pokémon's end-of-exchange tick. Returns true when it fainted from it (its status is then gone — KO).
export function statusTickOne(state, mon) {
  const enc = state.encounter;
  if (!usesCombatMoves(state.config) || !enc || !mon || mon.hp <= 0 || !statusOf(enc, mon.uid, mon)) return false;
  const s = side(state, mon);
  const id = s.status.id;
  const r = endOfRound(s, statusRulesOf(state.config), statusDie(state, mon));
  keep(state, s);
  const ko = mon.hp <= 0;
  if (r.lost || r.roll !== null || r.wornOff) log(state, 'combat', `${STATUS_DEFINITIONS[id].icon} ${getSpecies(mon.species).name}: −${r.lost} HP${r.wornOff ? ' (wears off)' : ''}${ko ? ' — fainted!' : ''}`, { status: { event: 'tick', uid: mon.uid, species: mon.species, id, lost: r.lost, roll: r.roll, wornOff: r.wornOff, hpAfter: mon.hp, maxHp: mon.maxHp, ...(ko ? { ko: true } : {}) } });
  if (ko) clearStatus(state, mon, 'ko');
  return ko;
}

// A switch, a faint, a Potion (S1), a cure item, a Poké Stop: the status goes. Combat 2.1: poison stays on a Pokémon that
// is switched out (it lives on the Pokémon); a faint and a cure remove it.
export function clearStatus(state, mon, reason) {
  const enc = state.encounter;
  if (!mon || !statusOf(enc, mon.uid, mon)) return;
  if (!enc && !mon.status) return;
  if (reason === 'switch' && mon.status && persistent(state.config, mon.status.id) && !enc?.status?.[mon.uid]) return;
  const s = side(state, mon);
  const gone = cureStatus(s, reason);
  if (enc) keep(state, s);
  else delete mon.status;
  log(state, enc ? 'combat' : 'action', `${getSpecies(mon.species).name}: ${gone.id} cured (${reason}).`, { status: { event: 'cured', uid: mon.uid, species: mon.species, id: gone.id, reason } });
}

// COMBAT 2.1: poison after the battle — at the start of the owner's own turn every poisoned Pokémon of the TEAM loses
// `mapAmount` (sure, no die); at 0 it faints (no Growth, no loot, no win — it is not a battle) and the poison goes.
// In Oak's Box or away on Oak's job it rests: no tick. Part of the turn change (turnEngine.advanceTurn): a reload never
// ticks twice.
export function poisonOnTurnStart(state, player) {
  if (!usesCombat21(state.config)) return;
  const amount = statusRulesOf(state.config).poison.mapAmount;
  for (const mon of player.team) {
    if (mon.status?.id !== 'poison' || mon.hp <= 0) continue;
    const lost = Math.min(amount, mon.hp);
    mon.hp -= lost;
    const fainted = mon.hp <= 0;
    if (fainted) delete mon.status;
    log(state, 'action', `☠️ ${getSpecies(mon.species).name} loses ${lost} HP to poison${fainted ? ' — fainted!' : ''} (❤ ${mon.hp}/${mon.maxHp})`, { status: { event: 'mapTick', uid: mon.uid, species: mon.species, id: 'poison', lost, hpAfter: mon.hp, maxHp: mon.maxHp, player: player.id, ...(fainted ? { ko: true } : {}) } });
  }
}

// COMBAT 2.1 cure items (data/items.js kind 'cure'): what each cures; the Pokémon it can be used on now.
export function cureTargets(state, player, cures) {
  return player.team.filter((m) => m.hp > 0 && cures.includes(statusOf(state.encounter, m.uid, m)?.id));
}

// The opponent's choice (an NPC / wild Pokémon): one fixed rule, no die (the prototype's AI, on today's battle):
// its Special when it is worth it now, its Powerful when the target has 2 hearts or more, else the basic attack.
export function opponentSlot(state, opp, target) {
  const sp = moveAvailable(state, opp, 'special');
  if (sp) {
    const e = sp.effect;
    const worth = {
      status: () => !statusOf(state.encounter, target.uid, target) && !getSpecies(target.species).types.some((t) => STATUS_DEFINITIONS[e.status].immuneTypes.includes(t)),
      drain: () => opp.hp < opp.maxHp,
      guard: () => opp.hp * 2 <= opp.maxHp,
      boost: () => true,
      fixed: () => target.hp === 1 || getSpecies(opp.species).attack <= 0,
    }[e.kind];
    if (worth?.()) return 'special';
  }
  if (moveAvailable(state, opp, 'powerful') && target.hp >= 2) return 'powerful';
  return 'basic';
}
