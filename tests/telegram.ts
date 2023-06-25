import TelegramBot from 'node-telegram-bot-api';
import chat from '..'
import dotenv from 'dotenv';

const throttle = (cb: Function, ms: number = 200) => {
    let tid: NodeJS.Timeout | null;
    let lastArgs: any[] = [];
    return (...args) => {
        lastArgs = args;
        if (!tid) {
            tid = setTimeout(() => {
                tid = null;
                cb(...lastArgs);
            }, ms);
        }
    };
}

dotenv.config();

const token = process.env.TELEGTRAM_BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

bot.onText(/(.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgText = match[1];

    const result = await bot.sendMessage(chatId, '请稍候...');
    async function sendMessage(msg) {
        bot.editMessageText(msg, {
            chat_id: chatId,
            message_id: result.message_id,
        });
    }
    const response = await chat(msgText, {
        onMessage: throttle(sendMessage),
    });
    sendMessage(response);
});
