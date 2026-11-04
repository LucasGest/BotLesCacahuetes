const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GatewayOpcodes
} = require('discord.js');
const events = require('./events');
const { getDb } = require('./firebase');

// Pas de lecture audio : le bot est juste présent dans le salon, micro et
// casque coupés. Une simple mise à jour d'état vocal suffit, sans dépendance.
function setBotVoiceChannel(guild, channelId) {
  guild.shard.send({
    op: GatewayOpcodes.VoiceStateUpdate,
    d: { guild_id: guild.id, channel_id: channelId, self_mute: true, self_deaf: true }
  });
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

// Le bot reste si un autre événement actif utilise encore ce salon.
async function leaveEventVoice(guild, event) {
  if (!event.voiceChannelId || guild.members.me.voice?.channelId !== event.voiceChannelId) {
    return;
  }

  const current = await events.listEvents(['open', 'running']);

  if (!current.some((e) => e.voiceChannelId === event.voiceChannelId)) {
    setBotVoiceChannel(guild, null);
  }
}

module.exports = { setBotVoiceChannel, inviteChannelMembers, inviteOnVoiceJoin, leaveEventVoice };
