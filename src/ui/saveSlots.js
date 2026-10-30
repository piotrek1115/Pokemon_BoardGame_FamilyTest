// PLAYTEST_016 PT016-04 (ChatGPT 26.10 21:57): SAVED GAMES — several independent games in one browser (the family's,
// Piotr's solo game against the AI, a playtest), each with its own autosave, instead of one slot that every new game
// overwrites. A table feature of the site (no rule switch): it never changes how a game plays.
//
// Storage (every key under `kanto.table.`, so a separate site's prefix — saveSlot.siteStorage — keeps them its own):
//   kanto.table.v2               the MAIN slot: the save this browser already has (the one save before slots). It is
//                                never moved, copied or rewritten to „migrate” it — it simply is the first slot, and an
//                                older build that only knows this key keeps reading the same game.
//   kanto.table.slot.<id>.v2     each further slot's save (an older build never reads or writes these keys)
//   kanto.table.slots.v1         the list: { v: 1, active, slots: [{ id, name, created, savedAt?, size? }] } — written
//                                only when the family uses the list (a new slot, a name, a switch, an import); a browser
//                                that never opens „Zapisy gry” has none, and the table plays the main slot as before.
// Every write here reports failure (a full storage, Safari's private mode) — never a success it did not make; a
// refused write leaves the slot and the list as they were.
//
// Two tabs (ChatGPT review 27.10): every change to the list starts from the list AS STORED NOW, never from a copy a tab
// read earlier — a tab still playing one game never drops a slot, a name or a switch another tab made. `active` is only
// the slot a NEW tab opens; the slot a tab plays is fixed when it opens (table/main.js `playing`).
//
// Import (a file from another device): the text is checked before anything is written — a size limit, JSON without
// `__proto__` / `constructor` / `prototype` keys, and the game's own deserialize (schema, rule switches, Living Kanto,
// trophies: a save this version can't play is refused). An import always goes to a NEW slot; nothing is overwritten.
import { MAX_BACKUPS } from './saveSlot.js';

export const SAVE_KEY = 'kanto.table.v2';
export const LEGACY_SAVE_KEY = 'kanto.table.v1';
export const SLOTS_KEY = 'kanto.table.slots.v1';
export const MAIN_SLOT = 'main';
export const MAX_SLOTS = 5;
export const MAX_IMPORT_CHARS = 8 * 1024 * 1024;
export const NAME_MAX = 32;
const SLOT_ID = /^s[0-9a-z]{1,16}$/;

export const slotKey = (id) => (id === MAIN_SLOT ? SAVE_KEY : `kanto.table.slot.${id}.v2`);

const defaultIndex = () => ({ v: 1, active: MAIN_SLOT, slots: [{ id: MAIN_SLOT, name: 'Zapis główny', created: null }] });

export function cleanName(name, fallback = 'Gra') {
  const s = String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, NAME_MAX);
  return s || fallback;
}

// The list as stored, checked; the default (the main slot alone) when there is none or it is unreadable — reading
// never writes. A slot whose entry is malformed is left out; the main slot is always there and always first.
export function readIndex(storage) {
  let raw = null;
  try {
    raw = storage.getItem(SLOTS_KEY);
  } catch {
    return defaultIndex();
  }
  if (raw === null) return defaultIndex();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return defaultIndex();
  }
  if (!data || data.v !== 1 || !Array.isArray(data.slots)) return defaultIndex();
  const seen = new Set();
  const slots = [];
  for (const s of data.slots) {
    if (!s || typeof s !== 'object' || seen.has(s.id) || !(s.id === MAIN_SLOT || SLOT_ID.test(s.id))) continue;
    seen.add(s.id);
    slots.push({ id: s.id, name: cleanName(s.name, s.id === MAIN_SLOT ? 'Zapis główny' : 'Gra'), created: typeof s.created === 'string' ? s.created : null, ...(typeof s.savedAt === 'string' ? { savedAt: s.savedAt } : {}) });
  }
  const main = slots.find((s) => s.id === MAIN_SLOT) ?? defaultIndex().slots[0];
  const rest = slots.filter((s) => s.id !== MAIN_SLOT).slice(0, MAX_SLOTS - 1);
  const all = [main, ...rest];
  return { v: 1, active: all.some((s) => s.id === data.active) ? data.active : MAIN_SLOT, slots: all };
}

export function writeIndex(storage, index) {
  try {
    const text = JSON.stringify({ v: 1, active: index.active, slots: index.slots });
    storage.setItem(SLOTS_KEY, text);
    return storage.getItem(SLOTS_KEY) === text;
  } catch {
    return false;
  }
}

export function readRaw(storage, id) {
  try {
    return storage.getItem(slotKey(id));
  } catch {
    return null;
  }
}

