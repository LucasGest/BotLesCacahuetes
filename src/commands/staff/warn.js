const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { logAction } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Avertit un membre (message dans le salon + DM si possible).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à avertir').setRequired(true))
    .addStringOption((option) =>
      option.setName('raison').setDescription("Raison de l'avertissement").setRequired(true)
    ),

  async execute(interaction) {
    if (!isStaffMember(interaction.member)) {
      await interaction.reply({ content: 'Seul le staff peut faire ça.', flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.options.getMember('membre');
    const reason = interaction.options.getString('raison');

    if (!member) {
      await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (isStaffMember(member)) {
      await interaction.reply({
        content: 'Cette commande ne peut pas cibler un membre du staff.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // On répond d'abord : Discord n'attend que 3s pour le premier accusé de
    // réception, et l'envoi du DM (ouverture du canal DM, etc.) peut prendre
    // plus longtemps que ça, ce qui ferait échouer l'interaction entière.
    await interaction.reply(`⚠️ **${member.user.tag}** a été averti. Raison : ${reason}`);

    // Les DM peuvent être fermés : pas bloquant, l'avertissement reste posté
    // dans le salon dans tous les cas.
    await member
      .send(`⚠️ Tu as reçu un avertissement sur **${interaction.guild.name}**.\nRaison : ${reason}`)
      .catch(() => {});

    await logAction(`⚠️ **Warn** — ${member.user.tag} (\`${member.id}\`) par ${interaction.user.tag}. Raison : ${reason}`);
  }
};
