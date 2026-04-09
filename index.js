require("dotenv").config();

const { Client, GatewayIntentBits, Events } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
} = require("@discordjs/voice");

const gTTS = require("gtts");
const fs = require("fs");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

let connection = null;
let player = createAudioPlayer();
let textChannelId = null;
let voiceChannelId = null;

// 🔊 Queue system
let queue = [];
let isPlaying = false;
let lastUser = null;
let userVoices = {};

// 🎧 Replace mentions with names
function replaceMentions(message) {
  let content = message.content;

  // User mentions
  message.mentions.users.forEach(user => {
    const member = message.guild.members.cache.get(user.id);
    const name = member ? member.displayName : user.username;
    content = content.replace(new RegExp(`<@!?${user.id}>`, "g"), name);
  });

  // Role mentions
  message.mentions.roles.forEach(role => {
    content = content.replace(new RegExp(`<@&${role.id}>`, "g"), role.name);
  });

  // Channel mentions
  message.mentions.channels.forEach(channel => {
    content = content.replace(new RegExp(`<#${channel.id}>`, "g"), channel.name);
  });

  // Remove links
  content = content.replace(/https?:\/\/\S+/g, "link");

  return content;
}

// ▶️ Play queue
function playNext() {
  if (queue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const { text, voice } = queue.shift();

  const file = "tts.mp3";
  const tts = new gTTS(text, voice || "en");

  tts.save(file, () => {
    const resource = createAudioResource(file);

    connection.subscribe(player);
    player.play(resource);

    player.once("idle", () => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
      playNext();
    });
  });
}

// ✅ Bot ready
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🎮 Commands
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // JOIN
  if (interaction.commandName === "join") {
    const vc = interaction.member.voice.channel;
    if (!vc) return interaction.reply("Join a VC first");

    connection = joinVoiceChannel({
      channelId: vc.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
    });

    voiceChannelId = vc.id;
    textChannelId = interaction.channel.id;

    interaction.reply("Joined VC and ready for TTS");
  }

  // LEAVE
  if (interaction.commandName === "leave") {
    if (connection) connection.destroy();
    connection = null;
    queue = [];
    isPlaying = false;
    interaction.reply("Left VC");
  }

  // VOICE
  if (interaction.commandName === "voice") {
    const voice = interaction.options.getString("type");

    userVoices[interaction.user.id] = voice;

    interaction.reply(`Voice set to ${voice}`);
  }
});

// 💬 Message handler
client.on(Events.MessageCreate, async (message) => {
  if (!connection) return;
  if (message.author.bot) return;
  if (message.channel.id !== textChannelId) return;

  if (!message.member.voice.channel || message.member.voice.channel.id !== voiceChannelId) return;

  const name = message.member.displayName;
  let text = "";

  // 🖼️ Image
  if (message.attachments.size > 0) {
    text = `${name} shared an image`;
    lastUser = message.author.id;
  }

  // 🎯 Sticker
  else if (message.stickers.size > 0) {
    text = `${name} sent a sticker`;
    lastUser = message.author.id;
  }

  // 💬 Text
  else if (message.content) {
    const cleanContent = replaceMentions(message);

    if (lastUser === message.author.id) {
      text = cleanContent;
    } else {
      text = `${name} says ${cleanContent}`;
      lastUser = message.author.id;
    }
  }

  if (!text) return;

  queue.push({
    text,
    voice: userVoices[message.author.id] || "en"
  });

  if (!isPlaying) playNext();
});

client.login(process.env.TOKEN);