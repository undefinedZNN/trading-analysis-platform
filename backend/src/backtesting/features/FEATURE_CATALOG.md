# 技术指标特征目录

本文档列出了常见的技术指标特征，供选择性实现。

---

## 📊 已实现的特征

- ✅ **MA** (Moving Average) - 简单移动平均
- ✅ **EMA** (Exponential Moving Average) - 指数移动平均

---

## 🎯 计划实现的特征

### 用户指定特征
- [ ] **RSI** (Relative Strength Index) - 相对强弱指标
- [ ] **ATR** (Average True Range) - 平均真实波动
- [ ] **IBS** (Internal Bar Strength) - 内部柱强度
- [ ] **Overlap** - K线重叠度
- [ ] **ADX** (Average Directional Index) - 平均趋向指标
- [ ] **DMI** (Directional Movement Index) - 趋向运动指标

---

## 📚 其他常见技术指标

### 1. 趋势类指标 (Trend Indicators)

#### 移动平均类
- **SMA** (Simple Moving Average) - 简单移动平均 [已有MA]
- **EMA** (Exponential Moving Average) - 指数移动平均 [已实现]
- **WMA** (Weighted Moving Average) - 加权移动平均
- **DEMA** (Double EMA) - 双重指数移动平均
- **TEMA** (Triple EMA) - 三重指数移动平均
- **HMA** (Hull Moving Average) - 赫尔移动平均
- **KAMA** (Kaufman Adaptive MA) - 考夫曼自适应移动平均
- **VWMA** (Volume Weighted MA) - 成交量加权移动平均

#### 趋势线
- **MACD** (Moving Average Convergence Divergence) - 指数平滑异同移动平均线
  - MACD Line
  - Signal Line
  - MACD Histogram
- **ADX** (Average Directional Index) - 平均趋向指标 [用户指定]
- **DMI** (Directional Movement Index) - 趋向运动指标 [用户指定]
  - +DI (Positive Directional Indicator)
  - -DI (Negative Directional Indicator)
- **Aroon** - 阿隆指标
  - Aroon Up
  - Aroon Down
  - Aroon Oscillator
- **Parabolic SAR** - 抛物线转向指标
- **Supertrend** - 超级趋势指标
- **Ichimoku Cloud** - 一目均衡表
  - Tenkan-sen (转换线)
  - Kijun-sen (基准线)
  - Senkou Span A/B (先行带A/B)
  - Chikou Span (迟行带)

### 2. 动量类指标 (Momentum Indicators)

#### 摆动指标
- **RSI** (Relative Strength Index) - 相对强弱指标 [用户指定]
- **Stochastic** - 随机指标
  - %K (Fast Stochastic)
  - %D (Slow Stochastic)
- **Williams %R** - 威廉指标
- **CCI** (Commodity Channel Index) - 商品通道指数
- **MFI** (Money Flow Index) - 资金流量指标
- **ROC** (Rate of Change) - 变动率指标
- **Momentum** - 动量指标
- **TSI** (True Strength Index) - 真实强度指标
- **KDJ** - KDJ指标（中国常用）
  - K值
  - D值
  - J值

#### 成交量动量
- **OBV** (On Balance Volume) - 能量潮
- **CMF** (Chaikin Money Flow) - 蔡金资金流量
- **ADL** (Accumulation/Distribution Line) - 累积/派发线
- **VWAP** (Volume Weighted Average Price) - 成交量加权平均价
- **PVT** (Price Volume Trend) - 价量趋势

### 3. 波动率指标 (Volatility Indicators)

- **ATR** (Average True Range) - 平均真实波动 [用户指定]
- **Bollinger Bands** - 布林带
  - Upper Band
  - Middle Band (SMA)
  - Lower Band
  - %B (Bollinger %B)
  - Bandwidth
- **Keltner Channels** - 肯特纳通道
- **Donchian Channels** - 唐奇安通道
- **Standard Deviation** - 标准差
- **Historical Volatility** - 历史波动率
- **Choppiness Index** - 震荡指数

### 4. 支撑/阻力指标 (Support/Resistance)

- **Pivot Points** - 枢轴点
  - Standard Pivot
  - Fibonacci Pivot
  - Camarilla Pivot
  - Woodie Pivot
- **Fibonacci Retracement** - 斐波那契回撤
- **Support/Resistance Levels** - 支撑阻力位
- **Price Channels** - 价格通道

### 5. 成交量指标 (Volume Indicators)

- **Volume** - 成交量
- **Volume MA** - 成交量移动平均
- **Volume Profile** - 成交量分布
- **VPVR** (Volume Profile Visible Range) - 可见范围成交量分布
- **Ease of Movement** - 简易波动指标
- **Negative Volume Index** - 负成交量指数
- **Positive Volume Index** - 正成交量指数

### 6. 市场广度指标 (Market Breadth)

- **Advance/Decline Line** - 涨跌线
- **Advance/Decline Ratio** - 涨跌比率
- **McClellan Oscillator** - 麦克莱伦摆动指标
- **TRIN** (Arms Index) - 阿姆氏指标

