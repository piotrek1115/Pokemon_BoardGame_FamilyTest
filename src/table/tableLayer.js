// The Table Layer: cards placed on top of the board for every interaction —
// explore, wild encounters and every battle (trainer, Team Rocket, gym,
// League) card vs card with the DQ-71 switch, catching, the Rocket plot card
// and Meowth's loot, the Poké Stop tray, event cards, the League intermission
// and the final results. Pure HTML strings; all copy in Polish.
import { EVENTS_BY_ID } from '../data/events.js';
import { getSpecies } from '../data/pokemon.js';
import { BIOMES } from '../data/biomes.js';
import { GYMS_BY_ID, LEAGUE } from '../data/gyms.js';
import { getLocation } from '../data/locations.js';
import { getLegalActions, restHeal } from '../engine/turnEngine.js';
import { currentPlayer, getLead } from '../engine/gameState.js';
import { currentOpponent, damageForTotal, freeBattleHealing, healedThisBattle, moveOf, usesSignature } from '../engine/combatEngine.js';
import { catchDieChance, escapeColour, sureGreatBall, throwDie, vigilanceSteps } from '../engine/captureEngine.js';
import { usesTemperament } from '../engine/temperamentEngine.js';
import { TEMPERAMENT_PL, temperamentOf } from '../data/temperament.js';
import { chainOpponents, gymChallengeBlocker, gymHere, gymRewardItem, gymRow, gymTier, hasBadge, leagueBadges, leagueChallengeBlocker, leagueHere, leagueStageTeam, leagueStartStage, usesGymChain, usesLeagueChallenge } from '../engine/gymEngine.js';
import { activePlot, plotCard, rocketTeam } from '../engine/rocketEngine.js';
import { signatureSpecies } from '../engine/localPoolEngine.js';
import { usesFatigue } from '../engine/fatigueEngine.js';
import { pokeStopV2, price, sellPrice, sellableItems, shopChargesOnTransaction, shopStock } from '../engine/pokeStopEngine.js';
import { creditKey, growthOptions, growthRules, usesGrowth } from '../engine/growthEngine.js';
import { ITEMS } from '../data/items.js';
import { itemCount, itemTargets, usableItems } from '../engine/itemEngine.js';
import { canSwapQuests, questReward, questSwapUsedThisTurn } from '../engine/questEngine.js';
import { QUESTS_BY_ID } from '../data/quests.js';
import { HALL_OF_FAME } from '../engine/endgameEngine.js';
import { gymMatchups } from '../ui/gymPanel.js';
import { actAttr, esc } from '../ui/dom.js';
import { DEX_STATES, classDots, setClassTable, badgeCase, dexState, dexTile, itemIc, itemToken, missionCard, pokemonCard, REWARD_TOKEN_TYPES, rewardTokens, rocketPlotCard, speciesCard, superballSvg, trainerBadge, teamDot } from './cards.js';
import { attackTypeOf, dexSpecies } from '../data/pokemon.js';
import { typeHint } from './typeHint.js';
import { JOURNAL_SECTIONS, activityKind, encounterHint, hudCarousel, journal } from './journal.js';
import { artFrame, entryArt } from './worldArt.js';
import { basicMoveOf, knownMove, movesUsed, statusOf, statusProcFaces, statusRulesOf, usesCombat21, usesCombatMoves } from '../engine/combatMoves.js';
import { STATUS_DEFINITIONS, statusRules } from '../combat2/statuses.js';
import { ballSvg, gi, typeIcon } from './icons.js';
import { catchDieHtml, catchDieLabel, d6Html, escapeDieHtml, escapeDieLabel, pokeballSvg, renderPrompt, windSvg } from './dice.js';
import { ballOptions } from './flow.js';
import { BALL_PL, BIOME_PL, CATCH_DIE, ESCAPE_DIE, ITEM_PL, RARITY_PL, TYPE_PL, d6Purpose, turnsPl } from './i18n.js';
import { JOB_IDS, RESEARCH_REWARDS, atOakLab, usesOakJobs, usesOakKit, usesResearch } from '../engine/oakEngine.js';
import { rocketPlacesPl } from './board.js';
import { TOKENS, avatarToken, characterToken, gymTokenId, heroToken, leagueTokenId, opponentTokenId, playerToken, rocketTokenId } from './tokens.js';
import { hasFirstStrike } from '../engine/initiativeEngine.js';
import { DECIDED_BY_PL, GYM_NOTE_PL, HOF_PL, LEADER_PL, LEAGUE_STAGE_PL, bookStepPl, eventPl, itemUsePl, keyItemPl, placeName, plotPl, rewardPl, thingPl, trainerPl } from './content-pl.js';
import { sceneArtFor } from '../data/sceneArt.js';
import { tradeProblem } from '../engine/tradeEngine.js';
import { achievementPoints, achievementProgress, trophyList, trophyPoints } from '../engine/achievementEngine.js';
import { ACHIEVEMENTS_V3, ACHIEVEMENT_CATEGORIES_PL } from '../data/achievements.js';
import { bookQuest, objectiveProgress, objectiveTarget, rewardLines } from '../engine/questBookEngine.js';
// (Living Kanto 2.0: a Journal entry of a board card carries its definition — `e.def` — instead of a book quest id)

const btn = (action, label, cls = '', disabled = false) => `<button class="${cls}" ${actAttr(action)}${disabled ? ' disabled' : ''}>${label}</button>`;
const uiBtn = (cmd, label, cls = '', extra = '') => `<button class="${cls}" data-ui="${cmd}" ${extra}>${label}</button>`;

// NIGHTSHIFT 18.10: „Wymagane: 3 odznaki” / „8 odznak” (the League asks for 8 in a 'kanto8' game)
const badgesPl = (n) => (n === 1 ? 'odznaka' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'odznaki' : 'odznak');
const BLOCKER_PL = [
  [/first badge must come from another gym/, 'Najpierw zdobądź odznakę w innej sali — potem możesz tu wrócić.'],
  [/accepts a challenge from (\d+) badges on \(\S+ has (\d+)\)/, (m) => `Ten lider przyjmuje wyzwanie od ${m[1]} odznak (masz ${m[2]}).`], // NIGHTSHIFT 18.10: Giovanni
  [/Gym is closed right now/, 'Sala jest teraz zamknięta — wróć, gdy miasto znów będzie otwarte.'],
  [/asks for its trial first/, 'Najpierw próba sali — jej kroki są poniżej i w księdze zadań.'],
  [/League is closed right now/, 'Liga jest teraz zamknięta — wróć, gdy droga znów będzie otwarta.'],
  [/already have/, 'Masz już tę odznakę.'],
  [/one Gym Challenge per turn/, 'Tylko jedno wyzwanie sali na turę.'],
  [/one League Challenge per turn/, 'Tylko jedno wyzwanie Ligi na turę.'],
  [/fainted/, 'Wszystkie Pokémony zemdlały — najpierw ulecz drużynę.'],
  [/No action left/, 'Brak akcji w tej turze.'],
  [/Needs (\d+) badges \(has (\d+)\)/, (m) => `Potrzeba ${m[1]} odznak (masz ${m[2]}).`],
  [/already Champion/, 'Już jesteś Mistrzem.'],
];
export function blockerPl(text) {
  if (!text) return '';
  for (const [re, pl] of BLOCKER_PL) {
    const m = re.exec(text);
    if (m) return typeof pl === 'function' ? pl(m) : pl;
  }
  return text;
}

const leaderPl = (gym) => LEADER_PL[gym.leader] ?? gym.leader;

// ---- Build 3.3 B33-3: the chain of a gym / League v2 challenge ----------------
// One opponent of the chain (gymEngine.chainOpponents): its Polish name and token.
const chainName = (o) => (o.archetype ? trainerPl(o).name : o.leader ? leaderPl(GYMS_BY_ID[o.gymId]) : o.champion ? LEAGUE_STAGE_PL.lance : o.name);
const chainToken = (o, size) => characterToken(o.archetype ?? (o.leader ? gymTokenId(o.gymId) : leagueTokenId(o.name)), { size });
// The whole chain as tokens: beaten ones ticked, the current one marked — no numbers.
function chainStrip(view, c, stage = c.stage ?? -1) {
  const steps = chainOpponents(view, c).map((o, i) => `<span class="chain-step${i < stage ? ' done' : i === stage ? ' now' : ''}" title="${esc(chainName(o))}">${chainToken(o, 'xs')}${i < stage ? '<i>✓</i>' : ''}</span>`);
  return `<div class="chain-strip">${steps.join('<span class="chain-arrow">➜</span>')}</div>`;
}

// ---- combat pieces ----------------------------------------------------------

function modValue(mods, label) {
  return mods.find((m) => m.label === label)?.value ?? 0;
}
const signed = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');

// One attack as a line (Build 2.4, Piotr's form): the die with its bonus on it
// (ATK + type, „+1”), „= 5”, then the hearts it took in pink-red (💥 −1 ❤) or a
// miss. The parts of the bonus are in the tooltip.
export function attackRow(a0, { rolling = false, config = null } = {}) {
  const a = a0.guarded ? { ...a0, rawDamage: rawDamageOf(a0, config) } : a0;
  const atk = getSpecies(a.attacker).name;
  const def = getSpecies(a.defender).name;
  const atkMod = modValue(a.modifiers, 'Attack');
  const typeMod = modValue(a.modifiers, 'Type');
  // bonus 2 (rules.signatureMoves): a move's +N is its own tag („✨ +2 Piorun”); a shell's −N on the damage says so
  const move = a.modifiers.find((m) => m.label !== 'Attack' && m.label !== 'Type');
  // PLAYTEST_007 2C: the attack's strength on the die, the TYPE on its own chip — the card's form (typeHint.js)
  const typeChip = typeMod ? `<b class="type-chip ${typeMod > 0 ? 'good' : 'bad'}" title="przewaga typu">${gi(`type.${attackTypeOf(getSpecies(a.attacker))}`)} ${signed(typeMod)}</b>` : '';
  const die = d6Html(rolling ? null : a.raw, { small: true, rolling });
  // PT009-12: a shield that stopped the whole hit is not „a miss”
  const stopped = a.guarded && !a.damage && (a.rawDamage ?? 0) > 0;
  const result = a.damage > 0 ? `<b class="dmg">💥 −${a.damage} ❤</b>` : stopped ? '<b class="miss">🛡️ zatrzymany tarczą</b>' : '<b class="miss">💨 pudło</b>';
  const moveName = a.move ? ` · <b class="atk-move">${a.move.slot === 'powerful' ? '💥' : a.move.slot === 'special' ? '✨' : '⚔️'} ${esc(a.move.pl)}</b>` : ''; // Combat MVP
  if (a.fixed) return `<div class="atk-row${a.kind === 'player' ? ' mine' : ''}"><div class="atk-who">${esc(atk)} ➜ ${esc(def)}${moveName}</div><div class="atk-math"><span class="op">bez rzutu</span>${result}</div></div>`;
  return `
    <div class="atk-row${a.kind === 'player' ? ' mine' : ''}">
      <div class="atk-who">${esc(atk)} ➜ ${esc(def)}${moveName}</div>
      <div class="atk-math"><span class="die-wrap">${die}${!rolling && atkMod ? `<b class="die-bonus ${atkMod > 0 ? 'good' : 'bad'}" title="siła ataku ${signed(atkMod)}">${signed(atkMod)}</b>` : ''}</span>${!rolling ? typeChip : ''}${!rolling && move ? `<b class="die-bonus good" title="${esc(move.label)}">✨ ${signed(move.value)}</b>` : ''}${rolling ? '' : `<span class="op">=</span><b class="atk-total">${a.total}</b>${result}`}</div>
      ${!rolling && a.guarded ? `<div class="small muted guard-line">${guardLinePl(a, def)}</div>` : ''}
      ${!rolling && a.natural1 ? `<div class="small muted">${a.missFace ? `Potężny ruch pudłuje na 1–2 (${a.missFace}).` : 'Jedynka zawsze chybia.'}</div>` : ''}
      ${!rolling && a.natural6Boost ? '<div class="small muted">Szóstka zawsze trafia.</div>' : ''}
      ${!rolling && a.burn ? `<div class="small muted burn-line">♨️ Oparzenie: −${a.burn.penalty} tylko do trafienia — ${a.burn.miss ? 'tym razem pudło.' : 'trafił, obrażenia pełne.'}</div>` : ''}
    </div>`;
}

// PLAYTEST_009 (PT009-12): the shield in words — WHOSE it is (the defender's), what it did to THIS hit, that it is gone.
// `rawDamage` (the hit before the shield) is in the log since the night shift 15.10; an older entry says it without numbers.
// The hit before the shield, from the roll's own total (the log keeps the Combat MVP's data — nothing new is stored).
function rawDamageOf(a, config) {
  if (a.rawDamage !== undefined) return a.rawDamage;
  if (!config || a.fixed) return undefined;
  if (a.natural1) return 0;
  const d = damageForTotal(a.total, config);
  return a.natural6Boost ? Math.max(d, config.combat.naturalSixMinDamage ?? 0) : d;
}
function guardLinePl(a, def) {
  if (a.rawDamage === undefined) return `🛡️ Tarcza ${esc(def)}: ten cios −${a.guarded} ❤ mniej. Tarcza znika.`;
  if (a.rawDamage === 0) return `🛡️ Tarcza ${esc(def)} zużyta — cios i tak chybił.`;
  return `🛡️ Tarcza ${esc(def)}: cios ${a.rawDamage} ❤ − ${a.rawDamage - a.damage} = ${a.damage} ❤. Tarcza znika.`;
}

// The latest exchange of blows (kept by the controller from the last reveal). PLAYTEST_009 (PT009-14): the status
// moments of the exchange stay here too, in order — „Pidgeotto sparaliżowany — nie atakuje (rzut 2)” is a row of the
// exchange, not a note that flashes and is gone.
function lastExchange(ui, view = null) {
  const rows = ui.exchange ?? [];
  if (!rows.length) return '<div class="exchange empty"><span class="die-ghost">🎲</span></div>';
  return `<div class="exchange">${rows.map((a) => (a.type === 'statusRoll' || a.statusRow ? `<div class="atk-row st-row">${esc(a.text)}</div>` : attackRow(a, { config: view?.config ?? null }))).join('')}</div>`;
}

// PT009-13: a status check as a step — the die, the faces of THIS status (the engine's S1 numbers), what it did.
function statusFacesPl(st, config = null) {
  const R = config ? statusRulesOf(config) : statusRules('S1');
  if (st.faces && (st.event === 'applied' || st.event === 'procFailed')) return [[st.faces, 'stan wchodzi'], [[1, 2, 3, 4, 5, 6].filter((f) => !st.faces.includes(f)), 'bez stanu']]; // PT009-19: the status die
  if (st.id === 'burn' && R.burn.tick === 'roll') return [[R.burn.faces, `−${R.burn.amount} ❤`], [[1, 2, 3, 4, 5, 6].filter((f) => !R.burn.faces.includes(f)), 'bez straty']]; // COMBAT 2.1
  if (st.id === 'paralysis') return [[R.paralysis.blockFaces, 'nie atakuje'], [[1, 2, 3, 4, 5, 6].filter((f) => !R.paralysis.blockFaces.includes(f)), 'atakuje']];
  if (st.id === 'sleep') return [[R.sleep.wakeFaces, 'budzi się i atakuje'], [[1, 2, 3, 4, 5, 6].filter((f) => !R.sleep.wakeFaces.includes(f)), 'śpi']];
  if (st.id === 'poison' && R.poison.faces) return [[R.poison.faces, `−${R.poison.amount} ❤`], [[1, 2, 3, 4, 5, 6].filter((f) => !R.poison.faces.includes(f)), 'bez straty']];
  return [];
}
function statusRollStep(step, roll, config = null) {
  const def = STATUS_DEFINITIONS[step.id];
  const when = step.event === 'tick' ? 'po wymianie ciosów' : step.faces ? 'czy stan wchodzi' : 'przed atakiem'; // PT009-19
  const rows = statusFacesPl(step, config).map(([faces, what]) => `<span class="lr${!roll && faces.includes(step.roll) ? ' on' : ''}">${facesPl(faces)} → ${what}</span>`).join('');
  return `<div class="tray status-roll st-${step.id}"><div class="tray-title">${STATUS_ICON[step.id]} ${esc(def.pl)}: ${esc(step.name ?? getSpecies(step.species).name)} — rzut ${when}</div>${d6Html(roll ? null : step.roll, { rolling: roll })}<div class="lr-table">${rows}</div>${roll ? '' : `<div class="tray-result">${esc(step.text)}</div>`}</div>`;
}

function opponentLabel(enc, config) {
  if (enc.kind === 'wild') return 'Dziki Pokémon';
  // AUD-07: whose Pokémon it is by its species (Jessie's Ekans / Arbok, James's
  // Koffing / Weezing, Meowth) — never by its place in the team
  if (enc.kind === 'rocket') return TOKENS[rocketTokenId(enc.trainer.pokemonTeam[enc.index]?.species, config)]?.name ?? 'Team Rocket';
  if (enc.kind === 'league') return enc.v2 ? enc.trainer.name : LEAGUE.stages[enc.stage].trainers[enc.index] ?? LEAGUE.stages[enc.stage].trainers[0];
  if (enc.kind === 'gym' && enc.trainer.archetype) return trainerPl(enc.trainer).name; // B33-3: the gym's trainer
  if (enc.kind === 'trainer') return trainerPl(enc.trainer).name;
  return enc.trainer.owners?.[enc.index] ?? enc.trainer.name;
}

const RULES_PL = {
  wild: 'Możesz walczyć, rzucić ball, zmienić Pokémona albo uciec.',
  trainer: 'Z walki z trenerem nie można uciec ani łapać jego Pokémonów.',
  rocket: 'Z walki z Team Rocket nie można uciec. Przegrana: Meowth coś zabierze na kartę spisku.',
  gym: 'Bez ucieczki, balli i przedmiotów. Przegrana nic nie kosztuje.',
  league: 'Bez ucieczki i balli. Przedmioty tylko w przerwie między etapami.',
};
// Phase 3A-2 battle loop (rules.counterattackOnStay / battleItems / trainerRetreat).
// 3A-2.5: the dock shows the choices; the line keeps only the special rule.
const RULES_LOOP_PL = {
  wild: 'Uwaga: jeśli Pokémon wyrwie się z balla i zostanie — od razu kontratakuje.',
  trainer: 'Pokémonów trenera nie łapiesz. Wycofanie: −💰1 (bez pieniędzy — jeden przedmiot).',
  rocket: 'Bez ucieczki. Przegrana: Meowth zabierze coś na kartę spisku.',
  gym: 'Bez ucieczki i balli; Potion / Revive zamiast ataku. Przegrana nic nie kosztuje.',
  league: 'Bez ucieczki i balli; Potion / Revive zamiast ataku.',
};
// Gameplay P1 (DQ-91): healing in battle is free (no attack lost), once per Pokémon.
const RULES_P1_PL = {
  ...RULES_LOOP_PL,
  gym: 'Bez ucieczki i balli; leczenie nie zabiera ataku (raz na Pokémona). Przegrana nic nie kosztuje.',
  league: 'Bez ucieczki i balli; leczenie nie zabiera ataku (raz na Pokémona).',
};
// Build 3.3 (DQ-113): healing in battle is the exchange again — the opponent answers, no limit per Pokémon.
const RULES_TEMPO_PL = {
  ...RULES_LOOP_PL,
  gym: 'Bez ucieczki i balli; leczenie zamiast ataku — przeciwnik odpowiada. Przegrana nic nie kosztuje.',
  league: 'Bez ucieczki i balli; leczenie zamiast ataku — przeciwnik odpowiada.',
};
const rulesLine = (view, kind) => (freeBattleHealing(view.config) ? RULES_P1_PL : view.config.rules.battleTempo === 'v2' ? RULES_TEMPO_PL : view.config.rules.battleItems ? RULES_LOOP_PL : RULES_PL)[kind] ?? '';

