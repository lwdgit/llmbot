import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert';
import fetch from '../utils/fetch';
import { scrape, getUpdatedSettings } from './credentials';
import { listenWs, connectWs, disconnectWs } from './websocket';
import { LLMMessage } from '../typings';

const gqlDir = path.join(__dirname, '../../graphql');

const ModelMap = {
  chatgpt: 'chinchilla',
  sage: 'capybara',
  claude: 'a2',
  'claude+': 'a2_2',
  // gpt4: 'beaver',
  qianlong: 'qianlonggpt',
  midjourney: 'midjourney',
};

export const Models = Object.keys(ModelMap) as Array<keyof typeof ModelMap>;
type IModels = typeof Models[number];

const queries = {
  chatViewQuery: readFileSync(path.join(gqlDir, 'ChatViewQuery.graphql'), 'utf8'),
  addMessageBreakMutation: readFileSync(path.join(gqlDir, '/AddMessageBreakMutation.graphql'), 'utf8'),
  chatPaginationQuery: readFileSync(path.join(gqlDir, '/ChatPaginationQuery.graphql'), 'utf8'),
  addHumanMessageMutation: readFileSync(path.join(gqlDir, '/AddHumanMessageMutation.graphql'), 'utf8'),
  sendMessageMutation: readFileSync(path.join(gqlDir, '/SendMessageMutation.graphql'), 'utf8'),
};

export default class ChatBot {
  private formkey: string = '';
  private channelName: string = '';
  private pbCookie: string = '';
  constructor(readonly pb_cookie: string) {
    assert(pb_cookie, 'pbCookie can\'t be null');
    this.pbCookie = `p-b=${pb_cookie}`;
  }
  private headers = {
    'Content-Type': 'application/json',
    Accept: '*/*',
    Host: 'poe.com',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    Origin: 'https://poe.com',
  };

  private chatId: number = 0;
  private bot: string = '';
  private ws: any;
  private credentials: {
    quora_formkey: string;
    quora_cookie: string;
    channel_name: string;
    app_settings: any;
  } = {
    quora_formkey: '',
    quora_cookie: '',
    channel_name: '',
    app_settings: {},
  };

  public async start() {
    await this.setCredentials();
    await this.subscribe();
    let { minSeq } = await getUpdatedSettings(this.channelName, this.pbCookie);
    this.credentials.app_settings.tchannelData.minSeq = minSeq;
  }

  public async ask(msg: string, model: IModels = 'chatgpt', onMessage?: LLMMessage): Promise<string> {
    let formatModel = ModelMap[model] || ModelMap.chatgpt;
    await this.getChatId(formatModel);
    const msgData = await this.sendMsg(msg);
    if (!msgData?.data?.messageEdgeCreate?.message) {
      return `${model} Rate limit exceeded.`;
    }

    const human_message = msgData?.data?.messageEdgeCreate?.message;
    const { messageId, creationTime } = human_message?.node || {};

    if (!messageId) {
      return `An unknown error occured. Raw response data: ${JSON.stringify(msgData)}`;
    }
    const ws = await connectWs(this.credentials);
    let res = await listenWs(ws, creationTime, onMessage);
    disconnectWs(ws);
    return res;
  }

  public async send(messages: Array<{ role: string; content: string }>, model: IModels = 'chatgpt') {
    var prompt = '';
    for (var i = 0; i < messages.length; i++) {
      if (i == messages.length - 1) {
        prompt += `${messages[i].role}: ${messages[i].content}\n`;
      } else {
        prompt += `${messages[i].role}: ${messages[i].content}`;
      }
    }
    var answer = await this.ask(prompt, model);
    return answer;
  }

  private async makeRequest(request) {
    if (this.headers['poe-formkey'] && request) {
      const base_string = JSON.stringify(request) + this.headers["poe-formkey"] + "WpuLMiXEKKE98j56k"
      this.headers['poe-tag-id'] = crypto.createHash('md5').update(base_string, 'utf8').digest('hex');
    }

    const response = await fetch('https://poe.com/api/gql_POST', {
      method: 'POST',
      headers: this.headers,
      data: request,
    });

    return await response.json();
  }

  private async getChatId(bot: string) {
    try {
      const {
        data: {
          chatOfBot: { chatId },
        },
      } = await this.makeRequest({
        query: `${queries.chatViewQuery}`,
        variables: {
          bot,
        },
      });
      this.chatId = chatId;
      this.bot = bot;
    } catch (e) {
      throw new Error(
        'Could not get chat id, invalid formkey or cookie! Please remove the quora_formkey value from the config.json file and try again.',
      );
    }
  }
  private async sendMsg(query: string) {
    try {
      return await this.makeRequest({
        query: `${queries.sendMessageMutation}`,
        variables: {
          bot: this.bot,
          query: query,
          chatId: this.chatId,
          source: null,
          withChatBreak: false,
        },
      });
    } catch (e) {
      throw new Error(`Could not send message: ${e}`);
    }
  }

