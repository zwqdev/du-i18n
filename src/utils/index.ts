import * as vscode from "vscode";
import MapCache from "./cache";
import { YZ } from "./yzApi";
import { FileIO } from "./fileIO";
import { Message } from "./message";
import { loginByAccount } from "./api";
const path = require("path");
const fs = require("fs");
const YAML = require("yaml");
const merge = require("lodash/merge");
const isEmpty = require("lodash/isEmpty");
const chunk = require("lodash/chunk");
import * as babelParser from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
const MagicString = require("magic-string");
import { parse as vueSfcParse } from "@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js";
import { baseParse as vueBaseParse, NodeTypes } from "@vue/compiler-dom";
// removed unused: compilerDom

// 频繁调用，缓存计算结果
const RegCache = new MapCache();
// ...existing code...
const chineseCharReg = /[\u4e00-\u9fa5]/;
let decorationType = null;
const boundaryCodes = ['"', "'", "`"]; // 字符串边界
const SPLIT = "---$$_$$---";
// 统一翻译批次大小默认值（可通过配置覆盖）
export const DEFAULT_TRANS_BATCH_SIZE = 10;

export class Utils {
  /**
   * Safely parse JSON-like text. If parse fails, logs and returns null.
   * Accepts strings that look like JSON objects/arrays. Does NOT use eval.
   */
  static parseJsonSafe<T = any>(text: string): T | null {
    if (!text || typeof text !== "string") return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      try {
        // Some files may contain trailing commas or single quotes; attempt a tolerant cleanup
        const cleaned = text
          .replace(
            /([\{\[,]?)\s*(["'])(.*?)\2\s*:/g,
            (m, p1, q, inner) => `${p1}"${inner}":`
          ) // normalize quoted keys
          .replace(/,\s*([}\]])/g, "$1"); // remove trailing commas
        return JSON.parse(cleaned);
      } catch (err) {
        console.error("parseJsonSafe parse error", err);
        return null;
      }
    }
  }
  // Promise wrapper for FileIO.handleWriteStream to ensure writes complete before returning
  static writeFileAsync(filePath: string, content: string) {
    return new Promise<void>((resolve, reject) => {
      try {
        // Use sync write to ensure write completes reliably in this context.
        fs.writeFileSync(filePath, content, { encoding: "utf8" });
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 获取复制对象的value
   * 如{ "a.b": 1, a: { c: 2, d: [{e: 'e'}, {f: 'f'}] } }，获取obj, 'a.d.1.f'
   * @param obj
   * @param key
   * @returns
   */
  static getObjectValue(obj: any, key: string) {
    if (Object.prototype.toString.call(obj) === "[object Object]") {
      if (Object(obj).hasOwnProperty(key)) {
        return obj[key];
      } else {
        if (key.indexOf(".") > -1) {
          return key
            .split(".")
            .reduce(
              (pre, k) => (Object(pre).hasOwnProperty(k) ? pre[k] : undefined),
              obj
            );
        }
      }
    }
    return undefined;
  }

  static getStringValue(val: any) {
    if (
      Object.prototype.toString.call(val) === "[object Object]" ||
      Array.isArray(val)
    ) {
      return JSON.stringify(val);
    }
    return val ? val.toString() : val;
  }

  static getRegExpStr(str: string) {
    if (str) {
      return str.replace(/([\.\(\)\$\*\+\[\?\]\{\}\|\^\\])/g, "\\$1");
    }
    return "";
  }

  static getRegExp(str: string) {
    if (!RegCache.get(str)) {
      let completionKeyStr = Utils.getRegExpStr(str);
      completionKeyStr = completionKeyStr
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .join("|");
      const reg = new RegExp(`([\\s{'"]+)(${completionKeyStr})([\\('"])?`);
      RegCache.set(str, reg);
    }
    return RegCache.get(str);
  }

  static getStringText(val: any) {
    if (
      Array.isArray(val) ||
      Object.prototype.toString.call(val) === "[object Object]"
    ) {
      return JSON.stringify(val);
    }
    return val ? val.toString() : val;
  }

  static replaceText(data: string, template: string, newText: string) {
    if (!data) {
      return data;
    }
    const startIndex = data.indexOf(template) + template.length;
    const endIndex = data.indexOf(template, startIndex);
    return data.slice(0, startIndex) + newText + data.slice(endIndex);
  }

  static handleScanFileInner(data: string, filePath: string) {
    try {
      // 公司内部自定义的格式
      if (data && data.indexOf("</i18n>") > -1) {
        const i18nSrcReg = /<i18n\ssrc=+(([\s\S])*?)>(.*\s)?<\/i18n>/g;
        let yamlStr = "";
        let yamlObjList = [];
        let yamlObj = null;
        let urlPath = "";
        let langFilePath = {};
        let count = 0;
        let res = null;
        let startIndex = -1;
        let endIndex = 0;
        while ((startIndex = data.indexOf("<i18n>", endIndex)) > -1) {
          // 可能存在多个的情况
          endIndex = data.indexOf("</i18n>", startIndex);
          yamlStr = data.substring(startIndex + 6, endIndex);
          urlPath = filePath;
          yamlObjList.push(YAML.parse(yamlStr));
        }

        if (count > 0) {
          // <i18n>在外部文件
          if (count === 1) {
            // 所有语言在一个文件
            langFilePath = {};
          } else {
            // 所有语言在多个文件
            urlPath = "";
          }
        }

        // ...existing code...
        if (yamlObjList.length) {
          yamlObj = merge(...yamlObjList);
        }
        // ...existing code...
        // 设置默认key
        const keys = Object.keys(yamlObj || {});
        let defaultKey = "en"; // 默认值
        if (Array.isArray(keys)) {
          if (keys.includes["zh-TW"]) {
            // 特殊设置
            defaultKey = "zh-TW";
          } else {
            defaultKey = keys[0];
          }
        }
        // langFilePath
        return {
          language: yamlObj,
          defaultKey,
          filePath: urlPath,
          langFilePath,
          type: "yaml",
        };
      }
    } catch (e) {
      console.error("handleScanFileInner error", e);
    }
    return null;
  }

  static showDecoration(
    editor: vscode.TextEditor,
    positionObj: any,
    lang: object
  ) {
    if (editor && positionObj) {
      const foregroundColor = new vscode.ThemeColor(
        "editorCodeLens.foreground"
      );

      // 坑：一定要先清空，否则会出现重复的情况，即使将全局变量decorationType改成局部变量也无效
      if (decorationType != null) {
        // 释放操作
        decorationType.dispose();
      }

      decorationType = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        overviewRulerColor: "grey",
        overviewRulerLane: vscode.OverviewRulerLane.Left,
      });

      const decorationOptions: any = [];
      // ...existing code...
      Object.entries(positionObj).forEach(([k, v]: any) => {
        const p: any = k.split("-");
        if (p && p.length === 2) {
          const startPosition = editor.document.positionAt(p[0]);
          const endPosition = editor.document.positionAt(p[1]);
          const range = new vscode.Range(startPosition, endPosition);
          const value = Utils.getObjectValue(lang, v);
          const text = Utils.getStringText(value);
          const item = {
            range,
            renderOptions: {
              after: {
                contentText: ` ${text}`,
                color: foregroundColor,
                opacity: "0.6",
              },
            },
          };
          decorationOptions.push(item);
        }
      });
      editor.setDecorations(decorationType, decorationOptions);
    }
  }

  // 打开配置
  static openConfigCommand() {
    vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "国际多语言配置"
    ); // 用户区
  }

  // 分析与统计
  static async handleAnalystics(
    selectFolderPath: any,
    bigFileLineCount: number,
    base: string = "src"
  ) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!selectFolderPath) {
          return reject(null);
        }

        const folderPaths = selectFolderPath
          .replace(/\//g, path.sep)
          .split(path.sep);
        // ...existing code...
        const len = folderPaths.length;
        if (len) {
          let folderUrl = folderPaths[len - 1];
          if (folderPaths.includes(base)) {
            folderUrl = folderPaths
              .slice(folderPaths.indexOf(base))
              .join(path.sep);
          }
          folderUrl = "**" + path.sep + folderUrl + path.sep + "**";
          const files = await FileIO.getFiles(folderUrl);
          // ...existing code...
          let bigFileList = [],
            fileTypeObj = {},
            indexFileObj = {};
          const addPath = (fsPath, count) => {
            let arr = fsPath.split(path.sep);
            let filePath = fsPath;
            if (arr.includes(base)) {
              filePath = arr.slice(arr.indexOf(base)).join(path.sep);
            }
            bigFileList.push({ path: filePath, count });
          };
          files.forEach(({ fsPath }) => {
            const indexFile = "index";
            const fileName = path.basename(fsPath);
            const fileType = "." + fileName.split(".")[1];
            const data = fs.readFileSync(fsPath, "utf-8");
            const arr = (data && data.match(/\n/g)) || [];
            if (arr.length >= bigFileLineCount) {
              addPath(fsPath, arr.length);
            }
            if (fileName.startsWith(indexFile)) {
              if (!indexFileObj[fileName]) {
                indexFileObj[fileName] = 1;
              } else {
                indexFileObj[fileName]++;
              }
            }
            if (!fileTypeObj[fileType]) {
              fileTypeObj[fileType] = 1;
            } else {
              fileTypeObj[fileType]++;
            }
          });
          bigFileList.sort((a, b) => b.count - a.count);
          resolve({ bigFileList, fileTypeObj, indexFileObj });
        }
      } catch (e) {
        console.error("handleAnalystics e", e);
        reject(e);
      }
    });
  }

  // 统计本地无用的数据
  static async ananlysisLocalGlobal(filePath: any) {
    const prefix = `global_`;
    const globalLangObj = {};
    const newLangObj = {};
    const getObj = (fPath) => {
      const data = fs.readFileSync(fPath, "utf-8");
      const startIndex = data.indexOf("{");
      const endIndex = data.lastIndexOf("}");
      if (startIndex < 0 || endIndex < 0) {
        return {};
      }
      const dataStr = data.substring(startIndex, endIndex + 1);
      const langObj = Utils.parseJsonSafe(dataStr) || {};
      return langObj;
    };
    const sourcePath = "**/src/i18n/locale/**";
    const files = await FileIO.getFiles(sourcePath);
    files.forEach(({ fsPath }) => {
      const fileName = path.basename(fsPath);
      const lang = fileName.split(".")[0];
      if (/\.(js)$/.test(fileName)) {
        try {
          globalLangObj[lang] = getObj(fsPath);
        } catch (e) {
          console.error(e);
        }
      }
    });
    if (!isEmpty(globalLangObj)) {
      Object.entries(globalLangObj).forEach(([lang, obj]) => {
        let langMap = {};
        Object.entries(obj).forEach(([k, v]) => {
          if (
            !k.startsWith(prefix) &&
            globalLangObj["zh"] &&
            globalLangObj["zh"][k]
          ) {
            langMap[k] = v;
          }
        });
        newLangObj[lang] = langMap;
      });
    }
    const fileName = "/未上传的文案集合.md";
    // const newFilePath = getBaseFilePath(filePath, fileName);
    // ...existing code...
    const newFilePath = await FileIO.writeContentToLocalFile(
      filePath,
      fileName,
      newLangObj
    );
    return newFilePath;
  }

  // 生成临时文件
  static getRandFileName(pageEnName: string, fileType: string) {
    const date = new Date();
    let rand = "";
    rand += date.getFullYear();
    rand += "-";
    rand += date.getMonth() + 1;
    rand += "-";
    rand += date.getDate();
    rand += "-";
    rand += date.getTime().toString().substr(-6);
    return `${pageEnName}_${rand}${fileType}`;
  }

  static getGenerateNewLangObj(
    keys: any[],
    defaultLang: string,
    initLang: string[],
    keyPrefix: string,
    varObj: any,
    startingIndex: number = 0 // 新增：当文件中已存在旧 key 时的起始偏移
  ) {
    let langObj = {};
    if (keys.length) {
      if (defaultLang) {
        langObj[defaultLang] = {};
      }
      (initLang || []).forEach((lang) => {
        langObj[lang] = {};
      });
      (keys || []).filter(Boolean).forEach((char, i) => {
        const key = `${keyPrefix}${startingIndex + i}`;
        langObj[defaultLang][key] =
          (varObj && varObj[char] && varObj[char].newKey) || char;
        (initLang || []).forEach((lang) => {
          langObj[lang][key] = "";
        });
      });
    }
    return langObj;
  }

  /**
   * 扫描中文字符并初始化生成i18n
   * @param data
   * @param filePath
   */
  static handleScanAndInit(
    filePath: string,
    initLang: string[],
    quoteKeys: string[],
    defaultLang: string,
    prefixKey: string,
    hookImport: string,
    skipExtractCallees: string[],
    cb: Function
  ) {
    try {
      Utils.astProcessFile(
        filePath,
        initLang,
        quoteKeys,
        defaultLang,
        prefixKey,
        hookImport,
        {
          skipExtractCallees: Array.isArray(skipExtractCallees)
            ? skipExtractCallees
            : [],
        }
      )
        .then((newLangObj: any) => {
          if (newLangObj) cb(newLangObj);
        })
        .catch((e: any) => {
          console.error("astProcessFile error", e);
        });
    } catch (e) {
      console.error("handleScanAndInit e", e);
    }
  }

  // 尝试用 AST 解析并替换文件（若缺少依赖或类型不支持则返回 null）
  static async astProcessFile(
    filePath: string,
    initLang: string[],
    quoteKeys: string[],
    defaultLang: string,
    prefixKey: string,
    hookImport: string,
    options: { skipExtractCallees?: string[] } = {}
  ) {
    try {
      const code = fs.readFileSync(filePath, "utf-8");

      // Vue 单文件组件处理
      if (/\.vue$/.test(filePath)) {
        return await Utils._processVueSfc(filePath, code, {
          quoteKeys,
          prefixKey,
          defaultLang,
          initLang,
          hookImport,
          skipExtractCallees: options.skipExtractCallees || [],
        });
      }

      // 普通脚本 / JSX / TSX 处理
      if (/\.(js|ts|jsx|tsx)$/.test(filePath)) {
        // 计算已存在的最大索引，避免重复 key（文件可能已部分翻译）
        let keyOffset = 0;
        try {
          if (prefixKey) {
            const escaped = prefixKey.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");
            const reg = new RegExp(`${escaped}(\\d+)`, "g");
            let m: RegExpExecArray | null;
            while ((m = reg.exec(code))) {
              const n = parseInt(m[1], 10);
              if (!isNaN(n) && n + 1 > keyOffset) keyOffset = n + 1;
            }
          }
        } catch (e) {}
        const {
          code: outCode,
          found,
          varObj,
        } = Utils._transformScriptContent(code, filePath, {
          quoteKeys,
          prefixKey,
          jsx: /\.(jsx|tsx)$/.test(filePath),
          skipExtractCallees: options.skipExtractCallees || [],
          keyOffset,
        });
        if (!found.length) return null;
        // If a hookImport is provided, attempt to inject it into the transformed script
        let finalOutCode = outCode;
        try {
          if (hookImport) {
            finalOutCode = Utils.insertImports(finalOutCode, hookImport);
            // Ensure there's a newline between adjacent import statements after insertion
            finalOutCode = finalOutCode.replace(/;\s*(?=import\b)/g, ";\n");
            finalOutCode = finalOutCode.replace(
              /from\s+((?:'[^']*'|"[^"]*"))\s*(?=import\b)/g,
              "from $1\n"
            );
          }
        } catch (e) {
          // ignore injection errors and fall back to writing the transformed code
          finalOutCode = outCode;
        }
        await Utils.writeFileAsync(filePath, finalOutCode);
        return Utils.getGenerateNewLangObj(
          found,
          defaultLang,
          initLang,
          prefixKey,
          { ...varObj, ...Utils.getVarObj(found) },
          keyOffset
        );
      }
      return null; // 非支持类型
    } catch (e) {
      // Surface error to caller so they can distinguish parse/IO errors
      throw e;
    }
  }

  // ===== 以下为 AST 辅助与拆分的子方法 =====
  private static _containsChinese(s: string) {
    return /[\u4e00-\u9fa5]/.test(s);
  }

  private static _createGuards(parentCache?: WeakMap<any, any>) {
    // parentCache stores computed flags per AST node to avoid repeated upward traversals.
    const cache: WeakMap<any, any> = parentCache || new WeakMap();
    const getInfo = (node: any) => {
      let info = cache.get(node);
      if (!info) {
        info = {};
        cache.set(node, info);
      }
      return info;
    };

    const isInsideConsoleCall = (path: any) => {
      // check cached result for starting node
      const startInfo = cache.get(path.node);
      if (startInfo && startInfo.isInsideConsoleCall !== undefined)
        return startInfo.isInsideConsoleCall;

      let p = path.parentPath;
      while (p) {
        const cached = cache.get(p.node);
        if (cached && cached.isInsideConsoleCall !== undefined)
          return cached.isInsideConsoleCall;
        if (p.isCallExpression && p.isCallExpression()) {
          const callee = p.node.callee;
          if (
            t.isMemberExpression(callee) &&
            t.isIdentifier(callee.object, { name: "console" })
          ) {
            // mark positive on this ancestor and for starter
            getInfo(p.node).isInsideConsoleCall = true;
            getInfo(path.node).isInsideConsoleCall = true;
            return true;
          }
        }
        p = p.parentPath;
      }
      getInfo(path.node).isInsideConsoleCall = false;
      return false;
    };

    const isInsideDecorator = (path: any) => {
      const startInfo = cache.get(path.node);
      if (startInfo && startInfo.isInsideDecorator !== undefined)
        return startInfo.isInsideDecorator;
      let p = path.parentPath;
      while (p) {
        const cached = cache.get(p.node);
        if (cached && cached.isInsideDecorator !== undefined)
          return cached.isInsideDecorator;
        if (p.node && p.node.type === "Decorator") {
          getInfo(p.node).isInsideDecorator = true;
          getInfo(path.node).isInsideDecorator = true;
          return true;
        }
        p = p.parentPath;
      }
      getInfo(path.node).isInsideDecorator = false;
      return false;
    };

    return { isInsideConsoleCall, isInsideDecorator, cache };
  }

  private static _buildCallee(name: string) {
    if (!name) return t.identifier("$t");
    if (name.indexOf(".") > -1) {
      const parts = name.split(".");
      let e: any = t.identifier(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        e = t.memberExpression(e, t.identifier(parts[i]));
      }
      return e;
    }
    return t.identifier(name);
  }

  private static _nodeCode(node: any) {
    try {
      return generate(node).code;
    } catch (e) {
      return "";
    }
  }

  private static _isInsideI18nCall(
    path: any,
    calleeName: string,
    parentCache?: WeakMap<any, any>
  ) {
    const cache: WeakMap<any, any> = parentCache || new WeakMap();
    const getInfo = (node: any) => {
      let info = cache.get(node);
      if (!info) {
        info = {};
        cache.set(node, info);
      }
      return info;
    };

    const startInfo = cache.get(path.node);
    if (startInfo && startInfo.i18n && startInfo.i18n[calleeName] !== undefined)
      return startInfo.i18n[calleeName];

    let p = path.parentPath;
    while (p) {
      const info = cache.get(p.node);
      if (info && info.i18n && info.i18n[calleeName] !== undefined)
        return info.i18n[calleeName];
      if (p.isCallExpression && p.isCallExpression()) {
        try {
          const c = generate(p.node.callee).code;
          if (c === calleeName) {
            const ii = getInfo(p.node);
            ii.i18n = ii.i18n || {};
            ii.i18n[calleeName] = true;
            getInfo(path.node).i18n = getInfo(path.node).i18n || {};
            getInfo(path.node).i18n[calleeName] = true;
            return true;
          }
        } catch (e) {}
      }
      p = p.parentPath;
    }
    getInfo(path.node).i18n = getInfo(path.node).i18n || {};
    getInfo(path.node).i18n[calleeName] = false;
    return false;
  }

  private static _transformScriptContent(
    scriptContent: string,
    filePath: string,
    opts: {
      quoteKeys: string[];
      prefixKey: string;
      jsx?: boolean;
      forceTs?: boolean;
      skipExtractCallees?: string[];
      keyOffset?: number; // 新增：全局 key 偏移（用于 Vue 模板已占用的条目数）
      keyNamespace?: string; // 可选：当提供时，生成的 key 使用此命名空间 (例如 "prefixscript.")
    }
  ): { code: string; found: string[]; varObj: any } {
    const {
      quoteKeys,
      prefixKey,
      forceTs,
      skipExtractCallees = [],
      keyOffset = 0,
      keyNamespace,
    } = opts;
    // 收集需要忽略提取的行（含有 @i18n-ignore 标记的行，或紧随其后的下一行）
    const ignoreLineSet = new Set<number>();
    scriptContent.split(/\n/).forEach((line, idx) => {
      if (line.includes("@i18n-ignore")) {
        const lineNo = idx + 1; // 1-based
        ignoreLineSet.add(lineNo);
        ignoreLineSet.add(lineNo + 1); // 允许注释单独一行在目标代码上一行
      }
    });
    const plugins: any[] = [
      "classProperties",
      "dynamicImport",
      "optionalChaining",
    ];
    const isTs =
      !!forceTs ||
      /\.(ts|tsx)$/.test(filePath) ||
      /lang=\"ts\"/.test(scriptContent);
    if (isTs) plugins.push("typescript");
    if (opts.jsx || filePath.endsWith(".tsx")) plugins.push("jsx");
    if (/@[A-Za-z_]/.test(scriptContent)) plugins.push("decorators-legacy");

    let ast: any;
    try {
      ast = babelParser.parse(scriptContent, {
        sourceType: "module",
        plugins,
        ranges: true,
        tokens: true,
        locations: true,
      } as any);
    } catch (e) {
      // Rethrow parse errors so caller can handle (avoid silent null)
      throw e;
    }

    const {
      isInsideConsoleCall,
      isInsideDecorator,
      cache: parentCache,
    } = Utils._createGuards();
    const getNodeInfo = (node: any) => {
      let info = parentCache.get(node);
      if (!info) {
        info = {};
        parentCache.set(node, info);
      }
      return info;
    };
    const found: string[] = [];
    const varObj: Record<string, { newKey: string; varList: string[] }> = {};
    const scriptCalleeName = quoteKeys[1] || "i18n.t";
    const jsxCalleeName = quoteKeys[0] || "$t";
    const allocateKey = (original: string) => {
      const idx = found.length; // 局部索引
      found.push(original);
      // 如果提供了命名空间（例如在 Vue SFC 中希望使用 `${prefix}script.`），优先使用它并从 0 开始编号
      if (keyNamespace) {
        return `${keyNamespace}${idx}`;
      }
      return `${prefixKey}${keyOffset + idx}`; // 叠加偏移，确保与最终 foundList 全局序号一致
    };

    const replacements: Array<{ start: number; end: number; text: string }> =
      [];
    const isObjectKey = (path: any) => {
      if (!path || !path.parent) return false;
      const p = path.parent;
      // Object property or method with this node as the key
      if (
        (p.type === "ObjectProperty" ||
          p.type === "ObjectMethod" ||
          p.type === "ClassProperty") &&
        p.key === path.node
      ) {
        return true;
      }
      return false;
    };
    const isInSkippedCallee = (path: any) => {
      if (!skipExtractCallees.length) return false;
      const nodeInfo = parentCache.get(path.node);
      if (nodeInfo && nodeInfo.skipped !== undefined) return nodeInfo.skipped;
      let p = path.parentPath;
      while (p) {
        const pInfo = parentCache.get(p.node);
        if (pInfo && pInfo.skipped !== undefined) {
          // propagate cached result to start node
          getNodeInfo(path.node).skipped = pInfo.skipped;
          return pInfo.skipped;
        }
        if (p.isCallExpression && p.isCallExpression()) {
          try {
            const c = generate(p.node.callee).code;
            if (skipExtractCallees.includes(c)) {
              getNodeInfo(p.node).skipped = true;
              getNodeInfo(path.node).skipped = true;
              return true;
            }
          } catch (e) {}
        }
        p = p.parentPath;
      }
      getNodeInfo(path.node).skipped = false;
      return false;
    };
    traverse(ast, {
      StringLiteral(path: any) {
        const line = path.node.loc && path.node.loc.start.line;
        if (line && ignoreLineSet.has(line)) return; // 被忽略行
        if (isObjectKey(path)) return; // skip object literal keys
        const val = path.node.value;
        if (!val || !Utils._containsChinese(val)) return;
        if (/^\$\$[A-Za-z0-9_]+$/.test(val)) return;
        if (isInsideConsoleCall(path) || isInsideDecorator(path)) return;
        if (isInSkippedCallee(path)) return; // skip configured callees
        if (
          Utils._isInsideI18nCall(path, scriptCalleeName) ||
          Utils._isInsideI18nCall(path, jsxCalleeName)
        )
          return;
        const key = allocateKey(val);
        // Replace by source range
        if (path.node.start != null && path.node.end != null) {
          const text = `${scriptCalleeName}('${key}')`;
          replacements.push({
            start: path.node.start,
            end: path.node.end,
            text,
          });
        }
      },
      TemplateLiteral(path: any) {
        const line = path.node.loc && path.node.loc.start.line;
        if (line && ignoreLineSet.has(line)) return;
        if (isObjectKey(path)) return; // skip object literal keys
        const quasis = path.node.quasis;
        const expressions = path.node.expressions;
        const hasChinese = quasis.some((q: any) =>
          Utils._containsChinese(q.value.cooked)
        );
        if (!hasChinese) return;
        if (isInsideConsoleCall(path) || isInsideDecorator(path)) return;
        if (isInSkippedCallee(path)) return;
        if (
          Utils._isInsideI18nCall(path, scriptCalleeName) ||
          Utils._isInsideI18nCall(path, jsxCalleeName)
        )
          return;
        const originalCode = Utils._nodeCode(path.node);
        const parts: string[] = [];
        const varList: string[] = [];
        for (let i = 0; i < quasis.length; i++) {
          parts.push(quasis[i].value.cooked || "");
          if (i < expressions.length) {
            parts.push(`{${varList.length}}`);
            varList.push(Utils._nodeCode(expressions[i]));
          }
        }
        let builtKey = parts.join("");
        if (builtKey.startsWith("`") && builtKey.endsWith("`")) {
          builtKey = builtKey.slice(1, -1);
        }
        varObj[originalCode] = { newKey: builtKey, varList };
        const key = allocateKey(originalCode);
        let text = `${scriptCalleeName}('${key}')`;
        if (expressions.length) {
          const exprCodes = expressions.map((e: any) => Utils._nodeCode(e));
          text = `${scriptCalleeName}('${key}', [${exprCodes.join(", ")}])`;
        }
        if (path.node.start != null && path.node.end != null) {
          replacements.push({
            start: path.node.start,
            end: path.node.end,
            text,
          });
        }
      },
      JSXText(path: any) {
        const raw = path.node.value || "";
        const val = raw && raw.trim();
        if (!val || !Utils._containsChinese(val)) return;
        const line = path.node.loc && path.node.loc.start.line;
        if (line && ignoreLineSet.has(line)) return;
        if (/^\$\$[A-Za-z0-9_]+$/.test(val)) return;
        if (isInSkippedCallee(path)) return;
        const key = allocateKey(val);
        const leading = raw.match(/^[ \t\n\r]*/)[0];
        const trailing = raw.match(/[ \t\n\r]*$/)[0];
        const text =
          `${leading}{${jsxCalleeName}('${key}')} ${trailing}`.replace(
            /\s+$/,
            trailing
          );
        if (path.node.start != null && path.node.end != null) {
          replacements.push({
            start: path.node.start,
            end: path.node.end,
            text,
          });
        }
      },
      JSXAttribute(path: any) {
        const attr = path.node;
        if (!attr || !attr.value) return;
        const line = attr.loc && attr.loc.start && attr.loc.start.line;
        if (line && ignoreLineSet.has(line)) return;
        if (isInSkippedCallee(path)) return;
        const processExpressionsText = (
          originalCode: string,
          quasis: any[],
          expressions: any[],
          key: string
        ) => {
          const parts: string[] = [];
          const varList: string[] = [];
          for (let i = 0; i < quasis.length; i++) {
            parts.push(quasis[i].value.cooked || "");
            if (i < expressions.length) {
              parts.push(`{${varList.length}}`);
              varList.push(Utils._nodeCode(expressions[i]));
            }
          }
          let builtAttrKey = parts.join("");
          if (builtAttrKey.startsWith("`") && builtAttrKey.endsWith("`")) {
            builtAttrKey = builtAttrKey.slice(1, -1);
          }
          varObj[originalCode] = { newKey: builtAttrKey, varList };
          let text = `${jsxCalleeName}('${key}')`;
          if (expressions.length) {
            const exprCodes = expressions.map((e: any) => Utils._nodeCode(e));
            text = `${jsxCalleeName}('${key}', [${exprCodes.join(", ")}])`;
          }
          // JSX attribute container must be an expression container
          return `{${text}}`;
        };
        if (
          t.isStringLiteral(attr.value) &&
          Utils._containsChinese(attr.value.value)
        ) {
          const key = allocateKey(attr.value.value);
          const text = `{${jsxCalleeName}('${key}')}`;
          if (attr.value.start != null && attr.value.end != null) {
            replacements.push({
              start: attr.value.start,
              end: attr.value.end,
              text,
            });
          }
        } else if (t.isJSXExpressionContainer(attr.value)) {
          const expr: any = attr.value.expression;
          if (t.isTemplateLiteral(expr)) {
            const quasis = expr.quasis;
            const expressions = expr.expressions;
            const hasChinese = quasis.some((q: any) =>
              Utils._containsChinese(q.value.cooked)
            );
            if (!hasChinese) return;
            const originalCode = Utils._nodeCode(expr);
            const key = allocateKey(originalCode);
            const text = processExpressionsText(
              originalCode,
              quasis,
              expressions,
              key
            );
            if (attr.value.start != null && attr.value.end != null) {
              replacements.push({
                start: attr.value.start,
                end: attr.value.end,
                text,
              });
            }
          }
        }
      },
    });

    // Apply replacements using MagicString to preserve untouched whitespace
    if (replacements.length) {
      const ms = new MagicString(scriptContent);
      // apply in reverse order to keep indexes valid
      replacements
        .sort((a, b) => b.start - a.start)
        .forEach((r) => ms.overwrite(r.start, r.end, r.text));
      const finalCode = ms.toString();
      return { code: finalCode, found, varObj };
    }
    return { code: scriptContent, found, varObj };
  }

  private static async _processVueSfc(
    filePath: string,
    code: string,
    ctx: {
      quoteKeys: string[];
      prefixKey: string;
      defaultLang: string;
      initLang: string[];
      hookImport: string;
      skipExtractCallees?: string[];
    }
  ) {
    try {
      const { descriptor } = vueSfcParse(code);
      let finalCode = code;
      const foundList: string[] = [];
      let vueVarObj: any = {};
      let scriptReplaced = false; // 新增：是否对 <script>/<script setup> 做了替换

      // Compute existing tpl/script key max indices in the file to avoid duplicate keys
      const tplStartBase = (() => {
        try {
          if (!ctx.prefixKey) return 0;
          const esc = ctx.prefixKey.replace(/([.*+?^${}()|[\\]\\])/g, "\\$1");
          const reg = new RegExp(`${esc}tpl\\.(\\d+)`, "g");
          let m: RegExpExecArray | null;
          let max = -1;
          while ((m = reg.exec(code))) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > max) max = n;
          }
          return max + 1;
        } catch (e) {
          return 0;
        }
      })();

      const scriptStartBase = (() => {
        try {
          if (!ctx.prefixKey) return 0;
          const esc = ctx.prefixKey.replace(/([.*+?^${}()|[\\]\\])/g, "\\$1");
          const reg = new RegExp(`${esc}script\\.(\\d+)`, "g");
          let m: RegExpExecArray | null;
          let max = -1;
          while ((m = reg.exec(code))) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > max) max = n;
          }
          return max + 1;
        } catch (e) {
          return 0;
        }
      })();

      // file-level replacements (absolute offsets) to apply after all transforms
      const fileReplacements: Array<{
        start: number;
        end: number;
        text: string;
      }> = [];

      // template AST 处理，替换正则方案
      if (descriptor.template && descriptor.template.content) {
        const originalTemplate = descriptor.template.content;
        const tplAst: any = vueBaseParse(originalTemplate, { comments: true });
        interface ReplaceItem {
          start: number;
          end: number;
          text: string;
        }
        const replacements: ReplaceItem[] = [];
        // 选取可配置的翻译函数（quoteKeys 第一项），若不存在则回退 $t
        const quoteFnList = Array.isArray(ctx.quoteKeys)
          ? ctx.quoteKeys.filter(
              (f) => typeof f === "string" && f.trim().length > 0
            )
          : [];
        const primaryFn = quoteFnList.length ? quoteFnList[0] : "$t";
        // 构造检测当前模板已存在的任意翻译调用的正则，用于避免重复包裹
        const translateCallReg = quoteFnList.length
          ? new RegExp(
              `(?:${quoteFnList
                .map((f) => f.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))
                .join("|")})\\(`
            )
          : /\b__never_match__\b/; // 无配置时永远不匹配
        let tplIndex = 0; // local counter for tpl keys (relative)
        const allocateKeyLocal = (val: string) => {
          const idx = tplIndex++;
          foundList.push(`__TPL__${val}`); // 用特殊前缀占位，后面统一转换
          // Use computed tplStartBase to avoid reusing existing indices
          const keyIndex = tplStartBase + idx;
          return `${ctx.prefixKey}tpl.${keyIndex}`;
        };
        const traverseNodes = (children: any[]) => {
          if (!Array.isArray(children)) return;
          children.forEach((node) => {
            if (!node) return;
            switch (node.type) {
              case NodeTypes.TEXT: {
                const raw = node.content as string;
                if (raw && Utils._containsChinese(raw)) {
                  const trimmed = raw.trim();
                  if (!translateCallReg.test(trimmed)) {
                    const key = allocateKeyLocal(trimmed);
                    const leading = raw.match(/^[ \t\n\r]*/)[0];
                    const trailing = raw.match(/[ \t\n\r]*$/)[0];
                    const replacement = `${leading}{{ ${primaryFn}('${key}') }}${trailing}`;
                    // compute absolute offsets for template node by adding template content start later
                    replacements.push({
                      start: node.loc.start.offset,
                      end: node.loc.end.offset,
                      text: replacement,
                    });
                  }
                }
                break;
              }
              case NodeTypes.ELEMENT: {
                if (node.tag && /^(script|style)$/i.test(node.tag)) break;
                if (Array.isArray(node.props)) {
                  node.props.forEach((prop: any) => {
                    // ATTRIBUTE
                    if (
                      prop.type === NodeTypes.ATTRIBUTE &&
                      prop.value &&
                      prop.value.content &&
                      Utils._containsChinese(prop.value.content)
                    ) {
                      const valueContent = prop.value.content;
                      if (!translateCallReg.test(valueContent)) {
                        const key = allocateKeyLocal(valueContent.trim());
                        const attrStart = prop.loc.start.offset;
                        const attrEnd = prop.loc.end.offset;
                        const attrName = prop.name;
                        const replacement = `:${attrName}="${primaryFn}('${key}')"`;
                        replacements.push({
                          start: attrStart,
                          end: attrEnd,
                          text: replacement,
                        });
                      }
                    }

                    // DIRECTIVE
                    if (
                      prop.type === NodeTypes.DIRECTIVE &&
                      prop.exp &&
                      prop.exp.content
                    ) {
                      const exp = prop.exp.content;
                      if (
                        !translateCallReg.test(exp) &&
                        Utils._containsChinese(exp)
                      ) {
                        let processed = false;
                        try {
                          const plugins = [
                            "classProperties",
                            "dynamicImport",
                            "optionalChaining",
                            "jsx",
                            "typescript",
                            "decorators-legacy",
                          ];
                          let exprAst: any = null;
                          try {
                            if ((babelParser as any).parseExpression) {
                              exprAst = (babelParser as any).parseExpression(
                                exp,
                                {
                                  plugins,
                                  sourceType: "module",
                                  locations: true,
                                } as any
                              );
                            } else {
                              exprAst = (babelParser as any).parse(
                                "(" + exp + ")",
                                {
                                  plugins: plugins as any,
                                  sourceType: "module",
                                  locations: true,
                                } as any
                              ).program.body[0].expression as any;
                            }
                          } catch (e) {
                            exprAst = null;
                          }

                          let modified = false;
                          if (exprAst) {
                            if (t.isArrayExpression(exprAst)) {
                              exprAst.elements = exprAst.elements.map(
                                (el: any) => {
                                  if (
                                    t.isStringLiteral(el) &&
                                    Utils._containsChinese(el.value)
                                  ) {
                                    const key = allocateKeyLocal(
                                      el.value.trim()
                                    );
                                    modified = true;
                                    return t.callExpression(
                                      Utils._buildCallee(primaryFn),
                                      [t.stringLiteral(key)]
                                    );
                                  }
                                  return el;
                                }
                              );
                            }
                            if (t.isConditionalExpression(exprAst)) {
                              const ce = exprAst;
                              if (
                                t.isStringLiteral(ce.consequent) &&
                                Utils._containsChinese(ce.consequent.value)
                              ) {
                                const key = allocateKeyLocal(
                                  ce.consequent.value.trim()
                                );
                                ce.consequent = t.callExpression(
                                  Utils._buildCallee(primaryFn),
                                  [t.stringLiteral(key)]
                                );
                                modified = true;
                              }
                              if (
                                t.isStringLiteral(ce.alternate) &&
                                Utils._containsChinese(ce.alternate.value)
                              ) {
                                const key = allocateKeyLocal(
                                  ce.alternate.value.trim()
                                );
                                ce.alternate = t.callExpression(
                                  Utils._buildCallee(primaryFn),
                                  [t.stringLiteral(key)]
                                );
                                modified = true;
                              }
                            }

                            if (modified) {
                              const generated = generate(exprAst).code;
                              const argName =
                                prop.arg &&
                                prop.arg.type === NodeTypes.SIMPLE_EXPRESSION &&
                                prop.arg.content
                                  ? prop.arg.content
                                  : null;
                              const attrStart = prop.loc.start.offset;
                              const attrEnd = prop.loc.end.offset;
                              const replacement = argName
                                ? `:${argName}="${generated}"`
                                : generated;
                              replacements.push({
                                start: attrStart,
                                end: attrEnd,
                                text: replacement,
                              });
                              processed = true;
                            }
                          }
                          // Support logical expressions like a || '背膘'
                          if (t.isLogicalExpression(exprAst)) {
                            const le = exprAst as any;
                            let modified = false;
                            const tryReplaceNode = (node: any) => {
                              if (
                                t.isStringLiteral(node) &&
                                Utils._containsChinese(node.value)
                              ) {
                                const key = allocateKeyLocal(node.value.trim());
                                modified = true;
                                return t.callExpression(
                                  Utils._buildCallee(primaryFn),
                                  [t.stringLiteral(key)]
                                );
                              }
                              if (t.isTemplateLiteral(node)) {
                                // if any quasi contains Chinese, replace the whole template literal with a $t call
                                const hasChinese = (node.quasis || []).some(
                                  (q: any) =>
                                    Utils._containsChinese(
                                      q.value && q.value.cooked
                                    )
                                );
                                if (hasChinese) {
                                  const original = Utils._nodeCode(node);
                                  const key = allocateKeyLocal(original.trim());
                                  modified = true;
                                  return t.callExpression(
                                    Utils._buildCallee(primaryFn),
                                    [t.stringLiteral(key)]
                                  );
                                }
                              }
                              return node;
                            };

                            le.left = tryReplaceNode(le.left) || le.left;
                            le.right = tryReplaceNode(le.right) || le.right;

                            if (modified) {
                              const generated = generate(exprAst).code;
                              const argName =
                                prop.arg &&
                                prop.arg.type === NodeTypes.SIMPLE_EXPRESSION &&
                                prop.arg.content
                                  ? prop.arg.content
                                  : null;
                              const attrStart = prop.loc.start.offset;
                              const attrEnd = prop.loc.end.offset;
                              const replacement = argName
                                ? `:${argName}="${generated}"`
                                : generated;
                              replacements.push({
                                start: attrStart,
                                end: attrEnd,
                                text: replacement,
                              });
                              processed = true;
                            }
                          }
                        } catch (e) {
                          // fall through to fallback
                        }

                        if (!processed) {
                          const replaced = exp.replace(
                            /(['"`])([\s\S]*?)\1/g,
                            (m: string, q: string, inner: string) => {
                              if (Utils._containsChinese(inner)) {
                                const key = allocateKeyLocal(inner.trim());
                                return `${primaryFn}('${key}')`;
                              }
                              return m;
                            }
                          );
                          if (replaced !== exp) {
                            const argName =
                              prop.arg &&
                              prop.arg.type === NodeTypes.SIMPLE_EXPRESSION &&
                              prop.arg.content
                                ? prop.arg.content
                                : null;
                            const attrStart = prop.loc.start.offset;
                            const attrEnd = prop.loc.end.offset;
                            const replacement = argName
                              ? `:${argName}="${replaced}"`
                              : replaced;
                            replacements.push({
                              start: attrStart,
                              end: attrEnd,
                              text: replacement,
                            });
                          }
                        }
                      }
                    }
                  });
                }
                if (node.children && node.children.length)
                  traverseNodes(node.children);
                break;
              }
              case NodeTypes.INTERPOLATION: {
                try {
                  const val =
                    node.content && node.content.content
                      ? node.content.content
                      : "";
                  // strip block and line comments to avoid Chinese in comments
                  const stripped = val
                    .replace(/\/\*[\s\S]*?\*\//g, "")
                    .replace(/\/\/.*$/gm, "")
                    .trim();
                  // If expression already contains a translation call (primaryFn or configured), skip
                  const hasI18nCall =
                    translateCallReg.test(stripped) ||
                    (primaryFn && stripped.indexOf(primaryFn + "(") > -1);
                  if (Utils._containsChinese(stripped) && !hasI18nCall) {
                    let processed = false;
                    try {
                      const plugins = [
                        "classProperties",
                        "dynamicImport",
                        "optionalChaining",
                        "jsx",
                        "typescript",
                        "decorators-legacy",
                      ];
                      let exprAst: any = null;
                      if ((babelParser as any).parseExpression) {
                        exprAst = (babelParser as any).parseExpression(val, {
                          plugins,
                          sourceType: "module",
                          locations: true,
                        } as any);
                      } else {
                        exprAst = (babelParser as any).parse("(" + val + ")", {
                          plugins: plugins as any,
                          sourceType: "module",
                          locations: true,
                        } as any).program.body[0].expression as any;
                      }
                      if (exprAst && t.isConditionalExpression(exprAst)) {
                        const ce = exprAst;
                        let modified = false;
                        if (
                          t.isStringLiteral(ce.consequent) &&
                          Utils._containsChinese(ce.consequent.value)
                        ) {
                          const keyA = allocateKeyLocal(
                            ce.consequent.value.trim()
                          );
                          ce.consequent = t.callExpression(
                            Utils._buildCallee(primaryFn),
                            [t.stringLiteral(keyA)]
                          );
                          modified = true;
                        }
                        if (
                          t.isStringLiteral(ce.alternate) &&
                          Utils._containsChinese(ce.alternate.value)
                        ) {
                          const keyB = allocateKeyLocal(
                            ce.alternate.value.trim()
                          );
                          ce.alternate = t.callExpression(
                            Utils._buildCallee(primaryFn),
                            [t.stringLiteral(keyB)]
                          );
                          modified = true;
                        }
                        if (modified) {
                          const generated = generate(exprAst).code;
                          const start = node.loc.start.offset;
                          const end = node.loc.end.offset;
                          const text = `{{ ${generated} }}`;
                          replacements.push({ start, end, text });
                          processed = true;
                        }
                      }
                      // Support logical expressions like a || '背膘'
                      if (exprAst && t.isLogicalExpression(exprAst)) {
                        const le = exprAst as any;
                        let modified = false;
                        const tryReplaceNode = (n: any) => {
                          if (
                            t.isStringLiteral(n) &&
                            Utils._containsChinese(n.value)
                          ) {
                            const key = allocateKeyLocal(n.value.trim());
                            modified = true;
                            return t.callExpression(
                              Utils._buildCallee(primaryFn),
                              [t.stringLiteral(key)]
                            );
                          }
                          if (t.isTemplateLiteral(n)) {
                            const hasChinese = (n.quasis || []).some((q: any) =>
                              Utils._containsChinese(q.value && q.value.cooked)
                            );
                            if (hasChinese) {
                              const original = Utils._nodeCode(n);
                              const key = allocateKeyLocal(original.trim());
                              modified = true;
                              return t.callExpression(
                                Utils._buildCallee(primaryFn),
                                [t.stringLiteral(key)]
                              );
                            }
                          }
                          return n;
                        };
                        le.left = tryReplaceNode(le.left) || le.left;
                        le.right = tryReplaceNode(le.right) || le.right;
                        if (modified) {
                          const generated = generate(exprAst).code;
                          const start = node.loc.start.offset;
                          const end = node.loc.end.offset;
                          const text = `{{ ${generated} }}`;
                          replacements.push({ start, end, text });
                          processed = true;
                        }
                      }
                    } catch (e) {
                      // ignore parse error
                    }

                    if (!processed) {
                      const key = allocateKeyLocal(val.trim());
                      const start = node.loc.start.offset;
                      const end = node.loc.end.offset;
                      const text = `{{ ${primaryFn}('${key}') }}`;
                      replacements.push({ start, end, text });
                    }
                  }
                } catch (e) {
                  // ignore
                }
                break;
              }
              default: {
                if (node.children) traverseNodes(node.children);
              }
            }
          });
        };
        traverseNodes(tplAst.children);
        if (replacements.length) {
          // Apply replacements to template using absolute offsets relative to the whole file
          // descriptor.template.loc provides the absolute start offset of the template content
          const tplLocStart = descriptor.template.loc
            ? descriptor.template.loc.start.offset
            : finalCode.indexOf(originalTemplate);
          // Convert node-local offsets to file-global offsets
          const globalRepls = replacements.map((r) => {
            // node.loc offsets may be relative to template content or absolute to file.
            // If r.start is within template length, treat as relative; otherwise assume absolute.
            const isRelative =
              typeof r.start === "number" && r.start <= originalTemplate.length;
            const start = isRelative ? tplLocStart + r.start : r.start;
            const end = isRelative ? tplLocStart + r.end : r.end;
            return { start, end, text: r.text };
          });
          // queue into fileReplacements (we'll apply fileReplacements after script processing)
          globalRepls.forEach((g) => fileReplacements.push(g));
        }
      }

      // Collect script blocks with their search offsets so we can replace
      // by position (not by content) to avoid accidental global/text replacements
      // that may modify identifiers (eg. `$$goPage` -> `$goPage`).
      const scriptBlocks: Array<{
        content: string;
        forceTs: boolean;
        startSearchIndex: number;
      }> = [];
      if (descriptor.script && descriptor.script.content) {
        scriptBlocks.push({
          content: descriptor.script.content,
          forceTs: descriptor.script.lang === "ts",
          // start searching from the start of the script block region
          startSearchIndex: descriptor.script.loc
            ? descriptor.script.loc.start.offset
            : 0,
        });
      }
      if (descriptor.scriptSetup && descriptor.scriptSetup.content) {
        scriptBlocks.push({
          content: descriptor.scriptSetup.content,
          forceTs: descriptor.scriptSetup.lang === "ts",
          startSearchIndex: descriptor.scriptSetup.loc
            ? descriptor.scriptSetup.loc.start.offset
            : 0,
        });
      }

      // Prepare positional replacements to apply after transforming all blocks
      const replacements: Array<{ start: number; end: number; text: string }> =
        [];
      scriptBlocks.forEach(
        ({ content: blockContent, forceTs, startSearchIndex }) => {
          // Quick skip: if block contains no Chinese, don't parse
          if (!Utils._containsChinese(blockContent)) return;

          const {
            code: newPart,
            found,
            varObj,
          } = Utils._transformScriptContent(blockContent, filePath, {
            quoteKeys: ctx.quoteKeys,
            prefixKey: ctx.prefixKey,
            jsx: filePath.endsWith(".tsx"),
            forceTs,
            skipExtractCallees: ctx.skipExtractCallees || [],
            // 仅统计模板部分数量（去除脚本已加入的数量），模板部分用 __TPL__ 标记，不计入脚本偏移
            keyOffset:
              foundList.filter((k) => k.startsWith("__TPL__")).length +
              scriptStartBase,
            // Ensure script-generated keys use the script namespace so they match returned langObj
            keyNamespace: `${ctx.prefixKey}script.`,
          });
          if (found.length) {
            // Use descriptor loc when available to compute absolute positions for replacement
            // We try to find the block's absolute start via startSearchIndex (provided earlier from descriptor.loc)
            const blockAbsStart = startSearchIndex;
            if (blockAbsStart != null && blockAbsStart >= 0) {
              fileReplacements.push({
                start: blockAbsStart,
                end: blockAbsStart + blockContent.length,
                text: newPart,
              });
            } else {
              // fallback to searching by content
              const idx = finalCode.indexOf(blockContent);
              if (idx > -1) {
                fileReplacements.push({
                  start: idx,
                  end: idx + blockContent.length,
                  text: newPart,
                });
              }
            }
            found.forEach((f) => {
              foundList.push(`__SCRIPT__${f}`);
            });
            vueVarObj = { ...vueVarObj, ...varObj };
            scriptReplaced = true;
          }
        }
      );

      // Apply queued fileReplacements in reverse order (so offsets remain valid)
      if (fileReplacements.length) {
        fileReplacements.sort((a, b) => b.start - a.start);
        fileReplacements.forEach((r) => {
          finalCode =
            finalCode.slice(0, r.start) + r.text + finalCode.slice(r.end);
        });
      }

      if (!foundList.length) return null;
      // 更宽松的 import 注入策略：
      // 1) 只要生成了 key 或检测到翻译函数调用
      // 2) 未已存在相同导入
      // Import injection: only attempt AST-based insertion when we actually
      // replaced content in script blocks. This avoids injecting imports when
      // no script-level changes were made (e.g. only template changes).
      if (ctx.hookImport && scriptReplaced) {
        // Delegate to Utils.insertImports which parses hookImport and the
        // file's script AST to decide whether merging/insertion is necessary.
        finalCode = Utils.insertImports(finalCode, ctx.hookImport);
      }
      try {
        await Utils.writeFileAsync(filePath, finalCode);
      } catch (e) {
        throw e;
      }
      // 组装返回时去除占位前缀，并保持 tpl/script 两段顺序：所有 tpl 后跟 script
      const tplValues: string[] = [];
      const scriptValues: string[] = [];
      foundList.forEach((v) => {
        if (v.startsWith("__TPL__")) tplValues.push(v.replace("__TPL__", ""));
        else if (v.startsWith("__SCRIPT__"))
          scriptValues.push(v.replace("__SCRIPT__", ""));
      });
      const ordered = [...tplValues, ...scriptValues];
      const varObj: any = { ...vueVarObj, ...Utils.getVarObj(scriptValues) };
      // 构造带有双命名空间 key 的语言对象
      const langObj = {} as any;
      if (ctx.defaultLang) langObj[ctx.defaultLang] = {};
      (ctx.initLang || []).forEach((l) => (langObj[l] = {}));
      // 模板 keys
      tplValues.forEach((orig, i) => {
        const key = `${ctx.prefixKey}tpl.${i}`;
        langObj[ctx.defaultLang][key] =
          (varObj[orig] && varObj[orig].newKey) || orig;
        (ctx.initLang || []).forEach((l) => (langObj[l][key] = ""));
      });
      // 脚本 keys
      scriptValues.forEach((orig, i) => {
        const key = `${ctx.prefixKey}script.${i}`;
        // 对于脚本中的模板字符串记录转换
        langObj[ctx.defaultLang][key] =
          (varObj[orig] && varObj[orig].newKey) || orig;
        (ctx.initLang || []).forEach((l) => (langObj[l][key] = ""));
      });
      return langObj;
    } catch (e) {
      return null;
    }
  }

  // 处理含有变量key
  static getVarObj = (keys: any[]) => {
    const varObj: Record<string, { newKey: string; varList: string[] }> = {};
    if (!Array.isArray(keys) || !keys.length) return varObj;

    const parseTopLevelTemplate = (str: string) => {
      let i = 0;
      const len = str.length;
      const parts: string[] = [];
      const varList: string[] = [];
      let lastLiteralStart = 0;
      const chineseChar = /[\u4e00-\u9fa5]/;

      const isEscaped = (idx: number) => {
        let b = idx - 1,
          c = 0;
        while (b >= 0 && str[b] === "\\") {
          c++;
          b--;
        }
        return c % 2 === 1;
      };

      while (i < len) {
        if (str[i] === "$" && str[i + 1] === "{" && !isEscaped(i)) {
          // Push preceding literal (trim trailing spaces if previous visible char is Chinese)
          if (i > lastLiteralStart) {
            let literal = str.slice(lastLiteralStart, i);
            // Remove only spaces/newlines/tabs at end if immediately after a Chinese char
            const trimmedLiteral = literal.replace(
              /([\u4e00-\u9fa5])([ \t\n\r]+)$/,
              function (_m, g1) {
                return g1;
              }
            );
            parts.push(trimmedLiteral);
          }
          // Parse expression block with nested braces & string/template awareness
          let j = i + 2; // after ${
          let depth = 1;
          let quote: string | null = null;
          while (j < len) {
            const ch = str[j];
            if (quote) {
              // Inside a quoted string within the placeholder expression
              if (quote === "`") {
                // Handle nested ${ } inside template literal
                if (ch === "$" && str[j + 1] === "{" && !isEscaped(j)) {
                  depth++; // entering nested placeholder
                  j += 2; // skip ${
                  continue;
                }
                if (ch === "}" && depth > 1 && !isEscaped(j)) {
                  depth--; // closing nested placeholder
                  j++;
                  continue;
                }
              }
              if (ch === quote && !isEscaped(j)) {
                quote = null; // close current string literal
                j++;
                continue;
              }
              j++;
              continue;
            }
            // Not currently inside a quoted string
            if ((ch === '"' || ch === "'" || ch === "`") && !isEscaped(j)) {
              quote = ch;
              j++;
              continue;
            }
            if (ch === "{") {
              depth++;
              j++;
              continue;
            }
            if (ch === "}") {
              depth--;
              if (depth === 0) {
                const expr = str.slice(i + 2, j).trim();
                const index = varList.length;
                varList.push(expr);
                parts.push(`{${index}}`);
                i = j + 1;
                lastLiteralStart = i;
                break;
              }
              j++;
              continue;
            }
            j++;
          }
          if (depth !== 0) {
            // Malformed, treat rest as literal and exit
            parts.push(str.slice(i));
            i = len;
            break;
          }
          continue;
        }
        i++;
      }
      if (lastLiteralStart < len) parts.push(str.slice(lastLiteralStart));
      return { newKey: parts.join(""), varList };
    };

    keys.forEach((original) => {
      if (typeof original !== "string") return;
      if (original.indexOf("${") === -1) return;
      const normalized = original.replace(/\\(\$\{)/g, "$1");
      const { newKey, varList } = parseTopLevelTemplate(normalized);
      const cleanedKey =
        newKey.startsWith("`") && newKey.endsWith("`")
          ? newKey.slice(1, -1)
          : newKey;
      // 不再保留原始模板两侧反引号，统一使用纯文本 key 形式
      if (varList.length) {
        varObj[original] = { newKey: cleanedKey, varList };
      }
    });
    return varObj;
  };

  /**
   * 获取注释位置
   * @param text
   * @param startNote
   * @param endNote
   */
  static getNotePositionList(text: string, startNote: string, endNote: string) {
    // 注释位置
    const list = [];
    if (text) {
      let startIndex = -1;
      let endIndex = 0;
      while ((startIndex = text.indexOf(startNote, endIndex)) > -1) {
        endIndex = text.indexOf(endNote, startIndex + 1);
        list.push([startIndex, endIndex]);
      }
    }
    return list;
  }

  /**
   * 获取<i18n></i18n>中的对象
   * @param data
   * @returns
   */
  static getI18NObject(data: string) {
    let yamlObj = null;
    if (data && data.indexOf("</i18n>") > -1) {
      let yamlStr = "";
      let yamlObjList = [];
      let startIndex = -1;
      let endIndex = 0;
      while ((startIndex = data.indexOf("<i18n>", endIndex)) > -1) {
        // 可能存在多个的情况
        endIndex = data.indexOf("</i18n>", startIndex);
        yamlStr = data.substring(startIndex + 6, endIndex);
        yamlObjList.push(YAML.parse(yamlStr));
      }
      if (yamlObjList.length) {
        yamlObj = merge(...yamlObjList);
      }
    }
    return yamlObj;
  }

  /**
   * 判断是否在区间内
   * @param i 位置index
   * @param list 区间数组，如[[34, 89], [100, 200]]
   * @returns
   */
  static isInRange(i: number, list: Array<any[]>) {
    if (!list.length) {
      return false;
    }

    list.sort((a, b) => a[0] - b[0]);

    // 使用二分查找查找合适的区间
    let left = 0;
    let right = list.length - 1;

    while (left <= right) {
      let mid = (left + right) >> 1;
      let [start, end] = list[mid];

      if (i < start) {
        right = mid - 1;
      } else if (i > end) {
        left = mid + 1;
      } else {
        return true; // 如果 i 在当前的区间内，返回 true
      }
    }

    return false; // 如果没有找到合适的区间，返回 false
  }

  /**
   * 提取所有中文字符串
   * @param data
   * @returns
   */
  static getChineseCharList(data: string, keyBoundaryChars: string[]) {
    if (!data) return [];

    const chineseChar = /[\u4e00-\u9fa5]/; // (Can be extended if needed)
    const chineseOrPunct =
      /[\u4e00-\u9fa5\u3000-\u303F\uFF00-\uFFEF，。！？；：“”‘’、《》…·]/;
    const replaceKeys: Array<[RegExp, string]> = [[/&nbsp;/g, ""]];
    const excludes = ["v-track:"]; // substrings to skip

    // States
    const STATE = {
      DEFAULT: 0,
      SINGLE: 1,
      DOUBLE: 2,
      TEMPLATE: 3,
      LINE_COMMENT: 4,
      BLOCK_COMMENT: 5,
      HTML_COMMENT: 6,
      I18N_BLOCK: 7,
      REGEXP: 8, // simplistic skip for /.../ literals
      JSX_TAG: 9, // inside <tag ...>
    } as const;
    let state: (typeof STATE)[keyof typeof STATE] = STATE.DEFAULT;
    let templateBraceDepth = 0; // for ${}
    let currentStart = -1; // string start index (after quote)
    let acc: string[] = []; // results
    const set = new Set<string>();
    let returnState: (typeof STATE)[keyof typeof STATE] = STATE.DEFAULT; // state to return to after template literal

    const commitLiteral = (endExclusive: number, includeWrapper = false) => {
      if (currentStart < 0) return;
      let raw = data.slice(currentStart, endExclusive);
      if (!raw) return;
      if (!chineseChar.test(raw)) return; // only keep with Chinese

      // ...existing code...

      // Normalization / replacements
      replaceKeys.forEach(([r, rep]) => (raw = raw.replace(r, rep)));
      if (excludes.some((k) => raw.includes(k))) {
        // ...existing code...
        return;
      }
      if (!set.has(raw)) {
        set.add(raw);
        acc.push(raw);
        // ...existing code...
      } else {
        // ...existing code...
      }
    };

    const isEscaped = (idx: number) => {
      // count preceding backslashes
      let cnt = 0;
      let i = idx - 1;
      while (i >= 0 && data[i] === "\\") {
        cnt++;
        i--;
      }
      return cnt % 2 === 1;
    };

    const isIdentifierPart = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

    // Helper to capture Chinese text node sequences when in DEFAULT (outside tags & not in JS strings)
    const collectTextRun = (i: number) => {
      let start = i;
      let j = i;
      while (j < data.length) {
        const ch = data[j];
        if (chineseOrPunct.test(ch)) {
          j++;
          continue;
        }
        // Allow simple spaces within Chinese block
        if (ch === " " || ch === "\t") {
          // peek next; if next is Chinese keep, else break
          if (j + 1 < data.length && chineseOrPunct.test(data[j + 1])) {
            j++;
            continue;
          }
        }
        break;
      }
      if (j > start) {
        let raw = data.slice(start, j).trim();
        if (raw && chineseChar.test(raw) && !set.has(raw)) {
          replaceKeys.forEach(([r, rep]) => (raw = raw.replace(r, rep)));
          if (!excludes.some((k) => raw.includes(k))) {
            set.add(raw);
            acc.push(raw);
          }
        }
      }
      return j - 1; // caller increments
    };

    // Pre-scan <i18n> blocks to skip
    // We'll manage transitioning to I18N_BLOCK when encountering <i18n>

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      const next2 = data.slice(i, i + 2);
      const next3 = data.slice(i, i + 3);
      const next4 = data.slice(i, i + 4);
      const next7 = data.slice(i, i + 7).toLowerCase();

      // 特别调试8890-8900区间
      if (i >= 8890 && i <= 8900) {
        // ...existing code...
      }

      switch (state) {
        case STATE.DEFAULT: {
          if (next7 === "<i18n>") {
            state = STATE.I18N_BLOCK;
            i += 6; // skip tag
            continue;
          }
          if (next4 === "<!--") {
            state = STATE.HTML_COMMENT;
            i += 3;
            continue;
          }
          if (next2 === "//") {
            state = STATE.LINE_COMMENT;
            i += 1;
            continue;
          }
          if (next2 === "/*") {
            state = STATE.BLOCK_COMMENT;
            i += 1;
            continue;
          }
          if (ch === "'") {
            state = STATE.SINGLE;
            currentStart = i + 1;
            // ...existing code...
            continue;
          }
          if (ch === '"') {
            state = STATE.DOUBLE;
            currentStart = i + 1;
            continue;
          }
          if (ch === "`") {
            returnState = STATE.DEFAULT;
            state = STATE.TEMPLATE;
            currentStart = i + 1;
            templateBraceDepth = 0;
            continue;
          }
          if (ch === "<") {
            // Start of a tag? If next char is letter or / we assume tag
            const nc = data[i + 1];
            if (nc && /[A-Za-z!/]/.test(nc)) {
              state = STATE.JSX_TAG;
            }
            continue;
          }
          if (ch === "/") {
            // potential regex literal; basic heuristic: preceding non-identifier & next not / or *
            const prev = data[i - 1];
            const ahead = data[i + 1];

            // 更严格的正则表达式检测：只有在特定上下文中才认为是正则表达式
            // 例如：= /pattern/, ( /pattern/, [ /pattern/, , /pattern/, return /pattern/, { /pattern/
            const regexContexts = [
              "=",
              "(",
              "[",
              ",",
              "return",
              "{",
              ":",
              ";",
              "!",
              "&",
              "|",
            ];
            let isRegexContext = false;

            // 检查前面的字符序列
            if (prev && !isIdentifierPart(prev)) {
              // 检查前面几个字符是否匹配正则表达式上下文
              const prevContext = data.slice(Math.max(0, i - 10), i).trim();
              isRegexContext = regexContexts.some((ctx) =>
                prevContext.endsWith(ctx)
              );
            }

            if (
              ahead &&
              ahead !== "/" &&
              ahead !== "*" &&
              isRegexContext // 只在明确的正则表达式上下文中才进入REGEXP状态
            ) {
              // ...existing code...
              state = STATE.REGEXP;
              currentStart = -1;
              continue;
            }
          }
          // Collect plain text Chinese outside tags/strings
          if (chineseChar.test(ch)) {
            i = collectTextRun(i);
          }
          // ...existing code...
          break;
        }
        case STATE.SINGLE: {
          if (ch === "'" && !isEscaped(i)) {
            const content = data.slice(currentStart, i);
            // ...existing code...
            commitLiteral(i);
            state = STATE.DEFAULT;
            currentStart = -1;
          }
          break;
        }
        case STATE.DOUBLE: {
          if (ch === '"' && !isEscaped(i)) {
            commitLiteral(i);
            state = STATE.DEFAULT;
            currentStart = -1;
          }
          break;
        }
        case STATE.TEMPLATE: {
          if (ch === "$" && data[i + 1] === "{") {
            templateBraceDepth++;
            i++; // skip {
            continue;
          }
          if (ch === "}") {
            if (templateBraceDepth > 0) templateBraceDepth--;
            continue;
          }
          if (ch === "`" && !isEscaped(i) && templateBraceDepth === 0) {
            commitLiteral(i);
            state = returnState;
            currentStart = -1;
          }
          break;
        }
        case STATE.LINE_COMMENT: {
          if (ch === "\n") {
            state = STATE.DEFAULT;
          }
          break;
        }
        case STATE.BLOCK_COMMENT: {
          if (next2 === "*/") {
            state = STATE.DEFAULT;
            i += 1;
          }
          break;
        }
        case STATE.HTML_COMMENT: {
          if (next3 === "-->") {
            state = STATE.DEFAULT;
            i += 2;
          }
          break;
        }
        case STATE.I18N_BLOCK: {
          if (data.slice(i, i + 8).toLowerCase() === "</i18n>") {
            state = STATE.DEFAULT;
            i += 7;
          }
          break;
        }
        case STATE.REGEXP: {
          if (ch === "/" && !isEscaped(i)) {
            // ...existing code...
            state = STATE.DEFAULT;
          }
          break;
        }
        case STATE.JSX_TAG: {
          if (ch === '"' || ch === "'") {
            const quote = ch;
            let j = i + 1;
            const start = j;
            while (j < data.length) {
              if (data[j] === quote && !isEscaped(j)) break;
              j++;
            }
            let raw = data.slice(start, j);
            if (raw && chineseChar.test(raw) && !set.has(raw)) {
              replaceKeys.forEach(([r, rep]) => (raw = raw.replace(r, rep)));
              if (!excludes.some((k) => raw.includes(k))) {
                set.add(raw);
                acc.push(raw);
              }
            }
            i = j; // jump to end quote
          } else if (ch === "`") {
            // attribute template literal (e.g. title={`视频 ${n}`} )
            returnState = STATE.JSX_TAG;
            state = STATE.TEMPLATE;
            currentStart = i + 1;
            templateBraceDepth = 0;
          } else if (ch === ">") {
            state = STATE.DEFAULT;
          }
          break;
        }
      }
    }

    // Dedup already via Set; return insertion order array
    // ...existing code...
    return acc;
  }

  static insertImports(content: string, hookImport: string) {
    // AST-based import insertion & merging to handle different quoting/formatting styles.
    // helper: detect preferred quote style from existing imports in a text
    const detectQuoteStyle = (text: string) => {
      const importRegex = /from\s+(['"])([^'"\n]+)\1/g;
      let single = 0,
        dbl = 0;
      let m: RegExpExecArray | null;
      while ((m = importRegex.exec(text))) {
        if (m[1] === "'") single++;
        else dbl++;
      }
      return single >= dbl ? "'" : '"';
    };

    const buildImportText = (spec: any, moduleName: string, quote: string) => {
      const parts: string[] = [];
      if (spec && spec.default) parts.push(spec.default);
      if (spec && spec.namespace) parts.push(`* as ${spec.namespace}`);
      if (spec && spec.named && spec.named.size) {
        parts.push(`{ ${Array.from(spec.named).join(", ")} }`);
      }
      const q = quote || "'";
      return `import ${parts.join(", ")} from ${q}${moduleName}${q};`;
    };

    let hookModule: string | null = null;
    let hookSpec: any = null;

    try {
      const hookAst: any = babelParser.parse(hookImport, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
      });
      const hookNode =
        (hookAst.program &&
          hookAst.program.body &&
          hookAst.program.body.find(
            (n: any) => n.type === "ImportDeclaration"
          )) ||
        null;
      if (!hookNode || !hookNode.source || !hookNode.source.value)
        throw new Error("invalid hookImport");
      hookModule = hookNode.source.value;
      hookSpec = {
        default: null,
        namespace: null,
        named: new Set<string>(),
      };
      (hookNode.specifiers || []).forEach((s: any) => {
        if (s.type === "ImportDefaultSpecifier")
          hookSpec.default = s.local.name;
        else if (s.type === "ImportNamespaceSpecifier")
          hookSpec.namespace = s.local.name;
        else if (s.type === "ImportSpecifier")
          hookSpec.named.add(s.imported ? s.imported.name : s.local.name);
      });

      // Prefer to operate inside <script setup> or <script> for Vue SFC, otherwise whole file
      let scriptStart = 0;
      let scriptEnd = content.length;
      let scriptContent = content;
      try {
        const sfc: any = vueSfcParse(content);
        if (sfc && sfc.descriptor) {
          const desc = sfc.descriptor;
          const block = desc.scriptSetup || desc.script;
          if (block && block.content != null && block.loc) {
            scriptStart = block.loc.start.offset;
            scriptEnd = block.loc.end.offset;
            scriptContent = block.content;
          }
        }
      } catch (e) {}

      let ast: any = null;
      try {
        ast = babelParser.parse(scriptContent, {
          sourceType: "module",
          plugins: ["typescript", "jsx"],
          ranges: true,
          locations: true,
        } as any);
      } catch (e) {
        ast = null;
      }
      if (!ast) throw new Error("parse script failed");

      let existingImportNode: any = null;
      let lastImportEnd = 0;
      for (const node of ast.program.body) {
        if (node.type === "ImportDeclaration") {
          lastImportEnd = Math.max(lastImportEnd, node.end || 0);
          if (node.source && node.source.value === hookModule) {
            existingImportNode = node;
            break;
          }
        }
        if (node.type === "VariableDeclaration") {
          for (const decl of node.declarations || []) {
            if (
              decl.init &&
              decl.init.type === "CallExpression" &&
              decl.init.callee &&
              decl.init.callee.name === "require" &&
              decl.init.arguments &&
              decl.init.arguments[0] &&
              decl.init.arguments[0].value === hookModule
            ) {
              existingImportNode = node;
              break;
            }
          }
          if (existingImportNode) break;
        }
      }

      const ms = new MagicString(scriptContent);
      if (existingImportNode) {
        if (existingImportNode.type === "ImportDeclaration") {
          const existingNamed = new Set<string>();
          let hasDefault = false;
          let hasNamespace = false;
          (existingImportNode.specifiers || []).forEach((s: any) => {
            if (s.type === "ImportDefaultSpecifier") hasDefault = true;
            else if (s.type === "ImportNamespaceSpecifier") hasNamespace = true;
            else if (s.type === "ImportSpecifier")
              existingNamed.add(s.imported ? s.imported.name : s.local.name);
          });

          if (hasNamespace) return content; // cannot safely merge

          const needToAdd: string[] = [];
          hookSpec.named.forEach((n: string) => {
            if (!existingNamed.has(n)) needToAdd.push(n);
          });
          const needDefault = hookSpec.default && !hasDefault;
          if (!needToAdd.length && !needDefault) return content; // nothing to change

          const parts: string[] = [];
          if (hasDefault) {
            const def = existingImportNode.specifiers.find(
              (s: any) => s.type === "ImportDefaultSpecifier"
            );
            parts.push(def.local.name);
          } else if (hookSpec.default && needDefault) {
            parts.push(hookSpec.default as string);
          }

          const allNamed = new Set(existingNamed);
          needToAdd.forEach((n) => allNamed.add(n));
          if (allNamed.size)
            parts.push(`{ ${Array.from(allNamed).join(", ")} }`);

          let newImport = `import ${parts.join(", ")} from '${hookModule}';`;
          if (!newImport.endsWith("\n")) newImport = newImport + "\n";
          const s =
            existingImportNode.start != null ? existingImportNode.start : 0;
          const e = existingImportNode.end != null ? existingImportNode.end : 0;
          ms.overwrite(s, e, newImport);
        } else {
          return content; // don't merge require-style
        }
      } else {
        const insertPos = lastImportEnd || 0;
        const quote = detectQuoteStyle(scriptContent) || "'";
        const importText = buildImportText(hookSpec, hookModule, quote) + "\n";
        if (insertPos === 0) ms.prepend(importText);
        else ms.appendLeft(insertPos, importText);
      }

      let newScript = ms.toString();
      let newContent =
        content.slice(0, scriptStart) + newScript + content.slice(scriptEnd);
      // normalize missing newline between consecutive import statements like:
      // ...';import ...  => insert newline after semicolon
      newContent = newContent.replace(/;\s*(?=import\b)/g, ";\n");
      // also normalize "from 'a'import b" style by inserting newline after module string
      newContent = newContent.replace(
        /from\s+((?:'[^']*'|"[^"]*"))\s*(?=import\b)/g,
        "from $1\n"
      );
      return newContent;
    } catch (e) {
      // fallback: text insertion
      try {
        const importRegex: RegExp =
          /^import[\s\S]*?from\s+(['"])([^'"\n]+)\1;?\s*/gm;
        const imports = content.match(importRegex) || [];
        // If module already imported (regardless of spacing/quote), skip
        const moduleRe = new RegExp(
          `from\\s+(['"])${hookModule.replace(
            /[-/\\^$*+?.()|[\]{}]/g,
            "\\$&"
          )}\\1`
        );
        if (moduleRe.test(content)) return content;
        const quote = detectQuoteStyle(content) || "'";
        const importText = buildImportText(hookSpec, hookModule, quote) + "\n";
        if (imports.length === 0) {
          if (content.startsWith("#!")) {
            const firstNewline = content.indexOf("\n");
            if (firstNewline !== -1) {
              return (
                content.slice(0, firstNewline + 1) +
                importText +
                content.slice(firstNewline + 1)
              );
            }
          }
          return importText + content;
        }
        const last = imports[imports.length - 1];
        const lastIndexRaw = content.lastIndexOf(last) + last.length;
        const prefix = content.slice(0, lastIndexRaw);
        let suffix = content.slice(lastIndexRaw);
        const prefixNorm = prefix.replace(/\n*$/, "\n");
        const suffixNorm = suffix.replace(/^\n*/, "");
        let result = prefixNorm + importText + suffixNorm;
        // ensure semicolon+import spacing (e.g. "...';import ...")
        result = result.replace(/;\s*(?=import\b)/g, ";\n");
        result = result.replace(
          /from\s+((?:'[^']*'|"[^"]*"))\s*(?=import\b)/g,
          "from $1\n"
        );
        return result;
      } catch (ee) {
        return content;
      }
    }
  }

  // 获取字符串的字节数
  static getBitCount(str: string) {
    let count = 0;
    const arr = str.split("");
    arr.forEach((c: string) => {
      count += Math.ceil(c.charCodeAt(0).toString(2).length / 8);
    });
    return count;
  }
  static async getTransSourceObjByLlm(
    localLangObj: Object,
    defaultLang: string,
    cookie: string,
    progress?: {
      total?: number; // 全部文件的总批次数
      offset?: number; // 当前文件开始前已完成批次数
      onUpdate?: (done: number, total: number) => void; // 进度回调
      reuseStatusBar?: vscode.StatusBarItem; // 复用外部传入的状态栏
      label?: string; // 自定义显示标签
      suppressBatchStatus?: boolean; // 不实时更新批次进度文本，仅通过回调向外部汇总
    },
    options?: { batchSize?: number }
  ) {
    const transSourceObj: any = {};
    const result: any = { transSourceObj: null, message: "", batchCount: 0 };
    if (isEmpty(localLangObj)) return result;
    const defaultSource = (localLangObj as any)[defaultLang];
    if (isEmpty(defaultSource)) return result;

    let langKey = "en";
    // 组织需要翻译的源文案：遍历除默认语言外的语言，收集缺失项
    Object.entries(localLangObj).forEach(([lang, obj]) => {
      if (lang === defaultLang) return;
      if (!transSourceObj[lang]) transSourceObj[lang] = {};

      if (isEmpty(obj)) {
        Object.keys(defaultSource).forEach((k) => {
          (obj as any)[k] = "";
        });
      }
      Object.keys(obj as any).forEach((k) => {
        if (!(obj as any)[k]) {
          langKey = lang;
          const keyStr = defaultSource[k];
          transSourceObj[lang][keyStr] = (obj as any)[k];
        }
      });
    });

    const batchSize = options?.batchSize || DEFAULT_TRANS_BATCH_SIZE;
    const getTransText = (obj: any = {}, max: number = batchSize) => {
      const keys = Object.keys(obj);
      return chunk(keys, max);
    };

    const langMap: any = {
      zh: "中文",
      en: "英文",
      ko: "韩文",
      ru: "俄文",
      vi: "越文",
    };
    const resMap: any = {
      中文: "zh",
      英文: "en",
      韩文: "ko",
      俄文: "ru",
      越文: "vi",
    };
    const qArr = getTransText(transSourceObj[langKey]);
    result.batchCount = qArr ? qArr.length : 0;
    if (!qArr || !qArr.length) {
      result.message = `${defaultLang}的源文案不能为空！`;
      return result;
    }

    // 状态栏与进度
    let statusBarItem: vscode.StatusBarItem | undefined =
      progress?.reuseStatusBar;
    let internalCreated = false;
    if (!statusBarItem && !progress?.suppressBatchStatus) {
      statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left
      );
      internalCreated = true;
      statusBarItem.show();
    }
    const label = progress?.label || "翻译";
    const externalTotal = progress?.total; // 所有文件总批次数
    const externalOffset = progress?.offset || 0; // 当前文件开始前完成批次数
    const localTotal = qArr.length; // 当前文件批次数
    let localDone = 0; // 当前文件已完成批次数
    const updateBar = () => {
      const total = externalTotal || localTotal;
      const done = externalTotal
        ? Math.min(externalOffset + localDone, total)
        : localDone;
      if (!progress?.suppressBatchStatus && statusBarItem) {
        statusBarItem.text = `$(sync~spin) ${label} ${done}/${total}`;
      }
      if (progress?.onUpdate) progress.onUpdate(done, total);
    };
    if (!progress?.suppressBatchStatus) updateBar();

    const taskList: (() => Promise<{ q: string[]; data: any }>)[] = qArr.map(
      (q) => async () => {
        return new Promise<{ q: string[]; data: any }>(
          async (resolve, reject) => {
            const params = {
              inputLanguage: langMap["zh"],
              query: q.join(SPLIT),
              cookie,
            };
            const { data } = await YZ.getTranslate(params);
            localDone++;
            if (!progress?.suppressBatchStatus) {
              updateBar();
            } else if (progress?.onUpdate) {
              // 外部需要分批次统计时仍发送 onUpdate
              updateBar();
            }
            if (!data || !data.data) {
              reject(new Error((data && data.msg) || "翻译失败"));
              return;
            }
            resolve({ q, data });
          }
        );
      }
    );

    try {
      const results = await Utils.limitedParallelRequests<{
        q: string[];
        data: any;
      }>(taskList, 10);
      results.forEach(({ q, data }) => {
        Object.keys(data.data).forEach((key) => {
          const lang = resMap[key];
          const trans = data.data[key].split(SPLIT);
          if (!transSourceObj[lang]) transSourceObj[lang] = {};
          q.forEach((v, k) => {
            transSourceObj[lang][v] = trans[k]?.trim();
          });
        });
      });
      result.transSourceObj = transSourceObj;
      return result;
    } catch (e: any) {
      Message.showMessage(e.message || "翻译失败");
      return result;
    } finally {
      if (statusBarItem && internalCreated) {
        statusBarItem.hide();
        statusBarItem.dispose();
      }
    }
  }

  // 预计算一个 localLangObj 在默认语言下需要翻译的批次数（用于多文件总进度计算）
  static computeTransBatchCount(
    localLangObj: any,
    defaultLang: string,
    maxPerBatch = DEFAULT_TRANS_BATCH_SIZE
  ): number {
    if (isEmpty(localLangObj)) return 0;
    const defaultSource = localLangObj[defaultLang];
    if (isEmpty(defaultSource)) return 0;
    const transSourceObj: any = {};
    Object.entries(localLangObj).map(([lang, obj]: any) => {
      if (lang !== defaultLang) {
        if (!transSourceObj[lang]) transSourceObj[lang] = {};
        Object.keys(obj).forEach((k) => {
          if (!obj[k]) {
            const keyStr = defaultSource[k];
            if (keyStr) {
              transSourceObj[lang][keyStr] = obj[k];
            }
          }
        });
      }
    });
    const keys = Object.keys(transSourceObj["en"] || {});
    if (!keys.length) return 0;
    return Math.ceil(keys.length / maxPerBatch);
  }

  /**
   * 处理-同步翻译
   */
  static async translateLocalFile(
    transSourceObj: any,
    defaultLang: string,
    tempPaths: string,
    filePath: string,
    isOverWriteLocal: boolean
  ) {
    // console.log('translateLocalFile', transSourceObj, defaultLang, tempPaths, isOverWriteLocal);
    const tranLocalFile = (fsPath: string) => {
      const fileName = path.basename(fsPath);
      if (/\.(json)$/.test(fileName)) {
        try {
          const data = fs.readFileSync(fsPath, "utf-8");
          if (data) {
            const localLangObj = Utils.parseJsonSafe(data);
            if (!localLangObj) {
              console.error("parse json failed in translateLocalFile:", fsPath);
            }
            if (localLangObj) {
              const zhSource = localLangObj[defaultLang];
              if (!isEmpty(zhSource)) {
                // 处理转译
                Object.entries(localLangObj).forEach(([lang, obj]) => {
                  // console.log('lang', lang, defaultLang);
                  if (lang !== defaultLang) {
                    const source = transSourceObj[lang] || {};

                    if (isEmpty(obj)) {
                      Object.keys(zhSource).forEach((k) => {
                        obj[k] = "";
                      });
                    }

                    Object.keys(obj).forEach((k) => {
                      const chieseStr = zhSource[k];
                      if (isOverWriteLocal) {
                        // 本地有值的会覆盖
                        obj[k] = source[chieseStr] || "";
                      } else {
                        if (!obj[k]) {
                          // 本地有值的不会覆盖
                          obj[k] = source[chieseStr] || "";
                        }
                      }
                    });
                  }
                });
                // 写入新内容
                const newText = JSON.stringify(localLangObj, null, "\t");
                FileIO.writeFileToLine(fsPath, newText);
              }
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
    };
    if (!isEmpty(transSourceObj) && defaultLang) {
      if (filePath) {
        tranLocalFile(filePath);
      } else if (tempPaths) {
        const files = await FileIO.getFiles(tempPaths); // 读取临时文件
        files.forEach(({ fsPath }) => {
          tranLocalFile(fsPath);
        });
      }
    }
  }

  static getI18NObjectInJS(filePath: string, globalLangObj: any = {}) {
    let obj = null;
    if (filePath && /\.(js|ts)$/.test(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      const reg = /i18n\.t\([^\)]*?\)/g;
      if (data && reg.test(data)) {
        const allKeys = data.match(reg);
        const initLang = ["zh", "en", "ja"];
        obj = {};
        // console.log("allKeys", allKeys);
        allKeys.forEach((k: any) => {
          k = k.replace("i18n.t", "");
          k = k.replace(/[\t\n'"\(\)]/g, "");
          initLang.forEach((lang) => {
            if (!obj[lang]) {
              obj[lang] = {};
            }
            obj[lang][k] = globalLangObj[lang][k];
          });
        });
      }
    }
    return obj;
  }

  static async limitedParallelRequests<T>(
    requests: (() => Promise<T>)[], // 请求函数数组
    maxConcurrency: number // 最大并发请求数
  ): Promise<T[]> {
    const results: T[] = new Array(requests.length);
    let idx = 0;
    async function runNext() {
      if (idx >= requests.length) return;
      const current = idx++;
      results[current] = await requests[current]();
      await runNext();
    }
    const runners = Array(Math.min(maxConcurrency, requests.length))
      .fill(0)
      .map(runNext);
    await Promise.all(runners);
    return results;
  }

  static async getCookie(account: { username: string; password: string }) {
    const { username, password } = account;
    // 这里是获取cookie的逻辑
    return loginByAccount(username, password);
  }
}