function encounterHeader(view, enc) {
  if (enc.kind === 'wild') {
    const s = getSpecies(enc.pokemon.species);
    // Macro 02 M02-1: a signature species of this place says so (its home)
    const local = signatureSpecies(currentPlayer(view).location, view.config).includes(s.id);
    if (enc.legend) return `<span class="scene-tag wild">Legendarny Pokémon</span><h2>Legendarny ${esc(s.name)}!</h2><span class="tag">${RARITY_PL[s.rarity]}</span><span class="tag hunt">⚡ tylko Ultra Ball — nie pokonuj do zera!</span>`; // DEC-01 (pilot)
    return `<span class="scene-tag wild">Dziki Pokémon</span><h2>Dziki ${esc(s.name)}!</h2><span class="tag">${RARITY_PL[s.rarity]}</span>${enc.hunt ? '<span class="tag hunt">🎯 wyjątkowy — polowanie</span>' : ''}${enc.questEncounter ? '<span class="tag hunt">📜 wyprawa — złap go, nie pokonuj do zera!</span>' : ''}${enc.fishing ? '<span class="tag">🎣 na wędce</span>' : ''}${local ? `<span class="tag local">${gi('here')} tutejszy</span>` : ''}${tiredTag(enc)}`;
  }
  if (enc.kind === 'gym') {
    const gym = GYMS_BY_ID[enc.gymId];
    const chain = view.challenge ? chainStrip(view, view.challenge) : '';
    if (enc.trainer.archetype) return `<span class="scene-tag gym">Sala</span>${characterToken(enc.trainer.archetype, { size: 'm' })}<h2>${esc(trainerPl(enc.trainer).name)}</h2><span class="tag">trener sali ${esc(leaderPl(gym))}</span>${creditTag(view, enc)}${chain}`;
    return `<span class="scene-tag gym">Sala</span>${characterToken(gymTokenId(gym.id), { size: 'm' })}<h2>${esc(leaderPl(gym))} — ${esc(gym.badge)}</h2><span class="tag">poziom ${enc.tier}</span>${creditTag(view, enc)}${chain}`;
  }
  if (enc.kind === 'league' && enc.v2) {
    const member = LEAGUE.challengeV2[enc.stage];
    return `<span class="scene-tag league">Liga</span>${characterToken(opponentTokenId(enc, view.config), { size: 'm' })}<h2>${esc(member.champion ? LEAGUE_STAGE_PL.lance : `${LEAGUE_STAGE_PL.eliteFour}: ${member.trainer}`)}</h2>${creditTag(view, enc)}${view.challenge ? chainStrip(view, view.challenge) : ''}`;
  }
  if (enc.kind === 'league') {
    const stage = LEAGUE.stages[enc.stage];
    return `<span class="scene-tag league">Liga</span>${characterToken(opponentTokenId(enc, view.config), { size: 'm' })}<h2>${esc(LEAGUE_STAGE_PL[stage.id] ?? stage.name)}</h2><span class="tag">etap ${enc.stage + 1} z ${LEAGUE.stages.length}</span>`;
  }
  if (enc.kind === 'rocket') {
    const card = plotPl(activePlot(view)?.plotId ?? enc.plotId);
    const trio = enc.trainer.pokemonTeam.some((m) => m.species === view.config.rocket.meowth); // Build 3.3 M1: Meowth in every battle
    return `<span class="scene-tag rocket">Team Rocket</span><h2>${gi('rocket')} ${esc(card.title)}</h2><span class="tag">Jessie i James${trio ? ' + Meowth' : ''}</span>`;
  }
  return `<span class="scene-tag trainer">Trener</span>${trainerBadge(enc.trainer, { unpaid: (enc.fatigue ?? 0) >= 2 })}${tiredTag(enc)}`;
}

// Build 3.3 C1: this gym / League Pokémon was beaten in an earlier attempt — no training again.
function creditTag(view, enc) {
  const key = creditKey(view, enc);
  return key && currentPlayer(view).growthCredits?.includes(key) ? '<span class="tag tired lvl-1">już pokonany — bez treningu</span>' : '';
}

// M02-2: a battle of a searched place says what it does not give — no numbers.
function tiredTag(enc) {
  if (!enc.fatigue) return '';
  const what = enc.kind === 'trainer' && enc.fatigue >= 2 ? 'bez treningu i nagrody' : 'bez treningu';
  return `<span class="tag tired lvl-${enc.fatigue}">${gi('fatigue')}${enc.fatigue >= 2 ? gi('fatigue') : ''} ${what}</span>`;
}

// The opponent's team as small chips (P1.5b): who is next, who is beaten.
function rosterCards(enc) {
  // Build 2.5.1 (Piotr: „nie widać, jakie i ile Pokémonów ma trener”): every
  // Pokémon of the opponent as a token with its picture, name and HP — the one
  // fighting now highlighted, the defeated greyed out.
  if (enc.kind === 'wild') return '';
  const team = enc.trainer.pokemonTeam;
  const tokens = team.map((m, i) => `<span class="roster-mon${i === enc.index ? ' current' : ''}${m.hp === 0 ? ' down' : ''}">${teamDot(m)}<b>${esc(getSpecies(m.species).name)}</b></span>`).join('');
  const left = team.filter((m) => m.hp > 0).length;
  return `<div class="roster"><small class="roster-title">Drużyna przeciwnika: ${team.length} ${team.length === 1 ? 'Pokémon' : team.length < 5 ? 'Pokémony' : 'Pokémonów'}${left < team.length ? ` · zostało ${left}` : ''}</small><div class="roster-row">${tokens}</div></div>`;
}

function stepsText(n) {
  return n === 1 ? 'o 1 krok łatwiej' : `o ${n} kroki łatwiej`;
}

export function catchPrepPanel(view, ball, ui) {
  const opt = ballOptions(view).find((o) => o.ball === ball);
  const mon = view.encounter.pokemon;
  const s = getSpecies(mon.species);
  const die = opt.die;
  const zone = escapeColour(mon);
  const hpStep = die.steps.find((x) => x.label.endsWith('HP'));
  const ballStep = die.steps.find((x) => !x.label.endsWith('HP'));
  return `
    <div class="catch-prep">
      <h3>${ballSvg(ball, 30)} Rzut: ${BALL_PL[ball]}</h3>
      ${fullTeamNote(view)}
      <div class="prep-row"><span>Rzadkość</span><b>${RARITY_PL[s.rarity]}</b><span>kostka bazowa ${catchDieLabel(die.base)}</span></div>
      <div class="prep-row"><span>Pasek HP</span><b>${gi(`die.${zone}`)} ${mon.hp}/${mon.maxHp}</b><span>${hpStep ? stepsText(hpStep.steps) : 'bez zmian'}</span></div>
      <div class="prep-row"><span>Ball</span><b>${BALL_PL[ball]}</b><span>${ballStep ? (opt.noBonus ? 'bez dodatkowego bonusu' : stepsText(ballStep.steps)) : 'bez zmian'}</span></div>
      ${die.legend ? '<div class="prep-row"><span>Legenda</span><b>⚡</b><span>o 1 krok trudniej</span></div>' : ''}
      ${sureGreatBall(mon, ball, view.config, view.encounter) ? '<div class="prep-final"><b>✓ Pewne złapanie</b><span>łatwy Pokémon — bez rzutu kością</span></div>' : `<div class="prep-final">
        <span>Kostka łapania</span>
        ${catchDieHtml(die.colour)}
        <b>${catchDieLabel(die.colour, { reroll: die.rerolls > 0 })}</b>
        ${ui.showOdds ? `<span class="odds">${Math.round(catchDieChance(die) * 100)}%</span>` : ''}
      </div>`}
      ${opt.note ? `<p class="note">${esc(opt.note)}</p>` : ''}
      <div class="row center">
        <button class="primary big" data-ui="throw" data-ball="${ball}">🎯 Rzucaj!</button>
        ${uiBtn('cancel-catch', 'Anuluj', 'ghost')}
      </div>
    </div>`;
}

// A battle item's button: a Potion's hearts, a Revive, a cure's status (COMBAT 2.1)
// PLAYTEST_012 01: and what it does NOT do (a cure no hearts; a Potion on a Pokémon with a status: the status stays)
function itemUseLabel(view, item, mon = null) {
  if (item === 'revive') return `${itemIc(item)} Revive <small>${(view.config.items.revive?.hpFraction ?? 1) >= 1 ? 'pełne' : 'część'} ❤</small>`;
  if (ITEMS[item]?.kind === 'cure') return `${itemIc(item)} ${ITEM_PL[item]} <small>usuwa: ${ITEMS[item].cures.map((id) => STATUS_SHORT[id]).join(', ')} · bez ❤</small>`;
  return `${itemIc(item)} ${ITEM_PL[item]} +${view.config.items[item].heal} ❤${mon && statusOn(view, mon).status ? ' <small>stan zostaje</small>' : ''}`;
}
function freeItemPicker(view, player) {
  const options = getLegalActions(view).filter((a) => a.type === 'useItem');
  const label = (a) => itemUseLabel(view, a.item, player.team.find((m) => m.uid === a.target));
  // Every Pokémon an item could help, the ones already healed in this battle greyed out with the reason.
  const mons = player.team.filter((m) => usableItems(view.config).some((id) => itemTargets(player, id, view).includes(m)));
  const cards = mons.map((mon) => {
    const done = healedThisBattle(view, mon.uid);
    const btns = options.filter((a) => a.target === mon.uid).map((a) => btn(a, label(a), 'primary')).join('');
    return `<div class="pick${done ? ' done' : ''}">${pokemonCard(mon, { size: 's', growth: growthRules(view), family: true, ...statusOn(view, mon) })}${done ? '<p class="act-note">Ten Pokémon był już leczony w tej walce.</p>' : btns}</div>`;
  }).join('');
  return `
    <div class="switch-panel">
      <h3>${gi('heal')} Leczenie — bez straty ataku</h3>
      <p class="small">Potem walczysz dalej jak zwykle. Każdy Pokémon: jedno leczenie na walkę.</p>
      <div class="pick-row">${cards}</div>
      <div class="row center">${uiBtn('items-close', 'Anuluj', 'ghost')}</div>
    </div>`;
}

// DQ-71: pick the Pokémon to switch in (Team Pokémon Cards).
export function switchPicker(view, free) {
  const player = currentPlayer(view);
  const options = getLegalActions(view).filter((a) => a.type === 'switchPokemon');
  const cards = options.map((a) => {
    const mon = player.team.find((m) => m.uid === a.target);
    return `<div class="pick">${pokemonCard(mon, { size: 's', growth: growthRules(view), family: true, ...statusOn(view, mon) })}${matchupBadges(view, mon)}${btn(a, '🔄 Do walki!', 'primary')}</div>`;
  }).join('');
  return `
    <div class="switch-panel">
      <h3>${free ? '🔄 Darmowa zmiana' : '🔄 Zmiana Pokémona'}</h3>
      <p class="switch-rule ${free ? 'free' : 'costly'}">${free ? 'Twój Pokémon zemdlał — możesz wybrać innego. <b>Przeciwnik nie atakuje.</b>' : 'Zamiast ataku. <b>Przeciwnik zaatakuje nowego Pokémona</b> od razu po zmianie.'}</p>
      <div class="pick-row">${cards}</div>
      <div class="row center">${uiBtn('switch-close', 'Anuluj', 'ghost')}</div>
    </div>`;
}

// Phase 3A-2: Potion / Revive instead of attacking (the opponent then strikes).
// Gameplay P1 (DQ-91): healing is free and the battle goes on — once per Pokémon.
export function itemPicker(view) {
  const player = currentPlayer(view);
  if (freeBattleHealing(view.config)) return freeItemPicker(view, player);
  const options = getLegalActions(view).filter((a) => a.type === 'useItem');
  const cards = options.map((a) => {
    const mon = player.team.find((m) => m.uid === a.target);
    const label = itemUseLabel(view, a.item, mon); // Build 3.3: the Super Potion too; COMBAT 2.1: the cures
    return `<div class="pick">${pokemonCard(mon, { size: 's', growth: growthRules(view), family: true, ...statusOn(view, mon) })}${btn(a, label, 'primary')}</div>`;
  }).join('');
  return `
    <div class="switch-panel">
      <h3>🎒 Przedmiot zamiast ataku</h3>
      <p class="small">Potem przeciwnik zaatakuje Twojego prowadzącego.</p>
      <div class="pick-row">${cards}</div>
      <div class="row center">${uiBtn('items-close', 'Anuluj', 'ghost')}</div>
    </div>`;
}

// Leaving a battle always asks first (Macro 01, after the family playtest: a
// child's accidental „Uciekaj” lost the encounter). UI only — nothing is stored
// until „TAK”: the run action itself is the confirmation. A wild Pokémon: run;
// a trainer (3A-2): retreat for its price — with no money the player picks
// the item to leave, each item being its own „TAK”.
export function retreatPicker(view) {
  const runs = getLegalActions(view).filter((a) => a.type === 'run');
  const back = uiBtn('retreat-close', 'WRÓĆ DO WALKI', 'ghost big');
  if (view.encounter.kind === 'wild') {
    return `
    <div class="switch-panel leave-confirm" data-confirm="run">
      <h3>🏃 UCIEC Z WALKI?</h3>
      <p>Jeśli uciekniesz, ta walka się zakończy.</p>
      <div class="row center">${back}${btn(runs[0], 'TAK, UCIEKAM', 'primary big')}</div>
    </div>`;
  }
  const items = runs.filter((a) => a.item);
  if (items.length > 1) {
    const buttons = items.map((a) => `<button class="tray-item" ${actAttr(a)}><span class="tray-token">${itemToken(a.item, 48)}</span><b>${ITEM_PL[a.item]}</b><small>masz ${itemCount(currentPlayer(view), a.item)}</small></button>`).join('');
    return `
    <div class="switch-panel leave-confirm" data-confirm="retreat">
      <h3>🏃 WYCOFAĆ SIĘ Z WALKI?</h3>
      <p class="small">Jeśli się wycofasz, ta walka się zakończy. Bez pieniędzy kosztuje to jeden przedmiot — dotknij, który zostawiasz trenerowi. Ostatni ball zawsze zostaje u Ciebie.</p>
      <div class="shop-row">${buttons}</div>
      <div class="row center">${back}</div>
    </div>`;
  }
  const a = runs[0];
  const cost = a.item ? `Zostawiasz trenerowi: <b>${ITEM_PL[a.item]}</b>.` : currentPlayer(view).money > 0 ? 'Kosztuje: <b>💰 1</b>.' : 'Bez kary.';
  return `
    <div class="switch-panel leave-confirm" data-confirm="retreat">
      <h3>🏃 WYCOFAĆ SIĘ Z WALKI?</h3>
      <p>Jeśli się wycofasz, ta walka się zakończy. ${cost}</p>
      <div class="row center">${back}${btn(a, 'TAK, WYCOFUJĘ SIĘ', 'primary big')}</div>
    </div>`;
}

// The flee / retreat control: a wild Pokémon — run; a trainer (3A-2) — retreat
// for its price (a picker when several items could be left); else not offered.
// A battle choice (P1.5b): icon + short label (+ what it costs / means).
const slot = (icon, label, sub = '') => `<span class="ds-icon">${icon}</span><span class="ds-label">${label}</span>${sub ? `<small>${sub}</small>` : ''}`;

function runControl(view, legal) {
  const runs = legal.filter((a) => a.type === 'run');
  const trainer = view.encounter.kind !== 'wild';
  if (!runs.length) return trainer ? '' : `<button class="act-run" disabled>${slot('🏃', 'Uciekaj')}</button>`;
  // Macro 01: every way out asks first (retreatPicker).
  if (!trainer) return uiBtn('retreat-open', slot('🏃', 'Uciekaj'), 'act-run ghost');
  if (runs.length > 1) return uiBtn('retreat-open', slot('🏃', 'Wycofaj się', 'zostaw przedmiot'), 'act-run ghost');
  const a = runs[0];
  const price = a.item ? `zostaw: ${ITEM_PL[a.item]}` : currentPlayer(view).money > 0 ? '−💰1' : 'bez kary';
  return uiBtn('retreat-open', slot('🏃', 'Wycofaj się', price), 'act-run ghost');
}

// The balls (Build 2.4, Piotr's form): each ball on a tile coloured like the
// Catch Die it rolls (blue / purple / magenta), how many, and the die's ball
// faces of six (3/6 — the P1 preview, nothing more); tap to throw or drag onto
// the wild Pokémon.
function ballRow(view, canAct) {
  const symbolic = view.config.capture.system !== 'classic';
  const legend = view.encounter?.legend; // DEC-01 (pilot): a legend — the Ultra Ball only
  const opts = ballOptions(view).filter((o) => (legend ? o.ball === 'ultraball' && o.count > 0 : o.ball !== 'ultraball' || o.count > 0)); // E2: the Ultra Ball tile only when you have one
  if (legend && !opts.length) return `<div class="act-note wary">⚡ Legendę łapie tylko Ultra Ball — nie masz żadnego. Możesz uciec: ${esc(getSpecies(legend).name)} tutaj poczeka.</div>`;
  if (!opts.length) return '';
  const taps = opts.map((o) => {
    const ok = o.usable && canAct && o.count > 0;
    // the die THIS ball rolls (ballOptions → throwDie, the throw's own function)
    const die = symbolic ? o.die : null;
    const reroll = die?.rerolls ? `<small class="reroll-tag" title="+ przerzut">${gi('reroll')}</small>` : '';
    // the count, then how good the die is now: its ball faces of six (the die the throw rolls)
    return `<button class="ball-tile${ok ? '' : ' muted'}${die ? ` c-${die.colour}` : ''}" data-ui="catch" data-ball="${o.ball}"${ok ? ` data-drag-ball="${o.ball}"` : ' disabled'} title="${esc(o.note || o.name)}${die ? ` — kostka ${CATCH_DIE[die.colour].name.toLowerCase()}${die.rerolls ? ' + przerzut' : ''}` : ''}" aria-label="${esc(o.name)}: ${o.count}${die ? `, szansa ${die.successFaces} z 6${die.rerolls ? ' i przerzut' : ''}` : ''}">${ballSvg(o.ball, 36)}<b class="count">×${o.count}</b>${die ? `<small class="odds">${die.successFaces}/6</small>${reroll}` : ''}</button>`;
  }).join('');
  // Gameplay P1 (DQ-93): warier Pokémon here — said before the throw, never hidden.
  // M02-2: in a game with fatigue the harder die is the searched place's (no Vigilance)
  const wary = !vigilanceSteps(view) ? ''
    : usesFatigue(view.config) ? `<div class="act-note wary tired">${gi('fatigue')} Pokémony tutaj już Cię znają — trudniej je złapać</div>`
      : `<div class="act-note wary">${gi('vigilant')} Czujne Pokémony — po złapaniu tutaj kostka łapania jest trudniejsza</div>`;
  return `${fullTeamNote(view)}${wary}<div class="ball-row">${taps}</div>`;
}

// Wild-encounter slice (A): a full team never blocks the Ball — it is said
// before the throw what a catch will lead to (Professor Oak's choice).
export function fullTeamNote(view) {
  const player = currentPlayer(view);
  if (!view.config.rules.oakBox || player.team.length < view.config.maxTeamSize) return '';
  return `<div class="act-note full-team">${gi('team.full')} <span><b>DRUŻYNA PEŁNA ${player.team.length}/${view.config.maxTeamSize}</b> Jeśli złapiesz tego Pokémona, wybierzesz, kogo wysłać do Profesora Oaka.</span></div>`;
}

// Wild-encounter slice (B + C), under the wild Pokémon's card: its temperament
// in two words, and the Catch Die a Poké Ball rolls NOW (HP, rarity, Vigilance —
// throwDie, the throw's own function), with the reroll when there is one.
export function wildInfo(view) {
  const enc = view.encounter;
  if (enc?.kind !== 'wild') return '';
  const temper = usesTemperament(view) ? temperamentOf(enc.pokemon.species) : null;
  const t = temper ? `<div class="temper t-${temper}">${gi(`temperament.${temper}`)}<b>${TEMPERAMENT_PL[temper].name}</b><small>${TEMPERAMENT_PL[temper].rule}</small></div>` : '';
  if (view.config.capture.system === 'classic') return t ? `<div class="wild-info">${t}</div>` : '';
  const base = enc.legend ? 'ultraball' : 'pokeball'; // DEC-01 (pilot): a legend — the Ultra Ball's die
  const die = throwDie(view, base);
  // AUD-08 (16.10): while a ball is dragged, this chip shows THAT ball's die (main.js reads these: colour|faces|rerolls)
  const odds = ['pokeball', 'superball', 'ultraball'].map((b) => {
    const d = throwDie(view, b);
    return ` data-odds-${b}="${d.colour}|${d.successFaces}|${d.rerolls ? 1 : 0}"`;
  }).join('');
  const now = `<div class="catch-now c-${die.colour}"${odds} aria-label="Złapanie ${enc.legend ? 'Ultra Ballem' : 'Poké Ballem'} teraz: kostka ${CATCH_DIE[die.colour].name.toLowerCase()}, ${die.successFaces} z 6${die.rerolls ? ' i przerzut' : ''}">
      <small>ZŁAPANIE</small><span class="cn-die">${die.successFaces}/6</span><span class="cn-reroll"${die.rerolls ? '' : ' style="display:none"'}>${gi('reroll')} + PRZERZUT</span></div>`;
  return `<div class="wild-info">${t}${now}</div>`;
}

// Bonus 2, 14.10 (rules.signatureMoves): the line's move next to Atakuj — „✨ Piorun”; used → „użyty”; Płomień
// before half its hearts → „od ½ ❤”. Nothing when the rule is off or the line has no move.
function moveButton(view, mon, action, used = []) {
  const move = usesSignature(view.config) ? moveOf(mon) : null;
  if (!move) return '';
  if (action) return btn(action, `✨ ${esc(move.pl)}`, 'act-move', false).replace('<button', `<button title="${esc(move.text)}"`);
  const why = (used ?? []).includes(mon.uid) ? 'użyty' : move.effect.when === 'hpHalfOrLess' ? 'od ½ ❤' : '';
  return `<button class="act-move" disabled title="${esc(move.text)}">✨ ${esc(move.pl)}${why ? ` <small>${why}</small>` : ''}</button>`;
}

