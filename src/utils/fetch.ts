import axios, { AxiosRequestConfig } from 'axios';
import Debug from 'debug';
const debug = Debug('llmbot:fetch');

export default async function fetch(url: string, options?: AxiosRequestConfig<any> & { body?: any }): Promise<Response> {
  debug('fetch', options?.method || 'GET', url);
  if (options?.body) {
    options.data = JSON.parse(options.body);
    delete options?.body;
  }
  const response = await axios(url, {
    ...options,
    validateStatus: () => true,
  });
  // @ts-ignore
  debug('fetch', options?.method || 'GET', url, response?.status);
  if (!response?.status) {
    console.log(response);
  }
  return {
    ...response,
    // @ts-ignore
    ok: response?.statusText,
    // @ts-ignore
    status: response?.status ?? 500,
    json: () => {
      // @ts-ignore
      return response?.data;
    },
  } as unknown as Response;
}
