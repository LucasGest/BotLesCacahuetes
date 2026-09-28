const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { initLogger, logError } = require('./utils/logger');
const { initFirebase } = require('./utils/firebase');

initFirebase();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  // Bloque par défaut les mentions @everyone/@here et de rôles dans TOUT ce
  // que le bot envoie, même si un futur message construit une string à partir
  // d'une entrée utilisateur : un membre ne doit jamais pouvoir faire pinguer
  // tout le serveur via le bot. "users" reste autorisé pour les mentions
  // directes volontaires (ex: message de bienvenue).
  allowedMentions: { parse: ['users'], repliedUser: true }
});

initLogger(client);

// Visibilité sur la connexion gateway : sans ça, une connexion qui reste
// bloquée (ni prête, ni en erreur) est totalement invisible dans les logs.
client.on(Events.Error, (error) => logError('Client Discord', error));
client.on(Events.Warn, (message) => console.warn('Avertissement Discord :', message));
client.on(Events.ShardError, (error, shardId) => logError(`Shard ${shardId}`, error));
client.on(Events.ShardDisconnect, (event, shardId) => console.warn(`Shard ${shardId} déconnecté (code ${event.code}).`));
client.on(Events.ShardReconnecting, (shardId) => console.warn(`Shard ${shardId} en cours de reconnexion...`));
client.on(Events.ShardResume, (shardId) => console.log(`Shard ${shardId} reconnecté.`));

client.commands = new Collection();

// Charge chaque commande depuis src/commands/<catégorie>/<nom>.js. Chaque
// fichier doit exporter { data: SlashCommandBuilder, execute(interaction) }.
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
  const folderPath = path.join(commandsPath, folder);
  const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(folderPath, file));

    if (!command.data || !command.execute) {
      console.warn(`La commande ${file} n'a pas de "data" ou "execute", ignorée.`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }
}

// Charge chaque event depuis src/events/<nom>.js. Chaque fichier doit
// exporter { name, once?, execute(...args) }.
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));

  // Une erreur dans un event (ex: guildMemberAdd) ne doit jamais rester
  // silencieuse ni planter le process : même filet de sécurité que pour les
  // commandes, juste posé une fois ici plutôt que dans chaque fichier d'event.
  const wrappedExecute = async (...args) => {
    try {
      await event.execute(...args, client);
    } catch (error) {
      await logError(`Event ${event.name}`, error);
    }
  };

  if (event.once) {
    client.once(event.name, wrappedExecute);
  } else {
    client.on(event.name, wrappedExecute);
  }
}

// Filet de sécurité global : une erreur non gérée quelque part ne doit jamais
// planter tout le process (déni de service facile sinon), juste être loggée.
process.on('unhandledRejection', (error) => {
  logError('Rejet de promesse non géré', error);
});

process.on('uncaughtException', (error) => {
  logError('Exception non gérée', error);
});

// Serveur HTTP minimal : Render (free tier) exige un port ouvert pour
// considérer le service "actif".
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Les Cacahuètes bot is alive 🥜');
  })
  .listen(config.port, () => {
    console.log(`Serveur keep-alive en écoute sur le port ${config.port}.`);
  });

console.log(`Tentative de connexion à Discord (Node ${process.version})...`);

client
  .login(config.token)
  .then(() => console.log('login() résolu (en attente de ClientReady).'))
  .catch((error) => {
    // On logge le type d'erreur, jamais le token lui-même.
    console.error(`Échec de connexion à Discord : ${error.message}`);
    process.exit(1);
  });
