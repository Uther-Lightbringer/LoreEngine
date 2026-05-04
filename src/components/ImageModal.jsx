import React, { useEffect } from 'react';
import './ImageModal.css';

const ImageModal = ({ imageUrl, alt, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!imageUrl) return null;

  return (
    <div className="image-modal-backdrop" onClick={handleBackdropClick}>
      <div className="image-modal-content">
        <button className="image-modal-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <img src={imageUrl} alt={alt || '放大图片'} className="image-modal-image" />
      </div>
    </div>
  );
};

export default ImageModal;
