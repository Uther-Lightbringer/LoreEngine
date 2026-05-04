import React, { useState, useEffect } from 'react';
import { getToken } from '../services/authService.js';
import { getApiConfig, updateApiConfig } from '../services/apiService.js';
import './ApiSettings.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:29999/api';

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic',
  minimax: 'MiniMax',
  custom: '自定义'
};

const ApiSettings = ({ onClose }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 文生文配置
  const [textProvider, setTextProvider] = useState('deepseek');
  const [textConfig, setTextConfig] = useState({
    apiKey: '',
    baseUrl: '',
    model: ''
  });

  // 文生图配置
  const [imageConfig, setImageConfig] = useState({
    apiKey: '',
    baseUrl: '',
    model: ''
  });

  // 图生图配置
  const [imageToImageConfig, setImageToImageConfig] = useState({
    apiKey: '',
    baseUrl: '',
    model: ''
  });

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const data = await getApiConfig();
      setConfig(data);
      setTextProvider(data.defaultProvider || 'deepseek');

      // 加载当前provider的配置
      const currentProvider = data.defaultProvider || 'deepseek';
      if (data[currentProvider]) {
        setTextConfig({
          apiKey: data[currentProvider].configured ? '********' : '',
          baseUrl: data[currentProvider].baseUrl || '',
          model: data[currentProvider].model || ''
        });
      }

      if (data.image) {
        setImageConfig({
          apiKey: data.image.configured ? '********' : '',
          baseUrl: data.image.baseUrl || '',
          model: data.image.model || ''
        });
      }

      if (data.imageToImage) {
        setImageToImageConfig({
          apiKey: data.imageToImage.configured ? '********' : '',
          baseUrl: data.imageToImage.baseUrl || '',
          model: data.imageToImage.model || ''
        });
      }

      setLoading(false);
    } catch (err) {
      setError('获取配置失败: ' + err.message);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updates = {};

      // 文生文配置
      if (textConfig.apiKey && !textConfig.apiKey.startsWith('********')) {
        const prefix = textProvider.toUpperCase();
        updates[`${prefix}_API_KEY`] = textConfig.apiKey;
      }
      if (textConfig.baseUrl) {
        updates[`${textProvider.toUpperCase()}_BASE_URL`] = textConfig.baseUrl;
      }
      if (textConfig.model) {
        updates[`${textProvider.toUpperCase()}_MODEL`] = textConfig.model;
      }
      updates['DEFAULT_PROVIDER'] = textProvider;

      // 文生图配置
      if (imageConfig.apiKey && !imageConfig.apiKey.startsWith('********')) {
        updates['IMAGE_API_KEY'] = imageConfig.apiKey;
      }
      if (imageConfig.baseUrl) {
        updates['IMAGE_BASE_URL'] = imageConfig.baseUrl;
      }
      if (imageConfig.model) {
        updates['IMAGE_MODEL'] = imageConfig.model;
      }

      // 图生图配置
      if (imageToImageConfig.apiKey && !imageToImageConfig.apiKey.startsWith('********')) {
        updates['EVOLINKITOI_API_KEY'] = imageToImageConfig.apiKey;
      }
      if (imageToImageConfig.baseUrl) {
        updates['EVOLINKITOI_BASE_URL'] = imageToImageConfig.baseUrl;
      }
      if (imageToImageConfig.model) {
        updates['EVOLINKITOI_MODEL'] = imageToImageConfig.model;
      }

      const token = getToken();
      const response = await fetch(`${API_BASE}/ai/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ updates })
      });

      if (!response.ok) {
        throw new Error('保存配置失败');
      }

      // 同时更新 localStorage，确保前端使用正确的 provider
      localStorage.setItem('last_provider', textProvider);

      setSuccess('配置保存成功！');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = (provider) => {
    setTextProvider(provider);
    if (config && config[provider]) {
      setTextConfig({
        apiKey: config[provider].configured ? '********' : '',
        baseUrl: config[provider].baseUrl || '',
        model: config[provider].model || ''
      });
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="api-settings">
          <div className="loading">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="api-settings">
        <div className="header">
          <h2>API 设置</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="error-msg">{error}</div>}
        {success && <div className="success-msg">{success}</div>}

        <div className="settings-content">
          {/* 文生文配置 */}
          <div className="config-section">
            <h3>文生文配置</h3>
            <div className="form-group">
              <label>供应商</label>
              <select value={textProvider} onChange={(e) => handleProviderChange(e.target.value)}>
                <option value="deepseek">DeepSeek</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="minimax">MiniMax</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={textConfig.apiKey}
                onChange={(e) => setTextConfig({ ...textConfig, apiKey: e.target.value })}
                placeholder={textConfig.apiKey || '请输入 API Key'}
              />
            </div>
            <div className="form-group">
              <label>基础 URL</label>
              <input
                type="text"
                value={textConfig.baseUrl}
                onChange={(e) => setTextConfig({ ...textConfig, baseUrl: e.target.value })}
                placeholder={
                  textProvider === 'deepseek' ? 'https://api.deepseek.com/v1' :
                  textProvider === 'openai' ? 'https://api.openai.com/v1' :
                  textProvider === 'anthropic' ? 'https://api.anthropic.com/v1' :
                  textProvider === 'minimax' ? 'https://api.minimaxi.com' :
                  'https://api.example.com/v1'
                }
              />
            </div>
            <div className="form-group">
              <label>模型</label>
              <input
                type="text"
                value={textConfig.model}
                onChange={(e) => setTextConfig({ ...textConfig, model: e.target.value })}
                placeholder={
                  textProvider === 'deepseek' ? 'deepseek-chat' :
                  textProvider === 'openai' ? 'gpt-4' :
                  textProvider === 'anthropic' ? 'claude-3-opus-20240229' :
                  textProvider === 'minimax' ? 'M2-her' :
                  'gpt-4'
                }
              />
            </div>
          </div>

          {/* 文生图配置 */}
          <div className="config-section">
            <h3>文生图配置</h3>
            <div className="form-group">
              <label>供应商</label>
              <input type="text" value="Evolink.ai" disabled />
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={imageConfig.apiKey}
                onChange={(e) => setImageConfig({ ...imageConfig, apiKey: e.target.value })}
                placeholder={imageConfig.apiKey || '请输入 API Key'}
              />
            </div>
            <div className="form-group">
              <label>基础 URL</label>
              <input
                type="text"
                value={imageConfig.baseUrl}
                onChange={(e) => setImageConfig({ ...imageConfig, baseUrl: e.target.value })}
                placeholder="https://api.evolink.ai"
              />
            </div>
            <div className="form-group">
              <label>模型</label>
              <input
                type="text"
                value={imageConfig.model}
                onChange={(e) => setImageConfig({ ...imageConfig, model: e.target.value })}
                placeholder="z-image-turbo"
              />
            </div>
          </div>

          {/* 图生图配置 */}
          <div className="config-section">
            <h3>图生图配置</h3>
            <div className="form-group">
              <label>供应商</label>
              <input type="text" value="Evolink (Doubao Seedream)" disabled />
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={imageToImageConfig.apiKey}
                onChange={(e) => setImageToImageConfig({ ...imageToImageConfig, apiKey: e.target.value })}
                placeholder={imageToImageConfig.apiKey || '请输入 API Key'}
              />
            </div>
            <div className="form-group">
              <label>基础 URL</label>
              <input
                type="text"
                value={imageToImageConfig.baseUrl}
                onChange={(e) => setImageToImageConfig({ ...imageToImageConfig, baseUrl: e.target.value })}
                placeholder="https://api.evolink.ai"
              />
            </div>
            <div className="form-group">
              <label>模型</label>
              <input
                type="text"
                value={imageToImageConfig.model}
                onChange={(e) => setImageToImageConfig({ ...imageToImageConfig, model: e.target.value })}
                placeholder="doubao-seedream-5.0-lite"
              />
            </div>
          </div>
        </div>

        <div className="footer">
          <button className="cancel-btn" onClick={onClose}>取消</button>
          <button className="save-btn" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApiSettings;
