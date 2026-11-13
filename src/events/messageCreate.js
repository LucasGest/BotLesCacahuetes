const { Events } = require('discord.js');
const { addXp } = require('../utils/xp');
const { earnFromMessage } = require('../utils/economy');
const { logError } = require('../utils/logger');

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot) {
      return;
    }

    try {
      const xpResult = await addXp(message.author.id);

      if (xpResult?.leveledUp) {
        await message.channel.send(`🎉 ${message.author} passe **niveau ${xpResult.level}** !`);
      }
    } catch (error) {
      await logError(`XP de ${message.author.tag}`, error);
    }

    try {
      await earnFromMessage(message.author.id);
    } catch (error) {
      await logError(`Gain de pattes de ${message.author.tag}`, error);
    }
  }
};
