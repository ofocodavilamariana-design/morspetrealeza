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
    const dataHoje = hoje.toISOString().split("T")[0];

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

      if (!token) continue;

      const message = {
        token,
        notification: {
          title: "🐾 Lembrete",
          body: `Hoje às ${booking.time}, ${booking.petName} tem ${booking.service}`
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