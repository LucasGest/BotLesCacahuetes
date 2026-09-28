const { Events } = require('discord.js');
const { addCoins } = require('../utils/economy');
const { logError } = require('../utils/logger');

const COINS_PER_MINUTE = 2;
const MAX_SESSION_MINUTES = 180; // plafond anti-AFK toute la nuit

// État en mémoire (heure d'arrivée en vocal par membre) : si le bot redémarre
// pendant qu'un membre est en vocal, sa session en cours n'est juste pas
// comptée jusqu'à la prochaine fois qu'il rejoint — acceptable, pas besoin
// de persister ça.
const voiceJoinTimes = new Map();

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const member = newState.member ?? oldState.member;

    if (!member || member.user.bot) {
      return;
    }

    const wasInVoice = Boolean(oldState.channelId);
    const isInVoice = Boolean(newState.channelId);

    if (!wasInVoice && isInVoice) {
      voiceJoinTimes.set(member.id, Date.now());
      return;
    }

    if (wasInVoice && !isInVoice) {
      const joinedAt = voiceJoinTimes.get(member.id);
      voiceJoinTimes.delete(member.id);

      if (!joinedAt) {
        return;
      }

      const minutes = Math.min((Date.now() - joinedAt) / 60_000, MAX_SESSION_MINUTES);
      const amount = Math.floor(minutes * COINS_PER_MINUTE);

      if (amount > 0) {
        try {
          await addCoins(member.id, amount);
        } catch (error) {
          await logError(`Gain vocal de ${member.user.tag}`, error);
        }
      }
    }

    // Changement de salon vocal sans le quitter : le chrono continue tel quel.
  }
};
