'use strict';
// Credencial APENAS em variável de ambiente da Vercel, nunca no HTML ou repositório.
const admin = require('firebase-admin');
let initialized;
function getAdmin() {
  if (initialized) return initialized;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON ausente');
  let serviceAccount;
  try { serviceAccount = JSON.parse(raw); } catch (_) { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON inválida'); }
  if (serviceAccount.project_id !== 'mors-pet' || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error('Credencial Firebase inválida ou projeto incorreto');
  initialized = admin.apps.length ? admin : admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'mors-pet' }) && admin;
  return initialized;
}
const ADMIN_UID = 'mors-pet-painel-admin';
module.exports = { getAdmin, ADMIN_UID };
