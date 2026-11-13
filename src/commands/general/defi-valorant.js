const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { drawChallenges, CHALLENGES, LEVELS } = require('../../utils/valorantChallenges');
const { claimChallengeReward, CHALLENGE_DAILY_MAX } = require('../../utils/economy');
const { isStaffMember } = require('../../utils/permissions');
const { logError } = require('../../utils/logger');

const DURATION_MS = 3 * 60 * 60 * 1000; // le temps d'une session de jeu
const ALL_DONE_BONUS = 25;

// En mémoire, comme /customs : un défi n'a de sens que pour la session en cours.
const sessions = new Map();
let nextId = 1;

function activeSessionOf(userId) {
  return [...sessions.values()].find((s) => s.players.has(userId));
}

function buildEmbed(session) {
  const ended = session.endedReason !== null;
  const players = [...session.players].map((id) => `<@${id}>`).join(', ');
  const embed = new EmbedBuilder()
    .setColor(ended ? 0x4f545c : 0xff4655)
    .setTitle('🎯 Défis Valorant')
    .setDescription(
      `**Joueurs (${session.players.size}/${session.max}) :** ${players}\n` +
      (ended
        ? `\n🏁 **Terminé** — ${session.endedReason}`
        : `\nRéussis un défi en partie, puis clique sur son bouton ✅.\n⏳ Fin <t:${Math.floor(session.expiresAt / 1000)}:R>`)
    )
    .setFooter({ text: `Validation à l'honneur · ${ALL_DONE_BONUS} 🐾 de bonus pour les 5 défis · ${CHALLENGE_DAILY_MAX} 🐾 max par jour` });

  session.challenges.forEach((challenge, index) => {
    const done = [...session.done[index]].map((id) => `<@${id}>`).join(' ');
    embed.addFields({
      name: `${index + 1}. ${challenge.emoji} ${challenge.label} · ${challenge.reward} 🐾`,
      value: `${challenge.text}${challenge.team ? ' 👥' : ''}\n${done ? `✅ ${done}` : '*Pas encore réussi*'}`
    });
  });

  if (ended) {
    const allDone = [...session.players].filter((id) => session.done.every((set) => set.has(id)));
    if (allDone.length) {
      embed.addFields({ name: '🏆 Les 5 défis réussis', value: allDone.map((id) => `<@${id}>`).join(', ') });
    }
  }

  return embed;
}

function buildComponents(session) {
  const ended = session.endedReason !== null;
  const challengeRow = new ActionRowBuilder().addComponents(
    session.challenges.map((challenge, index) =>
      new ButtonBuilder()
        .setCustomId(`defi-valorant:done:${session.id}:${index}`)
        .setLabel(`Défi ${index + 1}`)
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
        .setDisabled(ended)
    )
  );
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`defi-valorant:join:${session.id}`)
      .setLabel('Je participe')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(ended || session.players.size >= session.max),
    new ButtonBuilder()
      .setCustomId(`defi-valorant:end:${session.id}`)
      .setLabel('Terminer')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(ended),
    // Toujours actif : tout le serveur peut consulter la liste complète.
    new ButtonBuilder()
      .setCustomId(`defi-valorant:list:${session.id}`)
      .setLabel('Tous les défis')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary)
  );
  return [challengeRow, controlRow];
}

function buildListEmbed() {
  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle(`📜 Les ${CHALLENGES.length} défis Valorant`)
    .setDescription('Chaque `/defi-valorant` en tire 5 au hasard. 👥 = défi de groupe (jamais tiré en solo).');
  for (const [level, info] of Object.entries(LEVELS)) {
    embed.addFields({
      name: `${info.emoji} ${info.label} · ${info.reward} 🐾`,
      value: CHALLENGES.filter((c) => c.level === level).map((c) => `• ${c.text}${c.team ? ' 👥' : ''}`).join('\n')
    });
  }
  return embed;
}

