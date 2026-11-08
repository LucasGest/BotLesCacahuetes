const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { PERIODS, getRanking, rankingLines, formatMinutes } = require('../../utils/voiceRanking');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('classement-vocal')
    .setDescription('Classement du temps passé en vocal.')
    .addStringOption((option) =>
      option
        .setName('periode')
        .setDescription('Période du classement (cette semaine par défaut)')
        .addChoices(
          { name: 'Cette semaine', value: 'semaine' },
          { name: 'Ce mois-ci', value: 'mois' },
          { name: 'Depuis le début', value: 'total' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const period = interaction.options.getString('periode') ?? 'semaine';
    const rows = await getRanking(period);
    const lines = rankingLines(rows);

    const myIndex = rows.findIndex((row) => row.userId === interaction.user.id);
    const me = myIndex === -1
      ? 'Tu n\'as pas encore de temps compté sur cette période.'
      : `Ta place : **${myIndex + 1}ᵉ** avec **${formatMinutes(rows[myIndex].minutes)}**`;

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle(`🎙️ Classement vocal — ${PERIODS[period].label}`)
      .setDescription(`${lines.length ? lines.join('\n') : 'Personne n\'a encore de temps compté.'}\n\n${me}`)
      .setFooter({ text: 'Compté : à plusieurs, sans sourdine casque · Top 3 de la semaine récompensé le dimanche à 21 h' });

    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
