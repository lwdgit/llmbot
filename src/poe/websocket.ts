import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import Debug from 'debug';
const debug = Debug('llmbot:poe');

const getSocketUrl = async (credentials) => {
  const socketUrl = `wss://tch${Math.ceil(Math.random() * (1e6 - 1))}.tch.quora.com`;
  const appSettings = credentials.app_settings.tchannelData;
  const boxName = appSettings.boxName;
  const minSeq = appSettings.minSeq;
  const channel = appSettings.channel;
  const hash = appSettings.channelHash;
  return `${socketUrl}/up/${boxName}/updates?min_seq=${minSeq}&channel=${channel}&hash=${hash}`;
};

export const connectWs = async (credentials): Promise<WebSocket> => {
  const url = await getSocketUrl(credentials);
  const agent = process.env.HTTP_PROXY ? new HttpsProxyAgent(process.env.HTTP_PROXY) : undefined;
  const ws = new WebSocket(url, { agent });
  return new Promise((resolve, reject) => {
    ws.on('open', function open() {
      debug('ws open');
      return resolve(ws);
    });
  });
};

export const disconnectWs = async (ws: WebSocket) => {
  debug('close ws');
  ws.close();
};

export const listenWs = async (ws: WebSocket, since: number) => {
  return new Promise((resolve) => {
    let previousText = '';
    const onMessage = function incoming(data) {
      const dataString = data.toString();
      let jsonData = JSON.parse(dataString);
      if (Array.isArray(jsonData.messages)) {
        for(let message of jsonData.messages) {
          const messages = JSON.parse(message);
          const { payload, message_type } = messages || {};
          const { text, state, author, creationTime } = payload.data?.messageAdded || {};
          debug('ws state', message_type, state, author, creationTime - since);
          if (message_type !=='subscriptionUpdate' || !state || author === 'human' || creationTime < since) {
            continue;
          }
          if (state === 'complete') {
            return resolve(text || previousText);
          } else if (state === 'incomplete') {
            previousText = text;
          }
        }
      }
    };
    ws.on('error', debug);
    ws.on('message', onMessage);
    ws.on('close', function close() {
      debug('ws closed');
      return resolve('没有响应');
    });
  });
};
