import React, { useState, useEffect } from 'react';
import { useGameState } from '../store/gameState.jsx';
import { getChapter, updateProgress } from '../services/novelService.js';
import NovelSceneRenderer from './NovelSceneRenderer.jsx';
import './NovelGameplay.css';

const NovelGameplay = ({ novelId, chapterId, characterName, onBack, onComplete }) => {
  const { state } = useGameState();
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paragraphs, setParagraphs] = useState([]);

  useEffect(() => {
    loadChapter();
  }, [novelId, chapterId]);

  const loadChapter = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getChapter(novelId, chapterId);
      setChapter(data);
      const paras = data.content.split(/\n+/).filter(p => p.trim());
      setParagraphs(paras);
    } catch (err) {
      console.error('加载章节失败:', err);
      setError('加载章节失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleChapterEnd = async () => {
    try {
      await updateProgress(
        novelId,
        chapterId,
        characterName,
        paragraphs.length,
        [],
        [chapterId],
        []
      );
    } catch (err) {
      console.error('保存章节完成状态失败:', err);
    }

    if (onComplete) {
      onComplete(chapterId, characterName);
    }
  };

  if (loading) {
    return (
      <div className="novel-gameplay loading">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="novel-gameplay error">
        <div className="error-state">
          <p className="error-message">{error}</p>
          <button className="back-btn" onClick={onBack}>返回</button>
        </div>
      </div>
    );
  }

  return (
    <NovelSceneRenderer
      chapter={chapter}
      characterName={characterName}
      onChapterEnd={handleChapterEnd}
      onBack={onBack}
      world={state.world} // 传递世界观信息以支持自由输入
    />
  );
};

export default NovelGameplay;
