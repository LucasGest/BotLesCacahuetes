const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { claimDaily } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Récupère tes pattes du jour (bonus si tu reviens plusieurs jours de suite).'),

  async execute(interaction) {
    const result = await claimDaily(interaction.user.id);

    if (!result.claimed) {
      await interaction.reply({
        content: `Tu as déjà récupéré tes pattes du jour ! Reviens demain (série actuelle : 🔥 ${result.streak}).`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xc8864b)
      .setTitle('🐾 Pattes du jour !')
      .setDescription(`Tu gagnes **${result.amount} 🐾**.\nSérie actuelle : 🔥 **${result.streak}** jour(s) de suite.`)
      .setFooter({ text: 'Reviens demain pour faire grossir ta série !' });

    await interaction.reply({ embeds: [embed] });
  }
};
