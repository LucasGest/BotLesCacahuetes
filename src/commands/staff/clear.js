const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Supprime les derniers messages du salon.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName('nombre')
        .setDescription('Nombre de messages à supprimer (1 à 100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    ),

  async execute(interaction) {
    if (!isStaffMember(interaction.member)) {
      await interaction.reply({ content: 'Seul le staff peut faire ça.', flags: MessageFlags.Ephemeral });
      return;
    }

    const amount = interaction.options.getInteger('nombre');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Le "true" ignore silencieusement les messages de plus de 14 jours
      // (Discord refuse de les bulk-delete) plutôt que de faire échouer tout le lot.
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.editReply(`🧹 ${deleted.size} message(s) supprimé(s).`);
      await logAction(
        `🧹 **Clear** — ${deleted.size} message(s) supprimés dans #${interaction.channel.name} par ${interaction.user.tag}.`
      );
    } catch (error) {
      console.error('Impossible de supprimer des messages :', error.message);
      await interaction.editReply('Erreur lors de la suppression des messages.');
    }
  }
};
