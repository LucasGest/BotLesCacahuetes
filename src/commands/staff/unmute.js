const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { logAction, logError } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription("Retire le mute (timeout) d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à démute').setRequired(true)),

  async execute(interaction) {
    if (!isStaffMember(interaction.member)) {
      await interaction.reply({ content: 'Seul le staff peut faire ça.', flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.options.getMember('membre');

    if (!member) {
      await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!member.moderatable) {
      await interaction.reply({
        content: 'Je ne peux pas démute ce membre (rôle trop haut, ou permission manquante).',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await member.timeout(null, 'Démute manuel');
    } catch (error) {
      await logError(`Commande /unmute sur ${member.user.tag}`, error);
      await interaction.reply({ content: 'Erreur lors du démute.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply(`🔊 **${member.user.tag}** a été démute.`);
    await logAction(`🔊 **Unmute** — ${member.user.tag} (\`${member.id}\`) par ${interaction.user.tag}.`);
  }
};
