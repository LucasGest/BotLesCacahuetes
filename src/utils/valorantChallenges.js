// Défis de /defi-valorant. « team: true » = défi de groupe, jamais tiré quand on joue seul.
const LEVELS = {
  easy: { label: 'Facile', emoji: '🟢', reward: 10 },
  medium: { label: 'Moyen', emoji: '🟡', reward: 25 },
  hard: { label: 'Difficile', emoji: '🔴', reward: 50 }
};

const CHALLENGES = [
  // Faciles
  { level: 'easy', text: 'Fais un kill avec le Classic sans acheter d\'arme' },
  { level: 'easy', text: 'Gagne un round pistolet' },
  { level: 'easy', text: 'Fais un kill en sautant' },
  { level: 'easy', text: 'Plante le spike 3 fois dans une partie' },
  { level: 'easy', text: 'Fais un kill avec une capacité' },
  { level: 'easy', text: 'Termine une partie avec plus d\'assists que de morts' },
  { level: 'easy', text: 'Fais 5 headshots dans une partie' },
  { level: 'easy', text: 'Désamorce le spike une fois' },
  { level: 'easy', text: 'Fais un kill au Shorty' },
  { level: 'easy', text: 'Joue un agent que tu n\'as jamais joué' },
  { level: 'easy', text: 'Fais un kill en eco (moins de 2000 crédits dépensés)' },
  { level: 'easy', text: 'Fais un kill au Sheriff' },
  { level: 'easy', text: 'Gagne un round sans mourir' },
  { level: 'easy', text: 'Toute l\'équipe achète la même arme sur un round', team: true },
  { level: 'easy', text: 'Toute l\'équipe rush le même site au premier round', team: true },
  // Moyens
  { level: 'medium', text: 'Fais 3 kills dans un même round' },
  { level: 'medium', text: 'Fais un kill au couteau' },
  { level: 'medium', text: 'Gagne un round en n\'utilisant que le Sheriff' },
  { level: 'medium', text: 'Termine une partie avec un KDA positif sans acheter de fusil' },
  { level: 'medium', text: 'Fais un kill à travers un mur (wallbang)' },
  { level: 'medium', text: 'Gagne un clutch 1v1' },
  { level: 'medium', text: 'Fais 25 kills dans une partie' },
  { level: 'medium', text: 'Fais un kill à l\'Operator en no-scope' },
  { level: 'medium', text: 'Gagne une partie en jouant un Sentinelle' },
  { level: 'medium', text: 'Fais un kill pendant que tu désamorces' },
  { level: 'medium', text: 'Fais le premier kill du round 3 fois dans une partie' },
  { level: 'medium', text: 'Gagne un round avec uniquement des pistolets dans l\'équipe', team: true },
  { level: 'medium', text: 'Toute l\'équipe joue des Duellistes sur une partie', team: true },
  { level: 'medium', text: 'Gagne une partie où chacun joue un agent tiré par /agent-random', team: true },
  // Difficiles
  { level: 'hard', text: 'Fais un ACE' },
  { level: 'hard', text: 'Gagne un clutch 1v2 ou plus' },
  { level: 'hard', text: 'Fais 4 kills dans un même round' },
  { level: 'hard', text: 'Fais 2 kills au couteau dans une partie' },
  { level: 'hard', text: 'Termine MVP de la partie' },
  { level: 'hard', text: 'Fais 30 kills dans une partie' },
  { level: 'hard', text: 'Gagne un round en n\'utilisant que le Classic' },
  { level: 'hard', text: 'Fais 3 kills au Judge ou au Bucky dans un même round' },
  { level: 'hard', text: 'Gagne une partie sans jamais acheter de Vandal ni de Phantom', team: true },
  { level: 'hard', text: 'Toute l\'équipe gagne un round au couteau', team: true }
];

// 2 faciles, 2 moyens, 1 difficile. Les défis de groupe sont exclus en solo.
const DRAW = [['easy', 2], ['medium', 2], ['hard', 1]];

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function drawChallenges(solo) {
  return DRAW.flatMap(([level, count]) =>
    shuffle(CHALLENGES.filter((c) => c.level === level && !(solo && c.team)))
      .slice(0, count)
      .map((c) => ({ ...c, ...LEVELS[level] }))
  );
}

module.exports = { CHALLENGES, LEVELS, drawChallenges };
