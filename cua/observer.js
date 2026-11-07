'use strict';
/**
 * 屏幕与窗口观察
 * 当前为占位实现。后续接入截图、UI Automation、窗口枚举等。
 */
async function observe() {
  return {
    ts: Date.now(),
    screenshot: null, // TODO: 实际截图
    windows: [],      // TODO: 枚举窗口
    focus: null,
    note: 'observer stub — replace with real Windows observation',
  };
}

module.exports = { observe };
