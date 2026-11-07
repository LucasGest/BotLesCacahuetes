const { PermissionFlagsBits } = require('discord.js');
const { safeAddRole } = require('./roleSafety');

const SUPREME_ROLE_ID = '1539941903397818388';

// Donne le titre de Cacahuète Suprême à un membre et le retire à qui l'avait
// avant (un seul titre à la fois). Renvoie { ok: true } ou { ok: false, reason }.
async function crownSupreme(guild, winner) {
  const role = guild.roles.cache.get(SUPREME_ROLE_ID);

  if (!role) {
    return { ok: false, reason: `Le rôle ${SUPREME_ROLE_ID} n'existe pas sur ce serveur.` };
  }

  const botMember = guild.members.me;

  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= botMember.roles.highest.position) {
    return {
      ok: false,
      reason: "Je n'ai pas la permission de gérer les rôles, ou mon rôle est plus bas que celui à attribuer."
    };
  }

  try {
    // Sans ce chargement, role.members ne voit que les membres déjà en cache.
    await guild.members.fetch();
    const previousHolders = role.members.filter((member) => member.id !== winner.id);
    await Promise.all(previousHolders.map((member) => member.roles.remove(role).catch(() => {})));
    await safeAddRole(winner, role, "Gagnant de l'événement");
    return { ok: true };
  } catch (error) {
    console.error('Impossible d\'attribuer le rôle Cacahuète Suprême :', error.message);
    return { ok: false, reason: "Erreur lors de l'attribution du rôle." };
  }
}

module.exports = { crownSupreme };
