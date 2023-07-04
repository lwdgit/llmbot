import chat, { models } from '../src';
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

const keys = ['/current', ...models.map(m => `/${m}`)];

const bot = new TelegramBot(token, { polling: true });

bot.onText(/^\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '欢迎使用 AI Bot，请选择你想使用的 AI', {
    "reply_markup": {
      "keyboard": keys.reduce((keys, current, index) => {
        if (index % 2 === 0) {
          keys.push([current]);
        } else {
          keys.at(-1).push(current);
        }
        return keys;
      }, [] as any[])
    }
  });
  bot.setMyCommands(keys.map(command => ({ command: command.slice(1), description: command })));
  bot.setChatMenuButton(chatId, {
    menu_button: keys.map(command => ({ type: 'commands', text: command.slice(1) }))
  });
});

bot.onText(/^((?!\/start)[\w\W]+)/, async (msg, match) => {
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
    if (images.length === 1) {
      sendMessage(response + '\n' + images[0][1]);
    }
    bot.sendMediaGroup(chatId, images.map(image => {
      const orgfile = new URL(image[1]);
      orgfile.searchParams.delete('w');
      orgfile.searchParams.delete('h');
      return {
        type: 'photo',
        thumbnail: image[1],
        caption: image[0],
        media: orgfile,
      };
    }));
  }
});