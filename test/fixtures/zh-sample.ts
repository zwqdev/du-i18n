// zh-sample.ts 侧重 TypeScript 中多种字符串形式的中文文本，用于 i18n 抽取测试
/*
  目标：
  1. 覆盖单引号、双引号、模板字符串、多行模板、字符串拼接、换行转义。
  2. 覆盖对象字面量、数组、Map、Set、枚举、命名空间、类、泛型、装饰器参数、函数参数默认值。
  3. 覆盖正则中的中文 (不一定抽取)、注释中的中文 (通常忽略) 以验证过滤。
  4. 覆盖包含变量插值的复杂模板字符串。
*/

// 简单常量
export const SIMPLE_CN =
  "这是一个用于测试的简单中文字符串，长度适中，不应被忽略";
export const SIMPLE_DOUBLE =
  "这里是使用双引号包裹的中文内容，用来测试双引号的解析能力";

// 模板字符串（无插值）
export const SIMPLE_TEMPLATE = `这是一段使用模板字符串编写的中文文本，没有任何插值变量，只是为了测试`;

// 模板字符串（有插值）
const userName: string = "张三";
export const TEMPLATE_WITH_VAR = `尊敬的用户 ${userName} 您好，感谢您在 ${new Date().getFullYear()} 年继续支持我们的产品与服务，我们会不断改进体验。`;

// 多变量插值与表达式
export const COMPLEX_TEMPLATE = `订单号: ${Math.floor(
  Math.random() * 100000
)}，亲爱的 ${userName}，您的订单已经进入仓库准备阶段，大约需要 ${
  1 + 2
} 个工作日完成打包并发出，请耐心等待。`;

// 多行模板
export const MULTI_LINE = `第一行中文描述：本系统正在进行例行维护；
第二行中文描述：维护期间部分功能可能短暂不可用；
第三行中文描述：如果您有紧急情况，请联系在线客服或者发送邮件。`;

// 拼接
export const CONCAT =
  "这里是一段通过" +
  " 字符串拼接方式组合出来的" +
  " 较长的中文句子，旨在测试解析是否能正确识别每一部分并组合。";

// 转义换行拼接
export const ESCAPE_JOIN =
  "这是第一部分，描述一个较长的业务场景，用户需要等待后台处理结果，" +
  "因此我们在此给出提示信息，提醒用户请耐心等候，" +
  "同时也告知如果长时间没有响应可以刷新页面或重新登录。";

// 数组中的中文
export const CN_ARRAY: string[] = [
  "数组里的第一条中文提示，用于展示列表场景",
  "数组里的第二条中文消息，用于测试批量抽取",
  "数组里的第三条中文文案，包含一些业务上的词汇，比如积分、优惠券、结算",
  `数组里的第四条模板中文，用于说明奖励即将在 ${
    new Date().getMonth() + 1
  } 月发放，请注意查收`,
];

// 对象中的中文
export const MESSAGE_MAP = {
  title: "页面标题：用户管理中心",
  subtitle: "副标题：用于管理和维护系统中的所有用户数据",
  description:
    "这里是一段较长的描述性中文，用来解释该模块的主要功能与注意事项。",
  footer: "底部版权声明：本系统所有功能仅供内部使用，禁止外传",
  dynamic: `动态描述：当前用户 ${userName} 拥有管理员权限，可以执行高级操作，但需谨慎`,
  nested: {
    tip: "嵌套对象中的中文提示信息，验证递归扫描逻辑是否正常",
    warn: "嵌套对象中的警告文本，请不要频繁提交重复请求以免触发限流",
  },
};

// Map / Set
export const CN_MAP = new Map<string, string>([
  ["k1", "Map中键一对应的中文说明，用于测试迭代结构"],
  ["k2", "Map中键二包含一些业务提示，比如：请在提交前再次核对信息"],
]);
export const CN_SET = new Set<string>([
  "Set集合里的第一段中文，用于测试去重逻辑是否影响抽取",
  "Set集合里的第二段中文，包含更多的内容和语气，确保长度足够",
]);

// 枚举
export enum ZhEnum {
  Pending = "状态：处理中，请耐心等待系统完成任务",
  Done = "状态：已完成，感谢您的使用，欢迎继续体验其他功能",
  Failed = "状态：失败，系统检测到异常，请稍后再试或联系管理员",
}

