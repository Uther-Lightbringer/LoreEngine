import React, { useState, useEffect } from 'react';
import { useGameState } from '../store/gameState.jsx';
import { generateWithAI, MAX_TOKENS } from '../services/aiService.js';
import { generateImage } from '../services/imageService.js';
import { defaultCharacter } from '../data/templates.js';
import ImageModal from './ImageModal.jsx';
import './ProtagonistCreation.css';
import './WorldCreation.css';

const ProtagonistCreation = ({ onNext, onBack, onOpenApiSettings }) => {
  const { state, dispatch } = useGameState();

  // 找到已有的主角，或者创建新的
  const existingProtagonist = state.characters.find(c => c.isProtagonist);

  const [protagonist, setProtagonist] = useState(
    existingProtagonist || {
      ...defaultCharacter,
      id: `protagonist_${Date.now()}`,
      isProtagonist: true
    }
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState('2:3');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const [modalImage, setModalImage] = useState(null);

  // 主角设定的额外选项
  const [roleType, setRoleType] = useState('hero'); // hero, antiHero, neutral, villain
  const [background, setBackground] = useState('');
  const [motivation, setMotivation] = useState('');
  const [skills, setSkills] = useState([
    { name: '', description: '' }
  ]);

  // 从已存在的主角初始化技能
  useEffect(() => {
    if (existingProtagonist?.skills?.length > 0) {
      setSkills(existingProtagonist.skills);
    }
  }, []);

  const buildProtagonistPrompt = () => {
    const roleTypeNames = {
      hero: '英雄/正面角色',
      antiHero: '反英雄',
      neutral: '中立角色',
      villain: '反派角色'
    };

    let prompt = `世界观：${state.world.name || '未设定'}
${state.world.description || ''}

请生成一个主角设定，角色类型：${roleTypeNames[roleType] || roleType}

`;

    if (background.trim()) {
      prompt += `背景故事参考：${background.trim()}\n`;
    }
    if (motivation.trim()) {
      prompt += `动机/目标：${motivation.trim()}\n`;
    }
    const validSkills = skills.filter(s => s.name.trim());
    if (validSkills.length > 0) {
      prompt += `技能/特长：${validSkills.map(s => `${s.name}${s.description ? `(${s.description})` : ''}`).join('、')}\n`;
    }

    prompt += `
请用JSON格式返回，格式如下：
{
  "name": "角色名",
  "age": "年龄（如：25岁、17岁）",
  "gender": "性别（男、女、其他）",
  "personality": "性格特点（100-200字）",
  "appearance": "外貌描述（100-200字）",
  "background": "背景故事（150-300字）",
  "physicalAppearance": {
    "hairStyle": "发型（如：长直发、短卷发、马尾）",
    "hairColor": "发色（如：黑色、金色、银色）",
    "eyeColor": "瞳色（如：蓝色、琥珀色、紫色）",
    "bodyType": "体型（如：高挑、娇小、匀称）",
    "clothing": "穿着（如：法师长袍、便装、骑士铠甲）"
  },
  "expression": {
    "currentExpression": "自然",
    "expressionIntensity": "平静",
    "facialDetails": ""
  }
}`;

    return prompt;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');

    try {
      const prompt = buildProtagonistPrompt();
      const result = await generateWithAI(prompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });
      if (result && typeof result === 'object') {
        setProtagonist(prev => ({
          ...prev,
          name: result.name || prev.name,
          age: result.age || prev.age,
          gender: result.gender || prev.gender,
          personality: result.personality || prev.personality,
          appearance: result.appearance || prev.appearance,
          background: result.background || prev.background,
          characterStatus: {
            ...prev.characterStatus,
            physicalAppearance: result.physicalAppearance || prev.characterStatus?.physicalAppearance,
            expression: result.expression || prev.characterStatus?.expression
          }
        }));
      }
    } catch (err) {
      setError('生成失败: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() && !protagonist?.name && !protagonist?.appearance) {
      setError('请输入图片生成提示词');
      return;
    }

    setIsGeneratingImage(true);
    setError('');

    try {
      let prompt;
      if (imagePrompt.trim()) {
        prompt = imagePrompt.trim();
      } else {
        const physicalAppearance = protagonist.characterStatus?.physicalAppearance || {};
        const expression = protagonist.characterStatus?.expression || {};

        // 提取年龄
        let ageText = '';
        if (protagonist.age) {
          const ageMatch = protagonist.age.match(/(\d+)/);
          ageText = ageMatch ? ageMatch[1] : '';
        }

        // 构建提示词
        const promptParts = [];
        promptParts.push(`一位${ageText || ''}岁${protagonist.gender || ''}`);

        // 发型描述
        const hairParts = [];
        if (physicalAppearance.hairColor) hairParts.push(physicalAppearance.hairColor);
        if (physicalAppearance.hairStyle) hairParts.push(physicalAppearance.hairStyle);
        if (hairParts.length > 0) {
          promptParts.push(`，${hairParts.join('')}`);
        }

        // 表情描述
        if (expression.currentExpression && expression.currentExpression !== '自然') {
          promptParts.push(`，${expression.currentExpression}的表情`);
        }

        // 服装描述
        promptParts.push(`，穿着${physicalAppearance.clothing || '适合的服装'}`);

        // 姿态描述
        promptParts.push(`，自然站立姿态`);

        // 背景环境
        promptParts.push(`，${state.world.name || '奇幻'}风格背景`);

        // 摄影技术参数
        promptParts.push(`，背景虚化，浅景深`);
        promptParts.push(`，柔和自然光，面部光线柔和均匀`);
        promptParts.push(`，专业人像摄影风格，85mm f/1.8镜头`);
        promptParts.push(`，高清，细节丰富，皮肤质感自然`);

        prompt = promptParts.join('');
      }

      const imageUrl = await generateImage(prompt, imageSize);
      setProtagonist(prev => ({ ...prev, imageUrl }));
    } catch (err) {
      setError('图片生成失败: ' + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleNext = () => {
    if (!protagonist.name.trim()) {
      setError('请输入主角姓名');
      return;
    }

    // 保存技能（过滤空技能）
    const validSkills = skills.filter(s => s.name.trim());

    // 如果主角已存在，更新；否则添加
    if (existingProtagonist) {
      dispatch({ type: 'UPDATE_CHARACTER', payload: { ...protagonist, skills: validSkills } });
    } else {
      dispatch({ type: 'ADD_CHARACTER', payload: { ...protagonist, skills: validSkills } });
    }

    // 初始化玩家状态栏
    dispatch({
      type: 'UPDATE_PLAYER_STATUS',
      payload: {
        hp: 100,
        maxHp: 100,
        mp: 50,
        maxMp: 50,
        status: "",
        gold: 0,
        level: 1,
        exp: 0
      }
    });

    // 初始化主角性格状态
    dispatch({
      type: 'INIT_PROTAGONIST_PERSONALITY',
      payload: {
        description: protagonist.personality || ""
      }
    });

    onNext();
  };

  return (
    <div className="protagonist-creation">
      <div className="creation-container">
        <div className="progress-steps">
          <div className="step" onClick={onBack} style={{ cursor: 'pointer' }}>
            <span className="step-number">1</span>
            <span>世界观</span>
          </div>
          <div className="step active">
            <span className="step-number">2</span>
            <span>主角设定</span>
          </div>
          <div className="step">
            <span className="step-number">3</span>
            <span>角色</span>
          </div>
          <div className="step">
            <span className="step-number">4</span>
            <span>场景</span>
          </div>
        </div>

        <div className="creation-header">
          <h2>设定你是谁</h2>
          <div className="nav-buttons">
            <button className="nav-btn back" onClick={onBack}>上一步</button>
            <button className="nav-btn next" onClick={handleNext}>下一步: 其他角色</button>
          </div>
        </div>

        <div className="creation-content-row">
          {/* 左侧列：主角类型和AI生成 */}
          <div className="creation-col-left">
            <div className="scrollable-content">
              <div className="protagonist-intro">
                <p>在开始冒险之前，先设定你在这个世界中的身份。这将影响你如何与这个世界互动。</p>
              </div>

              <div className="ai-section">
                <h3>主角类型</h3>
                <div className="role-type-grid">
                  <div
                    className={`role-type-card ${roleType === 'hero' ? 'selected' : ''}`}
                    onClick={() => setRoleType('hero')}
                  >
                    <div className="role-icon">🦸</div>
                    <div className="role-name">英雄</div>
                    <div className="role-desc">正义、勇敢、帮助他人</div>
                  </div>
                  <div
                    className={`role-type-card ${roleType === 'antiHero' ? 'selected' : ''}`}
                    onClick={() => setRoleType('antiHero')}
                  >
                    <div className="role-icon">😎</div>
                    <div className="role-name">反英雄</div>
                    <div className="role-desc">有自己的原则，亦正亦邪</div>
                  </div>
                  <div
                    className={`role-type-card ${roleType === 'neutral' ? 'selected' : ''}`}
                    onClick={() => setRoleType('neutral')}
                  >
                    <div className="role-icon">🧭</div>
                    <div className="role-name">中立</div>
                    <div className="role-desc">随性而为，追求自由</div>
                  </div>
                  <div
                    className={`role-type-card ${roleType === 'villain' ? 'selected' : ''}`}
                    onClick={() => setRoleType('villain')}
                  >
                    <div className="role-icon">😈</div>
                    <div className="role-name">反派</div>
                    <div className="role-desc">为达目的，不择手段</div>
                  </div>
                </div>

                <div className="editor-grid">
                  <div className="form-group">
                    <label>背景故事（可选）</label>
                    <textarea
                      value={background}
                      onChange={(e) => setBackground(e.target.value)}
                      placeholder="描述你的过去、来自哪里、经历过什么..."
                      rows={3}
                    />
                  </div>
                  <div className="form-group">
                    <label>动机/目标（可选）</label>
                    <textarea
                      value={motivation}
                      onChange={(e) => setMotivation(e.target.value)}
                      placeholder="你想要什么？复仇、寻找真相、还是改变世界？"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>技能/特长（可选）</label>
                  <div className="skills-list">
                    {skills.map((skill, index) => (
                      <div key={index} className="skill-item" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                        <input
                          type="text"
                          value={skill.name}
                          onChange={(e) => {
                            const newSkills = [...skills];
                            newSkills[index].name = e.target.value;
                            setSkills(newSkills);
                          }}
                          placeholder="技能名称"
                          style={{ flex: '1', minWidth: '100px' }}
                        />
                        <input
                          type="text"
                          value={skill.description}
                          onChange={(e) => {
                            const newSkills = [...skills];
                            newSkills[index].description = e.target.value;
                            setSkills(newSkills);
                          }}
                          placeholder="技能效果"
                          style={{ flex: '2', minWidth: '150px' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (skills.length > 1) {
                              setSkills(skills.filter((_, i) => i !== index));
                            }
                          }}
                          disabled={skills.length <= 1}
                          style={{ padding: '0.4rem 0.6rem', cursor: skills.length <= 1 ? 'not-allowed' : 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="small-btn"
                      onClick={() => setSkills([...skills, { name: '', description: '' }])}
                      style={{ marginTop: '0.5rem' }}
                    >
                      + 添加技能
                    </button>
                  </div>
                </div>

                <div className="api-config">
                  <div className="api-config-row">
                    <button
                      className="ai-btn generate"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      {isGenerating ? '生成中...' : 'AI 生成主角'}
                    </button>
                    <button className="ai-btn" onClick={onOpenApiSettings}>API 设置</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧列：主角信息编辑和图片生成 */}
          <div className="creation-col-right">
            <div className="scrollable-content">
              <div className="form-group">
                <label>你的名字</label>
                <input
                  type="text"
                  value={protagonist.name}
                  onChange={(e) => setProtagonist(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="你叫什么名字？"
                />
              </div>

              <div className="editor-grid">
                <div className="form-group">
                  <label>年龄</label>
                  <input
                    type="text"
                    value={protagonist.age || ''}
                    onChange={(e) => setProtagonist(prev => ({ ...prev, age: e.target.value }))}
                    placeholder="例如：25岁、17岁"
                  />
                </div>

                <div className="form-group">
                  <label>性别</label>
                  <select
                    value={protagonist.gender || ''}
                    onChange={(e) => setProtagonist(prev => ({ ...prev, gender: e.target.value }))}
                  >
                    <option value="">请选择...</option>
                    <option value="男">男</option>
                    <option value="女">女</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>性格特点</label>
                <textarea
                  value={protagonist.personality}
                  onChange={(e) => setProtagonist(prev => ({ ...prev, personality: e.target.value }))}
                  placeholder="描述你的性格..."
                />
              </div>

              <div className="form-group">
                <label>外貌描述</label>
                <textarea
                  value={protagonist.appearance}
                  onChange={(e) => setProtagonist(prev => ({ ...prev, appearance: e.target.value }))}
                  placeholder="描述你的样子..."
                />
              </div>

              <div className="form-group">
                <label>背景故事</label>
                <textarea
                  value={protagonist.background || ''}
                  onChange={(e) => setProtagonist(prev => ({ ...prev, background: e.target.value }))}
                  placeholder="你的故事..."
                />
              </div>

              <div className="form-group">
                <label>主角头像 URL（可选）</label>
                <input
                  type="text"
                  value={protagonist.imageUrl}
                  onChange={(e) => setProtagonist(prev => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              {protagonist.imageUrl && (
                <div className="preview-section">
                  <h3>头像预览</h3>
                  <img
                    src={protagonist.imageUrl}
                    alt="头像预览"
                    className="preview-image"
                    onClick={() => setModalImage({ url: protagonist.imageUrl, alt: protagonist.name || '主角头像' })}
                  />
                </div>
              )}

              <div className="ai-section">
                <h3>图片生成</h3>
                <div className="ai-prompt-area">
                  <div className="api-config-row">
                    <input
                      type="text"
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="图片提示词，例如：一个年轻的魔法师角色肖像..."
                    />
                    <select
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value)}
                      style={{ flex: '0 0 110px', padding: '0.4rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.85rem' }}
                    >
                      <option value="2:3">2:3 (肖像)</option>
                      <option value="3:2">3:2</option>
                      <option value="1:1">1:1</option>
                      <option value="3:4">3:4</option>
                      <option value="4:3">4:3</option>
                    </select>
                  </div>
                  <div className="ai-buttons">
                    <button
                      className="ai-btn generate"
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImage}
                    >
                      {isGeneratingImage ? '图片生成中...' : 'AI 生成头像'}
                    </button>
                  </div>
                </div>
              </div>

              {error && <p className="error-message">{error}</p>}
            </div>
          </div>
        </div>
      </div>

      <ImageModal
        imageUrl={modalImage?.url}
        alt={modalImage?.alt}
        onClose={() => setModalImage(null)}
      />
    </div>
  );
};

export default ProtagonistCreation;
