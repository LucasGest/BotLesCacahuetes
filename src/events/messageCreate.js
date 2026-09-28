const { Events } = require('discord.js');
const { addXp } = require('../utils/xp');
const { earnFromMessage } = require('../utils/economy');
const { logError } = require('../utils/logger');

// Enlève les accents (è -> e) puis matche les variantes courantes :
// cacahuète, cacahuete, cacahouette, cacahouete, cacahuètes... avec ou sans h.
const PEANUT_REGEX = /caca(h)?(?:ou|u)ett?e?s?/;

function mentionsCacahuete(content) {
  const normalized = content.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return PEANUT_REGEX.test(normalized);
}

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
      await logError(`Gain de cacahuètes de ${message.author.tag}`, error);
    }

    if (mentionsCacahuete(message.content)) {
      await message.react('🥜');
    }
  }
};
