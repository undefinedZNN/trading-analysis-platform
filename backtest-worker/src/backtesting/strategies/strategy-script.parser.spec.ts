import { StrategyScriptParser } from './strategy-script.parser';

describe('StrategyScriptParser', () => {
  let parser: StrategyScriptParser;

  beforeEach(() => {
    parser = new StrategyScriptParser();
  });

  it('解析脚本并收集参数与因子 Schema', () => {
    const script = `
      import { defineStrategy, parameter, factor } from '@platform/backtesting-sdk';

      export default defineStrategy({
        parameters: [
          parameter.number('shortWindow', { label: '短期', defaultValue: 5 }),
          parameter.select('session', {
            label: '交易时段',
            enumOptions: [
              { label: '日间', value: 'RTH' },
              { label: '夜盘', value: 'ETH' }
            ],
            required: false
          }),
        ],
        factors: [
          factor.number('holdingBars', { label: '持仓K线数' }),
          factor.custom('entryReason', { label: '入场原因', type: 'string' }),
        ],
        run() {}
      });
    `;

    const result = parser.parse(script);

    expect(result.parameters).toHaveLength(2);
    expect(result.parameters[0]).toMatchObject({
      key: 'shortWindow',
      label: '短期',
      type: 'number',
      component: 'number',
      defaultValue: 5,
      required: true,
    });
    expect(result.parameters[1]).toMatchObject({
      key: 'session',
      enumOptions: [
        { label: '日间', value: 'RTH' },
        { label: '夜盘', value: 'ETH' },
      ],
      required: false,
    });

    expect(result.factors).toHaveLength(2);
    expect(result.factors[0]).toMatchObject({
      key: 'holdingBars',
      type: 'number',
      component: 'number',
    });
    expect(result.factors[1]).toMatchObject({
      key: 'entryReason',
      type: 'custom',
      component: 'input',
    });
  });

  it('检测重复的字段 key 时抛出异常', () => {
    const script = `
      import { defineStrategy } from '@platform/backtesting-sdk';

      export default defineStrategy({
        parameters: [
          { key: 'dup', label: 'A', type: 'number' },
          { key: 'dup', label: 'B', type: 'number' }
        ],
        factors: [],
        run() {}
      });
    `;

    expect(() => parser.parse(script)).toThrow('自定义参数 中存在重复 key：dup');
  });

  it('阻止脚本引用非白名单模块', () => {
    const script = `
      import { defineStrategy } from '@platform/backtesting-sdk';
      import fs from 'fs';

      export default defineStrategy({
        parameters: [],
        factors: [],
        run() {
          fs.readFileSync('/etc/passwd');
        }
      });
    `;

    expect(() => parser.parse(script)).toThrow('不允许在回测脚本中引用模块：fs');
  });
});
