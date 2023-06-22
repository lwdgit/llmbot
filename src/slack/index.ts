import { WebClient } from '@slack/web-api';
import assert from 'assert';
import Debug from 'debug';
const debug = Debug('llmbot:slack');
import { sleep } from '../utils';

type MsgCallback = (msg: string, done: boolean) => void;

export class SlackBot {
  webClient!: WebClient;
  private channel: string;
  private chatbotId: Promise<string>;
  private chatbotName?: string;
  private _ts: string;
  readonly timeout: number = 60000;
  get ts() {
    return this._ts;
  };

  constructor(botToken: string, channelId: string, chatbotName?: string) {
    assert(botToken?.startsWith('xoxp-'), '无效的 botToken');
    assert(channelId?.startsWith('C0'), '无效的 channelId');
    this.webClient = new WebClient(botToken);
    this.channel = channelId;
    this.chatbotName = chatbotName;
    this.initChatBotName();
  }

  initChatBotName() {
    this.chatbotId = new Promise(async (resolve: (botId: string) => void) => {
      const userList = (await this.webClient.users.list()).members;
      const botList = userList?.filter(member => member.is_bot);
      if (botList?.length) {
        const chatBot = botList.find(bot => bot.real_name === this.chatbotName) || botList.at(-1);
        resolve(`<@${chatBot!.id}> `);
      }
      debug(botList?.length, '此 Channel 没有找到机器人/Slack Apps');
      resolve('');
    })
  }

  async receive(ts: string, timeout = this.timeout) {
    const messages: string[] = [];
    let finished = false;
    const receiveMessageCallback: MsgCallback = (msg, done) => {
      messages.push(msg);
      finished = done;
    };
    let chatting = true;
    let len = 0;
    let startTime = Date.now();
    while (chatting && ts && Date.now() - startTime < timeout) {
      await sleep(2000);
      const response = await this.webClient.conversations.replies({
        channel: this.channel,
        limit: 2,
        ts,
        include_all_metadata: true,
      });
      const { messages = [] } = response;
      const { text = '' } = messages?.find((message) => message.edited) || {};
      debug('text', text);
      if (!text) continue;

      let [content, end] = /([\s\S]*)_Typing…_$/.test(text) ? [RegExp.$1, false] : [text, true];
      chatting = !end;
      content = content.trim();
      receiveMessageCallback(content.slice(len), false);
      len = content.length;
      if (end) {
        receiveMessageCallback('', true);
        break;
      }
    }

    return {
      message: messages.join(''),
      ts,
      finished,
    };
  }

  chat = async (text, ts = this.ts, timeout = this.timeout) => {
    text = `${await this.chatbotId}${text}`;
    const request = await this.webClient.chat.postMessage({
      thread_ts: ts,
      channel: this.channel,
      text,
      include_all_metadata: true,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text,
          }
        }],
    });

    this._ts = this._ts || request.ts!;
    return this.receive(this.ts, timeout);
  }
}
