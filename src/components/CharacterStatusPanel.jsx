import React from 'react';
import './CharacterStatusPanel.css';

const CharacterStatusPanel = ({ character, onClose }) => {
  if (!character) return null;

  const status = character.characterStatus || {};
  const traits = status.personalityTraits || {
    extroversion: 50,
    rationality: 50,
    orderliness: 50,
    optimism: 50
  };
  const relationship = status.relationship || {
    affection: 50,
    trust: 50,
    obedience: 30,
    specialTags: []
  };
  const physicalAppearance = status.physicalAppearance || {};
  const physicalState = status.physicalState || {
    health: 60,
    energy: 65
  };
  // 确保 expression 是对象而不是字符串
  const rawExpression = status.expression;
  const expression = (rawExpression && typeof rawExpression === 'object' && !Array.isArray(rawExpression))
    ? rawExpression
    : {
        currentExpression: typeof rawExpression === 'string' ? rawExpression : "自然",
        expressionIntensity: "平静",
        facialDetails: ""
      };

  const getTraitLabel = (value, lowLabel, highLabel) => {
    return value < 50 ? lowLabel : highLabel;
  };

  const getAffectionLevel = (value) => {
    if (value < 20) return '冷漠';
    if (value < 40) return '注意';
    if (value < 60) return '在意';
    if (value < 80) return '好感';
    return '信赖';
  };

  const getTrustLevel = (value) => {
    if (value < 20) return '不信任';
    if (value < 40) return '谨慎';
    if (value < 60) return '基本信任';
    if (value < 80) return '信任';
    return '完全信赖';
  };

  const getObedienceLevel = (value) => {
    if (value < 20) return '不配合';
    if (value < 40) return '轻度配合';
    if (value < 60) return '配合';
    if (value < 80) return '积极配合';
    return '服从';
  };

  const getHealthLevel = (value) => {
    if (value < 20) return '虚弱';
    if (value < 40) return '不适';
    if (value < 60) return '一般';
    if (value < 80) return '良好';
    return '健康';
  };

  const getEnergyLevel = (value) => {
    if (value < 20) return '精疲力尽';
    if (value < 40) return '疲惫';
    if (value < 60) return '有些累';
    if (value < 80) return '精力充沛';
    return '精神饱满';
  };

  const getSelfAwarenessStatus = (value, obedience) => {
    if (value < 10 && obedience >= 70) {
      return '（会无条件跟随主角）';
    } else if (value < 20) {
      return '（陷入迷茫，可收服）';
    } else if (value < 30) {
      return '（低，容易随波逐流）';
    } else if (value < 70) {
      return '（中等，有一定主见）';
    }
    return '（高，有主见，不轻易妥协）';
  };

  const getStateBarColor = (value, inverse = false) => {
    const val = inverse ? 100 - value : value;
    if (val < 20) return 'linear-gradient(90deg, #e74c3c, #c0392b)';
    if (val < 40) return 'linear-gradient(90deg, #e67e22, #d35400)';
    if (val < 60) return 'linear-gradient(90deg, #f39c12, #e67e22)';
    if (val < 80) return 'linear-gradient(90deg, #27ae60, #2ecc71)';
    return 'linear-gradient(90deg, #27ae60, #2ecc71)';
  };

  return (
    <div className="character-status-panel">
      <div className="status-panel-header">
        <h3>角色详细资料库</h3>
        <button className="close-btn" onClick={onClose}>×</button>
      </div>

      <div className="status-panel-content">
        {/* 基础信息 */}
        <section className="status-section">
          <h4>基础信息</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">姓名：</span>
              <span className="info-value">{character.name}</span>
            </div>
            {character.gender && (
              <div className="info-item">
                <span className="info-label">性别：</span>
                <span className="info-value">{character.gender}</span>
              </div>
            )}
            {character.age && (
              <div className="info-item">
                <span className="info-label">年龄：</span>
                <span className="info-value">{character.age}</span>
              </div>
            )}
          </div>
          {character.background && (
            <div className="background-text">
              <strong>背景：</strong>{character.background}
            </div>
          )}
          {character.personality && (
            <div className="background-text">
              <strong>性格：</strong>{character.personality}
            </div>
          )}
        </section>

        {/* 外貌特征 */}
        <section className="status-section">
          <h4>外貌特征</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">发型：</span>
              <span className="info-value">{physicalAppearance.hairStyle || '未设置'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">发色：</span>
              <span className="info-value">{physicalAppearance.hairColor || '未设置'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">瞳色：</span>
              <span className="info-value">{physicalAppearance.eyeColor || '未设置'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">体型：</span>
              <span className="info-value">{physicalAppearance.bodyType || '未设置'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">身高：</span>
              <span className="info-value">{physicalAppearance.height || '未设置'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">穿着：</span>
              <span className="info-value">{physicalAppearance.clothing || '未设置'}</span>
            </div>
          </div>
        </section>

        {/* 表情状态 */}
        <section className="status-section">
          <h4>表情状态</h4>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">当前表情：</span>
              <span className="info-value">{expression.currentExpression || '未设置'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">情绪强度：</span>
              <span className="info-value">{expression.expressionIntensity || '未设置'}</span>
            </div>
          </div>
          <div className="background-text">
            <strong>面部细节：</strong>{expression.facialDetails || '未设置'}
          </div>
        </section>

        {/* 身体状态 */}
        <section className="status-section">
          <h4>身体状态</h4>
          <div className="physical-states">
            <div className="physical-state-item">
              <div className="physical-state-header">
                <span className="physical-state-label">健康度：</span>
                <span className="physical-state-value">{physicalState.health}/100</span>
                <span className="physical-state-level">（{getHealthLevel(physicalState.health)}）</span>
              </div>
              <div className="physical-state-bar">
                <div
                  className="physical-state-fill"
                  style={{
                    width: `${physicalState.health}%`,
                    background: getStateBarColor(physicalState.health)
                  }}
                />
              </div>
            </div>

            <div className="physical-state-item">
              <div className="physical-state-header">
                <span className="physical-state-label">精力：</span>
                <span className="physical-state-value">{physicalState.energy}/100</span>
                <span className="physical-state-level">（{getEnergyLevel(physicalState.energy)}）</span>
              </div>
              <div className="physical-state-bar">
                <div
                  className="physical-state-fill"
                  style={{
                    width: `${physicalState.energy}%`,
                    background: getStateBarColor(physicalState.energy)
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* 性格与心理指标 */}
        <section className="status-section">
          <h4>性格与心理指标</h4>
          <div className="personality-matrix">
            <div className="trait-row">
              <span className="trait-label low">外向({traits.extroversion})</span>
              <div className="trait-bar">
                <div
                  className="trait-fill"
                  style={{ width: `${traits.extroversion}%` }}
                />
                <div
                  className="trait-dot"
                  style={{ left: `${traits.extroversion}%` }}
                />
              </div>
              <span className="trait-label high">内向({100 - traits.extroversion})</span>
            </div>

            <div className="trait-row">
              <span className="trait-label low">理性({traits.rationality})</span>
              <div className="trait-bar">
                <div
                  className="trait-fill"
                  style={{ width: `${traits.rationality}%` }}
                />
                <div
                  className="trait-dot"
                  style={{ left: `${traits.rationality}%` }}
                />
              </div>
              <span className="trait-label high">感性({100 - traits.rationality})</span>
            </div>

            <div className="trait-row">
              <span className="trait-label low">守序({traits.orderliness})</span>
              <div className="trait-bar">
                <div
                  className="trait-fill"
                  style={{ width: `${traits.orderliness}%` }}
                />
                <div
                  className="trait-dot"
                  style={{ left: `${traits.orderliness}%` }}
                />
              </div>
              <span className="trait-label high">混乱({100 - traits.orderliness})</span>
            </div>

            <div className="trait-row">
              <span className="trait-label low">乐观({traits.optimism})</span>
              <div className="trait-bar">
                <div
                  className="trait-fill"
                  style={{ width: `${traits.optimism}%` }}
                />
                <div
                  className="trait-dot"
                  style={{ left: `${traits.optimism}%` }}
                />
              </div>
              <span className="trait-label high">悲观({100 - traits.optimism})</span>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat-item">
              <span className="stat-label">自我意识：</span>
              <span className="stat-value">{status.selfAwareness || 50}/100</span>
              <span className="stat-desc">
                {getSelfAwarenessStatus(status.selfAwareness || 50, relationship.obedience)}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">精神压力：</span>
              <span className="stat-value">{status.mentalStress || 20}/100</span>
              <div className="stress-bar">
                <div
                  className="stress-fill"
                  style={{
                    width: `${status.mentalStress || 20}%`,
                    background: (status.mentalStress || 20) < 50 ?
                      'linear-gradient(90deg, #27ae60, #2ecc71)' :
                      (status.mentalStress || 20) < 80 ?
                      'linear-gradient(90deg, #f39c12, #e67e22)' :
                      'linear-gradient(90deg, #e74c3c, #c0392b)'
                  }}
                />
              </div>
            </div>
          </div>

          {/* 特殊状态提示 */}
          <div className="special-status-info">
            {(status.selfAwareness || 50) < 20 && !(status.isCaptured) && (
              <div className="status-tip confused">
                ⚠️ 该角色陷入迷茫中，现在是收服的大好时机！
              </div>
            )}
            {(status.selfAwareness || 50) < 10 && (relationship.obedience || 30) >= 70 && (
              <div className="status-tip follow">
                🤝 该角色会无条件跟随你移动到任何场景！
              </div>
            )}
            {(relationship.obedience || 30) >= 80 && (
              <div className="status-tip customize">
                ✨ 可以通过【动作】指令改变该角色的穿着和发型！
              </div>
            )}
            {status.isCaptured && (
              <div className="status-tip captured">
                🔒 该角色已被你收服
              </div>
            )}
            {status.followsPlayer && (
              <div className="status-tip following">
                👥 该角色正在跟随你
              </div>
            )}
          </div>
        </section>

        {/* 关系与互动指标 */}
        <section className="status-section">
          <h4>关系与互动指标</h4>
          <div className="relationship-stats">
            <div className="relationship-item">
              <div className="relationship-header">
                <span className="relationship-label">对主角好感度：</span>
                <span className="relationship-value">{relationship.affection}/100</span>
                <span className="relationship-level">（{getAffectionLevel(relationship.affection)}）</span>
              </div>
              <div className="relationship-bar">
                <div
                  className="relationship-fill affection"
                  style={{ width: `${relationship.affection}%` }}
                />
              </div>
            </div>

            <div className="relationship-item">
              <div className="relationship-header">
                <span className="relationship-label">对主角信赖度：</span>
                <span className="relationship-value">{relationship.trust}/100</span>
                <span className="relationship-level">（{getTrustLevel(relationship.trust)}）</span>
              </div>
              <div className="relationship-bar">
                <div
                  className="relationship-fill trust"
                  style={{ width: `${relationship.trust}%` }}
                />
              </div>
            </div>

            <div className="relationship-item">
              <div className="relationship-header">
                <span className="relationship-label">对主角服从度：</span>
                <span className="relationship-value">{relationship.obedience}/100</span>
                <span className="relationship-level">（{getObedienceLevel(relationship.obedience)}）</span>
              </div>
              <div className="relationship-bar">
                <div
                  className="relationship-fill obedience"
                  style={{ width: `${relationship.obedience}%` }}
                />
              </div>
            </div>
          </div>

          {relationship.specialTags && relationship.specialTags.length > 0 && (
            <div className="special-tags">
              <strong>特殊关系标签：</strong>
              {relationship.specialTags.map((tag, i) => (
                <span key={i} className="special-tag">{tag}</span>
              ))}
            </div>
          )}
        </section>

        {/* 状态与能力 */}
        <section className="status-section">
          <h4>状态与能力</h4>
          <div className="emotion-display">
            <span className="emotion-label">当前情绪：</span>
            <span className={`emotion-value ${status.currentEmotion || 'calm'}`}>
              {status.currentEmotion || '平静'}
            </span>
            <span className="emotion-desc">（基础状态，可随事件变为"愉悦"、"困惑"、"恼怒"等）</span>
          </div>

          {status.abilities && Object.keys(status.abilities).length > 0 && (
            <div className="abilities-list">
              {Object.entries(status.abilities).map(([key, value], i) => (
                <div key={i} className="ability-item">
                  <strong>{key}：</strong>{value}
                </div>
              ))}
            </div>
          )}

          {status.stateTags && status.stateTags.length > 0 && (
            <div className="state-tags">
              <strong>状态标签：</strong>
              {status.stateTags.map((tag, i) => (
                <span key={i} className="state-tag">{tag}</span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CharacterStatusPanel;
