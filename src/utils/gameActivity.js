const { ActivityType, EmbedBuilder } = require('discord.js');
const { GAMES, findGameByActivityName, inGameRoleName } = require('./games');
const { logError } = require('./logger');

const ACTIVITY_CHANNEL_ID = '1568628826320142414'; // #activité
const BASE_ROLE_ID = '1539944509566357557'; // 🥜・Cacahuète
const BOARD_DELAY_MS = 10_000;
const MAX_MENTIONS_PER_GAME = 30;

// Jeux en cours par membre, reconstruits depuis les présences : rien n'est
// enregistré, la liste repart de ce que Discord envoie au démarrage.
const playing = new Map();
let boardTimer = null;

function gamesOf(presence) {
  return [...new Set(
    (presence?.activities ?? []).filter((a) => a.type === ActivityType.Playing && a.name).map((a) => a.name.trim())
  )];
}

// Les rôles « En jeu » sont affichés à part dans la liste des membres : ils
// doivent donc être placés au-dessus du rôle de base 🥜・Cacahuète.
async function ensureInGameRoles(guild) {
  const base = guild.roles.cache.get(BASE_ROLE_ID);

  for (const game of GAMES) {
    if (!guild.roles.cache.some((role) => role.name === inGameRoleName(game))) {
      const role = await guild.roles.create({
        name: inGameRoleName(game),
        color: 0x57f287,
        hoist: true,
        permissions: [],
        reason: 'Rôle « En jeu » automatique'
      });
      if (base) {
        await role.setPosition(base.position + 1).catch((error) => logError('Position du rôle En jeu', error));
      }
    }
  }
}

async function syncMemberRoles(member, names) {
  if (member.user.bot) {
    return;
  }

  const current = new Set(names.map(findGameByActivityName).filter(Boolean).map((game) => game.key));

  for (const game of GAMES) {
    const gameRole = member.guild.roles.cache.find((role) => role.name === game.roleName);
    const inGameRole = member.guild.roles.cache.find((role) => role.name === inGameRoleName(game));
    const isPlaying = current.has(game.key);

    // Le rôle 🎮 du jeu reste acquis : on ne le retire pas quand la partie s'arrête.
    if (isPlaying && gameRole?.editable && !member.roles.cache.has(gameRole.id)) {
      await member.roles.add(gameRole, 'Jeu détecté').catch((error) => logError(`Rôle ${game.label}`, error));
    }

    if (inGameRole?.editable && isPlaying !== member.roles.cache.has(inGameRole.id)) {
      const action = isPlaying ? member.roles.add(inGameRole, 'Partie en cours') : member.roles.remove(inGameRole, 'Partie terminée');
      await action.catch((error) => logError(`Rôle En jeu ${game.label}`, error));
    }
  }
}

function buildBoard() {
  const byGame = new Map();

  for (const [memberId, names] of playing) {
    for (const name of names) {
      byGame.set(name, [...(byGame.get(name) ?? []), memberId]);
    }
  }

  const sorted = [...byGame.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const embed = new EmbedBuilder().setColor(0x57f287).setTitle('🎮 En train de jouer').setTimestamp();

  if (sorted.length === 0) {
    return embed.setDescription('Personne ne joue en ce moment.');
  }

  for (const [name, members] of sorted.slice(0, 25)) {
    const game = findGameByActivityName(name);
    const listed = members.slice(0, MAX_MENTIONS_PER_GAME).map((id) => `<@${id}>`).join(' ');
    const more = members.length > MAX_MENTIONS_PER_GAME ? ` et ${members.length - MAX_MENTIONS_PER_GAME} autres` : '';
    embed.addFields({ name: `${game?.emoji ?? '🕹️'} ${name.slice(0, 200)} (${members.length})`, value: listed + more });
  }

  return embed.setFooter({ text: `${playing.size} membre(s) en jeu` });
}

// Un seul message, modifié à chaque changement plutôt que de remplir le salon.
async function updateBoard(client) {
  const channel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
  const recent = await channel.messages.fetch({ limit: 10 });
  const message = recent.find((m) => m.author.id === client.user.id);
  const payload = { embeds: [buildBoard()], allowedMentions: { parse: [] } };

  if (message) {
    await message.edit(payload);
  } else {
    await channel.send(payload);
  }
}

function scheduleBoardUpdate(client) {
  if (boardTimer) {
    return;
  }

  boardTimer = setTimeout(() => {
    boardTimer = null;
    updateBoard(client).catch((error) => logError("Salon d'activité", error));
  }, BOARD_DELAY_MS);
}

async function handlePresence(member, presence) {
  if (!member || member.user.bot) {
    return;
  }

  const names = gamesOf(presence);
  const before = playing.get(member.id) ?? [];

  if (names.join('|') === before.join('|')) {
    return;
  }

  if (names.length > 0) {
    playing.set(member.id, names);
  } else {
    playing.delete(member.id);
  }

  await syncMemberRoles(member, names);
  scheduleBoardUpdate(member.client);
}

// Au démarrage : reprend les parties en cours et retire les rôles « En jeu »
// restés après un redémarrage du bot.
async function startGameActivity(client, guildId) {
  const guild = await client.guilds.fetch(guildId);
  await ensureInGameRoles(guild);
  await guild.members.fetch();

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) {
      continue;
    }

    const names = gamesOf(member.presence);
    if (names.length > 0) {
      playing.set(member.id, names);
    }
    await syncMemberRoles(member, names);
  }

  await updateBoard(client);
}

module.exports = { handlePresence, startGameActivity, buildBoard, gamesOf, playing };
