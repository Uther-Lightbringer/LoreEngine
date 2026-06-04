import React, { useState, useEffect, useRef } from 'react';
import { getNovel, getProgress, parseChapter, getParseStatus, getNarrativeSnapshots } from '../services/novelService.js';
import './NovelChapterSelect.css';

const NovelChapterSelect = ({ novelId, onSelectChapter, onBack }) => {
  const [novel, setNovel] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [showCharacterSelect, setShowCharacterSelect] = useState(false);
  const [pendingChapter, setPendingChapter] = useState(null);
  const [parsingChapter, setParsingChapter] = useState(null);
  const [narrativeSnapshots, setNarrativeSnapshots] = useState([]);
  const [showNarrativeHistory, setShowNarrativeHistory] = useState(false);
  const [generateImages, setGenerateImages] = useState(false);
  const [parseProgress, setParseProgress] = useState(0);
  const [parseStep, setParseStep] = useState('');
  const pollingRef = useRef(null);

  useEffect(() => {
    loadData();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [novelId]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [novelData, progressData, snapshotsData] = await Promise.all([
        getNovel(novelId),
        getProgress(novelId),
        getNarrativeSnapshots(novelId).catch(() => ({ snapshots: [] }))
      ]);
      setNovel(novelData);
      setProgress(progressData);
      setNarrativeSnapshots(snapshotsData.snapshots || []);

      // 检查是否有正在解析的章节，恢复轮询
      const parsingChapter = novelData?.chapters?.find(c => c.parse_status === 'parsing');
      if (parsingChapter) {
        startPolling(parsingChapter.id);
      }
    } catch (err) {
      console.error('加载失败:', err);
      setError('加载失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 轮询解析状态
  const startPolling = (chapterId) => {
    setParsingChapter(chapterId);
    setParseProgress(0);
    setParseStep('准备解析');
    if (pollingRef.current) clearInterval(pollingRef.current);

    pollingRef.current = setInterval(async () => {
      try {
        const result = await getParseStatus(novelId, chapterId);
        setParseProgress(result.progress || 0);
        setParseStep(result.step || '');
        if (result.status === 'completed') {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setParsingChapter(null);
          setParseProgress(100);
          setParseStep('');
          await loadData();
        } else if (result.status === 'error') {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setParsingChapter(null);
          setParseProgress(0);
          setParseStep('');
          setError(`解析失败：${result.error || '未知错误'}`);
        }
      } catch (err) {
        console.error('轮询解析状态失败:', err);
      }
    }, 2000);
  };

  const handleChapterClick = async (chapter) => {
    // 如果章节正在解析中，忽略点击
    if (parsingChapter === chapter.id) return;

    // 如果章节未解析，触发解析
    if (!chapter.is_parsed) {
      try {
        const result = await parseChapter(novelId, chapter.id, { generateImages });
        if (result.status === 'completed') {
          // 已解析完成（可能是之前解析过）
          await loadData();
        } else if (result.status === 'parsing') {
          // 开始异步解析，启动轮询
          startPolling(chapter.id);
        }
      } catch (err) {
        console.error('解析章节失败:', err);
        setError('解析章节失败，请重试');
      }
      return;
    }

    // 检查该章节是否有可用的角色
    const chapterProgress = progress?.chapters?.find(c => c.chapterId === chapter.id);
    const availableCharacters = chapter.characters || [];

    if (availableCharacters.length === 0) {
      setError('该章节没有可用的角色');
      return;
    }

    // 如果只有一个角色，直接选择
    if (availableCharacters.length === 1) {
      const char = availableCharacters[0];
      setSelectedCharacter(char.name);
      onSelectChapter(chapter.id, char.name, char);
      return;
    }

    // 多个角色，显示选择界面
    setPendingChapter(chapter);
    setShowCharacterSelect(true);
  };

  const handleCharacterConfirm = () => {
    if (pendingChapter && selectedCharacter) {
      const charObj = pendingChapter.characters?.find(c => c.name === selectedCharacter);
      onSelectChapter(pendingChapter.id, selectedCharacter, charObj);
    }
    setShowCharacterSelect(false);
    setPendingChapter(null);
  };

  const getChapterStatus = (chapter) => {
    const chapterProgress = progress?.chapters?.find(c => c.chapterId === chapter.id);
    if (!chapterProgress) return 'not-started';
    if (chapterProgress.charactersExplored?.length === 0) return 'not-started';
    const totalChars = chapter.characters?.length || 0;
    const exploredChars = chapterProgress.charactersExplored?.length || 0;
    if (exploredChars >= totalChars) return 'completed';
    return 'in-progress';
  };

  const getCompletionText = (chapter) => {
    const status = getChapterStatus(chapter);
    const chapterProgress = progress?.chapters?.find(c => c.chapterId === chapter.id);
    const explored = chapterProgress?.charactersExplored?.length || 0;
    const total = chapter.characters?.length || 0;

    switch (status) {
      case 'not-started':
        return '未探索';
      case 'in-progress':
        return `${explored}/${total} 角色已体验`;
      case 'completed':
        return '已完成';
      default:
        return '';
    }
  };

  const getKeyChoicesSummary = () => {
    if (narrativeSnapshots.length === 0) return null;

    const allChoices = [];
    for (const snapshot of narrativeSnapshots) {
      if (snapshot.data?.keyChoices) {
        allChoices.push(...snapshot.data.keyChoices);
      }
    }

    if (allChoices.length === 0) return null;

    // 返回最近的几条选择
    return allChoices.slice(-3).map((choice, idx) => ({
      ...choice,
      index: allChoices.length - 3 + idx + 1
    }));
  };

  if (loading) {
    return (
      <div className="novel-chapter-select loading">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  return (
    <div className="novel-chapter-select">
      <div className="chapter-header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <div className="novel-info">
          <h2>{novel?.name}</h2>
          <p className="novel-type">类型：{novel?.type}</p>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      {/* 叙事历史预览 */}
      {narrativeSnapshots.length > 0 && (
        <div className="narrative-history-preview" onClick={() => setShowNarrativeHistory(true)}>
          <div className="narrative-header">
            <span className="narrative-icon">📜</span>
            <span className="narrative-title">叙事历史</span>
            <span className="narrative-count">{narrativeSnapshots.length} 条记录</span>
          </div>
          {getKeyChoicesSummary() && (
            <div className="narrative-summary">
              {getKeyChoicesSummary().map((choice, idx) => (
                <div key={idx} className="choice-summary-item">
                  <span className="choice-index">选择{choice.index}</span>
                  <span className="choice-desc">{choice.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="chapters-list">
        <div className="chapters-list-header">
          <h3>选择章节</h3>
          <label className="generate-images-toggle">
            <input
              type="checkbox"
              checked={generateImages}
              onChange={(e) => setGenerateImages(e.target.checked)}
            />
            <span>生成图片</span>
          </label>
        </div>
        {novel?.chapters?.map((chapter, index) => (
          <div
            key={chapter.id}
            className={`chapter-item ${getChapterStatus(chapter)} ${parsingChapter === chapter.id ? 'parsing' : ''}`}
            onClick={() => handleChapterClick(chapter)}
          >
            <div className="chapter-info">
              <div className="chapter-number">第{index + 1}章</div>
              <div className="chapter-title">{chapter.title}</div>
              <div className="chapter-completion">{getCompletionText(chapter)}</div>
            </div>
            <div className="chapter-characters">
              {chapter.characters?.map((char, i) => (
                <span key={i} className="character-tag">{char.name}</span>
              ))}
            </div>
            {parsingChapter === chapter.id && (
              <div className="parsing-overlay">
                <div className="parsing-progress-container">
                  <div className="parsing-progress-bar">
                    <div className="parsing-progress-fill" style={{ width: `${parseProgress}%` }}></div>
                  </div>
                  <div className="parsing-progress-info">
                    <span className="parsing-spinner"></span>
                    <span className="parsing-step-text">{parseStep}</span>
                    <span className="parsing-percent">{Math.round(parseProgress)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCharacterSelect && pendingChapter && (
        <div className="character-select-modal">
          <div className="modal-content">
            <h3>选择角色</h3>
            <p className="modal-subtitle">以哪个角色的视角体验「{pendingChapter.title}」？</p>
            <div className="character-options">
              {pendingChapter.characters?.map((char, index) => (
                <button
                  key={index}
                  className={`character-option ${selectedCharacter === char.name ? 'selected' : ''}`}
                  onClick={() => setSelectedCharacter(char.name)}
                >
                  <span className="char-name">{char.name}</span>
                  <span className="char-role">{char.role}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => {
                setShowCharacterSelect(false);
                setPendingChapter(null);
                setSelectedCharacter(null);
              }}>
                取消
              </button>
              <button
                className="confirm-btn"
                onClick={handleCharacterConfirm}
                disabled={!selectedCharacter}
              >
                开始体验
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 叙事历史完整视图 */}
      {showNarrativeHistory && (
        <div className="narrative-history-modal" onClick={() => setShowNarrativeHistory(false)}>
          <div className="narrative-modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>📜 叙事历史</h3>
            <p className="narrative-modal-subtitle">你在此前章节中做出的关键选择</p>

            <div className="narrative-history-list">
              {narrativeSnapshots.map((snapshot, idx) => {
                const choices = snapshot.data?.keyChoices || [];
                if (choices.length === 0) return null;

                return (
                  <div key={snapshot.id || idx} className="narrative-chapter-section">
                    <div className="chapter-label">第{idx + 1}章相关选择</div>
                    {choices.map((choice, cIdx) => (
                      <div key={cIdx} className="narrative-choice-item">
                        <div className="choice-type-badge">{choice.type}</div>
                        <div className="choice-text">{choice.description}</div>
                        {choice.situation && (
                          <div className="choice-context">情境：{choice.situation}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="modal-actions">
              <button
                className="confirm-btn"
                onClick={() => setShowNarrativeHistory(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NovelChapterSelect;
