# Git 常用命令备忘

本项目开发中常用的 Git 命令参考手册。

---

## 📋 目录
- [忽略本地文件修改](#忽略本地文件修改)
- [常用操作命令](#常用操作命令)
- [分支管理](#分支管理)
- [提交与推送](#提交与推送)
- [查看与比较](#查看与比较)
- [撤销与恢复](#撤销与恢复)

---

## 忽略本地文件修改

### skip-worktree（推荐）

**场景**：本地有特殊配置（如 package.json、配置文件），不想被提交，也不想被远程覆盖

```bash
# 忽略文件本地修改
git update-index --skip-worktree <file-path>

# 示例
git update-index --skip-worktree frontend/tsp-react-otel/package.json

# 查看所有被 skip-worktree 的文件
git ls-files -v | grep ^S

# 恢复（让 Git 重新跟踪这个文件）
git update-index --no-skip-worktree <file-path>
```

**效果**：
- ✅ Git 忽略本地修改
- ✅ 远程的文件不受影响
- ✅ 以后修改这个文件也不会出现在 `git status` 中
- ⚠️ `git pull` 时远程改动不会覆盖本地文件

### assume-unchanged（类似）

```bash
# 标记文件为假定未更改
git update-index --assume-unchanged <file-path>

# 恢复
git update-index --no-assume-unchanged <file-path>
```

**与 skip-worktree 的区别**：
- `assume-unchanged`：用于暂时不想提交的修改
- `skip-worktree`：用于永久性的本地配置差异

---

## 常用操作命令

### 查看状态

```bash
# 查看当前状态
git status

# 查看简洁状态
git status -s

# 查看分支信息
git branch -vv
```

### 添加文件

```bash
# 添加指定文件
git add <file>

# 添加所有修改
git add .

# 添加所有修改（包括删除）
git add -A

# 交互式添加
git add -i
```

### 提交

```bash
# 提交修改
git commit -m "提交信息"

# 添加并提交
git commit -am "提交信息"

# 修改最后一次提交
git commit --amend

# 修改最后一次提交信息
git commit --amend -m "新的提交信息"
```

---

## 分支管理

### 查看分支

```bash
# 查看本地分支
git branch

# 查看所有分支（包括远程）
git branch -a

# 查看远程分支
git branch -r

# 查看分支详情
git branch -vv
```

### 创建与切换

```bash
# 创建分支
git branch <branch-name>

# 切换分支
git checkout <branch-name>

# 创建并切换分支
git checkout -b <branch-name>

# 切换到上一个分支
git checkout -
```

### 删除分支

```bash
# 删除本地分支
git branch -d <branch-name>

# 强制删除分支
git branch -D <branch-name>

# 删除远程分支
git push origin --delete <branch-name>
```

### 重命名分支

```bash
# 重命名当前分支
git branch -m <new-branch-name>

# 重命名指定分支
git branch -m <old-branch-name> <new-branch-name>
```

---

## 提交与推送

### 推送到远程

```bash
# 推送当前分支
git push

# 推送指定分支
git push origin <branch-name>

# 推送所有分支
git push --all

# 推送并建立追踪关系
git push -u origin <branch-name>

# 强制推送（慎用）
git push -f
```

### 拉取更新

```bash
# 拉取远程更新
git pull

# 拉取远程更新并变基
git pull --rebase

# 获取远程更新（不合并）
git fetch

# 获取所有远程分支更新
git fetch --all
```

---

## 查看与比较

### 查看历史

```bash
# 查看提交历史
git log

# 查看简洁历史
git log --oneline

# 查看图形化历史
git log --graph --oneline --all

# 查看最近N条提交
git log -n 10

# 查看指定文件的历史
git log <file>
```

### 比较差异

```bash
# 查看工作区修改
git diff

# 查看已暂存的修改
git diff --cached

# 查看工作区与指定提交的差异
git diff <commit>

# 查看两个提交之间的差异
git diff <commit1> <commit2>

# 查看指定文件的差异
git diff <file>

# 查看分支差异
git diff <branch1> <branch2>
```

### 查看文件内容

```bash
# 查看指定提交的文件内容
git show <commit>:<file>

# 查看指定提交的详情
git show <commit>

# 查看指定标签的详情
git show <tag>
```

---

## 撤销与恢复

### 撤销工作区修改

```bash
# 撤销指定文件的修改
git restore <file>

# 撤销所有修改
git restore .

# 撤销暂存区修改
git restore --staged <file>

# 撤销所有暂存
git restore --staged .
```

### 撤销提交

```bash
# 撤销最后一次提交（保留修改）
git reset --soft HEAD~1

# 撤销最后一次提交（不保留修改）
git reset --hard HEAD~1

# 撤销指定提交（保留修改）
git reset --soft <commit>

# 回退到指定提交（不保留修改）
git reset --hard <commit>
```

### 恢复删除的文件

```bash
# 从暂存区恢复
git restore --staged <file>

# 从提交中恢复
git checkout <commit> -- <file>

# 从暂存区恢复并添加到工作区
git restore <file>
```

### Revert（反向提交）

```bash
# 反向提交指定提交（创建新提交）
git revert <commit>

# 反向提交最后一次提交
git revert HEAD

# 反向提交时不自动打开编辑器
git revert --no-commit <commit>
```

---

## 其他实用命令

### 暂存（Stash）

```bash
# 暂存当前修改
git stash

# 暂存并添加说明
git stash save "说明信息"

# 查看暂存列表
git stash list

# 应用暂存（不删除）
git stash apply

# 应用暂存（删除）
git stash pop

# 应用指定暂存
git stash apply stash@{n}

# 删除暂存
git stash drop stash@{n}

# 清空所有暂存
git stash clear
```

### 清理

```bash
# 查看未跟踪文件
git clean -n

# 删除未跟踪文件
git clean -f

# 删除未跟踪文件和目录
git clean -fd

# 删除忽略的文件
git clean -fX
```

### Cherry-pick（挑选提交）

```bash
# 挑选指定提交到当前分支
git cherry-pick <commit>

# 挑选多个提交
git cherry-pick <commit1> <commit2>

# 挑选但不自动提交
git cherry-pick -n <commit>
```

---

## 本项目特定场景

### 文档开发

```bash
# 创建新文档后，添加到 git
git add docs/new-doc.md

# 提交文档更新
git commit -am "docs: 添加xxx文档"

# 推送到远程
git push
```

### 更新文档索引

```bash
# 修改 SUMMARY.md 后提交
git add docs/SUMMARY.md
git commit -m "docs: 更新文档索引"
git push
```

### 查看修改

```bash
# 查看当前所有修改
git status

# 查看具体文件修改
git diff docs/SUMMARY.md
```

---

## 常见问题解决

### 1. 文件被 skip-worktree 后如何查看与远程的差异

```bash
# 查看 skip-worktree 文件与 HEAD 的差异
git diff HEAD frontend/tsp-react-otel/package.json
```

### 2. 恢复被 skip-worktree 的文件

```bash
# 先恢复跟踪
git update-index --no-skip-worktree <file>

# 再查看差异
git diff <file>

# 或直接恢复到远程版本
git checkout HEAD -- <file>
```

### 3. 查看哪些文件被 skip-worktree

```bash
# 方法一
git ls-files -v | grep "^S"

# 方法二（更友好）
git ls-files -v | grep "^S" | awk '{print $2}'
```

---

## 参考资源

- [Git 官方文档](https://git-scm.com/doc)
- [GitHub Git 速查表](https://education.github.com/git-cheat-sheet-education.pdf)

---

*最后更新: 2026-04-11*