// Combat MVP (rules.combatMoves 'mvp1'): the lead's moves next to its basic attack — only the moves THIS Pokémon knows;
// a used one says so; one short line of what it does. PLAYTEST_009 (PT009-11 / 12): plain words — „raz na walkę”, not
// „1×”; a guard is „atak + 🛡️ tarcza” (it still hits — today's rule), never the cryptic „osłona −1”.
const STATUS_SHORT = { poison: 'trucizna', burn: 'oparzenie', paralysis: 'paraliż', sleep: 'sen' };
// PT009-19 (rules.statusProc, OFF in every set): a status move also needs its status die — said with its faces.
const procPl = (config, long) => {
  const f = config ? statusProcFaces(config) : null;
  return f ? (long ? ` i kostka stanu pokaże ${facesPl(f)}` : ` + 🎲 ${facesPl(f)}`) : '';
};
// The whole sentence (the legend, the button's tooltip): what the move does, when, for how long.
function moveLegendPl(m, config = null) {
  if (m.slot === 'powerful') return 'Potężny ruch: atak +2 do sumy, ale na kostce 1 lub 2 — pudło. Raz na walkę.';
  const e = m.effect;
  const once = ' Raz na walkę.';
  switch (e.kind) {
    case 'status': return `Ruch specjalny: zwykły atak; gdy trafi (zabierze choć 1 ❤)${procPl(config, true)} — ${STATUS_ICON[e.status]} ${STATUS_DEFINITIONS[e.status].pl} na przeciwniku.${once}`;
    case 'drain': return `Ruch specjalny: zwykły atak; ile ❤ zabierze, tyle odzyskuje (do pełna).${once}`;
    case 'guard': return `Ruch specjalny: zwykły atak (zadaje obrażenia jak ⚔️) + 🛡️ tarcza na TWOIM Pokémonie: następny cios przeciwnika w niego zada ${e.reduce} ❤ mniej. Tarcza znika po tym jednym ciosie (także gdy chybi).${once}`;
    case 'boost': return `Ruch specjalny: zwykły atak +${e.bonus} do sumy.${once}`;
    case 'fixed': return `Ruch specjalny: bez rzutu, zawsze zabiera ${e.amount} ❤ (typy się nie liczą).${once}`;
    default: return once.trim();
  }
}
// PLAYTEST_010 (PT010-02, Piotr: „gdy trafi + 🎲 3–6: paraliż · raz na walkę” could not be read): one thing per line —
// WHAT it does · WHEN (does it need a hit, an extra die, on which faces) — then „Użycia: 0/1” („1/1” once used). This
// game's numbers: the status die only in a set that has it (statusProcFaces); the effect is the move's own.
const STATUS_CHANCE_PL = { poison: 'zatrucie', burn: 'oparzenie', paralysis: 'paraliż', sleep: 'sen' };
export function moveLinesPl(m, config = null) {
  if (m.slot === 'powerful') return ['💥 Mocniejszy atak: +2 do sumy', '🎲 Pudło, gdy na kostce 1–2'];
  const e = m.effect;
  const faces = config ? statusProcFaces(config) : null;
  switch (e.kind) {
    case 'status': return faces
      ? [`${STATUS_ICON[e.status]} Szansa na ${STATUS_CHANCE_PL[e.status]}`, `🎲 Po trafieniu: ${facesPl(faces)}`]
      : [`${STATUS_ICON[e.status]} ${STATUS_DEFINITIONS[e.status].pl} przeciwnika`, 'Po trafieniu — bez rzutu'];
    case 'drain': return ['❤ Odzyskuje tyle ❤, ile zada', 'Po trafieniu'];
    case 'guard': return [`🛡️ Tarcza: następny cios −${e.reduce} ❤`, 'Zwykły atak + tarcza'];
    case 'boost': return [`⚔️ Mocniejszy atak: +${e.bonus} do sumy`, 'Zwykły rzut ataku'];
    case 'fixed': return [`Zawsze zabiera ${e.amount} ❤`, 'Bez rzutu — trafia zawsze'];
    default: return [];
  }
}
function combatMoveButtons(view, lead, legal) {
  if (!lead) return '';
  return ['special', 'powerful'].map((slot) => {
    const m = knownMove(lead, slot);
    if (!m) return '';
    const action = legal.find((a) => a.type === 'fight' && a.slot === slot);
    // „used” is what the battle recorded — never just „not clickable now” (the dice rolling, the AI's turn)
    const used = movesUsed(view.encounter, lead.uid).includes(slot);
    const label = `<span class="mv-name">${slot === 'powerful' ? '💥' : '✨'} ${esc(m.pl)}</span>${moveLinesPl(m, view.config).map((l) => `<small class="mv-line">${esc(l)}</small>`).join('')}<small class="mv-uses">Użycia: ${used ? 1 : 0}/1</small>`;
    return action ? btn(action, label, `act-move m-${slot}`, false).replace('<button', `<button title="${esc(moveLegendPl(m, view.config))}"`) : `<button class="act-move m-${slot}" disabled title="${esc(moveLegendPl(m, view.config))}">${label}</button>`;
  }).join('');
}
// PLAYTEST_009 (PT009-17): under the opponent's card — how many extra moves THIS Pokémon knows (its own instance: decided
// when it was created, never re-rolled — a caught one keeps exactly these). Names only when ⚙️ „Pokazuj nazwy
// dodatkowych ataków przeciwnika” is on, or once it has used the move (it was seen); else „???”. 0 extra moves → nothing.
// Never the species' list of possible moves.
function foeMovesRow(view, opp, ui) {
  if (!opp || !usesCombatMoves(view.config) || !opp.moves) return '';
  const used = movesUsed(view.encounter, opp.uid);
  const slots = ['special', 'powerful'].filter((slot) => opp.moves[slot]);
  if (!slots.length) return '';
  const chip = (slot) => {
    const m = knownMove(opp, slot);
    const named = ui.foeMoveNames === true || used.includes(slot);
    return `<span class="foe-move m-${slot}" title="${named ? esc(moveLegendPl(m, view.config)) : 'Ten Pokémon zna dodatkowy ruch — jaki, zobaczysz, gdy go użyje.'}">${slot === 'powerful' ? '💥' : '✨'} ${named ? esc(m.pl) : '???'}${used.includes(slot) ? ' <small>użyty</small>' : ''}</span>`;
  };
  return `<div class="foe-moves" aria-label="Dodatkowe ruchy przeciwnika: ${slots.length}"><small>Zna też:</small>${slots.map(chip).join('')}</div>`;
}

// PT009-12: a Pokémon whose shield waits for the next hit wears it on its card — whose defence it is, until when.
function guardChip(view, mon) {
  const n = mon && usesCombatMoves(view.config) ? view.encounter?.guard?.[mon.uid] ?? 0 : 0;
  return n ? `<span class="st-chip st-guard" title="Następny cios w tego Pokémona zada ${n} ❤ mniej. Tarcza znika po tym ciosie (także gdy chybi).">🛡️ Tarcza −${n}</span>` : '';
}

// PLAYTEST_009 (PT009-10): „❓ Legenda” in EVERY battle — the dice and the numbers of THIS game (config), the lead's own
// moves (what THIS Pokémon knows; the opponent's unknown moves are never revealed here), the statuses with their dice
// (the engine's S1 numbers), the shield, „raz na walkę”. Read-only: it changes nothing.
const facesPl = (faces) => (faces.length > 1 && faces.at(-1) - faces[0] === faces.length - 1 ? `${faces[0]}–${faces.at(-1)}` : faces.join(', '));
function damageTablePl(config) {
  const rows = [...config.combat.damageThresholds].sort((a, b) => a.atLeast - b.atLeast);
  const parts = rows.map((r, i) => `${rows[i + 1] ? `${r.atLeast}–${rows[i + 1].atLeast - 1}` : `${r.atLeast} i więcej`} → −${r.damage} ❤`);
  return `${rows[0].atLeast > 1 ? `do ${rows[0].atLeast - 1} → pudło · ` : ''}${parts.join(' · ')}`;
}
function legendPanel(view, lead) {
  const cfg = view.config;
  const moves = usesCombatMoves(cfg);
  const ex = cfg.combat.damageThresholds.find((r) => r.damage === 1) ?? cfg.combat.damageThresholds.at(-1);
  const own = lead && moves ? ['special', 'powerful'].map((slot) => knownMove(lead, slot)).filter(Boolean) : [];
  const leadName = lead ? getSpecies(lead.species).name : 'Twój Pokémon';
  const c21 = usesCombat21(cfg); // COMBAT 2.1: a status may knock out; poison stays; burn rolls; the cures
  const status = moves ? `<h4>${c21 ? 'Stany' : 'Stany (tylko w tej walce)'}</h4><ul class="legend-list">
      ${['poison', 'burn', 'paralysis', 'sleep'].map((id) => `<li>${STATUS_ICON[id]} <b>${STATUS_DEFINITIONS[id].pl}</b> — ${esc(statusRuleText(cfg, id))}</li>`).join('')}
    </ul><p class="small">${c21
      ? (statusProcFaces(cfg) ? `Stan wchodzi tylko wtedy, gdy ruch TRAFI (zabierze choć 1 ❤) i kostka stanu pokaże ${facesPl(statusProcFaces(cfg))}. Pokémon ma najwyżej jeden stan.` : 'Stan wchodzi tylko wtedy, gdy ruch TRAFI (zabierze choć 1 ❤). Pokémon ma najwyżej jeden stan.') + (statusRulesOf(cfg).sleep.blocked !== undefined
        ? ' Trucizna i oparzenie MOGĄ znokautować. Każdy stan zostaje na Pokémonie — także po zmianie i po walce — aż do leku, Poké Stopu albo omdlenia. Mikstura leczy tylko ❤ — na stany są leki: Antidote (trucizna), Burn Heal (oparzenie), Paralyze Heal (paraliż), Awakening (sen), Full Heal (każdy).' // COMBAT 2.2
        : ' Trucizna i oparzenie MOGĄ znokautować. Trucizna zostaje na Pokémonie — także po zmianie i po walce; inne stany znikają po zmianie Pokémona, omdleniu i po walce. Mikstura leczy tylko ❤ — na stany są leki: Antidote (trucizna), Burn Heal (oparzenie), Paralyze Heal (paraliż), Awakening (sen), Full Heal (każdy).')
      : 'Stan wchodzi tylko wtedy, gdy ruch TRAFI (zabierze choć 1 ❤). Pokémon ma najwyżej jeden stan. Stan nigdy nie zabiera ostatniego ❤. Znika po zmianie Pokémona, omdleniu, Miksturze i po walce.'}</p>
    <h4>🛡️ Tarcza</h4><p class="small">Np. Utwardzenie: to zwykły atak (zadaje ❤) i do tego tarcza na Twoim Pokémonie — następny cios przeciwnika w niego zada 1 ❤ mniej. Tarcza znika po tym jednym ciosie, także gdy chybi. Kto ma tarczę, ma na karcie znaczek 🛡️.</p>` : '';
  return `
    <div class="legend-panel">
      <h3>❓ Legenda walki</h3>
      <h4>⚔️ Atak — zawsze</h4>
      <p class="small">Rzuć kostką i dodaj siłę ataku (np. +1) oraz typ (przewaga ${signed(cfg.combat.typeAdvantage)}, słabość ${signed(cfg.combat.typeDisadvantage)}). Suma: ${esc(damageTablePl(cfg))}.${cfg.combat.naturalOneMisses ? ' Na kostce 1 — zawsze pudło.' : ''}${cfg.combat.naturalSixMinDamage ? ` Na kostce 6 — zawsze co najmniej −${cfg.combat.naturalSixMinDamage} ❤.` : ''}</p>
      <p class="small legend-ex">Przykład: kostka ${ex.atLeast - 2} + siła 1 + typ 1 = ${ex.atLeast} → −${ex.damage} ❤.</p>
      ${moves ? `<h4>Ruchy: ${esc(leadName)}</h4>${own.length ? `<ul class="legend-list">${own.map((m) => `<li>${m.slot === 'powerful' ? '💥' : '✨'} <b>${esc(m.pl)}</b> — ${esc(moveLegendPl(m, cfg))}</li>`).join('')}</ul>` : `<p class="small">${esc(leadName)} zna tylko zwykły atak.</p>`}
        <p class="small">„Raz na walkę” = ten Pokémon użyje go tylko raz w tej walce (po zmianie Pokémona też nie wraca).</p>` : ''}
      ${status}
      <div class="row center">${uiBtn('legend-close', '⚔️ Wróć do walki', 'primary')}</div>
    </div>`;
}
// A status on a card (Combat MVP; PT010-09: ON the card, cards.statusBadge): what the engine holds for this Pokémon now —
// the battle's arena status or its own (Combat 2.1 poison) — with this game's rule in the title. pokemonCard's options.
export function statusOn(view, mon) {
  const st = mon && usesCombatMoves(view.config) ? statusOf(view.encounter, mon.uid, mon) : null;
  const phase = sleepPhasePl(view.config, st); // COMBAT 2.2: „Jeszcze 2 zablokowane ataki.” … on the card
  return { status: st, statusTitle: st ? `${statusRulePl(view.config, st.id)}${phase ? ` Teraz: ${phase}` : ''}` : null, statusPhase: phase || null };
}
// One status in one sentence, with THIS game's numbers (S1 = the Combat MVP — its words as before; C21 = Combat 2.1;
// C22 = Combat 2.2: sure ticks, the burn's hit penalty, the counted sleep, every status stays)
function statusRuleText(config, id) {
  const R = statusRulesOf(config);
  if (R.sleep.blocked !== undefined) return statusRuleText22(R, id);
  switch (id) {
    case 'poison': return R.poison.floor === 0
      ? `po każdej wymianie ciosów rzut kostką: ${facesPl(R.poison.faces)} → −${R.poison.amount} ❤ (może znokautować).${R.poison.persists ? ` Zostaje po walce: na początku Twojej tury −${R.poison.mapAmount} ❤ (też może znokautować). Leczy Antidote, Full Heal, Leczenie w Poké Stopie.` : ''}`
      : `po każdej wymianie ciosów rzut kostką: ${facesPl(R.poison.faces)} → −${R.poison.amount} ❤, inaczej nic. Zostaje do końca walki.`;
    case 'burn': return R.burn.tick === 'roll'
      ? `po każdej wymianie ciosów rzut kostką: ${facesPl(R.burn.faces)} → −${R.burn.amount} ❤ (może znokautować); najwyżej ${R.burn.rounds} rzuty, znika po walce.`
      : `po wymianie ciosów na pewno −${R.burn.amount} ❤, potem oparzenie znika.`;
    case 'paralysis': return `przed każdym atakiem rzut: ${facesPl(R.paralysis.blockFaces)} → nie atakuje; inaczej atakuje. Paraliż zostaje.`;
    case 'sleep': return `przed atakiem rzut: ${facesPl(R.sleep.wakeFaces)} → budzi się i od razu atakuje; inaczej śpi i nie atakuje.`;
    default: return '';
  }
}
function statusRuleText22(R, id) {
  switch (id) {
    case 'poison': return `po każdej wymianie ciosów −${R.poison.amount} ❤ (bez rzutu, może znokautować). Zostaje po walce: na początku Twojej tury −${R.poison.mapAmount} ❤. Leczy Antidote, Full Heal, Poké Stop.`;
    case 'burn': return `oparzony trudniej trafia: −${R.burn.hitPenalty} tylko do trafienia (gdy trafi — obrażenia pełne). Po każdej wymianie ciosów −${R.burn.amount} ❤ (bez rzutu, może znokautować). Zostaje po walce, w podróży nie boli. Leczy Burn Heal, Full Heal, Poké Stop.`;
    case 'paralysis': return `przed każdym atakiem rzut: ${facesPl(R.paralysis.blockFaces)} → nie atakuje; inaczej atakuje. Paraliż zostaje — także po walce. Leczy Paralyze Heal, Full Heal, Poké Stop.`;
    case 'sleep': return `${R.sleep.blocked === 2 ? 'dwa pierwsze ataki' : `${R.sleep.blocked} pierwsze ataki`} — śpi; przy następnym rzut: ${facesPl(R.sleep.wakeFaces)} → budzi się i od razu atakuje; jeszcze następny — budzi się na pewno. Zostaje po walce. Leczy Awakening, Full Heal, Poké Stop.`;
    default: return '';
  }
}
const statusRulePl = (config, id) => `${STATUS_DEFINITIONS[id].pl}: ${statusRuleText(config, id)}`;
// PLAYTEST_010 / COMBAT 2.2: the sleep's phase as the engine counts it (its `attempts` on the status) — nothing in a game
// without the counted sleep (its old rule stores no count)
export function sleepPhasePl(config, st) {
  const R = config && usesCombat21(config) ? statusRulesOf(config) : null;
  if (st?.id !== 'sleep' || R?.sleep.blocked === undefined) return '';
  const next = (st.attempts ?? 0) + 1;
  const left = R.sleep.blocked - next + 1;
  if (left >= 2) return `Jeszcze ${left} zablokowane ataki.`;
  if (left === 1) return 'Jeszcze 1 zablokowany atak.';
  return next === R.sleep.blocked + 1 ? `Następny atak: 🎲 ${facesPl(R.sleep.wakeFaces)} = pobudka.` : 'Następny atak: pewna pobudka.';
}
// The status icons of the table: ♨️ for the burn (🔥 also means the Fire type and the stone — never a text token)
export const STATUS_ICON = Object.freeze({ poison: '☠️', burn: '♨️', paralysis: '⚡', sleep: '💤' });

// A battle (P1.5b compact): my card | the dice and the choices | their card.
// Each card keeps its ATK stat; a matchup badge (Build 2.3) says what its attack
// TYPE does against the other card (+1 / −1, nothing at 0); ▶ RUCH sits on the
// Pokémon whose move it is (the die on the table, else the player's, who decides). Main choices in the middle (Atakuj, the balls,
// Uciekaj); Zmiana / Przedmiot under the player's card. A picker (switch,
// item, retreat, ball) takes the whole panel until chosen or cancelled.
function sceneEncounter(view, ui, canAct, reveal = null) {
  const enc = view.encounter;
  const player = currentPlayer(view);
  const lead = getLead(player);
  const opp = currentOpponent(enc);
  const legal = canAct ? getLegalActions(view) : [];
  const has = (type) => legal.some((a) => a.type === type);
  const wild = enc.kind === 'wild';
  const anyBall = wild && ballOptions(view).some((o) => o.usable);
  const step = reveal?.steps[reveal.i] ?? null;
  const actor = !step ? 'mine' : step.type === 'attack' ? (step.kind === 'player' ? 'mine' : 'theirs') : step.type === 'escape' ? 'theirs' : ['catch', 'switch'].includes(step.type) ? 'mine' : null;
  const fight = (a, b) => ({ type: typeHint(a, b, view.config).mod }); // PLAYTEST_007 2C: the one hint path
  // no „prowadzi” pill in a battle (the player's name is over the card)
  // character tokens (tokens.js): whose Pokémon fights on each side right now
  const oppToken = opponentTokenId(enc, view.config);
  // Build 3.3 ⚡: a quick Pokémon wears the First Strike chip in battle
  const quick = (mon) => (mon && hasFirstStrike(mon, view.config) ? `<span class="fs-chip" title="Szybkie wejście: przy pierwszym wejściu do walki zyskuje jeden ruch">${gi('firstStrike')}</span>` : '');
  // PT010-09: the status ON both cards (statusOn — the engine's statusOf), never only a chip beside the owner's name
  const leftCard = lead ? pokemonCard(lead, { size: 'l', label: player.name, ownerToken: playerToken(player, { size: 's' }) + quick(lead) + guardChip(view, lead), ...statusOn(view, lead), growth: growthRules(view), fight: fight(lead, opp), actor: actor === 'mine' }) : '<div class="pcard size-l empty-slot">brak zdrowych Pokémonów</div>';
  const rightCard = pokemonCard(opp, { size: 'l', label: opponentLabel(enc, view.config), ownerToken: (oppToken ? characterToken(oppToken, { size: 's' }) : '') + quick(opp) + guardChip(view, opp), ...statusOn(view, opp), drop: canAct && anyBall, cls: ui.dealUid === opp.uid ? 'deal' : '', fight: lead ? fight(opp, lead) : null, actor: actor === 'theirs' });
  let picker = '';
  if (ui.legend && !step) picker = legendPanel(view, lead); // PT009-10
  else if (ui.catchPrep && wild) picker = catchPrepPanel(view, ui.catchPrep.ball, ui);
  else if (ui.switchPick && has('switchPokemon')) picker = switchPicker(view, enc.freeSwitch);
  else if (ui.itemPick && has('useItem')) picker = itemPicker(view);
  else if (ui.retreatPick && legal.some((a) => a.type === 'run')) picker = retreatPicker(view);
  // no rules line (Build 2.4): the choices and the frames over them say it
  const head = `<div class="scene-head">${encounterHeader(view, enc)}${ui.legend || step ? '' : uiBtn('legend-open', '❓ Legenda', 'ghost small legend-btn')}</div>`;
  if (picker) return `<div class="scene encounter compact k-${enc.kind}">${head}<div class="picker-wrap">${picker}</div></div>`;
  const wildName = wild ? getSpecies(enc.pokemon.species).name : 'Pokémon';
  const table = step ? `${renderStep(step, { rolling: reveal.rolling, wildName, view })}${uiBtn('skip', 'Pomiń ⏩', 'ghost small skip')}` : lastExchange(ui, view);
  const items = view.config.rules.battleItems;
  // while the dice roll, the choices stay in place (inactive), so the panel never jumps
  const choices = canAct || step ? `
      <div class="battle-actions">
        ${(() => { const nm = usesCombatMoves(view.config) && lead ? `⚔️ ${esc(basicMoveOf(lead.species).pl)}` : '⚔️ Atakuj'; return has('fight') ? btn({ type: 'fight' }, nm, 'act-attack primary') : `<button class="act-attack" disabled>${nm}</button>`; })()}
        ${moveButton(view, lead, has('signature') ? { type: 'signature' } : null, enc.signatureUsed)}
        ${usesCombatMoves(view.config) ? combatMoveButtons(view, lead, legal) : ''}
        ${wild ? ballRow(view, canAct && !ui.catchPrep) : ''}
        ${runControl(view, legal)}
      </div>` : !step && player.controller === 'ai' ? `<div class="battle-actions"><span class="thinking">${esc(player.name)} (AI) myśli…</span></div>` : '';
  const side = canAct || step ? `
        ${has('switchPokemon') ? `<div class="act-note${enc.freeSwitch ? ' free' : ''}">${enc.freeSwitch ? 'Zmiana za darmo — bez ataku' : 'Po zmianie atakuje przeciwnik'}</div>` : ''}
        <div class="side-actions">
          ${has('switchPokemon') ? uiBtn('switch-open', slot('🔄', 'Zmiana'), `side-act${enc.freeSwitch ? ' free' : ''}`) : `<button class="side-act" disabled>${slot('🔄', 'Zmiana')}</button>`}
          ${items ? (has('useItem') ? uiBtn('items-open', slot('🎒', 'Przedmiot'), 'side-act') : `<button class="side-act" disabled>${slot('🎒', 'Przedmiot')}</button>`) : ''}
        </div>` : '';
  return `
    <div class="scene encounter compact k-${enc.kind}">
      ${head}
      <div class="arena">
        <div class="side mine">${leftCard}${side}</div>
        <div class="middle"><div class="exchange-area">${table}</div>${choices}</div>
        <div class="side theirs">${rightCard}${foeMovesRow(view, opp, ui)}${rosterCards(enc)}${wildInfo(view)}</div>
      </div>
    </div>`;
}

