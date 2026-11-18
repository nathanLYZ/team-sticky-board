/** 底部快捷键提示条：把常用操作贴在手边 */
export default function ShortcutBar() {
  return (
    <div className="shortcut-bar">
      <span>
        <kbd>空格</kbd> + 拖拽平移
      </span>
      <span>
        <kbd>滚轮</kbd> 缩放
      </span>
      <span>
        <kbd>V</kbd> <kbd>N</kbd> <kbd>P</kbd> <kbd>C</kbd> 切换工具
      </span>
      <span>
        <kbd>双击</kbd> 编辑便签
      </span>
      <span>
        <kbd>右键</kbd> 便签更多操作
      </span>
    </div>
  );
}
