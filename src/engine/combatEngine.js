// Combat v0.1: attack roll = d6 + attack modifier + type modifier, looked up in
// CONFIG.combat.damageThresholds. A natural 1 always misses.
// One "fight" action = the player's lead attacks, then the opponent strikes back
// (CONFIG.combat.opponentCounterattacks). Trainer, Team Rocket, gym and League
// battles share this flow; only the end (reward / plot / badge / stage) differs.
import { TYPE_CHART } from '../data/types.js';
import { attackTypeOf, getSpecies } from '../data/pokemon.js';
import { d6 } from './rng.js';
import { log } from './log.js';
import { currentPlayer, getLead } from './gameState.js';
import { endEncounter } from './encounterEngine.js';
import { rocketDefeated, rocketWins } from './rocketEngine.js';
import { gymLost, gymWon, leagueStageLost, leagueStageWon } from './gymEngine.js';
import { noteFainted, noteParticipant, opponentDefeated } from './growthEngine.js';
import { escapeAfterRound } from './temperamentEngine.js';
import { ballCount, itemCount, useItem } from './itemEngine.js';
import { BALL_IDS } from '../data/items.js';
import { trainerLoot } from './lootEngine.js';
import { trainerPaysNothing } from './fatigueEngine.js';
import { consumeUnanswered, switchUnanswered } from './initiativeEngine.js';
import { leadCandidates } from './leadPickEngine.js';
import { SIGNATURE_MOVES } from '../data/signatureMoves.js';
import { attackMods, basicMoveOf, clearStatus, exchangeRule, hitPenaltyOf, markUsed, moveAvailable, opponentSlot, statusEndOfRound, statusLetsAttack, statusTickOne, tryStatus, usesCombat21, usesCombatMoves } from './combatMoves.js';

// Bonus 2, 14.10 (rules.signatureMoves 'pilot'; docs/SIGNATURE_MOVES.md): the line's move, once per battle.
export const usesSignature = (config) => config.rules.signatureMoves === 'pilot';
export const moveOf = (mon) => (mon ? SIGNATURE_MOVES[getSpecies(mon.species).family] ?? null : null);
// May `mon` use its move now? `used` = the uids that used theirs in this battle.
export function moveReady(config, mon, used = []) {
  const move = usesSignature(config) && mon && mon.hp > 0 ? moveOf(mon) : null;
  if (!move || used.includes(mon.uid)) return null;
  if (move.effect.when === 'hpHalfOrLess' && mon.hp * 2 > mon.maxHp) return null;
  return move;
}

export function typeModifier(attackType, defenderTypes, config) {
  const chart = TYPE_CHART[attackType];
  if (!chart) throw new Error(`Unknown attack type: ${attackType}`);
  let mod = 0;
  for (const t of defenderTypes) {
    if (chart.strong.includes(t)) mod += config.combat.typeAdvantage;
    else if (chart.weak.includes(t)) mod += config.combat.typeDisadvantage;
  }
  const [lo, hi] = config.combat.typeModifierClamp;
  return Math.max(lo, Math.min(hi, mod));
}

export function damageForTotal(total, config) {
  for (const row of config.combat.damageThresholds) {
    if (total >= row.atLeast) return row.damage;
  }
  return 0;
}

// The type modifier of `attacker`'s attack against `defender` (species) — the
// one the attack roll uses; the table previews it before the choice.
export function typeMatchup(attacker, defender, config) {
  return typeModifier(attackTypeOf(attacker), defender.types, config);
}

