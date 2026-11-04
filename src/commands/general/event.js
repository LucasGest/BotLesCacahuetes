const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const events = require('../../utils/events');
const { addCoins } = require('../../utils/economy');
const { crownSupreme } = require('../../utils/supremeRole');
const { isStaffMember } = require('../../utils/permissions');
const { logError, logAction } = require('../../utils/logger');

const EVENTS_CHANNEL_ID = '1553347040870924319'; // #events

const TYPES = {
  customs: '🎮 Customs',
  defi: '🎲 Défi fun',
  tournoi: '🏆 Tournoi'
};

const STATUS_LABELS = {
  open: '🟢 Inscriptions ouvertes',
  running: '🔴 En cours',
  finished: '🏁 Terminé',
  cancelled: '❌ Annulé'
};

const STATUS_COLORS = { open: 0x57f287, running: 0xff4655, finished: 0xffd700, cancelled: 0x747f8d };

const MAX_LISTED_PARTICIPANTS = 35;
const MEDALS = ['🥇', '🥈', '🥉'];

function participantsText(event) {
  const ids = Object.keys(event.participants);
  if (ids.length === 0) {
    return "Personne pour l'instant";
  }

  const listed = ids.slice(0, MAX_LISTED_PARTICIPANTS).map((id) => `<@${id}>`).join(' ');
  return ids.length > MAX_LISTED_PARTICIPANTS ? `${listed} et ${ids.length - MAX_LISTED_PARTICIPANTS} autres` : listed;
}

function statLine(entry, index) {
  return `${MEDALS[index] ?? `${index + 1}.`} <@${entry.userId}> : ⭐ ${entry.mvp} MVP · 🏆 ${entry.wins} victoire(s)`;
}

function buildAnnouncement(event) {
  const embed = new EmbedBuilder()
    .setColor(STATUS_COLORS[event.status])
    .setTitle(`${TYPES[event.type]} : ${event.name}`)
    .setDescription(event.description || null)
    .addFields(
      { name: '📅 Quand', value: event.date, inline: true },
      { name: '🎯 Format', value: event.format, inline: true },
      { name: 'État', value: STATUS_LABELS[event.status], inline: true },
      { name: `👥 Participants (${Object.keys(event.participants).length})`, value: participantsText(event) }
    );

  if (event.status === 'finished') {
    const top = events.sortStats(events.computeStats(event)).slice(0, 10);
    embed.addFields(
      { name: '👑 Gagnant', value: `<@${event.winnerId}>` },
      { name: '📊 Résultats', value: top.map(statLine).join('\n') }
    );
  }

  if (event.status !== 'open') {
    return { embeds: [embed], components: [] };
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`event:join:${event.id}`).setLabel('Je participe').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`event:leave:${event.id}`).setLabel('Me désinscrire').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

function buildPanel(event, notice) {
  const stats = events.sortStats(events.computeStats(event));
  const embed = new EmbedBuilder()
    .setColor(STATUS_COLORS[event.status])
    .setTitle(`🛠️ ${event.name}`)
    .setDescription(`${STATUS_LABELS[event.status]}\n👥 **${stats.length}** participant(s)`);

  if (event.status === 'running' && stats.length > 0) {
    embed.addFields({ name: '📊 Scores', value: stats.slice(0, 15).map(statLine).join('\n') });
  }

  const button = (action, label, style, disabled = false) =>
    new ButtonBuilder().setCustomId(`event:${action}:${event.id}`).setLabel(label).setStyle(style).setDisabled(disabled);
  const row = new ActionRowBuilder();

  if (event.status === 'open') {
    row.addComponents(
      button('start', '▶️ Démarrer', ButtonStyle.Success, stats.length === 0),
      button('cancel', "Annuler l'événement", ButtonStyle.Danger)
    );
  } else if (event.status === 'running') {
    row.addComponents(
      button('mvp', '⭐ MVP', ButtonStyle.Primary),
      button('win', '🏆 Victoire', ButtonStyle.Primary),
      button('undo', '↩️ Annuler la dernière action', ButtonStyle.Secondary, event.actions.length === 0),
      button('finish', '🏁 Terminer', ButtonStyle.Success),
      button('cancel', "Annuler l'événement", ButtonStyle.Danger)
    );
  }

  return { content: notice ?? '', embeds: [embed], components: row.components.length > 0 ? [row] : [] };
}

function backRow(eventId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`event:panel:${eventId}`).setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );
}

