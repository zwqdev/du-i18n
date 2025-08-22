import * as vscode from "vscode";
// import TelemetryReporter from "vscode-extension-telemetry";
import { Utils } from "./utils";
import { VSCodeUI } from "./utils/vscode-ui";
import { FileIO } from "./utils/fileIO";
import { Config } from "./utils/config";
import { MessageType, Message } from "./utils/message";
const fs = require("fs");
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

let langObj: LangType = null;

export async function activate(context: vscode.ExtensionContext) {
  try {
    const config = new Config();
    // Track recent saves initiated from the editor to avoid duplicate
    // refreshes when file system watcher emits the same change.
    const recentEditorSaves: Map<string, number> = new Map();
    const SAVE_IGNORE_MS = 500; // ignore fs events within 500ms of an editor save
    // 初始化
    config.init(context, () => {
      // 渲染语言
      VSCodeUI.renderDecoration(config);
      console.log("config init complete");
      // try {
      // 	// 记录用户行为数据，只会读取package.json文件信息中的（项目名称、版本、项目描述），其余内容不会读取
      // 	reporter.sendTelemetryEvent("du_i18n_deyi_init", {
      // 		action: "初始化",
      // 		projectInfo,
      // 	});
      // } catch(e) {}
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
      const defaultWatchGlob = "**/*.{ts,tsx,js,jsx,vue,html,json}";
      const watchGlob =
        typeof (config as any).getWatcherGlob === "function"
          ? (config as any).getWatcherGlob() || defaultWatchGlob
          : defaultWatchGlob;
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
          }, 300);
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
        "extension.du.i18n.scanAndGenerate",
        async function () {
          // console.log("vscode 扫描中文")
          try {
            // // 记录用户行为数据
            // reporter.sendTelemetryEvent("extension_du_i18n_scanAndGenerate", {
            // 	action: "扫描中文",
            // 	projectInfo,
            // });

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
                        if (config.isOnline()) {
                          config.handleSendToOnline(
                            newLangObj,
                            pageEnName,
                            async () => {
                              handleRefresh();
                            }
                          );
                        } else {
                          handleRefresh();
                        }
                      }
                    );
                  }
                }
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
        "extension.du.i18n.multiScanAndGenerate",
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

                      const concurrency = 4; // reasonable default
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
        "extension.du.i18n.translateFromChineseKey",
        async function () {
          try {
            // // 记录用户行为数据
            // reporter.sendTelemetryEvent("extension_du_i18n_multiScanAndGenerate", {
            // 	action: "在线翻译",
            // 	projectInfo,
            // });

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
              // // 记录用户行为数据
              // reporter.sendTelemetryEvent("extension_du_i18n_multiScanAndGenerate", {
              // 	action: "在线翻译-成功",
              // });
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
                const data = fs.readFileSync(fileName, "utf-8");
                if (!data) {
                  return;
                }
                const localLangObj =
                  require("./utils").Utils.parseJsonSafe(data);
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
                // 调用百度翻译
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
            // // 记录用户行为数据
            // reporter.sendTelemetryEvent("extension_du_i18n_multiScanAndGenerate", {
            // 	action: "在线翻译-异常",
            // 	projectInfo,
            // 	error: e,
            // });
          }
        }
      )
    );

    // 监听命令-批量在线翻译
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.multiTranslateFromChineseKey",
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
              // // 记录用户行为数据
              // reporter.sendTelemetryEvent("extension_du_i18n_multiScanAndGenerate", {
              // 	action: "在线翻译-内部",
              // });
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
              const concurrency = 3; // 可调并发
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
        "extension.du.i18n.setting",
        async function () {
          // openConfigCommand();
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            config.openSetting(fileName, (isInit) => {
              if (isInit) {
                config.init(context, () => {});
                console.log("deyi2", config);
                // // 记录用户行为数据
                // reporter.sendTelemetryEvent("du_i18n_deyi_init", {
                // 	action: "初始化-设置回调",
                // 	projectInfo,
                // });
              }
            });
          }

          // // 记录用户行为数据
          // reporter.sendTelemetryEvent("extension_du_i18n_setting", {
          // 	action: "设置",
          // });
        }
      )
    );

    // 监听命令-切换显示语言
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.change",
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
              if (config.isOnline()) {
                await config.getOnlineLanguage(VSCodeUI.userKey);
              }
              // 重新渲染
              VSCodeUI.renderDecoration(config);
            }
          }
          // // 记录用户行为数据
          // reporter.sendTelemetryEvent("extension_du_i18n_change", {
          // 	action: "切换语言",
          // });
        }
      )
    );

    // 监听自定义命令-用于接收下一层返回的数据并进行处理
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "extension.du.i18n.receive",
        async function (event) {
          console.log(
            "registerCommand callback extension.du.i18n.receive",
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
          // // 记录用户行为数据
          // reporter.sendTelemetryEvent("extension_du_i18n_receive", {
          // 	action: "自定义命令",
          // });
        }
      )
    );

    // 监听命令-批量新增
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.add",
        async function () {
          ViewLoader.showWebview(context);
        }
      )
    );

    // discard: 用处不大，先去掉耗性能
    // // 监听命令-处理点击转跳到变量声明处
    // context.subscriptions.push(vscode.languages.registerDefinitionProvider(languageIds, {
    // 	provideDefinition
    // }));

    // 监听命令-刷新
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.updateLocalLangPackage",
        async function () {
          await config.refreshGlobalLangObj(true);
          // 重新渲染
          VSCodeUI.renderDecoration(config);
          vscode.window.showInformationMessage(`翻译数据刷新成功`);

          // // 记录用户行为数据
          // reporter.sendTelemetryEvent("extension_du_i18n_updateLocalLangPackage", {
          // 	action: "刷新数据",
          // });
        }
      )
    );
    // 监听命令-文件统计
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.analytics",
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

          // // 记录用户行为数据
          // reporter.sendTelemetryEvent("extension_du_i18n_analytics", {
          // 	action: "文件统计",
          // });
        }
      )
    );

    // 监听命令-上传文案
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.updateLocalToOnline",
        async function () {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            if (config.isOnline()) {
              config.handleSyncTempFileToOnline(fileName, () => {
                config.getOnlineLanguage();
                vscode.window.showInformationMessage(`当前文件上传成功`);
                // // 记录用户行为数据
                // reporter.sendTelemetryEvent("extension_du_i18n_updateLocalToOnline", {
                // 	action: "上传文案-内部-成功上传",
                // });
              });
              // // 记录用户行为数据
              // reporter.sendTelemetryEvent("extension_du_i18n_updateLocalToOnline", {
              // 	action: "上传文案-内部",
              // });
            } else {
              vscode.window.showWarningMessage(`请完善线上化相关配置`);
              const activeEditor = vscode.window.activeTextEditor;
              if (activeEditor) {
                const { fileName } = activeEditor.document || {};
                config.openSetting(fileName, () => {});
              }
              // // 记录用户行为数据
              // reporter.sendTelemetryEvent("extension_du_i18n_updateLocalToOnline", {
              // 	action: "上传文案-外部",
              // });
            }
          }
        }
      )
    );

    // 监听命令-批量上传文案
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.batchUpdateLocalToOnline",
        async function () {
          if (config.isOnline()) {
            config.handleSyncAllTempFileToOnline(() => {
              config.getOnlineLanguage();
              vscode.window.showInformationMessage(`同步成功`);
              // // 记录用户行为数据
              // reporter.sendTelemetryEvent("extension_du_i18n_batchUpdateOnline", {
              // 	action: "批量上传文案-内部成功上传",
              // });
            });
            // // 记录用户行为数据
            // reporter.sendTelemetryEvent("extension_du_i18n_batchUpdateOnline", {
            // 	action: "批量上传文案-内部",
            // });
          } else {
            vscode.window.showWarningMessage(`请完善线上化相关配置`);
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor) {
              const { fileName } = activeEditor.document || {};
              config.openSetting(fileName, () => {});
            }
            // // 记录用户行为数据
            // reporter.sendTelemetryEvent("extension_du_i18n_batchUpdateOnline", {
            // 	action: "批量上传文案-外部",
            // });
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
        "extension.du.i18n.updateLocalFromOnline",
        async function () {
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor) {
            const { fileName } = activeEditor.document || {};
            if (config.isOnline()) {
              // // 记录用户行为数据
              // reporter.sendTelemetryEvent("extension_du_i18n_updateLocalFromOnline", {
              // 	action: "拉取远程文案-内部",
              // });

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

                  // // 记录用户行为数据
                  // reporter.sendTelemetryEvent("extension_du_i18n_updateLocalFromOnline", {
                  // 	action: "拉取远程文案-内部-成功拉取",
                  // });
                });
              }
            } else {
              vscode.window.showWarningMessage(`请完善线上化相关配置`);
              config.openSetting(fileName, () => {});
              // // 记录用户行为数据
              // reporter.sendTelemetryEvent("extension_du_i18n_updateLocalFromOnline", {
              // 	action: "拉取远程文案-外部",
              // });
            }
          }
        }
      )
    );

    // 监听命令-翻译漏检
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.missingDetection",
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

                // // 记录用户行为数据
                // reporter.sendTelemetryEvent("extension_du_i18n_missingDetection", {
                // 	action: "翻译漏检-成功",
                // });
              });
            }
          }
          // // 记录用户行为数据
          // reporter.sendTelemetryEvent("extension_du_i18n_missingDetection", {
          // 	action: "翻译漏检",
          // });
        }
      )
    );

    // 监听命令-远程漏检文案
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.searchUntranslateText",
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

                          // // 记录用户行为数据
                          // reporter.sendTelemetryEvent("extension_du_i18n_searchUntranslateText", {
                          // 	action: "远程漏检文案-内部-操作成功",
                          // });
                        });
                    }
                  }
                }
                // // 记录用户行为数据
                // reporter.sendTelemetryEvent("extension_du_i18n_searchUntranslateText", {
                // 	action: "远程漏检文案-内部",
                // });
              } else {
                vscode.window.showWarningMessage(`请完善线上化相关配置`);
                config.openSetting(fileName, () => {});
                // // 记录用户行为数据
                // reporter.sendTelemetryEvent("extension_du_i18n_searchUntranslateText", {
                // 	action: "远程漏检文案-外部",
                // });
              }
            }
          } catch (e) {
            console.error(e);
            if (e.message) {
              vscode.window.showWarningMessage(e.message);
            }
            // // 记录用户行为数据
            // reporter.sendTelemetryEvent("extension_du_i18n_searchUntranslateText", {
            // 	action: "远程漏检文案-异常",
            // 	error: e,
            // });
          }
          // // 记录用户行为数据
          // reporter.sendTelemetryEvent("extension_du_i18n_searchUntranslateText", {
          // 	action: "远程漏检文案",
          // });
        }
      )
    );

    // 监听命令-合并语言文件
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.mergeLangFile",
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
        "extension.du.i18n.splitLangFile",
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

                // // 记录用户行为数据
                // reporter.sendTelemetryEvent("extension_du_i18n_generateLangFile", {
                // 	action: "拆分语言文件-拆分成功",
                // });
              }
            );
          }
        }
      )
    );

    // 监听命令-补全缺失语言文件（根据默认语言翻译生成新语言文件）
    context.subscriptions.push(
      vscode.commands.registerTextEditorCommand(
        "extension.du.i18n.generateMissingLangFiles",
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
            if (!fsPathMap[defaultLang]) {
              Message.showMessage(`缺少默认语言文件 ${defaultLang}.json`);
              return;
            }
            const missing = allLangs.filter(
              (l) => l && l !== defaultLang && !fsPathMap[l]
            );
            if (!missing.length) {
              Message.showMessage("没有需要补全的语言文件");
              return;
            }
            // 读取默认语言内容
            let defaultContent: any = {};
            try {
              const raw = fs.readFileSync(fsPathMap[defaultLang], "utf-8");
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
            statusBar.text = `$(sync~spin) 生成缺失语言 0/${missing.length}`;
            statusBar.show();
            let created = 0;
            for (let i = 0; i < missing.length; i++) {
              const lang = missing[i];
              try {
                // 构造 localLangObj 结构
                const localLangObj: any = {
                  [defaultLang]: { ...defaultContent },
                };
                localLangObj[lang] = {};
                Object.keys(defaultContent).forEach(
                  (k) => (localLangObj[lang][k] = "")
                );
                let transSourceObj: any = null;
                let message = "";
                const llmRes = await Utils.getTransSourceObjByLlm(
                  localLangObj,
                  defaultLang,
                  cookie,
                  { suppressBatchStatus: true },
                  { batchSize: config.getTransBatchSize() }
                );
                transSourceObj = llmRes.transSourceObj;
                message = llmRes.message;
                if (transSourceObj && transSourceObj[lang]) {
                  const mapped: any = {};
                  Object.entries(defaultContent).forEach(([k, v]: any) => {
                    mapped[k] = transSourceObj[lang][v] || "";
                  });
                  const targetDir = path.dirname(fsPathMap[defaultLang]);
                  const targetPath = path.join(targetDir, `${lang}.json`);
                  fs.writeFileSync(
                    targetPath,
                    JSON.stringify(mapped, null, "\t"),
                    "utf-8"
                  );
                  created++;
                } else {
                  Message.showMessage(
                    `生成 ${lang}.json 失败: ${message || "无结果"}`
                  );
                }
              } catch (e: any) {
                console.error("generate lang error", lang, e);
                Message.showMessage(`生成 ${lang}.json 异常`);
              } finally {
                statusBar.text = `$(sync~spin) 生成缺失语言 ${i + 1}/${
                  missing.length
                }`;
              }
            }
            statusBar.hide();
            statusBar.dispose();
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

    // 在插件卸载时或使用完成后，断开与服务器的连接
    context.subscriptions.push({
      dispose() {
        // reporter.dispose();
      },
    });
  } catch (e) {
    console.error("du-i18n activate error", e);
  }
}

export function deactivate() {}
