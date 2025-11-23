#!/usr/bin/env python3
"""
Worker 注册脚本
向 Backend 注册一个 Worker 实例
"""
import requests
import json
import sys
import time
import platform
import psutil
from datetime import datetime

# Backend API 配置
BACKEND_URL = "http://localhost:3000/api/v1/internal/workers"

def get_system_info():
    """获取系统信息"""
    return {
        "hostname": platform.node(),
        "platform": platform.system(),
        "cpu_count": psutil.cpu_count(),
        "memory_total": psutil.virtual_memory().total,
        "python_version": platform.python_version(),
    }

def register_worker():
    """注册 Worker"""
    print("🚀 正在注册 Worker...")
    
    # 生成 Worker ID
    import uuid
    worker_id = str(uuid.uuid4())
    
    # Worker 配置（使用正确的 DTO 格式）
    worker_data = {
        "workerId": worker_id,
        "host": "localhost",
        "port": 50051,  # gRPC 端口（示例）
        "capabilities": {
            "maxConcurrentTasks": 2,
            "supportedStrategies": ["backtrader", "custom"]  # 支持的策略类型
        }
    }
    
    try:
        # 发送注册请求
        response = requests.post(
            f"{BACKEND_URL}/register",
            json=worker_data,
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        
        if response.status_code == 201:
            result = response.json()
            print(f"✅ Worker 注册成功!")
            print(f"   Worker ID: {worker_id}")
            print(f"   Host: {worker_data['host']}:{worker_data['port']}")
            print(f"   最大并发任务数: {worker_data['capabilities']['maxConcurrentTasks']}")
            print(f"\n📊 系统信息:")
            print(f"   CPU 核心数: {psutil.cpu_count()}")
            print(f"   内存: {round(psutil.virtual_memory().total / (1024**3), 2)} GB")
            print(f"   Python 版本: {platform.python_version()}")
            return worker_id
        else:
            print(f"❌ 注册失败: {response.status_code}")
            print(f"   响应: {response.text}")
            return None
            
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到 Backend 服务")
        print(f"   请确保 Backend 运行在 {BACKEND_URL}")
        return None
    except Exception as e:
        print(f"❌ 注册出错: {e}")
        return None

def send_heartbeat(worker_id):
    """发送心跳"""
    heartbeat_data = {
        "workerId": worker_id,
        "cpuUsage": psutil.cpu_percent(interval=0.1),
        "memoryUsage": psutil.virtual_memory().percent,
        "activeTasks": 0,
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/heartbeat",
            json=heartbeat_data,
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        
        if response.status_code == 200:
            return True
        else:
            print(f"⚠️  心跳失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"⚠️  心跳出错: {e}")
        return False

def keep_alive(worker_id):
    """保持 Worker 活跃"""
    print(f"\n💓 开始发送心跳 (每 30 秒)")
    print("   按 Ctrl+C 停止\n")
    
    heartbeat_count = 0
    
    try:
        while True:
            if send_heartbeat(worker_id):
                heartbeat_count += 1
                cpu = psutil.cpu_percent(interval=0.1)
                mem = psutil.virtual_memory().percent
                print(f"💓 心跳 #{heartbeat_count} - CPU: {cpu:.1f}% | 内存: {mem:.1f}% | 状态: 空闲")
            
            time.sleep(30)  # 每 30 秒发送一次心跳
            
    except KeyboardInterrupt:
        print("\n\n⏹️  停止心跳...")
        deregister_worker(worker_id)

def deregister_worker(worker_id):
    """注销 Worker"""
    print(f"👋 正在注销 Worker {worker_id}...")
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/deregister",
            json={
                "workerId": worker_id,
                "reason": "Manual shutdown"
            },
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        
        if response.status_code == 200:
            print("✅ Worker 注销成功")
        else:
            print(f"⚠️  注销失败: {response.status_code}")
            
    except Exception as e:
        print(f"⚠️  注销出错: {e}")

def main():
    """主函数"""
    print("═" * 60)
    print("   Backtest Worker 注册工具")
    print("═" * 60)
    
    # 检查 Backend 连接
    try:
        response = requests.get(f"{BACKEND_URL}", timeout=2)
        print(f"✅ Backend 连接正常 ({BACKEND_URL})\n")
    except:
        print(f"❌ 无法连接到 Backend ({BACKEND_URL})")
        print("   请先启动 Backend 服务: npm run start:dev\n")
        sys.exit(1)
    
    # 注册 Worker
    worker_id = register_worker()
    
    if worker_id:
        # 保持活跃（发送心跳）
        keep_alive(worker_id)
    else:
        print("\n❌ Worker 注册失败，退出")
        sys.exit(1)

if __name__ == "__main__":
    main()

