export const FAVORITES_KEY = 'cleanlink:favorites:v1';

export function parseFavorites(raw) {
  try {
    const values = JSON.parse(raw || '[]');
    return new Set(Array.isArray(values) ? values.filter(id => Number.isSafeInteger(id) && id > 0) : []);
  } catch { return new Set(); }
}

function readFavorites() {
  try { return parseFavorites(localStorage.getItem(FAVORITES_KEY)); }
  catch { return new Set(); }
}

let ids = readFavorites();
let unsaved = false;
export const hasFavorite = id => ids.has(Number(id));
export const favoriteCount = () => ids.size;
export const syncFavorites = () => { if (!unsaved) ids = readFavorites(); };
export function toggleFavorite(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Услуга не найдена');
  // Refresh persisted data before changing it so other tabs keep their additions.
  if (!unsaved) { try { ids = parseFavorites(localStorage.getItem(FAVORITES_KEY)); } catch {} }
  const active = !ids.has(id);
  if (active) ids.add(id); else ids.delete(id);
  let saved = true;
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...ids])); } catch { saved = false; }
  unsaved = !saved;
  return { active, saved };
}
export function favoriteButton(id) {
  const active = hasFavorite(id);
  const label = active ? 'Удалить из избранного' : 'Добавить в избранное';
  return `<button type="button" class="favorite-button ${active ? 'is-favorite' : ''}" data-action="favorite" data-id="${Number(id)}" aria-pressed="${active}" aria-label="${label}" title="${label}"><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg></button>`;
}
