const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');
const { removeCoins, addCoins, getBalance } = require('../../utils/economy');
const { scheduleRoleExpiry } = require('../../utils/customRoles');
const { setCurse } = require('../../utils/agentCurses');
const { getAgents } = require('../../utils/valorantAgents');

const PRICE_COULEUR = 200;
const PRICE_ROLE_PERSO = 500;
const PRICE_CURSE = 300;
const ROLE_PERSO_DUREE_MS = 7 * 24 * 60 * 60 * 1000;

// Préfixe utilisé pour retrouver/nettoyer les rôles de couleur déjà attribués
// par la boutique, afin qu'un membre ne puisse pas en cumuler plusieurs.
const COLOR_ROLE_PREFIX = 'Couleur • ';

const COLOR_OPTIONS = [
  { id: 'rouge', label: 'Rouge', color: 0xff4655 },
  { id: 'bleu', label: 'Bleu', color: 0x4f8cff },
  { id: 'vert', label: 'Vert', color: 0x57f287 },
  { id: 'violet', label: 'Violet', color: 0x9b59b6 },
  { id: 'or', label: 'Or', color: 0xffd700 },
  { id: 'rose', label: 'Rose', color: 0xff4fa3 }
];

function buildItemsMenu() {
  return new StringSelectMenuBuilder()
    .setCustomId('boutique:item')
    .setPlaceholder('Choisis un article')
    .addOptions([
      { label: `Couleur de pseudo — ${PRICE_COULEUR} 🥜`, value: 'couleur', emoji: '🎨' },
      { label: `Rôle perso 7 jours — ${PRICE_ROLE_PERSO} 🥜`, value: 'role', emoji: '👑' },
      { label: `Imposer un agent à un pote — ${PRICE_CURSE} 🥜`, value: 'curse', emoji: '😈' }
    ]);
}

