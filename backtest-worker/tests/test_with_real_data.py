# -*- coding: utf-8 -*-
"""
使用实际Parquet数据测试策略
数据文件: backend/storage/datasets/MES/MES/1s/dt=2022-12-15/hour=00/batch_5.parquet
"""

import sys
import os
import pandas as pd
import pyarrow.parquet as pq
from datetime import datetime

# 添加路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# 数据文件路径
DATA_FILE = '/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/MES/MES/1s/dt=2022-12-15/hour=00/batch_5.parquet'

try:
    import backtrader as bt
    from src.backtrader_integration.strategy import (
        ReversalPatternStrategy,
        HighFrequencyStrategy,
        PendingOrderStrategy,
        PyramidStrategy,
        RandomStrategy
    )
    from src.backtrader_integration.factors import FactorCollector
    BACKTRADER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  依赖未安装: {e}")
    BACKTRADER_AVAILABLE = False

def load_parquet_data(file_path):
    """加载Parquet数据"""
    print(f'\n📂 加载数据文件...')
    print(f'   路径: {file_path}')
    
    try:
        # 检查文件是否存在
        if not os.path.exists(file_path):
            print(f'❌ 文件不存在: {file_path}')
            return None
        
        file_size = os.path.getsize(file_path) / (1024 * 1024)
        print(f'   大小: {file_size:.2f} MB')
        
        # 读取Parquet文件
        table = pq.read_table(file_path)
        df = table.to_pandas()
        
        print(f'✓ 数据加载成功')
        print(f'   记录数: {len(df):,} 行')
        print(f'   列: {", ".join(df.columns.tolist())}')
        
        # 显示数据信息
        if 'timestamp' in df.columns:
            df['datetime'] = pd.to_datetime(df['timestamp'])
        elif 'datetime' in df.columns:
            df['datetime'] = pd.to_datetime(df['datetime'])
        else:
            print('⚠️  未找到时间列，尝试使用索引')
        
        # 确保有OHLCV列
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            print(f'❌ 缺少必需列: {missing_cols}')
            print(f'   实际列: {df.columns.tolist()}')
            return None
        
        # 设置索引
        if 'datetime' in df.columns:
            df.set_index('datetime', inplace=True)
            df.sort_index(inplace=True)
        
        print(f'   时间范围: {df.index.min()} 至 {df.index.max()}')
        print(f'   价格范围: {df["close"].min():.2f} - {df["close"].max():.2f}')
        print(f'   成交量: {df["volume"].sum():,.0f}')
        
        return df
        
    except Exception as e:
        print(f'❌ 读取数据失败: {e}')
        import traceback
        traceback.print_exc()
        return None

