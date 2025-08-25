import * as vscode from "vscode";
import { Utils } from "./utils";
import { VSCodeUI } from "./utils/vscode-ui";
import { FileIO } from "./utils/fileIO";
import { Config } from "./utils/config";
import { MessageType, Message } from "./utils/message";
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const isEmpty = require("lodash/isEmpty");
import { ViewLoader } from "./view/ViewLoader";

interface LangType {
  defaultKey: string;
  language: object;
  langFilePath?: object;
  filePath?: string;
  type?: string;
}

// Centralized constants (avoid magic numbers scattered in code)
const SAVE_IGNORE_MS = 500; // ignore fs events within 500ms of an editor save
const DEFAULT_WATCH_GLOB = "**/*.{ts,tsx,js,jsx,vue,html,json}";
const FS_DEBOUNCE_MS = 300; // debounce delay for filesystem events
const DEFAULT_CONCURRENCY_SCAN = 4;
const DEFAULT_CONCURRENCY_TRANSLATE = 3;

let langObj: LangType = null;

/**
 * 生成合并预览的HTML内容
 */
function generateMergePreviewHTML(previewResult: any): string {
  const { mergePreview, affectedFiles, summary } = previewResult;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>合并重复key预览</title>
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            padding: 20px; 
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .header { margin-bottom: 20px; }
        .summary { 
            background: var(--vscode-editor-selectionBackground); 
            padding: 15px; 
            border-radius: 4px; 
            margin-bottom: 20px; 
        }
        .section { margin-bottom: 30px; }
        .section h3 { 
            color: var(--vscode-symbolIcon-namespaceforeground); 
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 5px;
        }
        .merge-item { 
            background: var(--vscode-list-hoverBackground); 
            margin: 10px 0; 
            padding: 12px; 
            border-radius: 4px; 
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        .old-keys { 
            color: var(--vscode-errorForeground); 
            font-family: var(--vscode-editor-font-family);
        }
        .new-key { 
            color: var(--vscode-string-foreground); 
            font-weight: bold;
            font-family: var(--vscode-editor-font-family);
        }
        .value { 
            color: var(--vscode-textPreformat-foreground); 
            font-style: italic; 
            margin: 5px 0;
        }
        .file-item { 
            margin: 8px 0; 
            padding: 8px 12px; 
            background: var(--vscode-input-background);
            border-radius: 3px;
        }
        .file-path { 
            font-family: var(--vscode-editor-font-family); 
            color: var(--vscode-textLink-foreground); 
            font-size: 0.9em;
        }
        .replacement { 
            margin-left: 20px; 
            font-size: 0.85em; 
            color: var(--vscode-descriptionForeground);
        }
        .actions { 
            margin-top: 30px; 
            padding-top: 20px; 
            border-top: 1px solid var(--vscode-panel-border);
        }
        .button { 
            background: var(--vscode-button-background); 
            color: var(--vscode-button-foreground); 
            border: none; 
            padding: 10px 20px; 
            margin-right: 10px; 
            cursor: pointer; 
            border-radius: 3px;
        }
        .button:hover { 
            background: var(--vscode-button-hoverBackground); 
        }
        .button.secondary { 
            background: var(--vscode-button-secondaryBackground); 
            color: var(--vscode-button-secondaryForeground); 
        }
        .button.secondary:hover { 
            background: var(--vscode-button-secondaryHoverBackground); 
        }
        .highlight { background: var(--vscode-editor-findMatchHighlightBackground); }
        .count { 
            background: var(--vscode-badge-background); 
            color: var(--vscode-badge-foreground); 
            padding: 2px 6px; 
            border-radius: 10px; 
            font-size: 0.8em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>🔄 合并重复key预览</h2>
    </div>
    
    <div class="summary">
        <h3>📊 统计信息</h3>
        <p><strong>最小重复次数:</strong> <span class="count">${
          previewResult.minDuplicateCount || 2
        }</span></p>
        <p><strong>重复值组数:</strong> <span class="count">${
          summary.totalMergedGroups
        }</span></p>
        <p><strong>可节省key数量:</strong> <span class="count">${
          summary.totalSavedKeys
        }</span></p>
        <p><strong>影响文件数量:</strong> <span class="count">${
          summary.totalAffectedFiles
        }</span></p>
    </div>

    <div class="section">
        <h3>🎯 合并方案</h3>
        ${mergePreview
          .map(
            (item) => `
            <div class="merge-item">
                <div><strong>新key:</strong> <span class="new-key">${
                  item.newKey
                }</span></div>
                <div class="value">"${item.value}"</div>
                <div><strong>将替换的keys (${
                  item.occurrences
                }个):</strong></div>
                <div class="old-keys">${item.oldKeys
                  .map((key) => `"${key}"`)
                  .join(", ")}</div>
            </div>
        `
          )
          .join("")}
    </div>

    <div class="section">
        <h3>📁 影响的文件</h3>
        ${
          affectedFiles.length > 0
            ? affectedFiles
                .map(
                  (file) => `
            <div class="file-item">
                <div class="file-path">${file.filePath}</div>
                ${file.replacements
                  .map(
                    (replacement) => `
                    <div class="replacement">
                        Line ${replacement.line}: <span class="old-keys">"${replacement.oldKey}"</span> → <span class="new-key">"${replacement.newKey}"</span>
                        <br><code>${replacement.context}</code>
                    </div>
                `
                  )
                  .join("")}
            </div>
        `
                )
                .join("")
            : "<p>未找到需要修改的文件</p>"
        }
    </div>

    <div class="actions">
        <button class="button" onclick="executeMerge()">✅ 确认执行合并</button>
        <button class="button secondary" onclick="window.close()">❌ 取消</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function executeMerge() {
            vscode.postMessage({
                command: 'executeMerge'
            });
        }
    </script>
</body>
</html>`;
}

export async function activate(context: vscode.ExtensionContext) {
  try {
    const config = new Config();
    // Track recent saves initiated from the editor to avoid duplicate
    // refreshes when file system watcher emits the same change.
    const recentEditorSaves: Map<string, number> = new Map();
    // 初始化
    config.init(context, () => {
      // 渲染语言
      VSCodeUI.renderDecoration(config);
      console.log("config init complete");
    });

    // 监听文件保存
    vscode.workspace.onDidSaveTextDocument(
      async (document) => {
        let activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document === document) {
          const fileName = activeEditor.document.fileName;
          const fileReg = config.getFileReg();
          const jsonReg = config.getJsonReg();
          if (jsonReg.test(fileName)) {
            // 需要扩展
            let transSourcePaths = config.getTransSourcePaths();
            transSourcePaths = transSourcePaths.replace(/\*/g, "");
            // console.log('transSourcePaths', fileName, transSourcePaths);
            if (FileIO.isIncludePath(fileName, transSourcePaths)) {
              // console.log('setTransSourceObj');
              // 更新翻译源
              await config.setTransSourceObj(() => {}, false);
            }
            const configFilePath = config.getConfigFilePath();
            if (FileIO.isIncludePath(fileName, configFilePath)) {
              config.init(context, () => {});
              console.log("deyi2", config);
            }
          }
          if (fileReg.test(fileName)) {
            // 渲染语言
            VSCodeUI.renderDecoration(config);
            // record this save so the fileWatcher can ignore the subsequent fs event
            try {
              recentEditorSaves.set(fileName, Date.now());
            } catch (e) {
              // ignore map errors
            }
          }
        }
      },
      null,
      context.subscriptions
    );

    // 监听活动文件窗口
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document === editor?.document) {
        // 扫描内部特殊引用方式
        // await scanInnerFile();
        // 渲染语言
        VSCodeUI.renderDecoration(config);
        // discard: 对接多语言平台api已废弃，先去掉耗性能
        // // 多语言平台
        // onlineOnDidChangeActiveTextEditor();
      }
    });

    // Watch filesystem changes (covers external changes, git plugin undos, etc.)
    // Debounce and filter by configured file pattern to avoid excessive refreshes.
    try {
      // Prefer an explicit watcher glob if provided by config, otherwise use a narrower default
      const watchGlob =
        typeof (config as any).getWatcherGlob === "function"
          ? (config as any).getWatcherGlob() || DEFAULT_WATCH_GLOB
          : DEFAULT_WATCH_GLOB;
      const fileWatcher = vscode.workspace.createFileSystemWatcher(watchGlob);
      context.subscriptions.push(fileWatcher);
      const filesChanged = new Set<string>();
      let fsDebounceTimer: any = null;

      const scheduleFsRefresh = async (uri: vscode.Uri) => {
        try {
          const filePath = uri.fsPath;
          const fileReg = config.getFileReg && config.getFileReg();
          try {
            const now = Date.now();
            const lastSave = recentEditorSaves.get(filePath);
            if (lastSave && now - lastSave < SAVE_IGNORE_MS) {
              // recent save from editor — skip this fs-triggered refresh
              recentEditorSaves.delete(filePath);
              return;
            }
          } catch (e) {
            // ignore map lookup errors
          }
          // If config.getFileReg returns a RegExp, test against it; otherwise refresh for all
          if (fileReg instanceof RegExp) {
            if (!fileReg.test(filePath)) return;
          }
          filesChanged.add(filePath);
          if (fsDebounceTimer) clearTimeout(fsDebounceTimer);
          fsDebounceTimer = setTimeout(async () => {
            filesChanged.clear();
            // Refresh internal language cache and re-render decorations
            await config.refreshGlobalLangObj();
            VSCodeUI.renderDecoration(config);
            fsDebounceTimer = null;
          }, FS_DEBOUNCE_MS);
        } catch (e) {
          console.error("fileWatcher schedule error", e);
        }
      };

      fileWatcher.onDidChange((uri) => scheduleFsRefresh(uri));
      fileWatcher.onDidCreate((uri) => scheduleFsRefresh(uri));
      fileWatcher.onDidDelete((uri) => scheduleFsRefresh(uri));
    } catch (e) {
      console.error("failed to create file watcher", e);
    }

    // 监听命令-扫描中文
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.scanAndGenerate",
        async function () {
          // console.log("vscode 扫描中文")
          try {
            // logging disabled

            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
              const { fileName } = activeEditor.document || {};
              const initLang = config.getTranslateLangs();
              const keys = config.getQuoteKeys();
              const defaultLang = config.getDefaultLang();
              const prefixKey = config.getPrefixKey(fileName);
              const tempPaths = config.getTempPaths();
              const pageEnName = config.generatePageEnName(fileName);
              const tempFileName = config.getTempFileName();
              const isNeedRandSuffix = config.getIsNeedRandSuffix();
              // removed unused params isSingleQuote & keyBoundaryChars in refactor
              const isHookImport = config.getHookImport();
              const handleRefresh = async () => {
                await config.refreshGlobalLangObj();
                VSCodeUI.renderDecoration(config);
              };
              // Get existing language object for key reuse optimization from langPaths
              let existingLangObj: any = null;
              if (config.getReuseExistingKey()) {
                try {
                  const langPathsGlob = config.getLangPaths();
                  const defaultLang = config.getDefaultLang();
                  if (langPathsGlob) {
                    const files = await FileIO.getFiles(langPathsGlob);
                    const defaultLangFile = files.find(({ fsPath }) => {
                      const fileName = path.basename(fsPath);
                      return fileName === `${defaultLang}.json`;
                    });
                    if (defaultLangFile) {
                      const rawContent = await fsp.readFile(
                        defaultLangFile.fsPath,
                        "utf-8"
                      );
                      existingLangObj = Utils.parseJsonSafe(rawContent);
                    }
                  }
                } catch (e) {
                  console.error("Failed to load existing language file:", e);
                  existingLangObj = null;
                }
              }
              Utils.handleScanAndInit(
                fileName,
                initLang,
                keys,
                defaultLang,
                prefixKey,
                isHookImport,
                config.getSkipExtractCallees(),
                (newLangObj) => {
                  if (!isEmpty(newLangObj)) {
                    FileIO.writeIntoTempFile(
                      tempPaths,
                      fileName,
                      newLangObj,
                      pageEnName,
                      tempFileName,
                      isNeedRandSuffix,
                      async () => {
                        handleRefresh();
                      }
                    );
                  }
                },
                existingLangObj
              );
            }
          } catch (e) {
            console.error("scanAndGenerate e", e);
          }
        }
      )
    );

    // 监听命令-批量扫描中文
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.multiScanAndGenerate",
        async () => {
          const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
          });

          const handleRefresh = async () => {
            await config.refreshGlobalLangObj();
            VSCodeUI.renderDecoration(config);
          };

          if (folderUri && folderUri.length > 0) {
            const folderPath = folderUri[0].fsPath;
            const initLang = config.getTranslateLangs();
            const keys = config.getQuoteKeys();
            const defaultLang = config.getDefaultLang();
            const tempPaths = config.getTempPaths();
            // Get existing language object for key reuse optimization from langPaths
            let existingLangObj: any = null;
            if (config.getReuseExistingKey()) {
              try {
                const langPathsGlob = config.getLangPaths();
                if (langPathsGlob) {
                  const files = await FileIO.getFiles(langPathsGlob);
                  const defaultLangFile = files.find(({ fsPath }) => {
                    const fileName = path.basename(fsPath);
                    return fileName === `${defaultLang}.json`;
                  });
                  if (defaultLangFile) {
                    const rawContent = await fsp.readFile(
                      defaultLangFile.fsPath,
                      "utf-8"
                    );
                    existingLangObj = Utils.parseJsonSafe(rawContent);
                  }
                }
              } catch (e) {
                console.error("Failed to load existing language file:", e);
                existingLangObj = null;
              }
            }

            FileIO.getFolderFiles(folderPath)
              .then(async (files: any[]) => {
                const validFiles = files.filter(
                  (f: string) => !config.isScanIgnored(f)
                );
                if (files.length && !validFiles.length) {
                  vscode.window.showInformationMessage(
                    "所有文件已被 scanIgnoreGlobs 规则忽略"
                  );
                }
                // Use vscode.withProgress to show cancellable progress and avoid custom statusBar UI
                const total = validFiles.length;
                if (!total) return;

                Promise.resolve(
                  vscode.window.withProgress(
                    {
                      location: vscode.ProgressLocation.Notification,
                      title: `批量扫描 ${total} 个文件`,
                      cancellable: true,
                    },
                    async (progress, token) => {
                      let processedCount = 0;
                      let cancelled = false;
                      token.onCancellationRequested(() => {
                        cancelled = true;
                      });

                      const requestList = validFiles.map(
                        (file: any, i: number) => {
                          return async () => {
                            if (cancelled) return null;
                            try {
                              const fileName = file;
                              const prefixKey = config.getPrefixKey(
                                fileName,
                                i.toString()
                              );
                              const pageEnName =
                                config.generatePageEnName(fileName);
                              const tempFileName = config.getTempFileName();
                              const isNeedRandSuffix =
                                config.getIsNeedRandSuffix();
                              const isHookImport = config.getHookImport();

                              // Use astProcessFile which returns a Promise<newLangObj|null>
                              let newLangObj: any = null;
                              try {
                                newLangObj = await Utils.astProcessFile(
                                  fileName,
                                  initLang,
                                  keys,
                                  defaultLang,
                                  prefixKey,
                                  isHookImport,
                                  {
                                    skipExtractCallees:
                                      config.getSkipExtractCallees(),
                                    existingLangObj: existingLangObj,
                                  }
                                );
                              } catch (e) {
                                console.error("astProcessFile error", e);
                                newLangObj = null;
                              }

                              if (cancelled) return null;

                              if (newLangObj) {
                                await new Promise((resolve) => {
                                  FileIO.writeIntoTempFile(
                                    tempPaths,
                                    fileName,
                                    newLangObj,
                                    pageEnName,
                                    tempFileName,
                                    isNeedRandSuffix,
                                    async () => {
                                      if (config.isOnline()) {
                                        config.handleSendToOnline(
                                          newLangObj,
                                          pageEnName,
                                          async () => {
                                            resolve(null);
                                          }
                                        );
                                      } else {
                                        resolve(null);
                                      }
                                    }
                                  );
                                });
                              }
                            } catch (e) {
                              console.error(
                                "multiScanAndGenerate file error",
                                e
                              );
                            } finally {
                              processedCount++;
                              const increment = total ? (1 / total) * 100 : 100;
                              progress.report({
                                message: `批量扫描 ${processedCount}/${total}`,
                                increment,
                              });
                              if (processedCount === total && !cancelled) {
                                await handleRefresh();
                              }
                            }
                            return null;
                          };
                        }
                      );

                      const concurrency = DEFAULT_CONCURRENCY_SCAN; // reasonable default
                      try {
                        await Utils.limitedParallelRequests(
                          requestList,
                          concurrency
                        );
                      } catch (e) {
                        if (!cancelled) console.error(e);
                      }
                    }
                  )
                ).catch((e) => console.error("withProgress error", e));
              })
              .catch((e) => {
                console.error("getFolderFiles e", e);
              });
          }
        }
      )
    );

    // 监听命令-在线翻译
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.translateFromChineseKey",
        async function () {
          try {
            // logging disabled

            // console.log("vscode 中文转译")
            const langKey = VSCodeUI.userKey || config.getDefaultLang();
            const tempPaths = config.getTempPaths();
            const isOverWriteLocal = config.getIsOverWriteLocal();

            const handleTranslate = async (
              sourObj: any = {},
              filePath: string = ""
            ) => {
              await Utils.translateLocalFile(
                sourObj,
                langKey,
                tempPaths,
                filePath,
                isOverWriteLocal
              );
              if (!config.isOnline()) {
                await config.refreshGlobalLangObj();
              }
              // logging disabled
            };
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
              const { fileName } = activeEditor.document || {};
              const tempPaths = config.getTempPaths();
              const tempPathName = tempPaths.replace(/\*/g, "");
              // console.log('fileName', fileName, tempPathName);
              if (
                fileName &&
                FileIO.isIncludePath(fileName, tempPathName) &&
                /\.(json)$/.test(fileName)
              ) {
                if (!/\.(json)$/.test(fileName)) {
                  return;
                }
                let data: string | null = null;
                try {
                  data = await fsp.readFile(fileName, "utf-8");
                } catch (e) {
                  console.error("read file error", e);
                  return;
                }
                if (!data) {
                  return;
                }
                const localLangObj = Utils.parseJsonSafe(data);
                if (!localLangObj) {
                  Message.showMessage(
                    "解析本地 JSON 失败，请检查文件格式",
                    MessageType.WARNING
                  );
                  return;
                }

                const login = await Utils.getCookie(config.getAccount());

                if (login?.code !== "000000") {
                  Message.showMessage(login?.msg || "登录失败");
                  return;
                }
                const { transSourceObj, message } =
                  await Utils.getTransSourceObjByLlm(
                    localLangObj,
                    langKey,
                    `test_gj_ticket=${login.data}`,
                    {
                      label: "单文件翻译",
                    },
                    { batchSize: config.getTransBatchSize() }
                  );
                if (!isEmpty(transSourceObj)) {
                  handleTranslate(transSourceObj, fileName);
                } else {
                  Message.showMessage(message, MessageType.WARNING);
                }
              } else {
                Message.showMessage(
                  `单个文件调用在线翻译，请到目录${tempPaths}的翻译文件中调用该命令`,
                  MessageType.WARNING
                );
              }
            }
          } catch (e) {
            console.error(e);
            // logging disabled
          }
        }
      )
    );

    // 监听命令-批量在线翻译
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.multiTranslateFromChineseKey",
        async function () {
          try {
            // console.log("vscode 中文转译")
            const langKey = VSCodeUI.userKey || config.getDefaultLang();
            const tempPaths = config.getTempPaths();
            const isOverWriteLocal = config.getIsOverWriteLocal();

            const handleTranslate = async (
              sourObj: any = {},
              filePath: string = ""
            ) => {
              await Utils.translateLocalFile(
                sourObj,
                langKey,
                tempPaths,
                filePath,
                isOverWriteLocal
              );
              if (!config.isOnline()) {
                await config.refreshGlobalLangObj();
              }
            };
            if (config.isOnline()) {
              const transSourceObj = config.getTransSourceObj();
              // console.log('transSourceObj', transSourceObj);
              if (isEmpty(transSourceObj)) {
                await config.setTransSourceObj((data) => {
                  handleTranslate(data);
                });
              } else {
                handleTranslate(transSourceObj);
              }
              // logging disabled
            } else {
              // 返回没有翻译的文件集合
              const resultObj: any = await config.handleMissingDetection(
                "filePath"
              );

              // 空结果或异常情况直接返回
              if (!resultObj || isEmpty(resultObj)) {
                Message.showMessage("没有需要翻译的内容");
                return;
              }

              const login = await Utils.getCookie(config.getAccount());

              if (login?.code !== "000000") {
                Message.showMessage(login?.msg || "登录失败");
                return;
              }
              // 预聚合: 先算每个文件的批次数, 过滤掉无需翻译的文件
              const fileEntries = Object.entries(resultObj)
                // 过滤忽略的文件
                .filter(([fileName]) => !config.isScanIgnored(fileName))
                .map(([fileName, transObj]: any) => ({
                  fileName,
                  transObj,
                  batchCount: Utils.computeTransBatchCount(
                    transObj,
                    langKey,
                    config.getTransBatchSize()
                  ),
                }));

              if (!fileEntries.length) {
                Message.showMessage("所有文件已被 scanIgnoreGlobs 规则忽略");
                return;
              }
              const filtered = fileEntries.filter((f) => f.batchCount > 0);
              if (!filtered.length) {
                Message.showMessage("没有需要翻译的内容");
                return;
              }
              // 批次级进度：已翻译批次 / 总批次
              const totalBatches = filtered.reduce(
                (sum, f) => sum + f.batchCount,
                0
              );
              if (!totalBatches) {
                Message.showMessage("没有需要翻译的内容");
                return;
              }
              const sharedStatusBar = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Left
              );
              sharedStatusBar.text = `$(sync~spin) 批量翻译 0/${totalBatches}`;
              sharedStatusBar.show();
              let maxDone = 0; // 确保进度单调递增
              const concurrency = DEFAULT_CONCURRENCY_TRANSLATE; // 可调并发
              // 计算每个文件的全局批次 offset
              let accOffset = 0;
              const requestList = filtered.map(
                ({ fileName, transObj, batchCount }) => {
                  const fileOffset = accOffset;
                  accOffset += batchCount;
                  return async () => {
                    try {
                      const { transSourceObj, message } =
                        await Utils.getTransSourceObjByLlm(
                          transObj,
                          langKey,
                          `test_gj_ticket=${login.data}`,
                          {
                            total: totalBatches,
                            offset: fileOffset,
                            suppressBatchStatus: true, // 由外部统一展示
                            reuseStatusBar: sharedStatusBar,
                            label: "批量翻译",
                            onUpdate: (done: number, total: number) => {
                              if (done > maxDone) {
                                maxDone = done;
                                sharedStatusBar.text = `$(sync~spin) 批量翻译 ${done}/${total}`;
                              }
                            },
                          },
                          { batchSize: config.getTransBatchSize() }
                        );
                      if (!isEmpty(transSourceObj)) {
                        handleTranslate(transSourceObj, fileName);
                        return { code: 200, transSourceObj, message };
                      } else {
                        return { code: 500, message };
                      }
                    } catch (e: any) {
                      console.error("e", e);
                      return { code: 500, message: e.message };
                    }
                  };
                }
              );
              Utils.limitedParallelRequests(requestList, concurrency)
                .then((result) => {
                  if (Array.isArray(result)) {
                    const allSuccess = result.every(
                      (item) => item.code === 200
                    );
                    const allFail = result.every((item) => item.code === 500);
                    if (allSuccess) {
                      Message.showMessage(`翻译完成，请检查文件`);
                    } else if (allFail) {
                      if (result[0].message) {
                        Message.showMessage(
                          result[0].message,
                          MessageType.WARNING
                        );
                      }
                      Message.showMessage(`翻译失败，请稍后重试`);
                    } else {
                      if (result[0].message) {
                        Message.showMessage(
                          result[0].message,
                          MessageType.WARNING
                        );
                      }
                      Message.showMessage(`部分翻译完成，请检查文件`);
                    }
                  }
                  sharedStatusBar.hide();
                  sharedStatusBar.dispose();
                })
                .catch((e) => {
                  console.error("e", e);
                  Message.showMessage(`翻译出错，请稍后重试`);
                  sharedStatusBar.hide();
                  sharedStatusBar.dispose();
                });
            }
          } catch (e) {
            console.error("e", e);
            Message.showMessage(`翻译出错，请稍后重试`);
          }
        }
      )
    );

    // 设置
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.setting",
        async function () {
          // openConfigCommand();
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            config.openSetting(fileName, (isInit) => {
              if (isInit) {
                config.init(context, () => {});
                // // 记录用户行为数据
                // logging disabled
              }
            });
          }

          // logging disabled
        }
      )
    );

    // 监听命令-切换显示语言
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.change",
        async function () {
          // 多语言平台
          const defaultLang = config.getDefaultLang();
          const tempLangs = config.getTempLangs();
          const langKey = VSCodeUI.userKey || defaultLang;
          if (Array.isArray(tempLangs) && tempLangs.length) {
            const items = tempLangs.map((k) => ({ label: k, value: k }));
            const selected = await vscode.window.showQuickPick(items, {
              placeHolder: langKey,
            });
            if (selected && selected.value !== VSCodeUI.userKey) {
              VSCodeUI.userKey = selected.value;
              // 重新渲染
              VSCodeUI.renderDecoration(config);
            }
          }
          // logging disabled
        }
      )
    );

    // 监听自定义命令-用于接收下一层返回的数据并进行处理
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "extension.yz.i18n.receive",
        async function (event) {
          console.log(
            "registerCommand callback extension.yz.i18n.receive",
            event
          );
          if (event) {
            switch (event.type) {
              case "READY": // 渲染完成，可以传递参数
                const { defaultKey, language = {}, type } = langObj || {};
                const langKey = VSCodeUI.userKey || defaultKey;
                const payload = {
                  defaultLang: langKey,
                  langs: Object.keys(language),
                  defaultFormat: type,
                };
                ViewLoader.postMessageToWebview({
                  type: "TRANSLATE-POST",
                  payload,
                });
                break;

              case "TRANSLATE-WRITE": // 写入文件
                const data = event.payload || {};
                if (data.lang) {
                  const { langFilePath = {}, filePath, type } = langObj || {};
                  const fsPath = langFilePath[data.lang] || filePath;
                  if (fsPath && data.text) {
                    if (FileIO.writeJsonFileSync(fsPath, data.text)) {
                      return ViewLoader.postMessageToWebview({
                        type: "TRANSLATE-SHOWMSG",
                        payload: true,
                      });
                    }
                  }
                }
                return ViewLoader.postMessageToWebview({
                  type: "TRANSLATE-SHOWMSG",
                  payload: false,
                });
            }
          }
          // logging disabled
        }
      )
    );

    // 监听命令-批量新增
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.add",
        async function () {
          ViewLoader.showWebview(context);
        }
      )
    );

    // 监听命令-刷新
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.updateLocalLangPackage",
        async function () {
          await config.refreshGlobalLangObj(true);
          // 重新渲染
          VSCodeUI.renderDecoration(config);
          vscode.window.showInformationMessage(`翻译数据刷新成功`);

          // logging disabled
        }
      )
    );
    // 监听命令-文件统计
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.analytics",
        async function () {
          const selectFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
          });
          // console.log("selectFolder", selectFolder);
          if (!selectFolder || !selectFolder[0] || !selectFolder[0].path) {
            return;
          }
          const result: any = await Utils.handleAnalystics(
            selectFolder[0].path,
            config.getBigFileLineCount()
          );
          console.log("result", result);
          const panel = vscode.window.createWebviewPanel(
            "analyticsResult",
            "分析与统计-结果",
            vscode.ViewColumn.Two,
            {}
          );
          // 设置HTML内容
          let str = ``;
          if (result && !isEmpty(result.fileTypeObj)) {
            str += `文件统计（类型/个数）：<br/>\n`;
            str += Object.entries(result.fileTypeObj)
              .map(([k, v]) => k + " " + v)
              .join("\n<br/>\n");
            str += "\n<br/>";
            str +=
              "文件总数：" +
              Object.values(result.fileTypeObj).reduce(
                (pre: any, v: any) => pre + v,
                0
              ) +
              "\n<br/>\n";
            str += "\n<br/>\n<br/>";
            str += `index文件（类型/个数）：<br/>\n`;
            str += Object.entries(result.indexFileObj)
              .map(([k, v]) => k + " " + v)
              .join("\n<br/>\n");
            str += Object.keys(result.indexFileObj).length ? "" : "无";
            str += "\n<br/>\n<br/>\n<br/>";
            str += `大文件统计（路径/行数）：<br/>\n`;
            if (!isEmpty(result.bigFileList)) {
              result.bigFileList.forEach((item: any) => {
                str += `${item.path}   ${item.count}`;
                str += "<br/>\n";
              });
            } else {
              str += `无\n`;
            }
            panel.webview.html = str;
          } else {
            panel.webview.html = `暂无数据`;
          }

          // logging disabled
        }
      )
    );

    // 监听命令-上传文案
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.updateLocalToOnline",
        async function () {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            if (config.isOnline()) {
              config.handleSyncTempFileToOnline(fileName, () => {
                config.getOnlineLanguage();
                vscode.window.showInformationMessage(`当前文件上传成功`);
                // logging disabled
              });
              // logging disabled
            } else {
              vscode.window.showWarningMessage(`请完善线上化相关配置`);
              const activeEditor = vscode.window.activeTextEditor;
              if (activeEditor) {
                const { fileName } = activeEditor.document || {};
                config.openSetting(fileName, () => {});
              }
              // logging disabled
            }
          }
        }
      )
    );

    // 监听命令-批量上传文案
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.batchUpdateLocalToOnline",
        async function () {
          if (config.isOnline()) {
            config.handleSyncAllTempFileToOnline(() => {
              config.getOnlineLanguage();
              vscode.window.showInformationMessage(`同步成功`);
              // logging disabled
            });
            // logging disabled
          } else {
            vscode.window.showWarningMessage(`请完善线上化相关配置`);
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
              const { fileName } = activeEditor.document || {};
              config.openSetting(fileName, () => {});
            }
            // logging disabled
          }
          // const selectFolder = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, });
          // // console.log("selectFolder", selectFolder);
          // if (!selectFolder || !selectFolder[0] || !selectFolder[0].path) {return;}
          // await config.handleBatchAdd(selectFolder[0].path);
          // handleRefresh();
        }
      )
    );

    // 监听命令-拉取远程文案
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.updateLocalFromOnline",
        async function () {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            if (config.isOnline()) {
              // logging disabled

              if (!config.checkProjectConfig()) {
                return null;
              }
              await config.getOnlineLanguage();
              const onlineLangObj = config.getOnlineLangObj();
              const localFilePath = config.getLocalLangFilePath();
              const filePath: any = await FileIO.writeContentToLocalFile(
                fileName,
                localFilePath,
                onlineLangObj
              );
              // 设置HTML内容
              if (filePath) {
                vscode.workspace.openTextDocument(filePath).then((doc) => {
                  vscode.window.showTextDocument(doc);

                  // logging disabled
                });
              }
            } else {
              vscode.window.showWarningMessage(`请完善线上化相关配置`);
              config.openSetting(fileName, () => {});
              // logging disabled
            }
          }
        }
      )
    );

    // 监听命令-翻译漏检
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.missingDetection",
        async function () {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            const missCheckResultPath = config.getMissCheckResultPath();
            const result: any = await config.handleMissingDetection();
            console.log("result", result);
            let str = `翻译漏检-结果：\n`;
            if (!isEmpty(result)) {
              const missTranslateKeys = result.missTranslateKeys;
              delete result.missTranslateKeys;
              str += missTranslateKeys.join("\n");
              str += "\n\n";
              str += "详情如下：\n";
              str += JSON.stringify(result, null, "\t");
            } else if (result !== null) {
              str += `太棒了，已全部翻译完成！！！`;
            } else {
              str += `无翻译数据`;
            }
            const filePath: any = await FileIO.writeContentToLocalFile(
              fileName,
              missCheckResultPath,
              str
            );
            if (filePath) {
              vscode.workspace.openTextDocument(filePath).then((doc) => {
                vscode.window.showTextDocument(doc);

                // logging disabled
              });
            }
          }
          // logging disabled
        }
      )
    );

    // 监听命令-远程漏检文案
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.searchUntranslateText",
        async function () {
          try {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
              const { fileName } = activeEditor.document || {};
              if (config.isOnline()) {
                if (!config.checkProjectConfig()) {
                  return null;
                }
                await config.getOnlineLanguage();
                // 多语言平台
                const defaultLang = config.getDefaultLang();
                const tempLangs = config.getTempLangs();
                const langKey = VSCodeUI.userKey || defaultLang;
                if (Array.isArray(tempLangs) && tempLangs.length) {
                  const items = tempLangs
                    .filter((k) => k && k !== langKey)
                    .map((k) => ({ label: k, value: k }));
                  const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: "请选择目标语言",
                  });
                  if (selected) {
                    const untransLangObj = await config.searchUntranslateText(
                      langKey,
                      selected.value
                    );
                    if (isEmpty(untransLangObj)) {
                      throw new Error("数据异常");
                    }
                    const localFilePath = config.getLanguageMissOnlinePath();
                    const filePath: any = await FileIO.writeContentToLocalFile(
                      fileName,
                      localFilePath,
                      untransLangObj
                    );
                    // 设置HTML内容
                    if (filePath) {
                      vscode.workspace
                        .openTextDocument(filePath)
                        .then((doc) => {
                          vscode.window.showTextDocument(doc);

                          // logging disabled
                        });
                    }
                  }
                }
                // logging disabled
              } else {
                vscode.window.showWarningMessage(`请完善线上化相关配置`);
                config.openSetting(fileName, () => {});
                // logging disabled
              }
            }
          } catch (e) {
            console.error(e);
            if (e.message) {
              vscode.window.showWarningMessage(e.message);
            }
            // logging disabled
          }
          // logging disabled
        }
      )
    );

    // 监听命令-合并语言文件
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.mergeLangFile",
        async function () {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const tempPaths = config.getTempPaths();
            const tempLangs = config.getTempLangs();
            const langPaths = config.getLangPaths();
            await FileIO.generateMergeLangFile(
              langPaths,
              tempPaths,
              tempLangs,
              (_targetPath: string, count: number, status: string) => {
                if (status === "SUCCESS") {
                  Message.showMessage(
                    `合并成功，更新 ${count} 个文件`,
                    MessageType.INFO
                  );
                } else if (status === "NO_CONTENT") {
                  // 已在内部提示，无需重复
                } else if (status === "NO_TEMP_DIR") {
                  // 已在内部提示
                }
              }
            );
          }
        }
      )
    );

    // 监听命令-拆分语言文件
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.splitLangFile",
        async function () {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            // 更新本地语言
            await config.readLocalGlobalLangObj();
            // 拆分语言包
            const localLangObj = config.getLocalLangObj();
            const langPaths = config.getLangPaths();
            if (!langPaths) {
              return;
            }
            FileIO.generateSplitLangFile(
              langPaths,
              fileName,
              localLangObj,
              () => {
                Message.showMessage(`拆分成功`, MessageType.INFO);

                // logging disabled
              }
            );
          }
        }
      )
    );

    // 监听命令-补全缺失语言文件（根据默认语言翻译生成新语言文件）
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.generateMissingLangFiles",
        async function () {
          try {
            const defaultLang = config.getDefaultLang();
            const allLangs = config.getTempLangs();
            const langPathsGlob = config.getLangPaths();
            if (!langPathsGlob) {
              Message.showMessage("未配置语言文件路径");
              return;
            }
            const files = await FileIO.getFiles(langPathsGlob);
            if (!files.length) {
              Message.showMessage("未找到任何现有语言文件");
              return;
            }
            const fsPathMap: Record<string, string> = {};
            files.forEach(({ fsPath }) => {
              const base = path.basename(fsPath);
              if (/\.json$/.test(base)) {
                const lang = base.split(".")[0];
                fsPathMap[lang] = fsPath;
              }
            });
            // Prefer using zh.json from configured langPaths as the source
            const preferredSourceLang = "zh";
            const sourceLang = fsPathMap[preferredSourceLang]
              ? preferredSourceLang
              : defaultLang;
            if (!fsPathMap[sourceLang]) {
              Message.showMessage(`缺少语言源文件 ${sourceLang}.json`);
              return;
            }
            const missing = allLangs.filter(
              (l) => l && l !== sourceLang && !fsPathMap[l]
            );
            if (!missing.length) {
              Message.showMessage("没有需要补全的语言文件");
              return;
            }
            // 读取默认语言内容
            let defaultContent: any = {};
            try {
              const raw = await fsp.readFile(fsPathMap[sourceLang], "utf-8");
              if (raw) {
                const parsed = Utils.parseJsonSafe(raw);
                if (parsed) defaultContent = parsed;
                else {
                  Message.showMessage(
                    "读取默认语言文件失败：JSON 格式错误",
                    MessageType.ERROR
                  );
                  return;
                }
              }
            } catch (e) {
              Message.showMessage("读取默认语言文件失败");
              return;
            }
            if (!defaultContent || typeof defaultContent !== "object") {
              Message.showMessage("默认语言文件内容无效");
              return;
            }
            let cookie = "";
            const login = await Utils.getCookie(config.getAccount());
            if (login?.code !== "000000") {
              Message.showMessage(login?.msg || "登录失败");
              return;
            }
            cookie = `test_gj_ticket=${login.data}`;
            const statusBar = vscode.window.createStatusBarItem(
              vscode.StatusBarAlignment.Left
            );
            statusBar.text = `$(sync~spin) 生成缺失语言`;
            statusBar.show();
            let created = 0;

            try {
              // 构造一个包含所有缺失语言的 localLangObj，一次性请求 LLM
              const localLangObj: any = {
                [sourceLang]: { ...defaultContent },
              };
              missing.forEach((lang) => {
                localLangObj[lang] = {};
                Object.keys(defaultContent).forEach((k) => {
                  localLangObj[lang][k] = "";
                });
              });

              // 一次性请求翻译，复用 statusBar 以显示批次进度
              const llmRes = await Utils.getTransSourceObjByLlm(
                localLangObj,
                defaultLang,
                cookie,
                {
                  reuseStatusBar: statusBar,
                  label: "生成缺失语言",
                  suppressBatchStatus: false,
                },
                { batchSize: config.getTransBatchSize() }
              );

              const transSourceObj = llmRes.transSourceObj;
              const message = llmRes.message;

              if (!transSourceObj || isEmpty(transSourceObj)) {
                Message.showMessage(
                  `生成失败: ${message || "无结果"}`,
                  MessageType.WARNING
                );
              } else {
                // 将翻译结果写入对应语言文件
                const targetDir = path.dirname(fsPathMap[sourceLang]);
                for (const lang of missing) {
                  try {
                    if (transSourceObj[lang]) {
                      const mapped: any = {};
                      Object.entries(defaultContent).forEach(([k, v]: any) => {
                        mapped[k] = transSourceObj[lang][v] || "";
                      });
                      const targetPath = path.join(targetDir, `${lang}.json`);
                      try {
                        await fsp.writeFile(
                          targetPath,
                          JSON.stringify(mapped, null, "\t"),
                          "utf-8"
                        );
                        created++;
                      } catch (e) {
                        console.error("write file error", e);
                        Message.showMessage(`生成 ${lang}.json 失败`);
                      }
                    } else {
                      Message.showMessage(
                        `生成 ${lang}.json 失败: ${message || "无结果"}`
                      );
                    }
                  } catch (e: any) {
                    console.error("generate lang error", lang, e);
                    Message.showMessage(`生成 ${lang}.json 异常`);
                  }
                }
              }
            } finally {
              statusBar.hide();
              statusBar.dispose();
            }

            Message.showMessage(
              `生成完成：成功 ${created}/${missing.length}`,
              created === missing.length
                ? MessageType.INFO
                : MessageType.WARNING
            );
          } catch (e) {
            console.error("generateMissingLangFiles error", e);
            Message.showMessage("生成缺失语言失败");
          }
        }
      )
    );

    // 监听命令-预览合并重复值的key
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.previewMergeCommonKeys",
        async function () {
          try {
            const langPathsGlob = config.getLangPaths();
            if (!langPathsGlob) {
              Message.showMessage(
                "未配置语言文件路径 (langPaths)",
                MessageType.WARNING
              );
              return;
            }

            // 使用 withProgress 显示预览进度
            const previewResult = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "正在分析重复key...",
                cancellable: false,
              },
              async (progress, token) => {
                // 第一步：获取语言文件
                progress.report({
                  message: "获取语言文件...",
                  increment: 20,
                });

                const files = await FileIO.getFiles(langPathsGlob);
                if (!files.length) {
                  throw new Error("未找到任何语言文件");
                }

                const langFiles: string[] = [];
                let defaultLangFile: string = "";
                const defaultLang = config.getDefaultLang();

                files.forEach(({ fsPath }) => {
                  const fileName = path.basename(fsPath);
                  if (/\.json$/.test(fileName)) {
                    const lang = fileName.split(".")[0];
                    langFiles.push(fsPath);
                    if (lang === defaultLang) {
                      defaultLangFile = fsPath;
                    }
                  }
                });

                if (!defaultLangFile) {
                  throw new Error(`未找到默认语言文件 ${defaultLang}.json`);
                }

                // 第二步：分析重复值
                progress.report({
                  message: "分析重复值...",
                  increment: 30,
                });

                const minMergeCount = config.getMinMergeCount();

                // 第三步：生成预览数据
                progress.report({
                  message: "生成预览数据...",
                  increment: 50,
                });

                const result = await Utils.previewMergeCommonKeys(
                  config,
                  defaultLangFile,
                  langFiles,
                  "src",
                  minMergeCount,
                  (
                    phase: string,
                    current: number,
                    total: number,
                    detail?: string
                  ) => {
                    // 将内部进度映射到withProgress的进度
                    const phaseProgress = (current / total) * 100;
                    progress.report({
                      message: `${phase}... (${current}/${total})`,
                      increment: 0, // 不再增加increment，使用内部的细粒度进度
                    });
                  }
                );

                return result;
              }
            );

            if (!previewResult.success) {
              Message.showMessage(previewResult.message, MessageType.WARNING);
              return;
            }

            // 创建预览面板
            const panel = vscode.window.createWebviewPanel(
              "mergePreview",
              "合并重复key预览",
              vscode.ViewColumn.Two,
              {
                enableScripts: true,
                retainContextWhenHidden: true,
              }
            );

            // 生成预览HTML内容
            const htmlContent = generateMergePreviewHTML(previewResult);
            panel.webview.html = htmlContent;

            // 处理来自webview的消息
            panel.webview.onDidReceiveMessage(
              async (message) => {
                if (message.command === "executeMerge") {
                  // 关闭预览面板
                  panel.dispose();

                  // 执行实际合并操作（使用现有的合并命令逻辑）
                  await vscode.commands.executeCommand(
                    "extension.yz.i18n.mergeCommonKeys"
                  );
                }
              },
              undefined,
              context.subscriptions
            );
          } catch (error) {
            console.error("previewMergeCommonKeys error", error);
            Message.showMessage(
              `预览失败: ${error.message}`,
              MessageType.ERROR
            );
          }
        }
      )
    );

    // 监听命令-合并重复值的key
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.yz.i18n.mergeCommonKeys",
        async function () {
          try {
            const langPathsGlob = config.getLangPaths();
            if (!langPathsGlob) {
              Message.showMessage(
                "未配置语言文件路径 (langPaths)",
                MessageType.WARNING
              );
              return;
            }

            // 获取所有语言文件
            const files = await FileIO.getFiles(langPathsGlob);
            if (!files.length) {
              Message.showMessage("未找到任何语言文件", MessageType.WARNING);
              return;
            }

            const langFiles: string[] = [];
            let defaultLangFile: string = "";
            const defaultLang = config.getDefaultLang();

            files.forEach(({ fsPath }) => {
              const fileName = path.basename(fsPath);
              if (/\.json$/.test(fileName)) {
                const lang = fileName.split(".")[0];
                langFiles.push(fsPath);
                if (lang === defaultLang) {
                  defaultLangFile = fsPath;
                }
              }
            });

            if (!defaultLangFile) {
              Message.showMessage(
                `未找到默认语言文件 ${defaultLang}.json`,
                MessageType.ERROR
              );
              return;
            }

            if (langFiles.length < 2) {
              Message.showMessage(
                "语言文件数量不足，无法执行合并操作",
                MessageType.WARNING
              );
              return;
            }

            // 显示确认对话框
            const result = await vscode.window.showWarningMessage(
              "此操作将合并默认语言文件中值相同的key，并替换源代码中的引用。是否继续？",
              { modal: true },
              "确认合并",
              "取消"
            );

            if (result !== "确认合并") {
              return;
            }

            // 显示进度
            const statusBar = vscode.window.createStatusBarItem(
              vscode.StatusBarAlignment.Left
            );
            statusBar.show();

            try {
              // 执行合并操作
              const minMergeCount = config.getMinMergeCount();
              await Utils.mergeCommonKeys(
                config,
                defaultLangFile,
                langFiles,
                "src",
                (
                  phase: string,
                  current: number,
                  total: number,
                  detail?: string
                ) => {
                  const progress = Math.round((current / total) * 100);
                  statusBar.text = `$(sync~spin) ${phase} (${progress}%)`;
                  if (detail) {
                    statusBar.text += ` - ${detail}`;
                  }
                },
                minMergeCount
              );
            } finally {
              statusBar.hide();
              statusBar.dispose();
              VSCodeUI.renderDecoration(config);
            }
          } catch (error) {
            console.error("mergeCommonKeys error", error);
            Message.showMessage(
              `合并失败: ${error.message}`,
              MessageType.ERROR
            );
          }
        }
      )
    );

    // 在插件卸载时或使用完成后，断开与服务器的连接
    context.subscriptions.push({
      dispose() {
        // nothing to dispose
      },
    });
  } catch (e) {
    console.error("du-i18n activate error", e);
  }
}

export function deactivate() {}
