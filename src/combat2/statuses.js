// COMBAT 2.0 (from the isolated prototype; used by the MVP — rules.combatMoves 'mvp1', dev-1510-combat). The STATUS EFFECT ENGINE: POISON, BURN, PARALYSIS, SLEEP.
// Pure functions over a battle side { mon, status } and an injected die `die(purpose) → 1..6`
// (a seeded RNG in the simulation, a queue of physical dice at the table, a forced list in the tests).
// Contracts: docs/design/COMBAT_2_0.md §4 — one test per row in tests/proto-combat2.test.js.
//
// The four rules every status shares (kid-simple, one sentence each on the card):
//   * a status lands only when the move HITS (a miss — natural 1, or 0 damage — puts nothing on);
//   * a Pokémon has at most ONE status; a second one does not land and does not replace the first;
//   * a status lives only IN THE ARENA: switching out, fainting or the end of the battle removes it —
//     it never reaches the map, the Box, a trade or a save outside a battle (S1; COMBAT 2.1: poison stays; COMBAT 2.2:
//     every status stays on the Pokémon — `persists`);
//   * a status NEVER knocks a Pokémon out: its heart loss stops at 1 heart. Only attacks knock out.

export const STATUS_IDS = Object.freeze(['poison', 'burn', 'paralysis', 'sleep']);

// `kidPl` = the S1 (Combat MVP) sentence — the prototype's card text. The table never shows it for a game: it words each
// status from THAT game's numbers (tableLayer.statusRuleText — Combat 2.1: „może znokautować”, poison after the battle).
// `immuneTypes`: a Pokémon of that type cannot get the status (fire does not burn, poison does not poison,
// electricity does not paralyse an Electric Pokémon). `kidPl`: the card sentence (one per status).
// The dice pattern is the same everywhere, so a child remembers one thing: „1–2: stan działa, 5–6: budzi się”.
export const STATUS_DEFINITIONS = Object.freeze({
  poison: Object.freeze({ id: 'poison', name: 'Poison', pl: 'Trucizna', icon: '☠️', immuneTypes: Object.freeze(['poison']), onHitPl: 'przeciwnik jest zatruty ☠️',
    kidPl: 'Trucizna ☠️: na koniec każdej rundy rzuć kostką — na 1 lub 2 zatruty Pokémon traci 1 serce (nigdy ostatniego).' }),
  burn: Object.freeze({ id: 'burn', name: 'Burn', pl: 'Oparzenie', icon: '🔥', immuneTypes: Object.freeze(['fire']), onHitPl: 'przeciwnik jest poparzony 🔥',
    kidPl: 'Oparzenie 🔥: na koniec rundy poparzony Pokémon na pewno traci 1 serce (nigdy ostatniego) i oparzenie gaśnie.' }),
  paralysis: Object.freeze({ id: 'paralysis', name: 'Paralysis', pl: 'Paraliż', icon: '⚡', immuneTypes: Object.freeze(['electric']), onHitPl: 'przeciwnik jest sparaliżowany ⚡',
    kidPl: 'Paraliż ⚡: przed każdym atakiem rzuć kostką — na 1 lub 2 sparaliżowany Pokémon nie atakuje (paraliż zostaje).' }),
  sleep: Object.freeze({ id: 'sleep', name: 'Sleep', pl: 'Sen', icon: '💤', immuneTypes: Object.freeze([]), onHitPl: 'przeciwnik zasypia 💤',
    kidPl: 'Sen 💤: śpiący Pokémon nie atakuje; przed atakiem rzuć kostką — na 5 lub 6 budzi się i od razu atakuje.' }),
});

