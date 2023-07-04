import assert from "assert";
import Debug from 'debug';
import fetch from "../utils/fetch";
import ua from "../utils/ua";
import { sleep } from "../utils/lock";

const debug = Debug('llmbot:midjourney');

export default class MJ {
  private headers: Record<string, string> = {};
  constructor(readonly UUID = process.env.MJ_UUID) {
    assert(this.UUID, 'MJ_UUID 不能为空');
    this.headers = {
      UUID: this.UUID!,
      'Content-Type': 'application/json',
      'User-Agent': ua,
    };
  }
  async drawImage(prompt: string) {
    const response = await fetch('http://midjourney-api.ai-des.com/func2api/Imagine', {
      headers: this.headers,
      method: 'POST',
      body: {
        type: 'P',
        prompt: `${prompt}`,
      },
    }).then(res => res.json());

    const { imgId } = response?.data || {};
    debug('imgId', imgId);
    assert(imgId, '图片生成失败');
    return this.getImage(imgId);
  }

  async getImage(imgId) {
    let count = 60;
    while (count--) {
      await sleep(6000);
      const imgUrl = await this._getImage(imgId);
      if (imgUrl) {
        return imgUrl;
      }
    }
    throw new Error('获取图片链接失败');
  }

  private async _getImage(imgId) {
    const response = await fetch('http://midjourney-api.ai-des.com/func2api/GetPicByImgID', {
      headers: this.headers,
      method: 'POST',
      body: {
        imgId,
      },
    }).then(res => res.json()).catch(e => debug(e));
    const { mjSrcUrl } = response?.data || {};
    debug(mjSrcUrl);
    return mjSrcUrl;
  }
}
