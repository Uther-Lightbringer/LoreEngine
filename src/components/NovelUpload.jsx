import React, { useState, useRef } from 'react';
import { uploadNovel, getNovels } from '../services/novelService.js';
import './NovelUpload.css';

const NovelUpload = ({ onSuccess, onBack }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      setError('仅支持 .txt 格式的文件');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('文件大小不能超过 50MB');
      return;
    }

    setSelectedFile(file);
    setError('');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('请先选择文件');
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const result = await uploadNovel(selectedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      setTimeout(() => {
        onSuccess(result);
      }, 500);
    } catch (err) {
      console.error('上传失败:', err);
      setError(err.message || '上传失败，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="novel-upload">
      <div className="upload-header">
        <h2>上传小说</h2>
        <p className="upload-subtitle">上传 .txt 格式的小说文件，AI将自动解析并生成可体验的剧情</p>
      </div>

      <div
        className={`drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {selectedFile ? (
          <div className="selected-file">
            <div className="file-icon">📄</div>
            <div className="file-info">
              <div className="file-name">{selectedFile.name}</div>
              <div className="file-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
            </div>
            <button
              className="clear-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="drop-hint">
            <div className="drop-icon">📚</div>
            <div className="drop-text">
              拖拽文件到此处，或<span className="link">点击选择文件</span>
            </div>
            <div className="drop-formats">支持 .txt 格式，最大 50MB</div>
          </div>
        )}
      </div>

      {error && <p className="error-message">{error}</p>}

      {isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
          </div>
          <div className="progress-text">上传中... {uploadProgress}%</div>
        </div>
      )}

      <div className="upload-actions">
        <button className="back-btn" onClick={onBack} disabled={isUploading}>
          返回
        </button>
        <button
          className="upload-btn"
          onClick={handleUpload}
          disabled={!selectedFile || isUploading}
        >
          {isUploading ? '上传中...' : '开始上传'}
        </button>
      </div>
    </div>
  );
};

export default NovelUpload;