// The numbers. 'S1' is the PROPOSAL (measured in docs/design/COMBAT_2_0.md §7); the others are MEASUREMENT
// variants only — kept so the doc's tables can be re-run, never a game's choice.
//   poison / burn  tick 'roll' (lose `amount` on a face in `faces`) | 'sure'; `floor` = the hearts it never
//                  takes (1: a status never knocks out); `rounds` = how many end-of-round ticks it lasts
//                  (null = while the Pokémon stays in the arena)
//   paralysis      `blockFaces`: before each attack, a face in it = no attack (the status stays)
//   sleep          `wakeFaces`: before each attack, a face in it = it wakes and attacks now; else no attack
export const STATUS_RULESETS = Object.freeze({
  S1: Object.freeze({
    poison: Object.freeze({ tick: 'roll', faces: Object.freeze([1, 2]), amount: 1, floor: 1, rounds: null }),
    burn: Object.freeze({ tick: 'sure', amount: 1, floor: 1, rounds: 1 }),
    paralysis: Object.freeze({ blockFaces: Object.freeze([1, 2]) }),
    sleep: Object.freeze({ wakeFaces: Object.freeze([5, 6]) }),
  }),
  // COMBAT 2.1 (Piotr's decision 16.10.2026; rules.statusRules 'c21', the set dev-1610-c21): a status MAY knock out
  // (floor 0 — the 1-heart protection is gone).
  //   poison  the S1 roll in battle (1–2 → −1) and it STAYS after the battle: −`mapAmount` at the start of every own
  //           turn of its owner (engine/combatMoves.poisonOnTurnStart); cured by Leczenie, Antidote, Full Heal
  //   burn    battle only (gone with it): after each exchange a visible d6, 1–2 → −2, else nothing; three rolls at
  //           most, then it goes out. PROVISIONAL BALANCE, measured: mirror +9.1 pts (the old band ≤ +10; poison
  //           +11.0); the whole battle at 1–2 was +12.8, at 4–6 +15.3 (docs/design/PT009_RULE_CONTRACTS.md K-18)
  //   paralysis / sleep  as S1
  C21: Object.freeze({
    poison: Object.freeze({ tick: 'roll', faces: Object.freeze([1, 2]), amount: 1, floor: 0, rounds: null, persists: true, mapAmount: 1 }),
    burn: Object.freeze({ tick: 'roll', faces: Object.freeze([1, 2]), amount: 2, floor: 0, rounds: 3 }),
    paralysis: Object.freeze({ blockFaces: Object.freeze([1, 2]) }),
    sleep: Object.freeze({ wakeFaces: Object.freeze([5, 6]) }),
  }),
  // COMBAT 2.1 b (ChatGPT review 16.10 12:14, P1): the same statuses as C21; the END OF AN EXCHANGE settles both ticks
  // before any faint (C21 skipped the lead's tick when the opponent's own tick ended the battle), then the faints in the
  // double-KO rule's order — `doubleKo` 'player' (the family rule ChatGPT recommends, Piotr to confirm: the opponent's
  // faint first, the player wins; the lead still loses its hearts) | 'opponent' (the lead's faint first). `tickUnanswered`:
  // an exchange the opponent could not answer (⚡ First Strike after an item / a Ball / a switch) ticks too — PT009-A3.
  C21B: Object.freeze({
    poison: Object.freeze({ tick: 'roll', faces: Object.freeze([1, 2]), amount: 1, floor: 0, rounds: null, persists: true, mapAmount: 1 }),
    burn: Object.freeze({ tick: 'roll', faces: Object.freeze([1, 2]), amount: 2, floor: 0, rounds: 3 }),
    paralysis: Object.freeze({ blockFaces: Object.freeze([1, 2]) }),
    sleep: Object.freeze({ wakeFaces: Object.freeze([5, 6]) }),
    exchange: Object.freeze({ ticks: 'both', doubleKo: 'player', tickUnanswered: true }),
  }),
  // COMBAT 2.2 (Piotr's approval, ChatGPT 18.10 10:23; rules.statusRules 'c22', the set dev-1610-c22): every status LIVES ON
  // THE POKÉMON (`persists`: a switch and the battle's end keep it; a KO, a cure, a Poké Stop remove it) — C21B's exchange.
  //   poison     −1 for sure after every exchange (no die) and −`mapAmount` at the start of its owner's turn; may knock out
  //   burn       −1 for sure after every exchange (no die; no harm on the map); `hitPenalty`: its attacks need 1 more TO HIT
  //              — the damage of a hit is the full total's (B2: combatEngine.resolveAttack); never wears off
  //   paralysis  before every attack a die: `blockFaces` → no attack; it stays
  //   sleep      a count of its own attack attempts (`attempts` on the status): the first `blocked` are blocked; the next
  //              one rolls — `wakeFaces` wakes it and it attacks, else blocked; the one after (`wakeBy`) wakes it for sure
  C22: Object.freeze({
    poison: Object.freeze({ tick: 'sure', amount: 1, floor: 0, rounds: null, persists: true, mapAmount: 1 }),
    burn: Object.freeze({ tick: 'sure', amount: 1, floor: 0, rounds: null, persists: true, hitPenalty: 1 }),
    paralysis: Object.freeze({ blockFaces: Object.freeze([1, 2]), persists: true }),
    sleep: Object.freeze({ blocked: 2, wakeFaces: Object.freeze([3, 4, 5, 6]), wakeBy: 4, persists: true }),
    exchange: Object.freeze({ ticks: 'both', doubleKo: 'player', tickUnanswered: true }),
  }),
  // The double-KO control variant (rules.statusRules 'c21b-o' — in NO set; the other answer to Piotr's decision): C21B,
  // but when both faint in one exchange the lead's faint is settled first (the opponent wins).
  C21B_O: Object.freeze({
    poison: Object.freeze({ tick: 'roll', faces: Object.freeze([1, 2]), amount: 1, floor: 0, rounds: null, persists: true, mapAmount: 1 }),
    burn: Object.freeze({ tick: 'roll', faces: Object.freeze([1, 2]), amount: 2, floor: 0, rounds: 3 }),
    paralysis: Object.freeze({ blockFaces: Object.freeze([1, 2]) }),
    sleep: Object.freeze({ wakeFaces: Object.freeze([5, 6]) }),
    exchange: Object.freeze({ ticks: 'both', doubleKo: 'opponent', tickUnanswered: true }),
  }),
});