// The switch picker (Build 2.3): the type matchup only, like the badges on the
// battle cards — its attack's type against this opponent (⚔) and the opponent's
// against it (🛡); nothing when 0.
function matchupBadges(view, mon, foe = currentOpponent(view.encounter).species) {
  const mine = typeHint(mon, foe, view.config).mod; // PLAYTEST_007 2C: the one hint path
  const theirs = typeHint(foe, mon, view.config).mod;
  const badges = `${mine ? `<span class="mu ${modClass(mine)}" title="Twój atak — typ">⚔️ ${modText(mine)}</span>` : ''}${theirs ? `<span class="mu ${modClass(-theirs)}" title="Atak przeciwnika — typ">🛡 ${modText(theirs)}</span>` : ''}`;
  return badges ? `<div class="mu-badges">${badges}</div>` : '';
}

// PLAYTEST_006 PT006-12: an approved card illustration bound to this quest / event (Studio „Ilustracje kart”),
// or nothing — the card as before (a picture that fails to load removes itself: main.js).
export function sceneArtImg(kind, id) {
  const a = sceneArtFor(kind, id);
  return a ? `<img class="scene-art" src="${esc(a.url)}" alt="" loading="lazy" decoding="async" draggable="false">` : '';
}

const modText = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const modClass = (n) => (n > 0 ? 'good' : n < 0 ? 'bad' : 'even');


// ---- reveal tray ------------------------------------------------------------------

export function renderStep(step, { rolling = false, wildName = 'Pokémon', view = null } = {}) {
  const roll = rolling && !step.physical;
  switch (step.type) {
    case 'explore':
      return `<div class="tray explore-flip${roll ? '' : ' flipped'}"><div class="tray-title">Karta eksploracji</div>${d6Html(roll ? null : step.value, { rolling: roll })}${roll ? '' : `<div class="tray-result">${esc(step.outcome)}</div>`}</div>`;
    case 'rarity':
      return `<div class="tray"><div class="tray-title">Rzadkość</div>${d6Html(roll ? null : step.value, { rolling: roll })}${roll ? '' : `<div class="tray-result r-${step.rarity}">${'◆'.repeat({ common: 1, rare: 2, superRare: 3 }[step.rarity])} ${esc(step.label)}${step.total !== step.value ? ` <small>(${step.value} +1)</small>` : ''}</div>${step.rolled ? `<div class="tray-note">${'◆'.repeat({ common: 1, rare: 2, superRare: 3 }[step.rolled])} — tu takich nie ma</div>` : ''}`}</div>`;
    case 'firstStrike':
      return `<div class="tray"><div class="tray-title">${gi('firstStrike')} Szybkie wejście</div><div class="tray-result">${esc(step.text)}</div></div>`;
    case 'attack': {
      // Phase 3A-2: the opponent's response when the player did not attack.
      const why = step.after === 'stay' ? `<div class="tray-title big">${esc(wildName.toUpperCase())} ZOSTAJE — I KONTRATAKUJE!</div>` : step.after === 'item' ? '<div class="tray-title">Przeciwnik atakuje</div>' : step.after === 'firstStrike' ? `<div class="tray-title">${gi('firstStrike')} Atakuje pierwszy!</div>` : '';
      return `<div class="tray">${why}${attackRow(step, { rolling: roll, config: view?.config ?? null })}</div>`;
    }
    case 'catch': {
      const text = roll ? '' : step.face === 'ball' ? `<div class="tray-result good">${pokeballSvg(28)} Poké Ball!</div>` : '<div class="tray-result">Puste…</div>';
      return `<div class="tray"><div class="tray-title">${step.reroll ? '↻ Przerzut — ' : ''}Kostka łapania ${catchDieLabel(step.colour)}</div>${catchDieHtml(step.colour, { face: roll ? null : step.face, rolling: roll })}${text}</div>`;
    }
    case 'escape': {
      const d = ESCAPE_DIE[step.colour];
      const text = roll ? '' : step.face === 'flee' ? `<div class="tray-result bad">${windSvg(30)} ${esc(wildName.toUpperCase())} UCIEKŁ!</div>` : `<div class="tray-result good">${esc(wildName.toUpperCase())} ZOSTAJE!</div>`;
      // wild-encounter slice: a skittish Pokémon's roll after the round, not after a Ball
      const title = step.trigger === 'afterRound' ? `${esc(wildName.toUpperCase())} JEST PŁOCHLIWY — UCIEKNIE?` : `${esc(wildName.toUpperCase())} SIĘ WYRWAŁ!`;
      return `<div class="tray escape-moment"><div class="tray-title big">${title}</div>
        <div class="tray-sub">Aktualne HP: ${gi(`die.${step.colour}`)} ${d.zone}</div>
        <div class="tray-title">Kostka ucieczki ${escapeDieLabel(step.colour)}</div>${escapeDieHtml(step.colour, { face: roll ? null : step.face, rolling: roll })}${text}</div>`;
    }
    case 'growth': {
      const name = getSpecies(step.species ?? step.source).name;
      const source = getSpecies(step.source).name;
      if (step.event === 'gain' && step.amount !== undefined) {
        // Build 3.3 E1: EXP by power class — how much, and why (stronger opponents teach more)
        if (step.amount === 0) return `<div class="tray growth-moment"><div class="tray-title">⭐ Bez treningu</div><div class="tray-result">${esc(name)}: ${step.growth}/${step.threshold}</div><div class="tray-sub">${esc(source)} był dużo słabszy — słabszy przeciwnik nic nie uczy.</div></div>`;
        return `<div class="tray growth-moment"><div class="tray-title">⭐ Trening +${step.amount}!</div><div class="tray-result good">${esc(name)}: ${step.growth}/${step.threshold}${step.ready ? ' — GOTOWY DO EWOLUCJI!' : ''}</div><div class="tray-sub">Za ${step.kind === 'catch' ? 'złapanie' : 'pokonanie'}: ${esc(source)} ${classDots(step.source)}</div></div>`;
      }
      if (step.event === 'noCredit') return `<div class="tray growth-moment"><div class="tray-title">⭐ Bez treningu</div><div class="tray-sub">${esc(source)} był już pokonany — trening tylko za pierwszym razem.</div></div>`; // Build 3.3 C1
      if (step.event === 'lost' && step.reason === 'tired') return `<div class="tray growth-moment tired"><div class="tray-title">${gi('fatigue')} Bez treningu tutaj</div><div class="tray-sub">Pokémony tutaj już Cię znają. Trening tu nic nie da — ruszaj dalej!</div></div>`;
      if (step.event === 'lost') return `<div class="tray growth-moment"><div class="tray-title">⭐ Punkt treningu przepada</div><div class="tray-sub">Za ${step.kind === 'catch' ? 'złapanie' : 'pokonanie'}: ${esc(source)} — ${step.reason === 'fainted' ? 'zemdlał w walce z nim — bez treningu' : step.reason === 'final' ? 'ten Pokémon już nie ewoluuje' : 'Pokémon jest już gotowy do ewolucji'}.</div></div>`;
      return `<div class="tray growth-moment"><div class="tray-title">⭐ Punkt treningu!</div><div class="tray-result good">${esc(name)}: ${step.growth}/${step.threshold}${step.ready ? ' — GOTOWY DO EWOLUCJI!' : ''}</div><div class="tray-sub">Za ${step.kind === 'catch' ? 'złapanie' : 'pokonanie'}: ${esc(source)}</div></div>`;
    }
    case 'switch':
      return `<div class="tray"><div class="tray-title">🔄 Zmiana Pokémona</div><div class="tray-result good">Do walki wchodzi ${esc(getSpecies(step.species).name)}!</div><div class="tray-sub">${step.free ? 'Za darmo — poprzedni zemdlał.' : 'Bez ataku w tej rundzie.'}</div></div>`;
    case 'plot':
      return `<div class="tray rocket-moment"><div class="tray-title big rocket">🎈 Team Rocket knuje spisek!</div>${view?.rocket?.active ? rocketPlotCard(view, { size: 's' }) : ''}</div>`;
    case 'drift':
      return `<div class="tray rocket-moment"><div class="tray-title">🎈 Balon Team Rocket leci</div><div class="tray-result">${esc(getLocation(step.from).name)} → ${esc(getLocation(step.to).name)}${step.landed ? ' i ląduje!' : ''}</div></div>`;
    case 'rocketBattle':
      return `<div class="tray rocket-moment"><div class="tray-title big rocket">„Przygotujcie się na kłopoty!”</div><div class="tray-result">${{ challenge: 'Wyzywasz Team Rocket!', explore: 'Tu jest tylko Team Rocket!', ambush: 'Zasadzka!' }[step.trigger] ?? 'Team Rocket!'}</div></div>`;
    case 'loot':
      return `<div class="tray rocket-moment"><div class="tray-title">😼 Meowth zabiera</div><div class="loot-fly"><span class="fly-token">${itemToken(step.item, 48)}</span><span class="fly-arrow">➜ 🎈</span></div><div class="tray-sub">${esc(thingPl(step.item, step.amount))} — leży na karcie spisku. Wróci, gdy ktoś pokona Team Rocket.</div></div>`;
    case 'lootBack':
      return `<div class="tray rocket-moment"><div class="tray-title">🎒 Łup wraca</div><div class="loot-fly back"><span class="fly-arrow">🎈 ➜</span><span class="fly-token">${itemToken(step.item, 48)}</span></div><div class="tray-sub">${esc(step.ownerName)} odzyskuje: ${esc(thingPl(step.item, step.amount))}</div></div>`;
    case 'rocketEscaped':
      // 3A-4: the plot clock ran out — nobody gets the reward, the loot goes home
      return `<div class="tray rocket-moment"><div class="tray-title big rocket">TEAM ROCKET UCIEKŁ!</div><div class="tray-sub">${step.loot ? 'Skradzione rzeczy wracają do właścicieli.' : 'Nikt nie zdobył nagrody za ten spisek.'}</div></div>`;
    case 'blastOff':
      return '<div class="tray rocket-moment blast"><div class="tray-title big rocket">Team Rocket znowu odlatuje! ✨</div></div>';
    case 'pitfall':
      return '<div class="tray rocket-moment"><div class="tray-title big rocket">🕳 Dół Team Rocket!</div><div class="tray-result">Twoja tura się kończy.</div></div>';
    case 'event': {
      const e = eventPl(step.event);
      return `<div class="tray event-moment ev-split">${eventArt(step.event)}<div class="ev-info"><div class="tray-title">Wydarzenie</div><h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>${step.effects ? `<div class="tray-result">${esc(step.effects)}</div>` : ''}</div></div>`;
    }
    case 'eventChoice':
      return `<div class="tray event-moment"><div class="tray-title">Wybór</div><div class="tray-result">${esc(step.label)}</div>${step.effects ? `<div class="tray-sub">${esc(step.effects)}</div>` : ''}</div>`;
    case 'note':
      return `<div class="tray"><div class="tray-result good">${esc(step.text)}</div></div>`;
    case 'statusRoll':
      return statusRollStep(step, roll, view?.config ?? null);
    case 'lootRoll': {
      // PLAYTEST_009 (PT009-15): the loot die with its whole table, the face lit, then the prize or „brak łupu”
      const rows = [[[6], 'przedmiot trenera'], [[5], step.tired ? 'tu nic — zmęczone miejsce' : 'Poké Ball'], [[1, 2, 3, 4], 'nic']];
      const table = rows.map(([faces, what]) => `<span class="lr${!roll && faces.includes(step.value) ? ' on' : ''}">${faces.length > 1 ? `${faces[0]}–${faces.at(-1)}` : faces[0]} → ${what}</span>`).join('');
      const res = roll ? '' : step.item ? `<div class="tray-result good">${itemToken(step.item, 40)} ${esc(ITEM_PL[step.item] ?? ITEMS[step.item]?.name ?? step.item)}!</div>` : '<div class="tray-result">Brak łupu.</div>';
      return `<div class="tray loot-roll"><div class="tray-title">🎁 Łup od trenera</div>${d6Html(roll ? null : step.value, { rolling: roll })}<div class="lr-table">${table}</div>${res}</div>`;
    }
    default: {
      const meaning = !roll && step.meaning ? `<div class="tray-result">${esc(step.meaning)}</div>` : '';
      const title = step.label === 'Meowth grabs' ? 'Meowth — co zabierze?' : d6Purpose(step.label);
      return `<div class="tray"><div class="tray-title">${esc(title)}</div>${d6Html(roll ? null : step.value, { rolling: roll })}${meaning}</div>`;
    }
  }
}

// ---- other scenes -------------------------------------------------------------------

// Family flow (3A-2.5): EKSPLORUJ → the terrain (only where there is a
// choice) → the roll → what was found. No simulator decks or counters here.
function sceneExplore(view, ui, canAct) {
  const player = currentPlayer(view);
  const legal = canAct ? getLegalActions(view).filter((a) => a.type === 'explore') : [];
  // Macro 01: a mixed place has one Explore without a biome (the HUD sends it straight away)
  const choices = legal.map((a) => (a.biome ? btn(a, `${gi(`biome.${a.biome}`)} ${BIOME_PL[a.biome] ?? BIOMES[a.biome].name}`, 'primary big') : btn(a, '🌿 Eksploruj', 'primary big'))).join('');
  return `
    <div class="scene explore">
      <div class="scene-head"><span class="scene-tag">Eksploracja</span><h2>📍 ${esc(placeName(player.location))}</h2><span class="tag">1 akcja</span></div>
      ${ui.reveal ? '<p class="center explore-roll">🎲 Co tu znajdziesz?</p>' : `<p class="center">Gdzie szukasz? Wybierz teren — kość pokaże, co znajdziesz: nic, wydarzenie, trenera albo dzikiego Pokémona.</p>
      <div class="row center">${choices || '<span class="muted">Tu nie da się eksplorować.</span>'}${uiBtn('close-panel', 'Zamknij', 'ghost')}</div>`}
    </div>`;
}

function sceneRest(view, canAct) {
  const player = currentPlayer(view);
  const rests = canAct ? getLegalActions(view).filter((a) => a.type === 'rest') : [];
  const cards = rests.map((a) => {
    const mon = player.team.find((m) => m.uid === a.target);
    return `<div class="pick">${pokemonCard(mon, { size: 'm', growth: growthRules(view), family: true })}${btn(a, `💤 +${restHeal(view.config)} ❤`, 'primary')}</div>`;
  }).join('');
  return `<div class="scene rest"><div class="scene-head"><span class="scene-tag">Odpoczynek</span><h2>Kto odpoczywa?</h2><span class="tag">1 akcja</span></div><div class="pick-row">${cards || '<span class="muted">Nikt nie potrzebuje odpoczynku.</span>'}</div><div class="row center">${uiBtn('close-panel', 'Zamknij', 'ghost')}</div></div>`;
}

function typeChips(types) {
  return types.map((t) => `<span class="type-chip" style="--tc:var(--t-${t})">${gi(`type.${t}`)} ${TYPE_PL[t]}</span>`).join(' ') || '—';
}

// B33-3: who waits in the gym — its trainer(s), then the leader, each with its row.
function gymChainPreview(view, gym, tier) {
  const steps = chainOpponents(view, { kind: 'gym', gymId: gym.id, tier }).map((o) => `
    <div class="league-stage chain-stage">
      <b>${chainToken(o, 'xs')} ${esc(chainName(o))}</b>
      <div class="roster-cards">${o.team.map((id) => speciesCard(id, { size: 'xs' })).join('')}</div>
    </div>`);
  return `<div class="chain-preview">${steps.join('<div class="league-break-mark">➜ bez Poké Stopu</div>')}</div>`;
}

// B33-3 League v2: Lorelei → Bruno → Agatha → Lance in one challenge.
function leagueCardV2(view, player, canAct) {
  const legal = canAct && getLegalActions(view).some((a) => a.type === 'challengeLeague');
  const need = leagueBadges(view.config);
  const stages = chainOpponents(view, { kind: 'league' }).map((o) => `
    <div class="league-stage">
      <b>${chainToken(o, 'xs')} ${esc(chainName(o))}</b>
      <div class="roster-cards">${o.team.map((id) => speciesCard(id, { size: 'xs' })).join('')}</div>
    </div>`).join(`<div class="league-break-mark">⏸ przerwa: ${usableItems(view.config).map((id) => ITEM_PL[id]).join(' / ')} / zmiana prowadzącego — bez Poké Stopu</div>`);
  return `
    <div class="gym-card league">
      <div class="gym-top"><span class="gym-icon">🏆</span><div><h2>Liga Pokémon — Indigo Plateau</h2><div>Wymagane: ${need} ${badgesPl(need)} · masz ${player.badges.length}${player.league.ribbon ? ' · 🎀 Wstęga Elitarnej Czwórki' : ''}</div></div></div>
      ${badgeCase(view, player)}
      ${stages}
      <p class="small muted">Jedno wyzwanie: Lorelei, Bruno, Agatha, potem Lance. Pokonasz trójkę → 🎀 Wstęga do gabloty. Przegrana albo wyjście: następnym razem znowu od Lorelei. Pokonasz Lance’a → zostajesz Mistrzem i gra kończy się po tym tygodniu.</p>
      <div class="row center">${canAct && !player.league.champion ? btn({ type: 'challengeLeague' }, '🏆 Wyzwij Ligę (1 akcja)', 'primary big', !legal) : ''}${uiBtn('close-panel', 'Zamknij', 'ghost')}</div>
      ${canAct && !legal && !player.league.champion ? `<p class="note">${esc(blockerPl(leagueChallengeBlocker(view, player)))}</p>` : ''}
    </div>`;
}

