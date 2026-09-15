#!/usr/bin/env bash
# =============================================================================
#  Lens 一键自动部署脚本（fyyhub/lens）
#
#  一行安装（root 默认安装到 /opt/lens，普通用户安装到 ~/lens）：
#    curl -fsSL https://raw.githubusercontent.com/fyyhub/lens/dev/scripts/docker/auto-deploy.sh | bash
#
#  已下载脚本时：
#    bash auto-deploy.sh [命令] [选项]
#
#  命令：
#    install     安装并启动（默认）。可重复执行，不会覆盖已有 .env / data
#    update      拉取最新镜像并重启（源码模式下会 git pull 并重新构建）；已是最新则不动
#    build       从你的 GitHub 仓库源码构建镜像并启动（不依赖 GHCR）
#    status      查看容器状态、镜像信息、健康检查与最近日志
#    logs        实时查看日志
#    restart     重启服务
#    stop        停止服务
#    password    显示初始管理员密码
#    backup      备份数据库（SQLite 在线备份）与 .env 到 backups/
#    schedule    安装每日自动更新的定时任务（cron）
#    unschedule  移除定时任务
#    uninstall   停止并删除容器（加 --purge 同时删除数据）
#
#  选项：
#    --dir DIR         部署目录（默认 /opt/lens 或 ~/lens，可用环境变量 LENS_DIR）
#    --port PORT       服务端口（默认 3000）
#    --tag TAG         镜像标签（默认 dev；发布 Release 后可用 latest / v0.x.x）
#    --image IMAGE     镜像名（默认 ghcr.io/fyyhub/lens）
#    --mirror HOST     国内加速前缀，例如 --mirror ghcr.nju.edu.cn
#    --branch BRANCH   源码模式使用的分支（默认 dev）
#    --no-pull         启动前不拉取镜像
#    --no-wait         启动后不等待健康检查
#    --yes / -y        非交互模式，自动确认（含自动安装 Docker）
#    --purge           uninstall 时同时删除 data/ 与 .env
#    -h, --help        显示帮助
#
#  示例：
#    bash auto-deploy.sh install --port 8080
#    bash auto-deploy.sh update
#    bash auto-deploy.sh build --branch dev
#    bash auto-deploy.sh install --mirror ghcr.nju.edu.cn
# =============================================================================
set -Eeuo pipefail

# ---------- 默认配置（可通过环境变量覆盖） ----------
REPO_OWNER="${LENS_REPO_OWNER:-fyyhub}"
REPO_NAME="${LENS_REPO_NAME:-lens}"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
BRANCH="${LENS_BRANCH:-dev}"
IMAGE="${LENS_IMAGE_NAME:-ghcr.io/${REPO_OWNER}/${REPO_NAME}}"
TAG="${LENS_IMAGE_TAG:-dev}"
PORT="${LENS_PORT:-}"
MIRROR=""
CONTAINER_NAME="${LENS_CONTAINER_NAME:-lens}"
HEALTH_PATH="/api/public/branding"

DO_PULL=1
DO_WAIT=1
ASSUME_YES=0
PURGE=0
IMAGE_EXPLICIT=0
CMD="install"

if [ -n "${LENS_DIR:-}" ]; then
  DEPLOY_DIR="$LENS_DIR"
elif [ "$(id -u)" -eq 0 ]; then
  DEPLOY_DIR="/opt/lens"
else
  DEPLOY_DIR="$HOME/lens"
fi

# ---------- 输出工具 ----------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_INFO=$'\033[36m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_BOLD=$'\033[1m'
else
  C_RESET=""; C_INFO=""; C_OK=""; C_WARN=""; C_ERR=""; C_BOLD=""