def run_strategy_test(strategy_class, strategy_name, df, params=None):
    """运行单个策略测试"""
    print(f'\n{"="*80}')
    print(f'📊 测试策略: {strategy_name}')
    print(f'{"="*80}')
    
    try:
        # 创建Cerebro
        cerebro = bt.Cerebro()
        
        # 添加数据
        data = bt.feeds.PandasData(
            dataname=df,
            datetime=None,  # 使用索引
            open='open',
            high='high',
            low='low',
            close='close',
            volume='volume',
            openinterest=-1
        )
        cerebro.adddata(data)
        
        # 添加策略
        if params:
            cerebro.addstrategy(strategy_class, **params)
        else:
            cerebro.addstrategy(strategy_class)
        
        # 添加FactorCollector
        cerebro.addobserver(FactorCollector)
        
        # 添加Value观察者
        cerebro.addobserver(bt.observers.Value)
        
        # 设置初始资金
        initial_cash = 100000
        cerebro.broker.setcash(initial_cash)
        cerebro.broker.setcommission(commission=0.0001)  # 0.01%手续费
        
        # 运行回测
        print(f'\n▶ 开始回测...')
        print(f'   初始资金: ${initial_cash:,.2f}')
        print(f'   数据量: {len(df)} 根K线')
        
        start_time = datetime.now()
        results = cerebro.run()
        end_time = datetime.now()
        
        strategy = results[0]
        final_value = cerebro.broker.getvalue()
        
        # 统计交易数据
        trade_count = 0
        if hasattr(strategy, 'factor_collector') and strategy.factor_collector:
            trades = strategy.factor_collector.trades
            trade_count = len(trades)
            
            # 显示部分交易明细
            if trade_count > 0:
                print(f'\n📝 交易明细（前5笔）:')
                for i, trade in enumerate(trades[:5]):
                    print(f'   {i+1}. {trade.direction} @ {trade.entry_price:.2f} → {trade.exit_price:.2f}, PnL: ${trade.pnl:.2f}')
                
                if trade_count > 5:
                    print(f'   ... 还有 {trade_count - 5} 笔交易')
        
        # 计算收益
        pnl = final_value - initial_cash
        return_pct = (pnl / initial_cash) * 100
        elapsed = (end_time - start_time).total_seconds()
        
        # 显示结果
        print(f'\n✅ 【测试结果】')
        print(f'   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        print(f'   实际成交笔数: {trade_count} 笔')
        print(f'   最终资金: ${final_value:,.2f}')
        print(f'   盈亏: ${pnl:,.2f} ({return_pct:+.2f}%)')
        print(f'   执行时间: {elapsed:.3f} 秒')
        
        if trade_count > 0:
            speed = trade_count / elapsed if elapsed > 0 else 0
            print(f'   处理速度: {speed:.0f} 笔/秒')
            
            # 计算胜率
            if hasattr(strategy, 'factor_collector') and strategy.factor_collector:
                winning_trades = sum(1 for t in trades if t.pnl > 0)
                win_rate = (winning_trades / trade_count * 100) if trade_count > 0 else 0
                print(f'   胜率: {win_rate:.1f}% ({winning_trades}/{trade_count})')
        
        print(f'   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        
        return {
            'strategy': strategy_name,
            'trade_count': trade_count,
            'final_value': final_value,
            'pnl': pnl,
            'return_pct': return_pct,
            'elapsed': elapsed,
            'success': True
        }
        
    except Exception as e:
        print(f'\n❌ 策略运行失败: {e}')
        import traceback
        traceback.print_exc()
        return {
            'strategy': strategy_name,
            'trade_count': 0,
            'success': False,
            'error': str(e)
        }

def main():
    """主测试函数"""
    print('='*80)
    print('🧪 策略实际测试 - 使用真实Parquet数据')
    print('='*80)
    
    if not BACKTRADER_AVAILABLE:
        print('\n❌ 无法运行测试: 依赖未安装')
        print('   请运行: pip install backtrader pandas pyarrow')
        return 1
    
    # 加载数据
    df = load_parquet_data(DATA_FILE)
    if df is None or len(df) == 0:
        print('\n❌ 数据加载失败或为空')
        return 1
    
    # 数据聚合到1分钟（如果是1秒数据）
    print(f'\n📊 数据预处理...')
    original_len = len(df)
    
    # 重采样到1分钟
    df_1m = df.resample('1min').agg({
        'open': 'first',
        'high': 'max',
        'low': 'min',
        'close': 'last',
        'volume': 'sum'
    }).dropna()
    
    print(f'   原始数据: {original_len} 根K线 (1秒)')
    print(f'   聚合后: {len(df_1m)} 根K线 (1分钟)')
    
    # 要测试的策略（调整参数以适应小数据量）
    strategies = [
        ('ReversalPattern', ReversalPatternStrategy, {
            'ma_len': 10,  # 减小均线周期
            'rr_tp': 2.0,
            'rr_be': 1.0,
        }),
        ('HighFrequency', HighFrequencyStrategy, {
            'mode': 'always_long',
            'hold_bars': 1,
            'use_sl_tp': False,
        }),
        ('PendingOrder', PendingOrderStrategy, {
            'breakout_lookback': 5,  # 减小周期
            'pullback_ratio': 0.5,
        }),
        ('Pyramid', PyramidStrategy, {
            'trend_ma_len': 10,  # 减小均线周期
            'max_add_times': 3,
        }),
        ('Random', RandomStrategy, {
            'entry_prob': 0.1,
            'close_prob': 0.15,
            'random_seed': 42,
        }),
    ]
    
    # 运行所有策略
    results = []
    for name, strategy_class, params in strategies:
        result = run_strategy_test(strategy_class, name, df_1m, params)
        if result['success']:
            results.append(result)
    
    # 汇总结果
    print('\n' + '='*80)
    print('📊 测试结果汇总')
    print('='*80)
    
    if not results:
        print('❌ 没有成功的测试结果')
        return 1
    
    # 按成交笔数排序
    results.sort(key=lambda x: x['trade_count'], reverse=True)
    
    print(f'\n数据文件: {os.path.basename(DATA_FILE)}')
    print(f'数据规模: {len(df_1m)} 根1分钟K线')
    print(f'测试策略: {len(results)} 个\n')
    
    print(f'{"排名":<6} {"策略":<20} {"成交笔数":<12} {"收益率":<12} {"耗时":<10}')
    print('-' * 80)
    
    for i, r in enumerate(results, 1):
        trade_count = f"{r['trade_count']} 笔"
        return_pct = f"{r['return_pct']:+.2f}%"
        elapsed = f"{r['elapsed']:.3f}秒"
        print(f'{i:<6} {r["strategy"]:<20} {trade_count:<12} {return_pct:<12} {elapsed:<10}')
    
    print('='*80)
    
    # 显示详细统计
    total_trades = sum(r['trade_count'] for r in results)
    
    print(f'\n📈 统计信息:')
    print(f'   总成交笔数: {total_trades} 笔')
    if results:
        print(f'   最多: {results[0]["trade_count"]} 笔 ({results[0]["strategy"]})')
        print(f'   最少: {results[-1]["trade_count"]} 笔 ({results[-1]["strategy"]})')
        
        total_time = sum(r['elapsed'] for r in results)
        print(f'   总测试时间: {total_time:.3f} 秒')
    
    # 推算90天结果
    print(f'\n📊 推算90天完整测试结果:')
    print('-' * 80)
    
    # 1小时数据约60根1分钟K线，90天约129,600根
    scale_factor = 129600 / len(df_1m)
    
    print(f'{"策略":<20} {"实际(1小时)":<15} {"推算(90天)":<15} {"说明":<20}')
    print('-' * 80)
    
    for r in results:
        actual = r['trade_count']
        estimated_90d = int(actual * scale_factor) if actual > 0 else 0
        
        # 添加说明
        if r['strategy'] == 'HighFrequency':
            note = "≈ K线数量"
        elif r['strategy'] == 'Random':
            note = "随机交易"
        elif actual == 0:
            note = "数据量太小"
        else:
            note = "低频策略"
        
        print(f'{r["strategy"]:<20} {actual:<15} {estimated_90d:<15} {note:<20}')
    
    print('='*80)
    print('\n✅ 实际测试完成！')
    print(f'\n💡 注意: 当前数据量较小({len(df_1m)}根K线)，低频策略可能无交易')
    print(f'   建议使用更多数据文件进行完整测试')
    
    return 0

if __name__ == '__main__':
    sys.exit(main())

