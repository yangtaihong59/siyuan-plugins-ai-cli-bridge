# 提交插件到 Community Bazaar 指南

## 仓库信息

- **Community Bazaar 仓库**: https://github.com/siyuan-note/bazaar
- **plugins.json 文件**: https://github.com/siyuan-note/bazaar/blob/main/plugins.json
- **你的插件仓库**: `yangtaihong59/siyuan-plugins-ai-cli-bridge`

## 操作步骤

### 1. Fork Bazaar 仓库

访问 https://github.com/siyuan-note/bazaar，点击右上角的 "Fork" 按钮，将仓库 fork 到你的账户。

### 2. 克隆 Fork 的仓库

```bash
git clone https://github.com/你的用户名/bazaar.git
cd bazaar
```

### 3. 创建新分支

```bash
git checkout -b add-yangtaihong59-siyuan-plugins-ai-cli-bridge
```

### 4. 修改 plugins.json

编辑 `plugins.json` 文件，在 `repos` 数组中添加你的仓库（按字母顺序排列）：

```json
{
 "repos": [
   // ... 其他仓库 ...
   "yangtaihong59/siyuan-plugins-ai-cli-bridge"
 ]
}
```

**注意**: 请将 `yangtaihong59/siyuan-plugins-ai-cli-bridge` 按字母顺序插入到合适的位置。

### 5. 提交更改

```bash
git add plugins.json
git commit -m "Add yangtaihong59/siyuan-plugins-ai-cli-bridge plugin"
git push origin add-yangtaihong59-siyuan-plugins-ai-cli-bridge
```

### 6. 创建 Pull Request

1. 访问你的 Fork 仓库页面：https://github.com/你的用户名/bazaar
2. 点击 "Compare & pull request" 按钮
3. 填写 PR 标题和描述，例如：
   - **标题**: `Add yangtaihong59/siyuan-plugins-ai-cli-bridge plugin`
   - **描述**: 
     ```
     Add AI CLI Bridge plugin to Community Bazaar
     
     Plugin repository: https://github.com/yangtaihong59/siyuan-plugins-ai-cli-bridge
     ```
4. 点击 "Create pull request"

### 7. 等待合并

PR 被合并后，Community Bazaar 会通过 GitHub Actions 自动更新索引并部署（通常在一小时内完成）。

## 注意事项

- ✅ 确保你的插件仓库是公开的
- ✅ 确保插件有有效的 `plugin.json` 文件
- ✅ 确保插件有至少一个 release（包含 `package.zip`）
- ✅ 仓库名称格式必须为 `username/reponame`
- ⚠️ 后续发布新版本时，只需要创建新的 release tag，不需要再次提交 PR

## 快速脚本

你也可以使用以下脚本快速完成操作（需要先 fork 仓库）：

```bash
#!/bin/bash
# 设置变量
BAZAAR_REPO="你的用户名/bazaar"
PLUGIN_REPO="yangtaihong59/siyuan-plugins-ai-cli-bridge"
BRANCH_NAME="add-yangtaihong59-siyuan-plugins-ai-cli-bridge"

# 克隆仓库
git clone "https://github.com/${BAZAAR_REPO}.git" bazaar-temp
cd bazaar-temp

# 创建分支
git checkout -b "${BRANCH_NAME}"

# 使用 Python 脚本添加仓库到 plugins.json（需要安装 jq 或使用 Python）
# 这里提供一个简单的 Python 脚本示例
python3 << EOF
import json

with open('plugins.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

repos = data['repos']
if '${PLUGIN_REPO}' not in repos:
    repos.append('${PLUGIN_REPO}')
    repos.sort()
    data['repos'] = repos
    
    with open('plugins.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    print(f"Added ${PLUGIN_REPO} to plugins.json")
else:
    print(f"${PLUGIN_REPO} already exists in plugins.json")
EOF

# 提交
git add plugins.json
git commit -m "Add ${PLUGIN_REPO} plugin"
git push origin "${BRANCH_NAME}"

echo "Done! Now create a PR at: https://github.com/siyuan-note/bazaar/compare/main...${BAZAAR_REPO}:${BRANCH_NAME}"
```
