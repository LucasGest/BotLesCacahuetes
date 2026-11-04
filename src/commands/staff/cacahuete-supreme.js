const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { crownSupreme } = require('../../utils/supremeRole');

const SUPREME_ROLE_LABEL = 'Cacahuète Suprême'; // juste pour les messages affichés

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cacahuete-supreme')
    .setDescription('Couronne le gagnant du tournoi (staff uniquement).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption((option) =>
      option.setName('membre').setDescription('Le gagnant à couronner').setRequired(true)
    ),

  async execute(interaction) {
    // Ne jamais se fier uniquement à setDefaultMemberPermissions : on revérifie
    // explicitement le rôle staff dans le code.
    if (!isStaffMember(interaction.member)) {
      await interaction.reply({
        content: 'Seul le staff peut couronner un gagnant.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const winner = interaction.options.getMember('membre');

    if (!winner) {
      await interaction.reply({ content: 'Membre introuvable sur ce serveur.', flags: MessageFlags.Ephemeral });
      return;
    }

    // Le chargement des membres peut dépasser les 3 s laissées par Discord.
    await interaction.deferReply();
    const result = await crownSupreme(interaction.guild, winner);

    if (!result.ok) {
      await interaction.deleteReply().catch(() => {});
      await interaction.followUp({ content: result.reason, flags: MessageFlags.Ephemeral });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 Cacahuète Suprême !')
      .setDescription(`${winner} est couronné(e) **${SUPREME_ROLE_LABEL}** ! Félicitations pour la victoire du tournoi 🎉`)
      .setThumbnail(winner.user.displayAvatarURL())
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
