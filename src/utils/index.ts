import * as vscode from 'vscode';
import MapCache from './cache';
import { YZ } from './yzApi';
import { FileIO } from './fileIO';
import { Message } from './message';
import { loginByAccount } from './api';
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');
const merge = require('lodash/merge');
const isEmpty = require('lodash/isEmpty');
const chunk = require('lodash/chunk');
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import generate from '@babel/generator';
const MagicString = require('magic-string');
import { parse as vueSfcParse } from '@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js';
import { baseParse as vueBaseParse, NodeTypes } from '@vue/compiler-dom';
// removed unused: compilerDom

// 频繁调用，缓存计算结果
const RegCache = new MapCache();
// ...existing code...
const chineseCharReg = /[\u4e00-\u9fa5]/;
let decorationType = null;
const boundaryCodes = ['"', "'", '`']; // 字符串边界
const SPLIT = '---$$_$$---';
// 统一翻译批次大小默认值（可通过配置覆盖）
export const DEFAULT_TRANS_BATCH_SIZE = 10;

export class Utils {
  /**
   * 获取复制对象的value
   * 如{ "a.b": 1, a: { c: 2, d: [{e: 'e'}, {f: 'f'}] } }，获取obj, 'a.d.1.f'
   * @param obj
   * @param key
   * @returns
   */
  static getObjectValue(obj: any, key: string) {
    if (Object.prototype.toString.call(obj) === '[object Object]') {
      if (Object(obj).hasOwnProperty(key)) {
        return obj[key];
      } else {
        if (key.indexOf('.')) {
          return key
            .split('.')
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
      Object.prototype.toString.call(val) === '[object Object]' ||
      Array.isArray(val)
    ) {
      return JSON.stringify(val);
    }
    return val ? val.toString() : val;
  }

  static getRegExpStr(str: string) {
    if (str) {
      return str.replace(/([\.\(\)\$\*\+\[\?\]\{\}\|\^\\])/g, '\\$1');
    }
    return '';
  }

  static getRegExp(str: string) {
    if (!RegCache.get(str)) {
      let completionKeyStr = Utils.getRegExpStr(str);
      completionKeyStr = completionKeyStr
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .join('|');
      const reg = new RegExp(`([\\s{'"]+)(${completionKeyStr})([\\('"])?`);
      RegCache.set(str, reg);
    }
    return RegCache.get(str);
  }

  static getStringText(val: any) {
    if (
      Array.isArray(val) ||
      Object.prototype.toString.call(val) === '[object Object]'
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
      if (data && data.indexOf('</i18n>') > -1) {
        const i18nSrcReg = /<i18n\ssrc=+(([\s\S])*?)>(.*\s)?<\/i18n>/g;
        let yamlStr = '';
        let yamlObjList = [];
        let yamlObj = null;
        let urlPath = '';
        let langFilePath = {};
        let count = 0;
        let res = null;
        let startIndex = -1;
        let endIndex = 0;
        while ((startIndex = data.indexOf('<i18n>', endIndex)) > -1) {
          // 可能存在多个的情况
          endIndex = data.indexOf('</i18n>', startIndex);
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
            urlPath = '';
          }
        }

        // ...existing code...
        if (yamlObjList.length) {
          yamlObj = merge(...yamlObjList);
        }
        // ...existing code...
        // 设置默认key
        const keys = Object.keys(yamlObj || {});
        let defaultKey = 'en'; // 默认值
        if (Array.isArray(keys)) {
          if (keys.includes['zh-TW']) {
            // 特殊设置
            defaultKey = 'zh-TW';
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
          type: 'yaml',
        };
      }
    } catch (e) {
      console.error('handleScanFileInner error', e);
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
        'editorCodeLens.foreground'
      );

      // 坑：一定要先清空，否则会出现重复的情况，即使将全局变量decorationType改成局部变量也无效
      if (decorationType != null) {
        // 释放操作
        decorationType.dispose();
      }

      decorationType = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        overviewRulerColor: 'grey',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
      });

      const decorationOptions: any = [];
      // ...existing code...
      Object.entries(positionObj).forEach(([k, v]: any) => {
        const p: any = k.split('-');
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
                opacity: '0.6',
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
      'workbench.action.openSettings',
      '国际多语言配置'
    ); // 用户区
  }

  // 分析与统计
  static async handleAnalystics(
    selectFolderPath: any,
    bigFileLineCount: number,
    base: string = 'src'
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
          folderUrl = '**' + path.sep + folderUrl + path.sep + '**';
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
            const indexFile = 'index';
            const fileName = path.basename(fsPath);
            const fileType = '.' + fileName.split('.')[1];
            const data = fs.readFileSync(fsPath, 'utf-8');
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
        console.error('handleAnalystics e', e);
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
      const data = fs.readFileSync(fPath, 'utf-8');
      const startIndex = data.indexOf('{');
      const endIndex = data.lastIndexOf('}');
      if (startIndex < 0 || endIndex < 0) {
        return {};
      }
      const dataStr = data.substring(startIndex, endIndex + 1);
      const langObj = eval(`(${dataStr})`);
      return langObj;
    };
    const sourcePath = '**/src/i18n/locale/**';
    const files = await FileIO.getFiles(sourcePath);
    files.forEach(({ fsPath }) => {
      const fileName = path.basename(fsPath);
      const lang = fileName.split('.')[0];
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
            globalLangObj['zh'] &&
            globalLangObj['zh'][k]
          ) {
            langMap[k] = v;
          }
        });
        newLangObj[lang] = langMap;
      });
    }
    const fileName = '/未上传的文案集合.md';
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
    let rand = '';
    rand += date.getFullYear();
    rand += '-';
    rand += date.getMonth() + 1;
    rand += '-';
    rand += date.getDate();
    rand += '-';
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
          langObj[lang][key] = '';
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
          console.error('astProcessFile error', e);
        });
    } catch (e) {
      console.error('handleScanAndInit e', e);
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
      const code = fs.readFileSync(filePath, 'utf-8');

      // Vue 单文件组件处理
      if (/\.vue$/.test(filePath)) {
        return Utils._processVueSfc(filePath, code, {
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
            const escaped = prefixKey.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
            const reg = new RegExp(`${escaped}(\\d+)`, 'g');
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
        FileIO.handleWriteStream(filePath, outCode, () => {});
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
      return null;
    }
  }

  // ===== 以下为 AST 辅助与拆分的子方法 =====
  private static _containsChinese(s: string) {
    return /[\u4e00-\u9fa5]/.test(s);
  }

  private static _createGuards() {
    const isInsideConsoleCall = (path: any) => {
      let p = path.parentPath;
      while (p) {
        if (p.isCallExpression && p.isCallExpression()) {
          const callee = p.node.callee;
          if (
            t.isMemberExpression(callee) &&
            t.isIdentifier(callee.object, { name: 'console' })
          )
            return true;
        }
        p = p.parentPath;
      }
      return false;
    };
    const isInsideDecorator = (path: any) => {
      let p = path.parentPath;
      while (p) {
        if (p.node && p.node.type === 'Decorator') return true;
        p = p.parentPath;
      }
      return false;
    };
    return { isInsideConsoleCall, isInsideDecorator };
  }

  private static _buildCallee(name: string) {
    if (!name) return t.identifier('$t');
    if (name.indexOf('.') > -1) {
      const parts = name.split('.');
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
      return '';
    }
  }

  private static _isInsideI18nCall(path: any, calleeName: string) {
    let p = path.parentPath;
    while (p) {
      if (p.isCallExpression && p.isCallExpression()) {
        try {
          const c = generate(p.node.callee).code;
          if (c === calleeName) return true;
        } catch (e) {}
      }
      p = p.parentPath;
    }
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
    }
  ): { code: string; found: string[]; varObj: any } {
    const {
      quoteKeys,
      prefixKey,
      forceTs,
      skipExtractCallees = [],
      keyOffset = 0,
    } = opts;
    // 收集需要忽略提取的行（含有 @i18n-ignore 标记的行，或紧随其后的下一行）
    const ignoreLineSet = new Set<number>();
    scriptContent.split(/\n/).forEach((line, idx) => {
      if (line.includes('@i18n-ignore')) {
        const lineNo = idx + 1; // 1-based
        ignoreLineSet.add(lineNo);
        ignoreLineSet.add(lineNo + 1); // 允许注释单独一行在目标代码上一行
      }
    });
    const plugins: any[] = [
      'classProperties',
      'dynamicImport',
      'optionalChaining',
    ];
    const isTs =
      !!forceTs ||
      /\.(ts|tsx)$/.test(filePath) ||
      /lang=\"ts\"/.test(scriptContent);
    if (isTs) plugins.push('typescript');
    if (opts.jsx || filePath.endsWith('.tsx')) plugins.push('jsx');
    if (/@[A-Za-z_]/.test(scriptContent)) plugins.push('decorators-legacy');

    let ast: any;
    try {
      ast = babelParser.parse(scriptContent, {
        sourceType: 'module',
        plugins,
        ranges: true,
        tokens: true,
      });
    } catch (e) {
      return { code: scriptContent, found: [], varObj: {} };
    }

    const { isInsideConsoleCall, isInsideDecorator } = Utils._createGuards();
    const found: string[] = [];
    const varObj: Record<string, { newKey: string; varList: string[] }> = {};
    const scriptCalleeName = quoteKeys[1] || 'i18n.t';
    const jsxCalleeName = quoteKeys[0] || '$t';
    const allocateKey = (original: string) => {
      const idx = found.length; // 局部索引
      found.push(original);
      return `${prefixKey}${keyOffset + idx}`; // 叠加偏移，确保与最终 foundList 全局序号一致
    };

    const replacements: Array<{ start: number; end: number; text: string }> =
      [];
    const isObjectKey = (path: any) => {
      if (!path || !path.parent) return false;
      const p = path.parent;
      // Object property or method with this node as the key
      if (
        (p.type === 'ObjectProperty' ||
          p.type === 'ObjectMethod' ||
          p.type === 'ClassProperty') &&
        p.key === path.node
      ) {
        return true;
      }
      return false;
    };
    const isInSkippedCallee = (path: any) => {
      if (!skipExtractCallees.length) return false;
      let p = path.parentPath;
      while (p) {
        if (p.isCallExpression && p.isCallExpression()) {
          try {
            const c = generate(p.node.callee).code;
            if (skipExtractCallees.includes(c)) return true;
          } catch (e) {}
        }
        p = p.parentPath;
      }
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
          parts.push(quasis[i].value.cooked || '');
          if (i < expressions.length) {
            parts.push(`{${varList.length}}`);
            varList.push(Utils._nodeCode(expressions[i]));
          }
        }
        let builtKey = parts.join('');
        if (builtKey.startsWith('`') && builtKey.endsWith('`')) {
          builtKey = builtKey.slice(1, -1);
        }
        varObj[originalCode] = { newKey: builtKey, varList };
        const key = allocateKey(originalCode);
        let text = `${scriptCalleeName}('${key}')`;
        if (expressions.length) {
          const exprCodes = expressions.map((e: any) => Utils._nodeCode(e));
          text = `${scriptCalleeName}('${key}', [${exprCodes.join(', ')}])`;
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
        const raw = path.node.value || '';
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
            parts.push(quasis[i].value.cooked || '');
            if (i < expressions.length) {
              parts.push(`{${varList.length}}`);
              varList.push(Utils._nodeCode(expressions[i]));
            }
          }
          let builtAttrKey = parts.join('');
          if (builtAttrKey.startsWith('`') && builtAttrKey.endsWith('`')) {
            builtAttrKey = builtAttrKey.slice(1, -1);
          }
          varObj[originalCode] = { newKey: builtAttrKey, varList };
          let text = `${jsxCalleeName}('${key}')`;
          if (expressions.length) {
            const exprCodes = expressions.map((e: any) => Utils._nodeCode(e));
            text = `${jsxCalleeName}('${key}', [${exprCodes.join(', ')}])`;
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

  private static _processVueSfc(
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
              (f) => typeof f === 'string' && f.trim().length > 0
            )
          : [];
        const primaryFn = quoteFnList.length ? quoteFnList[0] : '$t';
        // 构造检测当前模板已存在的任意翻译调用的正则，用于避免重复包裹
        const translateCallReg = quoteFnList.length
          ? new RegExp(
              `(?:${quoteFnList
                .map((f) => f.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'))
                .join('|')})\\(`
            )
          : /\b__never_match__\b/; // 无配置时永远不匹配
        const allocateKeyLocal = (val: string) => {
          const idx = foundList.filter((k) => k.startsWith('__TPL__')).length; // 临时计数模板内 key 数
          foundList.push(`__TPL__${val}`); // 用特殊前缀占位，后面统一转换
          return `${ctx.prefixKey}tpl.${idx}`;
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
                  // 已含翻译函数调用则跳过
                  if (!translateCallReg.test(trimmed)) {
                    const key = allocateKeyLocal(trimmed);
                    // 保留原始前后空白
                    const leading = raw.match(/^[ \t\n\r]*/)[0];
                    const trailing = raw.match(/[ \t\n\r]*$/)[0];
                    const replacement = `${leading}{{ ${primaryFn}('${key}') }}${trailing}`;
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
                // 跳过 <script> / <style>（内部中文由脚本或样式处理，不在模板提取范围）
                if (node.tag && /^(script|style)$/i.test(node.tag)) {
                  break;
                }
                // 静态属性中文 -> 绑定
                if (Array.isArray(node.props)) {
                  node.props.forEach((prop: any) => {
                    // ATTRIBUTE type = 6
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
                        // 用绑定替换整个属性
                        const replacement = `:${attrName}="${primaryFn}('${key}')"`;
                        replacements.push({
                          start: attrStart,
                          end: attrEnd,
                          text: replacement,
                        });
                      }
                    }

                    // DIRECTIVE type = 7 -> 处理 :class / v-bind 及其他指令中的一层字符串字面量
                    if (
                      prop.type === NodeTypes.DIRECTIVE &&
                      prop.exp &&
                      prop.exp.content
                    ) {
                      try {
                        const exp = prop.exp.content;
                        if (
                          !translateCallReg.test(exp) &&
                          Utils._containsChinese(exp)
                        ) {
                          // 替换表达式内的字符串字面量（第一层），如数组 ['按钮组', isActive ? '激活' : '未激活']
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
                            // 若有 arg（:class），使用 :arg="..." 否则直接替换指令文本
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
                      } catch (e) {
                        // ignore
                      }
                    }
                  });
                }
                if (node.children && node.children.length)
                  traverseNodes(node.children);
                break;
              }
              case NodeTypes.INTERPOLATION: {
                // 处理简单插值：直接字符串或三元表达式（第一层）
                try {
                  const raw = code.slice(
                    node.loc.start.offset,
                    node.loc.end.offset
                  );
                  const val =
                    node.content && node.content.content
                      ? node.content.content
                      : '';
                  if (
                    Utils._containsChinese(val) &&
                    !translateCallReg.test(val)
                  ) {
                    // 尝试匹配三元表达式： condition ? a : b
                    const ternaryMatch = val.match(/^(.*)\?(.*):(.*)$/s);
                    if (ternaryMatch) {
                      const cond = ternaryMatch[1].trim();
                      const a = ternaryMatch[2].trim();
                      const b = ternaryMatch[3].trim();
                      const unwrap = (s: string) =>
                        s.replace(/^\s*['"`]?|['"`]?\s*$/g, '').trim();
                      const aRaw = unwrap(a);
                      const bRaw = unwrap(b);
                      const aHas = Utils._containsChinese(aRaw);
                      const bHas = Utils._containsChinese(bRaw);
                      let newA = a;
                      let newB = b;
                      if (aHas) {
                        const keyA = allocateKeyLocal(aRaw);
                        newA = `${primaryFn}('${keyA}')`;
                      }
                      if (bHas) {
                        const keyB = allocateKeyLocal(bRaw);
                        newB = `${primaryFn}('${keyB}')`;
                      }
                      if (aHas || bHas) {
                        const start = node.loc.start.offset;
                        const end = node.loc.end.offset;
                        const text = `{{ ${cond} ? ${newA} : ${newB} }}`;
                        replacements.push({ start, end, text });
                      }
                    } else {
                      // 整体作为字符串处理（回退）
                      const key = allocateKeyLocal(val.trim());
                      const start = node.loc.start.offset;
                      const end = node.loc.end.offset;
                      const text = `{{ ${primaryFn}('${key}') }}`;
                      replacements.push({ start, end, text });
                    }
                  }
                } catch (e) {
                  // ignore parse issues
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
          // 直接逆序应用到原模板文本
          const sorted = replacements.sort((a, b) => b.start - a.start);
          let newTemplate = originalTemplate;
          sorted.forEach((r) => {
            newTemplate =
              newTemplate.slice(0, r.start) + r.text + newTemplate.slice(r.end);
          });
          finalCode = finalCode.replace(originalTemplate, newTemplate);
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
          forceTs: descriptor.script.lang === 'ts',
          // start searching from the start of the script block region
          startSearchIndex: descriptor.script.loc
            ? descriptor.script.loc.start.offset
            : 0,
        });
      }
      if (descriptor.scriptSetup && descriptor.scriptSetup.content) {
        scriptBlocks.push({
          content: descriptor.scriptSetup.content,
          forceTs: descriptor.scriptSetup.lang === 'ts',
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
          const {
            code: newPart,
            found,
            varObj,
          } = Utils._transformScriptContent(blockContent, filePath, {
            quoteKeys: ctx.quoteKeys,
            prefixKey: ctx.prefixKey,
            jsx: filePath.endsWith('.tsx'),
            forceTs,
            skipExtractCallees: ctx.skipExtractCallees || [],
            // 仅统计模板部分数量（去除脚本已加入的数量），模板部分用 __TPL__ 标记，不计入脚本偏移
            keyOffset: foundList.filter((k) => k.startsWith('__TPL__')).length,
          });
          if (found.length) {
            // Find the blockContent occurrence starting from the block's start offset
            const contentIndex = finalCode.indexOf(
              blockContent,
              startSearchIndex
            );
            if (contentIndex > -1) {
              replacements.push({
                start: contentIndex,
                end: contentIndex + blockContent.length,
                text: newPart,
              });
            } else {
              // Fallback: if not found at expected region, try global replace as last resort
              const idx = finalCode.indexOf(blockContent);
              if (idx > -1) {
                replacements.push({
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

      // Apply replacements in reverse order (so offsets remain valid)
      if (replacements.length) {
        replacements.sort((a, b) => b.start - a.start);
        replacements.forEach((r) => {
          finalCode =
            finalCode.slice(0, r.start) + r.text + finalCode.slice(r.end);
        });
      }

      if (!foundList.length) return null;
      // 更宽松的 import 注入策略：
      // 1) 只要生成了 key 或检测到翻译函数调用
      // 2) 未已存在相同导入
      if (ctx.hookImport && !finalCode.includes(ctx.hookImport)) {
        const hasCall =
          /\$t\(['"]/g.test(finalCode) ||
          /\bi18n\.t\(/.test(finalCode) ||
          /\bi18n\.global\.t\(/.test(finalCode);
        if (scriptReplaced || hasCall || foundList.length > 0) {
          // Vue: 优先插入到 <script setup> 或 <script> 标签内部首行，避免跑到 <template> 之前
          const scriptTagReg = /<script[^>]*setup[^>]*>/i;
          const normalScriptTagReg = /<script(?![^>]*setup)[^>]*>/i;
          let m =
            scriptTagReg.exec(finalCode) || normalScriptTagReg.exec(finalCode);
          const importLine = `\n${ctx.hookImport}${
            ctx.hookImport.trim().endsWith(';') ? '' : ';'
          }\n`;
          if (m) {
            const insertPos = m.index + m[0].length;
            finalCode =
              finalCode.slice(0, insertPos) +
              importLine +
              finalCode.slice(insertPos);
          } else {
            // 没有脚本标签，兜底使用通用逻辑（会放在文件顶部）
            finalCode = Utils.insertImports(finalCode, ctx.hookImport);
          }
        }
      }
      FileIO.handleWriteStream(filePath, finalCode, () => {});
      // 组装返回时去除占位前缀，并保持 tpl/script 两段顺序：所有 tpl 后跟 script
      const tplValues: string[] = [];
      const scriptValues: string[] = [];
      foundList.forEach((v) => {
        if (v.startsWith('__TPL__')) tplValues.push(v.replace('__TPL__', ''));
        else if (v.startsWith('__SCRIPT__'))
          scriptValues.push(v.replace('__SCRIPT__', ''));
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
        (ctx.initLang || []).forEach((l) => (langObj[l][key] = ''));
      });
      // 脚本 keys
      scriptValues.forEach((orig, i) => {
        const key = `${ctx.prefixKey}script.${i}`;
        // 对于脚本中的模板字符串记录转换
        langObj[ctx.defaultLang][key] =
          (varObj[orig] && varObj[orig].newKey) || orig;
        (ctx.initLang || []).forEach((l) => (langObj[l][key] = ''));
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
        while (b >= 0 && str[b] === '\\') {
          c++;
          b--;
        }
        return c % 2 === 1;
      };

      while (i < len) {
        if (str[i] === '$' && str[i + 1] === '{' && !isEscaped(i)) {
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
              if (quote === '`') {
                // Handle nested ${ } inside template literal
                if (ch === '$' && str[j + 1] === '{' && !isEscaped(j)) {
                  depth++; // entering nested placeholder
                  j += 2; // skip ${
                  continue;
                }
                if (ch === '}' && depth > 1 && !isEscaped(j)) {
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
            if ((ch === '"' || ch === "'" || ch === '`') && !isEscaped(j)) {
              quote = ch;
              j++;
              continue;
            }
            if (ch === '{') {
              depth++;
              j++;
              continue;
            }
            if (ch === '}') {
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
      return { newKey: parts.join(''), varList };
    };

    keys.forEach((original) => {
      if (typeof original !== 'string') return;
      if (original.indexOf('${') === -1) return;
      const normalized = original.replace(/\\(\$\{)/g, '$1');
      const { newKey, varList } = parseTopLevelTemplate(normalized);
      const cleanedKey =
        newKey.startsWith('`') && newKey.endsWith('`')
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
    if (data && data.indexOf('</i18n>') > -1) {
      let yamlStr = '';
      let yamlObjList = [];
      let startIndex = -1;
      let endIndex = 0;
      while ((startIndex = data.indexOf('<i18n>', endIndex)) > -1) {
        // 可能存在多个的情况
        endIndex = data.indexOf('</i18n>', startIndex);
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
    const replaceKeys: Array<[RegExp, string]> = [[/&nbsp;/g, '']];
    const excludes = ['v-track:']; // substrings to skip

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
      while (i >= 0 && data[i] === '\\') {
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
        if (ch === ' ' || ch === '\t') {
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
          if (next7 === '<i18n>') {
            state = STATE.I18N_BLOCK;
            i += 6; // skip tag
            continue;
          }
          if (next4 === '<!--') {
            state = STATE.HTML_COMMENT;
            i += 3;
            continue;
          }
          if (next2 === '//') {
            state = STATE.LINE_COMMENT;
            i += 1;
            continue;
          }
          if (next2 === '/*') {
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
          if (ch === '`') {
            returnState = STATE.DEFAULT;
            state = STATE.TEMPLATE;
            currentStart = i + 1;
            templateBraceDepth = 0;
            continue;
          }
          if (ch === '<') {
            // Start of a tag? If next char is letter or / we assume tag
            const nc = data[i + 1];
            if (nc && /[A-Za-z!/]/.test(nc)) {
              state = STATE.JSX_TAG;
            }
            continue;
          }
          if (ch === '/') {
            // potential regex literal; basic heuristic: preceding non-identifier & next not / or *
            const prev = data[i - 1];
            const ahead = data[i + 1];

            // 更严格的正则表达式检测：只有在特定上下文中才认为是正则表达式
            // 例如：= /pattern/, ( /pattern/, [ /pattern/, , /pattern/, return /pattern/, { /pattern/
            const regexContexts = [
              '=',
              '(',
              '[',
              ',',
              'return',
              '{',
              ':',
              ';',
              '!',
              '&',
              '|',
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
              ahead !== '/' &&
              ahead !== '*' &&
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
          if (ch === '$' && data[i + 1] === '{') {
            templateBraceDepth++;
            i++; // skip {
            continue;
          }
          if (ch === '}') {
            if (templateBraceDepth > 0) templateBraceDepth--;
            continue;
          }
          if (ch === '`' && !isEscaped(i) && templateBraceDepth === 0) {
            commitLiteral(i);
            state = returnState;
            currentStart = -1;
          }
          break;
        }
        case STATE.LINE_COMMENT: {
          if (ch === '\n') {
            state = STATE.DEFAULT;
          }
          break;
        }
        case STATE.BLOCK_COMMENT: {
          if (next2 === '*/') {
            state = STATE.DEFAULT;
            i += 1;
          }
          break;
        }
        case STATE.HTML_COMMENT: {
          if (next3 === '-->') {
            state = STATE.DEFAULT;
            i += 2;
          }
          break;
        }
        case STATE.I18N_BLOCK: {
          if (data.slice(i, i + 8).toLowerCase() === '</i18n>') {
            state = STATE.DEFAULT;
            i += 7;
          }
          break;
        }
        case STATE.REGEXP: {
          if (ch === '/' && !isEscaped(i)) {
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
          } else if (ch === '`') {
            // attribute template literal (e.g. title={`视频 ${n}`} )
            returnState = STATE.JSX_TAG;
            state = STATE.TEMPLATE;
            currentStart = i + 1;
            templateBraceDepth = 0;
          } else if (ch === '>') {
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
    // 支持多行 import 的正则（全局、多行）
    const importRegex: RegExp = /^import[\s\S]*?from\s+['"][^'\"]+['"];?\s*/gm;
    const imports = content.match(importRegex) || [];

    // 提取 hookImport 中的模块名用于精确去重（from 'module'）
    const hookModuleMatch = hookImport.match(/from\s+['"]([^'"]+)['"]/);
    const hookModule = hookModuleMatch ? hookModuleMatch[1] : null;

    // 如果 hookImport 的模块已经被导入，则直接返回原内容
    if (hookModule) {
      for (const imp of imports) {
        const m = imp.match(/from\s+['"]([^'"]+)['"]/);
        if (m && m[1] === hookModule) return content;
      }
    } else {
      // 兜底：若 hookImport 文本已存在则跳过
      if (content.includes(hookImport)) return content;
    }

    // 准备插入内容：去掉开头多余换行并保证以单个换行结尾，避免粘连或多余空行
    let importText = hookImport.replace(/^\n+/, '');
    importText = importText.endsWith('\n') ? importText : importText + '\n';

    // 没有任何 import 的文件：考虑 shebang（#!）情况
    if (imports.length === 0) {
      if (content.startsWith('#!')) {
        const firstNewline = content.indexOf('\n');
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

    // 将 import 插入到最后一个 import 之后，并规范前后换行，避免产生多余空行
    const last = imports[imports.length - 1];
    const lastIndexRaw = content.lastIndexOf(last) + last.length;
    const prefix = content.slice(0, lastIndexRaw);
    let suffix = content.slice(lastIndexRaw);
    // 保证 prefix 以单个换行结束，去掉 suffix 开头的多余换行
    const prefixNorm = prefix.replace(/\n+$/, '\n');
    const suffixNorm = suffix.replace(/^\n+/, '');
    return prefixNorm + importText + suffixNorm;
  }
  /**
   * 获取新的文件字符串，针对vue
   * @param data
   * @param chars
   * @param notePositionList
   * @returns
   */
  static getVueNewContent(
    data: string,
    chars: any[],
    initLang: string[],
    quoteKeys: string[],
    keyPrefix: string,
    isSingleQuote: boolean,
    hookImport: string
  ) {
    // 将key写入i18n
    let newData = data;
    if (data && chars.length) {
      // 处理含有变量的key
      const varObj: any = Utils.getVarObj(chars);
      // 获取新的$t引用
      const getI18nT = (suffix: string, key: string, char: string) => {
        const keyStr = isSingleQuote ? `'${key}'` : `"${key}"`;
        let i18nT = `${suffix}(${keyStr})`;
        if (varObj[char]) {
          i18nT = `${suffix}(${keyStr}, [${varObj[char].varList}])`;
        }
        return i18nT;
      };

      const getScriptType = (str: string) => {
        const reg = /<script.*?>/;
        const arr = reg.exec(str);
        if (arr) {
          return arr[0].length + arr.index;
        } else {
          return -1;
        }
      };

      const getTemplateStr = (keys: any[]) => {
        if (data.indexOf('<template>') < 0) {
          return '';
        }
        const templateStartIndex =
          data.indexOf('<template>') + '<template>'.length;
        const templateEndIndex = data.lastIndexOf('</template>');
        // ...existing code...
        let text = data.substring(templateStartIndex, templateEndIndex);
        // ...existing code...
        // const replaceKey = quoteKeys.includes('$t') ? '$t' : quoteKeys[0];
        const replaceKey = quoteKeys[0];
        (keys || []).forEach((char, i) => {
          const key = `${keyPrefix}${i}`;
          const i18nT = getI18nT(replaceKey, key, char);

          let startIndex = -1,
            endIndex = 0;
          while ((startIndex = text.indexOf(char, endIndex)) > -1) {
            // ...existing code...
            endIndex = startIndex + char.length;
            let preIndex = startIndex - 2,
              str = '',
              pre = text[startIndex - 1],
              suff = text[endIndex];
            // console.log("text[endIndex]", pre, suff)
            if (chineseCharReg.test(pre) || chineseCharReg.test(suff)) {
              // 前后的字符还是中文，说明属于包含关系
              continue;
            }

            if (preIndex >= 0 && text[preIndex] === '=') {
              while (text[preIndex] !== ' ') {
                if (
                  text[preIndex] === '\n' ||
                  text[preIndex] === ' ' ||
                  preIndex < 0
                ) {
                  break;
                }
                preIndex--;
              }
              preIndex = preIndex + 1;
              str = ':' + text.substring(preIndex, endIndex);
              str = str.replace(char, i18nT);
              text = text.slice(0, preIndex) + str + text.slice(endIndex);
            } else if (boundaryCodes.includes(suff) && pre === suff) {
              // 冒号的引用
              str = i18nT;
              text =
                text.slice(0, startIndex - 1) + str + text.slice(endIndex + 1);
            } else {
              str = `{{ ${i18nT} }}`;
              text = text.slice(0, startIndex) + str + text.slice(endIndex);
            }
          }
        });
        return text;
      };

      const getScriptStr = (keys: any[]) => {
        const scriptStartIndex = getScriptType(data);
        const scriptEndIndex = data.lastIndexOf('</script>');
        // console.log("scriptStartIndex", scriptStartIndex, scriptEndIndex)
        let text = data.substring(scriptStartIndex, scriptEndIndex);
        // console.log("script", text);
        (keys || []).filter(Boolean).forEach((char, i) => {
          const key = `${keyPrefix}${i}`;
          const replaceKey = quoteKeys[1];
          const i18nT = getI18nT(replaceKey, key, char);
          let completionKeyStr = Utils.getRegExpStr(char);
          const reg = new RegExp(`[\`'"](${completionKeyStr})[\`'"]`, 'g');
          // const reg = new RegExp(`['"\`](${char})['"\`]`, "g");
          text = text.replace(reg, `${i18nT}`);
        });
        return text;
      };

      const handleTemplate = () => {
        // 将原文件替换$t('key')形式
        const templateStr = getTemplateStr(chars);
        if (templateStr) {
          const templateStartIndex =
            newData.indexOf('<template>') + '<template>'.length;
          const templateEndIndex = newData.lastIndexOf('</template>');
          newData =
            newData.slice(0, templateStartIndex) +
            templateStr +
            newData.slice(templateEndIndex);
        }
      };

      const handleScript = () => {
        // 将原文件替换$t('key')形式
        const scriptStr = getScriptStr(chars);
        const scriptStartIndex = getScriptType(newData);
        const scriptEndIndex = newData.lastIndexOf('</script>');
        newData =
          newData.slice(0, scriptStartIndex) +
          scriptStr +
          newData.slice(scriptEndIndex);
      };

      // // 将key写入i18n
      // handleI18N();
      // 将原文件替换$t('key')形式
      handleTemplate();
      handleScript();

      if (hookImport) {
        newData = Utils.insertImports(newData, hookImport);
      }
    }
    return newData;
  }

  /**
   * 获取新的文件字符串，针对js/ts
   * @param data
   * @param chars
   * @param notePositionList
   * @returns
   */
  static getJSNewContent(
    data: string,
    chars: any[],
    quoteKeys: string[],
    keyPrefix: string,
    isSingleQuote: boolean,
    hookImport: string
  ) {
    // 将key写入i18n
    let newData = data;
    if (data && chars.length) {
      // 处理含有变量的key
      const varObj: any = Utils.getVarObj(chars);
      // 获取新的$t引用
      const getI18nT = (suffix: string, key: string, char: string) => {
        const keyStr = isSingleQuote ? `'${key}'` : `"${key}"`;
        let i18nT = `${suffix}(${keyStr})`;
        if (varObj[char]) {
          i18nT = `${suffix}(${keyStr}, [${varObj[char].varList}])`;
        }
        return i18nT;
      };

      const replaceI18nStr = (keys: any[]) => {
        let text = data;
        // console.log("script", text);
        const replaceKey = quoteKeys[1];
        (keys || []).filter(Boolean).forEach((char, i) => {
          const key = `${keyPrefix}${i}`;
          const i18nT = getI18nT(replaceKey, key, char);
          let completionKeyStr = Utils.getRegExpStr(char);
          const reg = new RegExp(`[\`'"](${completionKeyStr})[\`'"]`, 'g');
          // const reg = new RegExp(`['"\`](${char})['"\`]`, "g");
          text = text.replace(reg, `${i18nT}`);
        });
        return text;
      };

      const handleReplace = () => {
        // 初始化中文和日语
        const i18nStr = replaceI18nStr(chars);
        newData = i18nStr;

        if (hookImport) {
          newData = Utils.insertImports(newData, hookImport);
        }
      };

      handleReplace();
    }
    return newData;
  }

  /**
   * 获取新的文件字符串，针对jsx
   * @param data
   * @param chars
   * @param notePositionList
   * @returns
   */
  static getJSXNewContent(
    data: string,
    chars: any[],
    quoteKeys: string[],
    keyPrefix: string,
    isSingleQuote: boolean,
    hookImport: string
  ) {
    if (!data || !chars.length) {
      return data;
    }

    // 直接使用原始的、经过验证的实现，但增强模板字符串处理
    // 将key写入i18n
    let newData = data;
    if (data && chars.length) {
      // 处理含有变量的key
      const varObj: any = Utils.getVarObj(chars);
      const getI18nT = (suffix: string, key: string, char: string) => {
        const keyStr = isSingleQuote ? `'${key}'` : `"${key}"`;
        let i18nT = `${suffix}(${keyStr})`;
        if (varObj[char]) {
          i18nT = `${suffix}(${keyStr}, [${varObj[char].varList}])`;
        }
        return i18nT;
      };

      const replaceI18nStr = (keys: any[]) => {
        let text = data;

        // 为每个字符串创建多个变体用于匹配
        const createVariants = (char: string) => {
          const variants = [char];

          // 如果包含模板变量和换行符，创建规范化变体
          if (
            char.includes('${') &&
            (char.includes('\r\n') || char.includes('\n'))
          ) {
            // 变体1: \r\n -> \n
            variants.push(char.replace(/\r\n/g, '\n'));
            // 变体2: \r -> \n
            variants.push(char.replace(/\r/g, '\n'));
            // 变体3: 规范化空白
            variants.push(
              char
                .replace(/\r\n/g, '\n')
                .replace(/\n\s+/g, '\n')
                .replace(/\s+\n/g, '\n')
            );
            // 变体4: 移除所有多余空白
            variants.push(char.replace(/\s+/g, ' ').trim());
          }

          return Array.from(new Set(variants)); // 去重
        };

        // 第一轮：JSX属性替换 (={...})
        (keys || []).filter(Boolean).forEach((char, i) => {
          const key = `${keyPrefix}${i}`;
          const replaceKey = quoteKeys[0];
          const i18nT = getI18nT(replaceKey, key, char);

          const variants = createVariants(char);
          variants.forEach((variant) => {
            let completionKeyStr = Utils.getRegExpStr(variant);
            const reg = new RegExp(`=[\`'"](${completionKeyStr})[\`'"]`, 'g');
            text = text.replace(reg, `={${i18nT}}`);
          });
        });

        // 第二轮：字符串字面量替换（包括模板字符串）
        (keys || []).filter(Boolean).forEach((char, i) => {
          const key = `${keyPrefix}${i}`;
          const replaceKey = quoteKeys[0];
          const i18nT = getI18nT(replaceKey, key, char);

          const variants = createVariants(char);
          variants.forEach((variant) => {
            let completionKeyStr = Utils.getRegExpStr(variant);
            // 只匹配被引号包围的字符串，避免替换注释等内容
            const reg = new RegExp(`[\`'"](${completionKeyStr})[\`'"]`, 'g');
            text = text.replace(reg, `${i18nT}`);
          });
        });

        // 第三轮：JSX Text节点替换（不带引号的JSX内容）
        (keys || []).filter(Boolean).forEach((char, i) => {
          const key = `${keyPrefix}${i}`;
          const replaceKey = quoteKeys[0];
          const i18nT = getI18nT(replaceKey, key, char);

          const variants = createVariants(char);
          variants.forEach((variant) => {
            let completionKeyStr = Utils.getRegExpStr(variant);

            // 处理 JSX 文本节点的多种情况：
            // 1. 标准的 >text</tag> 格式
            // 2. 带换行和缩进的格式
            // 3. 自闭合标签内的文本

            // 匹配标签内的纯文本（可能包含空白字符）
            // 确保不匹配已经被{}包围的内容
            const jsxTextRegex = new RegExp(
              `(>[^{<]*?)\\b(${completionKeyStr})\\b([^}<]*?</?)`,
              'g'
            );

            // 先检查是否已经被替换过
            const beforeReplace = text;
            text = text.replace(
              jsxTextRegex,
              (match, before, targetText, after) => {
                // 如果前面已经有{或者后面已经有}，说明已经被处理过了
                if (before.includes('{') || after.includes('}')) {
                  return match;
                }
                return `${before}{${i18nT}}${after}`;
              }
            );

            // 如果上面的正则没有匹配到，尝试更简单的模式
            if (text === beforeReplace) {
              // 匹配简单的 >文本< 格式
              const simpleRegex = new RegExp(
                `(>\\s*)(${completionKeyStr})(\\s*<)`,
                'g'
              );
              text = text.replace(simpleRegex, `$1{${i18nT}}$3`);
            }
          });
        });

        return text;
      };

      const handleReplace = () => {
        const i18nStr = replaceI18nStr(chars);
        newData = i18nStr;
      };

      // 将原文件替换
      handleReplace();

      if (hookImport) {
        newData = Utils.insertImports(newData, hookImport);
      }
    }
    return newData;
  }

  // 获取字符串的字节数
  static getBitCount(str: string) {
    let count = 0;
    const arr = str.split('');
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
    const result: any = { transSourceObj: null, message: '', batchCount: 0 };
    if (isEmpty(localLangObj)) return result;
    const defaultSource = (localLangObj as any)[defaultLang];
    if (isEmpty(defaultSource)) return result;

    let langKey = 'en';
    // 组织需要翻译的源文案：遍历除默认语言外的语言，收集缺失项
    Object.entries(localLangObj).forEach(([lang, obj]) => {
      if (lang === defaultLang) return;
      if (!transSourceObj[lang]) transSourceObj[lang] = {};

      if (isEmpty(obj)) {
        Object.keys(defaultSource).forEach((k) => {
          (obj as any)[k] = '';
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
      zh: '中文',
      en: '英文',
      ko: '韩文',
      ru: '俄文',
      vi: '越文',
    };
    const resMap: any = {
      中文: 'zh',
      英文: 'en',
      韩文: 'ko',
      俄文: 'ru',
      越文: 'vi',
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
    const label = progress?.label || '翻译';
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
              inputLanguage: langMap['zh'],
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
              reject(new Error((data && data.msg) || '翻译失败'));
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
      Message.showMessage(e.message || '翻译失败');
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
    const keys = Object.keys(transSourceObj['en'] || {});
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
          const data = fs.readFileSync(fsPath, 'utf-8');
          if (data) {
            const localLangObj = eval(`(${data})`);
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
                        obj[k] = '';
                      });
                    }

                    Object.keys(obj).forEach((k) => {
                      const chieseStr = zhSource[k];
                      if (isOverWriteLocal) {
                        // 本地有值的会覆盖
                        obj[k] = source[chieseStr] || '';
                      } else {
                        if (!obj[k]) {
                          // 本地有值的不会覆盖
                          obj[k] = source[chieseStr] || '';
                        }
                      }
                    });
                  }
                });
                // 写入新内容
                const newText = JSON.stringify(localLangObj, null, '\t');
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
      const data = fs.readFileSync(filePath, 'utf-8');
      const reg = /i18n\.t\([^\)]*?\)/g;
      if (data && reg.test(data)) {
        const allKeys = data.match(reg);
        const initLang = ['zh', 'en', 'ja'];
        obj = {};
        // console.log("allKeys", allKeys);
        allKeys.forEach((k: any) => {
          k = k.replace('i18n.t', '');
          k = k.replace(/[\t\n'"\(\)]/g, '');
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