// Pure resolution of one attack, given the d6 result and two species.
// `hitPenalty` (COMBAT 2.2 burn, B2 — 0 everywhere else): the HIT CHECK only — a total that the penalty takes below the
// table's first row misses (`burnMiss`); a hit does the FULL total's damage (never a second penalty on the damage). A
// natural 1 still misses, a natural 6 still does its minimum.
export function resolveAttack(roll, attacker, defender, config, bonus = 0, missFaces = null, hitPenalty = 0) {
  const attackMod = attacker.attack;
  const typeMod = typeMatchup(attacker, defender, config);
  const total = roll + attackMod + typeMod + bonus; // bonus 2: a signature move's +N (0 everywhere else)
  // Combat MVP: a Powerful move misses on 1–2 (missFaces); otherwise a natural 1 misses
  const natural1 = (roll === 1 && config.combat.naturalOneMisses) || Boolean(missFaces?.includes(roll));
  let damage = natural1 ? 0 : damageForTotal(total, config);
  const burnMiss = Boolean(hitPenalty) && damage > 0 && damageForTotal(total - hitPenalty, config) === 0;
  if (burnMiss) damage = 0;
  const natural6Boost = roll === 6 && damage < (config.combat.naturalSixMinDamage ?? 0);
  if (natural6Boost) damage = config.combat.naturalSixMinDamage;
  return { roll, attackMod, typeMod, total, natural1, natural6Boost, damage, ...(hitPenalty ? { hitPenalty, burnMiss } : {}) };
}

function signed(n, label) {
  return n ? ` ${n > 0 ? '+' : ''}${n} ${label}` : '';
}

export function formatAttack(r) {
  if (r.natural1) return 'natural 1, miss';
  const nat6 = r.natural6Boost ? ' (natural 6 minimum)' : '';
  const burn = r.hitPenalty ? ` [burn: −${r.hitPenalty} to hit${r.burnMiss ? ' — miss' : ''}]` : ''; // COMBAT 2.2 only
  return `${r.roll}${signed(r.attackMod, 'atk')}${signed(r.typeMod, 'type')} = ${r.total} -> ${r.damage ? `${r.damage} damage` : 'miss'}${nat6}${burn}`;
}

// kind: 'player' for the current player's Pokémon attacking, 'system' for the
// opponent's counter-attack (who rolls the die — DQ-62).
// `extra`: more facts for the log entry (Phase 3A-2: `after: 'stay' | 'item'`
// for the opponent's response when the player did not attack).
// `mods` (bonus 2, signature moves): { bonus, label } a +N on the total · { reduce, guardLabel } N less damage (a guard).
export function performAttack(state, attackerInst, defenderInst, kind = 'system', extra = null, mods = null) {
  const attacker = getSpecies(attackerInst.species);
  const defender = getSpecies(defenderInst.species);
  let result;
  d6(state, `${attacker.name} attacks ${defender.name}`, (v) => {
    result = resolveAttack(v, attacker, defender, state.config, mods?.bonus ?? 0, mods?.missFaces ?? null, mods?.hitPenalty ?? 0);
    return formatAttack(result);
  }, kind);
  if (mods?.reduce && result.damage) result.damage = Math.max(0, result.damage - mods.reduce);
  defenderInst.hp = Math.max(0, defenderInst.hp - result.damage);
  // Structured result for the digital board: raw roll, modifiers, total, damage.
  const attack = {
    die: 'attack', kind, attacker: attacker.id, defender: defender.id, attackerUid: attackerInst.uid, defenderUid: defenderInst.uid, raw: result.roll,
    modifiers: [{ label: 'Attack', value: result.attackMod }, { label: 'Type', value: result.typeMod }, { label: mods?.label ?? 'Move', value: mods?.bonus ?? 0 }].filter((m) => m.value),
    ...(mods?.reduce ? { guarded: mods.reduce, guardLabel: mods.guardLabel } : {}),
    total: result.total, damage: result.damage, natural1: result.natural1, natural6Boost: result.natural6Boost,
    ...(mods?.missFaces?.includes(result.roll) && result.roll !== 1 ? { missFace: result.roll } : {}),
    ...(result.hitPenalty ? { burn: { penalty: result.hitPenalty, miss: result.burnMiss } } : {}), // COMBAT 2.2 (B2)
    hpAfter: defenderInst.hp, maxHp: defenderInst.maxHp,
    ...(extra ?? {}),
  };
  log(state, 'combat', `${defender.name} ❤ ${defenderInst.hp}/${defenderInst.maxHp}${defenderInst.hp === 0 ? ' — fainted!' : ''}`, { attack });
  return result;
}

