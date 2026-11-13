const { EmbedBuilder } = require('discord.js');
const birthdays = require('./birthdays');

const ANNOUNCE_CHANNEL_ID = '1553346904945987695'; // #général
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // toutes les heures
const BIRTHDAY_COLOR = 0xff4fa3;
// GIF optionnel affiché dans l'embed : mets une URL directe (ex: Tenor/Giphy
// "copy link" vers le .gif, pas la page de visionnage) si tu en veux un.
const CAKE_GIF_URL = null;

async function checkBirthdays(client) {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const all = await birthdays.getAll();
  const todayMatches = Object.entries(all).filter(
    ([, data]) => data.day === day && data.month === month && data.lastAnnouncedYear !== year
  );

  if (todayMatches.length === 0) {
    return;
  }

  const channel = await client.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(() => null);

  if (!channel?.isTextBased()) {
    console.warn(`Salon d'annonce d'anniversaire ${ANNOUNCE_CHANNEL_ID} introuvable.`);
    return;
  }

  for (const [userId] of todayMatches) {
    const member = await channel.guild.members.fetch(userId).catch(() => null);

    if (!member) {
      console.warn(`Membre ${userId} introuvable pour l'annonce d'anniversaire, skip.`);
      await birthdays.markAnnounced(userId, year);
      continue;
    }

    const embed = new EmbedBuilder()
      .setColor(BIRTHDAY_COLOR)
      .setTitle(`Joyeux anniversaire ${member.user.username} ! 🎉`)
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(
        'Un an de plus, et toujours le poil soyeux 🐱✨\n\n' +
          'Toute la commu te souhaite une journée de folie 🎈\n' +
          'Que tes aims soient précis et tes mates pas tiltés 🎯\n\n' +
          '👇 Balance-lui un petit mot en réponse !'
      )
      .setFooter({
        text: 'CloudyCat • Anniversaires',
        iconURL: member.guild.iconURL() ?? undefined
      })
      .setTimestamp();

    if (CAKE_GIF_URL) {
      embed.setImage(CAKE_GIF_URL);
    }

    await channel.send({
      content: `🎂 C'est l'anniversaire de ${member} aujourd'hui ! 🥳`,
      embeds: [embed]
    });

    await birthdays.markAnnounced(userId, year);
  }
}

function startBirthdayScheduler(client) {
  checkBirthdays(client).catch((error) => console.error('Erreur lors de la vérification des anniversaires :', error.message));
  setInterval(() => {
    checkBirthdays(client).catch((error) => console.error('Erreur lors de la vérification des anniversaires :', error.message));
  }, CHECK_INTERVAL_MS);
}

module.exports = { startBirthdayScheduler };
