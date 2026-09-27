const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags
} = require('discord.js');
const { getAgents } = require('../../utils/valorantAgents');
const { getOwnedAgents, setOwnedAgents } = require('../../utils/ownedAgents');

const ROLES = ['Duelliste', 'Initiateur', 'Contrôleur', 'Sentinelle'];
const EMOJI_ROLE = {
  Duelliste: '⚔️',
  Initiateur: '🔍',
  Contrôleur: '🌫️',
  Sentinelle: '🛡️'
};

function buildRoleRow(role, agents, owned) {
  const roleAgents = agents.filter((a) => a.role === role);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`mes-agents:configurer:${role}`)
    .setPlaceholder(`${EMOJI_ROLE[role] ?? ''} ${role} (${roleAgents.length} agents)`)
    .setMinValues(0)
    .setMaxValues(roleAgents.length)
    .addOptions(
      roleAgents.map((agent) => ({
        label: agent.name,
        value: agent.name,
        default: owned.includes(agent.name)
      }))
    );

  return new ActionRowBuilder().addComponents(select);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mes-agents')
    .setDescription('Gère la liste des agents Valorant que tu as débloqués.')
    .addSubcommand((sub) =>
      sub.setName('configurer').setDescription('Sélectionne tes agents débloqués, par rôle.')
    )
    .addSubcommand((sub) => sub.setName('voir').setDescription('Affiche tes agents débloqués actuels.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const agents = getAgents();

    if (sub === 'voir') {
      const owned = await getOwnedAgents(interaction.user.id);
      const free = agents.filter((a) => a.gratuit).map((a) => a.name);

      if (owned === null) {
        await interaction.reply({
          content: `Tu n'as encore rien configuré. Agents gratuits déjà disponibles : ${free.join(', ')}.\nUtilise \`/mes-agents configurer\` pour ajouter les tiens.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('🎯 Tes agents débloqués')
        .addFields(
          { name: 'Gratuits (toujours disponibles)', value: free.join(', ') || 'Aucun' },
          { name: 'Débloqués par toi', value: owned.length > 0 ? owned.join(', ') : 'Aucun' }
        );

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'configurer') {
      const owned = (await getOwnedAgents(interaction.user.id)) ?? [];
      const rows = ROLES.map((role) => buildRoleRow(role, agents, owned));

      await interaction.reply({
        content:
          "Sélectionne tes agents débloqués, rôle par rôle (les menus se sauvegardent dès que tu changes une sélection).\nPas besoin de cocher les agents gratuits, ils sont toujours disponibles.",
        components: rows,
        flags: MessageFlags.Ephemeral
      });
    }
  },

  async handleSelectMenu(interaction, action) {
    if (action !== 'configurer') {
      return;
    }

    const role = interaction.customId.split(':')[2];
    const selected = interaction.values;
    const agents = getAgents();

    // On ne remplace que les agents de CE rôle : les sélections déjà faites
    // sur les autres menus (autres rôles) de ce même message ne sont pas
    // touchées, chaque select menu envoie sa propre interaction séparée.
    const current = (await getOwnedAgents(interaction.user.id)) ?? [];
    const otherRoles = current.filter((name) => {
      const agent = agents.find((a) => a.name === name);
      return !agent || agent.role !== role;
    });

    const updated = [...new Set([...otherRoles, ...selected])];
    await setOwnedAgents(interaction.user.id, updated);

    await interaction.reply({
      content: `✅ ${role} mis à jour : ${selected.length > 0 ? selected.join(', ') : 'aucun agent sélectionné'}.`,
      flags: MessageFlags.Ephemeral
    });
  }
};
