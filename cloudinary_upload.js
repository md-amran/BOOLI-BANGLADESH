// ============================================
// CLOUDINARY UPLOAD CONFIGURATION
// ============================================

const CLOUDINARY_CONFIG = {
  cloudName: "dyscr90sb",
  uploadPreset: "unsigned_upload",
  maxFileSize: 5 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif']
};

// ============================================
// CLOUDINARY UPLOAD FUNCTION
// ============================================
async function uploadToCloudinary(file, folder = 'booli/uploads') {
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`;
  
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
  formData.append("folder", folder);
  formData.append("timestamp", Date.now());
  
  try {
    const res = await fetch(url, {
      method: "POST",
      body: formData
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error("Cloudinary error:", errorData);
      throw new Error(errorData.error?.message || "Upload failed");
    }
    
    const data = await res.json();
    return {
      url: data.secure_url,
      publicId: data.public_id,
      width: data.width,
      height: data.height,
      format: data.format,
      bytes: data.bytes
    };
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
}

// ============================================
// VALIDATE IMAGE FILE
// ============================================
function validateImageFile(file) {
  if (!file) {
    return { valid: false, message: 'ফাইল সিলেক্ট করুন' };
  }
  
  if (!CLOUDINARY_CONFIG.allowedTypes.includes(file.type)) {
    return { 
      valid: false, 
      message: 'শুধু JPG, PNG, WEBP বা GIF ফাইল আপলোড করুন' 
    };
  }
  
  if (file.size > CLOUDINARY_CONFIG.maxFileSize) {
    return { 
      valid: false, 
      message: `ফাইল সাইজ ${CLOUDINARY_CONFIG.maxFileSize / (1024 * 1024)}MB এর কম হতে হবে` 
    };
  }
  
  return { valid: true, message: '' };
}

// ============================================
// SHOW UPLOAD PROGRESS UI
// ============================================
let uploadProgressUI = null;

function showUploadProgress(message = 'Uploading...') {
  if (uploadProgressUI) {
    uploadProgressUI.remove();
  }
  
  uploadProgressUI = document.createElement('div');
  uploadProgressUI.className = 'upload-progress-ui';
  uploadProgressUI.innerHTML = `
    <div class="upload-progress-content">
      <div class="upload-spinner"><i class="fas fa-spinner fa-spin"></i></div>
      <div class="upload-message">${message}</div>
      <div class="upload-progress-bar"><div class="upload-progress-fill"></div></div>
    </div>
  `;
  document.body.appendChild(uploadProgressUI);
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress >= 90) {
      clearInterval(interval);
      progress = 90;
    }
    const fill = uploadProgressUI?.querySelector('.upload-progress-fill');
    if (fill) fill.style.width = `${Math.min(progress, 90)}%`;
  }, 200);
  
  return interval;
}

function hideUploadProgress(interval) {
  if (interval) clearInterval(interval);
  
  if (uploadProgressUI) {
    const fill = uploadProgressUI.querySelector('.upload-progress-fill');
    if (fill) fill.style.width = '100%';
    
    setTimeout(() => {
      if (uploadProgressUI) uploadProgressUI.remove();
      uploadProgressUI = null;
    }, 500);
  }
}

// ============================================
// PROFILE PICTURE UPLOAD - FIXED VERSION
// ============================================
async function uploadProfilePicture(file, userId) {
  // Check if file exists
  if (!file) {
    toast('দয়া করে একটি ছবি সিলেক্ট করুন', 'error');
    return null;
  }
  
  // Validate file
  const validation = validateImageFile(file);
  if (!validation.valid) {
    toast(validation.message, 'error');
    return null;
  }
  
  let progressInterval = null;
  
  try {
    progressInterval = showUploadProgress('প্রোফাইল পিকচার আপলোড হচ্ছে...');
    
    const result = await uploadToCloudinary(file, `booli/profile_pictures/${userId}`);
    
    const { db, doc, updateDoc } = FB();
    await updateDoc(doc(db, 'users', userId), { 
      avatar: result.url,
      avatarPublicId: result.publicId,
      avatarUpdatedAt: Date.now()
    });
    
    if (state.user && state.user.uid === userId) {
      state.user.photoURL = result.url;
      updateAvatar(state.user);
    }
    
    hideUploadProgress(progressInterval);
    toast('প্রোফাইল পিকচার আপডেট হয়েছে!', 'success');
    
    // Refresh profile view
    if (typeof renderProfile === 'function') {
      renderProfile();
    }
    
    return result;
    
  } catch (error) {
    console.error('Profile picture upload error:', error);
    hideUploadProgress(progressInterval);
    toast('আপলোড ব্যর্থ হয়েছে: ' + (error.message || 'অজানা ত্রুটি'), 'error');
    return null;
  }
}

// ============================================
// COVER PHOTO UPLOAD - FIXED VERSION
// ============================================
async function uploadCoverPhoto(file, userId) {
  if (!file) {
    toast('দয়া করে একটি ছবি সিলেক্ট করুন', 'error');
    return null;
  }
  
  const validation = validateImageFile(file);
  if (!validation.valid) {
    toast(validation.message, 'error');
    return null;
  }
  
  let progressInterval = null;
  
  try {
    progressInterval = showUploadProgress('কভার ফটো আপলোড হচ্ছে...');
    
    const result = await uploadToCloudinary(file, `booli/cover_photos/${userId}`);
    
    const { db, doc, updateDoc } = FB();
    await updateDoc(doc(db, 'users', userId), { 
      coverPhoto: result.url,
      coverPhotoPublicId: result.publicId,
      coverPhotoUpdatedAt: Date.now()
    });
    
    hideUploadProgress(progressInterval);
    toast('কভার ফটো আপডেট হয়েছে!', 'success');
    
    if (typeof renderProfile === 'function') {
      renderProfile();
    }
    
    return result;
    
  } catch (error) {
    console.error('Cover photo upload error:', error);
    hideUploadProgress(progressInterval);
    toast('আপলোড ব্যর্থ হয়েছে: ' + (error.message || 'অজানা ত্রুটি'), 'error');
    return null;
  }
}

// ============================================
// EXPORT FUNCTIONS - FIXED VERSION
// ============================================

// This is the key fix - proper event handling
window.uploadProfilePicture = function(event) {
  console.log('uploadProfilePicture called', event);
  
  // Get file from event target
  let file = null;
  
  if (event && event.target && event.target.files) {
    file = event.target.files[0];
  } else if (event && event.files) {
    file = event.files[0];
  }
  
  if (!file) {
    toast('দয়া করে একটি ছবি সিলেক্ট করুন', 'error');
    return;
  }
  
  if (!state.user || !state.user.uid) {
    toast('আপনি লগইন করেননি', 'error');
    return;
  }
  
  uploadProfilePicture(file, state.user.uid);
};

window.uploadCoverPhoto = function(event) {
  console.log('uploadCoverPhoto called', event);
  
  let file = null;
  
  if (event && event.target && event.target.files) {
    file = event.target.files[0];
  } else if (event && event.files) {
    file = event.files[0];
  }
  
  if (!file) {
    toast('দয়া করে একটি ছবি সিলেক্ট করুন', 'error');
    return;
  }
  
  if (!state.user || !state.user.uid) {
    toast('আপনি লগইন করেননি', 'error');
    return;
  }
  
  uploadCoverPhoto(file, state.user.uid);
};

// Export for direct use
window.CloudinaryUpload = {
  uploadProfilePicture,
  uploadCoverPhoto,
  getOptimizedImageUrl: function(url, options) {
    if (!url || !url.includes('cloudinary')) return url;
    
    const { width, height, quality = 'auto', format = 'auto', crop = 'fill' } = options || {};
    let transformations = [];
    
    if (width || height) {
      let size = '';
      if (width && height) size = `w_${width},h_${height},c_${crop}`;
      else if (width) size = `w_${width},c_scale`;
      else if (height) size = `h_${height},c_scale`;
      transformations.push(size);
    }
    
    transformations.push(`q_${quality}`);
    transformations.push(`f_${format}`);
    
    if (transformations.length === 0) return url;
    return url.replace('/upload/', `/upload/${transformations.join(',')}/`);
  },
  validateImageFile
};

// ============================================
// ADD STYLES
// ============================================
function addUploadProgressStyles() {
  if (document.getElementById('cloudinary-upload-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'cloudinary-upload-styles';
  styles.textContent = `
    .upload-progress-ui {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px 24px;
      z-index: 10000;
      box-shadow: var(--shadow);
      animation: slideUp 0.3s ease;
      min-width: 280px;
    }
    
    .upload-progress-content {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
    }
    
    .upload-spinner {
      font-size: 24px;
      color: var(--primary);
    }
    
    .upload-message {
      font-size: 14px;
      color: var(--text-primary);
      text-align: center;
    }
    
    .upload-progress-bar {
      width: 100%;
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      overflow: hidden;
    }
    
    .upload-progress-fill {
      width: 0%;
      height: 100%;
      background: var(--primary);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    .fa-spin {
      animation: spin 1s linear infinite;
    }
  `;
  document.head.appendChild(styles);
}

addUploadProgressStyles();

console.log('✅ Cloudinary upload module loaded successfully');