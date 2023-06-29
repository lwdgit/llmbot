// original code https://github.com/acheong08/OpenAIAuth/blob/main/src/OpenAIAuth.py

import assert from 'assert';
import axios from 'axios';
import ua from './ua';

export default class Auth {
  session_token: string;
  email: string;
  password: string;
  mfa: string;
  access_token: string;
  expires: number;
  puid: string;
  cookie: string;
  constructor(
    email,
    password,
    mfa = '',
  ) {
    this.email = email;
    this.password = password;
    this.mfa = mfa;
    axios.defaults.validateStatus = () => true;
    axios.defaults.maxRedirects = 0;
  }

  private __check_email(email: string) {
    const regex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b/
    return regex.test(email);
  }

  getAccessToken() {
    assert(this.__check_email(this.email) && this.password, 'invalid email or password.');
    return this.__part_two();
  }

  private __part_two() {
    const code_challenge = "w6n3Ix420Xhhu-Q5-mOOEyuPZmAsJHUbBpO8Ub7xBCY"
    const code_verifier = "yGrXROHx_VazA0uovsxKfE263LMFcrSrdm4SlC-rob8"

    const url = `https://auth0.openai.com/authorize?client_id=pdlLIX2Y72MIl2rhLhTE9VV9bN905kBh&audience=https%3A%2F%2Fapi.openai.com%2Fv1&redirect_uri=com.openai.chat%3A%2F%2Fauth0.openai.com%2Fios%2Fcom.openai.chat%2Fcallback&scope=openid%20email%20profile%20offline_access%20model.request%20model.read%20organization.read%20offline&response_type=code&code_challenge=${code_challenge}&code_challenge_method=S256&prompt=login`;

    return this.__part_three(code_verifier, url);
  }

  private async __part_three(code_verifier: string, url: string): Promise<string> {
    const headers = {
      "User-Agent": ua,
      "Referer": "https://ios.chat.openai.com/",
    }
    let resp = await axios.get(url, { headers });
    if (resp.status == 302) {
      try {
        const location = resp.headers["location"];
        if (!location.startsWith("/u/login/identifier")) {
          throw new Error("Login failed.");
        }
        if (!Array.isArray(resp.headers['set-cookie'])) {
          throw new Error("Login failed.");
        }
        this.cookie = resp.headers['set-cookie'].map(cookie => cookie.split(';')[0]).join('; ')
        const url_params = new URL(location, url).searchParams;
        const state = url_params.getAll('state')[0];
        return this.__part_four(code_verifier, state)
      } catch (e: unknown) {
        throw new Error(`Rate limit hit. ${e}`);
      }
    } else {
      throw new Error(`Error request login url. ${resp.status}`)
    }
  }

  private async __part_four(code_verifier: string, state: string): Promise<string> {
    const url = "https://auth0.openai.com/u/login/identifier?state=" + state
    const headers = {
      "User-Agent": ua,
      "Referer": url,
      "Origin": "https://auth0.openai.com",
      cookie: this.cookie,
    }
    const data = {
      "state": state,
      "username": this.email,
      "js-available": "true",
      "webauthn-available": "true",
      "is-brave": "false",
      "webauthn-platform-available": "false",
      "action": "default",
    }
    const resp = await axios.post(
      url,
      data,
      {
        headers,
      },
    )

    if (resp.status == 302) {
      return this.__part_five(code_verifier, state)
    } else {
      throw new Error("Error check email.")
    }
  }

  private async __part_five(code_verifier: string, state: string): Promise<string> {
    const url = "https://auth0.openai.com/u/login/password?state=" + state
    const headers = {
      "User-Agent": ua,
      "Referer": url,
      "Origin": "https://auth0.openai.com",
      cookie: this.cookie,
    }
    const data = {
      "state": state,
      "username": this.email,
      "password": this.password,
      "action": "default",
    }

    const resp = await axios.post(url, data, { headers });
    if (resp.status == 302) {
      const location = resp.headers["location"];
      if (!location.startsWith("/authorize/resume?")) {
        throw new Error("Login failed.");
      }

      return this.__part_six(code_verifier, location, url)
    }

    if (resp.status == 400) {
      throw new Error("Wrong email or password.")
    }
    throw new Error("Error login.")
  }

