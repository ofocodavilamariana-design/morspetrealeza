# 🐾 Mors Pet Realeza — Guia de Configuração Completo
## PWA + Notificações Push + Cloud Functions

---

## 📁 Estrutura de arquivos que você vai ter no projeto

```
/ (raiz do projeto – mesma pasta do index.html)
├── index.html                  ← Arquivo principal (já atualizado)
├── firebase-messaging-sw.js    ← Service Worker do Firebase (NOVO)
├── manifest.json               ← Manifesto PWA (NOVO)
├── firebase.json               ← Config Firebase Hosting (NOVO)
├── logo.jpg                    ← Já existe
├── hero.mp4                    ← Já existe
├── cachorro.webm               ← Já existe
├── gatinho.webm                ← Já existe
├── icons/                      ← Pasta de ícones (CRIAR)
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png            ← Mais importante
│   └── icon-512.png            ← Mais importante
└── functions/                  ← Cloud Functions (NOVO)
    ├── index.js
    └── package.json
```

---

## 🖼️ PASSO 1 — Criar os ícones do app

Os ícones são a foto do app na tela do celular. Você precisa de PNG quadrado.

### Opção fácil (online gratuito):
1. Acesse: **https://realfavicongenerator.net**
2. Faça upload do seu `logo.jpg`
3. Clique em **"Generate your Favicons and HTML code"**
4. Baixe o pacote e renomeie os arquivos para:
   - `android-chrome-192x192.png` → `icons/icon-192.png`
   - `android-chrome-512x512.png` → `icons/icon-512.png`
5. Para os outros tamanhos, use: **https://www.pwabuilder.com/imageGenerator**

### OU opção ainda mais fácil:
Crie a pasta `icons/` e coloque só esses 2 arquivos:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

O sistema funciona só com esses dois. Os outros são opcionais.

---

## 🔥 PASSO 2 — Ativar o Firebase Blaze (necessário para Cloud Functions)

> ⚠️ Cloud Functions **exige o plano Blaze** (pay-as-you-go).
> Para o volume do Mors Pet, o custo será **R$ 0** — você só paga se ultrapassar os limites gratuitos (2 milhões de chamadas/mês). Basta ter um cartão cadastrado.

1. Acesse: **https://console.firebase.google.com**
2. Selecione o projeto **mors-pet**
3. Clique em **"Faça upgrade"** (canto inferior esquerdo)
4. Selecione plano **Blaze**
5. Adicione um cartão de crédito (não será cobrado)
6. Confirme

---

## 🔔 PASSO 3 — Gerar e configurar a VAPID Key (já está feito)

Sua VAPID Key já está configurada no código:
```
BLx0_thxxUqQWk8lSL2ig925MIQVT-Kc-JA__kHCebOdMz7BjXDvtDJB2a4Kp57tRyi_xeYpvvKfQ-9DacirEiY
```

Se precisar verificar ou gerar uma nova:
1. Firebase Console → Configurações do Projeto (ícone de engrenagem)
2. Aba **"Cloud Messaging"**
3. Seção **"Configuração da Web"** → **"Certificados de push da Web"**
4. Copie a chave pública (VAPID Key)

---

## 🗄️ PASSO 4 — Criar a coleção "users" no Firestore

O sistema salva o token FCM de cada usuário para enviar notificações.

1. Firebase Console → **Firestore Database**
2. Clique em **"Iniciar coleção"**
3. Nome: `users`
4. ID do documento: qualquer UID (será criado automaticamente pelo sistema)

**Estrutura que o sistema cria automaticamente:**
```
users/{userId}
  ├── fcmToken: "token_do_dispositivo"
  ├── tokenUpdatedAt: Timestamp
  └── email: "email@usuario.com"
```

> Não precisa criar manualmente — o sistema cria automaticamente quando o usuário ativa as notificações.

---

## ⚙️ PASSO 5 — Regras do Firestore

Adicione essa regra para que o sistema possa salvar tokens:

1. Firebase Console → **Firestore Database** → **Regras**
2. Substitua pelo código abaixo:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Agendamentos: usuário autenticado pode criar e ler os próprios
    match /bookings/{bookingId} {
      allow read, write: if request.auth != null;
    }

    // Settings: qualquer um pode ler, apenas regras do servidor escrevem
    match /settings/{doc} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    // Users: cada usuário só acessa o próprio documento
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Clique em **Publicar**

---

## 💻 PASSO 6 — Instalar o Firebase CLI e fazer deploy