// PT009-19 (rules.statusProc, OFF in every set until Piotr decides): after a status move HITS, a separate visible d6 —
// the status lands only on these faces (3–6 = 67 %, the measured recommendation; docs/design/PT009_RULE_CONTRACTS.md K-19).
export const STATUS_PROC = Object.freeze({ d6: Object.freeze([3, 4, 5, 6]) });

// Measurement variants (docs §7.3): ONE status changed at a time against S1.
export const STATUS_VARIANTS = Object.freeze({
  'poison-2': { poison: { tick: 'sure', amount: 2, floor: 0, rounds: null } }, // Piotr's first idea taken literally: −2 every round, may knock out
  'poison-1-sure': { poison: { tick: 'sure', amount: 1, floor: 1, rounds: null } }, // −1 every round, never the last heart
  'poison-faces123': { poison: { tick: 'roll', faces: [1, 2, 3], amount: 1, floor: 1, rounds: null } },
  'burn-2-rounds': { burn: { tick: 'sure', amount: 1, floor: 1, rounds: 2 } }, // „1 serce na turę” for two rounds
  'burn-2-rounds-ko': { burn: { tick: 'sure', amount: 1, floor: 0, rounds: 2 } }, // … and it may knock out
  'burn-forever': { burn: { tick: 'sure', amount: 1, floor: 1, rounds: null } }, // −1 every round while in the arena
  'burn-roll-3': { burn: { tick: 'roll', faces: [1, 2, 3], amount: 1, floor: 1, rounds: 3 } },
  'paralysis-1': { paralysis: { blockFaces: [1] } },
  'paralysis-123': { paralysis: { blockFaces: [1, 2, 3] } },
  'sleep-456': { sleep: { wakeFaces: [4, 5, 6] } },
  'sleep-6': { sleep: { wakeFaces: [6] } },
  // Combat 2.1 (Piotr 16.10: a status MAY knock out — floor 0; burn: a visible d6, a hit = −2, else 0) — measured
  // here before the C21 numbers were fixed (docs/design/PT009_RULE_CONTRACTS.md K-18)
  'c21-poison': { poison: { tick: 'roll', faces: [1, 2], amount: 1, floor: 0, rounds: null } },
  'c21-burn-6': { burn: { tick: 'roll', faces: [6], amount: 2, floor: 0, rounds: null } },
  'c21-burn-56': { burn: { tick: 'roll', faces: [5, 6], amount: 2, floor: 0, rounds: null } },
  'c21-burn-456': { burn: { tick: 'roll', faces: [4, 5, 6], amount: 2, floor: 0, rounds: null } },
  'c21-burn-456-once': { burn: { tick: 'roll', faces: [4, 5, 6], amount: 2, floor: 0, rounds: 1 } },
  'c21-burn-456-2r': { burn: { tick: 'roll', faces: [4, 5, 6], amount: 2, floor: 0, rounds: 2 } },
  'c21-burn-56-3r': { burn: { tick: 'roll', faces: [5, 6], amount: 2, floor: 0, rounds: 3 } },
  'c21-burn-12-2r': { burn: { tick: 'roll', faces: [1, 2], amount: 2, floor: 0, rounds: 2 } },
  'c21-burn-12-3r': { burn: { tick: 'roll', faces: [1, 2], amount: 2, floor: 0, rounds: 3 } },
});

export function statusRules(name = 'S1') {
  if (STATUS_RULESETS[name]) return STATUS_RULESETS[name];
  const v = STATUS_VARIANTS[name];
  if (!v) throw new Error(`Unknown status ruleset ${name}`);
  return { ...STATUS_RULESETS.S1, ...v };
}

// Why `statusId` cannot land on `mon` now (null = it can). `current` = the side's status record or null.
export function statusBlocker(mon, species, current, statusId) {
  if (!STATUS_DEFINITIONS[statusId]) return 'unknown status';
  if (mon.hp <= 0) return 'fainted';
  if (current) return current.id === statusId ? 'already has it' : 'already has another status';
  if (species.types.some((t) => STATUS_DEFINITIONS[statusId].immuneTypes.includes(t))) return 'immune';
  return null;
}