fi
info() { printf '%s[INFO]%s %s\n' "$C_INFO" "$C_RESET" "$*"; }
ok()   { printf '%s[ OK ]%s %s\n' "$C_OK" "$C_RESET" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$C_WARN" "$C_RESET" "$*" >&2; }
die()  { printf '%s[FAIL]%s %s\n' "$C_ERR" "$C_RESET" "$*" >&2; exit 1; }
trap 'printf "%s[FAIL]%s 第 %s 行命令执行失败，已中止。\n" "$C_ERR" "$C_RESET" "$LINENO" >&2' ERR

usage() {
  if [ -f "$0" ]; then
    awk 'NR>2 && /^# ====/ {exit} NR>2 {sub(/^#  ?/, ""); sub(/^#$/, ""); print}' "$0"
  else
    echo "用法: bash auto-deploy.sh [install|update|build|status|logs|restart|stop|password|backup|schedule|unschedule|uninstall] [选项]"
  fi
}

confirm() {
  # confirm "提示"：--yes 或无终端时直接通过
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ -r /dev/tty ] || return 0
  local reply
  printf '%s [y/N] ' "$1"
  read -r reply </dev/tty || reply=""
  case "$reply" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# ---------- 参数解析 ----------
need_arg() { [ $# -ge 2 ] || die "选项 $1 需要一个参数"; }
parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      install|update|build|status|logs|restart|stop|password|backup|schedule|unschedule|uninstall) CMD="$1" ;;
      --dir)      need_arg "$@"; DEPLOY_DIR="$2"; shift ;;
      --dir=*)    DEPLOY_DIR="${1#*=}" ;;
      --port)     need_arg "$@"; PORT="$2"; shift ;;
      --port=*)   PORT="${1#*=}" ;;
      --tag)      need_arg "$@"; TAG="$2"; IMAGE_EXPLICIT=1; shift ;;
      --tag=*)    TAG="${1#*=}"; IMAGE_EXPLICIT=1 ;;
      --image)    need_arg "$@"; IMAGE="$2"; IMAGE_EXPLICIT=1; shift ;;
      --image=*)  IMAGE="${1#*=}"; IMAGE_EXPLICIT=1 ;;
      --mirror)   need_arg "$@"; MIRROR="$2"; IMAGE_EXPLICIT=1; shift ;;
      --mirror=*) MIRROR="${1#*=}"; IMAGE_EXPLICIT=1 ;;
      --branch)   need_arg "$@"; BRANCH="$2"; shift ;;
      --branch=*) BRANCH="${1#*=}" ;;
      --no-pull)  DO_PULL=0 ;;
      --no-wait)  DO_WAIT=0 ;;
      -y|--yes)   ASSUME_YES=1 ;;
      --purge)    PURGE=1 ;;
      -h|--help)  usage; exit 0 ;;
      *) die "未知参数: $1（使用 --help 查看帮助）" ;;
    esac
    shift
  done
  if [ -n "$MIRROR" ]; then
    IMAGE="${MIRROR%/}/${REPO_OWNER}/${REPO_NAME}"
  fi
  if [ -n "$PORT" ] && ! printf '%s' "$PORT" | grep -Eq '^[0-9]{1,5}$'; then
    die "端口无效: $PORT"
  fi
  DEPLOY_DIR="${DEPLOY_DIR%/}"
}

# ---------- 环境检查 ----------
need_cmd() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
maybe_sudo() {
  if [ "$(id -u)" -ne 0 ] && need_cmd sudo; then SUDO="sudo"; fi
}

install_docker() {
  info "未检测到 Docker，准备自动安装（官方脚本 get.docker.com）..."
  confirm "现在安装 Docker？" || die "需要 Docker 才能继续。"
  maybe_sudo
  if need_cmd curl; then
    curl -fsSL https://get.docker.com | $SUDO sh
  elif need_cmd wget; then
    wget -qO- https://get.docker.com | $SUDO sh
  else
    die "需要 curl 或 wget 来下载 Docker 安装脚本。"
  fi
  $SUDO systemctl enable --now docker >/dev/null 2>&1 || true
  ok "Docker 安装完成。"
}

COMPOSE=""
check_docker() {
  need_cmd docker || install_docker
  if ! docker info >/dev/null 2>&1; then
    maybe_sudo
    if [ -n "$SUDO" ] && $SUDO docker info >/dev/null 2>&1; then
      warn "当前用户无 Docker 权限，将通过 sudo 执行 docker 命令。"
      docker() { sudo docker "$@"; }
    else
      die "Docker 守护进程未运行或无权限访问，请先执行: sudo systemctl start docker"
    fi
  fi
  if docker compose version >/dev/null 2>&1; then
    COMPOSE="docker compose"
  elif need_cmd docker-compose; then
    COMPOSE="docker-compose"
    warn "检测到旧版 docker-compose，建议升级到 Docker Compose v2。"
  else
    die "未找到 Docker Compose，请安装 docker-compose-plugin。"
  fi
}