export function currentOpponent(encounter) {
  if (!encounter) return null;
  return encounter.kind === 'wild' ? encounter.pokemon : encounter.trainer.pokemonTeam[encounter.index];
}

// COMBAT MVP (rules.combatMoves 'mvp1'): one attack with a move — the status check before it (sleep / paralysis),
// the move's name on the result, a Special's trick on a hit (a status, drain, guard), a Powerful's +2 / miss on 1–2.
// `slot`: 'basic' | 'special' | 'powerful' (a move this Pokémon knows and has not used in this battle — else basic).
// Returns the attack result, or null when a status kept it from attacking.
function strikeWithMove(state, attacker, defender, kind, slot = 'basic', more = null) {
  const enc = state.encounter;
  if (!statusLetsAttack(state, attacker)) return null;
  const m = slot === 'basic' ? null : moveAvailable(state, attacker, slot);
  const move = m ?? basicMoveOf(attacker.species);
  if (m) {
    markUsed(enc, attacker.uid, slot);
    log(state, 'combat', `✨ ${getSpecies(attacker.species).name} uses ${m.name}!`, { moveUse: { uid: attacker.uid, species: attacker.species, slot, move: m.id, pl: m.pl, kind } });
  }
  const guard = enc.guard?.[defender.uid] ?? 0; // a Special guard of the defender: the next attack on it −N
  if (guard) delete enc.guard[defender.uid];
  const extra = { move: { slot: m ? slot : 'basic', id: move.id, pl: move.pl }, ...(more ?? {}) };
  let hit;
  if (m?.effect.kind === 'fixed') {
    // no roll: exactly N hearts, types ignored
    const damage = Math.min(defender.hp, m.effect.amount);
    defender.hp -= damage;
    const attack = { die: 'attack', kind, attacker: attacker.species, defender: defender.species, attackerUid: attacker.uid, defenderUid: defender.uid, raw: null, fixed: true, modifiers: [], total: null, damage, natural1: false, natural6Boost: false, hpAfter: defender.hp, maxHp: defender.maxHp, ...extra };
    log(state, 'combat', `${getSpecies(defender.species).name} ❤ ${defender.hp}/${defender.maxHp}${defender.hp === 0 ? ' — fainted!' : ''}`, { attack });
    hit = { damage };
  } else {
    const penalty = hitPenaltyOf(state, attacker); // COMBAT 2.2: a burned attacker — harder to hit (never a move without a roll)
    const mods = { ...(attackMods(m) ?? {}), ...(guard ? { reduce: guard, guardLabel: 'Osłona' } : {}), ...(penalty ? { hitPenalty: penalty } : {}) };
    hit = performAttack(state, attacker, defender, kind, extra, Object.keys(mods).length ? mods : null);
  }
  if (m && hit.damage > 0 && defender.hp > 0) {
    if (m.effect.kind === 'status') tryStatus(state, defender, m.effect.status);
    if (m.effect.kind === 'drain') {
      const back = Math.min(hit.damage, attacker.maxHp - attacker.hp);
      attacker.hp += back;
      log(state, 'combat', `✨ ${getSpecies(attacker.species).name} drains ${back} HP.`, { moveUse: { uid: attacker.uid, species: attacker.species, slot, move: m.id, pl: m.pl, kind, drained: back } });
    }
  }
  if (m?.effect.kind === 'guard') (enc.guard ??= {})[attacker.uid] = m.effect.reduce;
  return hit;
}