function leagueCard(view, player, canAct) {
  if (usesLeagueChallenge(view.config)) return leagueCardV2(view, player, canAct);
  const start = leagueStartStage(view, player);
  const legal = canAct && getLegalActions(view).some((a) => a.type === 'challengeLeague');
  const need = leagueBadges(view.config);
  const stages = LEAGUE.stages.map((stage, i) => `
    <div class="league-stage${i === start ? ' mine' : ''}">
      <b>Etap ${i + 1}: ${esc(LEAGUE_STAGE_PL[stage.id] ?? stage.name)}</b>${i === start && start > 0 ? ' <span class="tag">tu zaczynasz (🎀)</span>' : ''}
      <div class="roster-cards">${leagueStageTeam(view, i).map((id, j) => `<div class="named-card"><small>${characterToken(leagueTokenId(stage.trainers[j] ?? stage.trainers[0]), { size: 'xs' })}${esc(stage.trainers[j] ?? stage.trainers[0])}</small>${speciesCard(id, { size: 'xs' })}</div>`).join('')}</div>
    </div>`).join(`<div class="league-break-mark">⏸ przerwa: ${usableItems(view.config).map((id) => ITEM_PL[id]).join(' / ')} / zmiana prowadzącego — bez pełnego leczenia</div>`);
  return `
    <div class="gym-card league">
      <div class="gym-top"><span class="gym-icon">🏆</span><div><h2>Liga Pokémon — Indigo Plateau</h2><div>Wymagane: ${need} ${badgesPl(need)} · masz ${player.badges.length}${player.league.ribbon ? ' · 🎀 Wstęga Elitarnej Czwórki' : ''}</div></div></div>
      ${badgeCase(view, player)}
      ${stages}
      <p class="small muted">Pokonasz Elitarną Czwórkę → dostajesz 🎀 Wstęgę: następnym razem zaczynasz od Lance’a. Pokonasz Lance’a → zostajesz Mistrzem i gra kończy się po tym tygodniu.</p>
      <div class="row center">${canAct && !player.league.champion ? btn({ type: 'challengeLeague' }, '🏆 Wyzwij Ligę (1 akcja)', 'primary big', !legal) : ''}${uiBtn('close-panel', 'Zamknij', 'ghost')}</div>
      ${canAct && !legal && !player.league.champion ? `<p class="note">${esc(blockerPl(leagueChallengeBlocker(view, player)))}</p>` : ''}
    </div>`;
}

export function sceneGym(view, canAct) {
  const player = currentPlayer(view);
  const gym = gymHere(view, player);
  if (gym) {
    const tier = gymTier(view, player);
    const owned = hasBadge(player, gym.id);
    const { strong, weak } = gymMatchups(gym, view.config);
    const legal = canAct && getLegalActions(view).some((a) => a.type === 'challengeGym');
    const cfg = view.config.gyms;
    const note = GYM_NOTE_PL[gym.id];
    return `
      <div class="scene gym-scene">
        <div class="gym-card">
          <div class="gym-top"><span class="gym-icon">${typeIcon(gym.type)}</span>${characterToken(gymTokenId(gym.id), { size: 'l' })}<div><h2>Sala w ${esc(getLocation(gym.city).name)}</h2><div>Lider: <b>${esc(leaderPl(gym))}</b>${note ? ` <small>(${esc(note)})</small>` : ''} · Odznaka: <b>${esc(gym.badge)}</b>${owned ? ' ✓' : ''}</div></div><span class="tag">poziom ${tier} (${player.badges.length} ${player.badges.length === 1 ? 'odznaka' : 'odznak'})</span></div>
          ${usesGymChain(view.config) ? gymChainPreview(view, gym, tier) : `<div class="roster-cards">${gymRow(gym, tier, view.config).map((id) => speciesCard(id, { size: 's' })).join('')}</div>`}
          ${trialBox(view, player, gym)}
          <div class="guide"><span>💪 Silne tu: ${typeChips(strong)}</span><span>🛡️ Słabe tu: ${typeChips(weak)}</span></div>
          <div class="rewards">Nagroda: <b>${gi(`type.${gym.type}`)} odznaka</b> · 💰${cfg.reward.money}${gymRewardItem(gym, view.config) ? ` · <b class="reward-item">${itemToken(gymRewardItem(gym, view.config), 22)} ${esc(ITEM_PL[gymRewardItem(gym, view.config)])}</b>` : ''}${cfg.starsPerBadge && !usesGrowth(view) ? ` · ⭐${cfg.starsPerBadge}` : usesGrowth(view) ? (view.config.rules.growthCredits ? ' · ⭐ trening raz za każdego Pokémona' : ' · ⭐ trening za każdego pokonanego Pokémona') : ''}${gym.grants ? ' · 🌊 pływanie' : ''}</div>
          <p class="small muted">${rulesLine(view, 'gym')} ${usesGymChain(view.config) ? 'Najpierw trener sali, potem lider — między walkami bez Poké Stopu. Wyjście albo przegrana: następnym razem od początku.' : 'Spróbujesz znowu w kolejnej turze.'}</p>
          <div class="row center">${owned ? '<b>Masz już tę odznakę.</b>' : canAct ? btn({ type: 'challengeGym' }, usesGymChain(view.config) ? '🏟️ Wyzwij salę (1 akcja)' : '🏟️ Wyzwij lidera (1 akcja)', 'primary big', !legal) : ''}${uiBtn('close-panel', 'Zamknij', 'ghost')}</div>
          ${!owned && canAct && !legal ? `<p class="note">${esc(blockerPl(gymChallengeBlocker(view, player)))}</p>` : ''}
        </div>
      </div>`;
  }
  if (leagueHere(view, player)) return `<div class="scene gym-scene">${leagueCard(view, player, canAct)}</div>`;
  return '';
}

function sceneRocket(view, canAct) {
  const active = activePlot(view);
  if (!active) return `<div class="scene"><p>Team Rocket teraz nic nie knuje.</p><div class="row center">${uiBtn('close-panel', 'Zamknij', 'ghost')}</div></div>`;
  const legal = canAct && getLegalActions(view).some((a) => a.type === 'challengeRocket');
  const where = rocketPlacesPl(view, currentPlayer(view));
  return `
    <div class="scene rocket-scene">
      ${rocketPlotCard(view, { size: 'l' })}
      <p class="center small">Wyzwanie Team Rocket (1 akcja) możliwe w: <b>${esc(where)}</b>.</p>
      <div class="row center">${legal ? btn({ type: 'challengeRocket' }, '🎈 Wyzwij Team Rocket (1 akcja)', 'primary big') : ''}${uiBtn('close-panel', 'Zamknij', 'ghost')}</div>
    </div>`;
}

// PLAYTEST_009 (PT009-03): an event is laid out like a Journal card — the full 3 : 4 card art on the LEFT, the title, the
// text and the choices on the RIGHT (one under the other on a narrow screen); no art yet → the same frame with an icon.
function eventArt(id) {
  const a = sceneArtFor('event', EVENTS_BY_ID[id]?.artOf ?? id); // K-05 W1: the new backpack shows the old one's picture
  return `<div class="ev-art${a ? '' : ' fallback'}">${a ? `<img src="${esc(a.url)}" alt="" decoding="async" draggable="false">` : '<span aria-hidden="true">❗</span>'}</div>`;
}
function sceneEvent(view, canAct) {
  const e = eventPl(view.pendingEvent.id);
  const legal = new Set(canAct ? getLegalActions(view).map((a) => a.choice) : []);
  const choices = e.choices.map((c, i) => `<button class="choice-card" ${actAttr({ type: 'chooseEvent', choice: i })}${legal.has(i) ? '' : ' disabled'}><b>${esc(c.label)}</b>${legal.has(i) ? '' : '<small>teraz niedostępne</small>'}</button>`).join('');
  return `<div class="scene event"><div class="event-card ev-split">${eventArt(view.pendingEvent.id)}<div class="ev-info"><span class="scene-tag">Wydarzenie</span><h2>${esc(e.title)}</h2><p class="event-text">${esc(e.text)}</p><div class="choice-cards">${canAct ? choices : '<span class="thinking">Wybór…</span>'}</div></div></div></div>`;
}

// PT009-16: the last buy / sell of this visit as a sum („Kupujesz: Poké Ball · 💰 10 − 2 = 8”)
function shopReceipt(ui) {
  const r = ui?.shopReceipt;
  return r ? `<p class="wallet-line receipt">${r.kind === 'buy' ? 'Kupujesz' : 'Sprzedajesz'}: ${itemToken(r.item, 28)} <b>${esc(ITEM_PL[r.item] ?? r.item)}</b> · ${moneyMath(r.from, r.to)}</p>` : '';
}
// PLAYTEST_012 01: a healing item's effect on its shop tile, always in view (content-pl.itemUsePl)
const itemUseLine = (id, config) => {
  const use = itemUsePl(id, config);
  return use ? `<small class="item-use">${esc(use)}</small>` : '';
};
function sceneShop(view, canAct, ui = null) {
  if (pokeStopV2(view)) return sceneShopV2(view, canAct, ui);
  const player = currentPlayer(view);
  const legal = canAct ? getLegalActions(view) : [];
  const buyable = new Set(legal.filter((a) => a.type === 'buy').map((a) => a.item));
  const tray = shopStock(view).map((id) => {
    const cost = price(id, view.config);
    const ok = buyable.has(id);
    // Evolution Stones are sold here only for now (DQ-78: placeholder source until 3B).
    const stone = ITEMS[id].kind === 'evolution';
    return `<button class="tray-item${ok ? '' : ' cant'}${stone ? ' stone' : ''}" ${actAttr({ type: 'buy', item: id })}${canAct && ok ? '' : ' disabled'}>
      <span class="tray-token">${itemToken(id, 54)}</span><b>${ITEM_PL[id]}</b>${itemUseLine(id, view.config)}<span class="price-tag">💰${cost}</span><small>masz ${itemCount(player, id)}${stone ? ' · kamień ewolucji (tymczasowo w sklepie)' : ''}</small></button>`;
  }).join('');
  const swap = canAct && canSwapQuests(view, player);
  const missions = (player.quests ?? []).map((q) => missionCard(q, { config: view.config, actions: swap ? btn({ type: 'swapQuest', target: q.questId }, '🔄 Wymień tę misję', 'mini') : '' })).join('');
  const team = player.team.map((m) => `<span class="heal-chip">${esc(getSpecies(m.species).name)} <b>${'♥'.repeat(m.hp)}</b></span>`).join('');
  return `
    <div class="scene shop">
      <div class="scene-head"><span class="scene-tag">Poké Stop</span><h2>🏪 Poké Stop</h2><span class="wallet">💰 ${player.money}</span></div>
      <div class="healed">💖 Drużyna wyleczona do pełna! ${team}</div>
      ${shopReceipt(ui)}
      <div class="shop-tray">${tray}</div>
      <p class="small center">Dotknij żeton, żeby kupić. Zakupy nie kosztują akcji, dopóki jesteś w środku.</p>
      ${missions ? `<h3>Misje ${swap ? '<small>— możesz wymienić jedną za darmo</small>' : '<small>— wymiana już wykorzystana</small>'}</h3><div class="mission-row">${missions}</div>` : ''}
      <div class="row center">${canAct ? btn({ type: 'leaveShop' }, '🚪 Wyjdź z Poké Stopu', 'primary big') : ''}</div>
    </div>`;
}

// Gameplay P1 (DQ-89 / DQ-94): Sklep — 1 action for the whole visit, no heal;
// buy and sell any number of things; the mission swap.
function sceneShopV2(view, canAct, ui = null) {
  const player = currentPlayer(view);
  const perBuy = shopChargesOnTransaction(view.config); // PT009-06: the action with the first purchase
  const legal = canAct ? getLegalActions(view) : [];
  const buyable = new Set(legal.filter((a) => a.type === 'buy').map((a) => a.item));
  const tray = shopStock(view).map((id) => {
    const ok = buyable.has(id);
    const stone = ITEMS[id].kind === 'evolution';
    return `<button class="tray-item${ok ? '' : ' cant'}${stone ? ' stone' : ''}" ${actAttr({ type: 'buy', item: id })}${canAct && ok ? '' : ' disabled'}>
      <span class="tray-token">${itemToken(id, 54)}</span><b>${ITEM_PL[id]}</b>${itemUseLine(id, view.config)}<span class="price-tag">KUP 💰${price(id, view.config)}</span><small>masz ${itemCount(player, id)}${stone ? ' · kamień ewolucji' : ''}</small></button>`;
  }).join('');
  const sellable = new Set(canAct ? sellableItems(view) : []);
  const owned = Object.keys(view.config.economy).filter((id) => ITEMS[id] && itemCount(player, id) > 0 && sellPrice(id, view.config) > 0);
  const sellTray = view.config.rules.selling && owned.length ? owned.map((id) => {
    const ok = sellable.has(id);
    const lastBall = ITEMS[id].kind === 'ball' && !ok;
    return `<button class="tray-item sell${ok ? '' : ' cant'}" ${actAttr({ type: 'sell', item: id })}${canAct && ok ? '' : ' disabled'}>
      <span class="tray-token">${itemToken(id, 44)}</span><b>${ITEM_PL[id]}</b><span class="price-tag sell">SPRZEDAJ 💰${sellPrice(id, view.config)}</span><small>${lastBall ? 'ostatni ball zostaje' : `masz ${itemCount(player, id)}`}</small></button>`;
  }).join('') : '';
  const swap = canAct && canSwapQuests(view, player);
  const missions = (player.quests ?? []).map((q) => missionCard(q, { config: view.config, actions: swap ? btn({ type: 'swapQuest', target: q.questId }, '🔄 Wymień tę misję', 'mini') : '' })).join('');
  // one swap per player turn, even with two Sklep visits
  const swapNote = questSwapUsedThisTurn(view) ? '<small>— misję można wymienić raz na turę</small>' : swap ? '<small>— możesz wymienić jedną za darmo</small>' : '';
  return `
    <div class="scene shop">
      <div class="scene-head"><span class="scene-tag">Poké Stop</span><h2>${gi('shop')} Sklep</h2><span class="tag${perBuy && view.shop?.paid ? ' ok' : ''}">${!perBuy ? '1 akcja' : view.shop?.paid ? '✓ akcja zapłacona' : '1 akcja przy pierwszym zakupie'}</span><span class="wallet">💰 ${player.money}</span></div>
      ${shopReceipt(ui)}
      <h3>Kup</h3>
      <div class="shop-tray">${tray}</div>
      ${sellTray ? `<h3>Sprzedaj <small>— za połowę ceny</small></h3><div class="shop-tray sell">${sellTray}</div>` : ''}
      <p class="small center">${perBuy ? 'Oglądanie, wymiana misji i wyjście nic nie kosztują. Pierwszy zakup albo sprzedaż to 1 akcja — potem kupuj i sprzedawaj, ile chcesz. Leczenie to osobna akcja.' : 'Kupuj i sprzedawaj, ile chcesz — cała wizyta w sklepie to jedna akcja. Leczenie to osobna akcja.'}</p>
      ${missions ? `<h3>Misje ${swapNote}</h3><div class="mission-row">${missions}</div>` : ''}
      <div class="row center shop-exit">${canAct ? btn({ type: 'leaveShop' }, '🚪 Wyjdź ze sklepu', 'primary big') : ''}</div>
    </div>`;
}

// Gameplay P1 (DQ-95): a catch with a full team — to the team (pick who goes
// to Oak's Box) or to Professor Oak.
function sceneBoxChoice(view, canAct) {
  const player = currentPlayer(view);
  const caught = player.reserve.find((m) => m.uid === view.boxChoice.uid);
  const name = getSpecies(caught.species).name;
  const cards = player.team.map((mon) => `<div class="pick">${pokemonCard(mon, { size: 's', growth: growthRules(view), family: true })}${canAct ? btn({ type: 'boxKeep', target: mon.uid }, `${gi('box')} Do Boxu`, '') : ''}</div>`).join('');
  return `
    <div class="scene box-pick">
      <div class="scene-head"><span class="scene-tag">Box Oaka</span><h2>Drużyna jest pełna!</h2></div>
      <div class="box-new">${pokemonCard(caught, { size: 'm', growth: growthRules(view), family: true })}
        <div><p><b>${esc(name)}</b> — co dalej?</p>
          ${canAct ? btn({ type: 'boxSend' }, `${gi('send-to-oak')} Wyślij do Oaka`, 'primary big') : `<span class="thinking">${esc(player.name)} wybiera…</span>`}</div></div>
      <h3>…albo Do drużyny: kto jedzie do Boxu Oaka?</h3>
      <div class="pick-row">${cards}</div>
    </div>`;
}

// Macro 01: Professor Oak's lab in Pallet Town — the emergency kit, the
// Research Jobs (A / B), the job running now. Kid-simple: what goes, for how
// long, what comes back.
const JOB_PL = { A: 'Zadanie A', B: 'Zadanie B' };
const jobRewardPl = (reward) => reward.map((r) => (r.type === 'money' ? `💰${r.amount}` : `${itemIc(r.type === 'pokeballs' ? 'pokeball' : r.type)} ${ITEM_PL[r.type === 'pokeballs' ? 'pokeball' : r.type]}`)).join(' + ');
// One Kanto day 14.10 (rules.oakResearch): what a job pays — new species for Oak or a repeat
const researchPl = (job) => (job === 'A' ? `nowy gatunek dla Oaka: ${jobRewardPl(RESEARCH_REWARDS.A.fresh)} · już badany: ${jobRewardPl(RESEARCH_REWARDS.A.repeat)}` : `co najmniej 2 nowe gatunki: ${jobRewardPl(RESEARCH_REWARDS.B.fresh)} · inaczej: ${jobRewardPl(RESEARCH_REWARDS.B.repeat)}`);
const jobPayPl = (view, job, spec) => (usesResearch(view) ? researchPl(job) : jobRewardPl(spec.reward));

function sceneOak(view, canAct) {
  const player = currentPlayer(view);
  const legal = canAct ? getLegalActions(view) : [];
  const kit = legal.some((a) => a.type === 'oakKit')
    ? `<div class="oak-kit">${gi('oak.kit')}<div><b>Nie masz balli ani pieniędzy?</b><p>Awaryjny Poké Ball — raz na grę.</p></div>${btn({ type: 'oakKit' }, 'Weź awaryjny Poké Ball', 'primary big')}</div>`
    : usesOakKit(view) && player.oakKitUsed ? '<p class="small muted center">Awaryjny Poké Ball: już wykorzystany.</p>' : '';
  const job = player.oakJob;
  const now = job
    ? `<div class="oak-away">${gi('oak.away')}<div><b>W pracy u Oaka:</b> ${job.pokemon.map((m) => esc(getSpecies(m.species).name)).join(', ')}</div><span class="tag">wracają za ${turnsPl(job.turnsLeft)}</span></div>`
    : '';
  // the jobs live in Pallet Town only (the kit may also come at a Poké Stop: oak.kitWhere 'stop')
  const cards = usesOakJobs(view) && atOakLab(view, player) ? JOB_IDS.map((id) => {
    const spec = view.config.oak.jobs[id];
    const ok = legal.some((a) => a.type === 'oakJob' && a.job === id);
    const why = !canAct ? '' : job ? 'Masz już zadanie u Oaka.' : view.turn.actionsRemaining < view.config.oak.jobCost ? 'Brak akcji w tej turze.' : `Potrzebujesz ${spec.size} zdrowych Pokémonów — drużyna zatrzymuje jednego.`;
    return `<div class="oak-job${ok ? '' : ' muted'}"><h3>${JOB_PL[id]}</h3><p>${spec.size} ${spec.size === 1 ? 'Pokémon' : 'Pokémony'} · ${turnsPl(spec.turns)}</p><p class="reward">Nagroda: ${jobPayPl(view, id, spec)}</p>
      ${canAct ? btn({ type: 'oakJob', job: id }, spec.size === 1 ? 'Wybierz Pokémona' : 'Wybierz Pokémony', 'primary', !ok) : ''}${ok || !why ? '' : `<small>${esc(why)}</small>`}</div>`;
  }).join('') : '';
  return `
    <div class="scene oak">
      <div class="scene-head"><span class="scene-tag">${esc(placeName(player.location))}</span><h2>🔬 Profesor Oak</h2>${cards ? `<span class="tag">zadanie: ${view.config.oak.jobCost} akcja</span>` : ''}</div>
      ${kit}${now}
      ${cards ? `<div class="oak-jobs">${cards}</div>
      <p class="small center">Pokémony pracują, a Ty podróżujesz dalej. Wracają same — do drużyny albo do Boxu. W pracy nie leczą się i nie trenują.</p>` : ''}
      <div class="row center">${uiBtn('close-panel', 'Zamknij', 'ghost')}</div>
    </div>`;
}

