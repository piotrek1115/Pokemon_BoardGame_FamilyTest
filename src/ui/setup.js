// New-game dialog: pick 1-4 characters, human or AI (with archetype), and a seed.
import { CHARACTERS } from '../data/characters.js';
import { esc } from './dom.js';

export function randomSeed() {
  return `KANTO-${Math.floor(10000 + Math.random() * 90000)}`;
}

// Optional Time Limit (Step 6, DQ-60): off by default. Recommended options
// depend on the player count: with 1–2 players a 25-week limit would end most
// games by the timeout (62% in simulation), so only 30 is offered there.
// (The engine still accepts any number of weeks.)
export function timeLimitOptions(playerCount) {
  return playerCount <= 2 ? [null, 30] : [null, 25, 30];
}

const LIMIT_LABEL = (w) => (w === null ? 'Off — play until a Champion' : `${w} weeks`);

function checkedPlayers(form) {
  return CHARACTERS.filter((c) => form.elements[`on-${c.id}`]?.checked).length;
}

// (Re)fill the Time limit select for the current number of players, keeping
// the choice when it is still offered (otherwise Off).
export function renderTimeLimitOptions(form, preferred = form.elements.timeLimit.value === '' ? null : Number(form.elements.timeLimit.value)) {
  const options = timeLimitOptions(checkedPlayers(form));
  const value = options.includes(preferred) ? preferred : null;
  form.elements.timeLimit.innerHTML = options.map((w) => `<option value="${w ?? ''}"${w === value ? ' selected' : ''}>${LIMIT_LABEL(w)}</option>`).join('');
}

export function defaultSetup() {
  return {
    seed: randomSeed(),
    timeLimitWeeks: null,
    players: [
      { character: 'ash', controller: 'human' },
      { character: 'gary', controller: 'ai', aiArchetype: 'balanced' },
    ],
  };
}

export function renderSetupForm(form, setup, archetypes) {
  const byChar = Object.fromEntries(setup.players.map((p) => [p.character, p]));
  const rows = CHARACTERS.map((c) => {
    const p = byChar[c.id];
    return `
      <tr>
        <td><label><input type="checkbox" name="on-${c.id}"${p ? ' checked' : ''}> <span class="chip" style="background:${c.color}"></span>${esc(c.name)}</label></td>
        <td><select name="ctl-${c.id}">
          <option value="human"${p?.controller !== 'ai' ? ' selected' : ''}>Human</option>
          <option value="ai"${p?.controller === 'ai' ? ' selected' : ''}>AI</option>
        </select></td>
        <td><select name="arch-${c.id}">${archetypes.map((a) => `<option value="${a}"${(p?.aiArchetype ?? 'balanced') === a ? ' selected' : ''}>${a}</option>`).join('')}</select></td>
      </tr>`;
  }).join('');
  form.querySelector('.setup-rows').innerHTML = rows;
  form.elements.seed.value = setup.seed;
  renderTimeLimitOptions(form, setup.timeLimitWeeks ?? null);
}

export function readSetupForm(form) {
  const players = CHARACTERS.filter((c) => form.elements[`on-${c.id}`]?.checked).map((c) => ({
    character: c.id,
    controller: form.elements[`ctl-${c.id}`].value,
    aiArchetype: form.elements[`arch-${c.id}`].value,
  }));
  const limit = form.elements.timeLimit.value === '' ? null : Number(form.elements.timeLimit.value);
  return { seed: form.elements.seed.value.trim() || randomSeed(), players, timeLimitWeeks: timeLimitOptions(players.length).includes(limit) ? limit : null };
}

