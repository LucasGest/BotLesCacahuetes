const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags
} = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { GAMES } = require('../../utils/games');
const { safeAddRole } = require('../../utils/roleSafety');

const ROLES_CHANNEL_ID = '1567954290012721152'; // #rôles

function findRole(guild, game) {
  return guild.roles.cache.find((role) => role.name === game.roleName);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roles-jeux')
    .setDescription('Poste le choix des rôles de jeux dans le salon des rôles (staff uniquement).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    if (!isStaffMember(interaction.member)) {
      await interaction.reply({ content: 'Seul le staff peut faire ça.', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Le choix du jeu ne doit donner aucun droit : ces rôles n'ont aucune permission.
    for (const game of GAMES) {
      if (!findRole(interaction.guild, game)) {
        await interaction.guild.roles.create({ name: game.roleName, permissions: [], reason: 'Rôles de jeux' });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎮 Choisis tes jeux')
      .setDescription('Clique sur un jeu pour recevoir son rôle.\nClique de nouveau pour le retirer.');

    const buttons = GAMES.map((game) =>
      new ButtonBuilder()
        .setCustomId(`roles-jeux:toggle:${game.key}`)
        .setLabel(game.label)
        .setEmoji(game.emoji)
        .setStyle(ButtonStyle.Secondary)
    );

    const channel = await interaction.client.channels.fetch(ROLES_CHANNEL_ID);
    await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(buttons)] });

    await interaction.editReply(`✅ Choix des rôles publié dans <#${ROLES_CHANNEL_ID}>.`);
  },

  async handleButton(interaction, action) {
    if (action !== 'toggle') {
      return;
    }

    const game = GAMES.find((g) => g.key === interaction.customId.split(':')[2]);
    const role = game && findRole(interaction.guild, game);

    if (!role) {
      await interaction.reply({ content: "Ce rôle n'existe plus : préviens le staff.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (!role.editable) {
      await interaction.reply({ content: "Je ne peux pas gérer ce rôle : préviens le staff.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.member.roles.cache.has(role.id)) {
      await interaction.member.roles.remove(role);
      await interaction.editReply(`${game.emoji} Rôle **${game.label}** retiré.`);
    } else {
      await safeAddRole(interaction.member, role, 'Rôle de jeu choisi');
      await interaction.editReply(`${game.emoji} Rôle **${game.label}** ajouté !`);
    }
  }
};
