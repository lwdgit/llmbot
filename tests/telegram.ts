import chat from '../src';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

const throttle = (cb: Function, ms: number = 2500) => {
  let tid: NodeJS.Timeout | null;
  let lastArgs: any[] = [];
  return (...args) => {
    lastArgs = args;
    if (!tid) {
      tid = setTimeout(() => {
        tid = null;
        cb(...lastArgs);
        lastArgs = [];
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

  let lastMsg = '';
  const result = await bot.sendMessage(chatId, '请稍候...');
  const sendMessage = throttle((msg) => {
    msg = msg?.trim();
    if (msg === lastMsg || !msg) return;
    lastMsg = msg;
    bot.editMessageText(msg, {
      chat_id: chatId,
      message_id: result.message_id,
    });
  });
  let response = await chat(msgText, {
    onMessage: sendMessage,
  });

  const images: [string, string][] = [];
  response = response.replace(/^!\[(.+?)\]\((.+?)\)/mg, (_, title, url) => {
    images.push([title, url]);
    return '';
  }).trim();
  sendMessage(response);
  if (images.length) {
    bot.sendMediaGroup(chatId, images.map(image => {
      const orgfile = new URL(image[1]);
      orgfile.searchParams.delete('w');
      orgfile.searchParams.delete('h');
      return {
        type: 'document',
        thumbnail: image[1],
        caption: image[0],
        media: orgfile,
      };
    }));
  }
});