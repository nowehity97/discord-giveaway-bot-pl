plik .env zrób w głownym katalogu bota 
dodaj 



   ```env
TOKEN=bot-token
CLIENT_ID=bot-id
   ```

i na sam początek wpisz
```
node deploy-commands.js
```
potem żeby włączyć bota to
```
node src/index.js
```
i zmień id serwera na swój w public - app.js
```
    const guildId = 'id serwera';
```
 bot https://discord.com/oauth2/authorize?client_id=1402353704232812616&scope=bot&permissions=2147485696
