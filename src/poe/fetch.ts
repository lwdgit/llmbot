import axios, { AxiosRequestConfig } from 'axios';

export default async function fetch(url: string, options?: AxiosRequestConfig<any>) {
  const response = await axios(url, options).catch(e => console.log(e.message));
  return {
    ...response,
    json: () => {
      // @ts-ignore
      return response?.data;
    },
  };
}
