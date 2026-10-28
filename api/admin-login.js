'use strict';
const crypto = require('crypto');
const { getAdmin, ADMIN_UID } = require('../lib/firebase-admin.cjs');

const MAX_FALHAS = 10;
const JANELA_MS = 15 * 60 * 1000;

function equal(a, b) {
  const ah = crypto.createHash('sha256').update(a).digest();
  const bh = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ success: false });
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return res.status(503).json({ success: false, error: 'Serviço de autenticação não configurado.' });
  }
  const { user, pass } = req.body || {};
  if (typeof user !== 'string' || typeof pass !== 'string' || user.length > 256 || pass.length > 1024) {
    return res.status(400).json({ success: false });
  }
  try {
    const admin = getAdmin();
    const db = admin.firestore();
    // Limite global e persistente entre instâncias; combine com proteção WAF na Vercel.
    // Só tentativas que ERRAM contam: logins corretos não consomem o limite.
    const state = db.collection('security_state').doc('admin_login_limit');
    const lerFalhas = (snap, now) => {
      const old = snap.exists ? snap.data() : null;
      const end = old && typeof old.end === 'number' ? old.end : 0;
      return { end, count: now < end && Number.isInteger(old && old.count) ? old.count : 0 };
    };

    const snap0 = await state.get();
    const antes = lerFalhas(snap0, Date.now());
    if (antes.count >= MAX_FALHAS) {
      return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' });
    }

    // "&" (e não "&&") para sempre comparar os dois campos, sem curto-circuito.
    const ok = equal(user, process.env.ADMIN_USER) & equal(pass, process.env.ADMIN_PASS);
    if (!ok) {
      await db.runTransaction(async (tx) => {
        const now = Date.now();
        const atual = lerFalhas(await tx.get(state), now);
        tx.set(state, { count: atual.count + 1, end: now < atual.end ? atual.end : now + JANELA_MS });
      });
      return res.status(401).json({ success: false });
    }

    if (snap0.exists && snap0.data().count > 0) await state.set({ count: 0, end: 0 });
    const token = await admin.auth().createCustomToken(ADMIN_UID, { admin: true });
    return res.status(200).json({ success: true, customToken: token });
  } catch (e) {
    // Registra a causa real nos logs da Vercel (nunca envia detalhes ao navegador).
    console.error('admin-login falhou:', (e && (e.code || e.name)) || 'erro', '-', e && e.message);
    return res.status(503).json({ success: false, error: 'Não foi possível iniciar a autenticação Firebase.' });
  }
};
