// PLAYTEST_007 stage 3 (PT007-07 / 08): two levels of messages.
//   TOAST          money, ordinary progress, small rewards, EXP — the reveal's short notes and toasts, as before;
//   IMPORTANT      a new rumour a (human) player hears, a new Team Rocket plot, the balloon landing — they wait for
//                  „ROZUMIEM”: never closed by a timer, never inside the battle HUD (the reveal skips them), shown
//                  after the battle is over and its result closed, before the next turn's handoff.
// The queue is the game LOG itself (every entry has a monotone `seq`), so a reload never loses one; what the table
// already confirmed is remembered per game on this device (not in the save — no schema change), so nothing
// confirmed comes back. A game seen for the first time on this device starts from its last entry (no flood of old
// rumours from a resumed save).
// PLAYTEST_010 (PT010-04, Piotr: a mission done, its reward paid — and nobody saw it): a quest's moments are notices too,
// one per moment (several in one action: each its own card), for a HUMAN player only, from the LOG (the source of truth;
// confirmed per game on this device — a reload never shows one twice, nothing is ever paid here):
//   A  🏆 MISJA UKOŃCZONA!   a mission card done (its reward paid at once — the engine's „🏆 … completes "…"” entry) and
//                           an expedition closed by its catch (its reward is the Pokémon)
//   B  🎁 ZADANIE GOTOWE!    a quest of the book / a board card done — WHERE to collect, WHAT it will give
//   C  🎁 NAGRODA OTRZYMANA!  collecting it is the player's own action: its result banner (flow.outcomeSummaryText)
// PT010-05: every notice has its picture (worldArt: an approved picture or the moment's placeholder) on the left.
import { INCIDENT_PL, QUESTBOOK_PL, RUMOUR_PL, offerTitlePl, placeName, plotPl, questPl, rewardPl } from './content-pl.js';
import { GYMS_BY_ID } from '../data/gyms.js';
import { getSpecies } from '../data/pokemon.js';
import { QUESTS } from '../data/quests.js';
import { questReward } from '../engine/questEngine.js';
import { bookQuest, questOf, rewardLines } from '../engine/questBookEngine.js';
import { sceneArtFor } from '../data/sceneArt.js';
import { archetypeArt, incidentArt, questArt, worldArt } from './worldArt.js';
import { trophyGain, trophyList } from '../engine/achievementEngine.js';

// the engine's line for a mission card done (questEngine.completeQuest — no data of its own; the title is unique)
const MISSION_DONE = /^🏆 (.+) completes "(.+)" for /;
const EXPEDITION_DONE = /completes the expedition /;
const humanNamed = (state, name) => state.players.find((p) => p.name === name && p.controller !== 'ai') ?? null;
// NIGHTSHIFT_014 review (ChatGPT 20.10 09:27, P1): an occurrence id is PER PLAYER (questId#n — two players can both hold
// fossil-helix#1), so the owner of a book line is never „the first player holding that id”: it is the player the engine
// logged the line for (`e.player` — the book's events are the acting player's), then the player the line names, then the
// only holder; none of these → null (no notice rather than another trainer's). The engine and the ids stay as they are.
const holdsOcc = (p, occ) => Boolean(p.questBook?.active?.some((a) => a.occ === occ) || p.questRecords?.occ?.[occ]);
function ownerOfOcc(state, e) {
  const occ = e.data.book.occ;
  const holders = state.players.filter((p) => holdsOcc(p, occ));
  const logged = holders.find((p) => p.id === e.player);
  if (logged) return logged;
  const named = holders.filter((p) => (e.text ?? '').includes(p.name));
  if (named.length === 1) return named[0];
  return holders.length === 1 ? holders[0] : null;
}
const human = (p) => Boolean(p) && p.controller !== 'ai';

export const NOTICE_KEY = 'kanto.table.notices.v1';