// What the list shows about a slot's game (parsed from its save; nothing for an empty or unreadable one).
export function slotSummary(raw) {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return {
      week: s.turn?.round ?? null,
      players: (s.players ?? []).map((p) => ({ name: String(p.name ?? '?'), ai: p.controller === 'ai' })),
      ruleset: s.config?.devRuleset ?? s.config?.rules?.ruleset ?? null,
      over: s.phase === 'over',
      size: raw.length,
    };
  } catch {
    return { unreadable: true, size: raw.length };
  }
}

const newId = (index, now) => {
  const base = `s${Number(now).toString(36)}`.slice(0, 17);
  let id = base;
  for (let n = 1; index.slots.some((s) => s.id === id); n++) id = `${base.slice(0, 15)}${n.toString(36)}`;
  return id;
};

// A new, empty slot at the end of the list (not active) → { ok, index, id, error }.
export function createSlot(storage, name, now = Date.now()) {
  const index = readIndex(storage);
  if (index.slots.length >= MAX_SLOTS) return { ok: false, index, error: 'full' };
  const id = newId(index, now);
  const next = { ...index, slots: [...index.slots, { id, name: cleanName(name), created: new Date(now).toISOString() }] };
  if (!writeIndex(storage, next)) return { ok: false, index, error: 'storage' };
  return { ok: true, index: next, id };
}

export function renameSlot(storage, id, name) {
  const index = readIndex(storage);
  if (!index.slots.some((s) => s.id === id)) return { ok: false, index, error: 'missing' };
  const next = { ...index, slots: index.slots.map((s) => (s.id === id ? { ...s, name: cleanName(name, s.name) } : s)) };
  if (!writeIndex(storage, next)) return { ok: false, index, error: 'storage' };
  return { ok: true, index: next };
}

// A new tab opens this slot from now on (the caller reloads the page on it).
export function activateSlot(storage, id) {
  const index = readIndex(storage);
  if (!index.slots.some((s) => s.id === id)) return { ok: false, index, error: 'missing' };
  const next = { ...index, active: id };
  if (!writeIndex(storage, next)) return { ok: false, index, error: 'storage' };
  return { ok: true, index: next };
}

// Remember when slot `id` was last written (only once the list exists: a browser without one is never written to).
// Only its date changes — never which slot is active, never another slot.
export function noteSaved(storage, id, now = Date.now()) {
  let present = false;
  try {
    present = storage.getItem(SLOTS_KEY) !== null;
  } catch {
    return readIndex(storage);
  }
  const index = readIndex(storage);
  if (!present || !index.slots.some((s) => s.id === id)) return index;
  const next = { ...index, slots: index.slots.map((s) => (s.id === id ? { ...s, savedAt: new Date(now).toISOString() } : s)) };
  return writeIndex(storage, next) ? next : index;
}

// A slot's save copied into a NEW slot (the source untouched) → { ok, index, id, error }.
export function copySlot(storage, fromId, name, now = Date.now()) {
  const raw = readRaw(storage, fromId);
  if (raw === null) return { ok: false, index: readIndex(storage), error: 'empty' };
  return addSlotWithSave(storage, raw, name, now);
}

function addSlotWithSave(storage, raw, name, now) {
  const index = readIndex(storage);
  if (index.slots.length >= MAX_SLOTS) return { ok: false, index, error: 'full' };
  const id = newId(index, now);
  try {
    storage.setItem(slotKey(id), raw);
    if (storage.getItem(slotKey(id)) !== raw) throw new Error('not written');
  } catch {
    removeKey(storage, slotKey(id));
    return { ok: false, index, error: 'storage' };
  }
  const next = { ...index, slots: [...index.slots, { id, name: cleanName(name), created: new Date(now).toISOString(), savedAt: new Date(now).toISOString() }] };
  if (!writeIndex(storage, next)) {
    removeKey(storage, slotKey(id)); // no slot without its place on the list
    return { ok: false, index, error: 'storage' };
  }
  return { ok: true, index: next, id };
}

function removeKey(storage, key) {
  try {
    storage.removeItem?.(key);
  } catch {
    /* nothing to undo */
  }
}

// Delete a slot and its save. Never the main slot (the save this browser had before slots), never the active one and
// never `playing` — the one this tab plays.
export function deleteSlot(storage, id, playing = null) {
  const index = readIndex(storage);
  if (id === MAIN_SLOT) return { ok: false, index, error: 'main' };
  if (id === index.active || id === playing) return { ok: false, index, error: 'active' };
  if (!index.slots.some((s) => s.id === id)) return { ok: false, index, error: 'missing' };
  const next = { ...index, slots: index.slots.filter((s) => s.id !== id) };
  if (!writeIndex(storage, next)) return { ok: false, index, error: 'storage' };
  removeKey(storage, slotKey(id));
  removeKey(storage, prevKey(id));
  for (let n = 1; n <= MAX_BACKUPS; n++) removeKey(storage, `${slotKey(id)}.backup.${n}`);
  return { ok: true, index: next };
}

