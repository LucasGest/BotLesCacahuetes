const { Readable } = require('stream');
const {
  AudioPlayerStatus,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel
} = require('@discordjs/voice');
const { logError } = require('./logger');

const SAMPLE_RATE = 48000;
const CONNECTION_TIMEOUT_MS = 10_000;
const MAX_SOUND_MS = 10_000;
const ARRIVAL_COOLDOWN_MS = 60_000;

const WAVES = {
  sine: (phase) => Math.sin(2 * Math.PI * phase),
  saw: (phase) => 2 * (phase - Math.floor(phase + 0.5)),
  square: (phase) => (phase % 1 < 0.5 ? 1 : -1)
};

// Sons fabriqués ici plutôt que tirés de fichiers : aucun droit d'auteur à gérer.
// Chaque note : { freqs: [de, vers], ms, wave, gap, vibrato, chord }.
const SOUNDS = {
  arrivee: [{ freqs: [180, 760], ms: 350, wave: 'sine', vibrato: 18 }],
  mvp: [
    { freqs: [233, 233], ms: 170, wave: 'saw', chord: 1.26, gap: 70 },
    { freqs: [233, 233], ms: 170, wave: 'saw', chord: 1.26, gap: 70 },
    { freqs: [233, 233], ms: 170, wave: 'saw', chord: 1.26, gap: 70 },
    { freqs: [311, 311], ms: 650, wave: 'saw', chord: 1.26 }
  ],
  fin: [
    { freqs: [523, 523], ms: 130, wave: 'square', gap: 30 },
    { freqs: [659, 659], ms: 130, wave: 'square', gap: 30 },
    { freqs: [784, 784], ms: 130, wave: 'square', gap: 30 },
    { freqs: [1047, 1047], ms: 420, wave: 'square', gap: 350 },
    { freqs: [311, 311], ms: 330, wave: 'saw', gap: 60 },
    { freqs: [294, 294], ms: 330, wave: 'saw', gap: 60 },
    { freqs: [277, 277], ms: 330, wave: 'saw', gap: 60 },
    { freqs: [262, 247], ms: 1100, wave: 'saw', vibrato: 6 }
  ]
};

// PCM 48 kHz stéréo 16 bits, le format brut attendu par l'encodeur de Discord.
function renderSound(name) {
  const samples = [];

  for (const note of SOUNDS[name]) {
    const count = Math.floor((note.ms / 1000) * SAMPLE_RATE);
    const fadeLength = Math.min(480, Math.floor(count / 4));
    const wave = WAVES[note.wave];
    let phase = 0;
    let chordPhase = 0;

    for (let i = 0; i < count; i++) {
      const progress = i / count;
      const vibrato = note.vibrato ? 1 + 0.03 * Math.sin((2 * Math.PI * note.vibrato * i) / SAMPLE_RATE) : 1;
      const freq = (note.freqs[0] + (note.freqs[1] - note.freqs[0]) * progress) * vibrato;
      phase += freq / SAMPLE_RATE;
      chordPhase += (freq * (note.chord ?? 1)) / SAMPLE_RATE;

      const value = note.chord ? (wave(phase) + wave(chordPhase)) / 2 : wave(phase);
      const fade = Math.min(1, i / fadeLength, (count - i) / fadeLength);
      samples.push(value * fade * 0.25);
    }

    for (let i = 0; i < Math.floor(((note.gap ?? 0) / 1000) * SAMPLE_RATE); i++) {
      samples.push(0);
    }
  }

  const buffer = Buffer.alloc(samples.length * 4);
  samples.forEach((sample, i) => {
    const value = Math.round(sample * 32767);
    buffer.writeInt16LE(value, i * 4);
    buffer.writeInt16LE(value, i * 4 + 2);
  });
  return buffer;
}

function createSoundResource(name) {
  return createAudioResource(Readable.from([renderSound(name)], { objectMode: false }), { inputType: StreamType.Raw });
}

const player = createAudioPlayer();
player.on('error', (error) => logError('Lecture audio', error));

function joinChannel(guild, channelId) {
  const connection = joinVoiceChannel({
    channelId,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
    selfMute: false
  });

  if (connection.listenerCount('error') === 0) {
    connection.on('error', (error) => logError('Connexion vocale', error));
  }

  connection.subscribe(player);
}

function leaveChannel(guild) {
  getVoiceConnection(guild.id)?.destroy();
}

function currentChannelId(guild) {
  return getVoiceConnection(guild.id)?.joinConfig.channelId ?? null;
}

// Ne lève jamais d'erreur : un son raté ne doit pas gêner la gestion de l'événement.
async function playSound(guild, name) {
  const connection = getVoiceConnection(guild.id);

  if (!connection) {
    return false;
  }

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, CONNECTION_TIMEOUT_MS);
    player.play(createSoundResource(name));
    await entersState(player, AudioPlayerStatus.Playing, CONNECTION_TIMEOUT_MS);
    await entersState(player, AudioPlayerStatus.Idle, MAX_SOUND_MS);
    return true;
  } catch (error) {
    await logError(`Son ${name}`, error);
    return false;
  }
}

const lastArrivalAt = new Map();

// Par personne et seulement si rien ne joue : entrer et sortir en boucle ne doit pas spammer le salon.
async function playArrivalSound(member, channelId) {
  const now = Date.now();

  if (
    currentChannelId(member.guild) !== channelId ||
    player.state.status !== AudioPlayerStatus.Idle ||
    now - (lastArrivalAt.get(member.id) ?? 0) < ARRIVAL_COOLDOWN_MS
  ) {
    return;
  }

  lastArrivalAt.set(member.id, now);
  await playSound(member.guild, 'arrivee');
}

module.exports = { joinChannel, leaveChannel, currentChannelId, playSound, playArrivalSound, renderSound, createSoundResource };
