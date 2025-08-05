const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const db = require('./database');

/**
 * Tworzy i zwraca wiadomość embed dla aktywnego konkursu.
 * @param {object} giveaway - Obiekt z danymi konkursu.
 * @returns {object} Opcje wiadomości do wysłania.
 */
async function createGiveawayMessage(giveaway) {
    const embed = new EmbedBuilder()
        .setTitle(`🎉 Konkurs: ${giveaway.prize}`)
        .setDescription(
            `**Czas do końca:** <t:${Math.floor(giveaway.endTime / 1000)}:R>\n` +
            `**Organizator:** <@${giveaway.hostId}>\n` +
            `**Ilość zwycięzców:** ${giveaway.winnersCount}\n\n` +
            `Kliknij przycisk poniżej, aby wziąć udział!`
        )
        .setColor('#57F287') // Zielony kolor
        .setTimestamp()
        .setFooter({ text: `ID: ${giveaway.id}` });

    const joinButton = new ButtonBuilder()
        .setCustomId(`giveaway_join_${giveaway.id}`)
        .setLabel(`Weź udział (0)`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎉');

    const row = new ActionRowBuilder().addComponents(joinButton);

    return { embeds: [embed], components: [row], fetchReply: true };
}

/**
 * Aktualizuje wiadomość konkursu z liczbą uczestników i czasem.
 * @param {import('discord.js').Client} client - Klient bota Discord.
 * @param {string} giveawayId - ID konkursu.
 * @returns {Promise<void>}
 */
async function updateGiveawayMessage(client, giveawayId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM giveaways WHERE id = ?', [giveawayId], async (err, giveaway) => {
            if (err) {
                console.error(`[UPDATE-ERROR] Błąd pobierania giveawayu ${giveawayId} do aktualizacji:`, err.message);
                return reject(err);
            }
            if (!giveaway || giveaway.ended) {
                if (giveaway && giveaway.ended && client.giveawayIntervals && client.giveawayIntervals[giveawayId]) {
                    clearInterval(client.giveawayIntervals[giveawayId]);
                    delete client.giveawayIntervals[giveawayId];
                }
                console.warn(`[UPDATE-WARN] Giveaway ${giveawayId} nie znaleziony w DB, zakończony lub usunięty.`);
                return resolve();
            }

            try {
                const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
                if (!channel) return resolve();
                
                const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                if (!message || message.embeds.length === 0) return resolve();

                db.all('SELECT userId FROM participants WHERE giveawayId = ?', [giveawayId], async (err, participantsRows) => {
                    if (err) {
                        console.error(`[UPDATE-ERROR] Błąd pobierania uczestników dla giveawayu ${giveawayId}:`, err.message);
                        return reject(err);
                    }
                    const participants = participantsRows.map(row => row.userId);
                    const embed = message.embeds[0];

                    const newEmbed = EmbedBuilder.from(embed)
                        .setDescription(
                            `**Czas do końca:** <t:${Math.floor(giveaway.endTime / 1000)}:R>\n` +
                            `**Organizator:** <@${giveaway.hostId}>\n` +
                            `**Ilość zwycięzców:** ${giveaway.winnersCount}\n\n` +
                            `Kliknij przycisk poniżej, aby wziąć udział!`
                        );

                    const joinButton = new ButtonBuilder()
                        .setCustomId(`giveaway_join_${giveaway.id}`)
                        .setLabel(`Weź udział (${participants.length})`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎉');

                    const row = new ActionRowBuilder().addComponents(joinButton);

                    await message.edit({ embeds: [newEmbed], components: [row] });
                    resolve();
                });
            } catch (error) {
                console.error(`[UPDATE-ERROR] Błąd aktualizacji wiadomości giveawayu ${giveaway.id}:`, error);
                reject(error);
            }
        });
    });
}

/**
 * Kończy konkurs i ogłasza zwycięzców.
 * @param {import('discord.js').Client} client - Klient bota Discord.
 * @param {string} giveawayId - ID konkursu.
 * @returns {Promise<void>}
 */
