const config = require('../config');

// Tier de base (sans la subdivision, ex: "Diamond 2" -> "Diamond") vers le
// nom utilisé côté rôles Discord, cohérent avec les rangs de /customs.
const TIER_TRANSLATIONS = {
  Iron: 'Fer',
  Bronze: 'Bronze',
  Silver: 'Argent',
  Gold: 'Or',
  Platinum: 'Platine',
  Diamond: 'Diamant',
  Ascendant: 'Ascendant',
  Immortal: 'Immortel',
  Radiant: 'Radiant'
};

// Appelle l'API non officielle HenrikDev (clé requise, gratuite sur demande).
// Ne demande jamais de mot de passe : uniquement pseudo + tag publics.
async function fetchRank(name, tag, region) {
  if (!config.henrikApiKey) {
    throw new Error('API_KEY_MISSING');
  }

  const url = `https://api.henrikdev.xyz/valorant/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  const res = await fetch(url, {
    headers: { Authorization: config.henrikApiKey },
    signal: AbortSignal.timeout(8000)
  });

  if (res.status === 404) {
    throw new Error('NOT_FOUND');
  }
  if (!res.ok) {
    throw new Error(`HTTP_${res.status}`);
  }

  const json = await res.json();
  const patched = json?.data?.currenttierpatched;

  if (!patched) {
    throw new Error('NO_RANK_DATA');
  }

  return patched;
}

function toBaseTier(patched) {
  const englishTier = patched.replace(/\s*\d+$/, '').trim();
  return TIER_TRANSLATIONS[englishTier] ?? null;
}

module.exports = { fetchRank, toBaseTier };
