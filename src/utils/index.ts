import * as vscode from 'vscode';
import MapCache from './cache';
import { Baidu } from './baidu';
import { FileIO } from './fileIO';
import { Message } from './message';
import { loginByAccount } from './api';
const path = require('path');
const fs = require('fs');
const YAML = require('yaml');
const merge = require('lodash/merge');
const isEmpty = require('lodash/isEmpty');
const isObject = require('lodash/isObject');
const chunk = require('lodash/chunk');
import * as babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import generate from '@babel/generator';
import { parse as vueSfcParse } from '@vue/compiler-sfc';
import * as compilerDom from '@vue/compiler-dom';

// 频繁调用，缓存计算结果
const RegCache = new MapCache();
// ...existing code...
const chineseCharReg = /[\u4e00-\u9fa5]/;
const chineseChar2Reg = /[\u4e00-\u9fa5]+|[\u4e00-\u9fa5]/g;
const varReg = /\$\{(.[^\}]+)?\}/g; // 判断包含${}的正则
let decorationType = null;
const globalPkgPath = '**/package.json';
const boundaryCodes = ['"', "'", '`']; // 字符串边界
const SPLIT = '-----sss--';

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
    varObj: any
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
        const key = `${keyPrefix}${i}`;
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
    isSingleQuote: boolean,
    keyBoundaryChars: string[],
    vueReg: RegExp,
    hookImport: string,
    cb: Function
  ) {
    try {
      // 全部使用 AST 实现；astProcessFile 返回 Promise<newLangObj|null>
      Utils.astProcessFile(
        filePath,
        initLang,
        quoteKeys,
        defaultLang,
        prefixKey,
        isSingleQuote,
        keyBoundaryChars,
        vueReg,
        hookImport
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

  // 尝试用 AST 解析并替换文件（若缺少依赖或类型不支持则返回 false）
  static async astProcessFile(
    filePath: string,
    initLang: string[],
    quoteKeys: string[],
    defaultLang: string,
    prefixKey: string,
    isSingleQuote: boolean,
    keyBoundaryChars: string[],
    vueReg: RegExp,
    hookImport: string
  ) {
    try {
      const code = fs.readFileSync(filePath, 'utf-8');

      // Vue SFC: attempt to use @vue/compiler-sfc and @vue/compiler-dom for template AST
      if (vueReg.test(filePath)) {
        try {
          const { descriptor } = vueSfcParse(code);
          let finalCode = code;
          const foundList: string[] = [];

          // process template (simple string-based replacements to avoid compiler-dom API differences)
          if (descriptor.template && descriptor.template.content) {
            let templateContent = descriptor.template.content;
            const containsChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);
            const allocateKeyLocal = (val: string) => {
              const idx = foundList.length;
              foundList.push(val);
              return `${prefixKey}${idx}`;
            };
            // replace plain text nodes: conservative approach using proper Vue interpolation
            templateContent = templateContent.replace(
              />([^<>]*)</g,
              (m, inner) => {
                if (!inner) return m;
                const trimmed = inner.trim();
                // skip if already contains i18n usage or interpolation
                if (!trimmed || /\$t\(|{{|}}/.test(trimmed)) return m;
                if (containsChinese(trimmed)) {
                  const key = allocateKeyLocal(trimmed);
                  return `>{{ $t('${key}') }}<`;
                }
                return m;
              }
            );

            // replace attribute values like attr="中文" => :attr="$t('key')"
            templateContent = templateContent.replace(
              /(\s+)([\w-:@]+)=['"]([^'\"]*?[\u4e00-\u9fa5][^'\"]*?)['"]/g,
              (m, pre, name, val) => {
                const trimmed = val.trim();
                if (/\$t\(|{{|}}/.test(trimmed)) return m;
                const key = allocateKeyLocal(trimmed);
                return `${pre}:${name}="$t('${key}')"`;
              }
            );

            finalCode = finalCode.replace(
              descriptor.template.content,
              templateContent
            );
          }

          // process script part with babel (reuse below script handling)
          if (descriptor.script && descriptor.script.content) {
            const scriptContent = descriptor.script.content;
            // parse script content with babel
            const pluginsScript: any[] = [
              'classProperties',
              'dynamicImport',
              'optionalChaining',
            ];
            if (
              filePath.endsWith('.ts') ||
              filePath.endsWith('.tsx') ||
              descriptor.script.lang === 'ts'
            )
              pluginsScript.push('typescript');
            if (filePath.endsWith('.tsx')) pluginsScript.push('jsx');

            const scriptAst = babelParser.parse(scriptContent, {
              sourceType: 'module',
              plugins: pluginsScript,
            });

            // collect and replace in script AST similar to non-vue flow
            const scriptFound: string[] = [];
            const containsChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);
            traverse(scriptAst, {
              StringLiteral(path: any) {
                const val = path.node.value;
                if (!val || !containsChinese(val)) return;
                const key = `${prefixKey}${scriptFound.length}`;
                scriptFound.push(val);
                const callee = t.identifier(quoteKeys[1] || 'i18n.t');
                const call = t.callExpression(callee, [t.stringLiteral(key)]);
                path.replaceWith(call);
              },
              TemplateLiteral(path: any) {
                const quasis = path.node.quasis;
                const expressions = path.node.expressions;
                let combined = '';
                for (let i = 0; i < quasis.length; i++) {
                  combined += quasis[i].value.cooked;
                  if (i < expressions.length) combined += `{${i}}`;
                }
                if (!containsChinese(combined)) return;
                const key = `${prefixKey}${scriptFound.length}`;
                scriptFound.push(combined);
                const callee = t.identifier(quoteKeys[1] || 'i18n.t');
                const args: any[] = [t.stringLiteral(key)];
                if (expressions && expressions.length)
                  args.push(t.arrayExpression(expressions));
                const call = t.callExpression(callee, args);
                path.replaceWith(call);
              },
              JSXText(path: any) {
                const val = path.node.value && path.node.value.trim();
                if (!val || !containsChinese(val)) return;
                const key = `${prefixKey}${scriptFound.length}`;
                scriptFound.push(val);
                const callee = t.identifier(quoteKeys[0] || '$t');
                const call = t.callExpression(callee, [t.stringLiteral(key)]);
                const expr = t.jSXExpressionContainer(call);
                path.replaceWith(expr);
              },
            });

            const outScript = generate(
              scriptAst,
              { retainLines: true },
              scriptContent
            );
            finalCode = finalCode.replace(scriptContent, outScript.code);

            // ensure hook import exists in SFC script if provided
            if (hookImport) {
              finalCode = Utils.insertImports(finalCode, hookImport);
            }

            // merge found lists
            foundList.push(...scriptFound);
          }

          if (!foundList.length) return null;

          // write finalCode
          FileIO.handleWriteStream(filePath, finalCode, () => {});

          const varObj: any = Utils.getVarObj(foundList);
          const newLangObj = Utils.getGenerateNewLangObj(
            foundList,
            defaultLang,
            initLang,
            prefixKey,
            varObj
          );
          return newLangObj;
        } catch (e) {
          // processing error for vue SFC
          return null;
        }
      }

      const isJsx = /\.(jsx|tsx)$/.test(filePath);
      const isScript = /\.(js|ts|jsx|tsx)$/.test(filePath);
      if (!isScript) return null;

      const plugins: any[] = [
        'classProperties',
        'dynamicImport',
        'optionalChaining',
      ];
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx'))
        plugins.push('typescript');
      if (isJsx || filePath.endsWith('.tsx')) plugins.push('jsx');

      const ast = babelParser.parse(code, {
        sourceType: 'module',
        plugins,
      });

      const foundList: string[] = [];
      const varObj: Record<string, { newKey: string; varList: string[] }> = {};

      const allocateKey = (original: string) => {
        const idx = foundList.length;
        foundList.push(original);
        return `${prefixKey}${idx}`;
      };

      const containsChinese = (s: string) => /[\u4e00-\u9fa5]/.test(s);

      const genCode = (node: any) => {
        try {
          return generate(node).code;
        } catch (e) {
          return '';
        }
      };

      const flattenConcat = (
        node: any
      ): { parts: (string | null)[]; exprs: any[] } | null => {
        // recursively flatten BinaryExpression '+' chains
        if (!node) return null;
        if (t.isBinaryExpression(node) && node.operator === '+') {
          const left = flattenConcat(node.left);
          const right = flattenConcat(node.right);
          if (!left || !right) return null;
          return {
            parts: [...left.parts, ...right.parts],
            exprs: [...left.exprs, ...right.exprs],
          };
        }
        if (t.isStringLiteral(node)) {
          return { parts: [node.value], exprs: [] };
        }
        // expression node
        return { parts: [null], exprs: [node] };
      };

      const buildCallee = (name: string) => {
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
      };

      // helper: determine if current path is already within a call to the given calleeName
      const isInsideI18nCall = (path: any, calleeName: string) => {
        let p = path.parentPath;
        while (p) {
          if (p.isCallExpression && p.isCallExpression()) {
            try {
              const code = generate(p.node.callee).code;
              if (code === calleeName) return true;
            } catch (e) {
              // ignore
            }
          }
          p = p.parentPath;
        }
        return false;
      };

      // choose callee based on jsx vs script
      const scriptCalleeName =
        quoteKeys && quoteKeys[1] ? quoteKeys[1] : 'i18n.t';
      const jsxCalleeName = quoteKeys && quoteKeys[0] ? quoteKeys[0] : '$t';

      // traverse AST and replace literals / template literals / JSXText / JSXAttribute
      traverse(ast, {
        StringLiteral(path: any) {
          try {
            const val = path.node.value;
            if (!val || !containsChinese(val)) return;
            // avoid replacing in import declarations, object property keys, or if already inside i18n call
            const parent = path.parentPath;
            if (
              (parent &&
                parent.isImportDeclaration &&
                parent.isImportDeclaration()) ||
              (parent &&
                parent.isObjectProperty &&
                parent.isObjectProperty() &&
                path.key === 'key') ||
              isInsideI18nCall(path, scriptCalleeName) ||
              isInsideI18nCall(path, jsxCalleeName)
            )
              return;
            const key = allocateKey(val);
            const callee = buildCallee(scriptCalleeName);
            const call = t.callExpression(callee, [t.stringLiteral(key)]);
            path.replaceWith(call);
          } catch (e) {
            // ignore
          }
        },
        TemplateLiteral(path: any) {
          try {
            const quasis = path.node.quasis;
            const expressions = path.node.expressions;
            // check if any quasi contains Chinese
            const hasChinese = quasis.some((q: any) =>
              containsChinese(q.value.cooked)
            );
            if (!hasChinese) return;

            // build original source and newKey/varList
            const originalCode = genCode(path.node); // e.g. `你好 ${name}`
            // skip if inside existing i18n call
            if (
              isInsideI18nCall(path, scriptCalleeName) ||
              isInsideI18nCall(path, jsxCalleeName)
            )
              return;
            const parts: string[] = [];
            const varList: string[] = [];
            for (let i = 0; i < quasis.length; i++) {
              parts.push(quasis[i].value.cooked || '');
              if (i < expressions.length) {
                parts.push(`{${varList.length}}`);
                varList.push(genCode(expressions[i]));
              }
            }
            const newKey = parts.join('');
            varObj[originalCode] = { newKey, varList };
            const key = allocateKey(originalCode);
            const callee = buildCallee(scriptCalleeName);
            const args: any[] = [t.stringLiteral(key)];
            if (expressions && expressions.length)
              args.push(t.arrayExpression(expressions as any));
            const call = t.callExpression(callee, args);
            path.replaceWith(call);
          } catch (e) {
            // ignore
          }
        },
        JSXText(path: any) {
          try {
            const val = path.node.value && path.node.value.trim();
            if (!val || !containsChinese(val)) return;
            const original = val;
            const key = allocateKey(original);
            const callee = buildCallee(jsxCalleeName);
            const call = t.callExpression(callee, [t.stringLiteral(key)]);
            const expr = t.jSXExpressionContainer(call);
            path.replaceWith(expr);
          } catch (e) {
            // ignore
          }
        },
        JSXAttribute(path: any) {
          try {
            const attr = path.node;
            if (!attr || !attr.value) return;
            // value can be Literal or JSXExpressionContainer
            if (
              t.isStringLiteral(attr.value) &&
              containsChinese(attr.value.value)
            ) {
              const original = attr.value.value;
              const key = allocateKey(original);
              const callee = buildCallee(jsxCalleeName);
              const call = t.callExpression(callee, [t.stringLiteral(key)]);
              path.node.value = t.jSXExpressionContainer(call);
            } else if (t.isJSXExpressionContainer(attr.value)) {
              const expr = attr.value.expression;
              // handle template literal or binary concat inside attribute
              if (t.isTemplateLiteral(expr)) {
                const originalCode = genCode(expr);
                const parts: string[] = [];
                const varList: string[] = [];
                const quasis = expr.quasis;
                const expressions = expr.expressions;
                const hasChinese = quasis.some((q: any) =>
                  containsChinese(q.value.cooked)
                );
                if (hasChinese) {
                  for (let i = 0; i < quasis.length; i++) {
                    parts.push(quasis[i].value.cooked || '');
                    if (i < expressions.length) {
                      parts.push(`{${varList.length}}`);
                      varList.push(genCode(expressions[i]));
                    }
                  }
                  varObj[originalCode] = { newKey: parts.join(''), varList };
                  const key = allocateKey(originalCode);
                  const callee = buildCallee(jsxCalleeName);
                  const args: any[] = [t.stringLiteral(key)];
                  if (expressions && expressions.length)
                    args.push(t.arrayExpression(expressions as any));
                  const call = t.callExpression(callee, args);
                  path.node.value = t.jSXExpressionContainer(call);
                }
              } else if (t.isBinaryExpression(expr) && expr.operator === '+') {
                const flat = flattenConcat(expr);
                if (flat) {
                  const parts: (string | null)[] = flat.parts;
                  const exprNodes = flat.exprs;
                  const hasChinese = parts.some(
                    (p) => typeof p === 'string' && containsChinese(p)
                  );
                  if (hasChinese) {
                    const originalCode = genCode(expr);
                    const newParts: string[] = [];
                    const varList: string[] = [];
                    let exprIdx = 0;
                    for (const p of parts) {
                      if (p === null) {
                        newParts.push(`{${varList.length}}`);
                        varList.push(genCode(exprNodes[exprIdx++]));
                      } else {
                        newParts.push(p);
                      }
                    }
                    varObj[originalCode] = {
                      newKey: newParts.join(''),
                      varList,
                    };
                    const key = allocateKey(originalCode);
                    const callee = buildCallee(jsxCalleeName);
                    const args: any[] = [t.stringLiteral(key)];
                    if (exprNodes.length)
                      args.push(t.arrayExpression(exprNodes));
                    const call = t.callExpression(callee, args);
                    path.node.value = t.jSXExpressionContainer(call);
                  }
                }
              }
            }
          } catch (e) {
            // ignore
          }
        },
      });

      // If nothing found, return null
      if (!foundList.length) return null;

      const out = generate(ast, { retainLines: true }, code);
      const newCode = out.code;

      // write back using FileIO
      FileIO.handleWriteStream(filePath, newCode, () => {});

      // build newLangObj using varObj collected during traversal
      const newLangObj = Utils.getGenerateNewLangObj(
        foundList,
        defaultLang,
        initLang,
        prefixKey,
        varObj as any
      );
      return newLangObj;
    } catch (e) {
      // parsing/processing error
      // console.error("astProcessFile error", e);
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
      // 若原始字符串本身带反引号包裹且提取的 key 也需要用于替换，可保留（当前提取阶段通常不含反引号，这里仅防御性处理）
      let finalKey = newKey;
      if (original.startsWith('`') && original.endsWith('`')) {
        finalKey = `\`${newKey}\``;
      }
      if (varList.length) {
        varObj[original] = { newKey: finalKey, varList };
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
    cookie: string
  ) {
    const transSourceObj = {};
    const result = { transSourceObj: null, message: '' };
    if (isEmpty(localLangObj)) {
      return result;
    }
    const defaultSource = localLangObj[defaultLang];
    if (isEmpty(defaultSource)) {
      return result;
    }
    const nt = '<br>';
    // 获取源文案
    Object.entries(localLangObj).map(([lang, obj]) => {
      if (lang !== defaultLang) {
        if (!transSourceObj[lang]) {
          transSourceObj[lang] = {};
        }
        Object.keys(obj).forEach((k) => {
          if (!obj[k]) {
            const keyStr = defaultSource[k];
            if (keyStr) {
              // 有翻译源文案
              transSourceObj[lang][keyStr] = obj[k];
            }
          }
        });
      }
    });

    const getTransText = (obj: any = {}, max: number = 10) => {
      // 统一处理所有换行符为 <br>
      // const normalizeNewline = (str: string) => {
      //   return str.replace(/\r\n|\r|\n/g, nt);
      // };
      const keys = Object.keys(obj);
      return chunk(keys, max);
    };

    const langMap = {
      zh: '中文',
      en: '英文',
      ko: '韩文',
      ru: '俄文',
      vi: '越文',
    };
    const resMap = {
      中文: 'zh',
      英文: 'en',
      韩文: 'ko',
      俄文: 'ru',
      越文: 'vi',
    };
    const qArr = getTransText(transSourceObj['en']); // 默认分组
    if (!qArr || !qArr.length) {
      result.message = `${defaultLang}的源文案不能为空！`;
      return result;
    }

    // 为 qArr 中每个文本生成一个翻译请求任务（不使用本地缓存）
    let wordCount = 1;
    let statusBarItem: vscode.StatusBarItem | undefined;
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left
    );
    statusBarItem.text = `$(sync~spin) 正在翻译${wordCount}/${qArr.length}`;
    statusBarItem.show();
    const taskList: (() => Promise<{ q: string[]; data: any }>)[] = qArr.map(
      (q) => async () => {
        return new Promise<{ q: string[]; data: any }>(
          async (resolve, reject) => {
            const params = {
              inputLanguage: langMap['zh'],
              query: q.join(SPLIT),
              cookie,
            };
            const { data } = await Baidu.getTranslate(params);
            wordCount++;
            statusBarItem.text = `$(sync~spin) 正在翻译${wordCount}/${qArr.length}`;
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

      // 合并本次请求结果
      results.forEach(({ q, data }) => {
        Object.keys(data.data).forEach((key) => {
          const lang = resMap[key];
          const trans = data.data[key].split(SPLIT);
          if (!transSourceObj[lang]) {
            transSourceObj[lang] = {};
          }
          q.forEach((v, k) => {
            transSourceObj[lang][v] = trans[k]?.trim();
          });
        });
      });

      // 另外，将之前可能存在的缓存项（已在前面写入）和本次结果一起返回
      result.transSourceObj = transSourceObj;
      return result;
    } catch (e) {
      Message.showMessage(e.message || '翻译失败');
      return result;
    } finally {
      if (statusBarItem) {
        statusBarItem.hide();
        statusBarItem.dispose();
      }
    }
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
