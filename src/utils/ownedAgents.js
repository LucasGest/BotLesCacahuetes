const { getDb } = require('./firebase');

const COLLECTION = 'ownedAgents';

// Retourne null si le joueur n'a jamais configuré ses agents (Firestore
// désactivé, ou aucun document) : à distinguer d'un tableau vide, qui veut
// dire "configuré mais aucun agent payant débloqué".
async function getOwnedAgents(userId) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const doc = await db.collection(COLLECTION).doc(userId).get();
  return doc.exists ? (doc.data().agents ?? []) : null;
}

async function setOwnedAgents(userId, agentNames) {
  const db = getDb();
  if (!db) {
    return;
  }

  await db.collection(COLLECTION).doc(userId).set({ agents: agentNames }, { merge: true });
}

module.exports = { getOwnedAgents, setOwnedAgents };
