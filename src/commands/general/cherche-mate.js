const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');

const CHERCHE_MATE_CHANNEL_ID = '1553346964568018984';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cherche-mate')
    .setDescription('Cherche un mate pour jouer (mode, rang, places).'),

  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId('cherche-mate:modal').setTitle('🔎 Cherche un mate');

    const modeInput = new TextInputBuilder()
      .setCustomId('mode')
      .setLabel('Mode de jeu')
      .setPlaceholder('Ex: Compétitif, Non-classé, Deathmatch...')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(50)
      .setRequired(true);

    const rankInput = new TextInputBuilder()
      .setCustomId('rang')
      .setLabel('Rang')
      .setPlaceholder('Ex: Diamant 2')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(30)
      .setRequired(true);

    const slotsInput = new TextInputBuilder()
      .setCustomId('places')
      .setLabel('Places disponibles')
      .setPlaceholder('Ex: 2')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(10)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(modeInput),
      new ActionRowBuilder().addComponents(rankInput),
      new ActionRowBuilder().addComponents(slotsInput)
    );

    await interaction.showModal(modal);
  },

  async handleModal(interaction, action) {
    if (action !== 'modal') {
      return;
    }

    const mode = interaction.fields.getTextInputValue('mode');
    const rang = interaction.fields.getTextInputValue('rang');
    const places = interaction.fields.getTextInputValue('places');

    const channel =
      interaction.guild.channels.cache.get(CHERCHE_MATE_CHANNEL_ID) ??
      (await interaction.guild.channels.fetch(CHERCHE_MATE_CHANNEL_ID).catch(() => null));

    if (!channel?.isTextBased()) {
      await interaction.reply({
        content: 'Le salon cherche-mate est introuvable sur ce serveur.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔎 Recherche de mate')
      .addFields(
        { name: 'Joueur', value: `${interaction.user}`, inline: true },
        { name: 'Mode', value: mode, inline: true },
        { name: 'Rang', value: rang, inline: true },
        { name: 'Places', value: places, inline: true }
      )
      .setTimestamp();

    const joinButton = new ButtonBuilder()
      .setCustomId(`cherche-mate:join:${interaction.user.id}`)
      .setLabel('✅ Je viens')
      .setStyle(ButtonStyle.Success);

    await channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(joinButton)]
    });

    await interaction.reply({ content: `C'est posté dans ${channel} !`, flags: MessageFlags.Ephemeral });
  },

  async handleButton(interaction, action) {
    if (action !== 'join') {
      return;
    }

    const authorId = interaction.customId.split(':')[2];

    if (interaction.user.id === authorId) {
      await interaction.reply({
        content: "C'est toi qui cherches un mate, pas besoin de cliquer !",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply(`🔎 <@${authorId}>, ${interaction.user} veut jouer avec toi !`);
  }
};