function fightRoundMoves(state, slot) {
  const player = currentPlayer(state);
  const lead = getLead(player);
  const opponent = currentOpponent(state.encounter);
  state.encounter.freeSwitch = false;
  if (state.encounter.kind === 'wild') state.encounter.fights = (state.encounter.fights ?? 0) + 1;
  noteParticipant(state, lead.uid);
  const quick = consumeUnanswered(state, lead.uid);
  strikeWithMove(state, lead, opponent, 'player', slot);
  if (opponent.hp <= 0) {
    clearStatus(state, opponent, 'ko');
    opponentDefeated(state, opponent);
    onOpponentFainted(state);
    return;
  }
  if (quick) log(state, 'combat', `⚡ ${getSpecies(lead.species).name} was too quick — ${getSpecies(opponent.species).name} has no time to strike back.`, { firstStrike: { event: 'unanswered', uid: lead.uid } });
  else if (state.config.combat.opponentCounterattacks) {
    strikeWithMove(state, opponent, lead, 'system', opponentSlot(state, opponent, lead));
    if (lead.hp <= 0) {
      clearStatus(state, lead, 'ko');
      onLeadFainted(state, lead);
    }
  }
  endOfExchange(state, lead, opponent);
  if (state.encounter) escapeAfterRound(state, 'attack'); // wild temperament: a skittish Pokémon may run now
}

// The end of an exchange (Combat MVP): the status ticks. S1: in the arena's order, never the last heart. COMBAT 2.1
// (rules.statusRules 'c21', Piotr 16.10): a tick may knock out — the OPPONENT's first (the player's move put it there),
// then the lead's; each faint goes the battle's own way (opponentDefeated → onOpponentFainted: Growth, the next trainer
// Pokémon or the win, its reward, missions, gym / League / Team Rocket; onLeadFainted: the KO pick or the loss) — no
// second KO path, nothing after a faint, and the tick is part of the dispatch (a reload never repeats it).
// C21 (dev-1610-c21, frozen): when the opponent's tick ENDS the battle (a wild Pokémon, a trainer's last one, a gym /
// Team Rocket / League win) the lead's tick never comes — with a next trainer Pokémon it does (ChatGPT review 16.10, P1).
// COMBAT 2.1 b (rules.statusRules 'c21b' — statuses.js C21B.exchange) settles that: endOfExchange21b.
function endOfExchange(state, lead, opponent) {
  if (!state.encounter) return;
  if (!usesCombat21(state.config)) {
    statusEndOfRound(state, [lead, opponent]);
    return;
  }
  if (exchangeRule(state.config)) {
    endOfExchange21b(state, lead, opponent);
    return;
  }
  if (opponent && opponent.hp > 0 && statusTickOne(state, opponent)) {
    opponentDefeated(state, opponent);
    onOpponentFainted(state);
  }
  if (state.encounter && lead && lead.hp > 0 && statusTickOne(state, lead)) onLeadFainted(state, lead);
}

// COMBAT 2.1 b: BOTH ticks first (the opponent's, then the lead's — whoever is still standing really loses its hearts),
// then the faints, each the battle's own way, in the double-KO rule's order (`doubleKo`, Piotr to confirm):
//   'player'    the opponent's faint first (Growth, its next Pokémon or the win, the reward), then the lead's (the KO
//               pick, or — a trainer's next Pokémon still in — the loss). The lead's faint is noted BEFORE the win: it
//               earns no Growth from that opponent and „win without fainting” is broken.
//   'opponent'  the lead's faint first (the KO pick or the loss), then the opponent's while the battle is still on.
// One faint alone is the same in both. Never a counter-attack after a faint; a later battle (the League's next stage)
// never takes this one's faint (`state.encounter === enc`).
function endOfExchange21b(state, lead, opponent) {
  const enc = state.encounter;
  const oppKo = Boolean(opponent && opponent.hp > 0 && statusTickOne(state, opponent));
  const leadKo = Boolean(lead && lead.hp > 0 && statusTickOne(state, lead));
  if (!oppKo && !leadKo) return;
  if (leadKo && (!oppKo || exchangeRule(state.config).doubleKo === 'opponent')) {
    onLeadFainted(state, lead);
    if (oppKo && state.encounter === enc) {
      opponentDefeated(state, opponent);
      onOpponentFainted(state);
    }
    return;
  }
  if (leadKo) noteLeadFainted(state, lead);
  opponentDefeated(state, opponent);
  onOpponentFainted(state);
  if (leadKo && state.encounter === enc) onLeadFainted(state, lead, true);
}