compose() {
  # shellcheck disable=SC2086
  (cd "$DEPLOY_DIR" && $COMPOSE "$@")
}

is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || echo false)" = "true" ]
}

# ---------- 配置文件 ----------
gen_secret() {
  if need_cmd openssl; then
    openssl rand -hex 32
  else
    od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
  fi
}

# set_env KEY VALUE：写入/更新 .env 中的一项
set_env() {
  local key="$1" value="$2" file="$DEPLOY_DIR/.env"
  if grep -Eq "^${key}=" "$file" 2>/dev/null; then
    local tmp
    tmp="$(mktemp "$DEPLOY_DIR/.env.tmp.XXXXXX")"
    sed "s|^${key}=.*|${key}=${value}|" "$file" >"$tmp"
    mv "$tmp" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >>"$file"
  fi
}

get_env() {
  local key="$1" file="$DEPLOY_DIR/.env"
  [ -f "$file" ] || return 0
  { grep -E "^${key}=" "$file" || true; } | tail -n1 | cut -d= -f2- | tr -d '\r'
}

write_env() {
  local file="$DEPLOY_DIR/.env"
  umask 077
  if [ ! -f "$file" ]; then
    info "生成 .env（含随机 LENS_AUTH_SECRET_KEY）..."
    cat >"$file" <<EOF
# Lens 运行配置（由 auto-deploy.sh 生成，可手动修改）
LENS_PORT=${PORT:-3000}
LENS_AUTH_SECRET_KEY=$(gen_secret)
LENS_IMAGE=${IMAGE}:${TAG}
# 数据库：默认 SQLite；生产/高并发建议 PostgreSQL
# LENS_DATABASE_URL=sqlite+aiosqlite:////app/data/data.db
# LENS_DATABASE_URL=postgresql+psycopg://lens:password@postgresql:5432/lens
# 容器启动时跳过自动数据库迁移（默认 0）
# LENS_SKIP_DB_UPGRADE=0
EOF
  else
    info "检测到已有 .env，保留现有配置。"
    local secret
    secret="$(get_env LENS_AUTH_SECRET_KEY)"
    if [ -z "$secret" ]; then
      warn "LENS_AUTH_SECRET_KEY 为空，已自动生成。"
      set_env LENS_AUTH_SECRET_KEY "$(gen_secret)"
    elif ! printf '%s' "$secret" | grep -Eq '^[0-9a-f]{64}$'; then
      warn "LENS_AUTH_SECRET_KEY 不是 64 位十六进制，若启动失败请检查此项。"
    fi
    if [ -n "$PORT" ]; then set_env LENS_PORT "$PORT"; fi
    if [ -z "$(get_env LENS_PORT)" ]; then set_env LENS_PORT 3000; fi
    if [ -z "$(get_env LENS_IMAGE)" ] || [ "$IMAGE_EXPLICIT" -eq 1 ]; then
      set_env LENS_IMAGE "${IMAGE}:${TAG}"
    fi
  fi
  chmod 600 "$file"
}

COMPOSE_MARK="# managed-by: lens auto-deploy.sh（删除此行后脚本将不再覆盖本文件）"
write_compose() {
  local file="$DEPLOY_DIR/docker-compose.yml"
  if [ -f "$file" ] && ! head -n1 "$file" | grep -qF "managed-by: lens auto-deploy.sh"; then
    info "检测到自定义 docker-compose.yml，保持不变。"
  else
    cat >"$file" <<EOF
${COMPOSE_MARK}
services:
  app:
    image: \${LENS_IMAGE:-${IMAGE}:${TAG}}
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "\${LENS_PORT:-3000}:\${LENS_PORT:-3000}"
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "python3", "-c", "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s${HEALTH_PATH}' % os.environ.get('LENS_PORT','3000'), timeout=5)"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
EOF
  fi
  cat >"$DEPLOY_DIR/docker-compose.build.yml" <<EOF
${COMPOSE_MARK}
# 源码构建覆盖文件：bash auto-deploy.sh build
services:
  app:
    image: ${REPO_NAME}:local
    build:
      context: ./src
      dockerfile: Dockerfile
EOF
}

