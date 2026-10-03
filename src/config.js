require('dotenv').config();

// Variables obligatoires : le bot ne démarre pas si l'une d'elles manque,
// plutôt que de planter plus tard avec une erreur obscure.
const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID'];
const missingVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

if (missingVars.length > 0) {
  throw new Error(
    `Variables d'environnement manquantes : ${missingVars.join(', ')}. Vérifie ton fichier .env (jamais commité !).`
  );
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  port: process.env.PORT || 3000,
  // Tous optionnels : le bot fonctionne sans, juste avec moins de garde-fous.
  logChannelId: process.env.LOG_CHANNEL_ID || null,
  staffRoleIds: (process.env.STAFF_ROLE_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || null,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || null,
    privateKey: process.env.FIREBASE_PRIVATE_KEY || null
  },
  henrikApiKey: process.env.HENRIKDEV_API_KEY || null,
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID || null,
    clientSecret: process.env.TWITCH_CLIENT_SECRET || null
  }
};
