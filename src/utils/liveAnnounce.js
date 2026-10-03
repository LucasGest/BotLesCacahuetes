const { EmbedBuilder } = require('discord.js');
const { getLiveStreams } = require('./twitch');
const { logError } = require('./logger');
const config = require('../config');

const STREAMERS = ['biskar8', 'lucanemone'];
const ANNOUNCE_CHANNEL_ID = '1555946540202336286';
const CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 min : largement dans les limites de l'API Helix

// Pseudos actuellement considérés en live, pour ne pas reposter tant qu'ils
// n'ont pas quitté puis repris leur stream. Repart à zéro à chaque redémarrage
// du bot (un stream déjà en cours sera donc réannoncé une fois après un
// redémarrage) : acceptable pour une fonctionnalité d'annonce, pas besoin de
// persister ça en base.
const currentlyLive = new Set();

async function announce(client, stream) {
  const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased()) {
    return;
  }

  const thumbnail = stream.thumbnail_url.replace('{width}', '440').replace('{height}', '248');

  const embed = new EmbedBuilder()
    .setColor(0x9146ff)
    .setAuthor({ name: `${stream.user_name} est en live sur Twitch !` })
    .setTitle(stream.title || 'Sans titre')
    .setURL(`https://twitch.tv/${stream.user_login}`)
    .addFields({ name: 'Jeu', value: stream.game_name || 'Inconnu', inline: true })
    .setImage(`${thumbnail}?t=${Date.now()}`)
    .setTimestamp();

  await channel.send({ content: `🔴 **${stream.user_name}** est en live !`, embeds: [embed] });
}

async function checkStreams(client) {
  if (!config.twitch.clientId || !config.twitch.clientSecret) {
    return;
  }

  const streams = await getLiveStreams(STREAMERS);
  const liveNow = new Set(streams.map((s) => s.user_login.toLowerCase()));

  for (const stream of streams) {
    if (!currentlyLive.has(stream.user_login.toLowerCase())) {
      await announce(client, stream);
    }
  }

  currentlyLive.clear();
  for (const login of liveNow) {
    currentlyLive.add(login);
  }
}

function startLiveAnnounceScheduler(client) {
  checkStreams(client).catch((error) => logError('Lives Twitch (démarrage)', error));
  setInterval(() => {
    checkStreams(client).catch((error) => logError('Lives Twitch', error));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startLiveAnnounceScheduler };
