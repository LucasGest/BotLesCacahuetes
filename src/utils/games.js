// Jeux du serveur : boutons de #rôles, rôles 🎮 et détection automatique.
// « match » reconnaît le nom du jeu affiché par Discord dans l'activité d'un membre.
const GAMES = [
  { key: 'among-us', label: 'Among Us', emoji: '🔪', roleName: '🎮・Among Us', match: /among us/i },
  { key: 'valorant', label: 'Valorant', emoji: '🎯', roleName: '🎮・Valorant', match: /^valorant$/i },
  { key: 'rocket-league', label: 'Rocket League', emoji: '🚗', roleName: '🎮・Rocket League', match: /rocket league/i },
  { key: 'minecraft', label: 'Minecraft', emoji: '⛏️', roleName: '🎮・Minecraft', match: /minecraft/i }
];

const IN_GAME_PREFIX = '🕹️・En jeu : ';

function findGameByActivityName(name) {
  return GAMES.find((game) => game.match.test(name.trim())) ?? null;
}

// N'importe quel jeu détecté : les 4 jeux du serveur gardent leur nom et leur
// emoji, les autres prennent le nom affiché par Discord.
function resolveGame(name) {
  const known = findGameByActivityName(name);
  if (known) {
    return known;
  }

  const label = name.trim().slice(0, 80);
  return { key: `auto:${label.toLowerCase()}`, label, emoji: '🕹️', roleName: `🎮・${label}`, auto: true };
}

function inGameRoleName(game) {
  return `${IN_GAME_PREFIX}${game.label}`;
}

module.exports = { GAMES, IN_GAME_PREFIX, findGameByActivityName, resolveGame, inGameRoleName };
