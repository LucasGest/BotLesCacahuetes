const { Events } = require('discord.js');
const config = require('../config');
const { handlePresence } = require('../utils/gameActivity');

module.exports = {
  name: Events.PresenceUpdate,
  async execute(oldPresence, newPresence) {
    if (newPresence.guild?.id !== config.guildId) {
      return;
    }

    await handlePresence(newPresence.member, newPresence);
  }
};
