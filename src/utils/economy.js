const { getDb } = require('./firebase');

const COLLECTION = 'economy';

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

async function getBalance(userId) {
  const db = getDb();
  if (!db) {
    return 0;
  }

  const doc = await db.collection(COLLECTION).doc(userId).get();
  return doc.exists ? (doc.data().balance ?? 0) : 0;
}

async function addCoins(userId, amount) {
  const db = getDb();
  if (!db || amount <= 0) {
    return null;
  }

  const ref = db.collection(COLLECTION).doc(userId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const balance = (doc.exists ? doc.data().balance : 0) + amount;
    tx.set(ref, { balance }, { merge: true });
    return balance;
  });
}

// Retourne false sans rien débiter si le solde est insuffisant (jamais de
// solde négatif).
async function removeCoins(userId, amount) {
  const db = getDb();
  if (!db) {
    return false;
  }

  const ref = db.collection(COLLECTION).doc(userId);

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const balance = doc.exists ? (doc.data().balance ?? 0) : 0;

    if (balance < amount) {
      return false;
    }

    tx.set(ref, { balance: balance - amount }, { merge: true });
    return true;
  });
}

const DAILY_BASE = 50;
const DAILY_STREAK_BONUS = 10;
const DAILY_MAX = 150;

// Retourne { claimed, amount, streak } — claimed=false si déjà réclamé
// aujourd'hui (rien n'est débité/crédité dans ce cas).
async function claimDaily(userId) {
  const db = getDb();
  if (!db) {
    return { claimed: false, amount: 0, streak: 0 };
  }

  const ref = db.collection(COLLECTION).doc(userId);
  const today = todayKey();

  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.exists ? doc.data() : {};

    if (data.lastDailyDate === today) {
      return { claimed: false, amount: 0, streak: data.dailyStreak ?? 0 };
    }

    // Streak continue seulement si le dernier /daily était hier ; sinon repart de 1.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const streak = data.lastDailyDate === yesterday ? (data.dailyStreak ?? 0) + 1 : 1;
    const amount = Math.min(DAILY_BASE + (streak - 1) * DAILY_STREAK_BONUS, DAILY_MAX);
    const balance = (data.balance ?? 0) + amount;

    tx.set(ref, { balance, lastDailyDate: today, dailyStreak: streak }, { merge: true });

    return { claimed: true, amount, streak };
  });
}

// Gain passif par message, séparé du cooldown XP pour rester indépendant.
const MESSAGE_COOLDOWN_MS = 60_000;
const MESSAGE_MIN = 1;
const MESSAGE_MAX = 3;
const lastMessageEarnAt = new Map();

async function earnFromMessage(userId) {
  const now = Date.now();
  const last = lastMessageEarnAt.get(userId) ?? 0;

  if (now - last < MESSAGE_COOLDOWN_MS) {
    return null;
  }

  lastMessageEarnAt.set(userId, now);
  const amount = Math.floor(Math.random() * (MESSAGE_MAX - MESSAGE_MIN + 1)) + MESSAGE_MIN;
  const balance = await addCoins(userId, amount);
  return balance === null ? null : { amount, balance };
}

module.exports = { getBalance, addCoins, removeCoins, claimDaily, earnFromMessage };