function userPicker(action, eventId, placeholder, maxValues) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`event:${action}:${eventId}`)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(maxValues)
  );
}

// Un message d'annonce supprimé à la main ne doit pas bloquer la gestion de l'événement.
async function refreshAnnouncement(client, event) {
  if (!event.messageId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(event.channelId);
    const message = await channel.messages.fetch(event.messageId);
    await message.edit(buildAnnouncement(event));
  } catch (error) {
    await logError(`Annonce de l'événement ${event.id}`, error);
  }
}

async function replyStaffOnly(interaction) {
  await interaction.reply({ content: 'Seul le staff peut gérer les événements.', flags: MessageFlags.Ephemeral });
}

// Paie chaque joueur séparément : l'échec d'un paiement n'empêche pas les autres.
async function payRewards(event) {
  const stats = events.computeStats(event);
  const results = await Promise.allSettled(stats.map((entry) => addCoins(entry.userId, events.rewardFor(entry))));
  const failed = stats.filter((_, i) => results[i].status === 'rejected');

  for (const entry of failed) {
    await logError(`Récompense de l'événement ${event.id}`, new Error(`Paiement échoué pour ${entry.userId} (${events.rewardFor(entry)} cacahuètes)`));
  }

  return failed.length;
}

async function finishEvent(interaction, eventId, winnerId) {
  const event = await events.finish(eventId, winnerId);
  const failedPayments = await payRewards(event);

  const notices = ['🏁 Événement terminé, récompenses distribuées.'];
  if (failedPayments > 0) {
    notices.push(`⚠️ ${failedPayments} paiement(s) ont échoué : voir le salon de logs.`);
  }

  const winner = await interaction.guild.members.fetch(winnerId).catch(() => null);
  const crown = winner ? await crownSupreme(interaction.guild, winner) : { ok: false, reason: 'Le gagnant a quitté le serveur.' };
  if (!crown.ok) {
    notices.push(`⚠️ Rôle non attribué : ${crown.reason}`);
  }

  await refreshAnnouncement(interaction.client, event);

  const channel = await interaction.client.channels.fetch(event.channelId).catch(() => null);
  await channel
    ?.send({
      content: `🎉 **${event.name}** est terminé ! Bravo <@${winnerId}>${crown.ok ? ', nouvelle **Cacahuète Suprême**' : ''} !`,
      embeds: buildAnnouncement(event).embeds
    })
    .catch((error) => logError(`Résultats de l'événement ${event.id}`, error));

  await logAction(`🏁 Événement « ${event.name} » terminé par ${interaction.user.username}, gagnant : ${winnerId}.`);
  await interaction.editReply(buildPanel(event, notices.join('\n')));
}

async function showBoard(interaction, title, stats, extra = {}) {
  const top = events.sortStats(stats).slice(0, 15);
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(title)
    .setDescription(top.length > 0 ? top.map(statLine).join('\n') : 'Aucun résultat pour le moment.');

  await interaction.reply({ embeds: [embed], ...extra });
}

const subcommands = {
  async creer(interaction) {
    if (!isStaffMember(interaction.member)) {
      await replyStaffOnly(interaction);
      return;
    }

    const input = (id, label, style, maxLength, placeholder, required = true) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(style)
          .setMaxLength(maxLength)
          .setPlaceholder(placeholder)
          .setRequired(required)
      );

    const modal = new ModalBuilder()
      .setCustomId(`event:create:${interaction.options.getString('type')}`)
      .setTitle('Nouvel événement')
      .addComponents(
        input('name', 'Nom', TextInputStyle.Short, 80, 'La Roulette des Cacahuètes'),
        input('date', 'Date et heure', TextInputStyle.Short, 60, 'Dimanche 15/11 à 18h00'),
        input('format', 'Format', TextInputStyle.Short, 100, 'En vocal, 5v5'),
        input('description', 'Concept (facultatif)', TextInputStyle.Paragraph, 1500, 'Explique les règles…', false)
      );

    await interaction.showModal(modal);
  },

  async liste(interaction) {
    const current = await events.listEvents(['open', 'running']);
    const lines = current.map((event) => `${STATUS_LABELS[event.status]} · **${event.name}** · ${event.date}`);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🎉 Événements à venir et en cours')
      .setDescription(lines.length > 0 ? lines.slice(0, 25).join('\n') : "Aucun événement pour l'instant.");

    await interaction.reply({ embeds: [embed] });
  },

  async gerer(interaction) {
    if (!isStaffMember(interaction.member)) {
      await replyStaffOnly(interaction);
      return;
    }

    const current = await events.listEvents(['open', 'running']);

    if (current.length === 0) {
      await interaction.reply({ content: 'Aucun événement à gérer. Crée-en un avec `/event creer`.', flags: MessageFlags.Ephemeral });
      return;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('event:pick')
      .setPlaceholder('Choisis un événement')
      .addOptions(
        current.slice(0, 25).map((event) => ({
          label: event.name.slice(0, 100),
          description: STATUS_LABELS[event.status],
          value: event.id
        }))
      );

    await interaction.reply({
      content: 'Quel événement veux-tu gérer ?',
      components: [new ActionRowBuilder().addComponents(select)],
      flags: MessageFlags.Ephemeral
    });
  },

  async classement(interaction) {
    const all = await events.listEvents(['running', 'finished']);
    const finished = all.filter((event) => event.status === 'finished');
    const extra = {};

    if (all.length > 0) {
      const select = new StringSelectMenuBuilder()
        .setCustomId('event:board')
        .setPlaceholder('Voir le classement d’un événement')
        .addOptions(all.slice(0, 25).map((event) => ({ label: event.name.slice(0, 100), value: event.id })));
      extra.components = [new ActionRowBuilder().addComponents(select)];
    }

    await showBoard(interaction, '🏆 Classement général des événements', events.aggregateStats(finished), extra);
  }
};

