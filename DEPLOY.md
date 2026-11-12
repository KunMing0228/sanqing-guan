# 部署与扩容

## 1. 本机（已完成）

```bash
cd sanqing-guan
node server/index.js          # http://localhost:8080
node tools/smoke.js           # 自检：语法 / 文件 / 端点
node tools/bench.js           # 200 人压测
```

不装任何包。想让同一 WiFi 的手机也进得来：本机防火墙放行 8080，
手机访问 `http://<本机局域网IP>:8080`。

---

## 2. 推到 GitHub

```bash
git init
git add .
git commit -m "三清观 v1.0"
git remote add origin https://github.com/<你的账号>/<仓库>.git
git push -u origin main
```

仓库里已备好 `.gitignore`、`README.md`、`LICENSE`、`THIRD_PARTY.md`、
`.github/workflows/`。把仓库地址给我，我也可以直接帮你推。

### GitHub Pages（静态预览，非多人版）

1. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
2. 已配好的 `.github/workflows/pages.yml` 会在 `public/**` 变更时自动发布。
3. 页面检测到 `github.io` 会直接进入**单人静修模式**：3D 殿、拜三清、跳跃、
   画符、诵经、表情全部可用；多人同屏、报方位、符箓墙张贴不可用，界面如实标注。

> Pages 无 Node 进程、无 WebSocket，这不是配置问题而是平台能力边界。
> 所有资源都用相对路径（`./vendor/...`），子路径部署不会丢文件。

### PaaS（要多人在线、又不想自己管服务器）

- **Railway**：导入仓库，自动识别 `railway.json` + `deploy/Dockerfile`，健康检查 `/healthz`。
- **Render**：导入仓库，自动识别 `render.yaml`（Blueprint）。
- 二者都支持 WebSocket 长连接。免费实例会冷启动，正式运营建议付费实例。
- 注意平台会给 `X-Forwarded-For`，但默认 `TRUST_PROXY=false` 不读它，
  方位会显示成平台机房所在地；如需真实访客方位，在平台控制台设 `TRUST_PROXY=true`，
  并确认平台会在边缘剥离伪造的 XFF。

---

## 3. 自有服务器（推荐，200 人在线）

前置：Linux + Docker + Docker Compose，域名已解析（国内需先完成 ICP 备案）。

```bash
# 服务器首次部署
git clone https://github.com/<你的账号>/<仓库>.git /opt/sanqing
cd /opt/sanqing
cp .env.example .env
# 按下面「环境变量」改 .env
docker compose up -d --build
docker compose ps
curl http://127.0.0.1/healthz
```

`docker-compose.yml` 起两个容器：`sanqing`（Node，8080）+ `nginx`（反代，80）。
Nginx 已配好 WebSocket Upgrade 与 3600s 读超时，长连接不会被 60s 默认超时掐断。

### HTTPS（正式上线必做）

```bash
# 服务器上用 certbot 签证书后，把 443 server 块加进 deploy/nginx.conf：
#   listen 443 ssl http2;
#   ssl_certificate     /etc/letsencrypt/live/<域名>/fullchain.pem;
#   ssl_certificate_key /etc/letsencrypt/live/<域名>/privkey.pem;
# 并把 80 端口整块改成 return 301 https://$host$request_uri;
# 证书文件通过 compose volumes 挂进 nginx 容器。
```

前端会自动用 `wss://`，无需改代码。

### push 后自动部署（可选）

在仓库 Settings → Secrets and variables → Actions 添加：

| Secret | 说明 |
|---|---|
| `SERVER_HOST` | 服务器 IP / 域名 |
| `SERVER_USER` | SSH 用户 |
| `SSH_PRIVATE_KEY` | 专用部署私钥 |
| `DEPLOY_PATH` | 服务器上的项目路径，如 `/opt/sanqing` |

之后每次 push 到 `main`，`.github/workflows/deploy.yml` 会 rsync 同步并
`docker compose up -d --build`，最后轮询 `/healthz` 确认就绪。

---

## 4. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `8080` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `TRUST_PROXY` | `false` | **默认完全不读 X-Forwarded-For**，防伪造国家省份。仅在确实有反代时设 `true` |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` | 额外可信直连 IP；开启 `TRUST_PROXY` 后，本机 / 私网直连一律视为可信反代（适配 Docker / K8s） |
| `GEO_ENABLED` | `true` | 设 `false` 可整体关闭方位解析与广播 |

**安全口径**：公网直连永远不信任 XFF。若把 Node 的 8080 直接暴露公网，
请不要开 `TRUST_PROXY`；正确做法是只让 Nginx 暴露 80/443，
并注释掉 `docker-compose.yml` 里的 `ports`，只留 `expose`。

