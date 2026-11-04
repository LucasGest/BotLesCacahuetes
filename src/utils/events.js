const { getDb } = require('./firebase');

const COLLECTION = 'events';

const REWARDS = { participation: 20, mvp: 50, win: 30 };

// Erreur "métier" dont le message peut être montré tel quel à l'utilisateur,
// contrairement aux erreurs techniques qui ne doivent aller que dans les logs.
class EventError extends Error {}

function requireDb() {
  const db = getDb();
  if (!db) {
    throw new EventError('La base de données est indisponible : réessaie plus tard.');
  }
  return db;
}

async function createEvent(data) {
  const db = requireDb();
  const event = {
    ...data,
    status: 'open',
    messageId: null,
    participants: {},
    invited: {},
    voiceChannelId: null,
    actions: [],
    winnerId: null,
    createdAt: Date.now(),
    finishedAt: null
  };
  const ref = await db.collection(COLLECTION).add(event);
  return { id: ref.id, ...event };
}

async function getEvent(id) {
  const doc = await requireDb().collection(COLLECTION).doc(id).get();
  if (!doc.exists) {
    throw new EventError('Cet événement est introuvable.');
  }
  return { id: doc.id, ...doc.data() };
}

async function deleteEvent(id) {
  await requireDb().collection(COLLECTION).doc(id).delete();
}

async function listEvents(statuses) {
  const snapshot = await requireDb().collection(COLLECTION).where('status', 'in', statuses).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.createdAt - a.createdAt);
}

// Transaction : deux clics simultanés (deux inscriptions, deux staff qui
// terminent en même temps) ne doivent jamais s'écraser ni payer deux fois.
async function updateEvent(id, mutate) {
  const db = requireDb();
  const ref = db.collection(COLLECTION).doc(id);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) {
      throw new EventError('Cet événement est introuvable.');
    }

    const event = doc.data();
    mutate(event);
    tx.set(ref, event);
    return { id, ...event };
  });
}

function setMessageId(id, messageId) {
  return updateEvent(id, (event) => {
    event.messageId = messageId;
  });
}

function expectStatus(event, status, message) {
  if (event.status !== status) {
    throw new EventError(message);
  }
}

function join(id, user) {
  return updateEvent(id, (event) => {
    expectStatus(event, 'open', 'Les inscriptions sont fermées.');
    event.participants[user.id] = { username: user.username, joinedAt: Date.now() };
  });
}

function leave(id, userId) {
  return updateEvent(id, (event) => {
    expectStatus(event, 'open', 'Les inscriptions sont fermées : tu ne peux plus te désinscrire.');
    delete event.participants[userId];
  });
}

function isActive(event) {
  return event.status === 'open' || event.status === 'running';
}

function watchVoice(id, channelId) {
  return updateEvent(id, (event) => {
    if (!isActive(event)) {
      throw new EventError('Cet événement est déjà terminé ou annulé.');
    }
    event.voiceChannelId = channelId;
  });
}

// Renvoie l'événement si la personne doit recevoir une invitation, sinon null.
// Transaction : une personne ne peut être invitée qu'une fois par événement.
async function markInvited(id, userId) {
  let shouldInvite = false;
  const updated = await updateEvent(id, (event) => {
    event.invited ??= {};
    if (isActive(event) && !event.participants[userId] && !event.invited[userId]) {
      event.invited[userId] = Date.now();
      shouldInvite = true;
    }
  });
  return shouldInvite ? updated : null;
}

// Contrairement au bouton de l'annonce, une invitation reçue reste valable une
// fois l'événement démarré : la personne est déjà dans le vocal.
function joinFromInvite(id, user) {
  return updateEvent(id, (event) => {
    if (!isActive(event)) {
      throw new EventError('Cet événement est terminé.');
    }
    if (!event.invited?.[user.id]) {
      throw new EventError("Tu n'as pas été invité(e) à cet événement.");
    }
    event.participants[user.id] = { username: user.username, joinedAt: Date.now() };
  });
}

function start(id) {
  return updateEvent(id, (event) => {
    expectStatus(event, 'open', 'Cet événement a déjà démarré ou est terminé.');
    if (Object.keys(event.participants).length === 0) {
      throw new EventError("Il faut au moins un participant pour démarrer l'événement.");
    }
    event.status = 'running';
  });
}

function addAction(id, type, userIds, staffId) {
  return updateEvent(id, (event) => {
    expectStatus(event, 'running', "Cet événement n'est pas en cours.");
    if (userIds.some((userId) => !event.participants[userId])) {
      throw new EventError('Seuls les participants inscrits peuvent être sélectionnés.');
    }
    event.actions.push({ type, userIds, by: staffId, at: Date.now() });
  });
}

function undoLastAction(id) {
  let undone = null;
  return updateEvent(id, (event) => {
    expectStatus(event, 'running', "Cet événement n'est pas en cours.");
    undone = event.actions.pop() ?? null;
    if (!undone) {
      throw new EventError('Il n’y a aucune action à annuler.');
    }
  }).then((event) => ({ event, undone }));
}

function finish(id, winnerId) {
  return updateEvent(id, (event) => {
    expectStatus(event, 'running', "Cet événement n'est pas en cours.");
    if (!event.participants[winnerId]) {
      throw new EventError('Le gagnant doit être un participant inscrit.');
    }
    event.status = 'finished';
    event.winnerId = winnerId;
    event.finishedAt = Date.now();
  });
}

function cancel(id) {
  return updateEvent(id, (event) => {
    if (event.status !== 'open' && event.status !== 'running') {
      throw new EventError('Cet événement est déjà terminé ou annulé.');
    }
    event.status = 'cancelled';
    event.finishedAt = Date.now();
  });
}

// Les statistiques sont recalculées depuis l'historique des actions : annuler
// une erreur revient simplement à retirer la dernière action.
function computeStats(event) {
  const stats = new Map(
    Object.keys(event.participants).map((userId) => [userId, { userId, mvp: 0, wins: 0, events: 1 }])
  );

  for (const action of event.actions) {
    for (const userId of action.userIds) {
      const entry = stats.get(userId);
      if (entry) {
        entry[action.type === 'mvp' ? 'mvp' : 'wins'] += 1;
      }
    }
  }

  return [...stats.values()];
}

function aggregateStats(events) {
  const totals = new Map();

  for (const event of events) {
    for (const entry of computeStats(event)) {
      const total = totals.get(entry.userId) ?? { userId: entry.userId, mvp: 0, wins: 0, events: 0 };
      total.mvp += entry.mvp;
      total.wins += entry.wins;
      total.events += entry.events;
      totals.set(entry.userId, total);
    }
  }

  return [...totals.values()];
}

function sortStats(stats) {
  return [...stats].sort((a, b) => b.mvp - a.mvp || b.wins - a.wins || b.events - a.events);
}

function rewardFor(entry) {
  return REWARDS.participation + entry.mvp * REWARDS.mvp + entry.wins * REWARDS.win;
}

module.exports = {
  EventError,
  REWARDS,
  createEvent,
  getEvent,
  deleteEvent,
  listEvents,
  setMessageId,
  join,
  leave,
  watchVoice,
  markInvited,
  joinFromInvite,
  start,
  addAction,
  undoLastAction,
  finish,
  cancel,
  computeStats,
  aggregateStats,
  sortStats,
  rewardFor
};
