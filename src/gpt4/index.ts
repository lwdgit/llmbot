import fetch from '../utils/fetch';
import type { LLMMessage } from '../typings';
import ua from '../utils/ua';

interface Gpt4Options {
  onMessage?: LLMMessage;
};

export default class Gpt4 {
  private authCode: string;
  private history: { role: 'user' | 'assistant', content: string }[] = [];
  constructor(authCode?: string) {
    this.authCode = authCode || '';
  }
  private async getAuthCode() {
    if (this.authCode) {
      return this.authCode;
    }
    const data = await fetch('https://liaobots.com/api/user', {
      headers: {
        'User-Agent': ua,
        'content-type': 'application/json'
      },
      method: 'POST',
      body: JSON.stringify({ authcode: '' }),
    }).then(res => res.json());
    if (data.amount > 0 && data.authCode) {
      this.authCode = data.authCode;
    } else {
      throw new Error('获取新的对话 code 失败，请重试');
    }
  }

  async sendMessage(prompt: string, options?: Gpt4Options): Promise<string> {
    await this.getAuthCode();
    const history = [
      ...this.history,
      {
        role: 'user',
        content: prompt,
      },
    ];
    const response = await fetch('https://liaobots.com/api/chat', {
      headers: {
        'content-type': 'application/json',
        'x-auth-code': this.authCode,
        Referer: 'https://liaobots.com/zh',
      },
      method: 'POST',
      responseType: 'stream',
      body: {
        conversationId: '',
        model: {
          id: 'gpt-4-0613',
          name: 'GPT-4',
          maxLength: 24000,
          tokenLimit: 8000
        },
        messages: history,
        key: '',
        prompt: 'You are GPT4, a large language model trained by OpenAI. Follow the user\'s instructions carefully.'
      }
    });
    return new Promise(async (resolve) => {
      if (response.status !== 200) {
        this.authCode = '';
        resolve('本次请求失败，请重试');
      }
      const stream = await response.json();
      let responseText = '';
      stream.on('data', data => {
        responseText += data;
        options?.onMessage?.(responseText);
      });
      stream.on('end', () => {
        resolve(responseText);
        this.history.push({
          role: 'user',
          content: prompt,
        }, {
          role: 'assistant',
          content: responseText,
        });
        this.history.splice(0, this.history.length - 6);
      });
    });
  }
}
