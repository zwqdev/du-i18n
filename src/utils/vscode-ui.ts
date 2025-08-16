import * as vscode from 'vscode';
import { Utils } from './index';
import { Config } from './config';
import { FileIO } from './fileIO';
const path = require('path');
const isEmpty = require('lodash/isEmpty');

let timeoutId: any = null;
let decorationType: vscode.TextEditorDecorationType | null = null;
const POSITION_CACHE: Map<string, any> = new Map(); // key: uri+version -> positionObj
const MAX_DECORATIONS = 2000; // 安全上限，避免极端大文件卡顿
/**
 * vscode-UI交互类
 */
export class VSCodeUI {
  static userKey = '';
  static enableDecoration = true; // 若使用 Inlay Hint 则设置为 false
  /**
   * 渲染装饰类
   * @param config
   */
  static renderDecoration(config: Config) {
    if (!VSCodeUI.enableDecoration) {
      VSCodeUI.clearDecoration();
      return;
    }
    const activeEditor = vscode.window.activeTextEditor;
    const langObj = config.getCurLangObj(VSCodeUI.userKey);
    if (!activeEditor || isEmpty(langObj)) return;
    const { fileName, getText } = activeEditor.document || {};
    const contentText = getText ? getText() : '';
    const quoteKeysStr = config.getQuoteKeysStr();
    const fileReg = config.getFileReg();
    if (
      quoteKeysStr &&
      fileReg.test(fileName) &&
      VSCodeUI.checkText(contentText, quoteKeysStr)
    ) {
      const cacheKey = `${activeEditor.document.uri.toString()}:${
        activeEditor.document.version
      }`;
      let positionObj = POSITION_CACHE.get(cacheKey);
      if (!positionObj) {
        positionObj = VSCodeUI.getKeyPosition(contentText, quoteKeysStr);
        POSITION_CACHE.set(cacheKey, positionObj);
      }
      VSCodeUI.triggerUpdateDecorations(activeEditor, positionObj, langObj);
    } else {
      VSCodeUI.clearDecoration();
    }
  }

  /**
   * 获取i18n的key
   * @param keyStr
   * @returns
   */
  static getI18NKey(keyStr: string) {
    let res = keyStr;
    res = res.split(',')[0];
    res = res.replace(/[\t\n'"]/g, '');
    return res;
  }

  /**
   * 判断当前文档是否包含i18n的引用
   * @param str
   * @param keys
   * @returns
   */
  static checkText(str: string, keys: string) {
    const list = keys.replace(/\s/g, '').replace(',', '(,').split(',');
    return list.some((t) => t !== '(' && str.indexOf(t) > -1);
  }

  static getKeyPosition(text: any, keys: string) {
    const positionObj: any = {}; // key: 左括号位置+右括号位置，value: i18n的字符串
    if (keys && text) {
      keys.split(',').forEach((k) => {
        const key = (k || '').trim() + '(';
        let index = -1,
          startIndex = 0;
        while ((index = text.indexOf(key, startIndex)) > -1) {
          const leftCol = index + key.length; // 左括号位置
          const rightCol = text.indexOf(')', leftCol); // 右括号位置
          if (rightCol > -1) {
            const value = VSCodeUI.getI18NKey(
              text.substring(leftCol, rightCol)
            );
            // key: 左括号位置+右括号位置，value: i18n的字符串
            positionObj[`${leftCol}-${rightCol + 1}`] = value || '';
            startIndex = leftCol;
            if (Object.keys(positionObj).length > MAX_DECORATIONS) {
              break; // 超限提前退出
            }
          } else {
            break;
          }
        }
      });
    }
    return positionObj;
  }

  /**
   * 显示装饰
   * @param editor
   * @param positionObj
   * @param lang
   */
  static showDecoration(
    editor: vscode.TextEditor,
    positionObj: Record<string, string>,
    lang: object
  ) {
    if (!VSCodeUI.enableDecoration) return;
    if (!editor || !positionObj) return;

    const foregroundColor = new vscode.ThemeColor('editorCodeLens.foreground');

    if (!decorationType) {
      decorationType = vscode.window.createTextEditorDecorationType({
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        overviewRulerColor: 'grey',
        overviewRulerLane: vscode.OverviewRulerLane.Left,
      });
    }

    const decorationOptions: vscode.DecorationOptions[] = [];
    Object.entries(positionObj).forEach(([k, v]: any) => {
      const p: any = k.split('-');
      if (p && p.length === 2) {
        const start = +p[0];
        const end = +p[1];
        if (Number.isNaN(start) || Number.isNaN(end)) return;
        const startPosition = editor.document.positionAt(start);
        const endPosition = editor.document.positionAt(end);
        const range = new vscode.Range(startPosition, endPosition);
        const value = Utils.getObjectValue(lang, v) || '';
        if (!value) return; // 空翻译跳过
        const text = Utils.getStringText(value);
        if (!text) return;
        decorationOptions.push({
          range,
          renderOptions: {
            after: {
              contentText: ` ${text}`,
              color: foregroundColor,
            },
          },
        });
      }
    });
    editor.setDecorations(decorationType, decorationOptions);
  }

  /**
   * 触发更新装饰
   * @param activeEditor
   * @param positionList
   * @param langObj
   */
  static triggerUpdateDecorations(
    activeEditor: vscode.TextEditor,
    positionObj: object,
    langObj: object
  ) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      // 防止切换文档后误渲染
      if (
        !activeEditor ||
        activeEditor.document !== vscode.window.activeTextEditor?.document
      ) {
        return;
      }
      VSCodeUI.showDecoration(activeEditor, positionObj as any, langObj);
    }, 250);
  }

  static clearDecoration() {
    if (decorationType) {
      // 仅清空当前活动编辑器范围的内容
      const ed = vscode.window.activeTextEditor;
      if (ed) ed.setDecorations(decorationType, []);
    }
  }

  /**
   * 写入并打开文档
   * @param basePath
   * @param dirName
   * @param fileName
   * @param content
   */
  static async writeAndOpenDoc(basePath, dirName, fileName, content) {
    const dirNameArr = dirName.split('/');
    const newFilePath = path.join(basePath, ...dirNameArr, fileName);
    await FileIO.writeContentToLocalFile2(
      path.join(basePath, ...dirNameArr),
      fileName,
      content
    );

    vscode.workspace.openTextDocument(newFilePath).then((doc) => {
      vscode.window.showTextDocument(doc);
    });
  }
}
