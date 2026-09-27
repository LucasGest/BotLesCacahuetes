const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const { isStaffMember } = require('../../utils/permissions');
const { logAction, logError } = require('../../utils/logger');

// Le bannissement est l'action la plus dure à annuler (débannir demande de
// retrouver l'ID manuellement) : on demande une confirmation explicite avant
// de l'exécuter, contrairement aux autres commandes de modération.
const pendingBans = new Map();
let nextBanId = 1;
const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bannit un membre du serveur (avec confirmation).')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName('membre').setDescription('Le membre à bannir').setRequired(true))
    .addStringOption((option) =>
      option.setName('raison').setDescription('Raison du bannissement (optionnelle)').setRequired(false)
    ),

  async execute(interaction) {
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
      await interaction.reply({ content: 'Je ne vais pas me bannir moi-même.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (isStaffMember(member)) {
      await interaction.reply({
        content: 'Cette commande ne peut pas cibler un membre du staff.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (!member.bannable) {
      await interaction.reply({
        content: 'Je ne peux pas bannir ce membre (rôle trop haut, ou permission manquante).',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const id = String(nextBanId++);
    pendingBans.set(id, { targetId: member.id, targetTag: member.user.tag, reason, requestedBy: interaction.user.id });
    setTimeout(() => pendingBans.delete(id), CONFIRMATION_TIMEOUT_MS);

    const confirmButton = new ButtonBuilder()
      .setCustomId(`ban:confirm:${id}`)
      .setLabel('Confirmer le bannissement')
      .setEmoji('🔨')
      .setStyle(ButtonStyle.Danger);

    const cancelButton = new ButtonBuilder().setCustomId(`ban:cancel:${id}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary);

    await interaction.reply({
      content: `⚠️ Confirmes-tu le bannissement de **${member.user.tag}** ?\nRaison : ${reason}`,
      components: [new ActionRowBuilder().addComponents(confirmButton, cancelButton)],
      flags: MessageFlags.Ephemeral
    });
  },

  async handleButton(interaction, action) {
    const id = interaction.customId.split(':')[2];
    const pending = pendingBans.get(id);

    if (!pending) {
      await interaction.reply({ content: 'Cette confirmation a expiré.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.user.id !== pending.requestedBy) {
      await interaction.reply({
        content: 'Seul celui qui a lancé la commande peut confirmer ou annuler.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    pendingBans.delete(id);

    if (action === 'cancel') {
      await interaction.update({ content: '❌ Bannissement annulé.', components: [] });
      return;
    }

    if (action !== 'confirm') {
      return;
    }

    const member = await interaction.guild.members.fetch(pending.targetId).catch(() => null);

    if (!member || !member.bannable) {
      await interaction.update({
        content: 'Impossible de bannir ce membre maintenant (parti, ou permission/hiérarchie insuffisante).',
        components: []
      });
      return;
    }

    try {
      await member.ban({ reason: pending.reason });
    } catch (error) {
      await logError(`Commande /ban sur ${pending.targetTag}`, error);
      await interaction.update({ content: 'Erreur lors du bannissement.', components: [] });
      return;
    }

    await interaction.update({
      content: `🔨 **${pending.targetTag}** a été banni. Raison : ${pending.reason}`,
      components: []
    });
    await logAction(
      `🔨 **Ban** — ${pending.targetTag} (\`${pending.targetId}\`) par ${interaction.user.tag}. Raison : ${pending.reason}`
    );
  }
};
