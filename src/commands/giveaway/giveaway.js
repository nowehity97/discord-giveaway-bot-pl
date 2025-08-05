const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const db = require('../../utils/database');
const { createGiveawayMessage, endGiveaway, updateGiveawayMessage, selectWinners } = require('../../utils/giveawayLogic');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Zarządzaj konkursami na serwerze.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Rozpocznij nowy konkurs!')
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('Co jest nagrodą w konkursie?')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('Ilu zwycięzców ma być w konkursie?')
                        .setRequired(true)
                        .setMinValue(1))
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('Jak długo ma trwać konkurs? (np. 1h, 30m, 1d)')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Kanał, na którym ma zostać wysłany konkurs.')
                        .addChannelTypes(0, 5, 10, 11, 12)
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Zakończ aktywny konkurs.')
                .addStringOption(option =>
                    option.setName('giveaway_id')
                        .setDescription('ID konkursu do zakończenia (z stopki wiadomości).')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Wylosuj nowych zwycięzców dla zakończonego konkursu.')
                .addStringOption(option =>
                    option.setName('giveaway_id')
                        .setDescription('ID konkursu do ponownego losowania (z stopki wiadomości).')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('user_id_to_reroll')
                        .setDescription('ID zwycięzcy, którego chcesz wylosować na nowo.')
                        .setRequired(false))
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'start') {
            const prize = interaction.options.getString('prize');
            const winnersCount = interaction.options.getInteger('winners');
            const durationString = interaction.options.getString('duration');
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            const durationMs = parseDuration(durationString);
            if (isNaN(durationMs) || durationMs <= 0) {
                return interaction.reply({ content: 'Nieprawidłowy format czasu trwania. Użyj np. `1h`, `30m`, `1d`.', ephemeral: true });
            }

            const endTime = Date.now() + durationMs;
            const giveawayId = `g-${Date.now()}`;

            await interaction.deferReply({ ephemeral: false });

            const giveawayMessageOptions = await createGiveawayMessage({
                id: giveawayId,
                prize,
                endTime,
                winnersCount,
                hostId: interaction.user.id
            });

            try {
                const sentMessage = await channel.send(giveawayMessageOptions);

                db.run(
                    'INSERT INTO giveaways (id, channelId, messageId, endTime, prize, winnersCount, hostId, ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [giveawayId, channel.id, sentMessage.id, endTime, prize, winnersCount, interaction.user.id, 0],
                    function (err) {
                        if (err) {
                            console.error('Błąd zapisu giveawayu do DB:', err.message);
                            return interaction.editReply({ content: 'Wystąpił błąd podczas startowania konkursu (baza danych).', ephemeral: true });
                        }
                        interaction.editReply({ content: `Konkurs na **${prize}** został rozpoczęty na kanale ${channel}!`, ephemeral: true });

                        setTimeout(() => endGiveaway(interaction.client, giveawayId), durationMs);

                        interaction.client.giveawayIntervals[giveawayId] = setInterval(() => {
                            updateGiveawayMessage(interaction.client, giveawayId)
                                .catch(e => {
                                    console.error(`Błąd w setInterval dla giveawayu ${giveawayId}:`, e.message);
                                    if (e.message.includes('Giveaway not found') || e.message.includes('Wiadomość') || e.message.includes('Kanał')) {
                                        if (interaction.client.giveawayIntervals && interaction.client.giveawayIntervals[giveawayId]) {
                                            clearInterval(interaction.client.giveawayIntervals[giveawayId]);
                                            delete interaction.client.giveawayIntervals[giveawayId];
                                            console.log(`[CLEANUP] Wyczyszczono interwał dla nieaktywnego giveawayu ${giveawayId}.`);
                                        }
                                    }
                                });
                        }, 30000);
                    }
                );
            } catch (error) {
                console.error('Błąd wysyłania wiadomości giveawayu:', error);
                await interaction.editReply({ content: 'Wystąpił błąd podczas startowania konkursu (wysyłanie wiadomości).', ephemeral: true });
            }
        } else if (subcommand === 'end') {
            const giveawayId = interaction.options.getString('giveaway_id');

            db.get('SELECT ended FROM giveaways WHERE id = ?', [giveawayId], async (err, row) => {
                if (err) {
                    console.error('Błąd bazy danych podczas zakończenia:', err.message);
                    return interaction.reply({ content: 'Wystąpił błąd podczas próby zakończenia konkursu.', ephemeral: true });
                }
                if (!row) {
                    return interaction.reply({ content: 'Nie znaleziono konkursu o podanym ID.', ephemeral: true });
                }
                if (row.ended) {
                    return interaction.reply({ content: 'Ten konkurs jest już zakończony!', ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: true });
                try {
                    await endGiveaway(interaction.client, giveawayId);
                    await interaction.editReply({ content: 'Konkurs został pomyślnie zakończony.' });
                } catch (error) {
                    console.error('Błąd ręcznego kończenia konkursu:', error);
                    await interaction.editReply({ content: 'Wystąpił błąd podczas ręcznego kończenia konkursu.' });
                }
            });
        } else if (subcommand === 'reroll') {
            const giveawayId = interaction.options.getString('giveaway_id');
            const userIdToReroll = interaction.options.getString('user_id_to_reroll');

            db.get('SELECT * FROM giveaways WHERE id = ?', [giveawayId], async (err, giveaway) => {
                if (err) {
                    console.error('Błąd bazy danych podczas reroll:', err.message);
                    return interaction.reply({ content: 'Wystąpił błąd podczas próby ponownego losowania.', ephemeral: true });
                }
                if (!giveaway) {
                    return interaction.reply({ content: 'Nie znaleziono konkursu o podanym ID.', ephemeral: true });
                }
                if (!giveaway.ended) {
                    return interaction.reply({ content: 'Ten konkurs jeszcze się nie zakończył!', ephemeral: true });
                }

                db.all('SELECT userId FROM participants WHERE giveawayId = ?', [giveawayId], async (err, participantsRows) => {
                    if (err) {
                        console.error('Błąd bazy danych podczas pobierania uczestników do reroll:', err.message);
                        return interaction.reply({ content: 'Wystąpił błąd podczas próby ponownego losowania.', ephemeral: true });
                    }
                    const participants = participantsRows.map(row => row.userId);

                    db.all('SELECT userId FROM winners WHERE giveawayId = ?', [giveawayId], async (err, previousWinnersRows) => {
                        if (err) {
                            console.error('Błąd bazy danych podczas pobierania poprzednich zwycięzców:', err.message);
                            return interaction.reply({ content: 'Wystąpił błąd podczas próby ponownego losowania.', ephemeral: true });
                        }
                        const previousWinnersIds = [...new Set(previousWinnersRows.map(row => row.userId))];
                        
                        let winnersToReroll = 0;
                        let newWinners = [];

                        if (userIdToReroll) {
                            // Reroll dla konkretnej osoby
                            if (!previousWinnersIds.includes(userIdToReroll)) {
                                return interaction.reply({ content: `Użytkownik z ID **${userIdToReroll}** nie jest zwycięzcą w tym konkursie.`, ephemeral: true });
                            }

                            const eligibleParticipants = participants.filter(pId => pId !== userIdToReroll && !previousWinnersIds.includes(pId));

                            if (eligibleParticipants.length === 0) {
                                return interaction.reply({ content: 'Brak innych uprawnionych uczestników do wylosowania.', ephemeral: true });
                            }
                            
                            db.run('DELETE FROM winners WHERE giveawayId = ? AND userId = ?', [giveawayId, userIdToReroll], function(deleteErr) {
                                if (deleteErr) {
                                    console.error('Błąd usuwania starego zwycięzcy:', deleteErr.message);
                                }
                            });

                            winnersToReroll = 1;
                            newWinners = selectWinners(eligibleParticipants, winnersToReroll);

                        } else {
                            // Standardowy reroll dla wszystkich, którzy jeszcze nie wygrali
                            const eligibleParticipants = participants.filter(pId => !previousWinnersIds.includes(pId));

                            if (eligibleParticipants.length === 0) {
                                return interaction.reply({ content: 'Brak innych uczestników do ponownego wylosowania!', ephemeral: true });
                            }

                            winnersToReroll = giveaway.winnersCount;
                            if (eligibleParticipants.length < winnersToReroll) {
                                return interaction.reply({ content: `Brak wystarczającej liczby uprawnionych uczestników do ponownego losowania! Pozostało tylko ${eligibleParticipants.length} osób.`, ephemeral: true });
                            }

                            newWinners = selectWinners(eligibleParticipants, winnersToReroll);
                        }

                        if (newWinners.length > 0) {
                            const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
                            const message = channel ? await channel.messages.fetch(giveaway.messageId).catch(() => null) : null;

                            const stmt = db.prepare('INSERT INTO winners (giveawayId, userId) VALUES (?, ?)');
                            newWinners.forEach(winnerId => {
                                stmt.run(giveawayId, winnerId, (err) => {
                                    if (err) console.error(`Błąd zapisu nowego zwycięzcy ${winnerId} do DB:`, err);
                                });
                            });
                            stmt.finalize();

                            if (message && message.embeds.length > 0) {
                                const originalEmbed = message.embeds[0];
                                let newDescription = originalEmbed.description;
                                
                                if (userIdToReroll) {
                                    newDescription += `\n\n🔄 **PONOWNIE!** 🔄 Użytkownik <@${userIdToReroll}> został wylosowany na nowo.`;
                                }

                                newDescription += `\n\n🎉 **PONOWNE LOSOWANIE!** 🎉\nNowi zwycięzcy: ${newWinners.map(id => `<@${id}>`).join(', ')}\nGratulujemy!`;

                                const updatedEmbed = EmbedBuilder.from(originalEmbed)
                                    .setDescription(newDescription);

                                await message.edit({ embeds: [updatedEmbed] });
                                await interaction.reply({ content: `Pomyślnie wylosowano ${newWinners.length} nowych zwycięzców dla konkursu na **${giveaway.prize}**. Sprawdź wiadomość konkursową.`, ephemeral: true });
                            } else {
                                await interaction.reply({
                                    content: `🎉 **PONOWNE LOSOWANIE!** 🎉\n` +
                                        `Dla konkursu: **${giveaway.prize}**\n` +
                                        `Nowi zwycięzcy: ${newWinners.map(id => `<@${id}>`).join(', ')}\n` +
                                        `Gratulujemy!`,
                                    ephemeral: false
                                });
                            }
                        } else {
                            await interaction.reply({ content: 'Brak nowych zwycięzców do wylosowania z pozostałych uczestników.', ephemeral: true });
                        }
                    });
                });
            });
        }
    },
};

function parseDuration(durationString) {
    const units = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    const match = durationString.match(/^(\d+)([smhd])$/i);
    if (!match) return NaN;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (isNaN(value) || value <= 0 || !units[unit]) return NaN;

    return value * units[unit];
}