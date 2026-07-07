#!/bin/zsh
# ============ Fu 导航 · 本机伴随服务 一键安装 ============
# 用法：cd agent && ./install.sh
# 作用：把 server.js/build.sh 等装到 ~/.fu-nav，注册两个 LaunchAgent：
#   1) com.fu.nav.server —— 常驻 127.0.0.1:7842 提供数据
#   2) com.fu.nav.build  —— 每 10 分钟取一次提醒/日历，每天 8:00 额外生成 AI 日报
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/.fu-nav"; mkdir -p "$DIR/log"
LA="$HOME/Library/LaunchAgents"; mkdir -p "$LA"
UID_=$(id -u)
NODE=$(command -v node || echo /usr/local/bin/node)

echo "→ 安装文件到 $DIR"
cp "$SRC/server.js" "$SRC/build.sh" "$SRC/parse-cal.js" "$DIR/"
chmod +x "$DIR/build.sh"

mkplist(){ # name  programargs...
  local name=$1; shift
  cat > "$LA/$name.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$name</string>
  <key>ProgramArguments</key><array>$(for a in "$@"; do printf '<string>%s</string>' "$a"; done)</array>
  <key>EnvironmentVariables</key><dict>
    <key>FN_PORT</key><string>${FN_PORT:-7842}</string>
    <key>FN_TOKEN</key><string>${FN_TOKEN:-fu-nav-local}</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StandardOutPath</key><string>$DIR/log/$name.out.log</string>
  <key>StandardErrorPath</key><string>$DIR/log/$name.err.log</string>
PLIST
}

# server（常驻）
mkplist com.fu.nav.server "$NODE" "$DIR/server.js"
cat >> "$LA/com.fu.nav.server.plist" <<PLIST
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
</dict></plist>
PLIST

# build（每 10 分钟取数）
mkplist com.fu.nav.build /bin/zsh "$DIR/build.sh"
cat >> "$LA/com.fu.nav.build.plist" <<PLIST
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
</dict></plist>
PLIST

echo "→ 注册 LaunchAgent"
for n in com.fu.nav.server com.fu.nav.build; do
  launchctl bootout gui/$UID_ "$LA/$n.plist" 2>/dev/null || true
  launchctl bootstrap gui/$UID_ "$LA/$n.plist"
  launchctl enable gui/$UID_/$n 2>/dev/null || true
done

echo ""
echo "✅ 安装完成。健康检查："
sleep 1; curl -s -H "X-Token: ${FN_TOKEN:-fu-nav-local}" http://127.0.0.1:${FN_PORT:-7842}/health || echo "(server 还在启动，稍后再试 curl)"
echo ""
echo "⚠️ 首次需授权（否则提醒/日历为空）："
echo "   1) 终端手动跑一次： zsh $DIR/build.sh"
echo "   2) 弹出「自动化/提醒事项/日历」授权时点允许；并在 系统设置→隐私与安全性→提醒事项/日历 勾上 node 与 osascript"
echo "   3) 日历建议： brew install ical-buddy （否则日历留空）"
echo "   4) AI 日报需已装 Claude Code CLI（claude）"
echo ""
echo "卸载： launchctl bootout gui/$UID_ $LA/com.fu.nav.server.plist; launchctl bootout gui/$UID_ $LA/com.fu.nav.build.plist; rm -rf $DIR $LA/com.fu.nav.*.plist"
