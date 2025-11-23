# -*- coding: utf-8 -*-
"""完整数据测试 - 获取实际成交笔数"""
import pandas as pd
import pyarrow.parquet as pq
import backtrader as bt
from datetime import datetime

DATA_FILE = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/MES/MES/1s/dt=2022-12-15/hour=00/batch_5.parquet'

class HighFrequencySimple(bt.Strategy):
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

print('='*80)
print('🧪 完整数据测试')
print('='*80)
print(f'\n📂 加载数据: {DATA_FILE}')

table = pq.read_table(DATA_FILE)
df = table.to_pandas()
print(f'✓ 原始数据: {len(df):,} 行')

df['datetime'] = pd.to_datetime(df['timestamp'])
df.set_index('datetime', inplace=True)
df_1m = df.resample('1min').agg({'open': 'first', 'high': 'max', 'low': 'min', 'close': 'last', 'volume': 'sum'}).dropna()
print(f'✓ 聚合后: {len(df_1m):,} 根1分钟K线')
print(f'  时间范围: {df_1m.index.min()} 至 {df_1m.index.max()}')
print(f'  价格范围: {df_1m["close"].min():.2f} - {df_1m["close"].max():.2f}')

print(f'\n📊 运行高频策略测试...')
cerebro = bt.Cerebro()
data = bt.feeds.PandasData(dataname=df_1m)
cerebro.adddata(data)
cerebro.addstrategy(HighFrequencySimple)
cerebro.broker.setcash(100000)
cerebro.broker.setcommission(commission=0.0001)

start = datetime.now()
results = cerebro.run()
elapsed = (datetime.now() - start).total_seconds()

strategy = results[0]
final = cerebro.broker.getvalue()
trades = strategy.trade_count

print(f'\n✅ 测试结果:')
print(f'   成交笔数: {trades:,} 笔')
print(f'   最终资金: ${final:,.2f}')
print(f'   盈亏: ${final-100000:,.2f} ({(final-100000)/1000:+.2f}%)')
print(f'   执行时间: {elapsed:.2f} 秒')
print(f'   处理速度: {trades/elapsed:.0f} 笔/秒')

scale = 129600 / len(df_1m)
scaled_trades = int(trades * scale)
print(f'\n📈 推算90天完整测试:')
print(f'   当前数据: {len(df_1m):,} 根K线')
print(f'   当前成交: {trades:,} 笔')
print(f'   缩放系数: {scale:.2f}x')
print(f'   推算90天: {scaled_trades:,} 笔 (129,600根K线)')
print(f'\n   理论预期: 130,000 笔')
print(f'   实际推算: {scaled_trades:,} 笔')
print(f'   误差: {(scaled_trades - 130000) / 130000 * 100:+.1f}%')
print(f'\n✅ 测试完成！')
print('='*80)

