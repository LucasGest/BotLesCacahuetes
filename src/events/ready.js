const { Events } = require('discord.js');
const { startBirthdayScheduler } = require('../utils/birthdayScheduler');
const { startClipOfTheWeekScheduler } = require('../utils/clipOfTheWeek');
const { startAgentCacheScheduler } = require('../utils/valorantAgents');
const { startWeaponCacheScheduler } = require('../utils/valorantWeapons');
const { startCustomRoleScheduler } = require('../utils/customRoles');
const { startLiveAnnounceScheduler } = require('../utils/liveAnnounce');
const { startGameActivity } = require('../utils/gameActivity');
const { logError } = require('../utils/logger');
const config = require('../config');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'local';
    console.log(`🚀 Bot démarré : connecté en tant que ${client.user.tag} (commit ${commit})`);
    startBirthdayScheduler(client);
    startClipOfTheWeekScheduler(client);
    startAgentCacheScheduler();
    startWeaponCacheScheduler();
    startCustomRoleScheduler(client);
    startLiveAnnounceScheduler(client);
    startGameActivity(client, config.guildId).catch((error) => logError('Détection des jeux (démarrage)', error));
  }
};
