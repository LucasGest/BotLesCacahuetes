const { EmbedBuilder } = require('discord.js');
const { getDb } = require('./firebase');
const { addCoins } = require('./economy');
const { logError } = require('./logger');

const COLLECTION = 'voiceStats';
const META_COLLECTION = 'voiceStatsMeta';
const ACTIVITY_CHANNEL_ID = '1568628826320142414'; // #activité
const SESSION_CAP_MINUTES = 180; // plafond anti-AFK par session, comme les cacahuètes
const FLUSH_INTERVAL_MS = 10 * 60 * 1000; // enregistre les sessions en cours toutes les 10 min
const WEEKLY_CHECK_MS = 5 * 60 * 1000;
const REWARDS = [300, 200, 100];
const TOP_SIZE = 10;
// Le classement démarre le lundi 9 novembre 2026 à 0 h (Paris) : rien n'est compté avant.
const START_AT = Date.parse('2026-11-08T23:00:00Z');

// Sessions comptées en ce moment : membre → { start, counted, username }.
// « counted » = minutes déjà enregistrées pendant cette session (pour le plafond).
const segments = new Map();

// ---- Dates à l'heure de Paris -------------------------------------------------

function parisParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)
  };
}

// Une semaine se termine le dimanche à 21 h (Paris) : la clé est la date de ce dimanche.
function weekKey(date = new Date(Date.now())) {
  const p = parisParts(date);
  let daysToSunday = (7 - p.weekday) % 7;
  if (daysToSunday === 0 && p.hour >= 21) {
    daysToSunday = 7;
  }
  return new Date(Date.UTC(p.year, p.month - 1, p.day + daysToSunday)).toISOString().slice(0, 10);
}

function previousWeekKey(date = new Date(Date.now())) {
  const sunday = new Date(`${weekKey(date)}T00:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() - 7);
  return sunday.toISOString().slice(0, 10);
}

function monthKey(date = new Date(Date.now())) {
  const p = parisParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

function formatMinutes(minutes) {
  const total = Math.floor(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
}

// ---- Qui compte -------------------------------------------------------------

function isDeaf(voiceState) {
  return Boolean(voiceState?.selfDeaf || voiceState?.serverDeaf);
}

// Compte seulement le « vrai » vocal : pas seul (au moins une autre personne qui
// entend), pas en sourdine casque, pas dans le salon AFK, jamais les bots.
function isEligible(member) {
  const voice = member?.voice;
  if (!voice?.channelId || member.user.bot || isDeaf(voice)) {
    return false;
  }
  if (voice.channelId === member.guild.afkChannelId) {
    return false;
  }
  const others = voice.channel?.members?.filter((m) => m.id !== member.id && !m.user.bot && !isDeaf(m.voice));
  return (others?.size ?? 0) > 0;
}

// ---- Enregistrement -----------------------------------------------------------

async function addMinutes(userId, username, minutes, date = new Date(Date.now())) {
  const db = getDb();
  if (!db || minutes <= 0) {
    return;
  }

  const ref = db.collection(COLLECTION).doc(userId);
  const week = weekKey(date);
  const month = monthKey(date);

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.exists ? doc.data() : {};
    tx.set(ref, {
      username,
      totalMinutes: (data.totalMinutes ?? 0) + minutes,
      weekKey: week,
      weekMinutes: (data.weekKey === week ? data.weekMinutes ?? 0 : 0) + minutes,
      monthKey: month,
      monthMinutes: (data.monthKey === month ? data.monthMinutes ?? 0 : 0) + minutes
    }, { merge: true });
  });
}

// Minutes de la session en cours pas encore enregistrées (plafond compris).
function pendingMinutes(userId, now = Date.now()) {
  const segment = segments.get(userId);
  if (!segment) {
    return 0;
  }
  const elapsed = Math.max(0, (now - Math.max(segment.start, START_AT)) / 60_000);
  return Math.min(elapsed, Math.max(0, SESSION_CAP_MINUTES - segment.counted));
}

async function flushSegment(userId, now, stop) {
  const segment = segments.get(userId);
  if (!segment) {
    return;
  }

  const minutes = Math.round(pendingMinutes(userId, now) * 100) / 100;
  segment.counted += minutes;
  segment.start = now;
  if (stop) {
    segments.delete(userId);
  }

  if (minutes > 0) {
    await addMinutes(userId, segment.username, minutes).catch((error) => logError(`Temps vocal de ${segment.username}`, error));
  }
}

async function refreshMember(member, now) {
  if (!member || member.user.bot) {
    return;
  }

  if (isEligible(member)) {
    if (!segments.has(member.id)) {
      segments.set(member.id, { start: now, counted: 0, username: member.user.username });
    }
  } else if (segments.has(member.id)) {
    await flushSegment(member.id, now, true);
  }
}

// Une arrivée, un départ ou une sourdine change aussi le sort des autres membres
// du salon (quelqu'un peut se retrouver seul) : on revérifie tout le salon.
async function refreshChannel(channel, now) {
  for (const member of channel?.members?.values() ?? []) {
    await refreshMember(member, now);
  }
}

async function onVoiceStateUpdate(oldState, newState) {
  const now = Date.now();
  const member = newState.member ?? oldState.member;

  await refreshMember(member, now);
  await refreshChannel(oldState.channel, now);
  if (newState.channelId !== oldState.channelId) {
    await refreshChannel(newState.channel, now);
  }
}

async function flushAll() {
  const now = Date.now();
  for (const userId of [...segments.keys()]) {
    await flushSegment(userId, now, false);
  }
}

// ---- Classements --------------------------------------------------------------

const PERIODS = {
  semaine: { label: 'cette semaine', minutes: (d, keys) => (d.weekKey === keys.week ? d.weekMinutes ?? 0 : 0) },
  mois: { label: 'ce mois-ci', minutes: (d, keys) => (d.monthKey === keys.month ? d.monthMinutes ?? 0 : 0) },
  total: { label: 'depuis le début', minutes: (d) => d.totalMinutes ?? 0 }
};

// Classement complet (le serveur compte une soixantaine de membres : on lit tout
// et on trie ici, sans index Firestore à créer). La session en cours est ajoutée.
async function getRanking(period, keys = { week: weekKey(), month: monthKey() }, includePending = true) {
  const db = getDb();
  if (!db) {
    return [];
  }

  const snapshot = await db.collection(COLLECTION).get();
  const rows = new Map();

  for (const doc of snapshot.docs) {
    const data = doc.data();
    rows.set(doc.id, { userId: doc.id, username: data.username, minutes: PERIODS[period].minutes(data, keys) });
  }

  if (includePending) {
    for (const [userId, segment] of segments) {
      const row = rows.get(userId) ?? { userId, username: segment.username, minutes: 0 };
      row.minutes += pendingMinutes(userId);
      rows.set(userId, row);
    }
  }

  return [...rows.values()].filter((row) => row.minutes >= 1).sort((a, b) => b.minutes - a.minutes);
}

const MEDALS = ['🥇', '🥈', '🥉'];

function rankingLines(rows) {
  return rows.slice(0, TOP_SIZE).map((row, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${row.userId}> — **${formatMinutes(row.minutes)}**`);
}

