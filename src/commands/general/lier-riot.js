const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { fetchRank, toBaseTier } = require('../../utils/riotRank');
const config = require('../../config');

const RANK_ROLE_PREFIX = '🏅 ';

const REGIONS = [
  { name: 'Europe', value: 'eu' },
  { name: 'Amérique du Nord', value: 'na' },
  { name: 'Asie-Pacifique', value: 'ap' },
  { name: 'Corée', value: 'kr' },
  { name: 'Amérique Latine', value: 'latam' },
  { name: 'Brésil', value: 'br' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lier-riot')
    .setDescription('Lie ton compte Riot pour récupérer automatiquement ton rôle de rang.')
    .addStringOption((option) =>
      option.setName('pseudo').setDescription('Ton pseudo Riot (sans le #tag)').setRequired(true)
    )
    .addStringOption((option) => option.setName('tag').setDescription('Ton tag Riot (sans le #)').setRequired(true))
    .addStringOption((option) =>
      option
        .setName('region')
        .setDescription('Ta région (Europe par défaut)')
        .addChoices(...REGIONS.map((r) => ({ name: r.name, value: r.value })))
    ),

  async execute(interaction) {
    if (!config.henrikApiKey) {
      await interaction.reply({
        content: "❌ Cette commande n'est pas encore configurée (clé API manquante).",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const pseudo = interaction.options.getString('pseudo').trim();
    const tag = interaction.options.getString('tag').trim().replace(/^#/, '');
    const region = interaction.options.getString('region') ?? 'eu';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let patched;
    try {
      patched = await fetchRank(pseudo, tag, region);
    } catch (error) {
      if (error.message === 'NOT_FOUND') {
        await interaction.editReply(`❌ Compte introuvable : **${pseudo}#${tag}**.`);
        return;
      }
      if (error.message === 'NO_RANK_DATA') {
        await interaction.editReply(`❌ **${pseudo}#${tag}** n'a pas encore de rang classé.`);
        return;
      }
      throw error;
    }

    const tier = toBaseTier(patched);
    if (!tier) {
      await interaction.editReply(`❌ Rang non reconnu : ${patched}.`);
      return;
    }

    const roleName = `${RANK_ROLE_PREFIX}${tier}`;
    let role = interaction.guild.roles.cache.find((r) => r.name === roleName);
    if (!role) {
      role = await interaction.guild.roles.create({ name: roleName, reason: 'Rôle de rang Valorant automatique' });
    }

    const member = interaction.member;
    const previousRankRoles = member.roles.cache.filter((r) => r.name.startsWith(RANK_ROLE_PREFIX) && r.id !== role.id);
    if (previousRankRoles.size > 0) {
      await member.roles.remove(previousRankRoles);
    }
    await member.roles.add(role);

    await interaction.editReply(`✅ Compte lié ! Rang actuel : **${patched}** → rôle **${tier}** attribué.`);
  }
};
