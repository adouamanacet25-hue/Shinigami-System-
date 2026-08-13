const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode-terminal');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

// === CONFIGURATION ===
const BOT_NAME = 'SHINIGAMI_BOT_TECH';
const PREFIX_COMMANDS = ['/', '!']; // les deux préfixes

// === STORE ===
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent' }) });

// === AUTH ===
const authFolder = './auth_info_baileys';
if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder);

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    const sock = makeWASocket({
      logger: pino({ level: 'silent' }),
      auth: state,
      printQRInTerminal: false,
      browser: ['SHINIGAMI Bot', 'Chrome', '1.0'],
    });

    store.bind(sock.ev);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        QRCode.generate(qr, { small: true });
        console.log('🔐 Scanne ce QR avec WhatsApp.');
      }
      if (connection === 'open') {
        console.log('✅ Bot connecté !');
      }
      if (connection === 'close') {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          console.log('❌ Déconnecté. Supprime le dossier auth et relance.');
        } else {
          console.log('🔄 Reconnexion...');
          startBot();
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // === GESTION DES MESSAGES (TOUS LES NUMÉROS SONT ACCEPTÉS) ===
    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg?.message) return;
      if (msg.key.fromMe) return; // Ignore seulement ses propres messages

      const from = msg.key.remoteJid;
      const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
      if (!body) return;

      let prefix = null;
      let command = '';
      let args = [];
      for (const p of PREFIX_COMMANDS) {
        if (body.startsWith(p)) {
          prefix = p;
          const parts = body.slice(p.length).trim().split(/\s+/);
          command = parts[0].toLowerCase();
          args = parts.slice(1);
          break;
        }
      }
      if (!prefix) return;

      const senderName = msg.pushName || 'Utilisateur';
      console.log(`📩 Commande reçue : ${prefix}${command} de ${senderName}`);

      try {
        switch (command) {
          case 'ping':
            await sock.sendMessage(from, { text: '🏓 Pong !' });
            break;
          case 'hello':
            await sock.sendMessage(from, { text: `👋 Bonjour ${senderName} !` });
            break;
          case 'about':
            await sock.sendMessage(from, {
              text: `🤖 *${BOT_NAME}*\nVersion : v1.0\nBot public – accessible à tous.`
            });
            break;
          case 'help':
            await sock.sendMessage(from, {
              text: `📜 *Commandes disponibles* :\n/ping, /hello, /about, /creator, /channel\nEt bien d'autres à ajouter !`
            });
            break;
          case 'creator':
            await sock.sendMessage(from, { text: '👤 Ce bot est open source et public.' });
            break;
          case 'channel':
            await sock.sendMessage(from, {
              text: '📢 Suis la chaîne KIRA_TECH : https://whatsapp.com/channel/0029Vb7WJzp84OmBD0fEEJ2X'
            });
            break;
          default:
            await sock.sendMessage(from, { text: `❓ Commande inconnue. Tape /help pour la liste.` });
        }
      } catch (err) {
        console.error('Erreur commande:', err);
        await sock.sendMessage(from, { text: '⚠️ Erreur lors de l\'exécution.' });
      }
    });

  } catch (error) {
    console.error('Erreur fatale :', error);
  }
}

startBot().catch(err => console.error('Erreur démarrage:', err));