async function handleManagement(interaction, action, eventId) {
  await interaction.deferUpdate();
  const panel = async (event, notice) => interaction.editReply(buildPanel(event, notice));

  switch (action) {
    case 'panel':
      await panel(await events.getEvent(eventId));
      break;

    case 'start': {
      const event = await events.start(eventId);
      await refreshAnnouncement(interaction.client, event);
      await panel(event, '▶️ Événement démarré, inscriptions fermées.');
      break;
    }

    case 'mvp':
      await interaction.editReply({
        content: 'Qui est le MVP de cette partie ?',
        embeds: [],
        components: [userPicker('setmvp', eventId, 'Choisis le MVP', 1), backRow(eventId)]
      });
      break;

    case 'win':
      await interaction.editReply({
        content: 'Qui a gagné cette partie ?',
        embeds: [],
        components: [userPicker('setwin', eventId, 'Choisis les gagnants', 25), backRow(eventId)]
      });
      break;

    case 'undo': {
      const { event, undone } = await events.undoLastAction(eventId);
      const label = undone.type === 'mvp' ? 'MVP' : 'victoire';
      await panel(event, `↩️ Dernière action annulée (${label}).`);
      break;
    }

    case 'finish':
      await interaction.editReply({
        content: "Qui est le **gagnant de l'événement** ? Il recevra le rôle Cacahuète Suprême.",
        embeds: [],
        components: [userPicker('setwinner', eventId, 'Choisis le gagnant', 1), backRow(eventId)]
      });
      break;

    case 'finishok':
      await finishEvent(interaction, eventId, interaction.customId.split(':')[3]);
      break;

    case 'cancel':
      await interaction.editReply({
        content: '⚠️ Annuler cet événement ? Aucune récompense ne sera distribuée, et ce sera définitif.',
        embeds: [],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`event:cancelok:${eventId}`).setLabel("Oui, annuler l'événement").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`event:panel:${eventId}`).setLabel('Non, retour').setStyle(ButtonStyle.Secondary)
          )
        ]
      });
      break;

    case 'cancelok': {
      const event = await events.cancel(eventId);
      await refreshAnnouncement(interaction.client, event);
      await logAction(`❌ Événement « ${event.name} » annulé par ${interaction.user.username}.`);
      await panel(event, '❌ Événement annulé.');
      break;
    }

    default:
      break;
  }
}

