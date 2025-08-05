require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFolders = fs.readdirSync(commandsPath); // Powinno znaleźć nazwy folderów, np. "giveaway"

for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder); // Np. .../src/commands/giveaway
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        } else {
            console.log(`[Ostrzeżenie] Komenda pod ${filePath} brakuje wymaganej właściwości "data" lub "execute".`);
        }
    }
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
    try {
        console.log(`Rozpoczęto odświeżanie ${commands.length} komend slash (/).`);

        let data;
        if (process.env.GUILD_ID) {
            // Rejestracja komend dla konkretnej gildii (szybciej do testów)
            data = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands },
            );
            console.log(`Pomyślnie przeładowano ${data.length} komend aplikacji dla gildii (ID: ${process.env.GUILD_ID}).`);
        } else {
            // Rejestracja komend globalnie (może zająć do godziny)
            data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );
            console.log(`Pomyślnie przeładowano ${data.length} globalnych komend aplikacji.`);
        }
        
    } catch (error) {
        console.error(error);
    }
})();