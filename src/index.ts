import assert from 'assert';
import dotenv from 'dotenv';
import { ChatGPTUnofficialProxyAPI } from 'chatgpt';
import { GradioChatBot, spaces } from 'gradio-chatbot';
import Auth from './utils/auth';
import Debug from 'debug';
import type { LLMMessage, LLMOpts } from './typings';
import { lock } from './utils/lock';
import { chat as bing } from './bing/bing-chat';
import PoeChat, { Models } from './poe';
import { SlackBot } from './slack';
import MJ from './midjourney';

const debug = Debug('llmbot:index');

dotenv.config();

export const models = ['bing', 'chatgpt_web', ...Models, 'slack', 'gradio'] as const;

let CurrentModel: typeof models[number] = 'bing';
let CurrentSpace: string = '';

let poeBot: PoeChat;
let slackBot: SlackBot;
let chatgptBot: ChatGPTUnofficialProxyAPI | undefined;
let gradioBot: GradioChatBot | undefined;
let conversationId;
let parentMessageId;
function poeCookie(cookie: string) {
  poeBot = new PoeChat(cookie);
  return poeBot.start();
}

async function poe(prompt: string, model: typeof Models[number] = 'gpt4', onMessage?: LLMMessage): Promise<string> {
  assert(process.env.POE_COOKIE, 'No poe cooike')
  if (!poeBot) {
    await poeCookie(process.env.POE_COOKIE);
  }
  return poeBot.ask(prompt, model, onMessage);
}

export default async (prompt: string, opts: LLMOpts<typeof models[number]>): Promise<string> => {
  if (!prompt || !prompt.trim()) return '我在';
  const model = opts.model || CurrentModel;
  debug('prompt', prompt);
  debug('model', model);
  if (!models.includes(model)) {
    return `不存在 model: ${model}`;
  }
  await lock.acquire();
  debug('进入队列');
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
        return '当前可以使用的 AI 指令：\n\n' + models.map(model => `/${model}`).join('\n');
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
            CurrentSpace = extra || CurrentSpace || '0';
            gradioBot = undefined;
            if (CurrentSpace) {
              CurrentModel = 'gradio';
              if (!isNaN(CurrentSpace as any)) {
                const config = spaces[CurrentSpace] || {};
                return `AI 已切换到 Gradio，模型地址为: ${config.url || config}`;
              }
              return `AI 已切换到 Gradio，模型地址为: ${CurrentSpace}`;
            }
          } else {
            CurrentModel = modelName as any;
            return `AI 已切换到 ${modelName}`;
          }
        }
        return `不存在名为 ${modelName} 的 AI，当前使用的 AI 为${CurrentModel}`;
      }
    }

    if (model === 'bing') {
      return await bing(prompt, opts.onMessage);
    } else if (model === 'slack') {
      if (!slackBot) {
        if (process.env.SLACK_LISTEN_BOT_TOKEN && process.env.SLACK_CHANNEL) {
          slackBot = new SlackBot(process.env.SLACK_LISTEN_BOT_TOKEN, process.env.SLACK_CHANNEL, process.env.SLACK_CHATBOT_NAME);
        } else {
          return '未配置 Slack';
        }
      }
      return (await slackBot.chat(prompt, {
        onMessage: opts.onMessage,
      })).message;
    } else if (model === 'gradio') {
      if (!gradioBot) {
        gradioBot = new GradioChatBot({ url: CurrentSpace });
      }
      return await gradioBot.chat(prompt, { onMessage: opts.onMessage });
    } else if (model === 'chatgpt_web') {
      if (!chatgptBot) {
        assert(process.env.OPENAI_EMAIL, '没有配置 OPENAI_EMAIL');
        assert(process.env.OPENAI_PASSWORD, '没有配置 OPENAI_PASSWORD');
        debug('正在登录openai');
        const auth = new Auth(process.env.OPENAI_EMAIL, process.env.OPENAI_PASSWORD);
        const accessToken = await auth.getAccessToken();
        debug('获取 accessToken 成功', accessToken);
        chatgptBot = new ChatGPTUnofficialProxyAPI({
          accessToken,
          apiReverseProxyUrl: process.env.OPENAI_NOPROXY ? undefined : 'https://ai.fakeopen.com/api/conversation',
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo-16k',
        });
      }

      const conversation = await chatgptBot.sendMessage(prompt, {
        conversationId,
        parentMessageId,
        onProgress: (msg) => {
          debug('msg', JSON.stringify(msg));
          if (msg.text === prompt) return;
          opts.onMessage?.(msg.text);
        }
      }).catch(e => {
        chatgptBot = undefined;
        return  {
          text: `${e}`,
          conversationId: undefined,
          id: undefined,
        };
      });
      conversationId = conversation.conversationId;
      parentMessageId = conversation.id;
      return conversation.text;
    } else if (model === 'midjourney') {
      const response = (await poe(prompt, 'midjourney'));
      if (process.env.MJ_UUID && /(?:[\r\n]|^)\/imagine prompt:\s([\w\W]+)/mg.test(response)) {
        const query = RegExp.$1;
        const messages = [`引导词：${query}`, `正在作画，预计需要 1 分钟`];
        opts.onMessage?.(messages.join('\n'));
        const imgSrc = await new MJ(process.env.MJ_UUID).drawImage(query.split(/\n/).pop()!)
          .catch(e => console.log(e));
        messages.push(imgSrc ? `![${prompt}](${imgSrc})` : '图像生成失败，请重试');
        return messages.join('\n');
      } else {
        return response;
      }
    }
    return await poe(prompt, model, opts.onMessage);
  } catch (e) {
    console.error(e);
    return `${e}`;
  } finally {
    debug('done');
    lock.release();
  }
}
