import { API } from "./api";

export class YZ {
  /**
   * 翻译
   */
  static getTranslate = async (params: any = {}) => {
    const { cookie, query, inputLanguage = "中文" } = params;
    const postUrl = "https://api-fpfoc.test.yingzi.com/api/fpf/oc/difyTest";
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
