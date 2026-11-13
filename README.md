# Bot CloudyCat 🐾

Bot Discord du serveur **CloudyCat** ☁️🐱 (ex-« Les Cacahuètes »), en [discord.js](https://discord.js.org/) v14. Hébergé sur Render, données sur Firebase (Firestore).

## Ce que fait le bot

- **Accueil** : message de bienvenue et souhaits d'anniversaire.
- **Économie en 🐾 pattes** : gain en écrivant et en vocal, `/daily`, `/boutique` (couleur de pseudo, rôle perso 7 jours, imposer un agent).
- **Valorant** : `/lier-riot` (rôle de rang automatique), `/customs` (équipes équilibrées par rang), `/defi-valorant`, `/agent-random`, `/arme-random`, `/crosshair`, `/mes-agents`.
- **Activité** : détection des jeux lancés (rôles 🎮 et 🕹️ En jeu, tableau « Qui joue en ce moment ? »), classement vocal de la semaine avec récompenses le dimanche.
- **Communauté** : `/cherche-mate`, `/sondage`, XP et niveaux (`/rank`, `/leaderboard`), annonces de live Twitch.
- **Staff** : tickets, modération (`/ban`, `/kick`, `/timeout`, `/unmute`, `/warn`, `/clear`), `/roles-jeux`.

## Commandes

| Commande | Description |
| --- | --- |
| `/agent-random` | Tire un agent Valorant parmi ceux que tu as débloqués. |
| `/anniversaire` | Définit ou retire ton anniversaire. |
| `/arme-random` | Tire une arme principale au hasard. |
| `/boutique` | Dépense tes pattes contre des avantages. |
| `/cherche-mate` | Cherche un mate pour jouer (mode, rang, places). |
| `/classement-vocal` | Classement du temps passé en vocal (semaine, mois, total). |
| `/crosshair` | Partage ou consulte un code de viseur Valorant. |
| `/customs` | Session de customs : inscriptions et équipes équilibrées par rang. |
| `/daily` | Récupère tes pattes du jour (bonus de série). |
| `/defi-valorant` | 5 défis Valorant au hasard, validés à l'honneur, récompensés en pattes. |
| `/leaderboard` | Membres les plus actifs. |
| `/lier-riot` | Lie ton compte Riot pour obtenir ton rôle de rang. |
| `/mes-agents` | Gère la liste de tes agents débloqués. |
| `/ping` | Latence du bot. |
| `/rank` | Niveau et XP d'un membre. |
| `/solde` | Solde de pattes d'un membre. |
| `/sondage` | Sondage rapide, jusqu'à 5 options. |
| `/ban`, `/kick`, `/timeout`, `/unmute`, `/warn`, `/clear` | Modération (staff). |
| `/roles-jeux` | Publie le choix des rôles de jeux (staff). |
| `/ticket-setup` | Publie le message d'ouverture de ticket (staff). |

Les commandes ne s'utilisent que dans le salon #commande, sauf pour le staff.

## Installation

Node.js 18.17 ou plus récent.

```bash
npm install
```

Copie `.env.example` en `.env` et remplis-le : `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, et en option `LOG_CHANNEL_ID`, `STAFF_ROLE_IDS`, les identifiants Firebase, `HENRIKDEV_API_KEY` (Valorant) et `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`. Une fonctionnalité dont la clé manque est simplement désactivée.

`.env` et la clé Firebase (`*firebase-adminsdk*.json`) ne sont jamais commités (voir `.gitignore`).

```bash
npm run deploy   # enregistre les commandes slash sur le serveur
npm start        # lance le bot
```

Sur Render, un push sur `master` redéploie et redémarre le bot. Après un ajout ou un retrait de commande, relancer `npm run deploy`.

## Inviter le bot

Sans Administrateur, avec uniquement les permissions utilisées par le code (modération, rôles, salons, vocal, messages) :

```
https://discord.com/oauth2/authorize?client_id=1553356954351570944&permissions=1099800505430&integration_type=0&scope=bot+applications.commands
```

Ensuite, placer le rôle du bot **sous les rôles staff** et **au-dessus des rôles qu'il gère** (rôle de base, 🕹️ En jeu, 🎮 jeux, 🏅 rangs, 🎟️ et couleurs de la boutique).

## Sécurité

- **Serveur unique** : `interactionCreate.js` ignore toute interaction venant d'un autre serveur que `DISCORD_GUILD_ID`.
- **Staff** : les commandes et boutons réservés vérifient `isStaffMember()` (`STAFF_ROLE_IDS`) en plus des permissions Discord.
- **Rôles** : `roleSafety.js` refuse de donner un rôle qui porterait une permission (modération, admin…), même via la boutique.
- **Mentions** : `allowedMentions` limite les pings ; aucun texte d'utilisateur ne peut déclencher `@everyone`.
- **Anti-abus économique** : plafonds journaliers (daily, customs, défis à 150 🐾/jour), plafond anti-AFK en vocal.
- **Stabilité** : chaque commande et chaque event est protégé par un `try/catch` ; les erreurs vont dans la console et dans le salon de logs.

## Intents

`Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent` (XP et gains par message), `GuildVoiceStates` (vocal), `GuildPresences` (détection des jeux). Les trois intents privilégiés sont à activer dans **Bot → Privileged Gateway Intents**.

## Structure

```
src/
  commands/general/   commandes pour tous
  commands/staff/     commandes réservées au staff
  events/             events Discord (ready, interactionCreate, guildMemberAdd…)
  utils/              économie, XP, rôles, Firestore, logs, activité, classement vocal…
  config.js
  deploy-commands.js
  index.js
```

`index.js` charge automatiquement chaque fichier de `src/commands/` et `src/events/`. Pour ajouter une commande, il suffit de déposer le fichier au bon endroit, puis de lancer `npm run deploy`.
