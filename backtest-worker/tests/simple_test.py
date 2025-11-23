# -*- coding: utf-8 -*-
"""
简化测试 - 使用基础策略快速验证数据
"""

import sys
import os
import pandas as pd
import pyarrow.parquet as pq
from datetime import datetime

# 数据文件路径
DATA_FILE = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/MES/MES/1s/dt=2022-12-15/hour=00/batch_5.parquet'

try:
    import backtrader as bt
    BACKTRADER_AVAILABLE = True
except ImportError:
    BACKTRADER_AVAILABLE = False
    print("❌ Backtrader未安装")
    sys.exit(1)


class SimpleMAStrategy(bt.Strategy):
    """简单的双均线策略 - 用于快速测试"""
    params = (
        ('fast_period', 10),
        ('slow_period', 30),
    )
    
    def __init__(self):
        self.ma_fast = bt.indicators.SMA(period=self.params.fast_period)
        self.ma_slow = bt.indicators.SMA(period=self.params.slow_period)
        self.crossover = bt.indicators.CrossOver(self.ma_fast, self.ma_slow)
        self.trade_count = 0
        
    def next(self):
        if not self.position:
            if self.crossover > 0:  # 金叉
                self.buy()
        else:
            if self.crossover < 0:  # 死叉
                self.sell()
                
    def notify_order(self, order):
        if order.status in [order.Completed]:
            if order.isbuy():
                self.trade_count += 1
            elif order.issell():
                self.trade_count += 1


class HighFrequencySimple(bt.Strategy):
    """高频策略 - 每根K线交易"""
    params = (
        ('hold_bars', 1),
    )
    
    def __init__(self):
        self.bar_count = 0
        self.trade_count = 0
        
    def next(self):
        if not self.position:
            # 空仓时开多
            self.buy()
        else:
            # 持仓1根K线后平仓
            if self.bar_count >= self.params.hold_bars:
                self.sell()
                self.bar_count = 0
            else:
                self.bar_count += 1
                
    def notify_order(self, order):
        if order.status in [order.Completed]:
            self.trade_count += 1


def load_data(file_path, max_rows=None):
    """加载Parquet数据"""
    print(f'📂 加载数据: {os.path.basename(file_path)}')
    
    try:
        # 读取Parquet
        table = pq.read_table(file_path)
        df = table.to_pandas()
        
        if max_rows:
            df = df.head(max_rows)
        
        print(f'✓ 原始数据: {len(df):,} 行')
        
        # 处理时间列
        if 'timestamp' in df.columns:
            df['datetime'] = pd.to_datetime(df['timestamp'])
        
        # 聚合到1分钟
        df.set_index('datetime', inplace=True)
        df_1m = df.resample('1min').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).dropna()
        
        print(f'✓ 聚合后: {len(df_1m)} 根1分钟K线')
        print(f'  时间范围: {df_1m.index.min()} 至 {df_1m.index.max()}')
        print(f'  价格范围: {df_1m["close"].min():.2f} - {df_1m["close"].max():.2f}')
        
        return df_1m
        
    except Exception as e:
        print(f'❌ 加载失败: {e}')
        return None


def run_test(strategy_class, strategy_name, df):
    """运行策略测试"""
    print(f'\n{"="*80}')
    print(f'📊 测试: {strategy_name}')
    print(f'{"="*80}')
    
    cerebro = bt.Cerebro()
    
    # 添加数据
    data = bt.feeds.PandasData(dataname=df)
    cerebro.adddata(data)
    
    # 添加策略
    cerebro.addstrategy(strategy_class)
    
    # 设置资金
    initial_cash = 100000
    cerebro.broker.setcash(initial_cash)
    cerebro.broker.setcommission(commission=0.0001)
    
    print(f'初始资金: ${initial_cash:,}')
    print(f'K线数量: {len(df)}')
    
    # 运行
    start_time = datetime.now()
    results = cerebro.run()
    end_time = datetime.now()
    
    strategy = results[0]
    final_value = cerebro.broker.getvalue()
    elapsed = (end_time - start_time).total_seconds()
    
    # 统计
    trade_count = strategy.trade_count if hasattr(strategy, 'trade_count') else 0
    pnl = final_value - initial_cash
    return_pct = (pnl / initial_cash) * 100
    
    print(f'\n✅ 测试结果:')
    print(f'   成交笔数: {trade_count} 笔')
    print(f'   最终资金: ${final_value:,.2f}')
    print(f'   盈亏: ${pnl:,.2f} ({return_pct:+.2f}%)')
    print(f'   执行时间: {elapsed:.3f} 秒')
    
    if trade_count > 0 and elapsed > 0:
        print(f'   处理速度: {trade_count/elapsed:.0f} 笔/秒')
    
    return {
        'strategy': strategy_name,
        'trade_count': trade_count,
        'pnl': pnl,
        'return_pct': return_pct,
        'elapsed': elapsed
    }


def main():
    print('='*80)
    print('🧪 策略测试 - 使用实际Parquet数据')
    print('='*80)
    
    # 加载数据（限制10万行以加快测试）
    df = load_data(DATA_FILE, max_rows=100000)
    
    if df is None or len(df) == 0:
        print('❌ 数据加载失败')
        return 1
    
    # 测试策略
    strategies = [
        (HighFrequencySimple, 'HighFrequency (简化)'),
        (SimpleMAStrategy, '双均线策略'),
    ]
    
    results = []
    for strategy_class, name in strategies:
        try:
            result = run_test(strategy_class, name, df)
            results.append(result)
        except Exception as e:
            print(f'❌ 测试失败: {e}')
            import traceback
            traceback.print_exc()
    
    # 汇总
    if results:
        print(f'\n{"="*80}')
        print('📊 测试汇总')
        print(f'{"="*80}')
        print(f'\n数据规模: {len(df)} 根1分钟K线\n')
        
        results.sort(key=lambda x: x['trade_count'], reverse=True)
        
        print(f'{"策略":<30} {"成交笔数":<15} {"收益率":<15} {"耗时"}')
        print('-'*80)
        for r in results:
            print(f'{r["strategy"]:<30} {r["trade_count"]:<15} {r["return_pct"]:+.2f}%{" ":<10} {r["elapsed"]:.3f}秒')
        
        # 推算90天
        print(f'\n{"="*80}')
        print('📈 推算90天完整测试 (129,600根K线)')
        print(f'{"="*80}\n')
        
        scale = 129600 / len(df)
        
        print(f'{"策略":<30} {"当前({len(df)}根)":<20} {"推算90天"}')
        print('-'*80)
        for r in results:
            scaled = int(r['trade_count'] * scale)
            print(f'{r["strategy"]:<30} {r["trade_count"]:<20} {scaled:,} 笔')
        
        print(f'\n✅ 测试完成！')
        
    return 0


if __name__ == '__main__':
    sys.exit(main())