// Une erreur métier s'affiche à l'utilisateur ; une erreur technique remonte à
// interactionCreate, qui la journalise sans en montrer le détail.
async function withEventErrors(interaction, work) {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof events.EventError)) {
      throw error;
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `⚠️ ${error.message}`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `⚠️ ${error.message}`, flags: MessageFlags.Ephemeral });
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Événements de la communauté.')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Crée et annonce un événement (staff).')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription("Type d'événement")
            .setRequired(true)
            .addChoices(...Object.entries(TYPES).map(([value, name]) => ({ name, value })))
        )
    )
    .addSubcommand((sub) => sub.setName('liste').setDescription('Affiche les événements à venir et en cours.'))
    .addSubcommand((sub) => sub.setName('gerer').setDescription('Ouvre le panneau de gestion (staff).'))
    .addSubcommand((sub) => sub.setName('classement').setDescription('Affiche les MVP et les victoires.')),

  async execute(interaction) {
    await withEventErrors(interaction, () => subcommands[interaction.options.getSubcommand()](interaction));
  },

  async handleModal(interaction, action) {
    if (action !== 'create') {
      return;
    }

    if (!isStaffMember(interaction.member)) {
      await replyStaffOnly(interaction);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    await withEventErrors(interaction, async () => {
      const event = await events.createEvent({
        type: interaction.customId.split(':')[2],
        name: interaction.fields.getTextInputValue('name').trim(),
        date: interaction.fields.getTextInputValue('date').trim(),
        format: interaction.fields.getTextInputValue('format').trim(),
        description: interaction.fields.getTextInputValue('description').trim(),
        channelId: EVENTS_CHANNEL_ID,
        createdBy: interaction.user.id
      });

      try {
        const channel = await interaction.client.channels.fetch(EVENTS_CHANNEL_ID);
        const message = await channel.send(buildAnnouncement(event));
        await events.setMessageId(event.id, message.id);
      } catch (error) {
        // Sans annonce, personne ne pourrait s'inscrire : on ne garde pas un événement fantôme.
        await events.deleteEvent(event.id).catch(() => {});
        throw error;
      }

      await logAction(`🎉 Événement « ${event.name} » créé par ${interaction.user.username}.`);
      await interaction.editReply(`✅ Événement publié dans <#${EVENTS_CHANNEL_ID}>. Gère-le avec \`/event gerer\`.`);
    });
  },

  async handleButton(interaction, action) {
    const eventId = interaction.customId.split(':')[2];

    await withEventErrors(interaction, async () => {
      if (action === 'join' || action === 'leave') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const event = action === 'join' ? await events.join(eventId, interaction.user) : await events.leave(eventId, interaction.user.id);
        await refreshAnnouncement(interaction.client, event);
        await interaction.editReply(action === 'join' ? '✅ Tu es inscrit(e) !' : 'Tu es désinscrit(e).');
        return;
      }

      if (!isStaffMember(interaction.member)) {
        await replyStaffOnly(interaction);
        return;
      }

      await handleManagement(interaction, action, eventId);
    });
  },

  async handleSelectMenu(interaction, action) {
    await withEventErrors(interaction, async () => {
      if (action === 'board') {
        const event = await events.getEvent(interaction.values[0]);
        await showBoard(interaction, `📊 ${event.name}`, events.computeStats(event), { flags: MessageFlags.Ephemeral });
        return;
      }

      if (action !== 'pick') {
        return;
      }

      if (!isStaffMember(interaction.member)) {
        await replyStaffOnly(interaction);
        return;
      }

      await interaction.deferUpdate();
      await interaction.editReply(buildPanel(await events.getEvent(interaction.values[0])));
    });
  },

  async handleUserSelect(interaction, action) {
    if (!isStaffMember(interaction.member)) {
      await replyStaffOnly(interaction);
      return;
    }

    const eventId = interaction.customId.split(':')[2];

    await withEventErrors(interaction, async () => {
      await interaction.deferUpdate();

      if (action === 'setmvp') {
        const event = await events.addAction(eventId, 'mvp', interaction.values, interaction.user.id);
        await interaction.editReply(buildPanel(event, `⭐ MVP ajouté : <@${interaction.values[0]}>`));
      } else if (action === 'setwin') {
        const event = await events.addAction(eventId, 'win', interaction.values, interaction.user.id);
        await interaction.editReply(buildPanel(event, `🏆 Victoire ajoutée : ${interaction.values.map((id) => `<@${id}>`).join(' ')}`));
      } else if (action === 'setwinner') {
        const event = await events.getEvent(eventId);
        const winnerId = interaction.values[0];

        if (!event.participants[winnerId]) {
          throw new events.EventError('Le gagnant doit être un participant inscrit.');
        }

        await interaction.editReply({
          content: `Terminer **${event.name}** avec <@${winnerId}> comme gagnant ? Les récompenses seront distribuées, et ce sera définitif.`,
          embeds: [],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`event:finishok:${eventId}:${winnerId}`).setLabel('Oui, terminer').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`event:panel:${eventId}`).setLabel('Non, retour').setStyle(ButtonStyle.Secondary)
            )
          ]
        });
      }
    });
  }
};
