const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { logAction, logError } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Mute un membre pendant une durée donnée.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à mute').setRequired(true))
    .addIntegerOption((option) =>
      option
        .setName('minutes')
        .setDescription('Durée du mute en minutes')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(40320)
    )
    .addStringOption((option) =>
      option.setName('raison').setDescription('Raison du mute (optionnelle)').setRequired(false)
    ),

  async execute(interaction) {
    if (!isStaffMember(interaction.member)) {
      await interaction.reply({ content: 'Seul le staff peut faire ça.', flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.options.getMember('membre');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';

    if (!member) {
      await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.id === interaction.client.user.id) {
      await interaction.reply({ content: 'Je ne vais pas me mute moi-même.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (isStaffMember(member)) {
      await interaction.reply({
        content: 'Cette commande ne peut pas cibler un membre du staff.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!member.moderatable) {
      await interaction.reply({
        content: 'Je ne peux pas mute ce membre (rôle trop haut, ou permission manquante).',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await member.timeout(minutes * 60_000, reason);
    } catch (error) {
      await logError(`Commande /timeout sur ${member.user.tag}`, error);
      await interaction.reply({ content: 'Erreur lors du mute.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply(`🔇 **${member.user.tag}** est mute pendant ${minutes} min. Raison : ${reason}`);
    await logAction(
      `🔇 **Timeout** — ${member.user.tag} (\`${member.id}\`) ${minutes} min par ${interaction.user.tag}. Raison : ${reason}`
    );
  }
};
