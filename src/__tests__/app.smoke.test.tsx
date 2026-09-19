import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import App from '../App';

describe('工作台渲染冒烟', () => {
  it('渲染出匿名评审包、评分面板与规则体检', () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('GrantKit');
    expect(html).toContain('匿名评审包');
    expect(html).toContain('申请人-');
    expect(html).toContain('评分结果');
    expect(html).toContain('规则体检');
    // 默认规则集无冲突
    expect(html).toContain('未发现规则冲突');
    // 渲染结果中不应泄露任何内置样例的真实姓名
    expect(html).not.toContain('王思远');
    expect(html).not.toContain('李慕雪');
    expect(html).not.toContain('陈启铭');
  });
});