// One exchange in the current wild or trainer encounter. `move` (bonus 2): the lead's signature move instead of Atakuj.
// `slot` (Combat MVP): 'special' / 'powerful' — a move the lead knows; otherwise its basic attack.
export function fightRound(state, move = null, slot = null) {
  if (usesCombatMoves(state.config)) return fightRoundMoves(state, slot ?? 'basic');
  const player = currentPlayer(state);
  const lead = getLead(player);
  const opponent = currentOpponent(state.encounter);
  state.encounter.freeSwitch = false;
  if (move) {
    (state.encounter.signatureUsed ??= []).push(lead.uid); // once per battle per Pokémon
    log(state, 'combat', `✨ ${getSpecies(lead.species).name} uses ${move.name}!`, { sigMove: { uid: lead.uid, move: move.id, species: lead.species } });
  }

  if (state.encounter.kind === 'wild') state.encounter.fights = (state.encounter.fights ?? 0) + 1;
  noteParticipant(state, lead.uid); // Growth games: the lead fights this opponent
  const quick = consumeUnanswered(state, lead.uid); // Build 3.3 ⚡: its first exchange gets no answer
  const hit = performAttack(state, lead, opponent, 'player', null, move?.effect.kind === 'attack' ? { bonus: move.effect.bonus, label: move.pl } : null);
  if (move?.effect.kind === 'drain' && hit.damage) {
    const back = Math.min(hit.damage, lead.maxHp - lead.hp);
    lead.hp += back;
    log(state, 'combat', `✨ ${getSpecies(lead.species).name} drains ${back} HP (❤ ${lead.hp}/${lead.maxHp}).`, { sigMove: { uid: lead.uid, move: move.id, drained: back } });
  }
  if (opponent.hp <= 0) {
    opponentDefeated(state, opponent);
    onOpponentFainted(state);
    return;
  }
  if (quick) log(state, 'combat', `⚡ ${getSpecies(lead.species).name} was too quick — ${getSpecies(opponent.species).name} has no time to strike back.`, { firstStrike: { event: 'unanswered', uid: lead.uid } });
  else if (state.config.combat.opponentCounterattacks) {
    performAttack(state, opponent, lead, 'system', null, move?.effect.kind === 'guard' ? { reduce: move.effect.reduce, guardLabel: move.pl } : null);
    if (lead.hp <= 0) onLeadFainted(state, lead);
  }
  escapeAfterRound(state, 'attack'); // wild temperament: a skittish Pokémon may run now
}

function onOpponentFainted(state) {
  const enc = state.encounter;
  const player = currentPlayer(state);
  if (enc.kind === 'wild') {
    log(state, 'encounter', `The wild ${getSpecies(enc.pokemon.species).name} fainted and can no longer be caught.`);
    endEncounter(state, 'wildFainted');
    return;
  }
  enc.index += 1;
  const next = enc.trainer.pokemonTeam[enc.index];
  if (next) {
    log(state, 'encounter', `${enc.trainer.owners?.[enc.index] ?? enc.trainer.name} sends out ${getSpecies(next.species).name}!`);
    return;
  }
  if (enc.kind === 'rocket') {
    rocketDefeated(state);
    return;
  }
  if (enc.kind === 'gym') {
    gymWon(state);
    return;
  }
  if (enc.kind === 'league') {
    leagueStageWon(state);
    return;
  }
  if (trainerPaysNothing(enc)) {
    // M02-2: an exhausted place — this trainer has battled the player here before
    log(state, 'encounter', `${player.name} defeated ${enc.trainer.name}! No prize money: the trainers here have battled ${player.name} too often (exhausted place).`, { fatigue: { noMoney: true, reward: enc.trainer.reward } });
    endEncounter(state, 'trainerWon');
    return;
  }
  const before = player.money;
  player.money += enc.trainer.reward;
  log(state, 'encounter', `${player.name} defeated ${enc.trainer.name}! Money ${before} → ${player.money} (+${enc.trainer.reward})`);
  trainerLoot(state, enc); // Build 3.3 E2 (rules.loot): a loot d6 — nothing in older games
  endEncounter(state, 'trainerWon');
}

