const sqlite3 = require('sqlite3').verbose();
const path = require('node:path');

// Ścieżka do pliku bazy danych. Baza danych będzie w głównym folderze projektu.
// __dirname to src/utils, więc ../../ przeniesie nas do głównego folderu projektu.
const dbPath = path.resolve(__dirname, '../giveaway.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Błąd połączenia z bazą danych:', err.message);
    } else {
        console.log('Połączono z bazą danych SQLite.');
        // Tworzenie tabeli 'giveaways' jeśli nie istnieje
        db.run(`CREATE TABLE IF NOT EXISTS giveaways (
            id TEXT PRIMARY KEY,       -- Unikalne ID konkursu (np. g-timestamp)
            channelId TEXT NOT NULL,   -- ID kanału, na którym ogłoszono konkurs
            messageId TEXT NOT NULL,   -- ID wiadomości konkursowej
            endTime INTEGER NOT NULL,  -- Czas zakończenia konkursu (timestamp)
            prize TEXT NOT NULL,       -- Nazwa nagrody
            winnersCount INTEGER NOT NULL, -- Liczba zwycięzców
            ended BOOLEAN DEFAULT 0,   -- Czy konkurs został zakończony (0=nie, 1=tak)
            hostId TEXT NOT NULL       -- ID użytkownika, który rozpoczął konkurs
        )`);
        // Tworzenie tabeli 'participants' jeśli nie istnieje
        db.run(`CREATE TABLE IF NOT EXISTS participants (
            giveawayId TEXT,           -- ID konkursu, do którego należy uczestnik
            userId TEXT,               -- ID uczestnika
            PRIMARY KEY (giveawayId, userId), -- Klucz złożony dla unikalności uczestnika w danym konkursie
            FOREIGN KEY (giveawayId) REFERENCES giveaways(id) ON DELETE CASCADE -- Usuń uczestników, jeśli giveaway zostanie usunięty
        )`);
    }
});

module.exports = db;