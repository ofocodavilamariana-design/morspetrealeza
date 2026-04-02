// =====================================================
//  MORS PET REALEZA — Firebase Cloud Functions
//  Sistema de notificações de agendamento
//  Versão: 1.0.0
// =====================================================

const functions = require('firebase-functions');
const admin     = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// =====================================================
//  FUNÇÃO PRINCIPAL: Lembrete diário às 08:00 (SP)
//  Roda todo dia e notifica agendamentos do MESMO DIA
// =====================================================
exports.lembrarAgendamentos = functions
  .region('us-central1')
  .pubsub
  .schedule('0 8 * * *')         // todo dia às 08:00
  .timeZone('America/Sao_Paulo')
  .onRun(async (context) => {

    // Calcula o intervalo do DIA ATUAL (não amanhã)
    const hoje  = new Date();

    const yyyy = hoje.getFullYear();
    const mm   = String(hoje.getMonth() + 1).padStart(2, '0');
    const dd   = String(hoje.getDate()).padStart(2, '0');
    const dataHoje = `${yyyy}-${mm}-${dd}`;   // formato "YYYY-MM-DD"

    console.log(`[Lembretes] Buscando agendamentos para: ${dataHoje}`);

    // Busca agendamentos confirmados do dia atual
    const snapshot = await db.collection('bookings')
      .where('date',   '==', dataHoje)
      .where('status', '==', 'confirmado')
      .get();

    if (snapshot.empty) {
      console.log('[Lembretes] Nenhum agendamento para hoje.');
      return null;
    }

    console.log(`[Lembretes] ${snapshot.size} agendamento(s) encontrado(s).`);

    const resultados = { enviadas: 0, falhas: 0, semToken: 0 };

    const promises = snapshot.docs.map(async (docSnap) => {
      const booking = docSnap.data();
      const { userId, petName, time, service, petType, clientName } = booking;

      if (!userId) { resultados.semToken++; return; }

      // Busca o token FCM do usuário
      let fcmToken = null;
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) { resultados.semToken++; return; }
        fcmToken = userDoc.data()?.fcmToken;
      } catch (e) {
        console.error(`[Lembretes] Erro ao buscar user ${userId}:`, e.message);
        resultados.falhas++;
        return;
      }

      if (!fcmToken) { resultados.semToken++; return; }

      // Emoji do pet
      const petEmoji = petType === 'Cachorro' ? '🐶' : petType === 'Gato' ? '🐱' : '🐾';

      // Monta a mensagem
      const message = {
        token: fcmToken,
        notification: {
          title: `${petEmoji} Lembrete — Mors Pet Realeza`,
          body:  `Olá${clientName ? ', ' + clientName.split(' ')[0] : ''}! Hoje às ${time} é o horário de ${petName} para ${service}. Te esperamos! 🐾`
        },
        webpush: {
          notification: {
            icon:               'https://morspetrealeza.vercel.app/icons/icon-192.png',
            badge:              'https://morspetrealeza.vercel.app/icons/icon-96.png',
            requireInteraction: true,
            vibrate:            [200, 100, 200],
            tag:                `agendamento-${docSnap.id}`,
            actions: [
              { action: 'ver',    title: '📅 Ver agendamento' },
              { action: 'fechar', title: 'Fechar'             }
            ]
          },
          fcmOptions: {
            link: 'https://morspetrealeza.vercel.app/#agendamento'
          }
        },
        // Dados extras para o SW tratar (payload.data)
        data: {
          bookingId: docSnap.id,
          petName:   petName   || '',
          time:      time      || '',
          service:   service   || ''
        }
      };

      try {
        const response = await admin.messaging().send(message);
        console.log(`[Lembretes] ✅ Enviado para ${userId} | msgId: ${response}`);
        resultados.enviadas++;
      } catch (err) {
        if (
          err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token'
        ) {
          // Token expirado — limpa do Firestore
          console.warn(`[Lembretes] Token inválido para ${userId}. Removendo...`);
          await db.collection('users').doc(userId).update({ fcmToken: null });
        } else {
          console.error(`[Lembretes] ❌ Erro ao enviar para ${userId}:`, err.message);
        }
        resultados.falhas++;
      }
    });

    await Promise.all(promises);

    console.log(`[Lembretes] Resultado final:`, resultados);
    return null;
  });

// =====================================================
//  FUNÇÃO AUXILIAR: Testar envio manualmente (HTTP)
//  Acesse via: Firebase Console > Functions > Testar
//  Ou via curl após deploy
// =====================================================
exports.testarNotificacao = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Só admins podem testar
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Autenticação necessária.');
    }

    const { userId } = data;
    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'userId é obrigatório.');
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || !userDoc.data()?.fcmToken) {
      throw new functions.https.HttpsError('not-found', 'Token FCM não encontrado para este usuário.');
    }

    const message = {
      token: userDoc.data().fcmToken,
      notification: {
        title: '🐶 Teste — Mors Pet Realeza',
        body:  'As notificações estão funcionando perfeitamente! ✅'
      },
      webpush: {
        notification: {
          icon:               'https://morspetrealeza.vercel.app/icons/icon-192.png',
          requireInteraction: false
        }
      }
    };

    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  });
