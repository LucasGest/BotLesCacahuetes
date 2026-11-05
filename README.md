# Les Cacahuètes Bot

Bot Discord de départ construit avec [discord.js](https://discord.js.org/).

## Prérequis

- Node.js 18.17 ou plus récent
- Une application créée sur le [Discord Developer Portal](https://discord.com/developers/applications)

## Installation

```bash
npm install
```

Remplis `.env` à la racine avec :

- `DISCORD_TOKEN` : le token du bot, depuis l'onglet **Bot**
- `DISCORD_CLIENT_ID` : l'Application ID, depuis **General Information**
- `DISCORD_GUILD_ID` : l'identifiant du serveur de test

Ne partage jamais le contenu de `.env` et ne publie jamais le token. `.env.example` liste les mêmes clés sans valeurs, à commiter à la place.

## Sécurité

### Secrets

Token et IDs uniquement dans `.env` (jamais commité, voir `.gitignore`). Aucun secret codé en dur ni affiché dans les logs : `index.js` logge le *message* d'erreur de connexion, jamais le token lui-même.

### Intents

Seuls deux intents sont activés, chacun justifié par une fonctionnalité réelle :

- `Guilds` : obligatoire pour que le bot sache dans quels serveurs/salons il est, base de tout le reste.
- `GuildMembers` (privilégié — à activer dans **Bot > Privileged Gateway Intents**) : nécessaire pour le message de bienvenue (`guildMemberAdd`) et pour `member.guild.memberCount`.

Aucun intent lié aux messages (`GuildMessages`, `MessageContent`) : le bot ne lit aucun contenu de message pour l'instant. À ajouter seulement si une fonctionnalité future le demande vraiment.

### Inviter le bot (permissions minimales, sans Administrateur)

Scopes `bot` + `applications.commands`, permissions strictement limitées à ce qu'utilisent les fonctionnalités actuelles (Voir les salons, Envoyer des messages, Intégrer des liens — pour l'embed de bienvenue) :

```
https://discord.com/api/oauth2/authorize?client_id=1553356954351570944&permissions=19456&scope=bot%20applications.commands
```

Si une future fonctionnalité a besoin d'une permission de plus (ex: gérer les rôles pour les candidatures), ajoute-la explicitement dans ce lien plutôt que de mettre Administrateur.

### Mentions

Le client est configuré avec `allowedMentions: { parse: ['users'] }` : aucun message envoyé par le bot ne peut déclencher un ping `@everyone`, `@here` ou de rôle, même si un futur message construit du texte à partir d'une entrée utilisateur. Les mentions directes d'un membre (ex: message de bienvenue) restent autorisées.

### Contrôle d'accès

- `interactionCreate.js` vérifie `interaction.guildId` contre l'ID du serveur configuré et ignore tout le reste — le bot ne traite rien si le token venait à fuiter et être utilisé ailleurs.
- `src/utils/permissions.js` expose `isStaffMember(member)`, basé sur `STAFF_ROLE_IDS` (`.env`). **Pas encore utilisé** (aucune commande staff n'existe encore) : quand tickets/candidatures seront construits, chaque bouton/commande réservé au staff doit appeler cette fonction en plus de `setDefaultMemberPermissions` — ne jamais se fier qu'à Discord pour ça.

### Stabilité et logs

- Chaque commande et chaque event tourne dans un `try/catch` (posé une fois pour toutes dans `index.js` pour les events, dans `interactionCreate.js` pour les commandes) : une erreur n'affiche jamais de détail technique à l'utilisateur, juste "Il y a eu une erreur...".
- `process.on('unhandledRejection'/'uncaughtException')` empêchent un crash silencieux.
- `src/utils/logger.js` centralise le logging : toujours en console, et en plus dans un salon Discord privé si `LOG_CHANNEL_ID` est renseigné dans `.env`.

### À appliquer quand les fonctionnalités correspondantes existeront

Ces points de la checklist sécurité ne s'appliquent à aucun code existant aujourd'hui (pas de tickets, candidatures, ou vocaux auto) — à mettre en place au moment de construire ces fonctionnalités, pas avant :

- **Boutons Accepter/Refuser/Fermer** : vérifier `isStaffMember(interaction.member)` avant d'exécuter l'action, en plus de la permission Discord sur la commande qui a créé le bouton.
- **Attribution de rôle** (candidature acceptée) : avant d'appeler `member.roles.add(role)`, vérifier `guild.members.me.permissions.has('ManageRoles')` ET que `role.position < guild.members.me.roles.highest.position` — sinon Discord refuse silencieusement ou lève une erreur selon le cas.
- **Un ticket/candidature à la fois par utilisateur** : garder l'ID du ticket ouvert (ex: dans le topic du salon, comme fait dans une version précédente de ce bot) et refuser d'en créer un second.
- **Cooldowns** : un `Map<userId, timestamp>` en mémoire suffit pour limiter la fréquence d'une commande/bouton, pas besoin de base de données pour ça.
- **Limite sur les vocaux automatiques** : plafonner le nombre de salons vocaux créés simultanément par le bot (ex: max N actifs), et les supprimer automatiquement quand ils se vident.
- **Validation des `customId`** : préfixer chaque `customId` par un nom d'action stable (ex: `ticket_close_<id>`) et vérifier ce préfixe avant de parser le reste, plutôt que de faire confiance à la forme du `customId` reçu.
- **Entrées de formulaire (modals)** : `TextInputBuilder.setMaxLength(...)` sur chaque champ, et échapper/normaliser le texte avant de le réafficher dans un embed (déjà fait pour le message de bienvenue via les mentions bloquées, à répéter pour tout texte libre affiché).

## Structure

```
src/
  commands/
    general/
      ping.js
  events/
    ready.js
    interactionCreate.js
    guildMemberAdd.js
  utils/
    logger.js
    permissions.js
  config.js
  deploy-commands.js
  index.js
```

Chaque commande est un fichier sous `src/commands/<catégorie>/`, qui exporte :

```js
module.exports = {
  data: new SlashCommandBuilder().setName('...').setDescription('...'),
  async execute(interaction) { ... }
};
```

`index.js` charge automatiquement tous les fichiers de `src/commands/` (peu importe la catégorie) et de `src/events/` — ajouter une commande ou un event ne demande jamais de toucher `index.js`, juste de déposer le fichier au bon endroit.

Chaque event est un fichier sous `src/events/`, qui exporte :

```js
module.exports = {
  name: Events.NomDeLevent,
  once: false, // true pour un event qui ne doit se déclencher qu'une fois (ex: ready)
  execute(...args) { ... }
};
```

## Lancer

Déploie les commandes slash sur ton serveur :

```bash
npm run deploy
```

Puis démarre le bot :

```bash
npm start
```

## Commandes disponibles

| Commande | Description |
| --- | --- |
| `/ping` | Répond avec la latence du bot. |
| `/roles-jeux` | Crée les rôles de jeux manquants et publie les boutons de choix dans #rôles (staff). |
| `/event creer` | Crée et annonce un événement dans #events (staff). |
| `/event liste` | Affiche les événements à venir et en cours. |
| `/event gerer` | Panneau du staff : démarrer, inviter le vocal par DM, MVP, victoires, annulation, fin et gagnant. |
| `/event classement` | Classement général ou par événement (MVP, victoires). |