// One Kanto (PT006-10, Piotr 13–14.10.2026): ONE new-game mode, „Pokémon Kanto — Przygoda”
// (CONFIG as it is: rules.gameMode 'adventure'). No Family / Sandbox choice for players.
//
// Unfinished systems stay DEV pilots — feature by feature, never a second product mode; a
// developer turns them on with the table's URL (`?dev=hunts,trials`) and the settings name them.
//   hunts   — rare hunts (3 own turns each), Build 3.3 E4
//   trials  — Gym Trials, one SHORT trial (mix 'oneShort'), Build 3.3 E5
//   expedition — the first Rare Expedition (Scyther: an encounter step, retry R2), PLAYTEST_006 C4
//   rumours — Kanto Rumours & Opportunities (a small seeded set), PLAYTEST_006 C5
//   pt013 — PLAYTEST_013's proposal: a caught expedition Scyther knows Slash, a caught Jigglypuff Sing (NIGHTSHIFT_014 A)
//   legends2 — DEC-01 legendary persistence: Zapdos waits in the Power Plant until caught (Ultra Ball only, one per world)
//   legends3 — the same + every legend one Catch Die step harder (DEC-01 balance, Piotr 20.10)
//   pt013b — the same, Slash only for a Scyther without a Powerful (Wing Attack kept) — the review's variant (20.10)
//   obtain151 / obtain151w — ways to the 7 species without one: one Mt. Moon fossil per player / each fossil once in the
//              world (NIGHTSHIFT_014 B — a prototype)
export const DEV_PILOTS = ['hunts', 'trials', 'expedition', 'rumours', 'incidents', 'legends', 'route23', 'pt013', 'pt013b', 'obtain151', 'obtain151w', 'legends2', 'legends3']; // + NIGHTSHIFT D, E, A (variant); NIGHTSHIFT_014 A (two variants), B; DEC-01 (+ balance)

export function applyDevPilots(config, pilots = []) {
  if (pilots.includes('hunts')) {
    config.rules.hunts = 'pilot';
    config.hunts = { ...config.hunts, clock: 'ownTurns', length: 3 };
  }
  if (pilots.includes('trials')) {
    config.rules.gymTrials = 'pilot';
    config.gymTrials = { ...config.gymTrials, mix: 'oneShort' };
  }
  if (pilots.includes('expedition')) config.rules.expeditions = 'pilot';
  if (pilots.includes('rumours')) config.rules.rumours = 'pilot';
  if (pilots.includes('incidents')) config.rules.worldIncidents = 'pilot'; // NIGHTSHIFT D: the living world's incidents (OFF in every set)
  if (pilots.includes('legends')) config.rules.legendStory = 'v1'; // NIGHTSHIFT E: Zapdos / Mewtwo story lines, the end inactive (a prototype)
  if (pilots.includes('legends2')) config.rules.legendStory = 'v2'; // DEC-01 (Piotr 20.10): legendary persistence — Zapdos first (a DEV pilot)
  if (pilots.includes('legends3')) config.rules.legendStory = 'v3'; // DEC-01 balance (Piotr 20.10): + every legend one Catch Die step harder
  if (pilots.includes('route23')) config.rules.route23Gate = 'v1'; // NIGHTSHIFT A: the canonical Route 23 gate (a variant for Piotr)
  if (pilots.includes('pt013')) config.rules.balance013 = 'v1'; // NIGHTSHIFT_014 A: PLAYTEST_013's balance proposal
  if (pilots.includes('pt013b')) config.rules.balance013 = 'v2'; // … the variant that keeps a Scyther's Wing Attack
  if (pilots.includes('obtain151')) config.rules.obtain151 = 'player'; // NIGHTSHIFT_014 B: the 7 species' ways, one fossil per player
  if (pilots.includes('obtain151w')) config.rules.obtain151 = 'world'; // … each fossil once in the world
  return config;
}

// One Kanto day 14.10 (ChatGPT canonical full-day handoff G1): the EVENING DEV RULESET — ONE versioned set of
// candidates for the family playtest, on every NEW game of this DEV build (both new-game paths of the table).
// Its values stay CANDIDATES (docs: DONE DEV / PILOT, never RELEASED); the public Build 3.3 is frozen, and
// every older save keeps its own rules. Rare hunts and Gym Trials stay off (only `?dev=hunts,trials`).
//   `?dev=base`  a new game WITHOUT it (the plain One Kanto adventure, for comparison)
//   `?dev=gymD`  the same set with the themed gyms (PT006-07 variant D) instead of B — a comparison game
// Every set is FROZEN once a build plays it (its saves keep its id and switches): a change is a new set.
//   dev-1410   the evening of 14.10 (ChatGPT: APPROVED FOR FAMILY PLAYTEST, freeze 3107ee2)
//   dev-1410b  bonus 14.10: + fishing with the Old Rod (rules.fishing 'v1') + 8 more trophies (achievements 'v2')
//              + six more explore events (eventPack 'b4h')
//   dev-1410c  bonus 2, 14.10: + Eevee's branching evolution (eeveeBranch 'v1') + the pilots below when ready
const DEV_1410 = Object.freeze({ expeditions: 'pilot', rumours: 'pilot', gymTeams: 'B', greatBall: 'G1', iconicWild: 'd6', oakResearch: 'v1', trading: 'v1', achievements: 'v1', pvp: 'v1', questPack: 'day14' });
// dev-1910-epic-ai2e's rules (Family Test 3.8 / 3.8.1) — one object for that set and for the 3.9 candidate built on it.
const EPIC_AI2E_RULES = Object.freeze({ ...DEV_1410, achievements: 'v5', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c22', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1', gymSet: 'kanto8', leagueBadges: 8, roster: 'kanto151', epicQuests: 'v1', aiPlan: 'v2e' });

