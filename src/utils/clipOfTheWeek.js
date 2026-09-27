const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { getDb } = require('./firebase');
const { logError } = require('./logger');

const CLIPS_CHANNEL_ID = '1553346987049353276';
const WINNER_ROLE_ID = '1553371311747895346';
const WINNER_ROLE_LABEL = 'Clip de la semaine'; // juste pour les messages/logs
const ROLE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TICK_INTERVAL_MS = 60 * 60 * 1000; // toutes les heures
const STATE_COLLECTION = 'clipOfTheWeek';
const STATE_DOC = 'state';

// Clé "année-semaine" volontairement approximative (pas ISO 8601 strict) :
// suffisant pour ne pas relancer le concours deux fois la même semaine.
function getWeekKey(date) {
  const firstJan = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date - firstJan) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + firstJan.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${week}`;
}

async function getState(db) {
  const doc = await db.collection(STATE_COLLECTION).doc(STATE_DOC).get();
  return doc.exists ? doc.data() : {};
}

async function setState(db, state) {
  await db.collection(STATE_COLLECTION).doc(STATE_DOC).set(state, { merge: true });
}

function canManageRole(guild, role) {
  const botMember = guild.members.me;
  return botMember.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < botMember.roles.highest.position;
}

async function runWeeklyContest(guild) {
  const db = getDb();
  if (!db) {
    return;
  }

  const now = new Date();
  if (now.getDay() !== 0) {
    // Dimanche uniquement.
    return;
  }

  const weekKey = getWeekKey(now);
  const state = await getState(db);

  if (state.lastContestWeek === weekKey) {
    return;
  }

  const channel =
    guild.channels.cache.get(CLIPS_CHANNEL_ID) ?? (await guild.channels.fetch(CLIPS_CHANNEL_ID).catch(() => null));

  if (!channel?.isTextBased()) {
    await logError('Clip de la semaine', new Error(`Salon ${CLIPS_CHANNEL_ID} introuvable`));
    return;
  }

  const weekAgo = Date.now() - WEEK_MS;
  const messages = await channel.messages.fetch({ limit: 100 });
  const recent = messages.filter((message) => message.createdTimestamp >= weekAgo && !message.author.bot);

  let winnerMessage = null;
  let bestCount = 0;

  for (const message of recent.values()) {
    const count = message.reactions.cache.get('🔥')?.count ?? 0;
    if (count > bestCount) {
      bestCount = count;
      winnerMessage = message;
    }
  }

  // On marque la semaine comme traitée même sans gagnant, pour ne pas
  // re-scanner à chaque heure jusqu'au dimanche suivant.
  await setState(db, { lastContestWeek: weekKey });

  if (!winnerMessage) {
    return;
  }

  const winner = await guild.members.fetch(winnerMessage.author.id).catch(() => null);
  if (!winner) {
    return;
  }

  const role = guild.roles.cache.get(WINNER_ROLE_ID);

  if (!role) {
    await logError('Clip de la semaine', new Error(`Rôle ${WINNER_ROLE_ID} introuvable sur ce serveur`));
    return;
  }

  if (!canManageRole(guild, role)) {
    await logError(
      'Clip de la semaine',
      new Error(`Permission ManageRoles manquante, ou "${WINNER_ROLE_LABEL}" est au-dessus du rôle du bot`)
    );
    return;
  }

  // Un seul titre à la fois : on le retire à l'ancien détenteur.
  const previousHolders = role.members.filter((member) => member.id !== winner.id);
  await Promise.all(previousHolders.map((member) => member.roles.remove(role).catch(() => {})));
  await winner.roles.add(role);

  await setState(db, {
    lastContestWeek: weekKey,
    currentHolderId: winner.id,
    roleExpiresAt: Date.now() + ROLE_DURATION_MS
  });

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle('🎬 Clip de la semaine !')
    .setDescription(`${winner} remporte le clip de la semaine avec **${bestCount} 🔥** !\n\n[Voir le clip](${winnerMessage.url})`)
    .setThumbnail(winner.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ content: `${winner}`, embeds: [embed] });
}

async function checkRoleExpiry(guild) {
  const db = getDb();
  if (!db) {
    return;
  }

  const state = await getState(db);

  if (!state.currentHolderId || !state.roleExpiresAt || Date.now() < state.roleExpiresAt) {
    return;
  }

  const role = guild.roles.cache.get(WINNER_ROLE_ID);
  if (role) {
    const holder = await guild.members.fetch(state.currentHolderId).catch(() => null);
    if (holder) {
      await holder.roles.remove(role).catch(() => {});
    }
  }

  await setState(db, { currentHolderId: null, roleExpiresAt: null });
}

async function tick(client) {
  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) {
    return;
  }

  await runWeeklyContest(guild).catch((error) => logError('Clip de la semaine (concours)', error));
  await checkRoleExpiry(guild).catch((error) => logError('Clip de la semaine (expiration)', error));
}

function startClipOfTheWeekScheduler(client) {
  tick(client);
  setInterval(() => tick(client), TICK_INTERVAL_MS);
}

module.exports = { startClipOfTheWeekScheduler };
