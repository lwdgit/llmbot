import Discord, { GatewayIntentBits, Partials, SlashCommandBuilder } from "discord.js";

const client = new Discord.Client({
    intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});


const channel = client.channels.cache.get("1121972204763099191");

channel?.fetch().then(messages => {
    console.log(`Received ${messages.size} messages`);
    //Iterate through the messages here with the variable "messages".
    messages.forEach(message => console.log(message.content))
})

// client.on("ready", () => {
//   console.log(`logged in as ${client.user?.tag}`);
// });

// client.on ('messageCreate', (message) => {
//     console.log('create', message);
//     message.reply('Pong!');
// });

console.log('login...');

client.login('MTEyNDYzNjM3MjkyNjQ4MDM4Ng.Gh3-iy.PDERHM4mKyUhjQK1m6gO6HxLhJWNVIMuCepvQI')
.then(res => console.log(res));