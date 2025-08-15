<template>
    <div class="wrapper">
        <h1>{{ mainTitle }}</h1>
        <p>{{ description }}</p>
        <p>{{ longParagraph }}</p>
        <section>
            <h2>静态小节标题：功能演示区</h2>
            <ul>
                <li v-for="(msg, i) in messages" :key="i">{{ msg }}</li>
            </ul>
            <div class="panel">
                <h3>{{ dict.panel.header }}</h3>
                <ul>
                    <li v-for="(t, ti) in dict.panel.tips" :key="ti">{{ t }}</li>
                </ul>
                <p>{{ dict.noteDynamic }}</p>
                <div class="actions">
                    <span>{{ dict.actions.refresh }}</span> | <span>{{ dict.actions.close }}</span>
                </div>
                <small>{{ dict.panel.footer }}</small>
            </div>
            <button @click="handleClick">按钮：点我加载更多数据</button>
            <button @click="toggle">按钮：切换显示状态</button>
            <p v-if="open">当前状态：已展开，展示更多的中文说明文本，帮助用户理解细节</p>
            <p v-else>当前状态：已折叠，仅展示关键信息，如需了解更多请展开</p>
            <input :placeholder="placeholderText" />
        </section>
        <footer>{{ footerText }}</footer>
    </div>
</template>

<script setup lang="ts">
// 使用 Vue 3 <script setup> 语法演示中文国际化字符串
import { ref } from 'vue';

const mainTitle = ref('主标题：这是一个用于国际化测试的 Vue 组件示例');
const description = ref('简短描述：组件包含多种中文字符串定义方式，供扫描工具验证');
const longParagraph = ref('长段落：这里是一段较长的中文文本，用于模拟真实业务中的描述性内容，包含多个语句与标点符号，以确保在解析过程中不会因为长度问题被错误处理。我们希望通过这一段文字来验证系统对于长文本的截取与存储能力。');
const placeholderText = ref('占位符：请输入搜索关键词，例如产品名称或编号');
const footerText = ref('底部信息：这里展示版权声明、版本号以及联系信息');

const messages = ref<string[]>([
    '列表项一：展示基础信息的中文文本',
    '列表项二：包含更详细的描述与说明，帮助理解上下文',
    `列表项三：动态内容，当前时间 ${new Date().toLocaleTimeString()}，用于测试模板插值`,
    '列表项四：额外的提示信息，确保数量足够形成集合测试',
]);

const open = ref(true);

// 新增：对象形式集中定义多层次中文字符串（含数组、嵌套、模板字符串）
const dict = {
    panel: {
        header: '面板标题：高级设置与调试信息区',
        tips: [
            '提示一：这里展示与当前组件相关的运行状态与环境说明',
            '提示二：若需要查看更多技术细节，可以打开调试模式',
            '提示三：请勿在生产环境启用过多调试日志，以免影响性能',
        ],
        footer: '面板底部：此区域用于展示补充说明与版权相关信息',
    },
    actions: {
        refresh: '操作：刷新面板数据（对象内的中文字符串示例）',
        close: '操作：关闭当前面板并返回主视图',
    },
    noteDynamic: `动态注释：当前小时 ${new Date().getHours()}，用于测试对象内部模板字符串插值能力`,
};

function handleClick() {
    console.log('点击事件：用户希望加载更多数据，我们在这里触发请求');
    messages.value.push('新增列表项：这是用户点击后动态添加的中文项目，用来测试增量抽取');
}

function toggle() {
    open.value = !open.value;
    console.info(`状态切换：现在组件展开状态为 ${open.value}，请根据需要展示对应中文内容`);
}
</script>

<style scoped>
.wrapper {
    padding: 16px;
    background: #fafafa;
}

.wrapper h1 {
    font-size: 20px;
    margin-bottom: 8px;
}

.wrapper h2 {
    font-size: 16px;
    margin: 12px 0 4px;
}

.wrapper p {
    line-height: 1.6;
}

button {
    margin-right: 8px;
}
</style>
