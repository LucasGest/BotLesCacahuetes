const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
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

// État en mémoire par tirage : pas besoin de survivre à un redémarrage, une
// session de pile ou face ne dure que quelques secondes.
const sessions = new Map();
let nextSessionId = 1;

function tirer(liste) {
  return liste[Math.floor(Math.random() * liste.length)];
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

  return embed;
}

function creerBoutonsPileOuFace(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`agent-random:coin:${sessionId}:pile`).setLabel('Pile').setEmoji('🪙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`agent-random:coin:${sessionId}:face`).setLabel('Face').setEmoji('🪙').setStyle(ButtonStyle.Primary)
  );
}

function creerBoutonRelancer(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`agent-random:reroll:${sessionId}`).setLabel('Relancer').setEmoji('🔄').setStyle(ButtonStyle.Success)
  );
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
    const embed = creerEmbed(agent, joueur, infoPool);
    const content = possedes ? null : '💡 Fais `/mes-agents configurer` pour ne tirer que les agents que tu as !';

    // 1 fois sur 10 : mini pile ou face pour gagner le droit de relancer une fois.
    if (Math.random() < COIN_FLIP_CHANCE) {
      const sessionId = String(nextSessionId++);
      sessions.set(sessionId, { userId: interaction.user.id, liste, joueur, infoPool, used: false });
      setTimeout(() => sessions.delete(sessionId), 5 * 60 * 1000);

      embed.addFields({ name: '🪙 Pile ou face !', value: 'Devine le résultat pour gagner le droit de relancer.' });

      await interaction.editReply({
        content,
        embeds: [embed],
        components: [creerBoutonsPileOuFace(sessionId)]
      });
      return;
    }

    await interaction.editReply({ content, embeds: [embed] });
  },

  async handleButton(interaction, action) {
    const parts = interaction.customId.split(':');
    const sessionId = parts[2];
    const session = sessions.get(sessionId);

    if (!session) {
      await interaction.reply({ content: 'Cette partie a expiré.', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.user.id !== session.userId) {
      await interaction.reply({ content: "Ce n'est pas ton tirage !", flags: MessageFlags.Ephemeral });
      return;
    }

    if (action === 'coin') {
      const choix = parts[3];
      const resultat = Math.random() < 0.5 ? 'pile' : 'face';
      const resultatLabel = resultat === 'pile' ? 'Pile' : 'Face';

      if (choix === resultat) {
        await interaction.update({
          content: `🪙 C'était **${resultatLabel}** ! Bien deviné, tu peux relancer une fois.`,
          components: [creerBoutonRelancer(sessionId)]
        });
      } else {
        sessions.delete(sessionId);
        await interaction.update({
          content: `🪙 C'était **${resultatLabel}**... Raté, pas de relance cette fois.`,
          components: []
        });
      }
      return;
    }

    if (action === 'reroll') {
      if (session.used) {
        await interaction.reply({ content: 'Tu as déjà relancé.', flags: MessageFlags.Ephemeral });
        return;
      }

      session.used = true;
      const nouvelAgent = tirer(session.liste);
      const embed = creerEmbed(nouvelAgent, session.joueur, session.infoPool);

      await interaction.update({ content: '🔄 Nouvel agent tiré !', embeds: [embed], components: [] });
      sessions.delete(sessionId);
    }
  }
};
