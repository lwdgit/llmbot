import TelegramBot from 'node-telegram-bot-api';
import chat from '..'
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGTRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

bot.onText(/(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgText = match[1];
    const repponse = await chat(msgText);

    bot.sendMessage(chatId, repponse?.trim() || '无响应');
});
