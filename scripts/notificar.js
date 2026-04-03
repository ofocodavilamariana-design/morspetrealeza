#!/usr/bin/env node

const admin = require('firebase-admin');

// 🔐 Credenciais do Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function enviarNotificacoes() {
  try {
    console.log("🚀 Iniciando notificações...");

    // 🇧🇷 Data no horário do Brasil
    const hoje = new Date();
    const dataHoje = hoje.toLocaleDateString("sv-SE", {
      timeZone: "America/Sao_Paulo"
    });

    console.log("📅 Data considerada:", dataHoje);

    // 🔍 Buscar agendamentos do dia
    const snapshot = await db
      .collection("bookings")
      .where("date", "==", dataHoje)
      .where("status", "==", "confirmado")
      .get();

    if (snapshot.empty) {
      console.log("✅ Nenhum agendamento hoje");
      return;
    }

    // 🔁 Percorrer agendamentos
    for (const doc of snapshot.docs) {
      const booking = doc.data();

      // Evita duplicidade
      if (booking.notificadoHoje) continue;

      // Buscar usuário
      const userDoc = await db.collection("users").doc(booking.userId).get();
      const token = userDoc.data()?.fcmToken;

      if (!token) {
        console.log(`⚠️ Usuário sem token: ${booking.userId}`);
        continue;
      }

      // 🔥 NOTIFICAÇÃO PROFISSIONAL
      const message = {
        token,

        notification: {
          title: "🐾 Mors Pet Realeza",
          body: `Hoje às ${booking.time}, ${booking.petName} tem ${booking.service}`
        },

        webpush: {
          headers: {
            Urgency: "high"
          },

          notification: {
            title: "🐾 Mors Pet Realeza",
            body: `Hoje às ${booking.time}, ${booking.petName} tem ${booking.service}`,

            icon: "/icons/icon-192.png",   // logo principal
            badge: "/icons/icon-96.png",   // ícone pequeno
            image: "/logo.jpg",            // banner grande (Android)

            requireInteraction: true,
            vibrate: [200, 100, 200],

            actions: [
              {
                action: "ver",
                title: "📅 Ver agendamento"
              },
              {
                action: "fechar",
                title: "Fechar"
              }
            ]
          },

          fcmOptions: {
            link: "https://morspetrealeza.vercel.app/#agendamento"
          }
        },

        data: {
          url: "https://morspetrealeza.vercel.app/#agendamento"
        }
      };

      // 📤 Enviar notificação
      await admin.messaging().send(message);

      // 📝 Marcar como enviado
      await db.collection("bookings").doc(doc.id).update({
        notificadoHoje: true
      });

      console.log(`✅ Notificação enviada para ${booking.userId}`);
    }

  } catch (err) {
    console.error("❌ Erro:", err);
    process.exit(1);
  }
}

// 🚀 Executar
enviarNotificacoes();