async function getOrCreateColorRole(guild, option) {
  const name = `${COLOR_ROLE_PREFIX}${option.label}`;
  let role = guild.roles.cache.find((r) => r.name === name);
  if (!role) {
    role = await guild.roles.create({ name, color: option.color, reason: 'Article boutique : couleur de pseudo' });
  }
  return role;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boutique')
    .setDescription('Dépense tes cacahuètes contre des avantages.'),

  async execute(interaction) {
    const balance = await getBalance(interaction.user.id);
    const embed = new EmbedBuilder()
      .setColor(0xc8864b)
      .setTitle('🥜 Boutique')
      .setDescription(
        `Ton solde : **${balance} 🥜**\n\n` +
          `🎨 **Couleur de pseudo** — ${PRICE_COULEUR} 🥜\n` +
          `👑 **Rôle perso 7 jours** — ${PRICE_ROLE_PERSO} 🥜\n` +
          `😈 **Imposer un agent à un pote (prochain /customs)** — ${PRICE_CURSE} 🥜`
      );

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(buildItemsMenu())],
      flags: MessageFlags.Ephemeral
    });
  },

  async handleSelectMenu(interaction, action) {
    if (action === 'item') {
      const choice = interaction.values[0];

      if (choice === 'couleur') {
        const select = new StringSelectMenuBuilder()
          .setCustomId('boutique:couleur')
          .setPlaceholder('Choisis une couleur')
          .addOptions(COLOR_OPTIONS.map((o) => ({ label: o.label, value: o.id })));

        await interaction.update({
          content: `Choisis ta couleur (${PRICE_COULEUR} 🥜) :`,
          embeds: [],
          components: [new ActionRowBuilder().addComponents(select)]
        });
        return;
      }

      if (choice === 'role') {
        const modal = new ModalBuilder().setCustomId('boutique:role-perso').setTitle('Rôle personnalisé (7 jours)');

        const nomInput = new TextInputBuilder()
          .setCustomId('nom')
          .setLabel('Nom du rôle')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(60)
          .setRequired(true);

        const couleurInput = new TextInputBuilder()
          .setCustomId('couleur')
          .setLabel('Couleur en hexa (optionnel, ex: ff4655)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(6)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nomInput),
          new ActionRowBuilder().addComponents(couleurInput)
        );

        await interaction.showModal(modal);
        return;
      }

      if (choice === 'curse') {
        const select = new UserSelectMenuBuilder().setCustomId('boutique:curse-cible').setPlaceholder('Choisis la victime');

        await interaction.update({
          content: `Choisis à qui imposer un agent (${PRICE_CURSE} 🥜) :`,
          embeds: [],
          components: [new ActionRowBuilder().addComponents(select)]
        });
        return;
      }
    }

    if (action === 'couleur') {
      const option = COLOR_OPTIONS.find((o) => o.id === interaction.values[0]);
      if (!option) return;

      const success = await removeCoins(interaction.user.id, PRICE_COULEUR);
      if (!success) {
        await interaction.update({ content: '❌ Solde insuffisant.', components: [] });
        return;
      }

      try {
        const role = await getOrCreateColorRole(interaction.guild, option);
        const member = interaction.member;

        const previousColorRoles = member.roles.cache.filter((r) => r.name.startsWith(COLOR_ROLE_PREFIX));
        if (previousColorRoles.size > 0) {
          await member.roles.remove(previousColorRoles);
        }

        await member.roles.add(role);
        await interaction.update({ content: `✅ Tu as maintenant la couleur **${option.label}** !`, components: [] });
      } catch (error) {
        await addCoins(interaction.user.id, PRICE_COULEUR);
        await interaction.update({ content: "❌ Une erreur est survenue, tu as été remboursé.", components: [] });
        throw error;
      }
    }
  },

  async handleUserSelect(interaction, action) {
    if (action !== 'curse-cible') return;

    const target = interaction.values[0];

    if (target === interaction.user.id) {
      await interaction.update({ content: 'Tu ne peux pas te viser toi-même 😏', components: [] });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`boutique:curse-agent:${target}`)
      .setTitle('Quel agent lui imposer ?');

    const agentInput = new TextInputBuilder()
      .setCustomId('agent')
      .setLabel('Nom de l\'agent (ex: Sova)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(20)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(agentInput));

    await interaction.showModal(modal);
  },

  async handleModal(interaction, action) {
    if (action === 'role-perso') {
      const nom = interaction.fields.getTextInputValue('nom').trim();
      const couleurBrute = interaction.fields.getTextInputValue('couleur').trim().replace(/^#/, '');
      const couleur = /^[0-9a-fA-F]{6}$/.test(couleurBrute) ? parseInt(couleurBrute, 16) : 0xc8864b;

      const success = await removeCoins(interaction.user.id, PRICE_ROLE_PERSO);
      if (!success) {
        await interaction.reply({ content: '❌ Solde insuffisant.', flags: MessageFlags.Ephemeral });
        return;
      }

      try {
        const role = await interaction.guild.roles.create({
          name: nom,
          color: couleur,
          reason: `Article boutique : rôle perso 7 jours pour ${interaction.user.tag}`
        });

        await interaction.member.roles.add(role);
        await scheduleRoleExpiry(interaction.user.id, role.id, ROLE_PERSO_DUREE_MS);

        await interaction.reply({
          content: `✅ Le rôle **${nom}** t'a été attribué pour 7 jours !`,
          flags: MessageFlags.Ephemeral
        });
      } catch (error) {
        await addCoins(interaction.user.id, PRICE_ROLE_PERSO);
        await interaction.reply({ content: '❌ Une erreur est survenue, tu as été remboursé.', flags: MessageFlags.Ephemeral });
        throw error;
      }
      return;
    }

    if (action === 'curse-agent') {
      const targetId = interaction.customId.split(':')[2];
      const agentInput = interaction.fields.getTextInputValue('agent').trim();

      const match = getAgents().find((a) => a.name.toLowerCase() === agentInput.toLowerCase());
      if (!match) {
        await interaction.reply({
          content: `❌ "${agentInput}" n'est pas un agent connu. Vérifie l'orthographe.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const success = await removeCoins(interaction.user.id, PRICE_CURSE);
      if (!success) {
        await interaction.reply({ content: '❌ Solde insuffisant.', flags: MessageFlags.Ephemeral });
        return;
      }

      await setCurse(targetId, match.name, interaction.user.username);
      await interaction.reply({
        content: `😈 <@${targetId}> sera forcé de jouer **${match.name}** au prochain /customs !`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
