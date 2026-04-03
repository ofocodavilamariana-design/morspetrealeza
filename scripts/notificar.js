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

    // 🔥 DATA NO FUSO DO BRASIL (CORRETO)
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

    for (const doc of snapshot.docs) {
      const booking = doc.data();

      // 🔥 evita duplicação
      if (booking.notificadoHoje) continue;

      const userRef = db.collection("users").doc(booking.userId);
      const userDoc = await userRef.get();
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
            icon: "https://morspetrealeza.vercel.app/icons/icon-192.png",
            badge: "https://morspetrealeza.vercel.app/icons/icon-96.png",
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

      try {
        await admin.messaging().send(message);

        await db.collection("bookings").doc(doc.id).update({
          notificadoHoje: true
        });

        console.log(`✅ Enviado para ${booking.userId}`);

      } catch (error) {
        console.error(`❌ Erro ao enviar para ${booking.userId}:`, error.code);

        // 🔥 REMOVE TOKEN INVÁLIDO AUTOMATICAMENTE
        if (error.code === 'messaging/registration-token-not-registered') {
          console.log(`🧹 Removendo token inválido do usuário ${booking.userId}`);

          await userRef.update({
            fcmToken: admin.firestore.FieldValue.delete()
          });
        }
      }
    }

  } catch (err) {
    console.error("❌ Erro geral:", err);
    process.exit(1);
  }
}

enviarNotificacoes();
