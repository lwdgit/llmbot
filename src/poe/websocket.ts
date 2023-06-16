import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import Debug from 'debug';
const debug = Debug('llmbot');

const getSocketUrl = async (credentials) => {
  const socketUrl = `wss://tch${Math.ceil(Math.random() * (1e6 - 1))}.tch.quora.com`;
  const appSettings = credentials.app_settings.tchannelData;
  const boxName = appSettings.boxName;
  const minSeq = appSettings.minSeq;
  const channel = appSettings.channel;
  const hash = appSettings.channelHash;
  return `${socketUrl}/up/${boxName}/updates?min_seq=${minSeq}&channel=${channel}&hash=${hash}`;
};

export const connectWs = async (credentials) => {
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

export const disconnectWs = async (ws) => {
  ws.close();
};

export const listenWs = async (ws) => {
  return new Promise((resolve, reject) => {
    let previousText = '';
    const onMessage = function incoming(data) {
      const dataString = data.toString();
      let jsonData = JSON.parse(dataString);
      if (jsonData.messages && jsonData.messages.length > 0) {
        const messages = JSON.parse(jsonData.messages[0]);
        const dataPayload = messages.payload.data || {};
        const { text, state, author } = dataPayload.messageAdded || {};
        debug('ws state', state);
        if (!state || author === 'human') {
          return;
        }
        if (state === 'complete') {
          ws.removeListener('message', onMessage);
          return resolve(text || previousText);
        } else if (state === 'incomplete') {
          previousText = text;
        }
      }
    };
    ws.on('message', onMessage);
    ws.on('close', function close() {
      return resolve('没有响应');
    });
  });
};