prepare_dir() {
  mkdir -p "$DEPLOY_DIR/data" "$DEPLOY_DIR/backups"
  write_env
  write_compose
}

is_build_mode() { [ -f "$DEPLOY_DIR/.build-mode" ]; }

# ---------- 运行控制 ----------
current_port() { local p; p="$(get_env LENS_PORT)"; printf '%s' "${p:-3000}"; }
current_image() { local i; i="$(get_env LENS_IMAGE)"; printf '%s' "${i:-${IMAGE}:${TAG}}"; }

# 返回 0=通过 1=失败 2=本机无 curl/wget
http_ok() {
  local url="$1"
  if need_cmd curl; then
    curl -fsS -m 5 -o /dev/null "$url"
  elif need_cmd wget; then
    wget -q -T 5 -O /dev/null "$url"
  else
    return 2
  fi
}

wait_ready() {
  [ "$DO_WAIT" -eq 1 ] || return 0
  local port url i rc
  port="$(current_port)"
  url="http://127.0.0.1:${port}${HEALTH_PATH}"
  info "等待服务就绪: $url"
  for i in $(seq 1 60); do
    rc=0; http_ok "$url" || rc=$?
    if [ "$rc" -eq 0 ]; then
      ok "服务已就绪（约 $((i * 2)) 秒）。"
      return 0
    fi
    if [ "$rc" -eq 2 ]; then
      warn "本机没有 curl/wget，跳过健康检查。"
      return 0
    fi
    if [ "$i" -gt 5 ] && ! is_running; then
      warn "容器未处于运行状态，最近日志如下："
      compose logs --tail 50 app || true
      die "启动失败，请根据日志排查。"
    fi
    sleep 2
  done
  warn "等待 120 秒后服务仍未就绪，最近日志如下："
  compose logs --tail 50 app || true
  die "健康检查超时。"
}

show_admin_password() {
  local pw_file="$DEPLOY_DIR/data/admin-password" pw=""
  if [ -r "$pw_file" ]; then
    pw="$(cat "$pw_file")"
  elif is_running; then
    pw="$(compose exec -T app sh -c 'cat /app/data/admin-password 2>/dev/null' || true)"
  fi
  if [ -n "$pw" ]; then
    printf '\n%s初始管理员账号%s\n' "$C_BOLD" "$C_RESET"
    printf '  用户名: admin\n  密  码: %s\n' "$pw"
    printf '  %s登录后请立即修改密码，并删除文件 %s%s\n' "$C_WARN" "$pw_file" "$C_RESET"
  else
    info "未找到 admin-password（可能已删除或管理员已存在）。"
  fi
}

server_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
  printf '%s' "${ip:-127.0.0.1}"
}

print_summary() {
  local port; port="$(current_port)"
  printf '\n%s================ Lens 部署完成 ================%s\n' "$C_OK" "$C_RESET"
  printf '  部署目录: %s\n' "$DEPLOY_DIR"
  if is_build_mode; then
    printf '  运行方式: 源码构建（分支 %s）\n' "$(cat "$DEPLOY_DIR/.build-mode")"
  else
    printf '  镜像    : %s\n' "$(current_image)"
  fi
  printf '  访问地址: http://%s:%s\n' "$(server_ip)" "$port"
  show_admin_password
  printf '\n常用命令：\n'
  printf '  更新: bash %s update --dir %s\n' "$SCRIPT_SELF" "$DEPLOY_DIR"
  printf '  日志: bash %s logs --dir %s\n' "$SCRIPT_SELF" "$DEPLOY_DIR"
  printf '  状态: bash %s status --dir %s\n' "$SCRIPT_SELF" "$DEPLOY_DIR"
  printf '  备份: bash %s backup --dir %s\n' "$SCRIPT_SELF" "$DEPLOY_DIR"
  printf '  自动更新: bash %s schedule --dir %s\n' "$SCRIPT_SELF" "$DEPLOY_DIR"
  printf '%s===============================================%s\n\n' "$C_OK" "$C_RESET"
}