// ---- Top du dimanche --------------------------------------------------------

async function postWeeklyRanking(client) {
  const db = getDb();
  if (!db) {
    return;
  }

  const week = previousWeekKey();
  const ref = db.collection(META_COLLECTION).doc('weekly');

  // Réserve la semaine avant de payer : jamais deux paiements pour la même semaine,
  // même si deux vérifications tombent en même temps.
  const claimed = await db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) {
      tx.set(ref, { lastPostedWeek: week }); // première mise en route : rien à publier
      return false;
    }
    if ((doc.data().lastPostedWeek ?? '') >= week) {
      return false;
    }
    tx.set(ref, { lastPostedWeek: week }, { merge: true });
    return true;
  });

  if (!claimed) {
    return;
  }

  const rows = await getRanking('semaine', { week, month: '' }, false);
  const winners = rows.slice(0, REWARDS.length);
  const paid = await Promise.allSettled(winners.map((row, i) => addCoins(row.userId, REWARDS[i])));
  paid.forEach((result, i) => {
    if (result.status === 'rejected') {
      logError(`Récompense vocale de ${winners[i].username}`, result.reason);
    }
  });

  const lines = rankingLines(rows).map((line, i) => (i < REWARDS.length ? `${line} · +${REWARDS[i]} 🥜` : line));
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🎙️ Top vocal de la semaine')
    .setDescription(lines.length ? lines.join('\n') : 'Personne n\'a parlé en vocal cette semaine… 😴')
    .setFooter({ text: 'Compté : à plusieurs, sans sourdine casque · 3 h max par session' })
    .setTimestamp();

  const channel = await client.channels.fetch(ACTIVITY_CHANNEL_ID);
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  console.log(`🎙️ Top vocal de la semaine du ${week} publié (${rows.length} classé(s)).`);
}

// ---- Démarrage --------------------------------------------------------------

// Reprend les membres déjà en vocal : un redémarrage du bot ne fait plus perdre
// la session en cours (seules les minutes depuis le dernier enregistrement).
async function startVoiceRanking(client, guildId) {
  const guild = await client.guilds.fetch(guildId);
  const now = Date.now();

  for (const channel of guild.channels.cache.filter((c) => c.isVoiceBased()).values()) {
    await refreshChannel(channel, now);
  }

  setInterval(() => {
    flushAll().catch((error) => logError('Temps vocal (enregistrement)', error));
  }, FLUSH_INTERVAL_MS);

  const check = () => postWeeklyRanking(client).catch((error) => logError('Top vocal de la semaine', error));
  check();
  setInterval(check, WEEKLY_CHECK_MS);
}

module.exports = {
  PERIODS,
  REWARDS,
  onVoiceStateUpdate,
  startVoiceRanking,
  getRanking,
  rankingLines,
  formatMinutes,
  weekKey,
  previousWeekKey,
  monthKey,
  isEligible,
  segments,
  flushAll,
  postWeeklyRanking,
  pendingMinutes
};
