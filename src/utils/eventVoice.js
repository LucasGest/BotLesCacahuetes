const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const events = require('./events');
const { getDb } = require('./firebase');
const { logError } = require('./logger');
const { currentChannelId, leaveChannel } = require('./eventSounds');

const MAX_CHANNEL_NAME_LENGTH = 100;

// Sans attendre : Discord limite à 2 renommages par salon toutes les 10 minutes,
// et discord.js patiente alors plusieurs minutes. Le panneau ne doit pas bloquer.
function renameChannel(channel, name) {
  if (channel.name !== name) {
    channel.setName(name).catch((error) => logError(`Renommage du salon ${channel.id}`, error));
  }
}

function renameChannelForEvent(channel, event) {
  renameChannel(channel, `🎉 ${event.name}`.slice(0, MAX_CHANNEL_NAME_LENGTH));
}

function buildInvitation(event) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🎉 Rejoins ${event.name} !`)
    .setDescription(`Tu es dans le vocal de l'événement. Tu veux participer ?\n\n📅 ${event.date}\n🎯 ${event.format}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`event:invite:${event.id}`).setLabel('Je participe').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`event:decline:${event.id}`).setLabel('Non merci').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// Marquer avant d'envoyer : même si le DM échoue (DM fermés), on ne réessaie
// jamais pour cette personne sur cet événement. Pas de spam possible.
async function inviteMember(member, eventId) {
  const event = await events.markInvited(eventId, member.id);

  if (!event) {
    return 'skipped';
  }

  try {
    await member.send(buildInvitation(event));
    return 'sent';
  } catch {
    return 'closed';
  }
}

async function inviteChannelMembers(channel, eventId, excludedId) {
  const counts = { sent: 0, closed: 0, skipped: 0 };

  // Un par un : envoyer des DM en rafale peut faire limiter le bot par Discord.
  for (const member of channel.members.values()) {
    if (!member.user.bot && member.id !== excludedId) {
      counts[await inviteMember(member, eventId)] += 1;
    }
  }

  return counts;
}

async function inviteOnVoiceJoin(member, channelId) {
  if (!getDb()) {
    return;
  }

  const current = await events.listEvents(['open', 'running']);

  for (const event of current.filter((e) => e.voiceChannelId === channelId)) {
    await inviteMember(member, event.id);
  }
}

// Rend son nom au salon et le quitte, sauf si un autre événement actif s'en sert.
async function leaveEventVoice(guild, event) {
  if (!event.voiceChannelId) {
    return;
  }

  const current = await events.listEvents(['open', 'running']);

  if (current.some((e) => e.id !== event.id && e.voiceChannelId === event.voiceChannelId)) {
    return;
  }

  const channel = await guild.channels.fetch(event.voiceChannelId).catch(() => null);

  if (channel && event.voiceChannelName) {
    renameChannel(channel, event.voiceChannelName);
  }

  if (currentChannelId(guild) === event.voiceChannelId) {
    leaveChannel(guild);
  }
}

module.exports = { renameChannelForEvent, inviteChannelMembers, inviteOnVoiceJoin, leaveEventVoice };