// Switching Pokémon in battle (DQ-71), instead of attacking, in every kind of
// battle. A voluntary switch costs the exchange: the player does not attack and
// the opponent strikes the newcomer at once. Right after the lead fainted the
// player may pick the replacement for free (no extra attack). Never costs a
// map action.
export function canSwitchTo(state, player, uid) {
  const target = player.team.find((p) => p.uid === uid);
  return Boolean(state.encounter && target && target.hp > 0 && target !== getLead(player));
}

export function switchPokemon(state, uid) {
  const player = currentPlayer(state);
  const enc = state.encounter;
  const outgoing = getLead(player);
  const i = player.team.findIndex((p) => p.uid === uid);
  const [mon] = player.team.splice(i, 1);
  player.team.unshift(mon);
  if (outgoing) clearStatus(state, outgoing, 'switch'); // Combat MVP: a status stays in the arena
  const free = Boolean(enc.freeSwitch);
  enc.freeSwitch = false;
  log(state, 'combat', `🔄 ${player.name} switches to ${getSpecies(mon.species).name}${free ? ' (free: replacing a fainted Pokémon)' : ''}`, { switch: { to: mon.uid, species: mon.species, free } });
  if (free || !state.config.combat.opponentCounterattacks) return;
  // Build 3.3 ⚡: a quick newcomer (or the outgoing Pokémon's waiting advantage) — no strike. COMBAT 2.1 b
  // (`tickUnanswered`, PT009-A3): the exchange still ends — the statuses tick, as after an unanswered attack.
  if (switchUnanswered(state, outgoing, mon)) {
    if (exchangeRule(state.config)?.tickUnanswered) endOfExchange(state, mon, currentOpponent(enc));
    if (state.encounter) escapeAfterRound(state, 'switch');
    return;
  }
  noteParticipant(state, mon.uid); // Growth games: it came in and takes the opponent's hit
  const opp = currentOpponent(enc);
  if (usesCombatMoves(state.config)) strikeWithMove(state, opp, mon, 'system', 'basic');
  else performAttack(state, opp, mon, 'system');
  if (mon.hp <= 0) {
    clearStatus(state, mon, 'ko');
    onLeadFainted(state, mon);
  }
  endOfExchange(state, mon, opp);
  if (state.encounter) escapeAfterRound(state, 'switch'); // wild temperament: a skittish Pokémon may run now
}

// Phase 3A-2: the opponent's response when the player's exchange was not an
// attack — a wild Pokémon that stayed after a failed throw, or a battle item.
// Exactly one attack, on the current lead (which takes part in the fight for
// Growth); a faint goes the usual way (free replacement, or the battle ends).
export function opponentStrikes(state, why) {
  const lead = getLead(currentPlayer(state));
  if (!lead || !state.config.combat.opponentCounterattacks) return;
  if (why !== 'firstStrike' && consumeUnanswered(state, lead.uid)) {
    // Build 3.3 ⚡: the quick Pokémon's first exchange (an item, a stay) gets no answer
    log(state, 'combat', `⚡ ${getSpecies(lead.species).name} was too quick — ${getSpecies(currentOpponent(state.encounter).species).name} has no time to strike.`, { firstStrike: { event: 'unanswered', uid: lead.uid, after: why } });
    if (exchangeRule(state.config)?.tickUnanswered) endOfExchange(state, lead, currentOpponent(state.encounter)); // COMBAT 2.1 b (PT009-A3)
    return;
  }
  noteParticipant(state, lead.uid);
  const opp = currentOpponent(state.encounter);
  if (usesCombatMoves(state.config)) strikeWithMove(state, opp, lead, 'system', 'basic', { after: why });
  else performAttack(state, opp, lead, 'system', { after: why });
  if (lead.hp <= 0) {
    clearStatus(state, lead, 'ko');
    onLeadFainted(state, lead);
  }
  if (why !== 'firstStrike') endOfExchange(state, lead, opp);
}