# 把脚本自身留一份在部署目录，方便后续 update/logs 等操作
persist_self() {
  local target="$DEPLOY_DIR/auto-deploy.sh" self=""
  if [ -f "$0" ]; then
    self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  fi
  if [ -n "$self" ]; then
    if [ "$self" != "$target" ]; then cp "$self" "$target"; fi
  elif need_cmd curl; then
    curl -fsSL "https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/scripts/docker/auto-deploy.sh" -o "$target" 2>/dev/null || true
  fi
  [ -f "$target" ] && chmod +x "$target" || true
  SCRIPT_SELF="$target"
}

# ---------- 子命令 ----------
cmd_install() {
  check_docker
  info "部署目录: $DEPLOY_DIR"
  prepare_dir
  persist_self
  rm -f "$DEPLOY_DIR/.build-mode"
  if [ "$DO_PULL" -eq 1 ]; then
    info "拉取镜像 $(current_image) ..."
    compose pull app
  fi
  info "启动服务..."
  compose up -d --remove-orphans
  wait_ready
  print_summary
}

cmd_build() {
  check_docker
  need_cmd git || die "源码构建需要 git，请先安装。"
  info "部署目录: $DEPLOY_DIR（源码构建模式，分支 ${BRANCH}）"
  prepare_dir
  persist_self
  local src="$DEPLOY_DIR/src"
  if [ -d "$src/.git" ]; then
    info "更新源码..."
    git -C "$src" fetch --depth 1 origin "$BRANCH"
    git -C "$src" checkout -q -B "$BRANCH" FETCH_HEAD
  else
    info "克隆源码 $REPO_URL ($BRANCH)..."
    rm -rf "$src"
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$src"
  fi
  info "源码版本: $(git -C "$src" rev-parse --short HEAD)"
  printf '%s\n' "$BRANCH" >"$DEPLOY_DIR/.build-mode"
  info "构建镜像并启动（首次构建需要几分钟）..."
  compose -f docker-compose.yml -f docker-compose.build.yml up -d --build --remove-orphans
  wait_ready
  docker image prune -f >/dev/null 2>&1 || true
  print_summary
}

cmd_update() {
  check_docker
  [ -f "$DEPLOY_DIR/.env" ] || die "未找到 $DEPLOY_DIR/.env，请先执行 install。"
  if is_build_mode; then
    BRANCH="$(cat "$DEPLOY_DIR/.build-mode")"
    info "源码构建模式：拉取最新代码并重新构建..."
    cmd_build
    return 0
  fi
  if [ "$IMAGE_EXPLICIT" -eq 1 ]; then set_env LENS_IMAGE "${IMAGE}:${TAG}"; fi
  write_compose
  local img before after
  img="$(current_image)"
  before="$(docker image inspect --format '{{.Id}}' "$img" 2>/dev/null || true)"
  info "拉取最新镜像 $img ..."
  compose pull app
  after="$(docker image inspect --format '{{.Id}}' "$img" 2>/dev/null || true)"
  if [ -n "$before" ] && [ "$before" = "$after" ] && is_running; then
    ok "已是最新版本（$img），无需重启。"
    return 0
  fi
  info "应用新镜像并重启..."
  compose up -d --remove-orphans
  wait_ready
  docker image prune -f >/dev/null 2>&1 || true
  ok "更新完成，当前镜像: $img"
}

cmd_status() {
  check_docker
  compose ps
  local img port; img="$(current_image)"; port="$(current_port)"
  printf '\n镜像: %s\n' "$img"
  docker image inspect --format '  ID: {{.Id}}{{println}}  创建: {{.Created}}{{println}}  提交: {{index .Config.Labels "org.opencontainers.image.revision"}}' "$img" 2>/dev/null || true
  if is_running && http_ok "http://127.0.0.1:${port}${HEALTH_PATH}" 2>/dev/null; then
    ok "健康检查通过: http://127.0.0.1:${port}"
  else
    warn "健康检查未通过: http://127.0.0.1:${port}${HEALTH_PATH}"
  fi
  printf '\n最近日志：\n'
  compose logs --tail 20 app || true
}

