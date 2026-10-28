#!/usr/bin/env node

const admin = require('firebase-admin');

// -----------------------------------------------------------------------
// 🔐 FIREBASE ADMIN (COM VALIDAÇÃO)
// -----------------------------------------------------------------------
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT não definido!");
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  console.error("❌ Erro ao fazer parse do JSON do Firebase:", e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// -----------------------------------------------------------------------
// 🚀 NOTIFICAÇÕES
// -----------------------------------------------------------------------
async function enviarNotificacoes() {
  try {
    console.log("🚀 Iniciando notificações...");

    const hoje = new Date();

    const dataHoje = hoje.toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo"
    });

    console.log("📅 Data considerada:", dataHoje);

    const snapshot = await db
      .collection("bookings")
      .where("date", "==", dataHoje)
      .where("status", "==", "confirmado")
      .get();

    if (snapshot.empty) {
      console.log("✅ Nenhum agendamento hoje");
      return;
    }

    console.log(`📦 ${snapshot.size} agendamentos encontrados`);

    for (const doc of snapshot.docs) {
      const booking = doc.data();

      if (!booking) continue;

      if (booking.notificadoHoje) {
        console.log(`⏭ Já notificado: ${doc.id}`);
        continue;
      }

      if (!booking.userId) {
        console.log(`⚠️ Sem userId no booking: ${doc.id}`);
        continue;
      }

      const userDoc = await db.collection("users").doc(booking.userId).get();

      if (!userDoc.exists) {
        console.log(`⚠️ Usuário não encontrado: ${booking.userId}`);
        continue;
      }

      const userData = userDoc.data();
      const token = userData?.fcmToken;

      if (!token) {
        console.log(`⚠️ Usuário sem token: ${booking.userId}`);
        continue;
      }

      const message = {
        token,
        notification: {
          title: "🐾 Lembrete de Agendamento",
          body: `Hoje às ${booking.time || '--:--'}, ${booking.petName || 'seu pet'} tem ${booking.service || 'um serviço'}`
        },
        webpush: {
          notification: {
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-96.png",
            requireInteraction: true,
            vibrate: [200, 100, 200]
          },
          fcmOptions: {
            link: "https://morspetrealeza.com.br/#agendamento"
          }
        },
        data: {
          url: "https://morspetrealeza.com.br/#agendamento"
        }
      };

      // ⏱ Timeout de 10s
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
        console.error(`❌ Erro ao enviar para ${booking.userId}:`, sendErr.message);
      }
    }

    console.log("🏁 Processo finalizado com sucesso");

  } catch (err) {
    console.error("❌ Erro geral:", err.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------
// ▶ EXECUÇÃO
// -----------------------------------------------------------------------
enviarNotificacoes();
