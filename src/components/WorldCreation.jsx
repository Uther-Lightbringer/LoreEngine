import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameState } from '../store/gameState.jsx';
import { generateWithAI, MAX_TOKENS } from '../services/aiService.js';
import { generateImage } from '../services/imageService.js';
import { saveWorldToDatabase, setCurrentWorldId } from '../services/saveService.js';
import ImageModal from './ImageModal.jsx';
import './WorldCreation.css';

const WorldCreation = ({ onOpenApiSettings }) => {
  const navigate = useNavigate();
  const { state, dispatch } = useGameState();
  const [world, setWorld] = useState(state.world);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const [keywords, setKeywords] = useState('');
  const [genre, setGenre] = useState('fantasy');
  const [tone, setTone] = useState('epic');

  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState('16:9');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [modalImage, setModalImage] = useState(null);

  const buildWorldPrompt = () => {
    const genreNames = {
      fantasy: '奇幻',
      sciFi: '科幻',
      modern: '现代',
      historical: '历史',
      horror: '恐怖',
      mystery: '悬疑',
      romance: '浪漫',
      adventure: '冒险'
    };

    const toneNames = {
      epic: '史诗',
      light: '轻松',
      dark: '黑暗',
      humorous: '幽默',
      serious: '严肃',
      mysterious: '神秘'
    };

    let prompt = `请生成一个完整的世界观设定，包含以下要素：

类型：${genreNames[genre] || genre}
风格：${toneNames[tone] || tone}`;

    if (keywords.trim()) {
      prompt += `\n关键词：${keywords.trim()}`;
    }

    prompt += `

请用JSON格式返回，格式如下：
{
  "name": "世界观名称",
  "description": "详细的世界观描述，包括背景历史、地理环境、社会结构、魔法/科技体系等（200-500字）"
}`;

    return prompt;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError('');

    try {
      const prompt = buildWorldPrompt();
      const result = await generateWithAI(prompt, 'deepseek', { maxTokens: MAX_TOKENS.CONTENT, jsonResponse: true });
      if (result && typeof result === 'object') {
        setWorld(prev => ({
          ...prev,
          name: result.name || prev.name,
          description: result.description || prev.description
        }));
      } else if (typeof result === 'string') {
        setWorld(prev => ({
          ...prev,
          description: result
        }));
      }
    } catch (err) {
      setError('生成失败: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const buildImagePrompt = () => {
    if (imagePrompt.trim()) {
      return imagePrompt;
    }

    let imgPrompt = '';
    if (world.name) {
      imgPrompt += `${world.name}, `;
    }
    if (world.description) {
      imgPrompt += world.description.substring(0, 200);
    }
    if (keywords.trim()) {
      imgPrompt += `, ${keywords.trim()}`;
    }
    imgPrompt += ', fantasy landscape, epic scenery, high detail, digital art';

    return imgPrompt || 'a beautiful fantasy landscape';
  };

  const handleGenerateImage = async () => {
    setIsGeneratingImage(true);
    setError('');

    try {
      const prompt = buildImagePrompt();
      const imageUrl = await generateImage(prompt, imageSize);
      setWorld(prev => ({ ...prev, imageUrl }));
    } catch (err) {
      setError('图片生成失败: ' + err.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleNext = async () => {
    // 自动保存世界观到数据库
    if (world.name) {
      try {
        const worldId = await saveWorldToDatabase(world);
        if (worldId) {
          setCurrentWorldId(worldId);
          // 更新 state.world.id 为数据库返回的 ID
          dispatch({ type: 'UPDATE_WORLD', payload: { ...world, id: worldId } });
        } else {
          dispatch({ type: 'UPDATE_WORLD', payload: world });
        }
      } catch (error) {
        console.error('Failed to save world to database:', error);
        dispatch({ type: 'UPDATE_WORLD', payload: world });
      }
    } else {
      dispatch({ type: 'UPDATE_WORLD', payload: world });
    }
    navigate('/create/protagonist');
  };

  return (
    <div className="world-creation">
      <div className="creation-container">
        <div className="progress-steps">
          <div className="step active">
            <span className="step-number">1</span>
            <span>世界观</span>
          </div>
          <div className="step">
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
          <h2>创建世界观</h2>
          <div className="nav-buttons">
            <button className="nav-btn back" onClick={() => navigate('/')}>返回</button>
            <button className="nav-btn next" onClick={handleNext}>下一步: 主角设定</button>
          </div>
        </div>

        <div className="creation-content-row">
          {/* 左侧列：世界观设定 */}
          <div className="creation-col-left">
            <div className="scrollable-content">
              <div className="ai-section">
                <h3>世界观设定</h3>

                <div className="editor-grid">
                  <div className="form-group">
                    <label>类型</label>
                    <select
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.9rem' }}
                    >
                      <option value="fantasy">奇幻</option>
                      <option value="sciFi">科幻</option>
                      <option value="modern">现代</option>
                      <option value="historical">历史</option>
                      <option value="horror">恐怖</option>
                      <option value="mystery">悬疑</option>
                      <option value="romance">浪漫</option>
                      <option value="adventure">冒险</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>风格</label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.9rem' }}
                    >
                      <option value="epic">史诗</option>
                      <option value="light">轻松</option>
                      <option value="dark">黑暗</option>
                      <option value="humorous">幽默</option>
                      <option value="serious">严肃</option>
                      <option value="mysterious">神秘</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>关键词（用逗号分隔）</label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="例如：魔法, 龙, 中世纪, 王国..."
                  />
                </div>

                <div className="api-config">
                  <div className="api-config-row">
                    <button
                      className="ai-btn generate"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      {isGenerating ? '生成中...' : 'AI 生成世界观'}
                    </button>
                    <button className="ai-btn" onClick={onOpenApiSettings}>API 设置</button>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>世界观名称</label>
                <input
                  type="text"
                  value={world.name}
                  onChange={(e) => setWorld(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="输入世界观名称..."
                />
              </div>

              <div className="form-group">
                <label>世界观描述</label>
                <textarea
                  value={world.description}
                  onChange={(e) => setWorld(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="描述这个世界的背景、规则和特色..."
                />
              </div>

              <div className="form-group">
                <label>世界观图片 URL（可选）</label>
                <input
                  type="text"
                  value={world.imageUrl}
                  onChange={(e) => setWorld(prev => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </div>
          </div>

          {/* 右侧列：图片生成和预览 */}
          <div className="creation-col-right">
            <div className="scrollable-content">
              <div className="ai-section">
                <h3>图片生成</h3>
                <div className="ai-prompt-area">
                  <div className="api-config-row">
                    <input
                      type="text"
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="图片提示词（留空则根据世界观自动生成）"
                    />
                    <select
                      value={imageSize}
                      onChange={(e) => setImageSize(e.target.value)}
                      style={{ flex: '0 0 110px', padding: '0.4rem', border: '2px solid #2d3748', borderRadius: '5px', background: '#1a1a2e', color: '#eee', fontSize: '0.85rem' }}
                    >
                      <option value="1:1">1:1</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
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
                      {isGeneratingImage ? '图片生成中...' : 'AI 生成图片'}
                    </button>
                  </div>
                </div>
              </div>

              {error && <p className="error-message">{error}</p>}

              {world.imageUrl && (
                <div className="preview-section">
                  <h3>预览</h3>
                  <img
                    src={world.imageUrl}
                    alt="世界观预览"
                    className="preview-image"
                    onClick={() => setModalImage({ url: world.imageUrl, alt: world.name || '世界观图片' })}
                  />
                </div>
              )}
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

export default WorldCreation;
