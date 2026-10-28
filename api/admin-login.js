'use strict';
const crypto = require('crypto');
const { getAdmin, ADMIN_UID } = require('../lib/firebase-admin.cjs');
function equal(a,b) {
  const ah=crypto.createHash('sha256').update(a).digest();
  const bh=crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ah,bh);
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({success:false});
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASS || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return res.status(503).json({success:false,error:'Serviço de autenticação não configurado.'});
  const {user,pass} = req.body || {};
  if(typeof user !== 'string' || typeof pass !== 'string' || user.length > 256 || pass.length > 1024) return res.status(400).json({success:false});
  try {
    const admin=getAdmin();
    // Limite global e persistente entre instâncias; combine com proteção WAF na Vercel.
    const state=admin.firestore().collection('security_state').doc('admin_login_limit');
    const allowed=await admin.firestore().runTransaction(async tx=>{
      const snap=await tx.get(state), now=Date.now();
      const old=snap.exists?snap.data():null;
      const end=old && typeof old.end==='number' ? old.end : 0;
      const count=now<end && Number.isInteger(old?.count) ? old.count : 0;
      if(count>=10) return false;
      tx.set(state,{count:count+1,end:now<end?end:now+15*60*1000});
      return true;
    });
    if(!allowed) return res.status(429).json({success:false,error:'Muitas tentativas. Aguarde 15 minutos.'});
    if (!equal(user,process.env.ADMIN_USER) || !equal(pass,process.env.ADMIN_PASS)) return res.status(401).json({success:false});
    const token=await admin.auth().createCustomToken(ADMIN_UID,{admin:true});
    return res.status(200).json({success:true,customToken:token});
  } catch (_) { return res.status(503).json({success:false,error:'Não foi possível iniciar a autenticação Firebase.'}); }
};