// 命名空间
export namespace Labels {
  export const BTN_CONFIRM = "按钮：确认提交当前信息";
  export const BTN_CANCEL = "按钮：取消操作并返回上一页";
  export const PLACEHOLDER_INPUT =
    "占位符：请输入要搜索的关键字，例如订单号或用户名";
}

// 类与属性
export class ChineseService {
  private cacheTip: string = "私有属性：缓存中暂无数据，稍候会自动刷新";
  static generalNotice: string = "静态属性：通用公告，周末期间客服响应可能稍慢";
  constructor(
    private welcome: string = "构造函数参数默认值：欢迎使用我们的 TypeScript 测试服务"
  ) {}
  greet(user: string): string {
    return `你好 ${user}，${this.welcome}，希望你今天过得愉快，如果有任何疑问可以随时提出。`;
  }
  getCacheTip(): string {
    return this.cacheTip;
  }
  setCacheTip(v: string) {
    this.cacheTip = v + " (已更新)";
  }
}

// 泛型函数
export function wrapMessage<T>(
  payload: T,
  note: string = "默认附加说明：本条消息仅供测试，不代表真实业务"
): string {
  return `包装后的结果：${JSON.stringify(payload)}，附加说明：${note}`;
}

// 装饰器示例（伪装饰器，直接调用函数）
function Log(desc: string) {
  // 兼容 TS5 新装饰器：可能收到 (target, context)
  return function (target: any, context?: any) {
    // 这里的中文注释说明：装饰器仅用于测试，不做实际日志
    if (context && typeof context === "object") {
      // 添加元数据字段以便调试
      (target as any).__zhDesc = desc + " (已写入元数据)";
    }
    return target;
  };
}

// 正则（含中文，不一定被提取）
const CN_REGEX = /测试正则包含中文，用于验证不应误提取/g;

// 函数参数 & 默认值
export function showDialog(
  title: string = "默认标题：系统提示",
  content: string = "默认内容：操作已成功完成，可以继续下一步"
) {
  return `${title} => ${content}`;
}

// 复杂逻辑内部字符串
export function complexFlow(flag: boolean) {
  if (flag) {
    console.info(
      "流程分支A：当前操作处于快速路径，将跳过某些校验步骤但结果仍然安全"
    );
  } else {
    console.info("流程分支B：采用标准路径，所有数据校验与安全检查都会完整执行");
  }
  for (let i = 0; i < 2; i++) {
    console.debug(
      `循环调试信息：第 ${i + 1} 次迭代正在执行，确保日志中文可解析`
    );
  }
  return "函数返回：复杂流程已结束，请查看上方日志以了解每个步骤的详情";
}

// JSON 字符串形式
export const JSON_TEXT =
  '{"notice":"这里是 JSON 格式串中的中文字段，用于测试内部解析能力","detail":"包含多种标点符号，测试：逗号，句号。"}';

// 多层函数返回中文
export function outer() {
  return function inner() {
    return "内部函数返回：多层闭包中的中文字符串，模拟动态生成";
  };
}

// try/catch 错误消息
export function errorWrap() {
  try {
    throw new Error(
      "抛出一个故意的错误，用中文描述其原因，主要用于测试捕获后的处理逻辑"
    );
  } catch (e: any) {
    return "捕获到错误：已经安全处理，后续操作可以继续进行无需担心";
  }
}

// 终端日志 & Warn
console.warn(
  "全局警告：当前示例文件仅用于测试中文抽取逻辑，请勿在生产环境中直接引用"
);
console.log("日志输出：如果你看到这行，说明测试文件被成功加载");

// 导出汇总
export default {
  SIMPLE_CN,
  SIMPLE_DOUBLE,
  SIMPLE_TEMPLATE,
  TEMPLATE_WITH_VAR,
  COMPLEX_TEMPLATE,
  MULTI_LINE,
  CONCAT,
  ESCAPE_JOIN,
  CN_ARRAY,
  MESSAGE_MAP,
  CN_MAP,
  CN_SET,
  ZhEnum,
  Labels,
  ChineseService,
  wrapMessage,
  showDialog,
  complexFlow,
  JSON_TEXT,
  outer,
  errorWrap,
};
