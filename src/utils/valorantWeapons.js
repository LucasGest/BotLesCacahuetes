const API_URL = 'https://valorant-api.com/v1/weapons?language=fr-FR';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // toutes les heures

// On ne tire que parmi les armes principales : pas les pistolets (sidearm)
// ni le couteau (melee).
const CATEGORIES_EXCLUES = ['EEquippableCategory::Sidearm', 'EEquippableCategory::Melee'];

const CATEGORIE_LABELS = {
  'EEquippableCategory::Rifle': 'Fusil d\'assaut',
  'EEquippableCategory::SMG': 'Mitraillette',
  'EEquippableCategory::Shotgun': 'Fusil à pompe',
  'EEquippableCategory::Sniper': 'Fusil de précision',
  'EEquippableCategory::Heavy': 'Mitrailleuse lourde'
};

// Liste de secours si l'API Valorant est injoignable au tout premier appel.
const ARMES_SECOURS = [
  { name: 'Stinger', category: 'EEquippableCategory::SMG' }, { name: 'Spectre', category: 'EEquippableCategory::SMG' },
  { name: 'Bucky', category: 'EEquippableCategory::Shotgun' }, { name: 'Judge', category: 'EEquippableCategory::Shotgun' },
  { name: 'Bulldog', category: 'EEquippableCategory::Rifle' }, { name: 'Guardian', category: 'EEquippableCategory::Rifle' },
  { name: 'Phantom', category: 'EEquippableCategory::Rifle' }, { name: 'Vandal', category: 'EEquippableCategory::Rifle' },
  { name: 'Marshal', category: 'EEquippableCategory::Sniper' }, { name: 'Outlaw', category: 'EEquippableCategory::Sniper' },
  { name: 'Operator', category: 'EEquippableCategory::Sniper' },
  { name: 'Ares', category: 'EEquippableCategory::Heavy' }, { name: 'Odin', category: 'EEquippableCategory::Heavy' }
].map((weapon) => ({ ...weapon, icon: null, categorieLabel: CATEGORIE_LABELS[weapon.category] }));

let cache = ARMES_SECOURS;

async function fetchFromApi() {
  const res = await fetch(API_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const { data } = await res.json();

  return data
    .filter((w) => w.displayName && !CATEGORIES_EXCLUES.includes(w.category))
    .map((w) => ({
      name: w.displayName,
      category: w.category,
      categorieLabel: CATEGORIE_LABELS[w.category] ?? w.category,
      icon: w.displayIcon
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

async function refreshWeapons() {
  try {
    cache = await fetchFromApi();
    return cache;
  } catch (error) {
    console.error('[valorant-api] Rafraîchissement des armes échoué, cache conservé :', error.message);
    return cache;
  }
}

function getWeapons() {
  return cache;
}

function startWeaponCacheScheduler() {
  refreshWeapons();
  setInterval(refreshWeapons, CHECK_INTERVAL_MS);
}

module.exports = { getWeapons, refreshWeapons, startWeaponCacheScheduler };
