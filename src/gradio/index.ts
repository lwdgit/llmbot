import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { MergeExclusive } from 'type-fest';
import Debug from 'debug';
import assert from 'assert';
import { client } from './client';
import type { Event, Status } from './client/types'
import axios from 'axios';
export * from './config';
import { spaces } from './config';
import { LLMMessage } from '../typings';

const debug = Debug('llmbot:gradio');

export const generateHash = () => {
  return Math.random().toString(36).substring(2);
};
 
const DEFAULT_HASH = generateHash();

export type GradioChatOptions = MergeExclusive<{
  url?: string;
}, {
  endpoint?: string;
}> & {
  fn_index?: number;
  args?: unknown[];
  session_hash?: string;
  onMessage?: LLMMessage;
  onError?: (error: string) => void;
  abort?: AbortSignal;
}

async function resolveEndpoint(url: string) {
  const uri = new URL(url);
  debug('resolve', uri.hostname);
  if (uri.hostname === 'modelscope.cn') {
    assert(/^\/studios\/([^/]+)\/([^/]+)\//.test(uri.pathname), '不是一个有效的 modelscope 空间链接');
    const scope = RegExp.$1;
    const name = RegExp.$2;
    return `https://modelscope.cn/api/v1/studio/${scope}/${name}/gradio`;
  } else if (uri.hostname === 'huggingface.co') {
    assert(/^\/spaces\/([^/]+)\/([^/]+)/.test(uri.pathname), '不是一个有效的 huggingface 空间链接');
    debug('正在下载 huggingface 数据');
    const content = (await axios.get(url)).data;
    assert(/<iframe src="([^"]+)"/mg.test(content), '查找空间链接失败');
    const spaceUri = new URL(RegExp.$1);
    spaceUri.search = '';
    return spaceUri.hostname.endsWith('.hf.space') ? spaceUri.host : spaceUri.toString();
  }
  throw new Error('暂时只支持 modelscope 和 huggingface');
}

const traverseContent = (data: any) => {
  if (!Array.isArray(data)) {
    return data;
  }
  return traverseContent(data.at(-1));
}

const parseInputs = (fn_index: number, config: any, skip_text = false) => {
  const { components, dependencies } = config;
  const chatbot = components.find((com) => com.type === 'chatbot' && com.props?.visible);

  const submitBtn = dependencies[fn_index];
  const inputComponents = submitBtn?.inputs?.map((inputId: number) => components.find((com) => com.id === inputId)) || [];
  const inputs = inputComponents.map((com: any) => com?.props?.value ?? null);
  let outputIndex = submitBtn?.outputs.indexOf(chatbot?.id);

  let textInputIndex = skip_text ? 0 : submitBtn?.inputs.indexOf(submitBtn?.targets?.[0]);
  if (textInputIndex < 0) {
    textInputIndex = submitBtn?.inputs.findIndex(id => 
      components?.find((com: any) =>
      id === com.id
      && (com.type === 'textbox' || com.example_input)
    ));
  }

  assert(textInputIndex > -1, '找不到输入框');

  const historyIndex = submitBtn?.inputs.indexOf(chatbot?.id);
  if (historyIndex > -1) {
    inputs[historyIndex] = [];
  }
  
  debug('submit', fn_index, textInputIndex);
  return [inputs, textInputIndex, outputIndex];
}

export const findValidSubmitByType = (components: any[], dependencies: any[], type: string) => {
  const id = components.find(com => com.type === 'button' && com.props.value === 'Submit')?.id;
  let index = dependencies.findIndex(dep => dep.targets?.includes?.(id));
  return index === -1 ? dependencies.findIndex(
    (dep = {}) => 
      dep.inputs?.length
      && dep.outputs?.length
      && dep.backend_fn
      && dep.trigger === type
  ) : index;
}

export const findValidSubmitByButton = (components: any[], dependencies: any[]) => {
  const id = components.find(com => com.type === 'button')?.id;
  if (!id) return -1;
  return dependencies.findIndex(dep => dep.targets?.includes?.(id));
}

export const chat = async (prompt: string, options: GradioChatOptions): Promise<string> => {
  assert(prompt, 'prompt 不能为空');
  assert(options?.endpoint || options.url, 'endpoint 和 url 必须要指定其中一个');
  return new Promise(async (resolve, reject) => {
    try {
      if (options.url && !isNaN(options.url as any)) {
        options.url = spaces[parseInt(options.url, 10)];
      }
      const endpoint = options.endpoint || await resolveEndpoint(options.url!);
      debug('endpoint', endpoint);
      const { config, submit } = 
        await client(endpoint, { session_hash: options.session_hash || DEFAULT_HASH, normalise_files: true });

      const { components, dependencies } = config;

      let fn_index = options.fn_index ?? findValidSubmitByType(components, dependencies, 'submit');
      if (fn_index < 0) {
        fn_index = Math.max(findValidSubmitByButton(components, dependencies), findValidSubmitByType(components, dependencies, 'click'));
      }
      assert(fn_index > -1, '解析此空间失败');

      let inputs = options?.args;
      let outputIndex = -1;
      
      if (!inputs?.length) {
        let [inps, inpIndex, outIndex ] = parseInputs(fn_index, config);
        inps[inpIndex] = prompt;
        inputs = inps;
        outputIndex = outIndex;
      }

      debug('inputs', fn_index, JSON.stringify(inputs));
      let app = submit(fn_index, inputs);
      while (dependencies[++fn_index]?.trigger === 'then') {
        let [inps, _, outIndex ] = parseInputs(fn_index, config, true);
        outputIndex = outIndex;
        app = submit(fn_index, inps);
      }

      let completed = false;
      let dataReturned = false;
      let errorMessage = '';

      let lastMessage = '';
      const handleData = (event: Event<'data'>) => {
        dataReturned = true;
        const { data = [] } = event || {};
        if (outputIndex === -1) {
          outputIndex = data.findIndex((row: any) => JSON.stringify(row).indexOf('<') > -1);
        }
        const message = traverseContent(data?.at(outputIndex) ?? []);

        if (errorMessage) {
          options?.onError?.(errorMessage);
        } else {
          lastMessage = message ? NodeHtmlMarkdown.translate(message).replace(/�/g, '') : '';
          options?.onMessage?.(lastMessage);
        }
        if (completed) {
          app.destroy();
        }
      };

      const handleStatus = (event: Status & Event<'status'>) => {
        // @ts-ignore
        const status = event.stage || event.status;
        debug('response status', status);
        if (status === 'error') {
          if (completed) return;
          completed = true;
          errorMessage = event.message || status;
          debug('error message', errorMessage);
          reject(errorMessage);
        } else if (status === 'complete') {
          debug('complete');
          completed = true;
          resolve(lastMessage);
          if (dataReturned) {
            app.destroy();
          }
        }
      };

      app.on("status", handleStatus);
      app.on("data", handleData);

      options?.abort?.addEventListener('abort', () => {
        debug('abort signal', options?.abort?.reason);
        app.cancel();
        app.destroy();
        reject(options?.abort?.reason || 'canceled');
      });
    } catch (e) {
      reject(e);
    }
  });
};
