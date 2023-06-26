import * as crypto from 'node:crypto'
import WebSocket from 'ws'
import axios from 'axios';
import Debug from 'debug';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as types from './types';
import { LLMMessage } from '../typings';

const debug = Debug('llmbot:bing');

const terminalChar = '\x1e';

export class BingChat {
  protected _cookie: string;

  constructor(opts: {
    cookie: string;
  }) {
    const { cookie } = opts;

    this._cookie = cookie;
  }

  /**
   * Sends a message to Bing Chat, waits for the response to resolve, and returns
   * the response.
   *
   * If you want to receive a stream of partial responses, use `opts.onMessage`.
   *
   * @param message - The prompt message to send
   * @param opts.conversationId - Optional ID of a conversation to continue (defaults to a random UUID)
   * @param opts.onMessage - Optional callback which will be invoked every time the partial response is updated
   *
   * @returns The response from Bing Chat
   */
  async sendMessage(
    text: string,
    opts: types.SendMessageOptions = {}
  ): Promise<types.ChatMessage> {
    const {
      invocationId = '0',
      onMessage,
      locale = 'zh-CN',
      market = 'en-US',
      region = 'US',
      location = {
        lat: 47.639557,
        lng: -122.128159,
        re: 1000
      },
      locationHints = [
        {
          'country': 'United States',
          'state': 'California',
          'city': 'Los Angeles',
          'timezoneoffset': 8,
          'countryConfidence': 8,
          'Center': {
              'Latitude': 34.0536909,
              'Longitude': -118.242766
          },
          'RegionType': 2,
          'SourceType': 1
        }
      ],
      messageType = 'Chat',
      variant = 'Creative'
    } = opts;

    let { conversationId, clientId, conversationSignature } = opts;
    const isStartOfSession = !(
      conversationId &&
      clientId &&
      conversationSignature
    );

    if (isStartOfSession) {
      const conversation = await this.createConversation(this._cookie);
      conversationId = conversation.conversationId;
      clientId = conversation.clientId;
      conversationSignature = conversation.conversationSignature;
    }

    const result: types.ChatMessage = {
      author: 'bot',
      id: crypto.randomUUID(),
      conversationId: conversationId!,
      clientId: clientId!,
      conversationSignature: conversationSignature!,
      invocationId: `${parseInt(invocationId, 10) + 1}`,
      text: '',
    };

    const responseP = new Promise<types.ChatMessage>(
      async (resolve, reject) => {
        const chatWebsocketUrl = 'wss://sydney.bing.com/sydney/ChatHub';
        const agent = process.env.HTTP_PROXY ? new HttpsProxyAgent(process.env.HTTP_PROXY) : undefined;

        const ws = new WebSocket(chatWebsocketUrl, {
          agent,
          perMessageDeflate: false,
          headers: {
            'accept-language': 'zh-CN,zh;q=0.9',
            'cache-control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.43',
            pragma: 'no-cache'
          }
        });

        let isFulfilled = false;

        function cleanup() {
          ws.close();
          ws.removeAllListeners();
        }

        ws.on('error', (error) => {
          debug('WebSocket error:', error);
          cleanup();
          if (!isFulfilled) {
            isFulfilled = true;
            reject(new Error(`WebSocket error: ${error.toString()}`));
          }
        });

        ws.on('close', () => {
          debug('ws closed');
        });

        const traceId = crypto.randomBytes(16).toString('hex');

        // example location: 'lat:47.639557;long:-122.128159;re=1000m;'
        const locationStr = location
          ? `lat:${location.lat};long:${location.lng};re=${
              location.re || '1000m'
            };`
          : undefined;

        // Sets the correct options for the variant of the model
        const optionsSets = [
          "nlu_direct_response_filter",
          "deepleo",
          "disable_emoji_spoken_text",
          "responsible_ai_policy_235",
          "enablemm",
          "h3imaginative",
          "rcsprtsalwlst",
          "dv3sugg",
          "autosave",
          "gencontentv3"
        ]
        if (variant == 'Balanced') {
          optionsSets.push('galileo');
        } else {
          optionsSets.push('clgalileo');
          if (variant == 'Creative') {
            optionsSets.push('h3imaginative');
          } else if (variant == 'Precise') {
            optionsSets.push('h3precise');
          }
        }
        const params = {
          arguments: [
            {
              source: 'cib',
              optionsSets: [...new Set(optionsSets)],
              allowedMessageTypes: [
                'ActionRequest',
                'Chat',
                'Context',
                'InternalSearchQuery',
                'InternalSearchResult',
                'Disengaged',
                'InternalLoaderMessage',
                'Progress',
                'RenderCardRequest',
                'AdsQuery',
                'SemanticSerp',
                'GenerateContentQuery',
                'SearchQuery'
              ],
              sliceIds: [
                'winmuid3tf',
                'osbsdusgreccf',
                'ttstmout',
                'crchatrev',
                'winlongmsgtf',
                'ctrlworkpay',
                'norespwtf',
                'tempcacheread',
                'temptacache',
                '505scss0',
                '508jbcars0',
                '515enbotdets0',
                '5082tsports',
                '515vaoprvs',
                '424dagslnv1s0',
                'kcimgattcf',
                '427startpms',
              ],
              traceId,
              isStartOfSession,
              message: {
                locale,
                market,
                region,
                location: locationStr,
                locationHints,
                author: 'user',
                inputMethod: 'Keyboard',
                messageType,
                text
              },
              conversationSignature,
              participant: { id: clientId },
              conversationId
            }
          ],
          invocationId,
          target: 'chat',
          type: 4
        };

        debug(chatWebsocketUrl, JSON.stringify(params, null, 2));

        ws.on('open', () => {
          ws.send(`{"protocol":"json","version":1}${terminalChar}`);
          ws.send(`{"type":6}${terminalChar}`);
          ws.send(`${JSON.stringify(params)}${terminalChar}`);
        });

        ws.on('message', (data) => {
          const objects = data.toString().split(terminalChar);

          const messages = objects
            .map((object) => {
              try {
                return JSON.parse(object)
              } catch (error) {
                return object
              }
            })
            .filter(Boolean);

          if (!messages.length) {
            return;
          }

          for (const message of messages) {
            debug(JSON.stringify(message))
            // console.log(message.type);
            if (Math.ceil(Date.now() / 1000) % 6 === 0) {
              ws.send(`{"type":6}${terminalChar}`);
            }

            if (message.type === 1) {
              const update = message as types.ChatUpdate;
              const msg = update.arguments[0].messages?.[0];

              if (!msg) continue;

              // console.log('RESPONSE0', JSON.stringify(update, null, 2))

              if (!msg.messageType) {
                result.author = msg.author;
                result.text = msg.text;
                result.detail = msg;

                onMessage?.(result);
              }
            } else if (message.type === 2) {
              const response = message as types.ChatUpdateCompleteResponse;
              const validMessages = response.item.messages?.filter(
                (m) => !m.messageType && m.author === 'bot'
              );
              const lastMessage = validMessages?.at(-1);

              if (lastMessage) {
                result.conversationExpiryTime = response.item.conversationExpiryTime;
                result.author = lastMessage.author;
                result.text = lastMessage.text || (lastMessage.adaptiveCards??[]).map(card => card.body.map(body => body.text).join('\n')).join('\n');
                result.detail = lastMessage;
                result.end = response.item?.messages.at(-1)?.messageType === 'Disengaged' || response.item.throttling.numUserMessagesInConversation >= response.item.throttling.maxNumUserMessagesInConversation;
              } else if (response.item.result.value) {
                result.text = response.item.result.value;
              }
            } else if (message.type === 7) {
              ws.send(`{"type":7}${terminalChar}`);
            } else if (message.type === 6) {
              ws.send(`{"type":6}${terminalChar}`);
            } else if (message.type === 3) {
              isFulfilled = true;
              resolve(result);
              cleanup();
            }
          }
        })
      }
    )

    return responseP;
  }

