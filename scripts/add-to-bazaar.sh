#!/bin/bash
# 快速添加插件到 Community Bazaar 的脚本

set -e

BAZAAR_REPO="${1:-siyuan-note/bazaar}"
PLUGIN_REPO="yangtaihong59/siyuan-plugins-ai-cli-bridge"
BRANCH_NAME="add-yangtaihong59-siyuan-plugins-ai-cli-bridge"
TEMP_DIR="bazaar-temp"

echo "🚀 开始添加插件到 Community Bazaar..."
echo "📦 插件仓库: ${PLUGIN_REPO}"
echo "🏪 Bazaar 仓库: ${BAZAAR_REPO}"

# 检查是否已存在临时目录
if [ -d "${TEMP_DIR}" ]; then
    echo "⚠️  临时目录 ${TEMP_DIR} 已存在，正在删除..."
    rm -rf "${TEMP_DIR}"
fi

# 克隆仓库
echo "📥 正在克隆 Bazaar 仓库..."
git clone "https://github.com/${BAZAAR_REPO}.git" "${TEMP_DIR}"
cd "${TEMP_DIR}"

# 创建分支
echo "🌿 创建分支: ${BRANCH_NAME}"
git checkout -b "${BRANCH_NAME}"

# 检查 Python 是否可用
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "❌ 错误: 未找到 Python，请手动编辑 plugins.json"
    exit 1
fi

# 使用 Python 添加仓库到 plugins.json
echo "✏️  正在修改 plugins.json..."
${PYTHON_CMD} << EOF
import json
import sys

try:
    with open('plugins.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    repos = data.get('repos', [])
    
    if '${PLUGIN_REPO}' in repos:
        print(f"⚠️  ${PLUGIN_REPO} 已存在于 plugins.json 中")
        sys.exit(0)
    
    # 按字母顺序插入
    repos.append('${PLUGIN_REPO}')
    repos.sort()
    data['repos'] = repos
    
    with open('plugins.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    
    print(f"✅ 已添加 ${PLUGIN_REPO} 到 plugins.json")
except Exception as e:
    print(f"❌ 错误: {e}")
    sys.exit(1)
EOF

# 检查修改是否成功
if [ $? -ne 0 ]; then
    echo "❌ 修改 plugins.json 失败"
    cd ..
    rm -rf "${TEMP_DIR}"
    exit 1
fi

# 提交更改
echo "💾 提交更改..."
git add plugins.json
git commit -m "Add ${PLUGIN_REPO} plugin" || {
    echo "⚠️  提交失败，可能没有更改"
    cd ..
    rm -rf "${TEMP_DIR}"
    exit 1
}

# 推送到远程
echo "📤 推送到远程仓库..."
git push origin "${BRANCH_NAME}" || {
    echo "❌ 推送失败，请检查："
    echo "   1. 是否已 fork ${BAZAAR_REPO} 到你的账户？"
    echo "   2. 是否有推送权限？"
    echo "   3. 如果使用 HTTPS，可能需要配置 GitHub token"
    cd ..
    rm -rf "${TEMP_DIR}"
    exit 1
}

cd ..

echo ""
echo "✅ 完成！"
echo ""
echo "📝 下一步："
echo "   1. 访问: https://github.com/${BAZAAR_REPO}/compare/main...你的用户名:${BRANCH_NAME}"
echo "   2. 点击 'Create pull request'"
echo "   3. 填写 PR 标题和描述"
echo ""
echo "🧹 清理临时文件..."
rm -rf "${TEMP_DIR}"

echo "✨ 所有操作完成！"
