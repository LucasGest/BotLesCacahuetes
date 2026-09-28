const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { setCrosshair, getCrosshair } = require('../../utils/crosshairs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crosshair')
    .setDescription('Partage ou consulte un code de viseur Valorant.')
    .addSubcommand((sub) =>
      sub
        .setName('enregistrer')
        .setDescription('Enregistre ton code de viseur')
        .addStringOption((option) =>
          option.setName('code').setDescription('Ton code de viseur Valorant').setRequired(true).setMaxLength(300)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription("Affiche le code de viseur d'un membre")
        .addUserOption((option) => option.setName('membre').setDescription('Le membre (toi-même par défaut)'))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'enregistrer') {
      const code = interaction.options.getString('code').trim();
      await setCrosshair(interaction.user.id, code);
      await interaction.reply({
        content: '✅ Ton code de viseur a été enregistré ! Utilise `/crosshair voir` pour le retrouver.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const target = interaction.options.getUser('membre') ?? interaction.user;
    const code = await getCrosshair(target.id);

    if (!code) {
      await interaction.reply({
        content: `❌ ${target.username} n'a pas encore enregistré de viseur.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`🎯 Viseur de ${target.username}`)
      .setDescription(`\`\`\`${code}\`\`\`\nImporte-le via Réglages > Croix de visée > Importer un profil.`);

    await interaction.reply({ embeds: [embed] });
  }
};
