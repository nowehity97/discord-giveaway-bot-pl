const express = require('express');
const path = require('path');
const db = require('./src/utils/database'); // Importuj swoją bazę danych

const app = express();
const port = 3000;

// Udostępnij pliki statyczne (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Funkcja, która przyjmuje klienta Discorda
module.exports = (discordClient) => {
    // API endpoint do pobierania danych o konkursach
    app.get('/api/giveaways', async (req, res) => {
        try {
            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT g.*, COUNT(p.userId) AS participantsCount FROM giveaways g LEFT JOIN participants p ON g.id = p.giveawayId GROUP BY g.id ORDER BY g.endTime DESC', (err, rows) => {
                    if (err) reject(err);
                    resolve(rows);
                });
            });

            const giveawaysWithHostNames = await Promise.all(rows.map(async (giveaway) => {
                let hostName = 'Nieznany';
                try {
                    const user = await discordClient.users.fetch(giveaway.hostId);
                    hostName = user.username;
                } catch (e) {
                    console.error(`Nie można pobrać użytkownika dla ID ${giveaway.hostId}: ${e.message}`);
                }
                return { ...giveaway, hostName };
            }));

            res.json(giveawaysWithHostNames);
        } catch (err) {
            console.error('Błąd pobierania danych z bazy:', err.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    app.listen(port, () => {
        console.log(`Serwer WWW działa na http://localhost:${port}`);
    });
};
