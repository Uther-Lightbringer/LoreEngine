# 更新日志

所有重要的项目更新都会记录在此文件中。

## [2026-03-26] 修复角色对话记忆总结问题

### 问题描述
取消与角色对话时，对话内容不会被总结保存到角色记忆中。

### 根本原因
1. **角色对话未被记录**：在多角色和单角色回应流程中，角色的对话只被添加到"其他"角色的当前对话中，而不包括角色自己。当只有一个角色被选中时，取消选择时 `characterCurrentDialogues` 为空。

2. **API 配置获取方式错误**：`getProviderConfigExport()` 返回空的 `apiKey: ''`，导致 `extractMemoriesFromDialogue` 和 `consolidateMemoriesWithAI` 误认为没有配置 API Key，回退到启发式方法（关键字匹配），从而无法正确提取记忆。

### 修复内容

#### 1. 修复角色对话未被添加到自身记忆的问题
**文件**: `src/components/SceneView.jsx`

- **第1735行（多角色回应流程）**：将角色回应添加到所有选中角色的当前对话中（包括自己）
- **第3151行（单角色回应流程）**：同样修改逻辑

修改前：
```javascript
// 添加到其他角色的当前对话中（不包括正在回应的角色自己）
for (const char of selectedTalkingCharacters) {
  if (char.id !== currentCharacter.id) {
    dispatch({ type: 'ADD_CHARACTER_CURRENT_DIALOGUE', ... });
  }
}
```

修改后：
```javascript
// 添加到所有选中角色的当前对话中（包括自己）
// 这样取消选择时才能正确压缩记忆
for (const char of selectedTalkingCharacters) {
  dispatch({ type: 'ADD_CHARACTER_CURRENT_DIALOGUE', ... });
}
```

#### 2. 修复记忆提取无法使用 AI 的问题
**文件**: `src/services/characterMemoryService.js`

- **`extractMemoriesFromDialogue` 函数**：移除 `if (!providerConfig?.apiKey)` 检查，直接调用 AI 提取记忆，失败时回退到启发式方法
- **`consolidateMemoriesWithAI` 函数**：同样移除检查

修改前：
```javascript
if (!providerConfig?.apiKey) {
  return extractMemoriesHeuristically(dialogueHistory, character, protagonist);
}
```

修改后：直接进入 try 块调用 AI，由 AI 调用失败时再回退到启发式方法。

### 影响范围
- 取消与角色对话时，角色对话现在会正确保存到记忆中
- 记忆提取和整理现在会通过后端 API 使用配置的 Deepseek AI（而非回退到关键字匹配）

### 相关文件
- `src/components/SceneView.jsx`
- `src/services/characterMemoryService.js`