async function endGiveaway(client, giveawayId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM giveaways WHERE id = ?', [giveawayId], async (err, giveaway) => {
            if (err) { console.error('[END-ERROR] Błąd pobierania giveawayu:', err); return reject(err); }
            if (!giveaway || giveaway.ended) { 
                console.warn('[END-WARN] Giveaway END does not exist or is already ended!', giveawayId);
                return resolve(); 
            }

            if (client.giveawayIntervals && client.giveawayIntervals[giveawayId]) {
                clearInterval(client.giveawayIntervals[giveawayId]);
                delete client.giveawayIntervals[giveawayId];
                console.log(`[END-CLEANUP] Wyczyszczono interwał dla giveawayu ${giveawayId}.`);
            }

            db.all('SELECT userId FROM participants WHERE giveawayId = ?', [giveawayId], async (err, participantsRows) => {
                if (err) { console.error('[END-ERROR] Błąd pobierania uczestników:', err); return reject(err); }
                const participants = participantsRows.map(row => row.userId);
                const winners = selectWinners(participants, giveaway.winnersCount);

                const channel = await client.channels.fetch(giveaway.channelId).catch(console.error);
                if (!channel) {
                    db.run('UPDATE giveaways SET ended = 1 WHERE id = ?', [giveawayId]);
                    return resolve();
                }

                try {
                    const message = await channel.messages.fetch(giveaway.messageId).catch(console.error);
                    if (!message) {
                        db.run('UPDATE giveaways SET ended = 1 WHERE id = ?', [giveawayId]);
                        return resolve();
                    }

                    const embed = message.embeds[0] || new EmbedBuilder();
                    
                    let description;
                    if (winners.length > 0) {
                        description = `🎉 Gratulacje dla **${winners.length}** zwycięzców, którzy wygrali **${giveaway.prize}**!\n\n` +
                                      `**Zwycięzcy:** ${winners.map(id => `<@${id}>`).join(', ')}`;
                        
                        // Zapisz zwycięzców w bazie danych
                        const stmt = db.prepare('INSERT INTO winners (giveawayId, userId) VALUES (?, ?)');
                        winners.forEach(winnerId => {
                            stmt.run(giveawayId, winnerId, (err) => {
                                if (err) console.error(`Błąd zapisu zwycięzcy ${winnerId} do DB:`, err);
                            });
                        });
                        stmt.finalize();

                    } else {
                        description = `Niestety, nikt nie wziął udziału w konkursie na **${giveaway.prize}**.`;
                    }

                    const newEmbed = EmbedBuilder.from(embed)
                        .setTitle(`ZAKOŃCZONO: ${giveaway.prize}`)
                        .setDescription(description)
                        .setColor('#FEE75C'); // Żółty kolor
                    
                    if (winners.length > 0) {
                        newEmbed.addFields({ name: 'Liczba uczestników', value: `${participants.length}`, inline: true });
                    }
                    
                    const endedButton = new ButtonBuilder()
                        .setCustomId('giveaway_ended')
                        .setLabel('Zakończono')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true);

                    const row = new ActionRowBuilder().addComponents(endedButton);

                    await message.edit({ embeds: [newEmbed], components: [row] });

                    db.run('UPDATE giveaways SET ended = 1 WHERE id = ?', [giveawayId], (err) => {
                        if (err) console.error('[END-ERROR] Błąd oznaczania giveawayu jako zakończony w DB:', err);
                        resolve();
                    });

                } catch (error) {
                    console.error(`[END-FINAL-ERROR] Błąd podczas kończenia giveawayu ${giveaway.id}:`, error);
                    reject(error);
                }
            });
        });
    });
}

/**
 * Losuje zwycięzców z tablicy uczestników.
 * @param {string[]} participants - Lista ID uczestników.
 * @param {number} count - Liczba zwycięzców do wylosowania.
 * @returns {string[]} Lista ID wylosowanych zwycięzców.
 */
function selectWinners(participants, count) {
    if (participants.length === 0) return [];
    const shuffled = [...participants].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

module.exports = {
    createGiveawayMessage,
    updateGiveawayMessage,
    endGiveaway,
    selectWinners
};