// Is this log entry an IMPORTANT notice for the table (and so not a reveal note)?
export function isNotice(state, e) {
  const d = e?.data;
  if (!d) return false;
  if (d.rumour?.event === 'heard') return state.players.find((p) => p.id === (d.rumour.player ?? e.player))?.controller !== 'ai';
  if (d.rocket?.event === 'plot') return true;
  if (d.rocket?.event === 'drift') return Boolean(d.rocket.landed);
  // COMBAT 2.1: poison on the map — the owner's Pokémon loses a heart (or faints) at the start of the turn: it waits for
  // „ROZUMIEM”, never a note that is gone before it is read (an AI player's: a note of the reveal)
  if (d.status?.event === 'mapTick') return state.players.find((p) => p.id === d.status.player)?.controller !== 'ai';
  // ACHIEVEMENTS 3.0: a trophy won (FIRST PLAYER WINS) — by anybody, the AI too: everyone at the table learns it is taken
  if (d.achievement?.v >= 3) return true; // 'v3' / 'v4' (TROFEA KANTO): the registry's trophies
  // PT010-04: B — a quest done (collect it); A — an expedition closed by its catch
  if (d.book?.event === 'done') return human(ownerOfOcc(state, e));
  if (d.book?.event === 'claim' && EXPEDITION_DONE.test(e.text ?? '')) return human(ownerOfOcc(state, e));
  // NIGHTSHIFT_014 C (incidents: a pilot, OFF in every set): an incident starts (not one held — it would cut a road), Snorlax wakes
  // DEC-01 (pilot): a legend got its trainer — the other human players' lines for it end
  if (d.book?.event === 'legendGone') return human(state.players.find((p) => p.id === d.book.owner));
  if (d.incidents?.event === 'start') return !heldAfter(state, e);
  if (d.incidents?.event === 'flag') return d.incidents.flag === 'snorlaxAwake';
  return false;
}
// the week's „held” line (incidentEngine.incidentsWeekStart: right after the starts) names this incident
function heldAfter(state, e) {
  const i = e.seq - (state.logBase ?? 0) - 1;
  return state.log.slice(i + 1, i + 16).some((x) => x.round === e.round && x.data?.incidents?.event === 'held' && x.data.incidents.ids.includes(e.data.incidents.id));
}
// A — a mission card done: the engine's line (it carries no data)
const missionDone = (state, e) => {
  const m = e?.kind === 'quest' && !e.data ? MISSION_DONE.exec(e.text ?? '') : null;
  const quest = m ? QUESTS.find((q) => q.title === m[2]) : null;
  const player = m ? humanNamed(state, m[1]) : null;
  return quest && player ? { quest, player } : null;
};
export const isQuestNotice = (state, e) => Boolean(missionDone(state, e)) || (Boolean(e?.data?.book) && isNotice(state, e));
const isAnyNotice = (state, e) => isNotice(state, e) || Boolean(missionDone(state, e));

// A quest's title on the table (a board card: its archetype's words), its picture, its reward — for the notices
function bookTitle(state, player, occ, questId) {
  const lk = state.livingKanto?.contracts?.[player.id]?.find((c) => c.occ === occ)?.lk ?? player.questBook?.active?.find((a) => a.occ === occ)?.def?.lk;
  return { title: lk ? offerTitlePl(lk) : QUESTBOOK_PL[questId]?.title ?? questId, lk };
}
function questNoticeOf(state, e) {
  if (e.data?.book?.event === 'legendGone') {
    const b = e.data.book;
    const owner = state.players.find((p) => p.id === b.owner);
    const by = state.players.find((p) => p.id === b.by);
    const name = getSpecies(b.legend).name;
    return { seq: e.seq, kind: 'quest', variant: 'complete', icon: '⚡', title: `${name.toUpperCase()} MA TRENERA!`, name: QUESTBOOK_PL[b.quest]?.title ?? b.quest, text: `${owner?.name ?? ''}: ${by?.name ?? ''} złapał ${name}. Jest tylko jeden — Twoja historia kończy się bez legendy.`, art: { ...worldArt('quest'), url: questArt(b.quest)?.url ?? null }, button: 'Dalej' };
  }
  const done = missionDone(state, e);
  if (done) {
    const q = questPl(done.quest.id);
    const art = sceneArtFor('mission', done.quest.id);
    return { seq: e.seq, kind: 'quest', variant: 'complete', icon: '🏆', title: 'MISJA UKOŃCZONA!', name: q.title, text: `${done.player.name}: ${q.text ?? ''}`.trim(), reward: `Nagroda (już w plecaku): ${rewardPl(questReward(done.quest, state.config).filter((r) => r.type !== 'stars'))}`, art: { ...worldArt('mission'), url: art?.url ?? null }, button: 'Dalej', place: null, where: '' };
  }
  const b = e.data.book;
  const player = ownerOfOcc(state, e);
  const { title, lk } = bookTitle(state, player, b.occ, b.quest);
  const art = lk ? archetypeArt(lk.archetype) : { ...worldArt('quest'), url: questArt(b.quest)?.url ?? null };
  if (b.event === 'claim') { // A — an expedition closed by its catch: its reward is the Pokémon
    const meet = bookQuest(b.quest)?.stages.flatMap((st) => st.objectives).find((o) => o.kind === 'encounter');
    return { seq: e.seq, kind: 'quest', variant: 'complete', icon: '🏆', title: 'MISJA UKOŃCZONA!', name: title, text: `${player.name}: wyprawa skończona.`, reward: meet ? `Nagroda: ${getSpecies(meet.species).name} — złapany!` : '', art, button: 'Dalej', place: null, where: '' };
  }
  // B — done: collect it (where; what it will give, as the card says it now)
  const a = player.questBook?.active?.find((x) => x.occ === b.occ);
  const q = a ? questOf(a) : bookQuest(b.quest);
  const at = q?.claimAt;
  const where = !at || at === 'pokeStop' ? 'w dowolnym Poké Stopie' : `w: ${placeName(at)}`;
  return { seq: e.seq, kind: 'quest', variant: 'ready', icon: '🎁', title: 'ZADANIE GOTOWE!', name: title, text: `${player.name}: odbierz nagrodę ${where}.`, reward: q ? `Nagroda do odebrania: ${rewardPl(rewardLines(state, player, q))}` : '', art, button: 'Dalej', place: at && at !== 'pokeStop' ? at : null, where: `📍 ${at && at !== 'pokeStop' ? placeName(at) : 'każdy Poké Stop'}` };
}