  private async __part_six(code_verifier: string, location: string, ref: string): Promise<string> {
    const url = "https://auth0.openai.com" + location
    const headers = {
      "User-Agent": ua,
      "Referer": ref,
      cookie: this.cookie,
    }

    const resp = await axios.get(url, { headers });
    if (resp.status == 302) {
      location = resp.headers["location"]
      if (location.startsWith("/u/mfa-otp-challenge?")) {
        if (!this.mfa) {
          throw new Error("MFA required.")
        }
        return this.__part_seven(code_verifier, location)
      }

      if (!location.startsWith(
        "com.openai.chat://auth0.openai.com/ios/com.openai.chat/callback?"
      )) {
        throw new Error("Login callback failed.")
      }

      return this.__get_access_token(code_verifier, resp.headers["location"]);
    }

    throw new Error("Error login.")
  }
  private async __part_seven(code_verifier: string, location: string): Promise<string> {
    const url = "https://auth0.openai.com" + location
    const data = {
      "state": new URL(url).searchParams.getAll("state")[0],
      "code": this.mfa,
      "action": "default",
    }
    const headers = {
      "User-Agent": ua,
      "Referer": url,
      "Origin": "https://auth0.openai.com",
      cookie: this.cookie,
    }

    const resp = await axios.post(
      url, data, { headers }
    );
    if (resp.status == 302) {
      const location = resp.headers["location"]
      if (!location.startswith("/authorize/resume?")) {
        throw new Error("MFA failed.")
      }

      return this.__part_six(code_verifier, location, url)
    }

    if (resp.status == 400) {
      throw new Error("Wrong MFA code.")
    } else {
      throw new Error("Error login.")
    }
  }

  private async __get_access_token(code_verifier: string, callback_url: string): Promise<string> {
    const url_params = new URL(callback_url).searchParams;

    if (url_params.has('error')) {
      const error = url_params.getAll("error")[0];
      const error_description = url_params.getAll("error_description")[0];
      throw new Error(`${error}: ${error_description}`)
    }

    if (!url_params.has("code")) {
      throw new Error("Error get code from callback url.")
    }

    const url = "https://auth0.openai.com/oauth/token"
    const headers = {
      "User-Agent": ua,
      cookie: this.cookie,
    }
    const data = {
      "redirect_uri": "com.openai.chat://auth0.openai.com/ios/com.openai.chat/callback",
      "grant_type": "authorization_code",
      "client_id": "pdlLIX2Y72MIl2rhLhTE9VV9bN905kBh",
      "code": url_params.getAll("code")[0],
      "code_verifier": code_verifier,
    }
    const resp = await axios.post(
      url, data, { headers }
    )

    if (resp.status == 200) {
      const json = resp.data;
      if (!json['access_token']) {
        throw new Error("Get access token failed, maybe you need a proxy.")
      }

      this.access_token = json["access_token"]
      this.expires = Date.now()
        + json['expires_in'] * 1000
        - 5 * 60000

      return this.access_token;
    } else {
      throw new Error(resp.statusText)
    }

  }
  async getPuid(): Promise<string> {
    const url = "https://bypass.churchless.tech/models"
    const headers = {
      "Authorization": "Bearer " + this.access_token,
    }
    const resp = await axios.get(url, { headers });
    if (resp.status == 200) {
      // Get _puid cookie
      const puid = String(resp.headers["set-cookie"] || '');
      if (!puid) {
        throw new Error("Get _puid cookie failed.")
      }
      this.puid = puid.split("_puid=")[1].split(";")[0]
      return this.puid;
    } else {
      throw new Error(resp.statusText)
    }
  }
}
