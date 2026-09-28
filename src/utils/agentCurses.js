const { getDb } = require('./firebase');

const COLLECTION = 'agentCurses';

// Un seul agent imposé en attente par victime. Écrase le précédent s'il y en
// avait un (le nouvel achat remplace l'ancien plutôt que de s'accumuler).
async function setCurse(targetUserId, agentName, buyerUsername) {
  const db = getDb();
  if (!db) {
    return;
  }

  await db.collection(COLLECTION).doc(targetUserId).set({ agentName, buyerUsername });
}

async function getCurse(targetUserId) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const doc = await db.collection(COLLECTION).doc(targetUserId).get();
  return doc.exists ? doc.data() : null;
}

async function clearCurse(targetUserId) {
  const db = getDb();
  if (!db) {
    return;
  }

  await db.collection(COLLECTION).doc(targetUserId).delete();
}

module.exports = { setCurse, getCurse, clearCurse };