// One Kanto day 14.10 (rules.achievements): 🏆 a player's trophies — earned (✓ and the week), the rest with
// their progress, by category; the points (provisional, for a future score). A tab per player (default: whose turn).
// ACHIEVEMENTS 3.0 ('v3', FIRST PLAYER WINS): ONE collection for the table — every trophy free (its icon, name, condition,
// points, „WOLNE”) or taken (🏆, its owner's portrait and name, the week, the points); each player's points. A taken
// trophy never suggests the others can still earn it (no progress shown for anyone).
function sceneTrophies3(view) {
  const owners = view.trophies.owners;
  const tiles = ACHIEVEMENTS_V3.map((a) => {
    const o = owners[a.id];
    const p = o ? view.players.find((x) => x.id === o.player) : null;
    const pts = `${a.points} PKT`;
    return p
      ? `<div class="trophy3 taken" style="--pc:${p.color}" data-trophy="${esc(a.id)}"><span class="t3-icon" aria-hidden="true">🏆</span><div class="t3-body"><b>${esc(a.name)}</b><p class="small">${esc(a.text)}</p><div class="t3-owner">${avatarToken(p, 'small')}<span><small>ZDOBYTE:</small> <b>${esc(p.name.toUpperCase())}</b> · TYDZIEŃ ${o.week} · ${pts}</span></div></div></div>`
      : `<div class="trophy3 free" data-trophy="${esc(a.id)}"><span class="t3-icon" aria-hidden="true">${a.icon}</span><div class="t3-body"><b>${esc(a.name)}</b><p class="small">${esc(a.text)}</p><small class="t3-free">WOLNE · ${pts}</small></div></div>`;
  }).join('');
  const totals = view.players.map((p) => `<span class="t3-total" style="--pc:${p.color}">${avatarToken(p, 'small')}<b>${esc(p.name)}</b> <span>${trophyPoints(view, p.id)} pkt</span></span>`).join('');
  const taken = Object.keys(owners).length;
  return `<div class="scene trophies-scene t3"><div class="scene-head"><span class="scene-tag">Osiągnięcia</span><h2>🏆 OSIĄGNIĘCIA</h2><span class="tag">${taken} / ${ACHIEVEMENTS_V3.length} zdobytych</span>${CLOSE_X}</div>
    <p class="small center">Kto pierwszy, ten lepszy — każde trofeum ma jednego właściciela w tej grze.</p>
    <div class="t3-totals">${totals}</div>
    <div class="trophy3-grid">${tiles}</div>
    <p class="small center muted">Punkty osiągnięć to dodatkowa rywalizacja — nie zmieniają Mistrza Ligi ani końca gry.</p>
    <div class="row center">${uiBtn('close-panel', 'Zamknij', 'ghost')}</div></div>`;
}
// ACHIEVEMENTS 4.0 — TROFEA KANTO ('v4', Piotr wariant A, ChatGPT 18.10 13:04): exactly the game's 8 cards, as laid out
// (the order drawn), visible from the start — 4 × 2 on a wide screen, fewer columns on a narrow one. A card: its icon,
// name, condition, points and WOLNE / ZDOBYTE; a won one also its owner's portrait, name and week. The 12 cards out of
// this game are never shown. „TROFEA KANTO — 3/8 ZDOBYTE”.
function sceneTrophies4(view) {
  const owners = view.trophies.owners;
  const list = trophyList(view.config); // 'v5': the trainer trophies' new words
  const cards = view.trophies.active.map((id) => list.find((a) => a.id === id)).filter(Boolean);
  const tiles = cards.map((a) => {
    const o = owners[a.id];
    const p = o ? view.players.find((x) => x.id === o.player) : null;
    const head = `<span class="t3-icon" aria-hidden="true">${a.icon}</span><b>${esc(a.name)}</b><p class="small">${esc(a.text)}</p>`;
    return p
      ? `<div class="trophy3 trophy4 taken" style="--pc:${p.color}" data-trophy="${esc(a.id)}">${head}<small class="t4-status">🏆 ZDOBYTE · ${a.points} PKT</small><div class="t3-owner">${avatarToken(p, 'small')}<span><b>${esc(p.name.toUpperCase())}</b> · TYDZIEŃ ${o.week}</span></div></div>`
      : `<div class="trophy3 trophy4 free" data-trophy="${esc(a.id)}">${head}<small class="t3-free t4-status">WOLNE · ${a.points} PKT</small></div>`;
  }).join('');
  const totals = view.players.map((p) => `<span class="t3-total" style="--pc:${p.color}">${avatarToken(p, 'small')}<b>${esc(p.name)}</b> <span>${trophyPoints(view, p.id)} pkt</span></span>`).join('');
  const taken = cards.filter((a) => owners[a.id]).length;
  return `<div class="scene trophies-scene t3 t4"><div class="scene-head"><span class="scene-tag">Osiągnięcia</span><h2>🏆 TROFEA KANTO — ${taken}/${cards.length} ZDOBYTE</h2>${CLOSE_X}</div>
    <p class="small center">${cards.length} trofeów wylosowanych na tę grę. Kto pierwszy, ten lepszy — każde ma jednego właściciela.</p>
    <div class="t3-totals">${totals}</div>
    <div class="trophy4-grid">${tiles}</div>
    <p class="small center muted">Punkty osiągnięć to dodatkowa rywalizacja — nie zmieniają Mistrza Ligi ani końca gry.</p>
    <div class="row center">${uiBtn('close-panel', 'Zamknij', 'ghost')}</div></div>`;
}
function sceneTrophies(view, playerId = null) {
  if (view.trophies?.active) return sceneTrophies4(view);
  if (view.trophies) return sceneTrophies3(view);
  const player = view.players.find((p) => p.id === playerId) ?? currentPlayer(view);
  if (!player.achievements) return '';
  const rows = achievementProgress(player, view.config);
  const byCat = Object.entries(ACHIEVEMENT_CATEGORIES_PL).map(([cat, label]) => {
    const list = rows.filter((a) => a.category === cat);
    if (!list.length) return '';
    return `<div class="trophy-cat"><h3>${esc(label)}</h3>${list.map((a) => `<div class="trophy${a.earned != null ? ' earned' : ''}"><span class="trophy-icon">${a.earned != null ? '🏆' : a.icon}</span><div><b>${esc(a.name)}</b> <small>${esc(a.pl)}</small><p class="small">${esc(a.text)}</p></div><span class="trophy-state">${a.earned != null ? `✓ tydz. ${a.earned}` : `${a.value} / ${a.target}`}</span></div>`).join('')}</div>`;
  }).join('');
  const tabs = view.players.length > 1 ? `<div class="row center trophy-tabs">${view.players.map((p) => `<button class="${p.id === player.id ? 'primary' : 'ghost'} small" data-ui="open-trophies" data-player="${esc(p.id)}">${avatarToken(p, 'small')} ${esc(p.name)} · ${p.achievements ? achievementPoints(p, view.config) : 0} pkt</button>`).join('')}</div>` : '';
  return `<div class="scene trophies-scene"><div class="scene-head"><span class="scene-tag">Osiągnięcia</span><h2>🏆 ${esc(player.name)}</h2><span class="tag">${achievementPoints(player, view.config)} pkt</span></div>
    ${tabs}<div class="trophy-grid">${byCat}</div>
    <p class="small center muted">Punkty są na próbę — dziś nie zmieniają końca gry.</p>
    <div class="row center">${uiBtn('close-panel', 'Zamknij', 'ghost')}</div></div>`;
}

// One Kanto day 14.10 (rules.pvp): a friendly duel — the challenge, one Pokémon each, then the battle table
// (the same arena as every battle: two cards, the dice in the middle; the side whose move it is attacks).
function sceneDuel(view, ui, canAct, reveal = null) {
  const d = view.pvp;
  const legal = canAct ? getLegalActions(view) : [];
  const name = (id) => view.players.find((x) => x.id === id).name;
  const head = (title) => `<div class="scene-head"><span class="scene-tag">Pojedynek</span><h2>${title}</h2><span class="tag">bez akcji</span></div>`;
  const rule = '<p class="small center muted">Pojedynek na niby: bez łapania i bez nagród. Po walce Pokémony wracają do zdrowia.</p>';
  if (d.stage === 'ask') {
    const accept = legal.find((a) => a.type === 'pvpAccept');
    return `<div class="scene trade-scene">${head(`⚔️ ${esc(name(d.a))} wyzywa ${esc(name(d.b))}!`)}
      <p class="trade-summary">Jeden Pokémon na jednego.</p>${rule}
      <div class="row center">${accept ? btn(accept, `✓ ${esc(name(d.b))}: przyjmuję!`, 'primary') : ''}${legal.some((a) => a.type === 'pvpCancel') ? btn({ type: 'pvpCancel' }, 'Nie teraz', 'ghost') : ''}</div></div>`;
  }
  if (d.stage === 'pick') {
    const side = (id) => {
      const p = view.players.find((x) => x.id === id);
      const card = (m) => {
        const a = legal.find((x) => x.type === 'pvpPick' && x.by === id && x.target === m.uid);
        const chosen = d.pick[id] === m.uid;
        return `<div class="pick${chosen ? ' chosen' : ''}">${pokemonCard(m, { size: 's', growth: growthRules(view), family: true })}${chosen ? '<b class="ok">✓ wybrany</b>' : a ? btn(a, 'Ten walczy', 'mini') : ''}</div>`;
      };
      return `<div class="trade-side"><h3>${avatarToken(p, 'small')} ${esc(p.name)}</h3><div class="pick-row">${p.team.filter((m) => m.hp > 0).map(card).join('')}</div></div>`;
    };
    return `<div class="scene trade-scene">${head('⚔️ Kto walczy?')}<div class="trade-sides">${side(d.a)}${side(d.b)}</div>${rule}
      <div class="row center">${legal.some((a) => a.type === 'pvpCancel') ? btn({ type: 'pvpCancel' }, 'Anuluj', 'ghost') : ''}</div></div>`;
  }
  const [pa, pb] = [d.a, d.b].map((id) => view.players.find((x) => x.id === id));
  const [ma, mb] = [pa, pb].map((p) => p.team.find((m) => m.uid === d.pick[p.id]));
  const step = reveal?.steps[reveal.i] ?? null;
  const mover = step?.type === 'attack' ? (step.attackerUid === ma.uid ? pa.id : pb.id) : step ? null : d.next;
  // PLAYTEST_007 2C: the type hint as in every battle — or hidden at the table's wish (⚙️ „Pojedynki: przewaga typów”);
  // the types still count in the roll either way (the math is the engine's)
  const fight = (x, y) => (ui.duelHints === false ? null : { type: typeHint(x, y, view.config).mod });
  const card = (p, m, foe) => pokemonCard(m, { size: 'l', label: p.name, ownerToken: playerToken(p, { size: 's' }), growth: growthRules(view), fight: fight(m, foe), actor: mover === p.id });
  const table = step ? `${renderStep(step, { rolling: reveal.rolling, view })}${uiBtn('skip', 'Pomiń ⏩', 'ghost small skip')}` : lastExchange(ui, view);
  const attack = legal.find((a) => a.type === 'pvpAttack');
  const give = legal.find((a) => a.type === 'pvpYield');
  const nextMon = d.next === pa.id ? ma : mb;
  const choices = `<div class="battle-actions">${attack ? btn(attack, `⚔️ ${esc(name(attack.by))}: atakuj!`, 'act-attack primary') : `<button class="act-attack" disabled>⚔️ ${esc(name(d.next))}: atakuj!</button>`}
      ${moveButton(view, nextMon, legal.find((a) => a.type === 'pvpMove') ?? null, d.used)}
      ${give ? btn(give, 'Poddaję się', 'ghost small') : ''}</div>`;
  return `<div class="scene encounter compact k-duel"><div class="scene-head"><span class="scene-tag">Pojedynek</span><h2>⚔️ ${esc(pa.name)} kontra ${esc(pb.name)}</h2></div>
    <div class="arena">
      <div class="side mine">${card(pa, ma, mb)}</div>
      <div class="middle"><div class="exchange-area">${table}</div>${choices}</div>
      <div class="side theirs">${card(pb, mb, ma)}</div>
    </div></div>`;
}

// One Kanto day 14.10 (rules.trading): two players at one Poké Stop swap one Pokémon each. One device, both
// sides on screen: each picks „Daję tego”, both see the summary, both tap „Zgoda” — or anyone „Anuluj”.
function sceneTrade(view) {
  const t = view.trade;
  const legal = getLegalActions(view);
  const side = (id) => {
    const p = view.players.find((x) => x.id === id);
    const picks = legal.filter((a) => a.type === 'tradePick' && a.by === id);
    const card = (m) => {
      const a = picks.find((x) => x.target === m.uid);
      const chosen = t.pick[id] === m.uid;
      return `<div class="pick${chosen ? ' chosen' : ''}">${pokemonCard(m, { size: 's', growth: growthRules(view), family: true })}<small>${p.team.includes(m) ? 'drużyna' : 'Box'}</small>${chosen ? '<b class="ok">✓ wybrany</b>' : a ? btn(a, 'Daję tego', 'mini') : ''}</div>`;
    };
    return `<div class="trade-side"><h3>${avatarToken(p, 'small')} ${esc(p.name)}</h3><div class="pick-row">${[...p.team, ...p.reserve].map(card).join('')}</div></div>`;
  };
  const name = (id) => view.players.find((x) => x.id === id).name;
  const mon = (id) => [...view.players.find((x) => x.id === id).team, ...view.players.find((x) => x.id === id).reserve].find((m) => m.uid === t.pick[id]);
  const summary = mon(t.a) && mon(t.b) ? `<p class="trade-summary"><b>${esc(name(t.a))}</b> daje <b>${esc(getSpecies(mon(t.a).species).name)}</b> ↔ <b>${esc(name(t.b))}</b> daje <b>${esc(getSpecies(mon(t.b).species).name)}</b></p>` : '<p class="trade-summary muted">Każdy wybiera jednego Pokémona.</p>';
  const problem = mon(t.a) && mon(t.b) ? tradeProblem(view) : null;
  const agree = (id) => (t.agree[id] ? `<span class="tag ok">✓ ${esc(name(id))} się zgadza</span>` : (legal.find((a) => a.type === 'tradeAgree' && a.by === id) ? btn({ type: 'tradeAgree', by: id }, `✓ ${esc(name(id))}: zgoda`, 'primary') : ''));
  return `<div class="scene trade-scene"><div class="scene-head"><span class="scene-tag">Poké Stop</span><h2>🔄 Wymiana Pokémonów</h2><span class="tag">bez akcji</span></div>
    ${summary}${problem ? `<p class="small center bad">Nie da się: ${esc(problem === `${name(t.a)} would have no healthy Pokémon in the team` || problem === `${name(t.b)} would have no healthy Pokémon in the team` ? 'ktoś zostałby bez zdrowego Pokémona w drużynie' : 'oboje muszą stać w tym samym Poké Stopie')}</p>` : ''}
    <div class="row center">${agree(t.a)}${agree(t.b)}${btn({ type: 'tradeCancel' }, 'Anuluj', 'ghost')}</div>
    <div class="trade-sides">${side(t.a)}${side(t.b)}</div>
    <p class="small center muted">Wymiana nic nie kosztuje. Pokémon przechodzi cały — z HP i treningiem.</p></div>`;
}

// Macro 01: who goes on the Research Job — one tap per Pokémon; the last one starts it.
function sceneOakDraft(view, canAct) {
  const player = currentPlayer(view);
  const draft = view.oakJobDraft;
  const spec = view.config.oak.jobs[draft.job];
  const picks = canAct ? getLegalActions(view).filter((a) => a.type === 'oakJobPick') : [];
  const all = [...player.team, ...player.reserve];
  const chosen = draft.picked.map((uid) => all.find((m) => m.uid === uid)).filter(Boolean);
  const card = (a) => {
    const mon = all.find((m) => m.uid === a.target);
    const from = player.team.includes(mon) ? 'z drużyny' : 'z Boxu';
    const fresh = usesResearch(view) && !(player.oakStudied ?? []).includes(mon.species) ? ' · 🔬 nowy dla Oaka' : '';
    return `<div class="pick">${pokemonCard(mon, { size: 's', growth: growthRules(view), family: true })}<small>${from}${fresh}</small>${btn(a, 'Do pracy', 'primary')}</div>`;
  };
  return `
    <div class="scene oak-pick">
      <div class="scene-head"><span class="scene-tag">Profesor Oak</span><h2>🔬 ${JOB_PL[draft.job]}: kto idzie do pracy?</h2><span class="tag">${draft.picked.length}/${spec.size}</span></div>
      ${chosen.length ? `<p class="center">Idą: <b>${chosen.map((m) => esc(getSpecies(m.species).name)).join(', ')}</b></p>` : ''}
      <div class="pick-row">${canAct ? picks.map(card).join('') : `<span class="thinking">${esc(player.name)} wybiera…</span>`}</div>
      <p class="small center">Ostatni wybór zaczyna zadanie (${view.config.oak.jobCost} akcja). Wracają za ${turnsPl(spec.turns)} z nagrodą: ${jobPayPl(view, draft.job, spec)}. Drużyna zatrzymuje zdrowego Pokémona.</p>
      <div class="row center">${canAct ? btn({ type: 'oakJobCancel' }, 'Anuluj', 'ghost') : ''}</div>
    </div>`;
}

function sceneLoot(view, canAct) {
  const opts = canAct ? getLegalActions(view).filter((a) => a.type === 'giveLoot') : [];
  const player = currentPlayer(view);
  return `
    <div class="scene loot">
      <div class="event-card">
        <span class="scene-tag rocket">Team Rocket</span><h2>😼 Meowth chce przedmiot!</h2>
        <p>Wybierz, co oddasz. Trafi na kartę spisku i wróci, gdy ktoś pokona Team Rocket.</p>
        <div class="shop-tray">${opts.map((a) => `<button class="tray-item" ${actAttr(a)}><span class="tray-token">${itemToken(a.item, 54)}</span><b>${ITEM_PL[a.item] ?? a.item}</b><small>masz ${itemCount(player, a.item)}</small></button>`).join('') || '<span class="thinking">Wybór…</span>'}</div>
        ${rocketPlotCard(view, { size: 's' })}
      </div>
    </div>`;
}

function sceneLeague(view, canAct) {
  const player = currentPlayer(view);
  const lance = LEAGUE.stages[1];
  const legal = canAct ? getLegalActions(view) : [];
  const cards = player.team.map((m) => {
    const acts = legal.filter((a) => (a.type === 'useItem' || a.type === 'setLead') && a.target === m.uid)
      .map((a) => btn(a, a.type === 'setLead' ? 'Prowadź' : `${itemIc(a.item)} ${ITEM_PL[a.item]}`, 'mini')).join(''); // every healing item of this game (Gameplay P1: + Super Potion)
    // PT006-06: the type +/- against the next opponent's first Pokémon, as before the first battle
    return `<div class="card-with-actions">${pokemonCard(m, { size: 's', lead: m === getLead(player), growth: growthRules(view), family: true })}${m.hp > 0 ? matchupBadges(view, m, leagueStageTeam(view, 1)[0]) : ''}<div class="pcard-actions">${acts}</div></div>`;
  }).join('');
  return `
    <div class="scene league-break">
      <div class="event-card">
        <span class="scene-tag league">Liga — przerwa</span><h2>🎀 Elitarna Czwórka pokonana!</h2>
        <p><b>Bez pełnego leczenia:</b> obrażenia zostają. Możesz użyć ${usableItems(view.config).map((id) => ITEM_PL[id]).join(' / ')} i wybrać prowadzącego. Potem ${esc(LEAGUE_STAGE_PL.lance)} i ${esc(leagueStageTeam(view, 1).map((id) => getSpecies(id).name).join(', '))}.</p>
        <div class="team-row center">${cards}</div>
        <div class="row center">${canAct ? btn({ type: 'continueLeague' }, '👑 Dalej: walka z Lance’em', 'primary big') : '<span class="thinking">Przygotowania…</span>'}</div>
      </div>
    </div>`;
}

// Build 3.3 B33-3: the intermission of a gym chain / League v2 — no Poké Stop,
// damage stays; items and the lead, then the next battle or leave (the attempt
// starts over next time).
function sceneChallenge(view, canAct) {
  const player = currentPlayer(view);
  const c = view.challenge;
  const all = chainOpponents(view, c);
  const beaten = all[c.stage];
  const next = all[c.stage + 1];
  const legal = canAct ? getLegalActions(view) : [];
  const cards = player.team.map((m) => {
    const acts = legal.filter((a) => (a.type === 'useItem' || a.type === 'setLead') && a.target === m.uid)
      .map((a) => btn(a, a.type === 'setLead' ? 'Prowadź' : `${itemIc(a.item)} ${ITEM_PL[a.item]}`, 'mini')).join('');
    // PT006-06: the type +/- against the next opponent's first Pokémon — before every trainer and the leader
    return `<div class="card-with-actions">${pokemonCard(m, { size: 's', lead: m === getLead(player), growth: growthRules(view), family: true })}${m.hp > 0 && next ? matchupBadges(view, m, next.team[0]) : ''}<div class="pcard-actions">${acts}</div></div>`;
  }).join('');
  const league = c.kind === 'league';
  const ribbon = league && next?.champion;
  const go = legal.some((a) => a.type === 'continueChallenge');
  return `
    <div class="scene league-break challenge-break">
      <div class="event-card">
        <span class="scene-tag ${league ? 'league' : 'gym'}">${league ? 'Liga — przerwa' : 'Sala — przerwa'}</span>
        <h2>${ribbon ? '🎀 Elitarna Czwórka pokonana!' : `Wygrana z: ${esc(chainName(beaten))}!`}</h2>
        ${chainStrip(view, c, c.stage + 1)}
        <p><b>Bez Poké Stopu:</b> obrażenia zostają. Możesz użyć ${usableItems(view.config).map((id) => ITEM_PL[id]).join(' / ')} i wybrać prowadzącego.</p>
        <div class="team-row center">${cards}</div>
        <div class="next-up">${chainToken(next, 's')}<b>Dalej: ${esc(chainName(next))}</b><div class="roster-cards">${next.team.map((id) => speciesCard(id, { size: 'xs' })).join('')}</div></div>
        <div class="row center">${canAct ? `${go ? btn({ type: 'continueChallenge' }, `${league && next.champion ? '👑' : league ? '🏆' : '🏟️'} Dalej: ${esc(chainName(next))}`, 'primary big') : ''}${btn({ type: 'quitChallenge' }, '🚪 Wyjdź', 'ghost')}` : '<span class="thinking">Przygotowania…</span>'}</div>
        ${canAct ? `<p class="small muted">Wyjście albo przegrana: następnym razem ${league ? 'Liga' : 'sala'} od początku.${ribbon ? ' Wstęga zostaje w gablocie.' : ''}</p>` : ''}
      </div>
    </div>`;
}