// ---- battle items (Phase 3A-2, rules.battleItems, DQ-81) -----------------------
// Potion / Revive as the player's exchange, in every kind of battle: the item
// replaces the attack, then the opponent strikes the lead. Potion: any injured
// active-team Pokémon; Revive: a fainted one (the lead itself has always been
// replaced first — the next healthy Pokémon steps in). A revived Pokémon never
// takes over the lead by itself: the current lead stays in front.
//
// Gameplay P1 (rules.healingItems 'v2', DQ-91): Potion / Super Potion / Revive
// are free in battle — no exchange spent, no strike from the opponent, the
// player then makes the normal battle choice (a pending free replacement
// stays free). Each Pokémon can be healed once per battle, whatever the item
// (encounter.healed).
//
// Build 3.3 (rules.battleTempo 'v2', DQ-113, Piotr's decision B 13.10.2026):
// Potion / Super Potion / Revive cost the exchange again — the item replaces the
// attack and the opponent answers — with NO per-Pokémon limit: the same Pokémon
// may be healed again, each time with a real item and a counter-attack. Never a
// map action. The items are those of healingItems (Super Potion included).
export function freeBattleHealing(config) {
  return config.rules.healingItems === 'v2' && config.rules.battleTempo !== 'v2';
}

export function tempoBattleHealing(config) {
  return config.rules.battleTempo === 'v2';
}

export function healedThisBattle(state, uid) {
  return Boolean(state.encounter?.healed?.includes(uid));
}

export function useBattleItem(state, item, targetUid) {
  const player = currentPlayer(state);
  const target = player.team.find((p) => p.uid === targetUid);
  const lead = getLead(player);
  if (item === 'revive' && lead && player.team.indexOf(target) < player.team.indexOf(lead)) {
    player.team.splice(player.team.indexOf(lead), 1);
    player.team.unshift(lead);
  }
  // Combat MVP: a Potion cures the status — COMBAT 2.1: a Potion heals HP only (the cure items cure, itemEngine.useItem)
  if (['potion', 'superpotion'].includes(item) && !usesCombat21(state.config)) clearStatus(state, target, 'potion');
  if (freeBattleHealing(state.config)) {
    (state.encounter.healed ??= []).push(targetUid);
    useItem(state, item, targetUid, { battle: true, free: true });
    return;
  }
  state.encounter.freeSwitch = false;
  useItem(state, item, targetUid, { battle: true });
  opponentStrikes(state, 'item');
}

// ---- trainer retreat (Phase 3A-2, rules.trainerRetreat, DQ-82) ------------------
// Only from trainer battles (never gym, Team Rocket or the League). The price:
// 1 money if you have any; with no money, one consumable of your choice — a
// Poké Ball, Super Ball, Potion or Revive, but never your last ball; with
// nothing to give, you just go. No debt, no Pokémon lost; it ends the battle
// as a retreat (no reward, no mission progress), and the Growth of trainer
// Pokémon already defeated stays (growthEngine).
// The same list in every ruleset: the Super Potion (Gameplay P1) is not a
// retreat penalty (ChatGPT review 08.10 22:27 — DQ-91 did not extend DQ-82).
export const RETREAT_ITEMS = ['pokeball', 'superball', 'potion', 'revive', 'ultraball']; // E2: the Ultra Ball last (older games never hold one)