  private extract_formkey(html) {
    let script_regex = /<script>if\(.+\)throw new Error;(.+)<\/script>/;
    let script_text = html.match(script_regex)[1];
    let key_regex = /var .="([0-9a-f]+)",/;
    let key_text = script_text.match(key_regex)[1];
    let cipher_regex = /\[(\d+)\]=.\[(\d+)\]/g;
    let cipher_pairs = [...script_text.matchAll(cipher_regex)];
  
    let formkey_list = Array(cipher_pairs.length).fill("");
    for (let pair of cipher_pairs) {
      let formkey_index = pair[1];
      let key_index = pair[2];
      formkey_list[formkey_index] = key_text[key_index];
    }
    let formkey = formkey_list.join("");
  
    return formkey;
  }

  private async getFormkey() {
    const html = await fetch('https://poe.com/', {
      headers: this.headers,
    }).then(res => res.json());
    return this.extract_formkey(html);
  }
  private async setCredentials() {
    let result = await scrape(this.pbCookie);
    this.credentials.quora_formkey = result.appSettings.formkey;
    this.credentials.quora_cookie = result.pbCookie;
    // For websocket later feature
    this.credentials.channel_name = result.channelName;
    this.credentials.app_settings = result.appSettings;

    this.pbCookie = result.pbCookie;
    // For websocket later feature
    this.channelName = result.channelName;
    // this.appSettings = result.appSettings;

    this.headers['poe-tchannel'] = this.channelName;
    this.headers['Cookie'] = this.pbCookie;

    this.formkey = await this.getFormkey();
    this.headers['poe-formkey'] = this.formkey;
  }

  private async subscribe() {
    const query = {
      queryName: 'subscriptionsMutation',
      variables: {
        subscriptions: [
          {
            subscriptionName: 'messageAdded',
            query:
              'subscription subscriptions_messageAdded_Subscription(\n  $chatId: BigInt!\n) {\n  messageAdded(chatId: $chatId) {\n    id\n    messageId\n    creationTime\n    state\n    ...ChatMessage_message\n    ...chatHelpers_isBotMessage\n  }\n}\n\nfragment ChatMessageDownvotedButton_message on Message {\n  ...MessageFeedbackReasonModal_message\n  ...MessageFeedbackOtherModal_message\n}\n\nfragment ChatMessageDropdownMenu_message on Message {\n  id\n  messageId\n  vote\n  text\n  ...chatHelpers_isBotMessage\n}\n\nfragment ChatMessageFeedbackButtons_message on Message {\n  id\n  messageId\n  vote\n  voteReason\n  ...ChatMessageDownvotedButton_message\n}\n\nfragment ChatMessageOverflowButton_message on Message {\n  text\n  ...ChatMessageDropdownMenu_message\n  ...chatHelpers_isBotMessage\n}\n\nfragment ChatMessageSuggestedReplies_SuggestedReplyButton_message on Message {\n  messageId\n}\n\nfragment ChatMessageSuggestedReplies_message on Message {\n  suggestedReplies\n  ...ChatMessageSuggestedReplies_SuggestedReplyButton_message\n}\n\nfragment ChatMessage_message on Message {\n  id\n  messageId\n  text\n  author\n  linkifiedText\n  state\n  ...ChatMessageSuggestedReplies_message\n  ...ChatMessageFeedbackButtons_message\n  ...ChatMessageOverflowButton_message\n  ...chatHelpers_isHumanMessage\n  ...chatHelpers_isBotMessage\n  ...chatHelpers_isChatBreak\n  ...chatHelpers_useTimeoutLevel\n  ...MarkdownLinkInner_message\n}\n\nfragment MarkdownLinkInner_message on Message {\n  messageId\n}\n\nfragment MessageFeedbackOtherModal_message on Message {\n  id\n  messageId\n}\n\nfragment MessageFeedbackReasonModal_message on Message {\n  id\n  messageId\n}\n\nfragment chatHelpers_isBotMessage on Message {\n  ...chatHelpers_isHumanMessage\n  ...chatHelpers_isChatBreak\n}\n\nfragment chatHelpers_isChatBreak on Message {\n  author\n}\n\nfragment chatHelpers_isHumanMessage on Message {\n  author\n}\n\nfragment chatHelpers_useTimeoutLevel on Message {\n  id\n  state\n  text\n  messageId\n}\n',
          },
          {
            subscriptionName: 'viewerStateUpdated',
            query:
              'subscription subscriptions_viewerStateUpdated_Subscription {\n  viewerStateUpdated {\n    id\n    ...ChatPageBotSwitcher_viewer\n  }\n}\n\nfragment BotHeader_bot on Bot {\n  displayName\n  ...BotImage_bot\n}\n\nfragment BotImage_bot on Bot {\n  profilePicture\n  displayName\n}\n\nfragment BotLink_bot on Bot {\n  displayName\n}\n\nfragment ChatPageBotSwitcher_viewer on Viewer {\n  availableBots {\n    id\n    ...BotLink_bot\n    ...BotHeader_bot\n  }\n}\n',
          },
        ],
      },
      query:
        'mutation subscriptionsMutation(\n  $subscriptions: [AutoSubscriptionQuery!]!\n) {\n  autoSubscribe(subscriptions: $subscriptions) {\n    viewer {\n      id\n    }\n  }\n}\n',
    };

    await this.makeRequest(query);
  }
}
