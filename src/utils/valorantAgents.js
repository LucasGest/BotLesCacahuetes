const API_URL = 'https://valorant-api.com/v1/agents?language=fr-FR&isPlayableCharacter=true';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // toutes les heures

// Agents débloqués gratuitement pour tout le monde
const AGENTS_GRATUITS = ['Brimstone', 'Jett', 'Phoenix', 'Sage', 'Sova'];

// Liste de secours si l'API Valorant est injoignable au tout premier appel.
const AGENTS_SECOURS = [
  { name: 'Astra', role: 'Contrôleur' }, { name: 'Breach', role: 'Initiateur' },
  { name: 'Brimstone', role: 'Contrôleur' }, { name: 'Chamber', role: 'Sentinelle' },
  { name: 'Clove', role: 'Contrôleur' }, { name: 'Cypher', role: 'Sentinelle' },
  { name: 'Deadlock', role: 'Sentinelle' }, { name: 'Fade', role: 'Initiateur' },
  { name: 'Gekko', role: 'Initiateur' }, { name: 'Harbor', role: 'Contrôleur' },
  { name: 'Iso', role: 'Duelliste' }, { name: 'Jett', role: 'Duelliste' },
  { name: 'KAY/O', role: 'Initiateur' }, { name: 'Killjoy', role: 'Sentinelle' },
  { name: 'Neon', role: 'Duelliste' }, { name: 'Omen', role: 'Contrôleur' },
  { name: 'Phoenix', role: 'Duelliste' }, { name: 'Raze', role: 'Duelliste' },
  { name: 'Reyna', role: 'Duelliste' }, { name: 'Sage', role: 'Sentinelle' },
  { name: 'Skye', role: 'Initiateur' }, { name: 'Sova', role: 'Initiateur' },
  { name: 'Tejo', role: 'Initiateur' }, { name: 'Viper', role: 'Contrôleur' },
  { name: 'Vyse', role: 'Sentinelle' }, { name: 'Yoru', role: 'Duelliste' },
].map((agent) => ({ ...agent, couleur: 0xff4655, capacites: [], gratuit: AGENTS_GRATUITS.includes(agent.name) }));

// names vide au départ : le tout premier refresh réussi devient la référence,
// sans déclencher de faux "nouvel agent détecté" au démarrage.
let cache = { agents: AGENTS_SECOURS, names: new Set() };

async function fetchFromApi() {
  const res = await fetch(API_URL, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const { data } = await res.json();

  return data.map((a) => ({
    name: a.displayName,
    role: a.role?.displayName ?? 'Inconnu',
    roleIcon: a.role?.displayIcon ?? null,
    icon: a.displayIcon,
    portrait: a.fullPortrait ?? a.bustPortrait ?? a.displayIcon,
    couleur: a.backgroundGradientColors?.[0]
      ? parseInt(a.backgroundGradientColors[0].slice(0, 6), 16)
      : 0xff4655,
    capacites: (a.abilities ?? [])
      .filter((c) => c.slot !== 'Passive' && c.displayName)
      .map((c) => c.displayName),
    gratuit: a.isBaseContent === true || AGENTS_GRATUITS.includes(a.displayName)
  })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// Rafraîchit le cache et détecte les nouveaux agents par comparaison avec la
// dernière liste connue, plutôt que de se contenter d'une expiration
// temporelle (le cache est donc à jour au plus une heure après une sortie
// d'agent côté Riot, pas seulement quand quelqu'un relance la commande).
async function refreshAgents() {
  try {
    const agents = await fetchFromApi();
    const previousNames = cache.names;
    const newAgents = agents.filter((agent) => !previousNames.has(agent.name));

    cache = { agents, names: new Set(agents.map((agent) => agent.name)) };

    if (newAgents.length > 0 && previousNames.size > 0) {
      console.log(`[valorant-api] Nouvel(aux) agent(s) détecté(s) : ${newAgents.map((a) => a.name).join(', ')}`);
    }

    return { agents, newAgents };
  } catch (error) {
    console.error('[valorant-api] Rafraîchissement échoué, cache conservé :', error.message);
    return { agents: cache.agents, newAgents: [] };
  }
}

function getAgents() {
  return cache.agents;
}

function startAgentCacheScheduler() {
  refreshAgents();
  setInterval(refreshAgents, CHECK_INTERVAL_MS);
}

module.exports = { getAgents, refreshAgents, startAgentCacheScheduler };
