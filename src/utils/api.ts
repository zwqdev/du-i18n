const fetch = require("node-fetch").default;
const debounce = require("lodash/debounce");
import { md5 } from "js-md5";
const JSEncrypt = require("jsencrypt");

const publicUrl =
  "https://login.test.yingzi.com/api/sso/v1/security/keyPair/public";
const loginUrl = "https://login.test.yingzi.com/api/sso/v1/auth/login";

const GET = async (url: any, params: any = {}) => {
  const apiUrl = Object.entries(params)
    .filter(Boolean)
    .reduce((pre, cur, i) => {
      let p = i === 0 ? "?" : "&";
      p += `${cur[0]}=${cur[1]}`;
      return pre + p;
    }, url);
  return fetch(apiUrl).then((res: any) => res.json());
};

const POST = async (url: any, params: any = {}, headers: any = {}) => {
  return fetch(url, {
    method: "post",
    body: JSON.stringify(params),
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  }).then((res: any) => res.json());
};

// 限流
const delayTime = 100;
const debouncedGet = debounce(GET, delayTime, {
  leading: true,
  trailing: false,
});
const debouncedPost = debounce(POST, delayTime, {
  leading: true,
  trailing: false,
});

export class API {
  /**
   * GET请求
   * @param url
   * @param params
   * @returns
   */
  static async GET(url: string, params: any, headers: any = {}) {
    console.log("GET", url, params);
    return debouncedGet(url, params, headers);
  }

  /**
   * POST请求
   * @param url
   * @param params
   * @returns
   */
  static async POST(url: string, params: any, headers: any = {}) {
    return POST(url, params, headers);
  }
}

/**
 * 账号密码登录（RSA+md5签名），固定接口地址：
 *
 * captcha 可选，结构 { captchaSig?, captchaToken?, captchaSessionId? }
 */
export async function loginByAccount(
  username = "yz_admin",
  password = "yz123456",
  captcha?: {
    captchaSig?: string;
    captchaToken?: string;
    captchaSessionId?: string;
  }
): Promise<any> {
  try {
    // 获取公钥信息
    const pubResp = await fetch(publicUrl, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const pubJson = await pubResp.json();

    if (!pubJson || pubJson.code !== "000000" || !pubJson.data) {
      return {
        success: false,
        code: pubJson?.code,
        msg: pubJson?.msg || "get public key failed",
      };
    }

    const { uid, publicKey, timestamp, pbkSha } = pubJson.data;

    // 计算 sign = md5(uid + publicKey + timestamp)
    const sign = md5(String(uid) + String(publicKey) + String(timestamp));

    // RSA 加密密码
    const jsEncrypt = new JSEncrypt();
    jsEncrypt.setPublicKey(publicKey);
    const encryptedPwd = jsEncrypt.encrypt(password);
    if (!encryptedPwd) {
      return { success: false, msg: "RSA encrypt password failed" };
    }

    // 构造登录请求体
    const body: any = {
      pbkSha,
      username,
      password: encryptedPwd,
      source: "web-common",
      sign,
    };

    // 合并 captcha 参数（如果有）
    if (captcha) {
      if (captcha.captchaSig) body.captchaSig = captcha.captchaSig;
      if (captcha.captchaToken) body.captchaToken = captcha.captchaToken;
      if (captcha.captchaSessionId)
        body.captchaSessionId = captcha.captchaSessionId;
    }

    // 发送登录请求
    const loginResp = await fetch(loginUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const loginJson = await loginResp.json();

    // 直接返回后端原始响应（调用方根据 code 处理）
    return loginJson;
  } catch (error: any) {
    return { success: false, msg: error?.message || String(error) };
  }
}