// The notice's words (the child's language), with the place to look at.
export function noticeOf(state, e) {
  if (isQuestNotice(state, e)) return questNoticeOf(state, e);
  const d = e.data;
  if (d.achievement?.v >= 3) {
    const a = trophyList(state.config).find((x) => x.id === d.achievement.id);
    const who = state.players.find((p) => p.id === d.achievement.player);
    // P1 12:54: what the trophy is worth, and what it really added to its owner's sum (a chain's higher tier: the difference)
    const worth = d.achievement.points ?? a?.points ?? 0;
    return { seq: e.seq, kind: 'trophy', icon: '🏆', title: 'NOWE OSIĄGNIĘCIE!', name: a?.name ?? d.achievement.id, text: `${who?.name ?? ''}${who?.controller === 'ai' ? ' (AI)' : ''}: ${a?.done ?? ''} — pierwszy raz w tej grze!`, reward: `TROFEUM WARTE: ${worth} PKT`, gain: `DO SUMY: +${state.trophies?.owners[d.achievement.id] ? trophyGain(state, d.achievement.id) : worth} PKT`, hero: who ?? null, button: 'Dalej', place: null, where: '' };
  }
  if (d.status) {
    const st = d.status;
    const owner = state.players.find((p) => p.id === st.player);
    const name = getSpecies(st.species).name;
    return st.ko
      ? { seq: e.seq, icon: '☠️', title: `${name} zemdlał od trucizny!`, text: `${owner?.name ?? ''}: ${name} nie może walczyć. Wylecz go w Poké Stopie albo użyj Revive.`, place: owner?.location, where: '', art: worldArt('poison') }
      : { seq: e.seq, icon: '☠️', title: `${name} traci ${st.lost} HP od trucizny!`, text: `${owner?.name ?? ''}: ${name} ma teraz ❤ ${st.hpAfter} / ${st.maxHp}. Truciznę leczy Antidote, Full Heal albo Leczenie w Poké Stopie.`, place: owner?.location, where: '', art: worldArt('poison') };
  }
  if (d.rumour) {
    const who = state.players.find((p) => p.id === (d.rumour.player ?? e.player))?.name ?? '';
    const quest = d.rumour.quest ?? null; // its quest's picture
    return { seq: e.seq, icon: '📜', title: `${who} słyszy plotkę!`, text: RUMOUR_PL[d.rumour.id] ?? '', place: d.rumour.start, where: `📍 ${placeName(d.rumour.start)}${d.rumour.from === 'local' ? ' — to tutaj!' : ''}`, art: { ...worldArt('quest'), url: quest ? sceneArtFor('quest', quest)?.url ?? null : null } };
  }
  if (d.incidents) {
    if (d.incidents.event === 'flag') return { seq: e.seq, icon: '💤', title: 'Snorlax się obudził!', text: 'Droga między trasą 11 a 12 jest otwarta — dla wszystkich graczy.', place: 'route-12', where: `📍 ${placeName('route-12')}`, art: incidentArt('snorlax', '💤') };
    const t = INCIDENT_PL[d.incidents.id];
    const gym = d.incidents.gym ? GYMS_BY_ID[d.incidents.gym] : null;
    return { seq: e.seq, icon: t.icon, title: `Świat Kanto: ${t.name}`, text: `${t.text}${d.incidents.to ? ` (do tygodnia ${d.incidents.to - 1})` : ''}`, place: gym?.city ?? null, where: gym ? `📍 ${placeName(gym.city)}` : '', art: incidentArt(d.incidents.id, t.icon) };
  }
  if (d.rocket.event === 'plot') {
    const p = plotPl(d.rocket.plot);
    return { seq: e.seq, icon: '🎈', title: `Team Rocket knuje: ${p.title}`, text: [p.flavor, p.text].filter(Boolean).join(' '), place: d.rocket.location, where: `📍 ${placeName(d.rocket.location)}`, art: worldArt('rocket') };
  }
  return { seq: e.seq, icon: '🎈', title: 'Balon Team Rocket wylądował!', text: 'Uwaga na drogach w pobliżu.', place: d.rocket.to, where: `📍 ${placeName(d.rocket.to)}`, art: worldArt('rocket') };
}

// The notices not yet confirmed (after `ackSeq`), oldest first.
export function pendingNotices(state, ackSeq = 0) {
  return state.log.filter((e) => e.seq > ackSeq && isAnyNotice(state, e)).map((e) => noticeOf(state, e));
}

// This game's key on the device and the seq a game seen for the first time starts from.
export const noticeGameKey = (state) => `${state.seed}|${state.players.map((p) => p.id).join(',')}|${state.scenario ?? ''}`;
export const lastSeq = (state) => state.log.at(-1)?.seq ?? state.logBase ?? 0;
