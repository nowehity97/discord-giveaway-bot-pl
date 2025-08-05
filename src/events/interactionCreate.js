const { Events, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/database');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`Nie znaleziono komendy ${interaction.commandName}.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Błąd podczas wykonywania komendy ${interaction.commandName}:`, error);
                const replyOptions = {
                    content: 'Wystąpił błąd podczas wykonywania tej komendy!',
                    flags: MessageFlags.Ephemeral
                };
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(replyOptions).catch(e => console.error('Błąd wysyłania followUp:', e));
                } else {
                    await interaction.reply(replyOptions).catch(e => console.error('Błąd wysyłania odpowiedzi:', e));
                }
            }
        } else if (interaction.isButton()) {
            const [action, giveawayId] = interaction.customId.split('_').slice(1);

            if (action === 'join') {
                await interaction.deferReply({ ephemeral: true });

                db.get('SELECT * FROM giveaways WHERE id = ?', [giveawayId], (err, giveaway) => {
                    if (err) {
                        console.error('Błąd bazy danych przy dołączaniu:', err.message);
                        return interaction.editReply({ content: 'Wystąpił błąd podczas dołączania do konkursu.' });
                    }
                    if (!giveaway) {
                        return interaction.editReply({ content: 'Ten konkurs już nie istnieje!' });
                    }
                    if (giveaway.ended) {
                        return interaction.editReply({ content: 'Ten konkurs już się zakończył!' });
                    }
                    
                    db.run('INSERT OR IGNORE INTO participants (giveawayId, userId) VALUES (?, ?)', [giveawayId, interaction.user.id], function (err) {
                        if (err) {
                            console.error('Błąd zapisu uczestnika do DB:', err.message);
                            return interaction.editReply({ content: 'Wystąpił błąd podczas dołączania do konkursu.' });
                        }
                        if (this.changes === 0) {
                            return interaction.editReply({ content: 'Już dołączyłeś/aś do tego konkursu!' });
                        }
                        
                        // Po pomyślnym dołączeniu, pobierz i zaktualizuj licznik
                        db.all('SELECT userId FROM participants WHERE giveawayId = ?', [giveawayId], async (err, participantsRows) => {
                            if (err) {
                                console.error('Błąd pobierania uczestników po dołączeniu:', err.message);
                                return interaction.editReply({ content: 'Pomyślnie dołączyłeś/aś, ale wystąpił błąd podczas aktualizacji licznika.' });
                            }

                            const participantsCount = participantsRows.length;
                            
                            try {
                                const originalMessage = interaction.message;
                                const existingButton = originalMessage.components[0].components[0];

                                const updatedButton = new ButtonBuilder()
                                    .setCustomId(existingButton.customId)
                                    .setLabel(`Weź udział (${participantsCount})`)
                                    .setStyle(ButtonStyle.Primary)
                                    .setEmoji('🎉');

                                const updatedRow = new ActionRowBuilder().addComponents(updatedButton);
                                await originalMessage.edit({ components: [updatedRow] });
                                
                                interaction.editReply({ content: 'Pomyślnie dołączyłeś/aś do konkursu! 🎉' });
                            } catch (updateError) {
                                console.error('Błąd aktualizacji wiadomości konkursu po dołączeniu:', updateError);
                                interaction.editReply({ content: 'Pomyślnie dołączyłeś/aś, ale wystąpił błąd podczas aktualizacji wiadomości.' });
                            }
                        });
                    });
                });
            } else if (action === 'ended') {
                return interaction.reply({ content: 'Ten konkurs jest już zakończony. Nie możesz do niego dołączyć.', ephemeral: true });
            }
        }
    },
};