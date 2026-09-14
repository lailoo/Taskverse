#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if command -v node >/dev/null 2>&1; then
  node scripts/start-local.mjs
else
  print "未找到 Node.js，请安装 Node.js 22.13 或更新版本。"
  exit 1
fi
if [[ $? -ne 0 ]]; then
  read "?启动失败，按回车关闭。"
fi