自定义 IP 段：可放 `data/geoip.json`（已在 `.gitignore` 中，不会提交）：

```json
{
  "ranges": [
    ["1.2.3.0", "1.2.3.255", "中国", "广东省", "深圳市"]
  ]
}
```

---

## 5. 容量与扩容

当前单进程实测 200 人：P95 10ms、RSS 64.7MB、0 掉线，余量很大。

| 目标 | 做法 |
|---|---|
| 200 人 | 现状即可，4 殿 × 108 席 = 432 席 |
| 1000 人 | `server/config.js` 增加 `HALLS`、调 `MAX_CLIENTS`；建议上 2 核 1GB，Nginx 开 `worker_connections 4096` |
| 3000+ 人 | 多进程 + Redis 共享房间状态 + 按殿分片到不同实例，Nginx `ip_hash` 或一致性哈希；此时才需要换架构 |
| 降负载 | 客户端设置里开「省电」画质；`TICK_MS` 100 → 150；`SNAPSHOT_MS` 5000 → 10000 |

前端也有保护：只渲染同殿玩家、按相机距离做 3 级 LOD、低画质关粒子与香烟、
`devicePixelRatio` 上限 2。

---

## 6. 监控与验收

```bash
curl http://<域名>/healthz     # ok / 在线数 / 各殿人数 / 峰值 / 内存 / IP 库状态
curl http://<域名>/metrics     # Prometheus 文本，可接 Grafana
curl http://<域名>/api/halls   # 殿列表与人数
node tools/bench.js            # 压测（在能连到服务器的机器上跑，设 HOST/PORT）
```

上线后建议手点一遍：

- [ ] 两个浏览器窗口能互相看到对方走动 / 叩拜 / 跳跃 / 表情气泡
- [ ] 道士 / 道姑切换后，另一窗口立刻变样
- [ ] 点「报方位」才出现地名，且只到城市级
- [ ] 画符能落笔、盖印、导出、张贴，另一窗口能看到
- [ ] 刷新页面席位不重叠，关掉一个窗口席位被释放
- [ ] 手机 375px 宽度下底部 8 个按钮不溢出
- [ ] 断网 / 停服后页面进入单人静修而不是白屏
- [ ] `/healthz` 的 online 与实际连接数一致

---

## 7. 合规与风险提示

- 国内服务器需 **ICP 备案**；域名未备案不要绑定 80/443。
- 宗教题材内容需按平台规则审核。本项目定位为**传统文化沉浸式体验，非宗教活动**，
  不收费、不占卜、不募捐、不传教、不宣称功效；请勿改成在线祈福付费或算命产品。
- 诵经音轨、字体、3D 模型的授权由部署方自行负责（见 `public/audio/README.md`、
  `THIRD_PARTY.md`）。
- 本项目只复刻玩法机制，不含韩国原作《山寺》的任何代码与素材。
- 备案、审核、证书签发属外部流程，本项目只提供配置与风险提示，不做承诺。

---

## 8. 故障排查

| 现象 | 检查 |
|---|---|
| 打开是白屏 | 浏览器是否支持 WebGL；看控制台；`?preview=1` 自检 |
| 一直「连接断开，正在重连」 | Nginx 是否配了 `Upgrade` / `Connection` 头；`proxy_read_timeout` 是否够长 |
| 多人看不到别人 | `/healthz` 的 online 是否 >1；是否连到了不同殿 |
| 方位显示「未知地域」 | `data/ip2region_v4.xdb` 是否随镜像 COPY 进去；`/healthz` 的 `geo.loaded` |
| 方位显示成机房所在地 | 开了 `TRUST_PROXY` 却没有正确反代，或反代没传 XFF |
| 诵经没声音 | 是否点了「入观」解锁音频；`public/audio/qingjingjing.mp3` 是否存在；浏览器标签是否被静音 |
| 手机卡顿 | 设置里切「省电」画质；确认没有同时开很多标签 |


---

## 9. 更新已部署的 GitHub 仓库

v1.1 之后代码有改动时，用同一个脚本重新推送即可（会更新 `main` 与 `gh-pages` 两个分支）：

```bash
GITHUB_TOKEN=<你的 token> python tools/deploy_github.py
```

token 只从环境变量读，不写进项目文件。本机 Git 走 Windows schannel 时被代理 TLS
中转挡住属已知情况，用这个脚本（Python urllib，仅对 api.github.com 关闭证书校验）更省事。
Pages 用 `gh-pages` 分支的「分支模式」，推完约 1~2 分钟生效，不依赖 Actions。
