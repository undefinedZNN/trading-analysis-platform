# -*- coding: utf-8 -*-
"""
完整策略测试 - 测试所有5个策略
"""

import sys
import pandas as pd
import pyarrow.parquet as pq
import backtrader as bt
from datetime import datetime
import random

DATA_FILE = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/MES/MES/1s/dt=2022-12-15/hour=00/batch_5.parquet'

# ============================================================================
# 策略1: 高频策略
# ============================================================================
class HighFrequencySimple(bt.Strategy):
    """高频策略 - 每根K线交易"""
    params = (('hold_bars', 1),)
    
    def __init__(self):
        self.bar_count = 0
        self.trade_count = 0
        
    def next(self):
        if not self.position:
            self.buy()
        else:
            if self.bar_count >= self.params.hold_bars:
                self.sell()
                self.bar_count = 0
            else:
                self.bar_count += 1
                
    def notify_order(self, order):
        if order.status in [order.Completed]:
            self.trade_count += 1


# ============================================================================
# 策略2: 随机策略
# ============================================================================
class RandomSimple(bt.Strategy):
    """随机策略 - Monte Carlo测试"""
    params = (
        ('entry_prob', 0.1),
        ('close_prob', 0.1),
        ('random_seed', 42),
    )
    
    def __init__(self):
        random.seed(self.params.random_seed)
        self.trade_count = 0
        
    def next(self):
        if not self.position:
            if random.random() < self.params.entry_prob:
                self.buy()
        else:
            if random.random() < self.params.close_prob:
                self.sell()
                
    def notify_order(self, order):
        if order.status in [order.Completed]:
            self.trade_count += 1


# ============================================================================
# 策略3: 反转形态策略 (简化版)
# ============================================================================
class ReversalPatternSimple(bt.Strategy):
    """反转形态策略 - Pin Bar识别"""
    params = (
        ('ma_len', 50),
        ('pin_ratio', 0.66),
    )
    
    def __init__(self):
        self.ma = bt.indicators.SMA(period=self.params.ma_len)
        self.trade_count = 0
        
    def next(self):
        if len(self) < self.params.ma_len:
            return
            
        # 简化的Pin Bar识别
        body = abs(self.data.close[0] - self.data.open[0])
        candle_range = self.data.high[0] - self.data.low[0]
        
        if candle_range == 0:
            return
            
        # 看涨Pin Bar: 长下影线
        lower_wick = min(self.data.open[0], self.data.close[0]) - self.data.low[0]
        if not self.position:
            if (lower_wick / candle_range > self.params.pin_ratio and 
                self.data.close[0] > self.ma[0]):
                self.buy()
        
        # 看跌Pin Bar: 长上影线
        upper_wick = self.data.high[0] - max(self.data.open[0], self.data.close[0])
        if self.position:
            if (upper_wick / candle_range > self.params.pin_ratio and 
                self.data.close[0] < self.ma[0]):
                self.sell()
                
    def notify_order(self, order):
        if order.status in [order.Completed]:
            self.trade_count += 1


# ============================================================================
# 策略4: 挂单策略 (简化版)
# ============================================================================
class PendingOrderSimple(bt.Strategy):
    """挂单策略 - 突破交易"""
    params = (
        ('breakout_len', 20),
    )
    
    def __init__(self):
        self.highest = bt.indicators.Highest(self.data.high, period=self.params.breakout_len)
        self.lowest = bt.indicators.Lowest(self.data.low, period=self.params.breakout_len)
        self.trade_count = 0
        
    def next(self):
        if len(self) < self.params.breakout_len:
            return
            
        if not self.position:
            # 突破最高点做多
            if self.data.close[0] > self.highest[-1]:
                self.buy()
        else:
            # 跌破最低点平仓
            if self.data.close[0] < self.lowest[-1]:
                self.sell()
                
    def notify_order(self, order):
        if order.status in [order.Completed]:
            self.trade_count += 1


# ============================================================================
# 策略5: 金字塔加仓策略 (简化版)
# ============================================================================
class PyramidSimple(bt.Strategy):
    """金字塔策略 - 趋势加仓"""
    params = (
        ('ma_len', 50),
        ('max_positions', 3),
    )
    
    def __init__(self):
        self.ma = bt.indicators.SMA(period=self.params.ma_len)
        self.position_count = 0
        self.trade_count = 0
        
    def next(self):
        if len(self) < self.params.ma_len:
            return
            
        # 趋势向上且未满仓，加仓
        if self.data.close[0] > self.ma[0]:
            if self.position_count < self.params.max_positions:
                self.buy()
                self.position_count += 1
        # 趋势向下，全部平仓
        elif self.position_count > 0:
            self.sell(size=self.position.size)
            self.position_count = 0
                
    def notify_order(self, order):
        if order.status in [order.Completed]:
            self.trade_count += 1


