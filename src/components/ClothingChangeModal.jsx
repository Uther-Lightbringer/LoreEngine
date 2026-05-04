import React, { useState, useRef } from 'react';
import { imageToImageWithProgress, uploadImage } from '../services/imageService.js';
import './ClothingChangeModal.css';

const ClothingChangeModal = ({ character, protagonist, onClose, onSuccess, onStartChanging }) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
  };

  // 将 blob/data URL 转换为 base64
  const urlToBase64 = async (url) => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  // 提取图片 URL 字符串（处理可能是对象的情况）
  const getImageUrlString = (imageUrl) => {
    if (!imageUrl) return '';
    if (typeof imageUrl === 'string') return imageUrl;
    if (typeof imageUrl === 'object' && imageUrl.url) return imageUrl.url;
    return String(imageUrl);
  };

  const handleSubmit = async () => {
    if (!selectedImage) {
      setError('请选择衣服图片');
      return;
    }

    if (!getImageUrlString(character?.imageUrl)) {
      setError('角色图片不存在');
      return;
    }

    setLoading(true);
    setProgress(0);
    setProgressMessage('准备上传图片...');

    // 通知上层开始换装
    if (onStartChanging) {
      onStartChanging(character.name);
    }

    try {
      // 将衣服图片转换为 base64
      const clothingImageBase64 = await fileToBase64(selectedImage);
      setProgress(20);
      setProgressMessage('上传衣服图片到图床...');

      // 通过后端上传衣服图片到图床获取 URL
      const clothingImageUrl = await uploadImage(clothingImageBase64);
      setProgress(40);
      setProgressMessage('处理角色图片...');

      // 检查角色图片是否需要上传到图床
      let characterImageUrl = getImageUrlString(character.imageUrl);
      if (!characterImageUrl) {
        throw new Error('角色图片不存在');
      }
      if (characterImageUrl.startsWith('data:') || characterImageUrl.startsWith('blob:')) {
        // 将 data/blob URL 转换为 base64 并上传
        const charImageBase64 = await urlToBase64(characterImageUrl);
        characterImageUrl = await uploadImage(charImageBase64);
      }
      // 如果是外部 URL（可能是缓存图片或Evolink生成的图片），直接使用

      setProgress(60);
      setProgressMessage('AI 换装中，请稍候...');

      // 调用图生图 API - 使用 SSE 获取进度
      const result = await imageToImageWithProgress(
        {
          prompt: `图一是角色原图，图二是要换上的衣服。参考图二中的衣服款式，将图一中的角色换上图二的衣服、鞋子和配饰。保持角色的发型、脸型、表情和姿势不变，只改变衣服。`,
          image_urls: [
            characterImageUrl,   // 图一：角色原图
            clothingImageUrl     // 图二：衣服图片
          ],
          aspect_ratio: '1:1',
          n: 1
        },
        (prog, message) => {
          // 将 0-100 的进度映射到 60-95 (预留 95-100 给完成阶段)
          setProgress(60 + Math.floor(prog * 0.35));
          if (message) setProgressMessage(message);
        }
      );

      setProgress(100);
      setProgressMessage('换装完成！');

      console.log('[换衣] 生成结果:', result);

      let finalUrl = '';
      if (result?.url) {
        finalUrl = result.url;
        console.log('[换衣] 使用url:', finalUrl);
      } else if (result?.base64) {
        finalUrl = `data:image/png;base64,${result.base64}`;
        console.log('[换衣] 使用base64:', finalUrl);
      } else {
        throw new Error('生成失败，未返回图片');
      }

      setLoading(false);
      // 先调用 onSuccess，再关闭弹窗（因为 onClose 会清除 clothingChangeCharacter）
      onSuccess(finalUrl);
      onClose();
    } catch (err) {
      console.error('Clothing change failed:', err);
      setError(err.message || '换衣失败，请重试');
      setLoading(false);
    }
  };

  // 将文件转换为 base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  return (
    <div className="clothing-modal-overlay" onClick={onClose}>
      <div className="clothing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="clothing-modal-header">
          <h3>👗 为 {character?.name} 换衣</h3>
          {!loading && <button className="close-btn" onClick={onClose}>×</button>}
        </div>

        <div className="clothing-modal-content">
          {loading ? (
            // Loading state with progress
            <div className="progress-container">
              <div className="progress-info">
                <span className="progress-message">{progressMessage}</span>
                <span className="progress-percent">{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          ) : (
            // Normal content
            <>
              <p className="clothing-tip">选择您需要的衣服图片，系统会将衣服应用到角色身上</p>

              {/* 当前角色预览 */}
              <div className="character-preview">
                <h4>当前角色</h4>
                <div className="preview-image-container">
                  {getImageUrlString(character?.imageUrl) ? (
                    <img src={getImageUrlString(character.imageUrl)} alt={character.name} className="preview-image" />
                  ) : (
                    <div className="no-image">暂无角色图片</div>
                  )}
                </div>
                <p className="character-name">{character?.name}</p>
              </div>

              {/* 衣服图片上传 */}
              <div className="clothing-upload">
                <h4>选择衣服图片</h4>
                <div
                  className="upload-area"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="衣服预览" className="clothing-preview" />
                  ) : (
                    <div className="upload-placeholder">
                      <span className="upload-icon">📤</span>
                      <span>点击上传衣服图片</span>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </div>

              {error && <div className="clothing-error">{error}</div>}
            </>
          )}
        </div>

        <div className="clothing-modal-footer">
          <button className="cancel-btn" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={!selectedImage || loading}
          >
            开始换衣
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClothingChangeModal;
