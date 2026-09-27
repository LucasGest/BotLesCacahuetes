const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAgents } = require('../../utils/valorantAgents');
const { getOwnedAgents } = require('../../utils/ownedAgents');

const EMOJI_ROLE = {
  Duelliste: '⚔️',
  Initiateur: '🔍',
  Contrôleur: '🌫️',
  Sentinelle: '🛡️',
};

const PHRASES = [
  'Pas le choix, tu le joues. 😈',
  'Le destin a parlé. 🎲',
  'Bonne chance à tes mates… 🥜',
  'Aucune excuse si tu perds. 😏',
  'Cacabot a décidé, point final. 🤖',
];

const COIN_FLIP_CHANCE = 0.1; // 1 chance sur 10

function tirer(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
}

// Petit easter egg : 1 fois sur 10, un pile ou face apparaît sous la carte.
// Purement cosmétique, ne change rien au tirage de l'agent.
function ajouterPileOuFace(embed) {
  if (Math.random() >= COIN_FLIP_CHANCE) {
    return embed;
  }

  const resultat = Math.random() < 0.5 ? 'Pile' : 'Face';
  return embed.addFields({ name: '🪙 Pile ou face', value: `**${resultat}** !` });
}

function creerEmbed(agent, user, infoPool) {
  const emoji = EMOJI_ROLE[agent.role] ?? '🎯';
  const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)];

  const embed = new EmbedBuilder()
    .setColor(agent.couleur)
    .setAuthor({ name: `${emoji} ${agent.role}`, iconURL: agent.roleIcon ?? undefined })
    .setTitle(`🎲 ${agent.name}`)
    .setDescription(`${user} va jouer **${agent.name}** !\n*${phrase}*`)
    .setFooter({ text: `Cacabot • ${infoPool}` })
    .setTimestamp();

  if (agent.capacites?.length) {
    embed.addFields({ name: '✨ Capacités', value: agent.capacites.join(' · ') });
  }
  if (agent.icon) embed.setThumbnail(agent.icon);
  if (agent.portrait) embed.setImage(agent.portrait);

  return ajouterPileOuFace(embed);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('agent-random')
    .setDescription('Tire un agent Valorant au hasard parmi ceux que tu as débloqués.')
    .addStringOption((opt) =>
      opt
        .setName('role')
        .setDescription('Limiter le tirage à un rôle')
        .addChoices(
          { name: '⚔️ Duelliste', value: 'Duelliste' },
          { name: '🔍 Initiateur', value: 'Initiateur' },
          { name: '🌫️ Contrôleur', value: 'Contrôleur' },
          { name: '🛡️ Sentinelle', value: 'Sentinelle' },
        ),
    )
    .addUserOption((opt) =>
      opt.setName('joueur').setDescription('Tirer pour un autre joueur (selon SES agents)'),
    ),

  async execute(interaction) {
    await interaction.deferReply();

    const roleChoisi = interaction.options.getString('role');
    const joueur = interaction.options.getUser('joueur') ?? interaction.user;
    const tous = getAgents();

    // Agents possédés par le joueur (null = pas configuré ou Firestore indisponible)
    let possedes = null;
    try {
      possedes = await getOwnedAgents(joueur.id);
    } catch (error) {
      console.error('[agent-random] Lecture Firestore impossible :', error.message);
    }

    let liste = possedes ? tous.filter((a) => a.gratuit || possedes.includes(a.name)) : tous;
    const infoPool = possedes
      ? `Tirage parmi les ${liste.length} agents de ${joueur.username} 🥜`
      : `${joueur.username} n'a pas configuré ses agents : tirage parmi tous 🥜`;

    if (roleChoisi) liste = liste.filter((a) => a.role === roleChoisi);

    if (!liste.length) {
      return interaction.editReply(
        `😕 ${joueur} n'a aucun agent **${roleChoisi}** débloqué. Mets à jour avec \`/mes-agents configurer\`.`,
      );
    }

    const agent = tirer(liste);
    await interaction.editReply({
      content: possedes ? null : '💡 Fais `/mes-agents configurer` pour ne tirer que les agents que tu as !',
      embeds: [creerEmbed(agent, joueur, infoPool)],
    });
  },
};
