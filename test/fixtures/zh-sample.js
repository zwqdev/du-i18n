// zh-sample.js 侧重 JavaScript 中多样化的中文字符串表现形式
/*
  覆盖点：
  1. var / let / const 声明
  2. 对象、数组、函数、IIFE、Promise、回调、setTimeout
  3. 模板字符串、拼接、长文本
  4. 动态属性、可选链结果处理
*/

const jsSimple = '这是 JS 文件中的第一段中文字符串，用于测试基础匹配与长度检测';
let jsNotice = '这里是第二段中文，用双引号表示，验证不同引号的处理策略';
var jsLegacy = '老式 var 声明的中文文本，仍然应该被扫描和提取';

const jsTemplate = `模板形式：当前时间戳是 ${Date.now()}，我们在此生成一个包含变量的中文消息用于测试。`;

const jsLines = `换行第一行：说明当前系统处于演示模式；\n换行第二行：演示模式下的所有操作不会真正写入数据库；\n换行第三行：请在正式环境中重新执行关键操作。`;

const jsConcat =
  '开始部分：这是通过字符串' +
  ' 拼接生成的中等长度' +
  ' 中文句子，确保多个片段聚合后仍然被识别';

function buildMessage(user = '匿名用户') {
  return `欢迎 ${user}，这是函数返回的问候语，用中文详细说明：我们非常重视您的体验，会持续改进。`;
}

const jsArray = [
  '数组项一：用于展示列表场景下的中文文本抽取',
  '数组项二：提供更长的一段文字，以便测试长度阈值是否生效',
  `数组项三：包含变量 ${Math.round(Math.random() * 10)} 以展示动态模板`,
];

const jsObject = {
  header: '页眉：这里展示系统名称与关键信息',
  menu: '菜单：包含导航链接和操作入口',
  footer: '页脚：展示版权以及备案信息，如果有的话',
  longText:
    '这是一段比较长的中文文本，内容用于说明对象属性中可能出现的复杂描述信息，包含若干解释性语句与提示性语句，帮助使用者理解当前模块的使用方式与注意事项。',
};

// 动态属性 key
const dynamicKey = 'desc';
jsObject[dynamicKey] =
  '动态属性：通过变量作为键设置的中文描述，同样需要被正确处理';

// IIFE
(function () {
  const inner = '自调用函数中的中文提示，验证作用域不影响抽取';
  console.log(inner);
})();

// 回调
[1, 2].forEach((i) => {
  console.log(`回调中第 ${i} 次输出中文日志，确保遍历中的字符串不会遗漏`);
});

// Promise
new Promise((resolve) => {
  resolve('Promise 成功结果：这是一个模拟的成功消息，用中文书写');
}).then((msg) => {
  console.log(msg);
});

// try / catch
try {
  throw new Error('这里是故意抛出的错误，包含中文描述，用于测试错误消息捕捉');
} catch (e) {
  console.warn('捕获到错误：系统已经记录该异常，请稍后重试或联系支持人员');
}

// setTimeout
setTimeout(() => {
  console.info('定时任务提示：这条消息在延迟后显示，包含清晰的中文内容');
}, 10);

// 嵌套函数层次
function levelA() {
  const a = '第一层函数中的中文说明：准备进入下一层';
  function levelB() {
    const b = '第二层函数中的中文说明：继续向下调用';
    function levelC() {
      const c = '第三层函数中的中文说明：最底层逻辑执行完毕';
      return c;
    }
    return b + levelC();
  }
  return a + levelB();
}

// 可选链测试 (这里不会真正访问 undefined 分支)
const maybe = { x: { y: '可选链中的中文内容：模拟深层次对象属性访问' } };
const opt = maybe?.x?.y || '可选链默认中文：如果上层不存在则使用这段文字';

module.exports = {
  jsSimple,
  jsNotice,
  jsLegacy,
  jsTemplate,
  jsLines,
  jsConcat,
  buildMessage,
  jsArray,
  jsObject,
  levelA,
  opt,
};