# ============================================================================
# 测试函数
# ============================================================================
def load_data(max_rows=200000):
    """加载数据"""
    print(f'📂 加载数据...')
    table = pq.read_table(DATA_FILE)
    df = table.to_pandas().head(max_rows)
    
    df['datetime'] = pd.to_datetime(df['timestamp'])
    df.set_index('datetime', inplace=True)
    df_1m = df.resample('1min').agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum'
    }).dropna()
    
    print(f'✓ 数据就绪: {len(df_1m):,} 根1分钟K线')
    return df_1m


def run_strategy(strategy_class, name, df):
    """运行单个策略"""
    print(f'\n{"="*80}')
    print(f'📊 测试策略: {name}')
    print(f'{"="*80}')
    
    try:
        cerebro = bt.Cerebro()
        data = bt.feeds.PandasData(dataname=df)
        cerebro.adddata(data)
        cerebro.addstrategy(strategy_class)
        cerebro.broker.setcash(100000)
        cerebro.broker.setcommission(commission=0.0001)
        
        start = datetime.now()
        results = cerebro.run()
        elapsed = (datetime.now() - start).total_seconds()
        
        strategy = results[0]
        final = cerebro.broker.getvalue()
        trades = strategy.trade_count
        pnl = final - 100000
        
        print(f'\n✅ 测试完成:')
        print(f'   成交笔数: {trades:,} 笔')
        print(f'   最终资金: ${final:,.2f}')
        print(f'   盈亏: ${pnl:,.2f} ({pnl/1000:+.2f}%)')
        print(f'   执行时间: {elapsed:.2f} 秒')
        if trades > 0 and elapsed > 0:
            print(f'   处理速度: {trades/elapsed:.0f} 笔/秒')
        
        return {
            'name': name,
            'trades': trades,
            'final': final,
            'pnl': pnl,
            'return_pct': pnl / 1000,
            'elapsed': elapsed,
            'success': True
        }
    except Exception as e:
        print(f'\n❌ 测试失败: {e}')
        return {
            'name': name,
            'trades': 0,
            'success': False,
            'error': str(e)
        }


def main():
    """主函数"""
    print('='*80)
    print('🧪 完整策略测试 - 所有5个策略')
    print('='*80)
    
    # 加载数据
    df = load_data(max_rows=200000)
    
    # 定义所有策略
    strategies = [
        (HighFrequencySimple, 'HighFrequency (高频)'),
        (RandomSimple, 'Random (随机)'),
        (ReversalPatternSimple, 'ReversalPattern (反转形态)'),
        (PendingOrderSimple, 'PendingOrder (挂单)'),
        (PyramidSimple, 'Pyramid (金字塔)'),
    ]
    
    # 运行所有策略
    results = []
    for strategy_class, name in strategies:
        result = run_strategy(strategy_class, name, df)
        if result['success']:
            results.append(result)
    
    # 汇总结果
    print(f'\n{"="*80}')
    print('📊 测试结果汇总')
    print(f'{"="*80}')
    print(f'\n数据规模: {len(df):,} 根1分钟K线')
    print(f'成功测试: {len(results)}/5 个策略\n')
    
    # 按成交笔数排序
    results.sort(key=lambda x: x['trades'], reverse=True)
    
    print(f'{"排名":<6} {"策略":<30} {"成交笔数":<15} {"收益率":<12} {"耗时"}')
    print('-'*80)
    for i, r in enumerate(results, 1):
        print(f'{i:<6} {r["name"]:<30} {r["trades"]:<15,} {r["return_pct"]:+.2f}%{" "*6} {r["elapsed"]:.2f}秒')
    
    # 推算90天
    print(f'\n{"="*80}')
    print('📈 推算90天完整测试结果 (129,600根K线)')
    print(f'{"="*80}\n')
    
    scale = 129600 / len(df)
    
    print(f'{"排名":<6} {"策略":<30} {"当前({len(df):,}根)":<20} {"推算90天"}')
    print('-'*80)
    for i, r in enumerate(results, 1):
        scaled = int(r['trades'] * scale)
        print(f'{i:<6} {r["name"]:<30} {r["trades"]:<20,} {scaled:,} 笔')
    
    # 统计信息
    print(f'\n{"="*80}')
    print('📊 详细统计')
    print(f'{"="*80}\n')
    
    total_trades = sum(r['trades'] for r in results)
    total_time = sum(r['elapsed'] for r in results)
    
    print(f'总成交笔数: {total_trades:,} 笔')
    print(f'总测试时间: {total_time:.2f} 秒')
    print(f'平均速度: {total_trades/total_time:.0f} 笔/秒')
    
    if results:
        print(f'\n成交笔数分布:')
        print(f'  最多: {results[0]["trades"]:,} 笔 ({results[0]["name"]})')
        print(f'  最少: {results[-1]["trades"]:,} 笔 ({results[-1]["name"]})')
    
    print(f'\n✅ 所有测试完成！')
    print('='*80)
    
    return 0


if __name__ == '__main__':
    sys.exit(main())

