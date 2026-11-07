// Jeux du serveur : boutons de #rôles, rôles 🎮 et détection automatique.
// « match » reconnaît le nom du jeu affiché par Discord dans l'activité d'un membre.
const GAMES = [
  { key: 'among-us', label: 'Among Us', emoji: '🔪', roleName: '🎮・Among Us', match: /among us/i },
  { key: 'valorant', label: 'Valorant', emoji: '🎯', roleName: '🎮・Valorant', match: /^valorant$/i },
  { key: 'rocket-league', label: 'Rocket League', emoji: '🚗', roleName: '🎮・Rocket League', match: /rocket league/i },
  // Lunar, Badlion et Feather sont des lanceurs de Minecraft : jouer avec, c'est jouer à Minecraft.
  { key: 'minecraft', label: 'Minecraft', emoji: '⛏️', roleName: '🎮・Minecraft', match: /minecraft|^lunar client$|^badlion client$|^feather client$/i }
];

const IN_GAME_PREFIX = '🕹️・En jeu : ';

// Applications que Discord affiche comme « joue à » mais qui ne sont pas des jeux.
const IGNORED_APPS = [
  /^wallpaper engine$/i,
  /^curseforge$/i,
  /tracker app$/i,
  /^tracker\.gg/i,
  /^medal$/i,
  /^overwolf$/i,
  /^steam$/i,
  /^discord$/i,
  /^spotify$/i,
  /^obs( studio)?$/i,
  /^blitz$/i,
  /^porofessor/i,
  /^mobalytics/i,
  /^riot client$/i,
  /^epic games( launcher)?$/i,
  /^battle\.net$/i,
  /^ea app$/i,
  /^ubisoft connect$/i,
  /^xbox( app)?$/i,
  /geforce|nvidia/i
];

// Uniformise le nom affiché par Discord : « Fortnite with Medal » (enregistreur
// de clips) et « Overwatch® » deviennent « Fortnite » et « Overwatch ».
// Renvoie null pour une application qui n'est pas un jeu.
function normalizeActivityName(name) {
  const clean = (name ?? '')
    .replace(/\s+with medal$/i, '')
    .replace(/[®™©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || IGNORED_APPS.some((pattern) => pattern.test(clean))) {
    return null;
  }
  return clean;
}

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

module.exports = { GAMES, IN_GAME_PREFIX, findGameByActivityName, normalizeActivityName, resolveGame, inGameRoleName };