cmd_logs()     { check_docker; compose logs -f --tail 200 app; }
cmd_restart()  { check_docker; compose restart app; wait_ready; ok "已重启。"; }
cmd_stop()     { check_docker; compose stop app; ok "已停止。"; }
cmd_password() { check_docker; show_admin_password; }

cmd_backup() {
  check_docker
  local ts out tmp db_url
  ts="$(date +%Y%m%d-%H%M%S)"
  out="$DEPLOY_DIR/backups/lens-backup-${ts}.tar.gz"
  tmp="$DEPLOY_DIR/backups/.tmp-${ts}"
  rm -rf "$DEPLOY_DIR"/backups/.tmp-* 2>/dev/null || true
  mkdir -p "$tmp/data"
  db_url="$(get_env LENS_DATABASE_URL)"
  if [ -n "$db_url" ] && ! printf '%s' "$db_url" | grep -q '^sqlite'; then
    warn "当前使用外部数据库，本脚本仅备份 .env，请自行备份数据库。"
    tar -czf "$out" -C "$DEPLOY_DIR" .env
  elif is_running; then
    info "容器运行中，执行 SQLite 在线备份..."
    compose exec -T app python3 -c "import sqlite3; s=sqlite3.connect('/app/data/data.db'); d=sqlite3.connect('/app/data/.backup-tmp.db'); s.backup(d); d.close(); s.close()"
    docker cp "${CONTAINER_NAME}:/app/data/.backup-tmp.db" "$tmp/data/data.db"
    compose exec -T app rm -f /app/data/.backup-tmp.db || true
    tar -czf "$out" -C "$DEPLOY_DIR" .env -C "$tmp" data
  else
    tar -czf "$out" -C "$DEPLOY_DIR" .env data
  fi
  rm -rf "$tmp"
  chmod 600 "$out"
  ok "备份完成: $out"
  # 仅保留最近 14 份
  { ls -1t "$DEPLOY_DIR"/backups/lens-backup-*.tar.gz 2>/dev/null || true; } | tail -n +15 | xargs -r rm -f
}

CRON_TAG="# lens-auto-deploy"
cmd_schedule() {
  need_cmd crontab || die "系统未安装 crontab。"
  mkdir -p "$DEPLOY_DIR/backups"
  persist_self
  [ -f "$SCRIPT_SELF" ] || die "无法在 $DEPLOY_DIR 放置脚本副本，请先执行 install。"
  local line="17 4 * * * /usr/bin/env bash $SCRIPT_SELF update --dir $DEPLOY_DIR --no-wait >> $DEPLOY_DIR/backups/auto-update.log 2>&1 $CRON_TAG"
  ( crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true; printf '%s\n' "$line" ) | crontab -
  ok "已安装定时任务：每天 04:17 自动检查更新（日志: $DEPLOY_DIR/backups/auto-update.log）。"
}
cmd_unschedule() {
  need_cmd crontab || die "系统未安装 crontab。"
  ( crontab -l 2>/dev/null | grep -vF "$CRON_TAG" || true ) | crontab -
  ok "已移除定时任务。"
}

cmd_uninstall() {
  check_docker
  confirm "将停止并删除 Lens 容器（数据目录默认保留），继续？" || { info "已取消。"; return 0; }
  compose down --remove-orphans || true
  if [ "$PURGE" -eq 1 ]; then
    confirm "确认删除 $DEPLOY_DIR 下的 data/ 与 .env？此操作不可恢复！" || { info "已保留数据。"; return 0; }
    rm -rf "$DEPLOY_DIR/data" "$DEPLOY_DIR/.env" "$DEPLOY_DIR/.build-mode"
    ok "数据已删除。"
  fi
  ok "卸载完成。"
}

# ---------- 入口 ----------
parse_args "$@"
SCRIPT_SELF="$DEPLOY_DIR/auto-deploy.sh"

case "$CMD" in
  install)    cmd_install ;;
  update)     cmd_update ;;
  build)      cmd_build ;;
  status)     cmd_status ;;
  logs)       cmd_logs ;;
  restart)    cmd_restart ;;
  stop)       cmd_stop ;;
  password)   cmd_password ;;
  backup)     cmd_backup ;;
  schedule)   cmd_schedule ;;
  unschedule) cmd_unschedule ;;
  uninstall)  cmd_uninstall ;;
esac
