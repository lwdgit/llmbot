import assert from 'assert';
import dotenv from 'dotenv';
import { lock } from './utils';
import { chat as bing } from './bing/bing-chat';
import { chat as gradio } from './gradio';
import PoeChat, { Models } from './poe'
import { SlackBot } from './slack';
import Debug from 'debug';
const debug = Debug('llmbot:index');

dotenv.config();

export const models = ['bing', 'slack', ...Models, 'gradio'] as const;

let CurrentModel: typeof models[number] = 'bing';
let CurrentSpace: string = '';

let poeBot: PoeChat;
let slackBot: SlackBot;
function poeCookie(cookie: string) {
  poeBot = new PoeChat(cookie);
  return poeBot.start();
}

if (process.env.SLACK_LISTEN_BOT_TOKEN && process.env.SLACK_CHANNEL) {
  slackBot = new SlackBot(process.env.SLACK_LISTEN_BOT_TOKEN, process.env.SLACK_CHANNEL, process.env.SLACK_CHATBOT_NAME)
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
    const re = new RegExp(`^\/(list|current|cookie\\s+|use\\s+|(?:${models.join('|').replace(/\+/, '\\+')}))(.*)`);
    if (re.test(prompt.trim())) {
      let command = RegExp.$1.trim();
      let args = RegExp.$2.trim();
      if (models.includes(command as any)) {
        // short alias
        args = `${command} ${args}`;
        command = 'use';
      }

      if (command === 'list') {
        return '当前可以使用的 AI 指令：\n\n' + models.map(model => `/use ${model}`).join('\n');
      } else if (command === 'current') {
        return `当前正在使用 ${CurrentModel} ${CurrentModel === 'gradio' ? CurrentSpace : ''}`;
      } else if (command === 'cookie') {
        const cookie = RegExp.$2.trim();
        if (cookie) {
          await poeCookie(cookie);
          return 'cookie 更新成功';
        } else {
          return '指令有误';
        }
      } else if (command === 'use') {
        const [modelName, extra] = args.split(/\s+/);
        if (models.includes(modelName as any)) {
          if (modelName === 'gradio') {
            CurrentSpace = extra || CurrentSpace;
            if (CurrentSpace) {
              CurrentModel = 'gradio';
              return `AI 已切换到 Gradio，模型地址为: ${CurrentSpace}`;
            } else {
              return `Gradio 需要指定模型地址`;
            }
          } else {
            CurrentModel = modelName as any;
            return `AI 已切换到 ${modelName}`;
          }
        }
        return `不存在名为 ${modelName} 的 AI ，当前使用的 AI 为${CurrentModel}`;
      }
    }

    debug('prompt', prompt);
    if (model === 'bing') {
      return await bing(prompt);
    } else if (model === 'slack') {
      if (!slackBot) {
        return '未配置 Slack';
      }
      return (await slackBot.chat(prompt)).message;
    } if (model === 'gradio') {
      return await gradio(prompt, { url: CurrentSpace });
    }
    return await poe(prompt, model);
  } catch (e) {
    console.error(e);
  } finally {
    debug('done');
    lock.release();
  }
}