// Put the status on a side (the caller has checked statusBlocker). `ticks` counts end-of-round ticks done.
export function applyStatus(side, statusId) {
  side.status = { id: statusId, ticks: 0 };
  return side.status;
}

// Remove the status. `reason`: 'potion' | 'switch' | 'ko' | 'battleEnd' | 'woke' | 'wornOff'. Returns the id or null.
export function cureStatus(side, reason) {
  const id = side.status?.id ?? null;
  side.status = null;
  return id ? { id, reason } : null;
}

// Does this moment need a die? (the table asks for a physical die only when it does)
//   'beforeAttack' — sleep / paralysis; 'endOfRound' — a 'roll' tick that could still take a heart.
export function needsStatusRoll(side, moment, rules) {
  const st = side.status;
  if (!st || side.mon.hp <= 0) return false;
  if (moment === 'beforeAttack') return st.id === 'paralysis' || (st.id === 'sleep' && (rules.sleep.blocked === undefined || sleepAttempt(st) === rules.sleep.blocked + 1)); // C22: only the attempt that rolls
  if (moment === 'endOfRound') {
    const r = rules[st.id];
    return Boolean(r?.tick === 'roll') && side.mon.hp > r.floor;
  }
  return false;
}

// Before the side's Pokémon attacks (basic, special or powerful — never before an item, a switch or a ball).
// Returns { attacks, roll, event }: event 'woke' | 'sleeping' | 'paralysed' | null.
// COMBAT 2.2: the attempt the sleeping Pokémon makes now (1 = its first since it fell asleep)
const sleepAttempt = (st) => (st.attempts ?? 0) + 1;
// C22's sleep, one attempt: blocked (the first `blocked`), a roll (the next), a sure wake (from `wakeBy`). The count lives
// on the status (on the Pokémon — a switch or the battle's end never reset it). `left`: blocked attempts still to come
// (the table's „Jeszcze 2 zablokowane ataki”) — on the event, so the reveal can say it.
function sleepCounted(side, rules, die) {
  const st = side.status;
  const r = rules.sleep;
  const attempt = sleepAttempt(st);
  st.attempts = attempt;
  if (attempt >= r.wakeBy) {
    cureStatus(side, 'woke');
    return { attacks: true, roll: null, event: 'woke', attempt };
  }
  if (attempt === r.blocked + 1) {
    const roll = die('sleep');
    if (r.wakeFaces.includes(roll)) {
      cureStatus(side, 'woke');
      return { attacks: true, roll, event: 'woke', attempt };
    }
    return { attacks: false, roll, event: 'sleeping', attempt, left: 0 };
  }
  return { attacks: false, roll: null, event: 'sleeping', attempt, left: Math.max(0, r.blocked - attempt) };
}
export function beforeAttack(side, rules, die) {
  const st = side.status;
  if (st?.id === 'sleep' && side.mon.hp > 0 && rules.sleep.blocked !== undefined) return sleepCounted(side, rules, die); // COMBAT 2.2
  if (!needsStatusRoll(side, 'beforeAttack', rules)) return { attacks: true, roll: null, event: null };
  if (st.id === 'sleep') {
    const roll = die('sleep');
    if (rules.sleep.wakeFaces.includes(roll)) {
      cureStatus(side, 'woke');
      return { attacks: true, roll, event: 'woke' };
    }
    return { attacks: false, roll, event: 'sleeping' };
  }
  const roll = die('paralysis');
  const blocked = rules.paralysis.blockFaces.includes(roll);
  return { attacks: !blocked, roll, event: blocked ? 'paralysed' : null };
}

// The end-of-round tick of poison / burn. Returns { lost, roll, wornOff }.
export function endOfRound(side, rules, die) {
  const st = side.status;
  if (!st || side.mon.hp <= 0) return { lost: 0, roll: null, wornOff: false };
  const r = rules[st.id];
  if (!r?.tick) return { lost: 0, roll: null, wornOff: false }; // paralysis / sleep do not tick
  let roll = null;
  let lost = 0;
  if (side.mon.hp > r.floor) {
    const hits = r.tick === 'sure' || r.faces.includes((roll = die(st.id)));
    if (hits) {
      lost = Math.min(r.amount, side.mon.hp - r.floor);
      side.mon.hp -= lost;
    }
  }
  st.ticks += 1;
  const wornOff = r.rounds !== null && st.ticks >= r.rounds;
  if (wornOff) cureStatus(side, 'wornOff');
  return { lost, roll, wornOff };
}
