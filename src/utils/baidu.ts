import { API } from "./api";
// import * as vscode from 'vscode';
const md5 = require("md5");

const url: string = "http://api.fanyi.baidu.com/api/trans/vip/translate";
const appid: string = "20230122001537266";
const secrectKey: string = "iSC0xuACrRDVLfUrDviL";
const salt: string = "1435660288";

const getSign = (
  q: string = "",
  baiduAppid: string = "",
  baiduSecrectKey: string = ""
) => {
  let str = "";
  if (baiduAppid && baiduSecrectKey) {
    str = baiduAppid + q + salt + baiduSecrectKey;
  } else {
    str = appid + q + salt + secrectKey;
  }
  return md5(str);
};

const sleep = (time: number) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, time);
  });
};
export class Baidu {
  /**
   * 百度翻译
   */
  static getTranslate = async (params: any = {}) => {
    // 改为调用新接口：POST https://api-fpfoc-gj.test.yingzi.com/api/fpf/oc/difyTest
    const { cookie, query, inputLanguage = "中文" } = params;
    const postUrl = "https://api-fpfoc-gj.test.yingzi.com/api/fpf/oc/difyTest";
    const postData = {
      query: query,
      inputLanguage,
    };
    const headers: any = {};
    if (cookie) headers.Cookie = cookie;

    try {
      const data = await API.POST(postUrl, postData, headers);
      return { data };
    } catch (err) {
      return { data: null, message: String(err), success: false };
    }
  };
}