### 7. 价格形态指标 (Price Pattern Indicators)

- **IBS** (Internal Bar Strength) - 内部柱强度 [用户指定]
- **Overlap** - K线重叠度 [用户指定]
- **Candle Patterns** - K线形态识别
  - Doji
  - Hammer
  - Shooting Star
  - Engulfing
  - Harami
  - etc.
- **Chart Patterns** - 图表形态识别
  - Head and Shoulders
  - Double Top/Bottom
  - Triangle
  - Flag/Pennant

### 8. 自定义/特殊指标

#### 价差/比率
- **Price Spread** - 价差
- **Price Ratio** - 价格比率
- **Beta** - 贝塔系数
- **Correlation** - 相关系数

#### 统计指标
- **Z-Score** - 标准分数
- **Percentile Rank** - 百分位排名
- **Regression** - 回归分析
- **R-Squared** - R平方

#### 时间序列
- **Lag** - 滞后值
- **Lead** - 超前值
- **Returns** - 收益率
- **Log Returns** - 对数收益率

#### 波段/周期
- **Hilbert Transform** - 希尔伯特变换
- **Cycle Period** - 周期长度
- **Dominant Cycle Phase** - 主导周期相位

---

## 🎯 推荐实现优先级

### 高优先级（最常用）✨
1. **RSI** - 相对强弱指标
2. **MACD** - 指数平滑异同移动平均线
3. **Bollinger Bands** - 布林带
4. **ATR** - 平均真实波动
5. **Stochastic** - 随机指标
6. **ADX/DMI** - 趋向指标

### 中优先级（常用）⭐
7. **OBV** - 能量潮
8. **VWAP** - 成交量加权平均价
9. **Williams %R** - 威廉指标
10. **CCI** - 商品通道指数
11. **Parabolic SAR** - 抛物线转向
12. **IBS** - 内部柱强度
13. **Overlap** - K线重叠度

### 低优先级（专业）💡
14. **Ichimoku Cloud** - 一目均衡表
15. **KDJ** - KDJ指标
16. **Supertrend** - 超级趋势
17. **Pivot Points** - 枢轴点
18. **Z-Score** - 标准分数

---

## 📋 实现建议

### 第一批（基础指标）
- MA ✅
- EMA ✅
- RSI
- MACD
- Bollinger Bands
- ATR

### 第二批（动量指标）
- Stochastic
- Williams %R
- CCI
- ADX/DMI
- IBS
- Overlap

### 第三批（成交量指标）
- OBV
- VWAP
- CMF
- MFI

### 第四批（高级指标）
- Ichimoku Cloud
- Parabolic SAR
- KDJ
- Supertrend

---

## 🔧 技术考虑

### 计算复杂度
- **简单**: MA, EMA, IBS
- **中等**: RSI, ATR, Stochastic, Bollinger Bands
- **复杂**: MACD, ADX/DMI, Ichimoku Cloud

### 状态维护
- **无状态**: IBS（单bar计算）
- **滚动窗口**: MA, EMA, RSI, ATR
- **多状态**: MACD（需要多个EMA）, ADX（需要多个中间值）

### 精度要求
- **高精度**: 所有价格相关指标（使用big.js）
- **标准精度**: 比率类指标（如RSI, %R）

---

## 📊 使用统计（供参考）

根据常见交易平台的使用频率：

| 指标 | 使用频率 | 难度 |
|------|---------|------|
| MA/EMA | ⭐⭐⭐⭐⭐ | 简单 |
| RSI | ⭐⭐⭐⭐⭐ | 中等 |
| MACD | ⭐⭐⭐⭐⭐ | 中等 |
| Bollinger Bands | ⭐⭐⭐⭐ | 中等 |
| Stochastic | ⭐⭐⭐⭐ | 中等 |
| ATR | ⭐⭐⭐⭐ | 中等 |
| ADX | ⭐⭐⭐ | 复杂 |
| VWAP | ⭐⭐⭐⭐ | 简单 |
| OBV | ⭐⭐⭐ | 简单 |
| Williams %R | ⭐⭐⭐ | 简单 |

---

## 💡 实现建议

### 立即实现（用户指定 + 高频使用）
1. ✅ MA, EMA (已完成)
2. **RSI** - 使用频率最高
3. **ATR** - 波动率基础
4. **IBS** - 简单易实现
5. **Overlap** - 自定义指标
6. **ADX/DMI** - 趋势强度
7. **MACD** - 最常用的趋势指标
8. **Bollinger Bands** - 波动率通道

### 后续扩展
- Stochastic, Williams %R, CCI
- OBV, VWAP, CMF
- Ichimoku, Parabolic SAR, KDJ

---

**您想要实现哪些指标？我建议按以下顺序：**

1. **立即实现**: RSI, ATR, IBS, Overlap, ADX, DMI（用户指定的6个）
2. **第二批**: MACD, Bollinger Bands（最常用）
3. **第三批**: Stochastic, Williams %R, OBV, VWAP

**准备好开始实现了吗？** 🚀

