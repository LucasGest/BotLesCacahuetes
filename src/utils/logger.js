const util = require('util');
const config = require('../config');

let client = null;

const FLUSH_INTERVAL_MS = 5000;
const MAX_MESSAGE_LENGTH = 1900;
const MAX_LINE_LENGTH = 1800;
const MAX_PENDING_LINES = 300;

// La console d'origine : tout ce que ce fichier écrit lui-même passe par là,
// sinon un échec d'envoi vers Discord se renverrait vers Discord en boucle.
const rawConsole = { log: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) };

let pendingLines = [];
let droppedLines = 0;
let flushing = false;

function redact(text) {
  const secrets = [
    config.token,
    config.firebase.privateKey,
    config.henrikApiKey,
    config.twitch.clientId,
    config.twitch.clientSecret
  ].filter(Boolean);

  return secrets.reduce((result, secret) => result.split(secret).join('[masqué]'), text);
}

function captureConsoleLine(args) {
  // Une ligne ne doit jamais pouvoir refermer le bloc de code du message.
  const line = redact(util.format(...args)).replaceAll('```', "'''").slice(0, MAX_LINE_LENGTH);

  // Reconnexions de routine : console de Render uniquement, pas dans le salon.
  if (/^Shard \d+ /.test(line)) {
    return;
  }

  if (pendingLines.length >= MAX_PENDING_LINES) {
    droppedLines += 1;
    return;
  }

  pendingLines.push(line);
}

for (const level of ['log', 'warn', 'error']) {
  console[level] = (...args) => {
    rawConsole[level](...args);
    captureConsoleLine(args);
  };
}

// Regroupe les lignes pour rester dans les limites de débit de Discord. Tout ce
// qui précède la connexion (le démarrage) attend ici que le bot soit prêt.
async function flushConsoleLines() {
  if (flushing || !client?.isReady() || !config.logChannelId || (pendingLines.length === 0 && droppedLines === 0)) {
    return;
  }

  flushing = true;

  try {
    const channel = await client.channels.fetch(config.logChannelId);
    let body = droppedLines > 0 ? `… ${droppedLines} ligne(s) perdue(s)\n` : '';
    let count = 0;

    while (count < pendingLines.length && body.length + pendingLines[count].length + 1 <= MAX_MESSAGE_LENGTH) {
      body += `${pendingLines[count]}\n`;
      count += 1;
    }

    await channel.send({ content: `\`\`\`\n${body}\`\`\``, allowedMentions: { parse: [] } });
    pendingLines = pendingLines.slice(count);
    droppedLines = 0;
  } catch (error) {
    rawConsole.error('[logger] Impossible d\'envoyer la console dans le salon de logs :', error.message);
  } finally {
    flushing = false;
  }
}

setInterval(flushConsoleLines, FLUSH_INTERVAL_MS).unref();

// Appelé une fois au démarrage (index.js), pour que logError puisse ensuite
// envoyer dans le salon de logs sans avoir à passer le client partout.
function initLogger(discordClient) {
  client = discordClient;
}

// Ne remonte JAMAIS l'erreur technique à un utilisateur Discord (le message
// d'erreur peut contenir des détails internes) : elle va seulement en console
// et, si configuré, dans un salon de logs privé.
async function logError(context, error) {
  rawConsole.error(`[${context}]`, error);

  if (!client || !config.logChannelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(config.logChannelId);

    if (channel?.isTextBased()) {
      const message = redact(error instanceof Error ? error.message : String(error));
      await channel.send(`⚠️ **${context}**\n\`\`\`${message.slice(0, 1800)}\`\`\``);
    }
  } catch (loggingError) {
    // Si même le logging échoue, on se contente de la console pour ne pas boucler.
    rawConsole.error('[logger] Impossible d\'envoyer dans le salon de logs :', loggingError.message);
  }
}

// Trace d'audit pour les actions de modération (qui a fait quoi, à qui,
// pourquoi) : contrairement à logError, ce n'est pas une erreur, juste une
// preuve que l'action a bien eu lieu.
async function logAction(message) {
  rawConsole.log(`[action] ${message}`);

  if (!client || !config.logChannelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(config.logChannelId);

    if (channel?.isTextBased()) {
      await channel.send(message.slice(0, 1900));
    }
  } catch (loggingError) {
    rawConsole.error('[logger] Impossible d\'envoyer dans le salon de logs :', loggingError.message);
  }
}

module.exports = { initLogger, logError, logAction };
