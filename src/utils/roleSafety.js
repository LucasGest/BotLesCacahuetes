const config = require('../config');

// Verrou commun à tous les rôles que le bot donne tout seul (jeux, boutique,
// rangs, clip, Cacahuète Suprême…) : il ne doit jamais transmettre un droit.
// Si quelqu'un ajoute par erreur un droit à l'un de ces rôles (ou si un rôle
// porte le même nom qu'un rôle staff), l'attribution est refusée au lieu de
// faire de quelqu'un un co-fondateur par accident.

function extraPermissions(role, guild) {
  const everyone = guild.roles.everyone?.permissions?.bitfield;
  const own = role.permissions?.bitfield;
  if (typeof everyone !== 'bigint' || typeof own !== 'bigint') {
    return null; // droits inconnus : on considère le rôle comme dangereux
  }
  return own & ~everyone;
}

function unsafeReason(role, guild) {
  if (!role) {
    return 'rôle introuvable';
  }
  if (role.managed) {
    return 'rôle réservé à un bot ou à une intégration';
  }
  if (config.staffRoleIds.includes(role.id)) {
    return 'rôle staff';
  }
  const extra = extraPermissions(role, guild);
  if (extra === null) {
    return 'droits du rôle illisibles';
  }
  if (extra !== 0n) {
    return 'le rôle donne plus de droits que @everyone';
  }
  return null;
}

async function safeAddRole(member, role, reason) {
  const problem = unsafeReason(role, member.guild);
  if (problem) {
    throw new Error(`Attribution refusée de « ${role?.name ?? '?'} » à ${member.user?.tag ?? member.id} : ${problem}`);
  }
  return member.roles.add(role, reason);
}

module.exports = { safeAddRole, unsafeReason };
