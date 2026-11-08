const { Events } = require('discord.js');
const { addCoins } = require('../utils/economy');
const { logError } = require('../utils/logger');
const { inviteOnVoiceJoin } = require('../utils/eventVoice');
const { playArrivalSound } = require('../utils/eventSounds');
const { onVoiceStateUpdate } = require('../utils/voiceRanking');

const COINS_PER_MINUTE = 2;
const MAX_SESSION_MINUTES = 180; // plafond anti-AFK toute la nuit

// État en mémoire (heure d'arrivée en vocal par membre). Au démarrage, le bot
// reprend les membres déjà en vocal (voir seedVoiceSessions) : seul le temps
// d'avant le redémarrage est perdu, plus toute la session.
const voiceJoinTimes = new Map();

function seedVoiceSessions(guild) {
  const now = Date.now();
  for (const voiceState of guild.voiceStates.cache.values()) {
    if (voiceState.channelId && voiceState.member && !voiceState.member.user.bot && !voiceJoinTimes.has(voiceState.id)) {
      voiceJoinTimes.set(voiceState.id, now);
    }
  }
}

module.exports = {
  seedVoiceSessions,
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    const member = newState.member ?? oldState.member;

    if (!member || member.user.bot) {
      return;
    }

    // Classement vocal : sans attendre, une erreur Firestore ne doit pas bloquer le reste.
    onVoiceStateUpdate(oldState, newState).catch((error) => logError(`Classement vocal de ${member.user.tag}`, error));

    // Sans attendre : une invitation lente ou en échec ne doit pas gêner le gain vocal.
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      inviteOnVoiceJoin(member, newState.channelId).catch((error) => logError(`Invitation vocale de ${member.user.tag}`, error));
      playArrivalSound(member, newState.channelId).catch((error) => logError(`Son d'arrivée de ${member.user.tag}`, error));
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
