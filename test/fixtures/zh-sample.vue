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

        <!-- Edge cases section: 针对旧正则方案可能误判/漏判的场景 -->
        <section id="edge-cases">
            <!-- 注释里包含中文（不应被提取） -->
            <!-- 这是注释：包含中文，不应进入词条系统 -->

            <!-- 多行文本节点（前后空白 & 换行保留） -->
            <p>
                多行段落：第一行展示 &lt; 符号 &amp; 特殊字符
                第二行继续：包含 “引号” 与 以及大于号 &gt; 以测试 &lt; &gt; 组合
            </p>

            <!-- 静态属性含中文 -->
            <div class="tip-box" title="工具提示：简单说明">静态属性与文本双重中文</div>

            <!-- 动态绑定属性里包含中文（当前实现不会处理表达式内部，这里确保不报错） -->
            <div :aria-label="'动态标签：' + mainTitle">动态 aria-label 保留</div>

            <!-- 自定义 data-* 属性 -->
            <div data-desc="数据描述：包含冒号与破折号-test">Data Attr 中文</div>

            <!-- 中文插值混合变量（不由 template AST 直接处理） -->
            <p>{{ '统计：' + messages.length + ' 条消息' }}</p>

            <!-- 已国际化文本，包含 $t( ，应跳过 -->
            <span>{{ $t('already.done.key') }}</span>

            <!-- 重复文本多次出现，测试 key 分配是否递增且不去重 -->
            <div class="repeat">
                <b>重复文本示例</b>
                <i>重复文本示例</i>
                <u>重复文本示例</u>
            </div>

            <!-- 中文被 HTML 注释分隔成相邻文本节点 -->
            <div class="split-nodes">前半中文<!-- 分隔注释 -->后半中文</div>

            <!-- 相邻元素无空白 -->
            <span>紧邻一</span><span>紧邻二</span><span>紧邻三</span>

            <!-- 自闭合组件 + 中文属性 -->
            <CustomWidget label="控件标签：简短" description="控件描述：含有详细中文说明" />

            <!-- 含有全角字符 & Unicode 变体 -->
            <p>全角字符测试：ＡＢＣ１２３＋－＝，中文后缀</p>

            <!-- 同一元素多个中文文本节点 -->
            <p>前缀中文<span>内联中文</span>后缀中文</p>

            <!-- 静态属性包含插值标记（应整体视为纯文本属性，现阶段简化处理） -->
            <div title="标题 {{ variable }} 后缀">属性内含插值标记占位</div>

            <!-- 指令绑定中的中文字符串（当前未提取，仅测试安全性） -->
            <div :title="isOk ? '状态：正常' : '状态：异常'">指令绑定三元</div>

            <!-- 多个属性，其中一个包含引号转义 -->
            <div data-note="包含引号 &quot;测试&quot; 内容" aria-label="辅助标签：示例" />

            <!-- style 内联属性含中文（可选是否提取） -->
            <div style="--label:'标签变量';color:red" data-style-demo="样式相关：颜色提示">样式中文</div>

            <!-- HTML 实体混排 -->
            <p>实体测试：版权&copy;2025，空格&nbsp;分隔，中文尾部。</p>

            <!-- 条件 template 结构 -->
            <template v-if="flag">条件块：分支一</template>
            <template v-else>条件块：分支二</template>

            <!-- Slot fallback with named slot -->
            <FancyLayout>
                <template #header>布局头部：欢迎信息</template>
                主体内容：展示主要业务数据
                <template #footer>布局底部：按钮与帮助链接</template>
            </FancyLayout>

            <!-- JSON 脚本块（应忽略） -->
            <script type="application/ld+json">
                            {
                                "@context": "https://schema.org",
                                "description": "脚本 JSON：不应被当作模板中文提取"
                            }
                            </script>

            <!-- v-if / v-else-if / v-else 链 -->
            <div v-if="messages.length === 0">暂无数据：请先加载</div>
            <div v-else-if="messages.length < 3">数据较少：请继续添加</div>
            <div v-else>数据充足：当前共 {{ messages.length }} 条</div>

            <!-- 包含英文与中文混排，含尖括号比较符号 -->
            <p>Mixed Content: 当前值 1 < 2，说明条件成立。</p>

                    <!-- 引号与特殊标点 -->
                    <p>用户反馈：“系统运行正常”，无需额外操作。</p>

                    <!-- Slot 默认内容中文 -->
                    <Card>
                        默认插槽内容：用于测试 slot 中文提取
                        <template #footer>插槽 footer：底部说明文字</template>
                    </Card>

                    <!-- 追加 Edge Cases 2：进一步覆盖正则可能失效的场景 -->
                    <!-- v-text / v-html 指令（内部字面量中文） -->
                    <div v-text="'指令文本：直接替换元素内容'"></div>
                    <div v-html="'富文本：<b>加粗中文</b> &amp; <i>斜体中文</i>'"></div>

                    <!-- 动态 class / style 表达式含中文字符串 -->
                    <div :class="['按钮组', isActive ? '激活状态' : '未激活状态']"
                        :style="{ '--tag': '标签色', color: ok ? '绿色文本' : '红色文本' }">
                        动态类与样式测试</div>

                    <!-- 多行属性值（含换行 & 冒号） -->
                    <button data-multiline="多行属性：第一段\n第二段补充说明：继续解释"
                        aria-description="多行 aria 描述：第一行; 第二行">多行属性按钮：确认</button>

                    <!-- 属性中含有类似结束标签模式 -->
                    <div title="包含伪结束标签 </span> 示例">伪结束标签文本</div>

                    <!-- 相邻注释把中文文本包裹在中间（节点碎片） -->
                    <div><!-- 前缀注释 -->碎片化中文<!-- 后缀注释 --></div>

                    <!-- Emoji / 代理对 / Unicode 组合字符 -->
                    <p>表情混排：😀 中文说明 🚀 结束</p>

                    <!-- Zero Width Space (ZWSP) 混入 (看不见) -->
                    <p>零宽空格：示例​文本中间含ZWSP</p>

                    <!-- 相同句子重复 + 夹杂空白差异 -->
                    <p>重复句子测试：需要国际化</p>
                    <p> 重复句子测试：需要国际化 </p>

                    <!-- v-slot shorthand 默认插槽内容中文 -->
                    <ListItem v-slot="{ label }">条目插槽中文：{{ label }}</ListItem>

                    <!-- 模板字符串符号反引号直接出现在文本中（真实业务偶现 Pasted 内容） -->
                    <p>反引号字符展示：`内联代码` 与 “中文引号”</p>

                    <!-- 内联 SVG/自定义大写标签 -->
                    <SvgIcon title="图标：搜索按钮" desc="图标描述：用于触发搜索">SVG 图标文本</SvgIcon>

                    <!-- 版权紧邻实体（无空格） -->
                    <p>版权声明&copy;说明：所有权保留</p>

                    <!-- 深嵌套结构 -->
                    <div><span><strong><em>深层嵌套中文：第4层</em></strong></span></div>

                    <!-- 包含花括号但非插值（正则易误判） -->
                    <p>{ 这不是插值表达式 } 普通中文文本</p>

                    <!-- 英文+中文+占位符混合（未来做占位提取策略） -->
                    <p>统计信息：共有 {count} 条记录，其中错误 {errorCount} 条，需要处理。</p>

                    <!-- 极短中文 & 单字 -->
                    <p>短：测</p>
                    <p>单字：录</p>

                    <!-- 包含 &lt;script&gt; 字样纯文本 -->
                    <p>安全提示：不要直接粘贴 &lt;script&gt; 标签到输入框</p>

                    <!-- HTML Entity 紧贴中文 -->
                    <p>价格：&yen;100 元，折扣后 &yen;80 元</p>

                    <!-- 连续多个空文本 + 中文，中间带换行 -->
                    <div>

                        中文文本（前面有多个空行）
                    </div>

                    <!-- 模板内嵌 script（除非特殊处理，应忽略其内部中文） -->
                    <script>
                            // 这里的中文注释：理论上不应算作模板文本
                            const msg = '脚本内中文：应由脚本 AST 负责（若需要）';
                        </script>

                    <!-- style 块内部中文（若出现，通常不提取） -->
                    <style>
                        .cls::before {
                            content: '伪元素内容中文';
                        }
                    </style>

                    <!-- 多个同级空标签与文本交错 -->
                    <span></span>中文A<span></span>中文B<span />中文C

                    <!-- 属性里包含花括号/冒号/引号混杂 -->
                    <div data-complex="键:值; 数组:[1,2]; 描述:'混合中文'">复杂属性中文</div>

                    <!-- 带有数字和单位混合 -->
                    <p>容量：16GB，可升级至 64GB，性能提升约 40%</p>

                    <!-- 前后带制表符和空格 -->
                    <p> 制表符与空格前缀中文 </p>

                    <!-- 小于号比较紧贴中文 -->
                    <p>阈值判断：当前 3<5 成立</p>

                            <!-- 包含英文尖括号包围的占位片段 -->
                            <p>提示：请填写 <必填项> 后继续操作</p>

                            <!-- 中文中包含多种括号 -->
                            <p>括号测试：【方括】【】（圆括）『书名号』《尖括》｛花括｝</p>

                            <!-- 长串无标点中文（分词困难） -->
                            <p>这是一段没有任何标点的连续中文用于测试解析器在长文本场景下的稳定性和性能表现以及是否会出现超时的情况</p>

                            <!-- RTL/LTR 混合（简单示例） -->
                            <p dir="ltr">方向混排：LTR 中文测试</p>
                            <p dir="rtl">方向混排：RTL 中文测试</p>

                            <!-- comment 包含伪 Mustache -->
                            <!-- {{ 注释里的插值 }} -->

                            <!-- 文本包含美元符号与括号，但不是 $t -->
                            <p>价格表达：$100(含税) 总计</p>

                            <!-- 跨元素组合形成句子 -->
                            <p>句子开头</p>
                            <p>句子结尾</p>

                            <!-- 属性值中含反斜杠与转义序列 -->
                            <div data-path="C:\\数据目录\\项目">路径属性中文</div>

                            <!-- script setup 中定义的变量引用（不替换） -->
                            <p>{{ mainTitle }} - 固定后缀中文</p>

                            <!-- 未闭合潜在风险字符混入文本 -->
                            <p>未闭合示例：<span data-x="1">内部</span>尾部中文</p>

                            <!-- 包含多个连续实体与中文 -->
                            <p>&amp;&amp;&amp; 并发符号测试 中文结束</p>

                            <!-- 双大括号样式但不是真插值（例如文档占位） -->
                            <p>说明：使用 {{ placeholder }} 替换占位符</p>

                            <!-- 复杂自闭合组件多属性 -->
                            <DataTable header-title="数据表：商品列表" empty-text="暂无数据：请导入" loading-text="加载中：请稍候" />

                            <!-- 中文紧跟标签开始，无空格缩进 -->
                            <p>紧贴开始标签中文</p>

                            <!-- 中文紧跟标签结束，无空格 -->
                            <p>结尾中文</p><span>紧贴结束</span>

                            <!-- 超长属性行 -->
                            <div
                                data-long-line="这是一个很长的属性中文字符串，用于验证在超长行的情况下 AST 定位与替换是否仍然准确，不会出现截断或者错位的问题。该字符串包含各种标点符号：，。；：“”‘’——【】《》以及数字1234567890和英文字母ABCdef">
                                <!-- 占位 -->
                            </div>

                            <!-- End Edge Cases 2 -->
        </section>
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