async function endSession(session, reason, client) {
  if (session.endedReason !== null) {
    return;
  }
  session.endedReason = reason;
  clearTimeout(session.timer);
  sessions.delete(session.id);

  try {
    const channel = await client.channels.fetch(session.channelId);
    const message = await channel.messages.fetch(session.messageId);
    await message.edit({ embeds: [buildEmbed(session)], components: buildComponents(session), allowedMentions: { parse: [] } });
  } catch (error) {
    await logError('Fin du défi Valorant', error);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('defi-valorant')
    .setDescription('Tire 5 défis Valorant au hasard à réussir en partie, seul ou en groupe.')
    .addIntegerOption((option) =>
      option
        .setName('joueurs')
        .setDescription('Nombre de joueurs (1 à 5)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(5)
    ),

  async execute(interaction) {
    const current = activeSessionOf(interaction.user.id);
    if (current) {
      await interaction.reply({
        content: 'Tu participes déjà à des défis en cours : termine-les (bouton 🛑) avant d\'en lancer d\'autres.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const max = interaction.options.getInteger('joueurs');
    const session = {
      id: nextId++,
      ownerId: interaction.user.id,
      max,
      players: new Set([interaction.user.id]),
      challenges: drawChallenges(max === 1),
      done: [],
      expiresAt: Date.now() + DURATION_MS,
      endedReason: null,
      channelId: interaction.channelId,
      messageId: null,
      timer: null
    };
    session.done = session.challenges.map(() => new Set());

    await interaction.reply({
      embeds: [buildEmbed(session)],
      components: buildComponents(session),
      allowedMentions: { parse: [] }
    });
    session.messageId = (await interaction.fetchReply()).id;
    sessions.set(session.id, session);
    session.timer = setTimeout(() => endSession(session, 'temps écoulé (3 h).', interaction.client), DURATION_MS);
  },

  async handleButton(interaction, action) {
    const [, , sessionId, index] = interaction.customId.split(':');
    const session = sessions.get(Number(sessionId));
    const userId = interaction.user.id;

    if (action === 'list') {
      await interaction.reply({ embeds: [buildListEmbed()], flags: MessageFlags.Ephemeral });
      return;
    }

    if (!session) {
      await interaction.reply({ content: 'Ces défis sont terminés.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'join') {
      const other = activeSessionOf(userId);
      if (session.players.has(userId)) {
        await interaction.reply({ content: 'Tu participes déjà.', flags: MessageFlags.Ephemeral });
      } else if (other) {
        await interaction.reply({ content: 'Tu participes déjà à d\'autres défis en cours.', flags: MessageFlags.Ephemeral });
      } else if (session.players.size >= session.max) {
        await interaction.reply({ content: 'Le groupe est complet.', flags: MessageFlags.Ephemeral });
      } else {
        session.players.add(userId);
        await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session), allowedMentions: { parse: [] } });
      }
      return;
    }

    if (action === 'end') {
      if (userId !== session.ownerId && !isStaffMember(interaction.member)) {
        await interaction.reply({ content: 'Seul celui qui a lancé les défis peut les terminer.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferUpdate();
      await endSession(session, `arrêté par ${interaction.user.username}.`, interaction.client);
      return;
    }

    if (action === 'done') {
      const challenge = session.challenges[Number(index)];
      const done = session.done[Number(index)];
      if (!challenge) {
        return;
      }
      if (!session.players.has(userId)) {
        await interaction.reply({ content: 'Clique d\'abord sur 🙋 **Je participe**.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (done.has(userId)) {
        await interaction.reply({ content: 'Tu as déjà validé ce défi.', flags: MessageFlags.Ephemeral });
        return;
      }

      // Marqué avant le crédit : deux clics rapides ne paient qu'une fois.
      done.add(userId);
      const allDone = session.done.every((set) => set.has(userId));
      const gained = await claimChallengeReward(userId, challenge.reward + (allDone ? ALL_DONE_BONUS : 0));

      await interaction.update({ embeds: [buildEmbed(session)], components: buildComponents(session), allowedMentions: { parse: [] } });
      await interaction.followUp({
        content: gained > 0
          ? `✅ Défi ${Number(index) + 1} validé : **+${gained} 🐾**${allDone ? ` (dont ${ALL_DONE_BONUS} de bonus, les 5 défis sont faits 🏆)` : ''}`
          : `✅ Défi ${Number(index) + 1} validé, mais tu as atteint le maximum de ${CHALLENGE_DAILY_MAX} 🐾 de défis pour aujourd'hui.`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