// Before a new game replaces the game in a slot: that game is kept as the slot's PREVIOUS game (`<key>.prev`, one per
// slot — the one before it is replaced, so the storage never fills up with copies). „Poprzednia gra” brings it back
// into a NEW slot (restorePrevious). `raw`: the game as it is NOW (the table's own, newer than its save when the last
// autosave was refused); the slot's save when not given. → 'empty' (nothing to keep), 'kept', or null when it could
// not be written — the caller then must not replace the game without the family's say (table/main.js).
export const prevKey = (id) => `${slotKey(id)}.prev`;

export function backupBeforeOverwrite(storage, id, raw = null) {
  const game = raw ?? readRaw(storage, id);
  if (game === null) return 'empty';
  try {
    storage.setItem(prevKey(id), game);
    return storage.getItem(prevKey(id)) === game ? 'kept' : null;
  } catch {
    return null;
  }
}

// „Graj w tej karcie” (ChatGPT re-review 27.10, P1): the same game open in two tabs, and THIS tab goes on. The other
// tab's game (the slot's save now) is kept as the slot's previous game, then `write()` (→ true when this tab's game
// went in) replaces it. When the copy is refused nothing is written; when the write is refused the previous game is put
// back as it was. That put-back can itself be refused (ChatGPT acceptance 28.10): then `restored` is false — the other
// tab's game is still in the slot (and in the previous game), this tab's game on the table, but the slot's EARLIER
// previous game is gone, and the table must say so instead of „nothing changed”.
// → { ok } or { ok: false, why: 'copy' } or { ok: false, why: 'write', restored }.
export function takeOverSlot(storage, id, write) {
  let before = null;
  try {
    before = storage.getItem(prevKey(id));
  } catch {
    return { ok: false, why: 'copy' };
  }
  const kept = backupBeforeOverwrite(storage, id);
  if (kept === null) return { ok: false, why: 'copy' };
  if (write()) return { ok: true };
  if (kept !== 'kept') return { ok: false, why: 'write', restored: true }; // nothing was copied, nothing to put back
  try {
    if (before === null) storage.removeItem(prevKey(id));
    else storage.setItem(prevKey(id), before);
  } catch {
    /* checked below */
  }
  let now;
  try {
    now = storage.getItem(prevKey(id));
  } catch {
    now = undefined;
  }
  return { ok: false, why: 'write', restored: now === before };
}

export function hasPrevious(storage, id) {
  try {
    return storage.getItem(prevKey(id)) !== null;
  } catch {
    return false;
  }
}

export function restorePrevious(storage, id, name, now = Date.now()) {
  let raw = null;
  try {
    raw = storage.getItem(prevKey(id));
  } catch {
    /* unreadable */
  }
  if (raw === null) return { ok: false, index: readIndex(storage), error: 'empty' };
  return addSlotWithSave(storage, raw, name, now);
}

// ---- export / import ----------------------------------------------------------------------------------------------

export function exportText(raw, name, now = Date.now()) {
  return JSON.stringify({ kantoSave: 1, name: cleanName(name), exported: new Date(now).toISOString(), save: JSON.parse(raw) });
}

const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

// A file's text → { raw, name } of a save this version can play, or throws an Error with a family-readable reason.
// `deserialize` is the game's own (it rejects corrupt and newer saves).
export function parseImport(text, deserialize) {
  if (typeof text !== 'string' || !text.length) throw new Error('Pusty plik.');
  if (text.length > MAX_IMPORT_CHARS) throw new Error('Plik jest za duży jak na zapis gry.');
  let data;
  try {
    data = JSON.parse(text, (key, value) => {
      if (FORBIDDEN.has(key)) throw new Error(`forbidden key ${key}`);
      return value;
    });
  } catch {
    throw new Error('To nie jest plik zapisu gry (niepoprawny JSON).');
  }
  const wrapped = data && typeof data === 'object' && data.kantoSave === 1 && data.save && typeof data.save === 'object';
  const game = wrapped ? data.save : data;
  if (!game || typeof game !== 'object' || Array.isArray(game)) throw new Error('To nie jest plik zapisu gry.');
  const raw = JSON.stringify(game);
  try {
    deserialize(raw);
  } catch (err) {
    throw new Error(err?.reason === 'newer' ? 'Ten zapis pochodzi z nowszej wersji gry — ta wersja go nie wczyta.' : `Tego zapisu nie da się wczytać: ${err?.message ?? err}`);
  }
  return { raw, name: wrapped ? cleanName(data.name, 'Import') : 'Import' };
}

export function importToNewSlot(storage, text, deserialize, name = null, now = Date.now()) {
  const parsed = parseImport(text, deserialize);
  return { ...addSlotWithSave(storage, parsed.raw, name ?? parsed.name, now), name: name ?? parsed.name };
}
