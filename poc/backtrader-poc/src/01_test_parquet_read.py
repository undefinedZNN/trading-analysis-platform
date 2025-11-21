#!/usr/bin/env python3
"""
POC Day 1 - 测试 Parquet 数据读取
验证 DuckDB 能否正确读取分区 Parquet 数据
"""

import duckdb
import pandas as pd
from datetime import datetime

def test_parquet_read():
    """测试读取 Parquet 数据"""
    print("🚀 POC Day 1 - 测试 Parquet 数据读取")
    print("=" * 60)
    
    # 数据路径（分区存储）
    data_path = "/Volumes/work/zen/trading-analysis-platform/backend/storage/datasets/ES/ES/1s/dt=2022-12-15/**/*.parquet"
    
    print(f"\n📁 数据路径: {data_path}")
    
    try:
        # 创建 DuckDB 连接
        conn = duckdb.connect()
        print("✅ DuckDB 连接创建成功")
        
        # 读取 Parquet 数据
        print("\n📊 开始读取 Parquet 数据...")
        start_time = datetime.now()
        
        query = f"""
        SELECT *
        FROM read_parquet('{data_path}')
        ORDER BY timestamp
        LIMIT 10
        """
        
        df = conn.execute(query).fetchdf()
        
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"✅ 数据读取成功！耗时: {elapsed:.2f} 秒")
        
        # 显示数据信息
        print(f"\n📊 数据概览:")
        print(f"  - 行数: {len(df)}")
        print(f"  - 列数: {len(df.columns)}")
        print(f"  - 列名: {list(df.columns)}")
        
        print(f"\n📈 前 10 行数据:")
        print(df.to_string())
        
        # 测试获取完整数据集
        print(f"\n📊 统计完整数据集...")
        count_query = f"""
        SELECT COUNT(*) as total_rows
        FROM read_parquet('{data_path}')
        """
        total_rows = conn.execute(count_query).fetchone()[0]
        print(f"  - 总行数: {total_rows:,}")
        
        # 测试时间范围查询
        print(f"\n📊 测试时间范围查询...")
        range_query = f"""
        SELECT 
            MIN(timestamp) as start_time,
            MAX(timestamp) as end_time
        FROM read_parquet('{data_path}')
        """
        time_range = conn.execute(range_query).fetchone()
        print(f"  - 开始时间: {time_range[0]}")
        print(f"  - 结束时间: {time_range[1]}")
        
        print(f"\n✅ Parquet 数据读取测试通过！")
        return True
        
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        if 'conn' in locals():
            conn.close()
            print("\n🔒 DuckDB 连接已关闭")

if __name__ == "__main__":
    success = test_parquet_read()
    exit(0 if success else 1)

