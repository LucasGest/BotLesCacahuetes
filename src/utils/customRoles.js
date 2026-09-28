const { getDb } = require('./firebase');
const { logError } = require('./logger');
const config = require('../config');

const COLLECTION = 'temporaryRoles';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // toutes les heures

async function scheduleRoleExpiry(userId, roleId, durationMs) {
  const db = getDb();
  if (!db) {
    return;
  }

  await db.collection(COLLECTION).doc(roleId).set({
    userId,
    roleId,
    expiresAt: Date.now() + durationMs
  });
}

async function checkExpiredRoles(client) {
  const db = getDb();
  if (!db) {
    return;
  }

  const guild = await client.guilds.fetch(config.guildId).catch(() => null);
  if (!guild) {
    return;
  }

  const snapshot = await db.collection(COLLECTION).where('expiresAt', '<=', Date.now()).get();

  for (const doc of snapshot.docs) {
    const { userId, roleId } = doc.data();

    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      await member?.roles.remove(roleId).catch(() => {});

      const role = await guild.roles.fetch(roleId).catch(() => null);
      await role?.delete('Rôle personnalisé temporaire expiré').catch(() => {});
    } catch (error) {
      await logError(`Expiration du rôle temporaire ${roleId}`, error);
    }

    await doc.ref.delete();
  }
}

function startCustomRoleScheduler(client) {
  checkExpiredRoles(client).catch((error) => logError('Rôles temporaires (démarrage)', error));
  setInterval(() => {
    checkExpiredRoles(client).catch((error) => logError('Rôles temporaires', error));
  }, CHECK_INTERVAL_MS);
}

module.exports = { scheduleRoleExpiry, startCustomRoleScheduler };
