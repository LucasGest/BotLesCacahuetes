const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  MessageFlags
} = require('discord.js');
const { addCoins } = require('../../utils/economy');
const { getCurse, clearCurse } = require('../../utils/agentCurses');

const EVENT_PARTICIPATION_REWARD = 20;

const RANKS = ['Fer', 'Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Ascendant', 'Immortel', 'Radiant'];
const CUSTOMS_CATEGORY_NAME = '🎮 Customs';

// État en mémoire par session : pas besoin de survivre à un redémarrage, une
// session de customs n'a de sens que pour la soirée en cours.
const sessions = new Map();
let nextSessionId = 1;

function buildSessionEmbed(session) {
  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle('🎮 Customs')
    .setFooter({ text: `Organisé par ${session.organizerName}` })
    .setTimestamp();

  if (!session.teams) {
    const list =
      session.participants.size > 0
        ? [...session.participants.values()].map((p) => `• ${p.username} — ${p.rank}`).join('\n')
        : "Personne pour l'instant";

    embed.setDescription(
      `Clique sur **✅ Je participe** pour t'inscrire.\n\n**Participants (${session.participants.size})**\n${list}`
    );
    return embed;
  }

  const format = (team) =>
    team
      .map((p) => `• ${p.username} — ${p.rank}${p.curse ? ` (😈 forcé de jouer **${p.curse.agentName}**)` : ''}`)
      .join('\n') || 'Vide';

  embed
    .setDescription('Équipes formées ! Bonne chance 🍀')
    .addFields(
      { name: `🔵 Équipe 1 (${session.teams.teamA.length})`, value: format(session.teams.teamA), inline: true },
      { name: `🔴 Équipe 2 (${session.teams.teamB.length})`, value: format(session.teams.teamB), inline: true }
    );

  return embed;
}

