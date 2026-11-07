// Jeux du serveur : boutons de #rôles, rôles 🎮 et détection automatique.
// « match » reconnaît le nom du jeu affiché par Discord dans l'activité d'un membre.
const GAMES = [
  { key: 'among-us', label: 'Among Us', emoji: '🔪', roleName: '🎮・Among Us', match: /^among us$/i },
  { key: 'valorant', label: 'Valorant', emoji: '🎯', roleName: '🎮・Valorant', match: /^valorant$/i },
  { key: 'rocket-league', label: 'Rocket League', emoji: '🚗', roleName: '🎮・Rocket League', match: /^rocket league$/i },
  { key: 'minecraft', label: 'Minecraft', emoji: '⛏️', roleName: '🎮・Minecraft', match: /minecraft/i }
];

function findGameByActivityName(name) {
  return GAMES.find((game) => game.match.test(name.trim())) ?? null;
}

function inGameRoleName(game) {
  return `🕹️・En jeu : ${game.label}`;
}

module.exports = { GAMES, findGameByActivityName, inGameRoleName };
