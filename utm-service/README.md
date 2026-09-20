# utm-service — WGS84 UTM 投影正反算服务

基于 **Node.js 20 + Fastify** 的 WGS84 ↔ UTM（通用横轴墨卡托）双向换算后端。
纯计算、无状态、不落库，供各类采集端与绘图工具通过 HTTP 调用。

## 投影约定（实现内钉死）

| 项 | 约定 |
| --- | --- |
| 椭球 | WGS84（a = 6378137 m，1/f = 298.257223563） |
| 级数 | **Krüger n 级数 6 阶**（Karney 2011，与 EPSG GN7-2 方法 9807 同族），非球面近似 |
| 分带 | `n = floor((lon + 180) / 6) + 1`，中央经线 `λ0 = 3 + 6·(n−1) − 180`（度） |
| 中央经线比例因子 | k0 = 0.9996 |
| 假东 | 500000 m |
| 假北 | 北半球 0；南半球 +10000000 m |
| 纬度适用范围 | 84°N ~ 80°S |
| 收敛角符号 | 网格北相对真北的顺时针夹角（GeographicLib 约定），北半球中央经线以东为正 |

正算与反算共用同一套级数常数，往返闭合误差在 UTM 带内为纳米量级
（网格扫描实测最大约 7e-14°）。比例因子 k 与子午线收敛角 γ 由级数导数
严格推得，并经独立数值微分交叉验证。

## 快速开始

### 容器（一条命令构建并启动）

```bash
./run.sh                       # 等价于下面两行
# docker build -t utm-service .
# docker run --rm -p 3000:3000 utm-service
```

或使用 compose（可选，非必需）：`docker compose up --build`

服务监听 `0.0.0.0:3000`（可用 `PORT` 环境变量覆盖）。

### 本地

```bash
npm ci
npm start        # 启动服务
npm test         # 运行测试套件（node:test，45 个用例）
```

### 镜像内跑测试

```bash
docker build --target test -t utm-service:test .
docker run --rm utm-service:test
```

## API

### POST `/api/v1/utm/forward` — 正算：经纬度 → UTM

请求：

```json
{ "lat": 39.9042, "lon": 116.4074, "zone": 50 }
```

- `lat` ∈ [-80, 84]，`lon` ∈ [-180, 180]（必填）
- `zone` 1..60（可选）。若与自动分带不一致，**以指定带号为准**，
  响应中 `forcedZone: true` 明确标注跨带，绝不静默改带。

响应：

```json
{
  "input": { "lat": 39.9042, "lon": 116.4074 },
  "zone": 50,
  "autoZone": 50,
  "forcedZone": false,
  "centralMeridian": 117,
  "easting": 449345.06148325175,
  "northing": 4417292.494464589,
  "scale": 0.9996315880432426,
  "convergence": -0.38016444855183895,
  "hemisphere": "N"
}
```

### POST `/api/v1/utm/inverse` — 反算：UTM → 经纬度

请求：

```json
{ "zone": 50, "easting": 449345.0615, "northing": 4417292.4945, "hemisphere": "N" }
```

- `zone` 1..60、`easting` ∈ [100000, 900000]、`northing` ∈ [0, 10000000]（必填）
- `hemisphere`：`"N"` / `"S"`（可选，默认 `"N"`；南半球点必须显式传 `"S"`，
  因南北半球北坐标区间重叠，无法从坐标值唯一推断）
- 反算落点超出 UTM 纬度覆盖域时返回 `COORDINATES_OUT_OF_RANGE`

响应：`{ "input": {...}, "lat": 39.9042..., "lon": 116.4074, "zone": 50, "hemisphere": "N" }`

### GET `/api/v1/utm/zone?lon=116.4074` — 分带查询

响应：`{ "lon": 116.4074, "zone": 50, "centralMeridian": 117 }`

### GET `/api/v1/utm/sample` — 预置示范点（北京，UTM 50N 带）

返回示范点的正算结果与往返闭合自检误差，一调即可确认级数展开正确。

### GET `/health` — 健康检查

## 错误响应

所有非法输入返回 HTTP 400 与结构化错误体，`error.code` 按类型区分：

```json
{
  "error": {
    "code": "LATITUDE_OUT_OF_RANGE",
    "message": "lat: 纬度 lat 85 超出有效范围 [-80, 84]",
    "details": [{ "field": "lat", "code": "LATITUDE_OUT_OF_RANGE", "message": "..." }]
  }
}
```

| code | 含义 |
| --- | --- |
| `MISSING_FIELD` | 缺少必填字段 |
| `INVALID_TYPE` | 类型非法（字符串/NaN/Infinity 等） |
| `LATITUDE_OUT_OF_RANGE` | 纬度超出 [-80, 84] |
| `LONGITUDE_OUT_OF_RANGE` | 经度超出 [-180, 180] |
| `INVALID_ZONE` | 带号非 1..60 整数 |
| `EASTING_OUT_OF_RANGE` | 东坐标明显越界 |
| `NORTHING_OUT_OF_RANGE` | 北坐标明显越界 |
| `INVALID_HEMISPHERE` | 半球标识非法 |
| `COORDINATES_OUT_OF_RANGE` | 平面坐标映不回 UTM 有效覆盖域 |
| `BAD_REQUEST` | 请求体无法解析 |

## 目录结构

```
src/
  index.js            服务入口
  app.js              Fastify 应用与路由（无状态，纯函数组合）
  lib/
    ellipsoid.js      WGS84 常数 + Krüger α/β/δ 级数系数（6 阶）
    angles.js         全项目唯一的 度<->弧度 转换点
    zone.js           分带逻辑（带号 / 中央经线）
    meridian.js       子午线弧长（USGS e² 级数，独立交叉校验用）
    forward.js        正算级数（含 k、γ 解析式）
    inverse.js        反算级数
    validate.js       输入校验
    errors.js         结构化错误类型
test/                 node:test 测试套件
scripts/verify-math.js 开发期数学交叉验证脚本
```

## 测试覆盖

- **往返闭合**：全球网格 + 边界 + 强制跨带 + 2000 点模糊测试，容差 1e-9°
- **赤道中央经线基准**：E=500000、N=0、k=0.9996、γ=0
- **比例因子单调性**：随偏离中央经线距离增大而升高
- **南北半球配对**：N_south = 1e7 − N_north，东坐标一致
- **子午线弧长交叉验证**：中央经线 N = K0·M(φ)（USGS 独立级数）
- **外部参考值**：(0,0) → UTM 31N 东坐标 166021.4430805（PROJ 公认值）
- **差带识别**：相邻带东坐标偏差 >300 km、错带反算经度偏约 6°
- **非法输入**：纬度/经度/带号/平面坐标/半球/畸形 JSON 全部结构化报错
- **并发无串扰**：120 个并发请求逐一与串行结果比对