export function canRetreat(state) {
  return Boolean(state.config.rules.trainerRetreat) && state.encounter?.kind === 'trainer';
}

// The retreat actions on offer: [{ type: 'run' }] when it costs money or
// nothing, else one { type: 'run', item } per item that may be left behind.
export function retreatOptions(state, player) {
  if (!canRetreat(state)) return [];
  if (player.money > 0) return [{ type: 'run' }];
  const balls = ballCount(player);
  const items = RETREAT_ITEMS.filter((id) => itemCount(player, id) > 0 && (!BALL_IDS.includes(id) || balls > 1));
  return items.length ? items.map((item) => ({ type: 'run', item })) : [{ type: 'run' }];
}

export function retreat(state, item) {
  const player = currentPlayer(state);
  const enc = state.encounter;
  let penalty = 'none';
  if (player.money > 0) {
    player.money -= 1;
    penalty = 'money';
  } else if (item) {
    if (item === 'pokeball') player.pokeballs -= 1;
    else player.items[item] -= 1;
    penalty = item;
  }
  const paid = penalty === 'money' ? ' (−1 money)' : penalty === 'none' ? ' (nothing to leave behind)' : ` and leaves a ${item}`;
  log(state, 'encounter', `${player.name} retreats from ${enc.trainer.name}${paid}.`, { retreat: { penalty, trainer: enc.trainer.name, defeated: enc.index } });
  endEncounter(state, 'retreated');
}

// A lead's faint, noted in the battle (also before a COMBAT 2.1 b double-KO win — endOfExchange21b).
function noteLeadFainted(state, fainted) {
  state.encounter.playerFainted = true; // breaks "win without fainting" missions
  noteFainted(state, fainted.uid); // Gameplay P1: no Growth for this opponent for it (DQ-92)
}

function onLeadFainted(state, fainted, noted = false) {
  const player = currentPlayer(state);
  if (!noted) noteLeadFainted(state, fainted);
  const next = getLead(player);
  if (next) {
    // The next healthy Pokémon steps in; choosing another one instead is free.
    state.encounter.freeSwitch = true;
    // PLAYTEST_007 stage 2B (rules.koPick 'v1', Piotr): a human player PICKS who comes in — never chosen for them.
    // The battle waits on the pick (encounter.leadPick 'ko' → chooseLead, free, no answer); ⚡ entries settle after
    // it (initiativeEngine.settleEntries waits on leadPick). One healthy Pokémon left: nothing to pick. The AI: as before.
    if (state.config.rules.koPick === 'v1' && player.controller !== 'ai' && leadCandidates(player).length > 1) {
      state.encounter.leadPick = 'ko';
      log(state, 'combat', `${getSpecies(fainted.species).name} fainted! ${player.name} picks who comes in.`, { koPick: { event: 'open', fainted: fainted.uid } });
      return;
    }
    log(state, 'combat', `${getSpecies(fainted.species).name} fainted! ${getSpecies(next.species).name} steps in.`);
    return;
  }
  const enc = state.encounter;
  if (enc.kind === 'wild') {
    log(state, 'encounter', `All of ${player.name}'s Pokémon fainted. The wild ${getSpecies(enc.pokemon.species).name} wanders off.`);
    endEncounter(state, 'wildLost');
    return;
  }
  if (enc.kind === 'rocket') {
    rocketWins(state);
    return;
  }
  if (enc.kind === 'gym') {
    gymLost(state);
    return;
  }
  if (enc.kind === 'league') {
    leagueStageLost(state);
    return;
  }
  const penalty = Math.min(player.money, state.config.trainers.lossMoneyPenalty);
  player.money -= penalty;
  log(state, 'encounter', `All of ${player.name}'s Pokémon fainted. ${enc.trainer.name} wins${penalty ? ` (−${penalty} money)` : ''}.`);
  endEncounter(state, 'trainerLost');
}
