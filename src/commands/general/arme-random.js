const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getWeapons } = require('../../utils/valorantWeapons');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('arme-random')
    .setDescription('Tire une arme principale au hasard (fusils, SMG, shotguns, snipers, LMG).'),

  async execute(interaction) {
    const weapons = getWeapons();
    const weapon = weapons[Math.floor(Math.random() * weapons.length)];

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle(`🔫 ${weapon.name}`)
      .setDescription(`Catégorie : **${weapon.categorieLabel}**`);

    if (weapon.icon) {
      embed.setThumbnail(weapon.icon);
    }

    await interaction.reply({ embeds: [embed] });
  }
};