  async createConversation(_cookie): Promise<types.ConversationResult> {
    // const url = 'https://edgeservices.bing.com/edgesvc/turing/conversation/create';
    const url = 'https://www.bing.com/turing/conversation/create';

    const cookie = _cookie?.includes(';')
      ? _cookie
      : `_U=${_cookie}`;

    const response = await axios.get(url, {
      headers: {
        'accept': 'application/json',
        'accept-language': 'zh-CN,zh;q=0.9',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Edg/114.0.1823.43',
        'x-ms-useragent': 'azsdk-js-api-client-factory/1.0.0-beta.1 core-rest-pipeline/1.10.0 OS/MacIntel',
        cookie: _cookie ? cookie : undefined,
      },
    }).then((res) => {
      if (res.status !== 200) {
        throw new Error('Network error');
      }
      return res.data;
    })

    if (response?.result?.value === 'Success') {
      return response;
    } else {
      await new Promise(r => setTimeout(r, 1500));
      return this.createConversation(this._cookie);
    }
  }
}


let _options : null | types.SendMessageOptions = null;
const ConversationState = {
  set value(opts: types.SendMessageOptions & Partial<Pick<types.ChatMessage, 'end' | 'text'>>) {
    if (!opts.text) {
      opts.text = 'No response';
      opts.end = true;
    }
    if (opts.end) {
      _options = null;
      opts.text += '\n\nSystem Info：New Bing closed this conversation. Please try again.'
    } else {
      _options = {
        conversationExpiryTime: new Date(Date.now() + 3900000).toISOString(),
        clientId: opts.clientId,
        conversationId: opts.conversationId,
        conversationSignature: opts.conversationSignature,
        invocationId: opts.invocationId,
      };
    }
  },
  get value(): types.SendMessageOptions & Partial<Pick<types.ChatMessage, 'end' | 'text'>> | undefined {
    return _options && new Date(_options?.conversationExpiryTime as any).getTime() > Date.now() + 3600000 ? _options : undefined;
  },
}

export async function chat(prompt: string, onMessage?: LLMMessage) {
  const api = new BingChat({ cookie: process.env.BING_COOKIE || '' })
  const response = await api.sendMessage(prompt, {
    ...ConversationState.value,
    onMessage: (res) => {
      onMessage?.(res.text);
    },
  });
  ConversationState.value = response;
  return response.text;
}
