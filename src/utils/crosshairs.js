const { getDb } = require('./firebase');

const COLLECTION = 'crosshairs';

async function setCrosshair(userId, code) {
  const db = getDb();
  if (!db) {
    return;
  }

  await db.collection(COLLECTION).doc(userId).set({ code });
}

async function getCrosshair(userId) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const doc = await db.collection(COLLECTION).doc(userId).get();
  return doc.exists ? doc.data().code : null;
}

module.exports = { setCrosshair, getCrosshair };
