require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join VC'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave VC'),

  new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Set your voice")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("Voice type")
        .setRequired(true)
        .addChoices(
          { name: "English", value: "en" },
          { name: "Hindi", value: "hi" }
        )
    )

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Registering commands...');

    await rest.put(
      Routes.applicationCommands("1490235310637060257"),
      { body: commands }
    );

    console.log('Commands registered!');
  } catch (err) {
    console.error(err);
  }
})();