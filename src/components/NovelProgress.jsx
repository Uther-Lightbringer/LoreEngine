import React, { useState, useEffect } from 'react';
import { getProgress, getNovel } from '../services/novelService.js';
import './NovelProgress.css';

const NovelProgress = ({ novelId, onBack }) => {
  const [progress, setProgress] = useState(null);
  const [novel, setNovel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProgress();
  }, [novelId]);

  const loadProgress = async () => {
    setLoading(true);
    setError('');
    try {
      const [progressData, novelData] = await Promise.all([
        getProgress(novelId),
        getNovel(novelId)
      ]);
      setProgress(progressData);
      setNovel(novelData);
    } catch (err) {
      console.error('加载进度失败:', err);
      setError('加载进度失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 计算总体统计
  const getOverallStats = () => {
    if (!progress?.chapters || !novel?.chapters) return null;

    const totalChapters = novel.chapters.length;
    let exploredChapters = 0;
    let totalCharacters = 0;
    let exploredCharacters = 0;

    novel.chapters.forEach(chapter => {
      const chapterProgress = progress.chapters.find(cp => cp.chapterId === chapter.id);
      if (chapterProgress?.charactersExplored?.length > 0) {
        exploredChapters++;
      }
      if (chapter.characters) {
        totalCharacters += chapter.characters.length;
        if (chapterProgress?.charactersExplored) {
          exploredCharacters += chapterProgress.charactersExplored.length;
        }
      }
    });

    return {
      totalChapters,
      exploredChapters,
      totalCharacters,
      exploredCharacters,
      completionPercentage: totalChapters > 0 ? Math.round((exploredChapters / totalChapters) * 100) : 0
    };
  };

  // 获取角色解锁状态
  const getUnlockedCharacters = () => {
    if (!progress?.unlockedCharacters) return [];
    return progress.unlockedCharacters;
  };

  // 获取角色探索详情
  const getChapterCharacterStatus = (chapter) => {
    const chapterProgress = progress?.chapters?.find(cp => cp.chapterId === chapter.id);
    if (!chapterProgress) {
      return chapter.characters?.map(char => ({
        ...char,
        explored: false,
        completedBranches: 0
      })) || [];
    }

    return chapter.characters?.map(char => {
      const explored = chapterProgress.charactersExplored?.includes(char.name);
      const completedBranches = chapterProgress.completedBranches?.filter(
        branch => branch.characterName === char.name
      ).length || 0;
      return {
        ...char,
        explored,
        completedBranches
      };
    }) || [];
  };

  // 导出进度数据
  const exportProgress = () => {
    const data = {
      novel: novel?.name,
      exportedAt: new Date().toISOString(),
      stats: getOverallStats(),
      chapters: novel?.chapters?.map(chapter => ({
        title: chapter.title,
        characters: getChapterCharacterStatus(chapter)
      })),
      unlockedCharacters: getUnlockedCharacters()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${novel?.name || 'novel'}_progress_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="novel-progress loading">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  const stats = getOverallStats();

  return (
    <div className="novel-progress">
      <div className="progress-header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h2>探索进度</h2>
        <button className="export-btn" onClick={exportProgress}>📥 导出</button>
      </div>

      {error && <p className="error-message">{error}</p>}

      {novel && (
        <div className="novel-summary">
          <h3>{novel.name}</h3>
          <p className="novel-type">类型：{novel.type}</p>
        </div>
      )}

      {stats && (
        <div className="stats-overview">
          <div className="stat-card">
            <div className="stat-value">{stats.completionPercentage}%</div>
            <div className="stat-label">总进度</div>
            <div className="stat-bar">
              <div className="stat-bar-fill" style={{ width: `${stats.completionPercentage}%` }}></div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-value">{stats.exploredChapters}/{stats.totalChapters}</div>
            <div className="stat-label">已探索章节</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">{stats.exploredCharacters}/{stats.totalCharacters}</div>
            <div className="stat-label">已体验角色</div>
          </div>
        </div>
      )}

      {getUnlockedCharacters().length > 0 && (
        <div className="unlocked-section">
          <h4>已解锁角色</h4>
          <div className="unlocked-characters">
            {getUnlockedCharacters().map((char, index) => (
              <span key={index} className="unlocked-tag">🔓 {char}</span>
            ))}
          </div>
        </div>
      )}

      <div className="chapter-details">
        <h4>章节详情</h4>
        {novel?.chapters?.map((chapter, index) => {
          const charStatus = getChapterCharacterStatus(chapter);
          const hasAnyExplored = charStatus.some(c => c.explored);
          const allExplored = charStatus.length > 0 && charStatus.every(c => c.explored);

          return (
            <div key={chapter.id} className={`chapter-progress-item ${allExplored ? 'completed' : hasAnyExplored ? 'in-progress' : ''}`}>
              <div className="chapter-header-row">
                <span className="chapter-number">第{index + 1}章</span>
                <span className="chapter-title">{chapter.title}</span>
                <span className={`chapter-status ${allExplored ? 'status-completed' : hasAnyExplored ? 'status-progress' : 'status-pending'}`}>
                  {allExplored ? '已完成' : hasAnyExplored ? '进行中' : '未探索'}
                </span>
              </div>

              <div className="character-progress-list">
                {charStatus.map((char, charIndex) => (
                  <div key={charIndex} className={`character-progress-row ${char.explored ? 'explored' : ''}`}>
                    <span className="char-name">{char.name}</span>
                    <span className="char-role">({char.role})</span>
                    <span className={`char-status ${char.explored ? 'explored' : 'not-explored'}`}>
                      {char.explored ? '✓ 已体验' : '未体验'}
                    </span>
                    {char.explored && char.completedBranches > 0 && (
                      <span className="branch-count">· {char.completedBranches}个分支</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="progress-actions">
        <button className="refresh-btn" onClick={loadProgress}>🔄 刷新进度</button>
      </div>
    </div>
  );
};

export default NovelProgress;
