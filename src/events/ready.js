const db = require('../utils/database'); // Upewnij się, że masz to zaimportowane
const { updateGiveawayMessage, endGiveaway } = require('../utils/giveawayLogic'); // I to

module.exports = {
    name: 'ready',
    once: true,
    execute(client) { // Odbieramy obiekt client jako argument
        console.log(`Bot gotowy! Zalogowano jako ${client.user.tag}`);

        // Logika odzyskiwania aktywnych giveawayów po restarcie bota
        db.all('SELECT * FROM giveaways WHERE ended = 0', [], (err, rows) => {
            if (err) {
                console.error('Błąd podczas pobierania niezakończonych giveawayów po restarcie:', err.message);
                return;
            }
            rows.forEach(giveaway => {
                const remainingTime = giveaway.endTime - Date.now();
                if (remainingTime <= 0) {
                    // Konkurs już się zakończył, zakończ go od razu
                    console.log(`[RECOVERY] Zakończenie zaległego giveawayu: ${giveaway.id}`);
                    endGiveaway(client, giveaway.id);
                } else {
                    // Ustaw timer na przyszłe zakończenie
                    console.log(`[RECOVERY] Ustawiam timer na ${remainingTime / 1000}s dla giveawayu: ${giveaway.id}`);
                    setTimeout(() => endGiveaway(client, giveaway.id), remainingTime);
                }

                // Ustaw interwał do aktualizacji licznika na przycisku
                console.log(`[RECOVERY] Ustawiam interwał aktualizacji dla giveawayu ${giveaway.id}.`);
                // --- KLUCZOWA POPRAWKA TUTAJ: Użycie globalnego setInterval i przypisanie do client.giveawayIntervals ---
                client.giveawayIntervals[giveaway.id] = setInterval(() => {
                    updateGiveawayMessage(client, giveaway.id)
                        .catch(e => {
                            console.error(`[RECOVERY-ERROR] Błąd w setInterval dla giveawayu ${giveaway.id} po restarcie:`, e.message);
                            // Dodatkowo czyszczenie interwału, jeśli wiadomość/giveaway nie istnieje
                            if (e.message.includes('Giveaway not found') || e.message.includes('Wiadomość') || e.message.includes('Kanał')) {
                                if (client.giveawayIntervals && client.giveawayIntervals[giveaway.id]) {
                                    clearInterval(client.giveawayIntervals[giveaway.id]);
                                    delete client.giveawayIntervals[giveaway.id];
                                    console.log(`[RECOVERY-CLEANUP] Wyczyszczono interwał dla nieaktywnego giveawayu ${giveaway.id} po błędzie.`);
                                }
                            }
                        });
                }, 30000); // Co 30 sekund
                // -----------------------------------------------------------------------------------------
            });
        });
    },
};