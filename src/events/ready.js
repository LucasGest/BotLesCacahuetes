const { Events } = require('discord.js');
const { startBirthdayScheduler } = require('../utils/birthdayScheduler');
const { startClipOfTheWeekScheduler } = require('../utils/clipOfTheWeek');
const { startAgentCacheScheduler } = require('../utils/valorantAgents');
const { startCustomRoleScheduler } = require('../utils/customRoles');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Connecté en tant que ${client.user.tag}`);
    startBirthdayScheduler(client);
    startClipOfTheWeekScheduler(client);
    startAgentCacheScheduler();
    startCustomRoleScheduler(client);
  }
};
