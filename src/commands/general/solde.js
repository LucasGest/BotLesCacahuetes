const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('solde')
    .setDescription('Affiche ton solde de cacahuètes (ou celui d\'un autre membre).')
    .addUserOption((option) => option.setName('membre').setDescription('Le membre dont tu veux voir le solde')),

  async execute(interaction) {
    const target = interaction.options.getUser('membre') ?? interaction.user;
    const balance = await getBalance(target.id);

    const embed = new EmbedBuilder()
      .setColor(0xc8864b)
      .setDescription(`🥜 **${target.username}** possède **${balance}** cacahuète(s).`);

    await interaction.reply({ embeds: [embed] });
  }
};