function buildComponents(session) {
  const joinRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customs:join:${session.id}`)
      .setLabel('Je participe')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );

  const formButton = new ButtonBuilder()
    .setCustomId(`customs:teams:${session.id}`)
    .setLabel('Former les équipes')
    .setEmoji('🎲')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(session.participants.size < 2);

  const moveButton = new ButtonBuilder()
    .setCustomId(`customs:move:${session.id}`)
    .setLabel('Déplacer en vocal')
    .setEmoji('🔊')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!session.teams);

  const endButton = new ButtonBuilder()
    .setCustomId(`customs:end:${session.id}`)
    .setLabel('Terminer les customs')
    .setEmoji('🛑')
    .setStyle(ButtonStyle.Danger);

  const organizerRow = new ActionRowBuilder().addComponents(formButton, moveButton, endButton);

  return session.teams ? [organizerRow] : [joinRow, organizerRow];
}

// Le menu de choix de rang est envoyé comme réponse éphémère séparée (une
// select menu ne peut pas cohabiter avec showModal, et on veut que ce soit
// privé) : on garde donc une référence directe au message public de la
// session pour pouvoir le mettre à jour depuis là.
async function refreshSessionMessage(session, guild) {
  try {
    const channel = await guild.channels.fetch(session.channelId);
    const message = await channel.messages.fetch(session.messageId);
    await message.edit({ embeds: [buildSessionEmbed(session)], components: buildComponents(session) });
  } catch (error) {
    console.error('Impossible de mettre à jour le message de customs :', error.message);
  }
}

function formTeams(participants) {
  const sorted = [...participants.values()].sort((a, b) => b.rankValue - a.rankValue);
  const teamA = [];
  const teamB = [];
  let sumA = 0;
  let sumB = 0;

  for (const player of sorted) {
    if (sumA <= sumB) {
      teamA.push(player);
      sumA += player.rankValue;
    } else {
      teamB.push(player);
      sumB += player.rankValue;
    }
  }

  return { teamA, teamB };
}

// Révèle et consomme les malédictions "agent imposé" (achetées à la
// boutique) sur les joueurs des deux équipes, une fois les équipes formées.
async function appliquerAgentsImposes(session) {
  const allPlayers = [...session.teams.teamA, ...session.teams.teamB];

  await Promise.all(
    allPlayers.map(async (player) => {
      const curse = await getCurse(player.id).catch(() => null);
      if (curse) {
        player.curse = curse;
        await clearCurse(player.id).catch(() => {});
      }
    })
  );
}

async function getOrCreateCustomsCategory(guild) {
  let category = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === CUSTOMS_CATEGORY_NAME
  );

  if (!category) {
    category = await guild.channels.create({ name: CUSTOMS_CATEGORY_NAME, type: ChannelType.GuildCategory });
  }

  return category;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('customs')
    .setDescription('Lance une session de customs (inscriptions + équipes équilibrées par rang).'),

  async execute(interaction) {
    const sessionId = String(nextSessionId++);
    const session = {
      id: sessionId,
      organizerId: interaction.user.id,
      organizerName: interaction.user.username,
      channelId: interaction.channelId,
      messageId: null,
      participants: new Map(),
      teams: null,
      voiceChannelIds: null
    };
    sessions.set(sessionId, session);

    await interaction.reply({ embeds: [buildSessionEmbed(session)], components: buildComponents(session) });
    const message = await interaction.fetchReply();
    session.messageId = message.id;
  },

  async handleButton(interaction, action) {
    const sessionId = interaction.customId.split(':')[2];
    const session = sessions.get(sessionId);

    if (!session) {
      await interaction.reply({ content: 'Cette session de customs a expiré.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'join') {
      const select = new StringSelectMenuBuilder()
        .setCustomId(`customs:rank:${sessionId}`)
        .setPlaceholder('Choisis ton rang')
        .addOptions(RANKS.map((rank) => ({ label: rank, value: rank })));

      await interaction.reply({
        content: 'Quel est ton rang actuel ?',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Le reste des actions est réservé à l'organisateur de la session.
    if (interaction.user.id !== session.organizerId) {
      await interaction.reply({
        content: "Seul l'organisateur de cette session de customs peut faire ça.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (action === 'teams') {
      if (session.participants.size < 2) {
        await interaction.reply({ content: 'Il faut au moins 2 participants.', flags: MessageFlags.Ephemeral });
        return;
      }

      session.teams = formTeams(session.participants);
      await appliquerAgentsImposes(session);
      await interaction.update({ embeds: [buildSessionEmbed(session)], components: buildComponents(session) });
      return;
    }

    if (action === 'move') {
      if (!session.teams) {
        await interaction.reply({ content: "Forme d'abord les équipes.", flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const category = await getOrCreateCustomsCategory(interaction.guild);
      const [channelA, channelB] = await Promise.all([
        interaction.guild.channels.create({
          name: '🔵 Customs - Équipe 1',
          type: ChannelType.GuildVoice,
          parent: category.id
        }),
        interaction.guild.channels.create({
          name: '🔴 Customs - Équipe 2',
          type: ChannelType.GuildVoice,
          parent: category.id
        })
      ]);

      session.voiceChannelIds = { a: channelA.id, b: channelB.id };

      const notMoved = [];

      for (const [team, channel] of [
        [session.teams.teamA, channelA],
        [session.teams.teamB, channelB]
      ]) {
        for (const player of team) {
          const member = await interaction.guild.members.fetch(player.id).catch(() => null);

          if (!member?.voice.channelId) {
            notMoved.push(player.username);
            continue;
          }

          await member.voice.setChannel(channel).catch(() => notMoved.push(player.username));
        }
      }

      const summary =
        notMoved.length > 0
          ? `Déplacés dans ${channelA} / ${channelB}. Pas en vocal, donc pas déplacés : ${notMoved.join(', ')}.`
          : `Tout le monde a été déplacé dans ${channelA} / ${channelB} !`;

      await interaction.editReply(summary);
      return;
    }

    if (action === 'end') {
      if (session.voiceChannelIds) {
        await Promise.all(
          Object.values(session.voiceChannelIds).map((id) =>
            interaction.guild.channels
              .fetch(id)
              .then((c) => c.delete())
              .catch(() => {})
          )
        );
      }

      sessions.delete(sessionId);

      const endedEmbed = buildSessionEmbed(session).setDescription('🛑 Session de customs terminée.');
      await interaction.update({ embeds: [endedEmbed], components: [] });
    }
  },

  async handleSelectMenu(interaction, action) {
    if (action !== 'rank') {
      return;
    }

    const sessionId = interaction.customId.split(':')[2];
    const session = sessions.get(sessionId);

    if (!session) {
      await interaction.reply({ content: 'Cette session de customs a expiré.', flags: MessageFlags.Ephemeral });
      return;
    }

    const rank = interaction.values[0];
    const rankValue = RANKS.indexOf(rank) + 1;
    const isNewParticipant = !session.participants.has(interaction.user.id);

    session.participants.set(interaction.user.id, {
      id: interaction.user.id,
      username: interaction.user.username,
      rank,
      rankValue
    });

    // Bonus de participation "event" une seule fois, pas à chaque changement de rang.
    if (isNewParticipant) {
      await addCoins(interaction.user.id, EVENT_PARTICIPATION_REWARD).catch((error) =>
        console.error('Impossible de créditer la participation customs :', error.message)
      );
    }

    await interaction.update({
      content: `✅ Inscrit en tant que **${rank}** !${isNewParticipant ? ` (+${EVENT_PARTICIPATION_REWARD} 🥜)` : ''}`,
      components: []
    });
    await refreshSessionMessage(session, interaction.guild);
  }
};