Abra o terminal na pasta do projeto e execute:

```bash
# Instalar Firebase CLI (apenas uma vez)
npm install -g firebase-tools

# Fazer login
firebase login

# Entrar no projeto (selecione "mors-pet" na lista)
firebase use mors-pet

# Instalar dependências das Functions
cd functions
npm install
cd ..

# Fazer deploy de tudo
firebase deploy
```

> Se usar Vercel, só as Functions precisam do Firebase CLI.
> O `index.html`, `manifest.json` e `firebase-messaging-sw.js` são arquivos estáticos — basta subir junto com os outros arquivos no Vercel normalmente.

---

## 🚀 PASSO 7 — Deploy no Vercel (seu hospedagem atual)

Como seu site está no Vercel:

1. Adicione todos os arquivos novos ao seu repositório Git:
   - `firebase-messaging-sw.js` (raiz)
   - `manifest.json` (raiz)
   - `icons/` (pasta com os ícones)
   - `functions/` (pasta — para o Firebase, não vai pro Vercel)

2. Faça push para o GitHub:
```bash
git add .
git commit -m "feat: PWA + push notifications"
git push
```

3. O Vercel faz deploy automático ✅

4. Para as **Cloud Functions**, use o Firebase CLI separadamente:
```bash
firebase deploy --only functions
```

---

## ✅ PASSO 8 — Verificar se está tudo funcionando

### Testar o PWA:
1. Abra o site no Chrome
2. Pressione F12 → aba **"Application"**
3. Em **"Manifest"**: deve aparecer o manifesto sem erros
4. Em **"Service Workers"**: deve aparecer `firebase-messaging-sw.js` como "Activated"

### Testar as notificações:
1. Abra o site, aguarde 3 segundos (modal PWA aparece)
2. Clique em "Instalar agora" ou "Agora não"
3. O modal de notificações aparece
4. Clique em "Ativar lembretes"
5. Aceite a permissão do navegador
6. No Firestore, verifique se apareceu um documento em `users/{seu_uid}` com o campo `fcmToken`

### Testar a Cloud Function:
```bash
# Ver logs em tempo real após deploy
firebase functions:log --follow
```

---

## 📋 PASSO 9 — Verificar a Cloud Function no Console

1. Firebase Console → **Functions**
2. Você verá `lembrarAgendamentos` agendada para rodar todo dia às 08:00
3. Para testar manualmente (sem esperar até amanhã):
   - Clique nos **3 pontinhos** ao lado da função
   - Selecione **"Executar agora"**
   - Verifique os logs

---

## 🔧 Configurações adicionais opcionais

### Se quiser que a notificação chegue no dia DO agendamento (não véspera):
No arquivo `functions/index.js`, mude linha 37:
```javascript
// De: amanha.setDate(hoje.getDate() + 1);
// Para: (não altere nada — mantém amanhã)

// Ou para notificar NO MESMO DIA, não altere a linha e mude o schedule:
// '0 8 * * *'  →  continua rodando às 8h, mas busca agendamentos do DIA:
// const dataAlvo = `${hoje.getFullYear()}-${...}-${...}`;  // hoje em vez de amanhã
```

### Se quiser também enviar no mesmo dia às 7h como segundo lembrete:
Adicione outra função no `functions/index.js` duplicando a primeira com horário diferente.

---

## ❓ Problemas comuns

| Problema | Solução |
|---|---|
| Modal PWA não aparece | Certifique-se que o site está em HTTPS |
| "beforeinstallprompt" não dispara | O Chrome só mostra se o PWA atender aos critérios (manifesto válido + SW registrado) |
| Notificação não chega | Verifique se o `fcmToken` foi salvo no Firestore para o usuário |
| Cloud Function não executa | Verifique se o plano está no Blaze e se o deploy foi feito |
| Erro "token not registered" | O token expirou — o sistema limpa automaticamente e o usuário precisará reautorizar |
| iOS não instala | No Safari, o usuário deve ir em Compartilhar → Adicionar à Tela de Início |

---

## 📱 Nota sobre iOS (iPhone)

- **Safari no iOS 16.4+**: suporta notificações push para PWAs instaladas
- **Safari no iOS < 16.4**: não suporta notificações, mas o app pode ser instalado normalmente
- O modal de instalação no iOS não usa `beforeinstallprompt` — o usuário vê um toast informando para usar o menu Compartilhar

---

*Guia criado para Mors Pet Realeza — morspetrealeza.vercel.app*
