#!/usr/bin/env node

// =====================================================================
// MUDANÇAS FEITAS:
// - CORREÇÃO 9: Adicionado endpoint POST /admin-login seguro, que lê
//   as credenciais APENAS via process.env.ADMIN_USER / ADMIN_PASS.
//   As credenciais foram REMOVIDAS do frontend (index.html).
// - CORREÇÃO 13: Adicionado timeout de 10s por envio de notificação
//   usando Promise.race, para evitar que a função trave indefinidamente.
// - Dependência 'express' adicionada para servir o endpoint HTTP.
//   Rode: npm install express   (ou já conste no package.json do projeto)
// =====================================================================

const admin = require('firebase-admin');
const express = require('express');

// -----------------------------------------------------------------------
// FIREBASE ADMIN
// -----------------------------------------------------------------------
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// -----------------------------------------------------------------------
// CORREÇÃO 9: Servidor Express com endpoint seguro /admin-login
// As credenciais vivem SOMENTE nas variáveis de ambiente do servidor.
// Nunca retornar a senha; nunca expor no frontend.
// -----------------------------------------------------------------------
const app = express();
app.use(express.json());

app.post('/admin-login', (req, res) => {
  const { user, pass } = req.body || {};

  // Valida contra variáveis de ambiente — jamais hardcoded
  if (
    user === process.env.ADMIN_USER &&
    pass === process.env.ADMIN_PASS
  ) {
    return res.json({ success: true });
  }

  // 401 sem revelar qual campo está errado
  return res.status(401).json({ success: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔒 Servidor admin rodando na porta ${PORT}`);
});

// -----------------------------------------------------------------------
// NOTIFICAÇÕES
// -----------------------------------------------------------------------
async function enviarNotificacoes() {
  try {
    console.log("🚀 Iniciando notificações...");

    const hoje = new Date();

    const dataHoje = hoje.toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo"
    });

    const snapshot = await db
      .collection("bookings")
      .where("date", "==", dataHoje)
      .where("status", "==", "confirmado")
      .get();

    if (snapshot.empty) {
      console.log("✅ Nenhum agendamento hoje");
      return;
    }

    for (const doc of snapshot.docs) {
      const booking = doc.data();

      if (booking.notificadoHoje) continue;

      const userDoc = await db.collection("users").doc(booking.userId).get();
      const token = userDoc.data()?.fcmToken;

      if (!token) {
        console.log(`⚠️ Usuário sem token: ${booking.userId}`);
        continue;
      }

      const message = {
        token,
        notification: {
          title: "🐾 Lembrete de Agendamento",
          body: `Hoje às ${booking.time}, ${booking.petName} tem ${booking.service}`
        },
        webpush: {
          notification: {
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-96.png",
            requireInteraction: true,
            vibrate: [200, 100, 200]
          },
          fcmOptions: {
            link: "https://morspetrealeza.vercel.app/#agendamento"
          }
        },
        data: {
          url: "https://morspetrealeza.vercel.app/#agendamento"
        }
      };

      // CORREÇÃO 13: Timeout de 10s por envio para não travar o processo
      const sendNotification = () => admin.messaging().send(message);
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout ao enviar notificação")), 10000)
      );

      try {
        await Promise.race([sendNotification(), timeout]);

        await db.collection("bookings").doc(doc.id).update({
          notificadoHoje: true
        });

        console.log(`✅ Enviado para ${booking.userId}`);
      } catch (sendErr) {
        // Erro isolado por usuário — não interrompe o loop
        console.error(`❌ Erro ao enviar para ${booking.userId}:`, sendErr.message);
      }
    }

  } catch (err) {
    console.error("❌ Erro geral:", err);
    process.exit(1);
  }
}

enviarNotificacoes();