// EREV-02: what „Porzuć” means, said before the tap.
function dropNote(view, player, a, q) {
  const keys = (player.questRecords.occ[a.occ]?.keys ?? []).filter((k) => player.questBook.keyItems.includes(k));
  const back = keys.length ? ` ${keys.map(keyItemPl).join(', ')} wraca.` : '';
  if (q.repeat !== 'never' || view.config.rules.questAbandon === 'v2') return `Porzucone zadanie możesz wziąć znowu — zaczniesz od początku.${back}`;
  return 'Porzucone zadanie nie wróci w tej grze.';
}

// Build 3.3 E5: a pilot gym's trial on its card — open, the steps (with progress), or passed.
function trialBox(view, player, gym) {
  const entry = view.gymTrials?.byGym[gym.id];
  if (!entry || !player.knownTrials) return '';
  if (entry.mode === 'open') return '<div class="trial-box open">🏟️ Próba sali: <b>bez próby</b> — sala otwarta.</div>';
  if (player.trialsDone.includes(gym.id)) return '<div class="trial-box done">🏟️ Próba sali: <b>zaliczona ✓</b></div>';
  const t = (player.questBook.trials ?? []).find((x) => x.gym === gym.id);
  if (!t) return '<div class="trial-box">🏟️ Próba sali: ???</div>';
  const q = bookQuest(t.questId);
  const steps = q.stages[t.stage]?.objectives.map((o, i) => {
    const d = objectiveProgress(player, t, o, i);
    const n = objectiveTarget(o);
    return `<li class="${d >= n ? 'done' : ''}">${d >= n ? '✓ ' : ''}${esc(bookStepPl(o, d, n).replace('Wyzwanie z misji', 'Wyzwanie z próby'))}</li>`;
  }).join('') ?? '';
  return `<div class="trial-box ${entry.mode}">🏟️ Próba sali (${entry.mode === 'short' ? 'krótka' : 'specjalna'}):<ul class="book-steps">${steps}</ul></div>`;
}

// Build 3.3 E3: the quest book — your quests (the next step, its place, the reward),
// what can be taken here, the quest challenge, collecting the reward. Kid-simple: one
// sentence per step, the place, icons for the reward.
// PLAYTEST_007 stage 4: a place in the Journal → the map shows it (the Pokédex's „Gdzie szukać”, M02-1) and the bar
// offers „📖 Wróć do Dziennika” (main.js locate-place). „Każdy Poké Stop” is no one place: said, not pointed at.
function placeBtn(place, activityId) {
  if (!place || place === 'pokeStop') return place === 'pokeStop' ? '<span class="j-place any">📍 każdy Poké Stop</span>' : '';
  return `<button class="j-place" data-ui="locate-place" data-place="${esc(place)}" data-journal="${esc(activityId)}" aria-label="Pokaż na mapie: ${esc(placeName(place))}">📍 ${esc(placeName(place))}</button>`;
}
// „Porzuć” is destructive: the first tap asks, the second (the engine's legal action) gives up
function abandonBtns(ui, drop) {
  if (!drop) return '';
  return ui.confirmAbandon === drop.occ
    ? `${btn(drop, 'Na pewno porzucić?', 'ghost small danger')}${uiBtn('journal-abandon-cancel', 'Nie', 'ghost small')}`
    : uiBtn('journal-abandon', 'Porzuć', 'ghost small', `data-occ="${esc(drop.occ)}"`);
}

// PLAYTEST_009 (PT009-02): a card opened from the HUD closes STRAIGHT to the map — ✕ (and Escape, a tap on the dimmed
// map: main.js) — „← Lista” stays the separate way to the Journal's list.
const CLOSE_X = uiBtn('close-panel', '✕', 'scene-x', 'aria-label="Zamknij — wróć do mapy"');

// PLAYTEST_008 (Piotr 15.10): ONE tile for every activity of the Journal — a quest of the book, a mission card, an
// expedition, a rumour, an offer, a finished one. The full card art on the left (3 : 4, never a thumbnail); on the
// right, as tall as the card: the kind in the frame's top-left corner (its colour), the status top right (green
// „Aktywna”), the title, and always the same rows in the same words — Opis · Cel · Dokąd (a place → the map) · Nagroda.
const TILE_STATUS = { taken: ['off', 'Zabrane'], accepted: ['on', 'Aktywna'], inProgress: ['on', 'Aktywna'], ready: ['ready', 'Gotowa — odbierz'], heard: ['new', 'Usłyszana'], available: ['new', 'Do wzięcia'], completed: ['off', 'Ukończona'], abandoned: ['off', 'Porzucona'] };
const TILE_ACT = { claimQuest: '🎁 Odbierz nagrodę', questChallenge: '⚔️ Wyzwanie z misji (1 akcja)', questEncounter: '📍 Spotkanie z wyprawy (1 akcja)', takeQuest: '📜 Weź zadanie', takeOffer: '📋 Weź zlecenie' };
const REWARD_TOKENS = REWARD_TOKEN_TYPES;
const tileKind = (e) => { const k = activityKind(e); return [k.cls, k.label, k.icon]; }; // journal.ACTIVITY_KINDS (the HUD's too)
// the reward as everywhere: the item tokens; in words only what has no token (a Pokémon, a clue, a key item, an encounter)
function tileReward(view, player, e) {
  if (e.sourceSystem === 'missionCard') return rewardTokens(questReward(QUESTS_BY_ID[e.questId], view.config).filter((r) => r.type !== 'stars'));
  const q = e.def ?? bookQuest(e.questId);
  const lines = e.section === 'done' && e.sourceSystem === 'board' ? [] : q ? rewardLines(view, player, q) : [];
  if (!lines.length) return e.rewardPreview ? esc(e.rewardPreview) : '—';
  const words = lines.filter((r) => !REWARD_TOKENS.has(r.type));
  const hint = encounterHint(q); // UX-2: the Expedition's Pokémon first (Smoczy szlak)
  return `${hint ? `<span>${esc(hint)}</span> ` : ''}${rewardTokens(lines.filter((r) => REWARD_TOKENS.has(r.type)))}${words.length ? ` <span>${esc(rewardPl(words))}</span>` : ''}`;
}
function tileGoal(player, e) {
  if (e.completionStatus === 'ready') return '✓ Gotowe — odbierz nagrodę';
  if (e.section === 'done') return esc(e.nextStep);
  if (e.sourceSystem === 'rumour') return esc(e.nextStep); // heard: first take it there (its steps: „Szczegóły”)
  const now = e.objectives.filter((o) => o.stage === 'now');
  const keys = (player.questRecords?.occ[e.occ]?.keys ?? []).filter((k) => player.questBook?.keyItems.includes(k));
  const items = now.map((o) => `<span class="jt-obj${o.done ? ' done' : ''}">${o.done ? '✓ ' : ''}${esc(o.text)}</span>`).join('');
  return `${items}${keys.length ? `<span class="jt-obj">${gi('bag')} ${esc(keys.map((k) => keyItemPl(k, player)).join(', '))}</span>` : ''}`;
}
// PT010-03: an entry's picture (worldArt.entryArt) — a Living Kanto board card shows its ARCHETYPE's (its placeholder
// until Piotr's picture: the archetype's icon on its own colour — `ph`), every other one its quest / mission card's
const phOf = (art) => (art.cls?.startsWith('a-') ? ` ph-${art.cls}` : '');
export function activityTile(view, ui, player, e) {
  const [kind, kindLabel, icon] = tileKind(e);
  const [st, stLabel] = TILE_STATUS[e.completionStatus] ?? ['', ''];
  const art = entryArt(e, { icon, cls: kind });
  const pic = art.url ? `<img src="${esc(art.url)}" alt="" loading="lazy" decoding="async" draggable="false">` : `<span class="jt-fallback${phOf(art)}" aria-hidden="true">${art.icon}</span>`;
  const row = (label, body) => `<div class="jt-row"><small>${label}</small><div>${body}</div></div>`;
  const where = e.section === 'done' ? '—' : (e.destination ? placeBtn(e.destination, e.activityId) : 'dowolne miejsce');
  const acts = e.availableActions.filter((a) => TILE_ACT[a.type]).map((a) => btn(a, TILE_ACT[a.type], 'primary')).join('');
  const drop = e.availableActions.find((a) => a.type === 'abandonQuest');
  const asking = drop && ui.confirmAbandon === drop.occ;
  const q = e.def ?? (e.questId && e.sourceSystem !== 'missionCard' ? bookQuest(e.questId) : null);
  const sub = [e.giver ? `od: ${e.giver}` : '', e.stages > 1 && ['accepted', 'inProgress'].includes(e.completionStatus) ? `etap ${e.currentStage}/${e.stages}` : ''].filter(Boolean).join(' · ');
  return `<article class="j-tile k-${kind} st-${st || 'none'}">
    <span class="jt-kind">${kindLabel}</span>${stLabel ? `<span class="jt-status">${stLabel}</span>` : ''}
    <div class="jt-art">${pic}</div>
    <div class="jt-info">
      <h4 class="jt-title">${esc(e.title)}</h4>${sub ? `<small class="jt-giver">${esc(sub)}</small>` : ''}
      <div class="jt-rows">${row('Opis', e.description && e.sourceSystem !== 'missionCard' ? esc(e.description) : '—')}${row('Cel', tileGoal(player, e))}${row('Dokąd', where)}${row('Nagroda', tileReward(view, player, e))}</div>
      ${e.blockedReason && e.blockedCode !== 'goTo' ? `<p class="book-now wait">${esc(e.blockedReason)}</p>` : ''}
      ${asking && q ? `<p class="book-drop muted">${esc(dropNote(view, player, player.questBook.active.find((x) => x.occ === drop.occ), q))}</p>` : ''}
      <div class="jt-acts">${acts}${abandonBtns(ui, drop)}${uiBtn('journal-open', 'Szczegóły ›', 'ghost small', `data-id="${esc(e.activityId)}"`)}</div>
    </div>
  </article>`;
}

// The TRAINER JOURNAL (PLAYTEST_007 stage 4 — the quest book grown into the one place for every activity; a read-only
// projection: table/journal.js). All sections by default, a tab filters; a card opens its detail (ui.journalPick).
// PLAYTEST_008: every list is made of the same tile (activityTile).
function sceneBook(view, ui, canAct) {
  const player = currentPlayer(view);
  if (!player.questBook) return ''; // older games have no quest book
  const legal = canAct ? getLegalActions(view) : [];
  const act = (type, key, val) => legal.find((a) => a.type === type && a[key] === val);
  const J = journal(view, player);
  const byId = new Map(J.entries.map((e) => [e.activityId, e]));
  if (ui.journalPick && byId.has(ui.journalPick)) return journalDetail(view, ui, byId.get(ui.journalPick), act);
  const tiles = (section, pred = () => true) => J.entries.filter((e) => e.section === section && pred(e)).map((e) => activityTile(view, ui, player, e));
  const mineList = tiles('mine');
  const expList = tiles('expeditions');
  const rumourList_ = tiles('rumours');
  const hereList = tiles('available', (e) => e.availableActions.length > 0 || e.sourceSystem === 'board'); // Living Kanto 2.0: a board card shows its reason too („Zabrane przez: Misty”)
  const doneList = tiles('done');
  const fightFor = (gymId) => { const t = (player.questBook.trials ?? []).find((x) => x.gym === gymId); const f = t && act('questChallenge', 'occ', t.occ); return f ? `<div class="row">${btn(f, '⚔️ Wyzwanie z próby (1 akcja)', 'primary')}</div>` : ''; };
  // E5: the trials this player knows (pilot gyms), with ??? for those not yet visited
  const trials = view.gymTrials ? Object.keys(view.gymTrials.byGym).map((gymId) => {
    const g = GYMS_BY_ID[gymId];
    const known = player.knownTrials.includes(gymId);
    return `<div class="book-card trial"><div class="book-head"><b>Sala w ${esc(getLocation(g.city).name)}</b><small>${esc(leaderPl(g))}</small></div>${known ? trialBox(view, player, g) : '<div class="trial-box">🏟️ ??? — odwiedź miasto, by poznać próbę</div>'}${fightFor(gymId)}</div>`;
  }).join('') : '';
  // the sections (PLAYTEST_007 stage 4): all by default; a tab shows one — each tab counts the cards it shows
  const counts = { mine: mineList.length, expeditions: expList.length, rumours: rumourList_.length, available: hereList.length, done: doneList.length };
  const count = (key) => counts[key];
  const tab = ui.journalTab ?? 'all';
  const show = (key) => tab === 'all' || tab === key;
  const tabs = [{ key: 'all', label: 'Wszystko' }, ...JOURNAL_SECTIONS].map((t) => `<button class="j-tab${tab === t.key ? ' on' : ''}" data-ui="journal-tab" data-tab="${t.key}">${t.label}${t.key === 'all' ? '' : ` <small>${count(t.key)}</small>`}</button>`).join('');
  const L = J.limits;
  const limits = `Misje z księgi ${L.book.used}/${L.book.max} · ${L.rumour.max === null ? `plotki i wyprawy ${L.rumour.used} (bez limitu)` : `plotka / wyprawa ${L.rumour.used}/${L.rumour.max}`} · karty misji ${L.cards.used}/${L.cards.max}`;
  const section = (key, title, list, empty) => (show(key) ? `<h3>${title}</h3>${list.length ? `<div class="j-tiles">${list.join('')}</div>` : `<p class="muted small">${empty}</p>`}` : '');
  return `<div class="scene book-scene journal"><div class="scene-head"><span class="scene-tag">Dziennik Trenera</span><h2>${esc(player.name)}</h2><small class="j-limits">${limits}</small>${CLOSE_X}</div>
    <div class="j-tabs" role="tablist">${tabs}</div>
    ${section('mine', 'Moje misje', mineList, 'Nie masz misji — weź je w Poké Stopie.')}
    ${trials && show('mine') ? `<h3>Próby sal</h3><div class="book-cards">${trials}</div>` : ''}
    ${section('expeditions', 'Wyprawy', expList, 'Żadnej wyprawy — o wyprawach mówią plotki.')}
    ${section('rumours', 'Plotki', rumourList_, 'Jeszcze żadnej plotki — słychać je w Poké Stopach.')}
    ${section('available', 'Dostępne tutaj', hereList, 'Tutaj nie ma zadań do wzięcia.')}
    ${section('done', 'Ukończone i porzucone', doneList, 'Jeszcze nic.')}
    <div class="row center">${uiBtn('close-panel', 'Zamknij', 'ghost')}</div></div>`;
}

// PLAYTEST_007 stage 4: one activity — the picture on one side; the name, what it is, every step (done ✓, now, later),
// the reward, the next step and the places on the other; the engine's legal actions only.
// PLAYTEST_010 (PT010-01, Piotr: the window was far too big): the Journal tile's layout in a small window (the table layer
// `compact`: the picture ~200 px wide, never the window's 38 %) — LEFT the picture; RIGHT the title, Cel (every step),
// Postęp, Dokąd, Nagroda and the actions. ‹ Poprzednia · MISJA 2/4 · Następna › walk through the HUD's list (hudCarousel:
// every active activity, then the rumours heard) — a swipe or ← / → too (main.js); nothing is copied out of the Journal.
const progressPl = (e) => (e.completionStatus === 'ready' ? '✓ gotowe — odbierz nagrodę'
  : e.completionStatus === 'heard' ? 'jeszcze nie przyjęta'
    : e.section === 'done' ? '—'
      : `${e.stages > 1 ? `etap ${e.currentStage}/${e.stages} · ` : ''}${e.progress.done}/${e.progress.total}`);
function detailNav(view, player, e) {
  const list = hudCarousel(view, player).map((x) => x.activityId);
  const at = list.indexOf(e.activityId);
  if (at < 0 || list.length < 2) return '';
  const nav = (id, dir, label) => (id ? `<button class="ghost small jc-btn" data-ui="journal-open" data-id="${esc(id)}" data-nav="${dir}">${label}</button>` : `<button class="ghost small jc-btn" disabled>${label}</button>`);
  return `<div class="j-carousel">${nav(list[at - 1], 'prev', '‹ Poprzednia')}<span class="jc-count">MISJA ${at + 1}/${list.length}</span>${nav(list[at + 1], 'next', 'Następna ›')}</div>`;
}
function journalDetail(view, ui, e, act) {
  const player = currentPlayer(view);
  const [kind, kindLabel, icon] = tileKind(e); // PLAYTEST_008: the tile's kind, status and rows
  const [st, stLabel] = TILE_STATUS[e.completionStatus] ?? ['', ''];
  const art = entryArt(e, { icon, cls: kind });
  const pic = art.url ? `<img class="j-art" src="${esc(art.url)}" alt="" draggable="false">` : `<div class="j-art fallback${phOf(art)}" aria-hidden="true">${art.icon}</div>`;
  const objectives = e.objectives.map((o) => `<li class="j-obj ${o.stage}${o.done ? ' done' : ''}">${o.done ? '✓ ' : o.stage === 'later' ? '… ' : ''}${esc(o.text)}${o.place && o.stage !== 'past' && !o.done ? ` ${placeBtn(o.place, e.activityId)}` : ''}</li>`).join('');
  const acts = e.availableActions.filter((a) => TILE_ACT[a.type]).map((a) => btn(a, TILE_ACT[a.type], 'primary')).join('');
  const drop = e.availableActions.find((a) => a.type === 'abandonQuest');
  const row = (label, body) => `<div class="jt-row"><small>${label}</small><div>${body}</div></div>`;
  const sub = e.giver ? `od: ${e.giver}` : '';
  return `<div class="scene book-scene journal-detail"><div class="scene-head"><span class="scene-tag">Dziennik Trenera</span>${detailNav(view, player, e)}${uiBtn('journal-back', '← Lista', 'ghost small')}${CLOSE_X}</div>
    <div class="j-detail j-tile k-${kind} st-${st || 'none'}" data-swipe="journal"><span class="jt-kind">${kindLabel}</span>${stLabel ? `<span class="jt-status">${stLabel}</span>` : ''}<div class="jd-art">${pic}</div><div class="j-info">
      <h3 class="jt-title">${esc(e.title)}</h3>${sub ? `<small class="jt-giver">${esc(sub)}</small>` : ''}
      <div class="jt-rows">${e.description && e.sourceSystem !== 'missionCard' ? row('Opis', `<span class="j-desc">${esc(e.description)}</span>`) : ''}${row('Cel', objectives ? `<ol class="j-objectives">${objectives}</ol>` : esc(e.nextStep))}${row('Postęp', esc(progressPl(e)))}${row('Dokąd', e.destination ? placeBtn(e.destination, e.activityId) : e.section === 'done' ? '—' : 'dowolne miejsce')}${row('Nagroda', tileReward(view, player, e))}</div>
      ${e.blockedReason && e.blockedCode !== 'goTo' ? `<p class="book-now wait">${esc(e.blockedReason)}</p>` : ''}
      ${acts || drop ? `<div class="jt-acts">${acts}${abandonBtns(ui, drop)}</div>` : ''}
    </div></div></div>`;
}

function hofTitles(view) {
  return (view.endgame.hallOfFame?.titles ?? []).map((t) => {
    const def = HALL_OF_FAME.find((h) => h.id === t.id);
    const pl = HOF_PL[t.id] ?? { title: def?.title ?? t.id, measure: '' };
    const holders = t.holders.map((id) => view.players.find((p) => p.id === id).name).join(' i ');
    return `<div class="hof-card${t.holders.length ? '' : ' empty'}"><span class="hof-icon">${def?.icon ?? '🏅'}</span><b>${esc(pl.title)}</b><small>${esc(pl.measure)}</small><div class="hof-holder">${holders ? esc(holders) : 'nikt'}${t.holders.length && t.best ? ` <small>(${t.best})</small>` : ''}</div></div>`;
  }).join('');
}

