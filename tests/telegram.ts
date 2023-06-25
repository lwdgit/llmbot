import TelegramBot from 'node-telegram-bot-api';
import chat from '..'
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGTRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

bot.onText(/(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgText = match[1];

    const result = await bot.sendMessage(chatId, '请稍候...');
    let lastLength = 0;
    async function sendMessage(msg) {
        if (lastLength === msg.length || !msg.length) return;
        lastLength = msg.length;
        bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: result.message_id,
        });
    }
    const response = await chat(msgText, {
        onMessage: sendMessage,
    });
    sendMessage(response);
});
