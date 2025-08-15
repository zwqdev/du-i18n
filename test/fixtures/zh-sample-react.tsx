import React, { useState, useEffect } from 'react';

interface Item { id: number; text: string; }

export const ZhSampleReact: React.FC = () => {
  const [title] = useState('React 标题：用于测试中文字符串抽取的示例组件');
  const [desc] = useState("组件描述：这里包含多种形式的中文文本，便于分析工具覆盖");
  const [items, setItems] = useState<Item[]>([
    { id: 1, text: '初始项目一：基本中文文本内容，长度适中' },
    { id: 2, text: '初始项目二：带有更多描述信息的条目，确保扫描到不同长度' },
    { id: 3, text: `初始项目三：包含当前分钟 ${new Date().getMinutes()} 的动态模板字符串` },
  ]);
  const [log, setLog] = useState('日志区域：这里展示用户行为和系统反馈信息');
  const [visible, setVisible] = useState(true);
  const buttonLabelAdd = '按钮文本：添加一个新的中文项目';
  const buttonLabelToggle = '按钮文本：切换显示或隐藏列表';
  const footerText = '底部区域：这里放置版权信息、版本声明以及联系方式';
  // 新增：对象中定义的多层中文字符串
  const metaDict = {
    dashboard: {
      title: '仪表盘标题：系统运行概览信息区',
      desc: '仪表盘描述：集中展示关键性能指标与最近操作活动记录，以便快速判断系统状态',
      metrics: [
        '指标一：当前活跃会话数量（对象中的数组项中文一）',
        '指标二：最近十分钟内的任务执行成功率（对象中的数组项中文二）',
        `指标三：动态生成的当前秒数 ${new Date().getSeconds()}，用于测试模板插值`,
      ],
      footer: '仪表盘底部：更多统计信息请前往详细报表页面',
    },
    actions: {
      export: '动作：导出当前统计数据为文件（对象内字符串）',
      clean: '动作：清理过期缓存并重新计算最新统计结果',
    },
    banner: `横幅提示：当前时间 ${new Date().toLocaleTimeString()}，请注意即将到来的维护窗口`,
  };

  function addItem() {
    const id = items.length + 1;
    setItems([...items, { id, text: `新增项目 ${id}：这是通过交互添加的中文列表项，包含编号与描述` }]);
    setLog('日志更新：用户刚刚添加了一个项目，界面已重新渲染');
  }

  function toggle() {
    setVisible(v => !v);
    setLog(prev => prev + '；执行切换操作：当前是否显示列表 => ' + (!visible));
  }

  useEffect(() => {
    console.info('副作用：组件已挂载，开始进行数据准备与中文日志输出');
    return () => console.warn('副作用清理：组件即将卸载，执行对应的资源释放操作');
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>{title}</h1>
      <p>{desc}</p>
      <p>{'静态段落：这一段直接包裹在 JSX 花括号中的中文文本，用于测试基本节点内容。'}</p>
      <p>{`提示信息：当前共有 ${items.length} 条记录，您可以继续添加或隐藏列表`}</p>
      <div>
        <button onClick={addItem}>{buttonLabelAdd}</button>
        <button onClick={toggle}>{buttonLabelToggle}</button>
      </div>
      {visible ? (
        <ul>
          {items.map(it => <li key={it.id}>{it.text}</li>)}
        </ul>
      ) : <p>占位文本：列表当前被隐藏，点击上方按钮可以重新显示</p>}
      <section>
        <header>分区标题：日志与附加说明</header>
        <div>{log}</div>
        <aside>{'附加侧边说明：这里放置补充性的中文内容，帮助用户更好地理解界面状态变化。'}</aside>
      </section>
      <section style={{ marginTop: 24, padding: 12, border: '1px solid #ddd' }}>
        <h2>{metaDict.dashboard.title}</h2>
        <p>{metaDict.dashboard.desc}</p>
        <ul>
          {metaDict.dashboard.metrics.map((m, idx) => <li key={idx}>{m}</li>)}
        </ul>
        <div style={{ fontStyle: 'italic' }}>{metaDict.banner}</div>
        <div>
          <span>{metaDict.actions.export}</span> | <span>{metaDict.actions.clean}</span>
        </div>
        <small>{metaDict.dashboard.footer}</small>
      </section>
      <footer>{footerText}</footer>
    </div>
  );
};

export default ZhSampleReact;
