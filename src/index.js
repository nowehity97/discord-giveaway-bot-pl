const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./utils/database');
const { endGiveaway, updateGiveawayMessage } = require('./utils/giveawayLogic');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

client.commands = new Collection();
client.giveawayIntervals = {};

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] Komenda w ${filePath} brakuje "data" lub "execute".`);
        }
    }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Inicjalizacja bazy danych
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS giveaways (
        id TEXT PRIMARY KEY,
        channelId TEXT,
        messageId TEXT,
        endTime INTEGER,
        prize TEXT,
        winnersCount INTEGER,
        hostId TEXT,
        ended INTEGER DEFAULT 0,
        description TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS participants (
        giveawayId TEXT,
        userId TEXT,
        PRIMARY KEY (giveawayId, userId),
        FOREIGN KEY (giveawayId) REFERENCES giveaways(id) ON DELETE CASCADE
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS winners (
        giveawayId TEXT,
        userId TEXT,
        PRIMARY KEY (giveawayId, userId),
        FOREIGN KEY (giveawayId) REFERENCES giveaways(id) ON DELETE CASCADE
    )`);

    console.log('Połączono z bazą danych SQLite. Tabele są gotowe.');
    
    // Wznawianie aktywnych konkursów po starcie bota
    db.all('SELECT * FROM giveaways WHERE ended = 0 AND endTime > ?', [Date.now()], (err, rows) => {
        if (err) {
            console.error('Błąd pobierania aktywnych konkursów przy starcie:', err.message);
            return;
        }

        rows.forEach(giveaway => {
            const timeLeft = giveaway.endTime - Date.now();
            if (timeLeft > 0) {
                console.log(`Wznawiam konkurs ${giveaway.id}. Zakończy się za ${Math.floor(timeLeft / 1000)}s.`);
                setTimeout(() => endGiveaway(client, giveaway.id), timeLeft);
                
                client.giveawayIntervals[giveaway.id] = setInterval(() => {
                    updateGiveawayMessage(client, giveaway.id).catch(e => {
                        console.error(`Błąd w setInterval dla wznowionego giveawayu ${giveaway.id}:`, e.message);
                    });
                }, 30000); // Aktualizacja co 30 sekund
            } else {
                console.log(`Konkurs ${giveaway.id} powinien być zakończony. Uruchamiam funkcję endGiveaway.`);
                endGiveaway(client, giveaway.id);
            }
        });
    });
});
// Uruchomienie serwera WWW po zalogowaniu bota
client.once(Events.ClientReady, c => {
    console.log(`Bot gotowy! Zalogowano jako ${c.user.tag}`);
    try {
        const webserver = require('../webserver');
        webserver(client); // Przekazanie klienta do serwera WWW
    } catch (e) {
        console.error('Błąd ładowania serwera WWW:', e.message);
    }
});
client.login(process.env.TOKEN);
