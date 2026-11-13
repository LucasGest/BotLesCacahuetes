const { Events, EmbedBuilder } = require('discord.js');

const WELCOME_CHANNEL_ID = '1553346771344826468';
const WELCOME_COLOR = 0x8ec5ff; // bleu nuage

// Les salons cités dans le message sont résolus par nom (pas par ID codé en
// dur) : si le salon n'existe pas (renommé, supprimé...), on retombe sur du
// texte brut plutôt que de planter ou d'afficher une mention cassée.
function findChannelMention(guild, name) {
  const normalize = (value) => value.normalize('NFC').trim().toLowerCase();
  const channel = guild.channels.cache.find((c) => normalize(c.name) === normalize(name));
  return channel ? `<#${channel.id}>` : `#${name}`;
}

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);

    if (!channel || !channel.isTextBased()) {
      console.warn(`Salon de bienvenue ${WELCOME_CHANNEL_ID} introuvable ou non textuel.`);
      return;
    }

    const reglementMention = findChannelMention(member.guild, 'règlement');
    const chercheMateMention = findChannelMention(member.guild, 'cherche-mate');

    const embed = new EmbedBuilder()
      .setColor(WELCOME_COLOR)
      .setTitle('Bienvenue sur CloudyCat ! ☁️🐱')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(
        '🐾 **Un nouveau chat atterrit dans les nuages !**\n\n' +
          `Tu es notre **${member.guild.memberCount}e membre** 🎉\n\n` +
          `📜 Lis le ${reglementMention}\n` +
          `🔎 Trouve des mates dans ${chercheMateMention}\n` +
          `🎉 Viens aux **Customs du vendredi** !`
      )
      .setFooter({
        text: 'CloudyCat • On joue, on rage, on rit',
        iconURL: member.guild.iconURL() ?? undefined
      })
      .setTimestamp();

    await channel.send({
      content: `🐾 ${member} vient de débarquer !`,
      embeds: [embed]
    });
  }
};
