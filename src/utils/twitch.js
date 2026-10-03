const config = require('../config');

let cachedToken = null;
let tokenExpiresAt = 0;

// Jeton d'app (client credentials) : pas de connexion utilisateur, juste de
// quoi interroger l'API Helix côté serveur. Mis en cache jusqu'à expiration
// (avec une marge de 60s) pour ne pas en redemander un à chaque vérification.
async function getAppAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', config.twitch.clientId);
  url.searchParams.set('client_secret', config.twitch.clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');

  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = await res.json();
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in - 60) * 1000;

  return cachedToken;
}

// Renvoie les streams Twitch actuellement en live parmi les pseudos donnés.
async function getLiveStreams(usernames) {
  if (!config.twitch.clientId || !config.twitch.clientSecret || usernames.length === 0) {
    return [];
  }

  const token = await getAppAccessToken();
  const url = new URL('https://api.twitch.tv/helix/streams');
  for (const username of usernames) {
    url.searchParams.append('user_login', username);
  }

  const res = await fetch(url, {
    headers: { 'Client-Id': config.twitch.clientId, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? [];
}

module.exports = { getLiveStreams };
