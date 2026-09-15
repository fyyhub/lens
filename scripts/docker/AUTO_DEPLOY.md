# Lens 自动部署

本目录的 `auto-deploy.sh` 面向 **fyyhub/lens** 这个仓库：默认拉取 CI 自动发布的镜像 `ghcr.io/fyyhub/lens:dev`，也支持直接从源码构建。

## 一、一行安装

```bash
curl -fsSL https://raw.githubusercontent.com/fyyhub/lens/dev/scripts/docker/auto-deploy.sh | bash
```

脚本会自动：

1. 检查/安装 Docker 与 Compose；
2. 在部署目录（root 为 `/opt/lens`，普通用户为 `~/lens`）生成 `.env`（含随机 `LENS_AUTH_SECRET_KEY`）与 `docker-compose.yml`；
3. 拉取镜像、启动容器（带健康检查与日志轮转）；
4. 等待服务就绪后打印访问地址与初始管理员密码。

自定义端口 / 目录 / 镜像：

```bash
curl -fsSL https://raw.githubusercontent.com/fyyhub/lens/dev/scripts/docker/auto-deploy.sh | bash -s -- install --port 8080 --dir /data/lens
# 国内服务器拉取 GHCR 慢时可走镜像站
bash auto-deploy.sh install --mirror ghcr.nju.edu.cn
# 不用 GHCR，直接从源码构建
bash auto-deploy.sh build --branch dev
```

## 二、日常运维

安装后脚本会自动复制到部署目录，之后在服务器任意位置执行：

| 操作 | 命令 |
| --- | --- |
| 更新到最新镜像（已是最新则不重启） | `bash /opt/lens/auto-deploy.sh update` |
| 切换到某个版本 | `bash /opt/lens/auto-deploy.sh update --tag v0.2.0` |
| 查看状态 / 日志 | `bash /opt/lens/auto-deploy.sh status` / `logs` |
| 重启 / 停止 | `bash /opt/lens/auto-deploy.sh restart` / `stop` |
| 查看初始密码 | `bash /opt/lens/auto-deploy.sh password` |
| 备份（SQLite 在线备份 + .env） | `bash /opt/lens/auto-deploy.sh backup` |
| 每天自动检查更新 | `bash /opt/lens/auto-deploy.sh schedule`（取消：`unschedule`） |
| 卸载（保留数据） | `bash /opt/lens/auto-deploy.sh uninstall`（加 `--purge` 删数据） |

> 若部署目录不是默认值，加 `--dir <目录>`。

## 三、推送即部署（GitHub Actions）

`.github/workflows/auto-deploy.yml` 会在 `dev` 分支的 CI 成功（镜像已推送到 GHCR）后，通过 SSH 登录服务器执行 `auto-deploy.sh update`，实现 **push → 构建镜像 → 服务器自动更新**。

在仓库 **Settings → Secrets and variables → Actions** 中配置：

| 类型 | 名称 | 说明 |
| --- | --- | --- |
| Variable | `AUTO_DEPLOY_ENABLED` | 设为 `true` 才会执行，作为总开关 |
| Variable | `DEPLOY_DIR` | 可选，默认 `/opt/lens` |
| Variable | `DEPLOY_PORT` | 可选，SSH 端口，默认 `22` |
| Secret | `DEPLOY_HOST` | 服务器 IP 或域名 |
| Secret | `DEPLOY_USER` | SSH 用户名（需能执行 `docker`） |
| Secret | `DEPLOY_SSH_KEY` | SSH 私钥，公钥放到服务器 `~/.ssh/authorized_keys` |

生成一对专用密钥：

```bash
ssh-keygen -t ed25519 -C "lens-deploy" -f lens_deploy_key -N ""
# lens_deploy_key.pub 追加到服务器 ~/.ssh/authorized_keys
# lens_deploy_key 的内容填入 Secret DEPLOY_SSH_KEY
```

配置完成后，也可以在 Actions 页面手动运行 “Auto Deploy”。

## 四、文件说明

```
/opt/lens/
├── .env                      # 端口、密钥、镜像、数据库连接
├── docker-compose.yml        # 由脚本管理；删除首行注释后脚本不再覆盖
├── docker-compose.build.yml  # 源码构建时叠加使用
├── auto-deploy.sh            # 脚本副本
├── data/                     # SQLite 数据库、admin-password
├── backups/                  # 备份文件（保留最近 14 份）与自动更新日志
└── src/                      # 仅源码构建模式存在
```
