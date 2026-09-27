const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { logAction, logError } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulse un membre du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à expulser').setRequired(true))
    .addStringOption((option) =>
      option.setName('raison').setDescription("Raison de l'expulsion (optionnelle)").setRequired(false)
    ),

  async execute(interaction) {
    // Ne jamais se fier uniquement à setDefaultMemberPermissions : on revérifie
    // explicitement le rôle staff dans le code.
    if (!isStaffMember(interaction.member)) {
      await interaction.reply({ content: 'Seul le staff peut faire ça.', flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison') ?? 'Aucune raison fournie';

    if (!member) {
      await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (member.id === interaction.client.user.id) {
      await interaction.reply({ content: "Je ne vais pas m'expulser moi-même.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Protège le staff (donc aussi l'auteur lui-même) d'une modération
    // accidentelle ou malveillante entre membres du staff.
    if (isStaffMember(member)) {
      await interaction.reply({
        content: 'Cette commande ne peut pas cibler un membre du staff.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // kickable === false si le bot n'a pas la permission ou si le rôle de la
    // cible est plus haut que celui du bot : évite un crash inutile.
    if (!member.kickable) {
      await interaction.reply({
        content: 'Je ne peux pas expulser ce membre (rôle trop haut, ou permission manquante).',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await member.kick(reason);
    } catch (error) {
      await logError(`Commande /kick sur ${member.user.tag}`, error);
      await interaction.reply({ content: "Erreur lors de l'expulsion.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.reply(`👢 **${member.user.tag}** a été expulsé. Raison : ${reason}`);
    await logAction(`👢 **Kick** — ${member.user.tag} (\`${member.id}\`) par ${interaction.user.tag}. Raison : ${reason}`);
  }
};
