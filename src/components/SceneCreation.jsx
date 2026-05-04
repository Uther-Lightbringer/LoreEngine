import React, { useState, useEffect, useRef } from 'react';
import { useGameState } from '../store/gameState.jsx';
import { generateWithAI, MAX_TOKENS } from '../services/aiService.js';
import { generateImage } from '../services/imageService.js';
import { sampleScenePrompt, defaultScene } from '../data/templates.js';
import { exportSave, saveToLocalStorage } from '../services/saveService.js';
import { batchGenerateScenes, generateWorldMap, generateScenesFromMap } from '../services/apiService.js';
import ImageModal from './ImageModal.jsx';
import SceneMapEditor from './SceneMapEditor.jsx';
import './SceneCreation.css';
import './WorldCreation.css';
import './CharacterCreation.css';

// 动态加载Mermaid库
const loadMermaid = () => {
  return new Promise((resolve) => {
    if (window.mermaid) {
      resolve(window.mermaid);
      return;
    }
    const script = document.createElement('script');
    script.src = '/mermaid.min.js';
    script.onload = () => {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose'
      });
      resolve(window.mermaid);
    };
    document.head.appendChild(script);
  });
};

const SceneCreation = ({ onStartPlaying, onBack, onOpenApiSettings }) => {
  const { state, dispatch } = useGameState();
  const [selectedScene, setSelectedScene] = useState(null);
  const [editingScene, setEditingScene] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [aiPrompt, setAiPrompt] = useState(sampleScenePrompt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState('16:9');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [autoGenerateSceneImages, setAutoGenerateSceneImages] = useState(true);

  // 批量生成相关
  const [numScenes, setNumScenes] = useState(3);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);
  const [imageGenerateProgress, setImageGenerateProgress] = useState(0);
  const [modalImage, setModalImage] = useState(null);
  // 异步场景图片生成状态：{ sceneId: { status: 'generating'|'done', imageUrl: string|null, sceneImages: object } }
  const [asyncSceneImageGen, setAsyncSceneImageGen] = useState({});

  // 世界地图相关
  const [isGeneratingWorldMap, setIsGeneratingWorldMap] = useState(false);
  const [worldMapDialog, setWorldMapDialog] = useState(null); // { mermaidCode, worldId }
  const [mermaidRendered, setMermaidRendered] = useState(false);
  const [mermaidSvg, setMermaidSvg] = useState('');
  const [mermaidExpanded, setMermaidExpanded] = useState(false);
  const mermaidRef = useRef(null);

  // 生成世界地图
  const handleGenerateWorldMap = async () => {
    if (!state.world?.id) {
      setError('请先保存世界观到服务器');
      return;
    }

    setIsGeneratingWorldMap(true);
    setError('正在生成世界地图...');

    try {
      const promptText = `世界观：${state.world.name || '未设定'}
${state.world.description || ''}

主角：${state.characters.find(c => c.isProtagonist)?.name || '未设定'}
主角性格：${state.characters.find(c => c.isProtagonist)?.personality || ''}

请生成一个展示这个世界场景布局的Mermaid流程图。要求：
1. 使用 graph TD 语法
2. 每个节点代表一个场景/区域，节点文字使用场景名称
3. 用箭头 --> 表示场景之间的连接关系
4. 标注重要的分支条件和事件节点（使用 subgraph 分组）
5. 主角的起始场景应该是最左边的起点
6. 场景数量必须精确等于 ${numScenes} 个，不能多也不能少
7. 确保场景之间的逻辑连接合理

只返回纯Mermaid代码，不要任何其他说明。`;

      const result = await generateWorldMap(state.world.id, promptText);

      if (result && result.mermaidCode) {
        setWorldMapDialog({ mermaidCode: result.mermaidCode, worldId: state.world.id });
        setMermaidRendered(false);
        setMermaidSvg('');
        setError('');
      } else {
        setError('世界地图生成失败，请重试');
      }
    } catch (err) {
      setError('生成世界地图失败: ' + err.message);
    } finally {
      setIsGeneratingWorldMap(false);
    }
  };

  // 根据世界地图生成场景
  const handleGenerateScenesFromMap = async () => {
    if (!worldMapDialog || !state.world?.id) return;

    setIsGeneratingBulk(true);
    setImageGenerateProgress(0);
    setError('正在根据地图生成场景...');

    try {
      // 先保存 worldMap 到 state.world
      dispatch({
        type: 'UPDATE_WORLD',
        payload: {
          worldMap: worldMapDialog.mermaidCode
        }
      });

      // 找到主角的起始场景
      const protagonist = state.characters.find(c => c.isProtagonist);
      const startSceneId = protagonist?.currentSceneId || null;

      const result = await generateScenesFromMap(
        state.world.id,
        { mermaidCode: worldMapDialog.mermaidCode },
        startSceneId,
        autoGenerateSceneImages
      );

      if (result && result.scenes && result.scenes.length > 0) {
        const createdSceneIds = [];

        // 获取可用的角色用于分配（深拷贝避免修改原数组）
        const availableCharacters = [...state.characters];

        // 创建所有场景
        for (let i = 0; i < result.scenes.length; i++) {
          const sceneData = result.scenes[i];
          const newSceneId = sceneData.id || `scene_${Date.now()}_${i}`;
          createdSceneIds.push(newSceneId);

          // 保存地图位置
          if (sceneData.mapX !== undefined && sceneData.mapY !== undefined) {
            setScenePositions(prev => ({
              ...prev,
              [newSceneId]: {
                x: sceneData.mapX,
                y: sceneData.mapY,
                width: 180,
                height: 120
              }
            }));
          }

          // 为这个场景分配NPC（每个角色只分配一次）
          const sceneNpcs = [];
          if (availableCharacters.length > 0) {
            // 每个场景随机分配1-2个角色（如果还有可用的）
            const numToAssign = Math.min(Math.floor(Math.random() * 2) + 1, availableCharacters.length);
            for (let j = 0; j < numToAssign; j++) {
              const charIndex = Math.floor(Math.random() * availableCharacters.length);
              const char = availableCharacters.splice(charIndex, 1)[0];
              sceneNpcs.push(char.id);

              // 更新角色的当前场景位置
              dispatch({
                type: 'MOVE_CHARACTER',
                payload: { characterId: char.id, sceneId: newSceneId }
              });
            }
          }

          const newScene = {
            ...defaultScene,
            id: newSceneId,
            name: sceneData.name || `场景${i + 1}`,
            description: sceneData.description || '',
            isIndoor: sceneData.isIndoor !== undefined ? sceneData.isIndoor : null,
            spaceType: sceneData.spaceType || '',
            decorationStyle: sceneData.decorationStyle || '',
            mainFurniture: sceneData.mainFurniture || '',
            colorScheme: sceneData.colorScheme || '',
            lightSource: sceneData.lightSource || '',
            atmosphere: sceneData.atmosphere || '',
            viewAngle: sceneData.viewAngle || '',
            location: sceneData.location || '',
            seasonTime: sceneData.seasonTime || '',
            naturalElements: sceneData.naturalElements || '',
            skyDescription: sceneData.skyDescription || '',
            lightDescription: sceneData.lightDescription || '',
            colorAtmosphere: sceneData.colorAtmosphere || '',
            layout: sceneData.layout || '',
            photographer: sceneData.photographer || '',
            imageUrl: sceneData.image_url || '',
            connectedScenes: sceneData.connectedScenes || [],
            npcs: sceneNpcs
          };

          dispatch({ type: 'ADD_SCENE', payload: newScene });
        }

        setError(`根据地图成功生成 ${createdSceneIds.length} 个场景！${autoGenerateSceneImages ? '图片已在后台生成。' : ''}`);
        setWorldMapDialog(null);
      } else {
        setError('场景生成失败，请重试');
      }
    } catch (err) {
      setError('根据地图生成场景失败: ' + err.message);
    } finally {
      setIsGeneratingBulk(false);
      setImageGenerateProgress(0);
    }
  };

  // Mermaid渲染useEffect
  useEffect(() => {
    if (!worldMapDialog?.mermaidCode || mermaidRendered) return;

    let cancelled = false;

    const renderMermaid = async () => {
      try {
        const mermaid = await loadMermaid();
        if (cancelled) return;

        const mermaidId = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(mermaidId, worldMapDialog.mermaidCode);
        if (!cancelled) {
          setMermaidSvg(svg);
          setMermaidRendered(true);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (!cancelled) {
          setError('Mermaid图表渲染失败: ' + err.message);
          setMermaidRendered(true); // 避免重试循环
        }
      }
    };

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [worldMapDialog?.mermaidCode, mermaidRendered]);

  // 视图模式和场景位置
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'
  const [scenePositions, setScenePositions] = useState({});

  const startAdd = () => {
    setEditingScene({ ...defaultScene, id: `scene_${Date.now()}` });
    setIsAdding(true);
    setSelectedScene(null);
  };

  const startEdit = (scene) => {
    setEditingScene({ ...scene });
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingScene(null);
    setIsAdding(false);
    setError('');
  };

  // 地图编辑器：添加场景
  const handleAddSceneOnMap = ({ x, y }) => {
    const newScene = {
      ...defaultScene,
      id: `scene_${Date.now()}`,
      name: '新场景',
      description: '点击编辑场景详情',
      mapX: x,
      mapY: y
    };
    dispatch({ type: 'ADD_SCENE', payload: newScene });

    // 保存场景位置
    setScenePositions(prev => ({
      ...prev,
      [newScene.id]: { x, y, width: 180, height: 120 }
    }));

    // 开始编辑新场景
    setEditingScene(newScene);
    setIsAdding(true);
    setSelectedScene(null);
  };

  // 地图编辑器：连接场景
  const handleConnectScenes = (sceneId1, sceneId2) => {
    // 场景1连接到场景2
    const scene1 = state.scenes.find(s => s.id === sceneId1);
    if (scene1) {
      const connections1 = scene1.connectedScenes || [];
      if (!connections1.includes(sceneId2)) {
        dispatch({
          type: 'UPDATE_SCENE',
          payload: {
            ...scene1,
            connectedScenes: [...connections1, sceneId2]
          }
        });
      }
    }

    // 场景2连接到场景1（双向连接）
    const scene2 = state.scenes.find(s => s.id === sceneId2);
    if (scene2) {
      const connections2 = scene2.connectedScenes || [];
      if (!connections2.includes(sceneId1)) {
        dispatch({
          type: 'UPDATE_SCENE',
          payload: {
            ...scene2,
            connectedScenes: [...connections2, sceneId1]
          }
        });
      }
    }
  };

  // 地图编辑器：更新场景位置（可以扩展为持久化保存）
  const handleUpdateSceneOnMap = (sceneId, updates) => {
    // 这里可以添加位置保存逻辑
  };

  // 地图编辑器：点击场景节点
  const handleSceneClickOnMap = (scene) => {
    setSelectedScene(scene);
    startEdit(scene);
  };

  // 检查场景名称是否包含角色名
  const checkSceneNameForCharacters = (name) => {
    const characterNames = state.characters.map(c => c.name.toLowerCase());
    const sceneNameLower = name.toLowerCase();

    for (const charName of characterNames) {
      if (charName && sceneNameLower.includes(charName)) {
        return charName;
      }
    }
    return null;
  };

  // 检查角色是否在其他场景中
  const checkCharacterDuplication = (currentSceneId, npcs) => {
    const duplicates = [];
    npcs.forEach(charId => {
      const existingScene = state.scenes.find(scene =>
        scene.id !== currentSceneId && scene.npcs && scene.npcs.includes(charId)
      );
      if (existingScene) {
        const char = state.characters.find(c => c.id === charId);
        duplicates.push({
          character: char?.name || charId,
          scene: existingScene.name
        });
      }
    });
    return duplicates;
  };

  const saveScene = () => {
    if (!editingScene.name.trim()) {
      setError('请输入场景名称');
      return;
    }

    // 准备要保存的场景数据，包含地图位置
    const scenePos = scenePositions[editingScene.id];
    const sceneToSave = {
      ...editingScene,
      mapX: scenePos?.x ?? editingScene.mapX,
      mapY: scenePos?.y ?? editingScene.mapY
    };

    // 检查场景名称是否包含角色名
    const containedCharName = checkSceneNameForCharacters(sceneToSave.name);
    if (containedCharName) {
      setError(`场景名称不能包含角色名"${containedCharName}"。场景只是一个地方，请使用地点名称（如：森林入口、神秘洞穴等）`);
      return;
    }

    // 检查角色是否在其他场景中
    const duplicates = checkCharacterDuplication(editingScene.id, sceneToSave.npcs || []);
    if (duplicates.length > 0) {
      const errorMsg = duplicates.map(d =>
        `角色"${d.character}"已在场景"${d.scene}"中`
      ).join('；\n');
      setError(`以下角色已在其他场景中，请先移除：\n${errorMsg}`);
      return;
    }

    // 检查场景是否有连接的场景（如果不是第一个场景）
    const hasOtherScenes = state.scenes.filter(s => s.id !== sceneToSave.id).length > 0;
    const hasConnections = (sceneToSave.connectedScenes || []).length > 0;

    if (hasOtherScenes && !hasConnections) {
      if (!confirm('这个场景还没有连接到任何其他场景。每个场景都应该有可以进入和离开的连接场景。确定要继续保存吗？')) {
        return;
      }
    }

    // 获取旧的连接列表，用于清理反向连接
    const oldScene = state.scenes.find(s => s.id === sceneToSave.id);
    const oldConnections = oldScene?.connectedScenes || [];
    const newConnections = sceneToSave.connectedScenes || [];

    if (isAdding) {
      dispatch({ type: 'ADD_SCENE', payload: sceneToSave });
      // 为新场景的所有连接添加反向连接
      newConnections.forEach(targetSceneId => {
        const targetScene = state.scenes.find(s => s.id === targetSceneId);
        if (targetScene) {
          const targetConnections = targetScene.connectedScenes || [];
          if (!targetConnections.includes(sceneToSave.id)) {
            dispatch({
              type: 'UPDATE_SCENE',
              payload: {
                ...targetScene,
                connectedScenes: [...targetConnections, sceneToSave.id]
              }
            });
          }
        }
      });
    } else {
      dispatch({ type: 'UPDATE_SCENE', payload: sceneToSave });

      // 处理连接变化：添加新的反向连接，移除不再需要的反向连接
      // 1. 为新添加的连接添加反向连接
      const addedConnections = newConnections.filter(id => !oldConnections.includes(id));
      addedConnections.forEach(targetSceneId => {
        const targetScene = state.scenes.find(s => s.id === targetSceneId);
        if (targetScene) {
          const targetConnections = targetScene.connectedScenes || [];
          if (!targetConnections.includes(sceneToSave.id)) {
            dispatch({
              type: 'UPDATE_SCENE',
              payload: {
                ...targetScene,
                connectedScenes: [...targetConnections, sceneToSave.id]
              }
            });
          }
        }
      });

      // 2. 为移除的连接删除反向连接
      const removedConnections = oldConnections.filter(id => !newConnections.includes(id));
      removedConnections.forEach(targetSceneId => {
        const targetScene = state.scenes.find(s => s.id === targetSceneId);
        if (targetScene) {
          const targetConnections = targetScene.connectedScenes || [];
          if (targetConnections.includes(sceneToSave.id)) {
            dispatch({
              type: 'UPDATE_SCENE',
              payload: {
                ...targetScene,
                connectedScenes: targetConnections.filter(id => id !== sceneToSave.id)
              }
            });
          }
        }
      });
    }

    setEditingScene(null);
    setIsAdding(false);
    setError('');
  };

  const deleteScene = (id) => {
    if (confirm('确定要删除这个场景吗？')) {
      // 在删除场景前，先清理其他场景对该场景的连接
      const scene = state.scenes.find(s => s.id === id);
      if (scene) {
        const connectedSceneIds = scene.connectedScenes || [];
        connectedSceneIds.forEach(targetSceneId => {
          const targetScene = state.scenes.find(s => s.id === targetSceneId);
          if (targetScene) {
            const targetConnections = targetScene.connectedScenes || [];
            if (targetConnections.includes(id)) {
              dispatch({
                type: 'UPDATE_SCENE',
                payload: {
                  ...targetScene,
                  connectedScenes: targetConnections.filter(cid => cid !== id)
                }
              });
            }
          }
        });
      }

      dispatch({ type: 'DELETE_SCENE', payload: id });
      if (selectedScene?.id === id) {
        setSelectedScene(null);
      }
    }
  };

  const toggleConnection = (sceneId) => {
    setEditingScene(prev => {
      const connected = prev.connectedScenes || [];
      return {
        ...prev,
        connectedScenes: connected.includes(sceneId)
          ? connected.filter(id => id !== sceneId)
          : [...connected, sceneId]
      };
    });
  };

  const toggleNPC = (charId) => {
    setEditingScene(prev => {
      const npcs = prev.npcs || [];
      return {
        ...prev,
        npcs: npcs.includes(charId)
          ? npcs.filter(id => id !== charId)
          : [...npcs, charId]
      };
    });
  };

  const setStartingScene = () => {
    dispatch({ type: 'SET_CURRENT_SCENE', payload: editingScene.id });
  };

  // 为场景生成四个时间段的图片
  const generateSceneImages = async (scene) => {
    try {
      const timePeriods = [
        { key: 'morning', name: '早晨', timeDesc: '清晨6-8点，朝阳初升，柔和的金色光线，空气清新' },
        { key: 'noon', name: '中午', timeDesc: '正午12-14点，阳光明媚，光线充足，色彩鲜艳' },
        { key: 'evening', name: '傍晚', timeDesc: '傍晚16-18点，夕阳西下，金色晚霞，温暖柔和的光线' },
        { key: 'night', name: '晚上', timeDesc: '夜晚18-6点，夜幕降临，月光或灯光，宁静神秘的氛围' }
      ];

      const sceneImages = {};

      for (const period of timePeriods) {
        let prompt = '';

        // 根据室内/室外使用不同的提示词模板
        if (scene.isIndoor === true) {
          // 室内场景提示词模板
          const spaceType = scene.spaceType || '室内空间';
          const decorationStyle = scene.decorationStyle || '奇幻风格';
          const mainFurniture = scene.mainFurniture || '家具陈设';
          const colorScheme = scene.colorScheme || '暖色调';
          const atmosphere = scene.atmosphere || '温馨舒适';
          const viewAngle = scene.viewAngle || '平视视角';

          let timeLightSource = '';
          if (period.key === 'morning') timeLightSource = '清晨的阳光从窗户照入，光线柔和';
          else if (period.key === 'noon') timeLightSource = '正午明亮的阳光从窗户照入，光线充足';
          else if (period.key === 'evening') timeLightSource = '傍晚金色的晚霞从窗户照入，温暖浪漫';
          else if (period.key === 'night') timeLightSource = '夜晚室内灯光照明，窗外是夜色，温馨宁静';

          prompt = `${spaceType}，${decorationStyle}，${mainFurniture}，${colorScheme}，${timeLightSource}，${atmosphere}，${viewAngle}，${period.timeDesc}，室内设计效果图风格，建筑可视化，高清，专业建筑渲染水准，细节丰富`;
        } else if (scene.isIndoor === false) {
          // 室外场景提示词模板
          const location = scene.location || '自然风光';
          const naturalElements = scene.naturalElements || '绿树成荫';
          const layout = scene.layout || '层次分明';
          const photographer = scene.photographer || 'National Geographic';

          let timeSkyDesc = '';
          let timeLightDesc = '';
          let timeColorAtmos = '';
          if (period.key === 'morning') {
            timeSkyDesc = '晨曦微露，朝阳初升，天空呈淡金色';
            timeLightDesc = '柔和的晨光';
            timeColorAtmos = '清新明亮';
          } else if (period.key === 'noon') {
            timeSkyDesc = '蓝天白云，晴空万里';
            timeLightDesc = '阳光明媚';
            timeColorAtmos = '色彩鲜明';
          } else if (period.key === 'evening') {
            timeSkyDesc = '晚霞满天，夕阳西下';
            timeLightDesc = '金色暮光';
            timeColorAtmos = '温暖浪漫';
          } else if (period.key === 'night') {
            timeSkyDesc = '星空璀璨，月光皎洁，或灯火阑珊';
            timeLightDesc = '月光或夜景灯光';
            timeColorAtmos = '神秘宁静';
          }

          prompt = `${location}，${period.timeDesc}，${naturalElements}，${timeSkyDesc}，${timeLightDesc}，${timeColorAtmos}，${layout}，风光摄影风格，${photographer}风格，广角镜头，16-35mm，高清，国家地理杂志水准，细节丰富`;
        } else {
          // 未指定室内/室外时，使用描述作为基础
          prompt = `Scene: ${scene.name}, ${scene.description || 'fantasy landscape'}, ${period.timeDesc}, fantasy style, detailed scenery, epic atmosphere`;
        }

        const imageUrl = await generateImage(prompt, '16:9');
        if (imageUrl) {
          sceneImages[period.key] = imageUrl;
        }
      }

      // 默认使用中午的图片作为主图片
      const mainImageUrl = sceneImages.noon || sceneImages.morning || sceneImages.evening || sceneImages.night || null;

      return { imageUrl: mainImageUrl, sceneImages };
    } catch (err) {
      console.error(`Failed to generate images for scene ${scene.name}:`, err);
      return { imageUrl: null, sceneImages: {} };
    }
  };

  // 为场景生成单个图片（兼容旧代码）
  const generateSceneImage = async (scene) => {
    const result = await generateSceneImages(scene);
    return result.imageUrl;
  };

  // 异步生成场景图片（不阻塞 UI）
  const generateSceneImagesAsync = async (sceneData, sceneId) => {
    try {
      const { imageUrl, sceneImages } = await generateSceneImages(sceneData);
      if (imageUrl) {
        // 生成成功后更新到 editingScene
        setEditingScene(prev => {
          if (prev && prev.id === sceneId) {
            return { ...prev, imageUrl, sceneImages };
          }
          return prev;
        });
        // 同时更新异步状态
        setAsyncSceneImageGen(prev => ({
          ...prev,
          [sceneId]: { status: 'done', imageUrl, sceneImages }
        }));
      } else {
        setAsyncSceneImageGen(prev => ({
          ...prev,
          [sceneId]: { status: 'done', imageUrl: null, sceneImages: {} }
        }));
      }
    } catch (imgErr) {
      console.error('Async scene image generation failed:', imgErr);
      setAsyncSceneImageGen(prev => ({
        ...prev,
        [sceneId]: { status: 'done', imageUrl: null, sceneImages: {} }
      }));
    }
  };

  // 构建批量场景生成提示词
  const buildBulkScenePrompt = (count) => {
    let prompt = `世界观：${state.world.name || '未设定'}
${state.world.description || ''}

请生成${count}个相互连接的场景设定。

重要要求：
1. 场景名称必须是地点名称，不能包含任何人名或角色名
2. 场景只是一个地方，比如：森林入口、神秘洞穴、城镇广场、山顶等
3. 每个场景都必须至少有一个可以进入和离开的连接场景
4. 场景之间应该有逻辑上的连接关系（比如：森林入口→森林深处→神秘洞穴）
5. 第一个场景应该有通往第二个场景的出口
6. 最后一个场景应该有通往倒数第二个场景的入口
7. 中间的场景应该既有入口也有出口

每个场景都需要标注是室内还是室外（isIndoor字段），并根据室内/室外提供相应的详细信息：
- 室内场景需要：spaceType（空间类型）、decorationStyle（装修风格）、mainFurniture（主要家具陈设）、colorScheme（色彩搭配）、lightSource（光线来源）、atmosphere（氛围描述）、viewAngle（视角描述）
- 室外场景需要：location（地理位置/地形）、seasonTime（季节/时间）、naturalElements（主要自然元素）、skyDescription（天空描述）、lightDescription（光线描述）、colorAtmosphere（色彩氛围）、layout（前景/中景/远景布局）、photographer（参考摄影师风格，如"National Geographic"）

地图位置安排：
请为每个场景安排合理的地图位置（mapX和mapY），范围在100-800之间。
位置安排原则：
1. 根据场景名称和描述的逻辑关系安排位置
2. 有连接关系的场景应该位置相近
3. 场景之间应该有一定的间隔，不要重叠
4. 可以按照从左到右、从上到下的逻辑顺序排列
5. 或者根据场景的地理关系（如：入口在左边，深处在右边）

只返回纯JSON数组，不要包含任何其他文字说明。格式如下：
[
  {
    "name": "场景名称",
    "description": "场景描述",
    "isIndoor": true/false,
    "spaceType": "空间类型",
    "decorationStyle": "装修风格",
    "mainFurniture": "主要家具陈设",
    "colorScheme": "色彩搭配",
    "lightSource": "光线来源",
    "atmosphere": "氛围描述",
    "viewAngle": "视角描述",
    "location": "地理位置/地形",
    "seasonTime": "季节/时间",
    "naturalElements": "主要自然元素",
    "skyDescription": "天空描述",
    "lightDescription": "光线描述",
    "colorAtmosphere": "色彩氛围",
    "layout": "前景/中景/远景布局",
    "photographer": "参考摄影师风格",
    "mapX": 150,
    "mapY": 150
  },
  {
    "name": "场景名称",
    "description": "场景描述",
    "isIndoor": true/false,
    "spaceType": "空间类型",
    "decorationStyle": "装修风格",
    "mainFurniture": "主要家具陈设",
    "colorScheme": "色彩搭配",
    "lightSource": "光线来源",
    "atmosphere": "氛围描述",
    "viewAngle": "视角描述",
    "location": "地理位置/地形",
    "seasonTime": "季节/时间",
    "naturalElements": "主要自然元素",
    "skyDescription": "天空描述",
    "lightDescription": "光线描述",
    "colorAtmosphere": "色彩氛围",
    "layout": "前景/中景/远景布局",
    "photographer": "参考摄影师风格",
    "mapX": 400,
    "mapY": 150
  }
]`;
    return prompt;
  };

  // 批量生成场景
  const handleGenerateBulk = async () => {
    if (!state.world.name && !state.world.description) {
      setError('请先创建世界观');
      return;
    }

    setIsGeneratingBulk(true);
    setImageGenerateProgress(0);
    setError('');

    try {
      const prompt = buildBulkScenePrompt(numScenes);
      const result = await generateWithAI(prompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });

      let scenes = [];
      if (result && Array.isArray(result)) {
        scenes = result;
      } else if (result && typeof result === 'object' && result.scenes && Array.isArray(result.scenes)) {
        scenes = result.scenes;
      } else {
        setError(`生成格式错误，请重试。返回类型: ${typeof result}, 是否数组: ${Array.isArray(result)}`);
        setIsGeneratingBulk(false);
        return;
      }

      // 获取可用的角色
      const availableCharacters = [...state.characters];
      const createdSceneIds = [];
      const newScenePositions = {};

      // 创建所有场景
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const newSceneId = `scene_${Date.now()}_${i}`;
        createdSceneIds.push(newSceneId);

        // 保存AI返回的地图位置
        if (scene.mapX !== undefined && scene.mapY !== undefined) {
          newScenePositions[newSceneId] = {
            x: scene.mapX,
            y: scene.mapY,
            width: 180,
            height: 120
          };
        }

        // 为这个场景分配NPC（每个角色只分配一次）
        const sceneNpcs = [];
        if (availableCharacters.length > 0) {
          // 每个场景随机分配1-2个角色（如果还有可用的）
          const numToAssign = Math.min(Math.floor(Math.random() * 2) + 1, availableCharacters.length);
          for (let j = 0; j < numToAssign; j++) {
            const charIndex = Math.floor(Math.random() * availableCharacters.length);
            const char = availableCharacters.splice(charIndex, 1)[0];
            sceneNpcs.push(char.id);
          }
        }

        const newScene = {
          ...defaultScene,
          id: newSceneId,
          name: scene.name || `场景${i + 1}`,
          description: scene.description || '',
          isIndoor: scene.isIndoor !== undefined ? scene.isIndoor : null,
          spaceType: scene.spaceType || '',
          decorationStyle: scene.decorationStyle || '',
          mainFurniture: scene.mainFurniture || '',
          colorScheme: scene.colorScheme || '',
          lightSource: scene.lightSource || '',
          atmosphere: scene.atmosphere || '',
          viewAngle: scene.viewAngle || '',
          location: scene.location || '',
          seasonTime: scene.seasonTime || '',
          naturalElements: scene.naturalElements || '',
          skyDescription: scene.skyDescription || '',
          lightDescription: scene.lightDescription || '',
          colorAtmosphere: scene.colorAtmosphere || '',
          layout: scene.layout || '',
          photographer: scene.photographer || '',
          connectedScenes: [],
          npcs: sceneNpcs
        };

        // 设置场景连接（连接到前一个场景）
        if (i > 0) {
          newScene.connectedScenes.push(createdSceneIds[i - 1]);
          // 同时更新前一个场景，连接到当前场景
          const prevScene = state.scenes.find(s => s.id === createdSceneIds[i - 1]);
          if (prevScene) {
            dispatch({
              type: 'UPDATE_SCENE',
              payload: {
                id: createdSceneIds[i - 1],
                connectedScenes: [...(prevScene.connectedScenes || []), newSceneId]
              }
            });
          }
        }

        dispatch({ type: 'ADD_SCENE', payload: newScene });

        // 更新角色的当前场景位置
        sceneNpcs.forEach(charId => {
          dispatch({
            type: 'MOVE_CHARACTER',
            payload: { characterId: charId, sceneId: newSceneId }
          });
        });
      }

      setError(`成功生成 ${scenes.length} 个场景！${autoGenerateSceneImages ? ' 正在生成图片...' : ''}`);

      // 更新场景位置，使用AI返回的地图坐标
      if (Object.keys(newScenePositions).length > 0) {
        setScenePositions(prev => ({
          ...prev,
          ...newScenePositions
        }));
      }

      // 如果启用了自动生成图片，则为每个场景生成四个时间段的图片
      if (autoGenerateSceneImages) {
        for (let i = 0; i < createdSceneIds.length; i++) {
          const sceneId = createdSceneIds[i];
          const sceneData = scenes[i];
          setImageGenerateProgress(Math.round(((i + 1) / createdSceneIds.length) * 100));

          const tempScene = {
            name: sceneData.name,
            description: sceneData.description,
            isIndoor: sceneData.isIndoor !== undefined ? sceneData.isIndoor : null,
            spaceType: sceneData.spaceType || '',
            decorationStyle: sceneData.decorationStyle || '',
            mainFurniture: sceneData.mainFurniture || '',
            colorScheme: sceneData.colorScheme || '',
            lightSource: sceneData.lightSource || '',
            atmosphere: sceneData.atmosphere || '',
            viewAngle: sceneData.viewAngle || '',
            location: sceneData.location || '',
            seasonTime: sceneData.seasonTime || '',
            naturalElements: sceneData.naturalElements || '',
            skyDescription: sceneData.skyDescription || '',
            lightDescription: sceneData.lightDescription || '',
            colorAtmosphere: sceneData.colorAtmosphere || '',
            layout: sceneData.layout || '',
            photographer: sceneData.photographer || ''
          };
          const { imageUrl, sceneImages } = await generateSceneImages(tempScene);
          if (imageUrl) {
            dispatch({
              type: 'UPDATE_SCENE',
              payload: { id: sceneId, imageUrl, sceneImages }
            });
          }
        }
        setError(`成功生成 ${scenes.length} 个场景和图片！`);
      }
    } catch (err) {
      setError('生成失败: ' + err.message);
    } finally {
      setIsGeneratingBulk(false);
      setImageGenerateProgress(0);
    }
  };

  // 后端批量生成场景（异步）
  const handleBackendGenerateBulk = async () => {
    if (!state.world?.id) {
      setError('请先保存世界观到服务器');
      return;
    }

    setIsGeneratingBulk(true);
    setImageGenerateProgress(0);
    setError('正在调用后端批量生成场景，请稍候...');

    try {
      const result = await batchGenerateScenes(
        state.world.id,
        numScenes,
        null,
        autoGenerateSceneImages
      );

      console.log('Backend batch scene generation result:', result);

      if (!result.scenes || result.scenes.length === 0) {
        setError('后端返回数据为空');
        return;
      }

      const createdSceneIds = [];

      // 创建所有场景
      for (let i = 0; i < result.scenes.length; i++) {
        const sceneData = result.scenes[i];
        const newSceneId = sceneData.id || `scene_${Date.now()}_${i}`;
        createdSceneIds.push(newSceneId);

        // 保存地图位置
        if (sceneData.mapX !== undefined && sceneData.mapY !== undefined) {
          setScenePositions(prev => ({
            ...prev,
            [newSceneId]: {
              x: sceneData.mapX,
              y: sceneData.mapY,
              width: 180,
              height: 120
            }
          }));
        }

        const newScene = {
          ...defaultScene,
          id: newSceneId,
          name: sceneData.name || `场景${i + 1}`,
          description: sceneData.description || '',
          isIndoor: sceneData.isIndoor !== undefined ? sceneData.isIndoor : null,
          spaceType: sceneData.spaceType || '',
          decorationStyle: sceneData.decorationStyle || '',
          mainFurniture: sceneData.mainFurniture || '',
          colorScheme: sceneData.colorScheme || '',
          lightSource: sceneData.lightSource || '',
          atmosphere: sceneData.atmosphere || '',
          viewAngle: sceneData.viewAngle || '',
          location: sceneData.location || '',
          seasonTime: sceneData.seasonTime || '',
          naturalElements: sceneData.naturalElements || '',
          skyDescription: sceneData.skyDescription || '',
          lightDescription: sceneData.lightDescription || '',
          colorAtmosphere: sceneData.colorAtmosphere || '',
          layout: sceneData.layout || '',
          photographer: sceneData.photographer || '',
          imageUrl: sceneData.image_url || '',
          connectedScenes: [],
          npcs: []
        };

        // 设置场景连接（连接到前一个场景）
        if (i > 0) {
          newScene.connectedScenes.push(createdSceneIds[i - 1]);
          // 同时更新前一个场景，连接到当前场景
          const prevScene = state.scenes.find(s => s.id === createdSceneIds[i - 1]);
          if (prevScene) {
            dispatch({
              type: 'UPDATE_SCENE',
              payload: {
                id: createdSceneIds[i - 1],
                connectedScenes: [...(prevScene.connectedScenes || []), newSceneId]
              }
            });
          }
        }

        dispatch({ type: 'ADD_SCENE', payload: newScene });
      }

      setError(`后端成功生成 ${createdSceneIds.length} 个场景！${autoGenerateSceneImages ? '图片已在后台生成。' : ''}`);
    } catch (err) {
      console.error('Backend batch scene generation error:', err);
      setError('后端批量生成场景失败: ' + err.message);
    } finally {
      setIsGeneratingBulk(false);
      setImageGenerateProgress(0);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');

    try {
      const result = await generateWithAI(aiPrompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });
      if (result && typeof result === 'object') {
        const newSceneData = {
          name: result.name || '',
          description: result.description || '',
          isIndoor: result.isIndoor !== undefined ? result.isIndoor : null,
          spaceType: result.spaceType || '',
          decorationStyle: result.decorationStyle || '',
          mainFurniture: result.mainFurniture || '',
          colorScheme: result.colorScheme || '',
          lightSource: result.lightSource || '',
          atmosphere: result.atmosphere || '',
          viewAngle: result.viewAngle || '',
          location: result.location || '',
          seasonTime: result.seasonTime || '',
          naturalElements: result.naturalElements || '',
          skyDescription: result.skyDescription || '',
          lightDescription: result.lightDescription || '',
          colorAtmosphere: result.colorAtmosphere || '',
          layout: result.layout || '',
          photographer: result.photographer || ''
        };

        setEditingScene(prev => ({
          ...prev,
          ...newSceneData
        }));

        // 如果启用了自动生成图片，异步生成场景图（不阻塞）
        if (autoGenerateSceneImages) {
          const sceneId = newSceneData.id;
          // 立即标记为生成中，不阻塞 UI
          setAsyncSceneImageGen(prev => ({ ...prev, [sceneId]: { status: 'generating', imageUrl: null, sceneImages: {} } }));
          // 后台异步生成
          generateSceneImagesAsync(newSceneData, sceneId);
        }
      }
    } catch (err) {
      setError('生成失败: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) {
      setError('请输入图片生成提示词');
      return;
    }

    setIsGeneratingImage(true);
    setError('');

    try {
      const imageUrl = await generateImage(imagePrompt, imageSize);
      setEditingScene(prev => ({ ...prev, imageUrl }));
    } catch (err) {
      setError('图片生成失败: ' + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleStartPlaying = () => {
    if (state.scenes.length === 0) {
      setError('请至少创建一个场景');
      return;
    }
    if (!state.currentSceneId) {
      dispatch({ type: 'SET_CURRENT_SCENE', payload: state.scenes[0].id });
    }
    saveToLocalStorage(state);
    onStartPlaying();
  };

  const handleQuickSave = () => {
    saveToLocalStorage(state);
    setError('已保存到本地存储');
  };

  const handleExport = () => {
    exportSave(state);
  };

  const getSceneName = (id) => {
    const scene = state.scenes.find(s => s.id === id);
    return scene?.name || '未知场景';
  };

  const getCharacterName = (id) => {
    const char = state.characters.find(c => c.id === id);
    return char?.name || '未知角色';
  };

  return (
    <div className="scene-creation">
      <div className="creation-container">
        <div className="progress-steps">
          <div className="step" style={{ cursor: 'pointer' }}>
            <span className="step-number">1</span>
            <span>世界观</span>
          </div>
          <div className="step" style={{ cursor: 'pointer' }}>
            <span className="step-number">2</span>
            <span>主角设定</span>
          </div>
          <div className="step" style={{ cursor: 'pointer' }}>
            <span className="step-number">3</span>
            <span>角色</span>
          </div>
          <div className="step active">
            <span className="step-number">4</span>
            <span>场景</span>
          </div>
        </div>

        <div className="creation-header">
          <h2>创建场景</h2>
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              📋 列表视图
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
            >
              🗺️ 地图视图
            </button>
          </div>
          <div className="nav-buttons">
            <button className="nav-btn back" onClick={onBack}>上一步</button>
            <button className="nav-btn back" onClick={handleQuickSave}>保存</button>
            <button className="nav-btn back" onClick={handleExport}>导出</button>
            <button className="nav-btn next" onClick={handleStartPlaying}>开始游戏</button>
          </div>
        </div>

        <div className={`creation-content-row ${viewMode === 'map' ? 'full-width-map' : ''}`}>
          {/* 左侧列：批量生成场景和场景列表/地图 */}
          <div className={`creation-col-left ${viewMode === 'map' ? 'full-width' : ''}`}>
            {viewMode === 'list' ? (
              <div className="scrollable-content">
                <div className="ai-section">
                  <h3>批量生成场景</h3>
                  <div className="editor-grid">
                    <div className="form-group">
                      <label>生成场景数量</label>
                      <input
                        type="number"
                        min="2"
                        max="50"
                        value={numScenes}
                        onChange={(e) => setNumScenes(Math.max(2, Math.min(50, Number(e.target.value))))}
                        style={{ width: '100%', padding: '0.45rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.9rem' }}
                      />
                    </div>
                    <div className="form-group checkbox" style={{ display: 'flex', alignItems: 'center', paddingTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="autoGenerateSceneImagesBulk"
                        checked={autoGenerateSceneImages}
                        onChange={(e) => setAutoGenerateSceneImages(e.target.checked)}
                      />
                      <label htmlFor="autoGenerateSceneImagesBulk" style={{ margin: 0 }}>自动生成场景图片</label>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: '0.5rem' }}>
                    {imageGenerateProgress > 0 && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{
                          background: '#1a1a2e',
                          borderRadius: '5px',
                          height: '16px',
                          overflow: 'hidden',
                          border: '2px solid #2d3748'
                        }}>
                          <div style={{
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            height: '100%',
                            width: `${imageGenerateProgress}%`,
                            transition: 'width 0.3s ease'
                          }} />
                        </div>
                        <p style={{ textAlign: 'center', marginTop: '0.25rem', color: '#a0aec0', fontSize: '0.8rem' }}>
                          图片生成进度: {imageGenerateProgress}%
                        </p>
                      </div>
                    )}
                    <button
                      className="ai-btn generate"
                      onClick={handleGenerateBulk}
                      disabled={isGeneratingBulk}
                      style={{ width: '100%' }}
                    >
                      {isGeneratingBulk ? (imageGenerateProgress > 0 ? `生成图片中... ${imageGenerateProgress}%` : '生成场景中...') : '批量生成场景'}
                    </button>
                    <button
                      className="ai-btn"
                      onClick={handleBackendGenerateBulk}
                      disabled={isGeneratingBulk}
                      style={{ width: '100%', marginTop: '0.5rem', background: '#4c1d95' }}
                    >
                      {isGeneratingBulk ? '后端生成中...' : '后端批量生成（异步）'}
                    </button>
                    <button
                      className="ai-btn"
                      onClick={handleGenerateWorldMap}
                      disabled={isGeneratingWorldMap || !state.world?.id}
                      style={{ width: '100%', marginTop: '0.5rem', background: '#065f46' }}
                      title={!state.world?.id ? '请先保存世界观到服务器' : '根据世界观生成场景地图规划'}
                    >
                      {isGeneratingWorldMap ? '生成地图中...' : '🌐 生成世界地图'}
                    </button>
                  </div>
                  {error && <p className="error-message">{error}</p>}
                </div>

                <div className="scene-list">
                  {state.scenes.map(scene => (
                    <div
                      key={scene.id}
                      className={`scene-card ${selectedScene?.id === scene.id ? 'selected' : ''} ${state.currentSceneId === scene.id ? 'starting' : ''}`}
                      onClick={() => setSelectedScene(scene)}
                    >
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={scene.name}
                          className="scene-image"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalImage({ url: scene.imageUrl, alt: scene.name });
                          }}
                        />
                      ) : (
                        <div className="scene-image" />
                      )}
                      <div className="scene-info">
                        <h4>
                          {scene.name}
                          {state.currentSceneId === scene.id && (
                            <span className="starting-badge">起始场景</span>
                          )}
                        </h4>
                        <p>{scene.description}</p>
                        {scene.connectedScenes?.length > 0 && (
                          <div className="connected-scenes">
                            <span style={{ color: '#888', fontSize: '0.75rem' }}>可前往: </span>
                            {scene.connectedScenes.map(id => (
                              <span key={id} className="connected-tag">{getSceneName(id)}</span>
                            ))}
                          </div>
                        )}
                        {scene.npcs?.length > 0 && (
                          <div className="connected-scenes">
                            <span style={{ color: '#888', fontSize: '0.75rem' }}>角色: </span>
                            {scene.npcs.map(id => (
                              <span key={id} className="connected-tag">{getCharacterName(id)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="character-actions">
                        <button
                          className="small-btn edit"
                          onClick={(e) => { e.stopPropagation(); startEdit(scene); }}
                        >
                          编辑
                        </button>
                        <button
                          className="small-btn delete"
                          onClick={(e) => { e.stopPropagation(); deleteScene(scene.id); }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}

                  <button className="add-scene-btn" onClick={startAdd}>
                    + 添加新场景
                  </button>
                </div>
              </div>
            ) : (
              <div className="map-container">
                <SceneMapEditor
                  scenes={state.scenes}
                  onUpdateScene={handleUpdateSceneOnMap}
                  onAddScene={handleAddSceneOnMap}
                  onConnectScenes={handleConnectScenes}
                  currentSceneId={state.currentSceneId}
                  onSceneClick={handleSceneClickOnMap}
                />
              </div>
            )}
          </div>

          {/* 右侧列：场景编辑器 - 仅在列表视图时显示 */}
          {viewMode === 'list' && (
            <div className="creation-col-right">
              <div className="scrollable-content">
                {editingScene ? (
                  <div className="scene-editor">
                    <h3>{isAdding ? '添加新场景' : '编辑场景'}</h3>

                  <div className="form-group">
                    <label>场景名称</label>
                    <input
                      type="text"
                      value={editingScene.name}
                      onChange={(e) => setEditingScene(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="输入场景名称"
                    />
                  </div>

                  <div className="form-group">
                    <label>场景描述</label>
                    <textarea
                      value={editingScene.description}
                      onChange={(e) => setEditingScene(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="描述这个场景..."
                    />
                  </div>

                  <div className="form-group">
                    <label>场景类型</label>
                    <div className="checkbox-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                      <div className="checkbox-item">
                        <input
                          type="radio"
                          id="scene-indoor"
                          checked={editingScene.isIndoor === true}
                          onChange={() => setEditingScene(prev => ({ ...prev, isIndoor: true }))}
                        />
                        <label htmlFor="scene-indoor">室内场景</label>
                      </div>
                      <div className="checkbox-item">
                        <input
                          type="radio"
                          id="scene-outdoor"
                          checked={editingScene.isIndoor === false}
                          onChange={() => setEditingScene(prev => ({ ...prev, isIndoor: false }))}
                        />
                        <label htmlFor="scene-outdoor">室外场景</label>
                      </div>
                      <div className="checkbox-item">
                        <input
                          type="radio"
                          id="scene-unspecified"
                          checked={editingScene.isIndoor === null || editingScene.isIndoor === undefined}
                          onChange={() => setEditingScene(prev => ({ ...prev, isIndoor: null }))}
                        />
                        <label htmlFor="scene-unspecified">未指定</label>
                      </div>
                    </div>
                  </div>

                  {editingScene.isIndoor === true && (
                    <>
                      <div className="form-group">
                        <label>空间类型</label>
                        <input
                          type="text"
                          value={editingScene.spaceType || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, spaceType: e.target.value }))}
                          placeholder="如：客厅、卧室、酒馆大厅、洞穴内部等"
                        />
                      </div>
                      <div className="form-group">
                        <label>装修风格</label>
                        <input
                          type="text"
                          value={editingScene.decorationStyle || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, decorationStyle: e.target.value }))}
                          placeholder="如：中世纪欧式、现代简约、奇幻风格等"
                        />
                      </div>
                      <div className="form-group">
                        <label>主要家具陈设</label>
                        <input
                          type="text"
                          value={editingScene.mainFurniture || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, mainFurniture: e.target.value }))}
                          placeholder="描述主要的家具和陈设"
                        />
                      </div>
                      <div className="form-group">
                        <label>色彩搭配</label>
                        <input
                          type="text"
                          value={editingScene.colorScheme || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, colorScheme: e.target.value }))}
                          placeholder="如：暖色调、冷色调、深色系等"
                        />
                      </div>
                      <div className="form-group">
                        <label>光线来源</label>
                        <input
                          type="text"
                          value={editingScene.lightSource || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, lightSource: e.target.value }))}
                          placeholder="如：自然光从窗户照入、壁炉火光、吊灯照明等"
                        />
                      </div>
                      <div className="form-group">
                        <label>氛围描述</label>
                        <input
                          type="text"
                          value={editingScene.atmosphere || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, atmosphere: e.target.value }))}
                          placeholder="如：温馨舒适、神秘压抑、庄严华丽等"
                        />
                      </div>
                      <div className="form-group">
                        <label>视角描述</label>
                        <input
                          type="text"
                          value={editingScene.viewAngle || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, viewAngle: e.target.value }))}
                          placeholder="如：平视视角、俯视视角、从门口看入等"
                        />
                      </div>
                    </>
                  )}

                  {editingScene.isIndoor === false && (
                    <>
                      <div className="form-group">
                        <label>地理位置/地形</label>
                        <input
                          type="text"
                          value={editingScene.location || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, location: e.target.value }))}
                          placeholder="如：山谷、山顶、森林、海岸、草原等"
                        />
                      </div>
                      <div className="form-group">
                        <label>季节/时间</label>
                        <input
                          type="text"
                          value={editingScene.seasonTime || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, seasonTime: e.target.value }))}
                          placeholder="如：秋日黄昏、春日清晨、夏日正午、冬日夜幕等"
                        />
                      </div>
                      <div className="form-group">
                        <label>主要自然元素</label>
                        <input
                          type="text"
                          value={editingScene.naturalElements || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, naturalElements: e.target.value }))}
                          placeholder="描述主要的自然元素，如山、树、河流、岩石等"
                        />
                      </div>
                      <div className="form-group">
                        <label>天空描述</label>
                        <input
                          type="text"
                          value={editingScene.skyDescription || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, skyDescription: e.target.value }))}
                          placeholder="如：蓝天白云、星空璀璨、乌云密布、晚霞满天等"
                        />
                      </div>
                      <div className="form-group">
                        <label>光线描述</label>
                        <input
                          type="text"
                          value={editingScene.lightDescription || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, lightDescription: e.target.value }))}
                          placeholder="如：阳光明媚、月光皎洁、晨光柔和、暮色四合等"
                        />
                      </div>
                      <div className="form-group">
                        <label>色彩氛围</label>
                        <input
                          type="text"
                          value={editingScene.colorAtmosphere || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, colorAtmosphere: e.target.value }))}
                          placeholder="如：色彩鲜明、色调柔和、金色黄昏、蓝色忧郁等"
                        />
                      </div>
                      <div className="form-group">
                        <label>前景/中景/远景布局</label>
                        <input
                          type="text"
                          value={editingScene.layout || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, layout: e.target.value }))}
                          placeholder="描述画面的层次布局"
                        />
                      </div>
                      <div className="form-group">
                        <label>参考摄影师风格</label>
                        <input
                          type="text"
                          value={editingScene.photographer || ''}
                          onChange={(e) => setEditingScene(prev => ({ ...prev, photographer: e.target.value }))}
                          placeholder="如：National Geographic、Ansel Adams等"
                        />
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label>场景图片 URL（可选，默认图片）</label>
                    <input
                      type="text"
                      value={editingScene.imageUrl}
                      onChange={(e) => setEditingScene(prev => ({ ...prev, imageUrl: e.target.value }))}
                      placeholder="https://example.com/scene.jpg"
                    />
                  </div>

                  <div style={{ margin: '1rem 0', borderTop: '1px solid #2d3748', paddingTop: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: '#e2e8f0' }}>分时间段场景图片（可选）</h4>
                    <div className="editor-grid">
                      <div className="form-group">
                        <label>🌅 早晨图片（6:00-10:00）</label>
                        <input
                          type="text"
                          value={editingScene.sceneImages?.morning || ''}
                          onChange={(e) => setEditingScene(prev => ({
                            ...prev,
                            sceneImages: { ...prev.sceneImages, morning: e.target.value }
                          }))}
                          placeholder="早晨场景图片 URL"
                        />
                      </div>
                      <div className="form-group">
                        <label>☀️ 中午图片（10:00-14:00）</label>
                        <input
                          type="text"
                          value={editingScene.sceneImages?.noon || ''}
                          onChange={(e) => setEditingScene(prev => ({
                            ...prev,
                            sceneImages: { ...prev.sceneImages, noon: e.target.value }
                          }))}
                          placeholder="中午场景图片 URL"
                        />
                      </div>
                      <div className="form-group">
                        <label>🌇 傍晚图片（14:00-18:00）</label>
                        <input
                          type="text"
                          value={editingScene.sceneImages?.evening || ''}
                          onChange={(e) => setEditingScene(prev => ({
                            ...prev,
                            sceneImages: { ...prev.sceneImages, evening: e.target.value }
                          }))}
                          placeholder="傍晚场景图片 URL"
                        />
                      </div>
                      <div className="form-group">
                        <label>🌙 晚上图片（18:00-6:00）</label>
                        <input
                          type="text"
                          value={editingScene.sceneImages?.night || ''}
                          onChange={(e) => setEditingScene(prev => ({
                            ...prev,
                            sceneImages: { ...prev.sceneImages, night: e.target.value }
                          }))}
                          placeholder="晚上场景图片 URL"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 异步生成中提示 */}
                  {asyncSceneImageGen[editingScene?.id]?.status === 'generating' && (
                    <div className="preview-section">
                      <h3>场景图片预览</h3>
                      <div className="generating-indicator">
                        <span className="spinner">⏳</span>
                        <span>AI 正在生成四个时间段的场景图片...</span>
                      </div>
                    </div>
                  )}

                  {/* 场景图片预览 */}
                  {asyncSceneImageGen[editingScene?.id]?.status !== 'generating' && (() => {
                    const imagesToShow = [];
                    if (editingScene.imageUrl) {
                      imagesToShow.push({ url: editingScene.imageUrl, label: '默认图片' });
                    }
                    if (editingScene.sceneImages?.morning) {
                      imagesToShow.push({ url: editingScene.sceneImages.morning, label: '早晨' });
                    }
                    if (editingScene.sceneImages?.noon) {
                      imagesToShow.push({ url: editingScene.sceneImages.noon, label: '中午' });
                    }
                    if (editingScene.sceneImages?.evening) {
                      imagesToShow.push({ url: editingScene.sceneImages.evening, label: '傍晚' });
                    }
                    if (editingScene.sceneImages?.night) {
                      imagesToShow.push({ url: editingScene.sceneImages.night, label: '晚上' });
                    }
                    if (imagesToShow.length === 0) return null;
                    return (
                      <div className="preview-section">
                        <h3>场景图片预览</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                          {imagesToShow.map((img, idx) => (
                            <div key={idx} style={{ textAlign: 'center' }}>
                              <p style={{ margin: '0 0 0.5rem 0', color: '#a0aec0', fontSize: '0.85rem' }}>{img.label}</p>
                              <img
                                src={img.url}
                                alt={img.label}
                                style={{
                                  width: '100%',
                                  height: '120px',
                                  objectFit: 'cover',
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  border: '2px solid #2d3748'
                                }}
                                onClick={() => setModalImage({ url: img.url, alt: img.label })}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {state.scenes.length > 0 && (
                    <div className="connections-section">
                      <h4>可前往的场景</h4>
                      <div className="checkbox-grid">
                        {state.scenes
                          .filter(s => s.id !== editingScene.id)
                          .map(scene => (
                            <div key={scene.id} className="checkbox-item">
                              <input
                                type="checkbox"
                                id={`conn_${scene.id}`}
                                checked={(editingScene.connectedScenes || []).includes(scene.id)}
                                onChange={() => toggleConnection(scene.id)}
                              />
                              <label htmlFor={`conn_${scene.id}`}>{scene.name}</label>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {state.characters.length > 0 && (
                    <div className="npcs-section">
                      <h4>此场景的角色</h4>
                      <div className="checkbox-grid">
                        {state.characters.map(char => {
                          // 检查角色是否在其他场景中
                          const isInOtherScene = state.scenes.some(scene =>
                            scene.id !== editingScene.id && scene.npcs && scene.npcs.includes(char.id)
                          );
                          const otherScene = state.scenes.find(scene =>
                            scene.id !== editingScene.id && scene.npcs && scene.npcs.includes(char.id)
                          );
                          const isChecked = (editingScene.npcs || []).includes(char.id);

                          return (
                            <div
                              key={char.id}
                              className={`checkbox-item ${isInOtherScene && !isChecked ? 'disabled' : ''}`}
                              title={isInOtherScene && !isChecked ? `已在场景"${otherScene?.name}"中` : ''}
                            >
                              <input
                                type="checkbox"
                                id={`npc_${char.id}`}
                                checked={isChecked}
                                onChange={() => toggleNPC(char.id)}
                                disabled={isInOtherScene && !isChecked}
                              />
                              <label htmlFor={`npc_${char.id}`}>
                                {char.name}
                                {isInOtherScene && !isChecked && (
                                  <span style={{ color: '#e94560', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                                    (在 {otherScene?.name})
                                  </span>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="starting-section">
                    <div className="form-group checkbox">
                      <input
                        type="checkbox"
                        id="isStarting"
                        checked={state.currentSceneId === editingScene.id}
                        onChange={setStartingScene}
                      />
                      <label htmlFor="isStarting">
                        设为起始场景
                        {state.currentSceneId === editingScene.id && (
                          <span className="starting-badge">当前</span>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="ai-section">
                    <h3>AI 生成场景</h3>
                    <div className="api-config">
                      <div className="api-config-row">
                        <button className="ai-btn" onClick={onOpenApiSettings}>API 设置</button>
                      </div>
                    </div>

                    <div className="ai-prompt-area">
                      <textarea
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="输入AI生成提示词..."
                      />
                      <div className="form-group checkbox" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          id="autoGenerateSceneImages"
                          checked={autoGenerateSceneImages}
                          onChange={(e) => setAutoGenerateSceneImages(e.target.checked)}
                        />
                        <label htmlFor="autoGenerateSceneImages" style={{ margin: 0 }}>同时自动生成场景图片</label>
                      </div>
                      <div className="ai-buttons">
                        <button
                          className="ai-btn generate"
                          onClick={handleGenerate}
                          disabled={isGenerating}
                        >
                          {isGenerating ? (isGeneratingImage ? '生成图片中...' : '生成场景中...') : 'AI 生成场景'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="ai-section">
                    <h3>图片生成</h3>
                    <div className="ai-prompt-area">
                      <div className="api-config-row">
                        <input
                          type="text"
                          value={imagePrompt}
                          onChange={(e) => setImagePrompt(e.target.value)}
                          placeholder="图片提示词，例如：一个神秘的森林场景..."
                        />
                        <select
                          value={imageSize}
                          onChange={(e) => setImageSize(e.target.value)}
                          style={{ flex: '0 0 110px', padding: '0.4rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.85rem' }}
                        >
                          <option value="16:9">16:9 (风景)</option>
                          <option value="9:16">9:16</option>
                          <option value="1:1">1:1</option>
                          <option value="4:3">4:3</option>
                          <option value="3:4">3:4</option>
                        </select>
                      </div>
                      <div className="ai-buttons">
                        <button
                          className="ai-btn generate"
                          onClick={handleGenerateImage}
                          disabled={isGeneratingImage}
                        >
                          {isGeneratingImage ? '图片生成中...' : 'AI 生成场景图'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="editor-actions">
                    <button className="nav-btn cancel" onClick={cancelEdit}>取消</button>
                    <button className="nav-btn save" onClick={saveScene}>保存</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666', fontSize: '0.9rem' }}>
                  请选择一个场景或添加新场景进行编辑
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

      <ImageModal
        imageUrl={modalImage?.url}
        alt={modalImage?.alt}
        onClose={() => setModalImage(null)}
      />

      {/* 世界地图确认对话框 */}
      {worldMapDialog && (
        <div className="modal-overlay" onClick={() => setWorldMapDialog(null)}>
          <div className="modal-content world-map-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem', color: '#f39c12' }}>世界地图预览</h3>
            <p style={{ marginBottom: '1rem', color: '#ccc', fontSize: '0.9rem' }}>
              以下是根据世界观生成的场景地图，请确认是否使用。
            </p>

            <div
              className="mermaid-container"
              ref={mermaidRef}
              onClick={() => setMermaidExpanded(true)}
              style={{
                background: '#1a1a2e',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1rem',
                minHeight: '300px',
                maxHeight: '400px',
                overflow: 'auto',
                cursor: 'zoom-in'
              }}
            >
              {!mermaidRendered ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: '#888' }}>
                  <span className="spinner">⏳</span> 渲染中...
                </div>
              ) : mermaidSvg ? (
                <div
                  dangerouslySetInnerHTML={{ __html: mermaidSvg }}
                  style={{ display: 'flex', justifyContent: 'center' }}
                />
              ) : (
                <div style={{ color: '#e94560', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                  {worldMapDialog.mermaidCode}
                </div>
              )}
            </div>
            <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
              💡 点击地图可放大查看
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="nav-btn back"
                onClick={() => setWorldMapDialog(null)}
              >
                取消
              </button>
              <button
                className="nav-btn back"
                onClick={handleGenerateWorldMap}
                disabled={isGeneratingWorldMap}
              >
                {isGeneratingWorldMap ? '重新生成中...' : '重新生成'}
              </button>
              <button
                className="nav-btn next"
                onClick={handleGenerateScenesFromMap}
                disabled={isGeneratingBulk}
              >
                {isGeneratingBulk ? '生成中...' : '同意使用此地图'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mermaid 放大查看对话框 */}
      {mermaidExpanded && (
        <div className="modal-overlay" onClick={() => setMermaidExpanded(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '95vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: '#f39c12', margin: 0 }}>世界地图预览</h3>
              <button
                className="nav-btn back"
                onClick={() => setMermaidExpanded(false)}
                style={{ padding: '0.3rem 0.8rem' }}
              >
                关闭
              </button>
            </div>
            <div
              style={{
                background: '#1a1a2e',
                borderRadius: '8px',
                padding: '1rem',
                overflow: 'auto',
                maxHeight: 'calc(95vh - 80px)'
              }}
            >
              {mermaidSvg ? (
                <div
                  dangerouslySetInnerHTML={{ __html: mermaidSvg }}
                  style={{ display: 'flex', justifyContent: 'center' }}
                />
              ) : (
                <pre style={{ color: '#e94560', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                  {worldMapDialog?.mermaidCode}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SceneCreation;