function sceneOver(view) {
  const end = view.endgame;
  const winners = end.winners.map((id) => view.players.find((p) => p.id === id));
  const titlesOf = (id) => (end.hallOfFame?.titles ?? []).filter((t) => t.holders.includes(id)).map((t) => HALL_OF_FAME.find((h) => h.id === t.id)?.icon ?? '🏅').join(' ');
  const reason = end.reason === 'champion'
    ? `${winners.length > 1 ? 'Wspólni Mistrzowie Ligi Pokémon' : 'Mistrz Ligi Pokémon'}!`
    : `Koniec czasu (tydzień ${view.config.winCondition.timeLimitWeeks}). Rozstrzygnęło: ${DECIDED_BY_PL[end.decidedBy] ?? end.decidedBy}.`;
  const results = view.players.map((p) => {
    const won = end.winners.includes(p.id);
    return `
      <div class="result-card${won ? ' winner' : ''}" style="--pc:${p.color}">
        <div class="rc-head">${avatarToken(p)}<b>${esc(p.name)}</b>${won ? '<span class="crown">👑</span>' : ''}</div>
        ${badgeCase(view, p)}
        <div class="rc-stats"><span title="złapane">📕 ${p.pokedex.caught.length}</span><span title="misje">📜 ${p.stats.quests?.completed ?? 0}</span><span title="spiski">🎈 ${p.stats.rocket?.cleared ?? 0}</span><span title="odznaki">🏅 ${p.badges.length}</span></div>
        <div class="rc-titles">${titlesOf(p.id) || '<small class="muted">bez tytułu</small>'}</div>
      </div>`;
  }).join('');
  return `
    <div class="scene over">
      <div class="end-banner"><div class="end-crown">👑</div><h2>${esc(winners.map((w) => w.name).join(' i '))}</h2><p>${esc(reason)}</p></div>
      <div class="result-row">${results}</div>
      <h3 class="center">Galeria sław</h3>
      <div class="hof-row">${hofTitles(view)}</div>
      <p class="small center">Tytuły to wspomnienie przygody — nie punkty. Nie zmieniają zwycięzcy.</p>
      <div class="row center">${uiBtn('new-game', 'Nowa gra', 'primary big')}</div>
    </div>`;
}

// Phase 3A-2.5: every Kanto Pokémon in one of four states (???, WIDZIANY,
// ZŁAPANY, EWOLUOWANY) with the legend and counts — so a child sees at once
// what the Pokédex is for: meet them, catch them, evolve them.
function sceneDex(view, playerId) {
  const player = view.players.find((p) => p.id === playerId) ?? currentPlayer(view);
  const species = [...dexSpecies(view.config)].sort((a, b) => a.dex - b.dex); // NIGHTSHIFT B: 151 in a 'kanto151' game
  const counts = Object.fromEntries(DEX_STATES.map((d) => [d.id, 0]));
  for (const s of species) counts[dexState(player, s.id)] += 1;
  const legend = DEX_STATES.map((d) => `<span class="dex-state ds-${d.id}"><b>${d.icon} ${d.label}</b><small>${esc(d.text)}</small><i>${counts[d.id]}</i></span>`).join('');
  return `
    <div class="scene dex">
      <div class="scene-head"><span class="scene-tag">Pokédex</span><h2>📕 Pokédex: ${esc(player.name)}</h2><span class="tag">${counts.caught + counts.evolved} / ${species.length} w kolekcji</span>${uiBtn('close-panel', 'Zamknij', 'ghost dex-close')}</div>
      <p class="dex-intro">Twoja kolekcja Pokémonów. Spotkaj je w drodze ${gi('dex.seen')}, złap Poké Ballem ${gi('dex.caught')} albo zdobądź przez ewolucję ✨ — zbierz wszystkie!</p>
      <div class="dex-legend wide">${legend}</div>
      <div class="dex-tiles">${species.map((s) => dexTile(player, s.id)).join('')}</div>
    </div>`;
}

// PLAYTEST_009 (PT009-16): money as a sum a six-year-old can follow — „💰 7 + 4 = 11” (green) / „💰 10 − 2 = 8” (red),
// the same everywhere (the result banner, the shop).
export function moneyMath(from, to) {
  const up = to >= from;
  return `<span class="money-math">💰 ${from} <b class="delta${up ? '' : ' minus'}">${up ? '+' : '−'} ${Math.abs(to - from)}</b> = <b class="m-total">${to}</b></span>`;
}
// PLAYTEST_010 (PT010-05): a world moment's banner (`art`: „Drużyna wyleczona”, Team Rocket, „Cisza…”, a world event,
// a quest's reward) is one card for all of them — LEFT the picture (or its placeholder), RIGHT the title, what happened,
// the result, the reward (`reward`: its tokens with their counts — PT010-04 C) and „Dalej”.
export function resultBanner(result, auto) { // exported for the Studio's preview (tools/scene-art.js)
  const w = result.wallet;
  const wallet = w ? `<p class="wallet-line">${avatarToken(w, 'small')}<b>${esc(w.name)}</b> · ${moneyMath(w.from, w.to)}</p>` : '';
  const reward = result.reward?.length ? `<div class="rb-reward"><small>NAGRODA</small><div>${rewardTokens(result.reward.filter((r) => REWARD_TOKEN_TYPES.has(r.type)))}${result.reward.some((r) => !REWARD_TOKEN_TYPES.has(r.type)) ? ` <span>${esc(rewardPl(result.reward.filter((r) => !REWARD_TOKEN_TYPES.has(r.type))))}</span>` : ''}</div></div>` : '';
  const body = `<h2>${esc(result.title)}</h2>${result.name ? `<h3 class="rb-name">${esc(result.name)}</h3>` : ''}${result.text ? `<p>${esc(result.text)}</p>` : ''}${reward}${wallet}${result.badge ? `<div class="badge-fly">${typeIcon(GYMS_BY_ID[result.badge].type)}</div>` : ''}${result.item ? `<div class="item-fly">${itemToken(result.item, 48)}<b>${esc(ITEM_PL[result.item])}</b></div>` : ''}${result.ribbon ? '<div class="badge-fly">🎀</div>' : ''}${auto ? '' : uiBtn('dismiss-result', 'Dalej ▶', 'primary big')}`;
  const cls = `result-banner tone-${result.tone}${result.handoff ? ' handoff' : ''}${result.art ? ' rb-split' : ''}`;
  return `<div class="${cls}"${result.handoff ? ` style="--pc:${result.handoff}"` : ''}>${result.art ? `${artFrame(result.art, 'rb-art')}<div class="rb-info">${body}</div>` : body}</div>`;
}
// PLAYTEST_007 stage 3 / PLAYTEST_010: an important notice — the same card as a world moment's banner when it has its
// picture (PT010-05); a quest's moment (PT010-04: MISJA UKOŃCZONA · ZADANIE GOTOWE) says its name and reward, „Dalej”.
// DEC-01 (pilot): before a legend's encounter without an Ultra Ball — the warning (Piotr's words), two ways: later / now.
export function legendWarnCard(w) {
  return `<div class="notice-card"><div class="n-icon">⚡</div><h2>Nie masz Ultra Balla!</h2><p>Możesz wrócić później. Legendarny Pokémon będzie tutaj czekał.</p><div class="row center"><button data-ui="legend-later">Wróć później</button><button data-legend-ok ${actAttr(w.action)}>Walcz mimo to</button></div></div>`;
}

export function noticeCard(n) {
  const more = n.more ? `<p class="n-more">i jeszcze ${n.more} ${n.more === 1 ? 'wiadomość' : 'wiadomości'}</p>` : '';
  const side = n.art || n.hero; // a picture or a portrait on the left: the icon goes into the title
  const info = `${side ? '' : `<div class="n-icon">${n.icon}</div>`}<h2>${side ? `${n.icon} ` : ''}${esc(n.title)}</h2>${n.name ? `<h3 class="n-name">${esc(n.name)}</h3>` : ''}${n.text ? `<p>${esc(n.text)}</p>` : ''}${n.reward ? `<p class="n-reward">${esc(n.reward)}</p>` : ''}${n.gain ? `<p class="n-reward n-gain">${esc(n.gain)}</p>` : ''}${n.where ? `<p class="n-where">${esc(n.where)}</p>` : ''}${more}<button data-ui="notice-ok">${esc(n.button ?? 'ROZUMIEM')}</button>`;
  // ACHIEVEMENTS 3.0: a new trophy — its owner's portrait token on the left (the existing token, no new picture)
  if (n.hero) return `<div class="notice-card nc-split nc-trophy"><div class="n-art n-hero">${heroToken(n.hero, 'big')}</div><div class="n-info">${info}</div></div>`;
  return n.art
    ? `<div class="notice-card nc-split${n.kind === 'quest' ? ` nc-quest nc-${n.variant}` : ''}">${artFrame(n.art, 'n-art')}<div class="n-info">${info}</div></div>`
    : `<div class="notice-card">${info}</div>`;
}

// What the Table Layer shows now. `view` is the state to draw (the pre-action
// copy while a reveal plays), `state` the live one.
// Playtest 004 (DQ-107): who the coming battle is against — before a challenge
// the team it will meet (built from the same data as the battle), else the
// battle's own; `first` is the Pokémon the lead faces.
function leadPickFoe(view) {
  const player = currentPlayer(view);
  const prep = view.battlePrep;
  if (!prep) {
    const enc = view.encounter;
    // PLAYTEST_007 2B: the pick after a KO happens in any battle — a wild one has no trainer team.
    // PLAYTEST_011 P1 (Piotr 18.10): a battle under way shows its opponents AS THEY ARE — `mons`, the encounter's own
    // Pokémon (their hearts, max HP and status), never a fresh species card with full HP (wild, trainer, gym chain,
    // League, Team Rocket). Before a challenge (battlePrep, below) the team stays a preview.
    if (enc.kind === 'wild') return { kind: 'wild', team: [enc.pokemon.species], mons: [enc.pokemon], token: null, name: `Dziki ${getSpecies(enc.pokemon.species).name}` };
    return { kind: enc.kind, team: enc.trainer.pokemonTeam.map((m) => m.species), mons: enc.trainer.pokemonTeam, token: opponentTokenId(enc, view.config), name: opponentLabel(enc, view.config) };
  }
  if (prep.challenge === 'gym') {
    const gym = gymHere(view, player);
    if (usesGymChain(view.config)) { // B33-3: the chain opens with the gym's trainer
      const first = chainOpponents(view, { kind: 'gym', gymId: gym.id, tier: gymTier(view, player) })[0];
      return { kind: 'gym', team: first.team, token: first.archetype ?? gymTokenId(gym.id), name: chainName(first) };
    }
    return { kind: 'gym', team: gymRow(gym, gymTier(view, player), view.config), token: gymTokenId(gym.id), name: leaderPl(gym) };
  }
  if (prep.challenge === 'league') {
    if (usesLeagueChallenge(view.config)) { // B33-3: always Lorelei first
      const first = chainOpponents(view, { kind: 'league' })[0];
      return { kind: 'league', team: first.team, token: leagueTokenId(first.name), name: chainName(first) };
    }
    const i = leagueStartStage(view, player);
    const stage = LEAGUE.stages[i];
    return { kind: 'league', team: leagueStageTeam(view, i), token: leagueTokenId(stage.trainers[0]), name: LEAGUE_STAGE_PL[stage.id] ?? stage.name };
  }
  const team = rocketTeam(view, plotCard(activePlot(view)));
  return { kind: 'rocket', team, token: rocketTokenId(team[0], view.config), name: 'Team Rocket' };
}

const LEAD_TAG_PL = { trainer: 'Trener', gym: 'Sala', league: 'Liga', rocket: 'Team Rocket', wild: 'Dziki Pokémon' };

// Playtest 004 (DQ-107): before a battle against a trainer, a leader, Team
// Rocket or a League stage — who starts it. One tap: that Pokémon goes first
// and the battle begins; free, the opponent does not strike. A challenge can
// still be called off here („Wróć”: no action spent).
function sceneLeadPick(view, canAct) {
  const player = currentPlayer(view);
  const lead = getLead(player);
  const foe = leadPickFoe(view);
  // PLAYTEST_007 2B: after a KO the pick faces the opponent standing NOW (not the team's first)
  const ko = view.encounter?.leadPick === 'ko';
  const nowAt = ko && view.encounter.kind !== 'wild' ? view.encounter.index : 0;
  const first = foe.team[nowAt];
  const picks = canAct ? getLegalActions(view).filter((a) => a.type === 'chooseLead') : [];
  const healthy = player.team.filter((m) => m.hp > 0);
  const card = (mon) => {
    const a = picks.find((x) => x.target === mon.uid);
    return `<div class="pick">${pokemonCard(mon, { size: 's', lead: mon === lead, growth: growthRules(view), family: true })}${matchupBadges(view, mon, first)}${a ? btn(a, '⚔️ Do walki!', 'primary') : ''}</div>`;
  };
  const roster = foe.mons
    ? foe.mons.map((m, i) => `<div class="named-card${i === nowAt ? ' first' : ''}" data-foe="${esc(m.uid)}">${pokemonCard(m, { size: 'xs', ...statusOn(view, m) })}</div>`).join('') // P1: the live HP / status
    : foe.team.map((id, i) => `<div class="named-card${i === nowAt ? ' first' : ''}">${speciesCard(id, { size: 'xs' })}</div>`).join('');
  const fainted = ko ? player.team.find((m) => m.hp <= 0) : null;
  return `
    <div class="scene lead-pick k-${foe.kind}">
      <div class="scene-head"><span class="scene-tag ${foe.kind}">${LEAD_TAG_PL[foe.kind]}</span>${foe.token ? characterToken(foe.token, { size: 'm' }) : ''}<h2>${ko ? `${esc(getSpecies(fainted?.species ?? lead.species).name)} zemdlał — kto teraz walczy?` : 'Kto zaczyna walkę?'}</h2></div>
      <div class="lp-foe"><small>${esc(foe.name)}</small><div class="roster-cards">${roster}</div></div>
      <div class="switch-panel">
        <p class="switch-rule free">${ko ? 'Za darmo — <b>wybierz, kto wchodzi do walki.</b>' : 'Za darmo — <b>przeciwnik jeszcze nie atakuje.</b>'}</p>
        <div class="pick-row">${canAct ? healthy.map(card).join('') : `<span class="thinking">${esc(player.name)} wybiera…</span>`}</div>
        ${view.battlePrep && canAct ? `<div class="row center">${btn({ type: 'cancelBattle' }, 'Wróć', 'ghost')}</div>` : ''}
      </div>
    </div>`;
}

// Growth games: after a battle, who gets the training point (only the
// Pokémon that fought — or a cocoon in the team after a win — and can use it).
function sceneGrowth(view, canAct) {
  const player = currentPlayer(view);
  const award = view.growthChoice.awards[0];
  const left = view.growthChoice.awards.length;
  const cards = growthOptions(view).map((mon) => `<div class="pick">${pokemonCard(mon, { size: 'm', growth: true, family: true })}${canAct ? btn({ type: 'assignGrowth', target: mon.uid }, `⭐ ${esc(getSpecies(mon.species).name)}`, 'primary') : ''}</div>`).join('');
  return `
    <div class="scene growth-pick">
      <div class="scene-head"><span class="scene-tag">Trening</span><h2>⭐ Kto zdobywa punkt treningu?</h2><span class="tag">${left > 1 ? `jeszcze ${left} punkty` : 'ostatni punkt'}</span></div>
      <p class="small center">Za ${award.kind === 'catch' ? 'złapanie' : 'pokonanie'}: <b>${esc(getSpecies(award.source).name)}</b>. Wybierz jednego z Pokémonów, które brały udział w walce.</p>
      <div class="pick-row">${canAct ? cards : `${cards}<span class="thinking">${esc(player.name)} wybiera…</span>`}</div>
    </div>`;
}

// PLAYTEST_011 P1 (Piotr 18.10: „jak w Heroes of Might and Magic”): the AI's turn — the map, its pawn walking, who plays
// („Teraz gra … (AI)”); never its battles, arenas, dice, catches, rewards or windows to confirm. A PRESENTATION rule only
// (ui.hideAi; ?autoplay and ?showai keep the full show): the engine plays every action as always. Shown as always: the
// game's end, a decision a human takes in the AI's turn (a trade or a duel with a human), and the panels a human opens
// to look at (🏆, the Pokédex).
export function aiHidden(view, ui) {
  if (!ui?.hideAi || !view || view.phase === 'over' || currentPlayer(view).controller !== 'ai') return false;
  const human = (id) => view.players.find((p) => p.id === id)?.controller !== 'ai';
  if (view.trade && (human(view.trade.a) || human(view.trade.b))) return false;
  if (view.pvp && (human(view.pvp.a) || human(view.pvp.b))) return false;
  return true;
}

export function renderTableLayer({ state, view, ui }) {
  setClassTable(view.config.rules.exp); // E1: power-class dots on the cards of an EXP game
  const player = currentPlayer(view);
  const canAct = player.controller === 'human' && !ui.busy && !ui.prompt;
  let scene = '';
  let fromPanel = false; // PT009-02: a panel the player opened (not a step the game waits for) — ✕ / Escape / a tap on the map close it
  const sceneName = ui.reveal?.scene ?? null;
  if (aiHidden(view, ui)) {
    // P1: the board only — or a panel a human opened to look at
    if (ui.panel === 'trophies') scene = sceneTrophies(view, ui.trophyPlayer);
    else if (ui.panel === 'dex') scene = sceneDex(view, ui.dexPlayer);
    fromPanel = Boolean(scene);
  } else if (view.growthChoice && !ui.reveal) scene = sceneGrowth(view, canAct);
  else if (view.boxChoice && !ui.reveal) scene = sceneBoxChoice(view, canAct);
  else if (view.oakJobDraft && !ui.reveal) scene = sceneOakDraft(view, canAct);
  else if (view.trade && !ui.reveal) scene = sceneTrade(view);
  else if (view.pvp) scene = sceneDuel(view, ui, canAct && !ui.reveal, ui.reveal?.scene === 'duel' ? ui.reveal : null);
  else if ((view.battlePrep || view.encounter?.leadPick) && !ui.reveal) scene = sceneLeadPick(view, canAct);
  else if (view.phase === 'encounter') scene = sceneEncounter(view, ui, canAct && !ui.reveal, ui.reveal?.scene === 'encounter' ? ui.reveal : null);
  else if (view.phase === 'event') scene = sceneEvent(view, canAct);
  else if (view.phase === 'shop') scene = sceneShop(view, canAct, ui);
  else if (view.phase === 'loot') scene = sceneLoot(view, canAct);
  else if (view.phase === 'league') scene = sceneLeague(view, canAct);
  else if (view.phase === 'challenge') scene = sceneChallenge(view, canAct);
  else if (view.phase === 'over' && !ui.reveal && !ui.result) scene = sceneOver(view);
  else if (sceneName === 'explore' || ui.panel === 'explore') {
    scene = sceneExplore(view, ui, canAct);
    fromPanel = sceneName !== 'explore';
  } else if (ui.panel) {
    fromPanel = true;
    if (ui.panel === 'gym') scene = sceneGym(view, canAct);
    else if (ui.panel === 'rest') scene = sceneRest(view, canAct);
    else if (ui.panel === 'rocket') scene = sceneRocket(view, canAct);
    else if (ui.panel === 'oak') scene = sceneOak(view, canAct);
    else if (ui.panel === 'book') scene = sceneBook(view, ui, canAct);
    else if (ui.panel === 'trophies') scene = sceneTrophies(view, ui.trophyPlayer);
    else if (ui.panel === 'dex') scene = sceneDex(view, ui.dexPlayer);
  }

  let overlay = '';
  if (ui.prompt) overlay = renderPrompt(ui.prompt.need, { tap: ui.prompt.tap }) + (ui.prompt.cancellable ? `<div class="row center">${uiBtn('cancel-prompt', 'Wróć', 'ghost')}</div>` : '');
  else if (ui.reveal && !(view.phase === 'encounter' && ui.reveal.scene === 'encounter') && !(view.pvp && ui.reveal.scene === 'duel')) {
    const step = ui.reveal.steps[ui.reveal.i];
    const wildName = ui.reveal.view.encounter?.kind === 'wild' ? getSpecies(ui.reveal.view.encounter.pokemon.species).name : 'Pokémon';
    overlay = step ? renderStep(step, { rolling: ui.reveal.rolling, wildName, view: state }) + uiBtn('skip', 'Pomiń ⏩', 'ghost small skip') : '';
  } else if (ui.result) overlay = resultBanner(ui.result, ui.result.auto);

  return { open: Boolean(scene), scene, overlay, wide: scene.includes('<div class="scene dex">'), battle: scene.includes('<div class="scene encounter'), compact: scene.includes('<div class="scene book-scene journal-detail">'), closable: Boolean(scene) && fromPanel && !overlay };
}
