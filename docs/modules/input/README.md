# 输入

`Controls` 为每局创建一组可 Abort 的监听器，销毁时解除。键盘和触控统一进入按住方向 Map；最后按下且仍按住的方向优先，不斜走。

手机使用 Pointer Events、pointer capture 和独立 pointerId，移动与闪避可以同时按。pointerup、pointercancel、lostpointercapture 都释放该指针；暂停清空全部方向和待消费闪避。

闪避记录按下瞬间的方向，避免「方向 + 闪避 + 快速松手」在下一个 20ms 采样时丢失方向。按键自动重复不会不断触发闪避。WASD/方向键移动，Space 闪避，Escape/P 暂停。

失焦与 visibilitychange 在 App 边界自动暂停，返回后主动继续。重开销毁旧 Controls；四次连续重开测试用单次 Escape 检测重复监听。
