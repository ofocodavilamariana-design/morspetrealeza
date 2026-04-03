#!/usr/bin/env node

const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

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

      // 🔥 MENSAGEM OTIMIZADA PARA PWA + MOBILE
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

      await admin.messaging().send(message);

      await db.collection("bookings").doc(doc.id).update({
        notificadoHoje: true
      });

      console.log(`✅ Enviado para ${booking.userId}`);
    }

  } catch (err) {
    console.error("❌ Erro:", err);
    process.exit(1);
  }
}

enviarNotificacoes();
