require("dotenv").config();

const { Client, GatewayIntentBits, Events } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
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

let queue = [];
let isPlaying = false;
let lastUser = null;
let userVoices = {};

// 🔧 safer mention replace
function replaceMentions(message) {
  let content = message.content || "";

  message.mentions.users.forEach(user => {
    const member = message.guild.members.cache.get(user.id);
    const name = member ? member.displayName : user.username;
    content = content.replace(new RegExp(`<@!?${user.id}>`, "g"), name);
  });

  message.mentions.roles.forEach(role => {
    content = content.replace(new RegExp(`<@&${role.id}>`, "g"), role.name);
  });

  message.mentions.channels.forEach(channel => {
    content = content.replace(new RegExp(`<#${channel.id}>`, "g"), channel.name);
  });

  content = content.replace(/https?:\/\/\S+/g, "link");

  return content;
}

// ▶️ play queue (safe)
function playNext() {
  if (!connection || queue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const { text, voice } = queue.shift();

  console.log("Speaking:", text);

  const file = "tts.mp3";
  const tts = new gTTS(text, voice || "en");

  tts.save(file, () => {
    try {
      const resource = createAudioResource(file);

      connection.subscribe(player);
      player.play(resource);

      player.once(AudioPlayerStatus.Idle, () => {
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        } catch {}

        playNext();
      });

    } catch (err) {
      console.error("Play error:", err);
      playNext();
    }
  });
}

// ✅ ready
client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🎮 commands (FIXED)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply(); // 🔥 fixes timeout

    // JOIN
    if (interaction.commandName === "join") {
      const vc = interaction.member.voice.channel;
      if (!vc) return interaction.editReply("Join a VC first");

      connection = joinVoiceChannel({
        channelId: vc.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      voiceChannelId = vc.id;
      textChannelId = interaction.channel.id;

      interaction.editReply("Joined VC and ready for TTS");
    }

    // LEAVE
    else if (interaction.commandName === "leave") {
      if (connection) connection.destroy();
      connection = null;
      queue = [];
      isPlaying = false;

      interaction.editReply("Left VC");
    }

    // VOICE
    else if (interaction.commandName === "voice") {
      const voice = interaction.options.getString("type");

      userVoices[interaction.user.id] = voice;

      interaction.editReply(`Voice set to ${voice}`);
    }

  } catch (err) {
    console.error("Command error:", err);

    if (interaction.deferred) {
      interaction.editReply("Error occurred");
    } else {
      interaction.reply("Error occurred");
    }
  }
});

// 💬 messages (safer)
client.on(Events.MessageCreate, async (message) => {
  try {
    if (!connection) return;
    if (message.author.bot) return;
    if (message.channel.id !== textChannelId) return;

    if (!message.member?.voice?.channel || message.member.voice.channel.id !== voiceChannelId) return;

    const name = message.member.displayName;
    let text = "";

    if (message.attachments.size > 0) {
      text = `${name} shared an image`;
      lastUser = message.author.id;
    }

    else if (message.stickers.size > 0) {
      text = `${name} sent a sticker`;
      lastUser = message.author.id;
    }

    else if (message.content) {
      const cleanContent = replaceMentions(message);

      if (!cleanContent) return;

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

  } catch (err) {
    console.error("Message error:", err);
  }
});

client.login(process.env.TOKEN);