export const RULESETS = Object.freeze({
  'dev-1410': Object.freeze({ id: 'dev-1410', rules: DEV_1410 }),
  'dev-1410b': Object.freeze({ id: 'dev-1410b', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h' }) }),
  'dev-1410c': Object.freeze({ id: 'dev-1410c', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: 'pilot' }) }),
  // PLAYTEST_007 night shift (Build 3.5 DEV, 15.10): dev-1410c (the public Build 3.4 game) + the player picks who comes
  // in after a KO (koPick 'v1'). The quest / rumour reasons, the ⚡ order on the table and the notices are UI only.
  'dev-1510': Object.freeze({ id: 'dev-1510', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: 'pilot', koPick: 'v1' }) }),
  // Combat MVP (ChatGPT „COMBAT 2.0 — EMERGENCY PLAYABLE MVP”, Piotr 15.10): dev-1510 + the moves and statuses
  // (combatMoves 'mvp1'). The signature-move pilot gives way to it here (one move system at a time); dev-1510 keeps it.
  'dev-1510-combat': Object.freeze({ id: 'dev-1510-combat', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1' }) }),
  // PLAYTEST_009 night shift (16.10, the next family candidate): dev-1510-combat (the public Combat MVP game) + the shop's
  // action paid by the first buy / sell (shopCharge 'transaction', PT009-06). The PT009 UX fixes are UI only (every set).
  'dev-1610': Object.freeze({ id: 'dev-1610', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction' }) }),
  // COMBAT 2.1 (Piotr's decision 16.10, ChatGPT „COMBAT 2.1 — DECYZJA PIOTRA”): dev-1610 + statusRules 'c21' — a status may
  // knock out, poison stays after the battle, burn with a d6, the cure items, a Potion heals HP only.
  'dev-1610-c21': Object.freeze({ id: 'dev-1610-c21', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21' }) }),
  // COMBAT 2.1 b (ChatGPT review 16.10 12:14): dev-1610-c21 (frozen — LAN 8140) with the end of an exchange corrected — both
  // status ticks settle before any faint (a true double KO), the double-KO rule, the tick after an unanswered exchange.
  'dev-1610-c21b': Object.freeze({ id: 'dev-1610-c21b', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b' }) }),
  // COMBAT 2.1 c (Piotr's decisions 17.10, ChatGPT 10:26 „COMBAT 2.1 — DECYZJE PIOTRA ZATWIERDZONE”;
  // docs/design/COMBAT_2_1_DECISION_CARD.md): dev-1610-c21b (frozen — LAN 8141, fixtures v16-c21b) + the status die
  // (K-19 B: a status move's status lands only on 3–6 after a hit; its damage stays). K-18, K-A1, K-21 A, PT009-A4 A = c21b.
  'dev-1610-c21c': Object.freeze({ id: 'dev-1610-c21c', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', statusProc: 'd6' }) }),
  // PLAYTEST_009 final (Piotr's decisions 17.10 15:55, ChatGPT 15:58; docs/design/PLAYTEST_009_DECISION_CARD.md):
  // dev-1610-c21c (frozen — Combat 2.1c, fixtures v16-c21c) + K-04 A (eventActions 'nextTurn': an event's +1 action at the
  // start of the next own turn, one waiting at most; rain still takes one at once) + K-05 W1 (eventPack 'b4h2': „Szelest w
  // plecaku”) + K-07 A (rumourSlots 'unlimited': rumours / expeditions without a limit, the book's quests stay at 2).
  // K-20 A, K-12 A, K-17 A: no rule changes. The same AI as c21c.
  'dev-1610-pt009final': Object.freeze({ id: 'dev-1610-pt009final', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited' }) }),
  // LIVING KANTO 2.0 (Piotr 17.10 „Integrujmy”; docs/design/RUMOURS_LIVING_KANTO_DECISION_CARD.md): dev-1610-pt009final
  // (frozen — LAN 8148, fixtures v16-pt9f) + livingKanto 'v1': 7 Poké Stop boards × 4 offers, a refresh every 3 weeks, a
  // taken card gone for the others, a generated ★★★ every 6 weeks (first come), no stones (3 💰 instead); the 7 rumours,
  // their hearing (K-20) and the personal expedition stay with rumourEngine; K-07 (no rumour limit) holds; the AI ignores
  // the boards.
  'dev-1610-lk2': Object.freeze({ id: 'dev-1610-lk2', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1' }) }),
  // COMBAT 2.2 (Piotr's approval, ChatGPT 18.10 10:23 „COMBAT 2.2 — FINAL APPROVAL”): dev-1610-lk2 (frozen — the public
  // Family Test 3.6, fixtures v16-lk2) + statusRules 'c22': every status stays on the Pokémon until cured or KO (a switch,
  // the battle's end keep it); poison and burn −1 ❤ for sure after every exchange (C21B's order kept); burn −1 to the hit
  // only (B2: the damage of a hit from the full total); paralysis 1–2 = no attack, it stays; sleep: two attacks blocked,
  // the third rolls (3–6 wakes and attacks), the fourth wakes for sure — the count stays on the Pokémon. The same AI (v2e
  // FROZEN — it does not weigh the new statuses).
  'dev-1610-c22': Object.freeze({ id: 'dev-1610-c22', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c22', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1' }) }),
  // ACHIEVEMENTS 3.0 (Piotr's approval, ChatGPT 18.10 12:21): dev-1610-c22 (frozen — Combat 2.2, golden saves v16-c22) +
  // achievements 'v3' — 20 trophies, FIRST PLAYER WINS (one owner per trophy in a game, the AI too; their points never
  // change the end of the game). The same rules otherwise; the AI v2e FROZEN.
  'dev-1610-ach3': Object.freeze({ id: 'dev-1610-ach3', rules: Object.freeze({ ...DEV_1410, achievements: 'v3', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c22', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1' }) }),
  // Achievements 4.0 (Piotr, wariant A, ChatGPT 18.10 13:04): = dev-1610-ach3 with 'v4' — the same 20 trophies, 8 drawn per game.
  'dev-1610-ach4': Object.freeze({ id: 'dev-1610-ach4', rules: Object.freeze({ ...DEV_1410, achievements: 'v4', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c22', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1' }) }),
  // Achievements 5.0 (Piotr's decisions A–E, ChatGPT 18.10 15:24): = dev-1610-ach4 with 'v5' — a trainer is type + name +
  // place; the two trainer trophies say „trenerzy z Eksploracji”. The Family Test 3.7 candidate.
  'dev-1610-ach5': Object.freeze({ id: 'dev-1610-ach5', rules: Object.freeze({ ...DEV_1410, achievements: 'v5', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c22', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1' }) }),
  // NIGHTSHIFT 18.10 (ChatGPT 22:50, Piotr: 8 badges for the League): = dev-1610-ach5 (Family Test 3.7) + the 8 gyms of Kanto
  // (Blaine / Cinnabar, Giovanni / Viridian — data/gyms.js gymsOf) + the League from 8 badges (gymEngine.leagueBadges).
  'dev-1810-kanto8': Object.freeze({ id: 'dev-1810-kanto8', rules: Object.freeze({ ...DEV_1410, achievements: 'v5', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c22', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1', gymSet: 'kanto8', leagueBadges: 8 }) }),
  // NIGHTSHIFT B + C (18.10): = dev-1810-kanto8 + the Pokédex of 151 (the 19 species never wild — data/pokemon.js dexSpecies)
  // + the epic quest lines (Dojo, Porygon, Dratini, Lapras — data/questBook.js EPIC_QUESTS).
  'dev-1810-epic': Object.freeze({ id: 'dev-1810-epic', rules: Object.freeze({ ...DEV_1410, achievements: 'v5', fishing: 'v1', eventPack: 'b4h2', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c22', statusProc: 'd6', eventActions: 'nextTurn', rumourSlots: 'unlimited', livingKanto: 'v1', gymSet: 'kanto8', leagueBadges: 8, roster: 'kanto151', epicQuests: 'v1' }) }),
  // PLAYTEST_012 / NIGHTSHIFT (Piotr approved 19.10, ChatGPT 13:25, PR #3 6266120967): = dev-1810-epic + the FROZEN AI v2e
  // (rules.aiPlan 'v2e', used exactly as in dev-1610-ai2e — no AI code changed; measured on the 8-gym rules: 93–100% Champions
  // by week 120, no endless game). `noTimeLimit` is a SETUP property of this set, not a rule: its new games start without a
  // time limit (applyAdventure) and the table offers only „Bez limitu” (8 badges in 25 / 30 weeks: 0% Champions measured).
  // Older sets keep their limit options; a saved game keeps its own limit.
  'dev-1910-epic-ai2e': Object.freeze({ id: 'dev-1910-epic-ai2e', noTimeLimit: true, rules: EPIC_AI2E_RULES }),
  // FAMILY TEST 3.9 candidate (Piotr 20.10: „przygotuj do family testu”; ChatGPT 17:32 plan) — = dev-1910-epic-ai2e (3.8 / 3.8.1)
  // + DEC-01 legendStory 'v3' (Zapdos's line WITH its end: one per world, never gone, Ultra Ball only, every legend one
  // Catch Die step harder, an atomic catch) + PLAYTEST_013 balance013 'v2' (a caught Safari Scyther gets Slash only without a
  // Powerful — Wing Attack kept; a caught Jigglypuff knows Sing). Nothing else: no obtain151, no incidents, no other legend.
  'dev-2010-fam39': Object.freeze({ id: 'dev-2010-fam39', noTimeLimit: true, rules: Object.freeze({ ...EPIC_AI2E_RULES, legendStory: 'v3', balance013: 'v2' }) }),
  // SYS-01 AI v2 (ChatGPT review 16.10 13:51; docs/design/AI_V2_CONTRACT.md): dev-1610-c21b with the AI v2 — the same
  // rules for people; the AI takes the pack quests it can finish and fishes. Old sets keep AI v1 (their saves replay).
  'dev-1610-ai2': Object.freeze({ id: 'dev-1610-ai2', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', aiPlan: 'v2' }) }),
  // SYS-01 AI v2b (ChatGPT review 16.10 14:52; docs/design/AI_V2B_CONTRACT.md): dev-1610-ai2 (frozen: LAN 8142, its saves —
  // fixtures v16-ai2) with AI v2b — the same rules for people.
  'dev-1610-ai2b': Object.freeze({ id: 'dev-1610-ai2b', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', aiPlan: 'v2b' }) }),
  // SYS-01 AI v2c (ChatGPT review 16.10 16:53; docs/design/AI_V2C_CONTRACT.md): dev-1610-ai2b (frozen: LAN 8143, fixtures
  // v16-ai2b) with AI v2c — Oak's Box, Research Jobs, evolution stones; the same rules for people.
  'dev-1610-ai2c': Object.freeze({ id: 'dev-1610-ai2c', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', aiPlan: 'v2c' }) }),
  // SYS-01 AI v2d (ChatGPT review 16.10 20:02; docs/design/AI_V2D_CONTRACT.md): dev-1610-ai2c (frozen: LAN 8144, fixtures
  // v16-ai2c) with AI v2d — the same rules for people.
  'dev-1610-ai2d': Object.freeze({ id: 'dev-1610-ai2d', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', aiPlan: 'v2d' }) }),
  // SYS-01 AI v2e (ChatGPT review 16.10 21:13; docs/design/AI_V2E_CONTRACT.md): dev-1610-ai2d (frozen: LAN 8145, fixtures
  // v16-ai2d) with AI v2e — the same rules for people.
  'dev-1610-ai2e': Object.freeze({ id: 'dev-1610-ai2e', rules: Object.freeze({ ...DEV_1410, achievements: 'v2', fishing: 'v1', eventPack: 'b4h', eeveeBranch: 'v1', characterTraits: 'pilot', signatureMoves: false, koPick: 'v1', combatMoves: 'mvp1', shopCharge: 'transaction', statusRules: 'c21b', aiPlan: 'v2e' }) }),
});
export const ADVENTURE_DEV = RULESETS['dev-1510']; // what a new game of this DEV build plays (Build 3.5 DEV candidate)
//   `?dev=1410` / `?dev=1410b` / `?dev=1410c`  a frozen earlier set instead (a comparison / fallback game; 1410c = Build 3.4)
//   `?dev=combat`  the Combat MVP set dev-1510-combat (its own LAN package opens with it — build-tablet --dev combat)
//   `?dev=1610`    the PLAYTEST_009 candidate dev-1610 (build-tablet --dev 1610)
//   `?dev=c21`     Combat 2.1: dev-1610-c21 (build-tablet --dev c21)
//   `?dev=c21b`    Combat 2.1 b: dev-1610-c21b (build-tablet --dev c21b)
//   `?dev=c21c`    Combat 2.1 c: dev-1610-c21c (build-tablet --dev c21c) — Piotr's final Combat 2.1 (17.10)
//   `?dev=pt009final`  PLAYTEST_009 final: dev-1610-pt009final (build-tablet --dev pt009final) — Piotr's decisions 17.10
//   `?dev=lk2`     Living Kanto 2.0: dev-1610-lk2 (build-tablet --dev lk2) — the Poké Stop offer boards (17.10)
//   `?dev=c22`     Combat 2.2: dev-1610-c22 (build-tablet --dev c22) — the lasting statuses (18.10)
//   `?dev=ach3`    Achievements 3.0: dev-1610-ach3 (build-tablet --dev ach3) — 20 trophies, first player wins (18.10)
//   `?dev=ach4`    Achievements 4.0: dev-1610-ach4 (build-tablet --dev ach4) — TROFEA KANTO: 8 of the 20 drawn per game (18.10)
//   `?dev=ach5`    Achievements 5.0: dev-1610-ach5 (build-tablet --dev ach5) — ach4 + a trainer = type, name and place (18.10)
//   `?dev=kanto8`  NIGHTSHIFT: dev-1810-kanto8 (build-tablet --dev kanto8) — ach5 + 8 gyms + the League from 8 badges (18.10)
//   `?dev=ai2`     AI v2: dev-1610-ai2 (build-tablet --dev ai2)
//   `?dev=ai2b`    AI v2b: dev-1610-ai2b (build-tablet --dev ai2b)
//   `?dev=ai2c`    AI v2c: dev-1610-ai2c (build-tablet --dev ai2c)
//   `?dev=ai2d`    AI v2d: dev-1610-ai2d (build-tablet --dev ai2d)
//   `?dev=ai2e`    AI v2e: dev-1610-ai2e (build-tablet --dev ai2e)
export const ADVENTURE_OPTIONS = ['base', 'gymD', '1410', '1410b', '1410c', 'combat', '1610', 'c21', 'c21b', 'c21c', 'pt009final', 'lk2', 'c22', 'ach3', 'ach4', 'ach5', 'kanto8', 'epic', 'epicai2e', 'fam39', 'ai2', 'ai2b', 'ai2c', 'ai2d', 'ai2e'];

// The evening / DEV set a list of adventure options names (null = the plain adventure, ?dev=base).
export function adventureSet(options = []) {
  if (options.includes('base')) return null;
  return options.includes('fam39') ? RULESETS['dev-2010-fam39'] : options.includes('1410') ? RULESETS['dev-1410'] : options.includes('1410b') ? RULESETS['dev-1410b'] : options.includes('1410c') ? RULESETS['dev-1410c'] : options.includes('combat') ? RULESETS['dev-1510-combat'] : options.includes('1610') ? RULESETS['dev-1610'] : options.includes('ai2e') ? RULESETS['dev-1610-ai2e'] : options.includes('ai2d') ? RULESETS['dev-1610-ai2d'] : options.includes('ai2c') ? RULESETS['dev-1610-ai2c'] : options.includes('ai2b') ? RULESETS['dev-1610-ai2b'] : options.includes('ai2') ? RULESETS['dev-1610-ai2'] : options.includes('epicai2e') ? RULESETS['dev-1910-epic-ai2e'] : options.includes('epic') ? RULESETS['dev-1810-epic'] : options.includes('kanto8') ? RULESETS['dev-1810-kanto8'] : options.includes('ach5') ? RULESETS['dev-1610-ach5'] : options.includes('ach4') ? RULESETS['dev-1610-ach4'] : options.includes('ach3') ? RULESETS['dev-1610-ach3'] : options.includes('c22') ? RULESETS['dev-1610-c22'] : options.includes('lk2') ? RULESETS['dev-1610-lk2']: options.includes('pt009final') ? RULESETS['dev-1610-pt009final'] : options.includes('c21c') ? RULESETS['dev-1610-c21c']: options.includes('c21b') ? RULESETS['dev-1610-c21b'] : options.includes('c21') ? RULESETS['dev-1610-c21'] : ADVENTURE_DEV;
}

export function applyAdventure(config, options = []) {
  const set = adventureSet(options);
  if (!set) return config;
  Object.assign(config.rules, set.rules);
  if (options.includes('gymD')) config.rules.gymTeams = 'D';
  config.devRuleset = set.id;
  if (set.noTimeLimit) config.winCondition.timeLimitWeeks = null; // dev-1910-epic-ai2e: a new game of this set has no time limit
  return config;
}

// The DEV pilots a game plays (for the settings): the hand-picked pilots, then the evening set's parts.
export function devPilotsOf(config) {
  const r = config?.rules ?? {};
  return [
    r.hunts === 'pilot' && 'hunts', r.gymTrials === 'pilot' && 'trials', r.expeditions === 'pilot' && 'expedition', r.rumours === 'pilot' && 'rumours', r.worldIncidents === 'pilot' && 'incidents', r.legendStory === 'v1' && 'legends', r.legendStory === 'v2' && 'legends2', r.legendStory === 'v3' && 'legends3', r.route23Gate === 'v1' && 'route23', r.balance013 === 'v1' && 'pt013', r.balance013 === 'v2' && 'pt013b', r.obtain151 === 'player' && 'obtain151', r.obtain151 === 'world' && 'obtain151w',
    r.oakResearch === 'v1' && 'oakResearch', r.trading === 'v1' && 'trading', r.pvp === 'v1' && 'pvp', r.achievements === 'v1' && 'achievements', r.questPack === 'day14' && 'questPack', r.fishing === 'v1' && 'fishing', (r.eventPack === 'b4h' || r.eventPack === 'b4h2') && 'eventPack', r.eventActions === 'nextTurn' && 'eventActions', r.rumourSlots === 'unlimited' && 'rumourSlots', r.livingKanto === 'v1' && 'livingKanto', r.combatMoves === 'mvp1' && 'combatMoves', r.eeveeBranch === 'v1' && 'eeveeBranch', r.characterTraits === 'pilot' && 'characterTraits', r.signatureMoves === 'pilot' && 'signatureMoves', r.koPick === 'v1' && 'koPick', r.achievements === 'v2' && 'achievementsV2', r.achievements === 'v3' && 'achievementsV3', r.achievements === 'v4' && 'achievementsV4', r.achievements === 'v5' && 'achievementsV5', r.gymSet === 'kanto8' && 'gymSet8', r.roster === 'kanto151' && 'roster151', r.epicQuests === 'v1' && 'epicQuests', r.shopCharge === 'transaction' && 'shopCharge', r.statusRules && (r.statusRules === 'c22' ? 'statusRules22' : 'statusRules'), r.statusProc === 'd6' && 'statusProc', r.aiPlan === 'v2' && 'aiPlan', r.aiPlan === 'v2b' && 'aiPlanB', r.aiPlan === 'v2c' && 'aiPlanC', r.aiPlan === 'v2d' && 'aiPlanD', r.aiPlan === 'v2e' && 'aiPlanE',
    r.gymTeams && r.gymTeams !== 'v1' && `gym${r.gymTeams}`, r.greatBall && r.greatBall !== 'v1' && 'greatBall', r.iconicWild && 'iconicWild',
  ].filter(Boolean);
}

// Build 3.3 family playtest (ChatGPT EREV review, 13.10): the two test configurations the
// public Build 3.3 offered — 'family' (no pilots) and 'sandbox' (hunts + one SHORT trial).
// LEGACY since One Kanto: kept so tests and tools can make such a game; the table no longer
// offers it. A legacy configuration is the Build 3.3 game: rules.gameMode false.
export const GAME_VARIANTS = ['family', 'sandbox'];

export function applyVariant(config, variant) {
  config.rules.gameMode = false;
  return variant === 'sandbox' ? applyDevPilots(config, ['hunts', 'trials']) : config;
}

// Which configuration a game (or a save) plays — for the settings („Ta gra: …”):
// 'adventure' (One Kanto), 'family' / 'sandbox' (a Build 3.3 save, its own rules) or 'older'.
export function variantOf(config) {
  const r = config?.rules ?? {};
  if (r.gameMode === 'adventure') return 'adventure';
  if (r.ruleset !== 'b33') return 'older';
  return r.hunts === 'pilot' || r.gymTrials === 'pilot' ? 'sandbox' : 'family';
}
