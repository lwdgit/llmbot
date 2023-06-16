import assert from 'assert';
import dotenv from 'dotenv';
import { lock } from './utils';
import { chat } from './bing/bing-chat';
import PoeChat, { Models } from './poe'
import Debug from 'debug';
const debug = Debug('llmbot:index');

dotenv.config();

export const models = [...Models, 'bing'] as const;
let CurrentModel: typeof models[number] = 'bing';

let poeBot;
function poeCookie(cookie: string) {
  poeBot = new PoeChat(cookie);
  return poeBot.start();
}

async function poe(prompt: string, model: typeof Models[number] = 'chatgpt') {
  assert(process.env.POE_COOKIE, 'No poe cooike')
  if (!poeBot) {
    await poeCookie(process.env.POE_COOKIE);
  }
  return poeBot.ask(prompt, model);
}

export default async (prompt: string, model: typeof models[number] = CurrentModel) => {
  if (!prompt || !prompt.trim()) return '我在';
  await lock.acquire();
  debug('doing');
  try {
    if (/^\/(list|cookie\s+|use\s+)(.*)/.test(prompt.trim())) {
      const command = RegExp.$1.trim();
      if (command === 'list') {
        return '当前可以使用的 AI 指指令：\n\n' + models.map(model => `/use ${model}`).join('\n');
      } else if (command === 'cookie') {
        const cookie = RegExp.$2.trim();
        if (cookie) {
          await poeCookie(cookie);
          return 'cookie 更新成功';
        } else {
          return '指令有误';
        }
      } else if (command === 'use') {
        const modelName = RegExp.$2.trim();
        if (models.includes(modelName as any)) {
          CurrentModel = modelName as any;
          return `AI 已切换到 ${modelName}`;
        } else {
          return `不存在名为 ${modelName} 的 AI ，当前使用的 AI 为${CurrentModel}`;
        }
      }
    }

    debug('prompt', prompt);
    return model === 'bing' ? await chat(prompt) : await poe(prompt, model);
  } catch (e) {
    console.error(e);
  } finally {
    debug('done');
    lock.release();
  }
}
