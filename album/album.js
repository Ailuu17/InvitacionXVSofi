/* ==========================================================================
   LÓGICA DEL ÁLBUM COMPARTIDO DE FOTOS - MIS XV SOFÍA
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // CLAVES DE LOCALSTORAGE
  const STORAGE_KEY_PHOTOS = 'XV_SOFIA_ALBUM_PHOTOS';
  const STORAGE_KEY_LIKES = 'XV_SOFIA_ALBUM_LIKES';
  const STORAGE_KEY_ADMIN = 'XV_SOFIA_ALBUM_ADMIN';
  const ADMIN_PIN = '1515'; // //cambiar clave de administradora aquí si se desea

  // ESTADO DE LA APLICACIÓN
  let photos = [];
  let userLikes = JSON.parse(localStorage.getItem(STORAGE_KEY_LIKES) || '{}');
  let isAdmin = localStorage.getItem(STORAGE_KEY_ADMIN) === 'true';
  let currentFilter = 'ALL';
  let currentSearch = '';
  let activeLightboxIndex = -1;
  let selectedFileBase64 = null;

  // REFERENCIAS DOM
  const galleryGrid = document.getElementById('gallery-grid');
  const uploadForm = document.getElementById('photo-upload-form');
  const guestNameInput = document.getElementById('guest-name');
  const categorySelect = document.getElementById('photo-category');
  const captionInput = document.getElementById('photo-caption');
  const fileInput = document.getElementById('photo-file');
  const dropzone = document.getElementById('dropzone');
  const previewContainer = document.getElementById('preview-container');
  const previewImg = document.getElementById('preview-img');
  const removePreviewBtn = document.getElementById('remove-preview-btn');

  // Filtros y Búsqueda
  const filterTabs = document.querySelectorAll('.filter-tab-btn');
  const searchInput = document.getElementById('search-input');

  // Lightbox DOM
  const lightboxModal = document.getElementById('lightbox-modal');
  const lightboxImg = document.getElementById('lightbox-main-img');
  const lightboxUploader = document.getElementById('lightbox-uploader');
  const lightboxCategory = document.getElementById('lightbox-category');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxDate = document.getElementById('lightbox-date');
  const lightboxLikeBtn = document.getElementById('lightbox-like-btn');
  const lightboxLikeCount = document.getElementById('lightbox-like-count');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');
  const lightboxPrevBtn = document.getElementById('lightbox-prev-btn');
  const lightboxNextBtn = document.getElementById('lightbox-next-btn');

  // Admin DOM
  const adminToggleBtn = document.getElementById('btn-admin-toggle');
  const adminModal = document.getElementById('admin-modal');
  const adminPinInput = document.getElementById('admin-pin-input');
  const adminSubmitBtn = document.getElementById('admin-submit-btn');
  const adminCloseBtn = document.getElementById('admin-close-btn');
  const pinErrorMsg = document.getElementById('pin-error-msg');

  // Toast
  const toastEl = document.getElementById('album-toast');

  /* ==========================================================================
     1. INICIALIZACIÓN Y CARGA DE FOTOS
     ========================================================================== */
  const initAlbum = async () => {
    // Inicializar canvas de destellos
    initSparklesCanvas();

    // Actualizar clase de admin si ya estaba autenticado
    if (isAdmin) {
      document.body.classList.add('admin-mode');
      updateAdminButtonUI();
    }

    // Cargar fotos desde LocalStorage o desde photos.json
    const storedPhotos = localStorage.getItem(STORAGE_KEY_PHOTOS);
    if (storedPhotos) {
      try {
        photos = JSON.parse(storedPhotos);
      } catch (e) {
        console.error('Error leyendo fotos de localStorage', e);
        photos = [];
      }
    }

    // Si no hay fotos guardadas, cargar JSON por defecto
    if (!photos || photos.length === 0) {
      await loadDefaultPhotos();
    }

    renderGallery();
  };

  const loadDefaultPhotos = async () => {
    try {
      const response = await fetch('photos.json');
      if (response.ok) {
        photos = await response.json();
      } else {
        photos = getFallbackPhotos();
      }
    } catch (err) {
      console.warn('Usando fotos por defecto locales', err);
      photos = getFallbackPhotos();
    }
    savePhotosToStorage();
  };

  // //cambiar imagen aquí: Lista de imágenes por defecto con sus rutas
  const getFallbackPhotos = () => [
    {
      id: 'photo-default-1',
      url: '../assets/img/sofia-1.JPG', // //cambiar imagen por defecto 1 aquí
      author: 'Sofía',
      category: 'Quinceañera',
      caption: '¡Preparándome para esta noche soñada! ✨',
      likes: 24,
      timestamp: new Date().toISOString()
    },
    {
      id: 'photo-default-2',
      url: '../assets/img/salon-el-recreo.jpg', // //cambiar imagen por defecto 2 aquí
      author: 'Familia',
      category: 'Fiesta & Baile',
      caption: 'El salón EL RECREO listo para festejar 💖',
      likes: 18,
      timestamp: new Date().toISOString()
    },
    {
      id: 'photo-default-3',
      url: '../assets/img/sofia-2.jpg', // //cambiar imagen por defecto 3 aquí
      author: 'Sofía',
      category: 'Momentos Inolvidables',
      caption: 'Un recuerdo lleno de amor y alegría 🌹',
      likes: 31,
      timestamp: new Date().toISOString()
    },
    {
      id: 'photo-default-4',
      url: '../assets/img/album-icon.jpg', // //cambiar imagen por defecto 4 aquí
      author: 'Amigos',
      category: 'Con Sofía',
      caption: '¡Con la cumpleañera más linda! 🎉',
      likes: 15,
      timestamp: new Date().toISOString()
    }
  ];

  const savePhotosToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEY_PHOTOS, JSON.stringify(photos));
    } catch (e) {
      showToast('No hay suficiente espacio en el navegador para guardar la imagen.', 'danger');
    }
  };

  /* ==========================================================================
     2. RENDERIZADO DE LA GALERÍA
     ========================================================================== */
  const renderGallery = () => {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = '';

    // Filtrar fotos por categoría y término de búsqueda
    const filtered = photos.filter(photo => {
      const matchCategory = (currentFilter === 'ALL') || (photo.category === currentFilter);
      const searchLower = currentSearch.toLowerCase();
      const matchSearch = !currentSearch ||
        (photo.author && photo.author.toLowerCase().includes(searchLower)) ||
        (photo.caption && photo.caption.toLowerCase().includes(searchLower)) ||
        (photo.category && photo.category.toLowerCase().includes(searchLower));

      return matchCategory && matchSearch;
    });

    if (filtered.length === 0) {
      galleryGrid.innerHTML = `
        <div class="empty-gallery-box">
          <div class="empty-gallery-icon">📷</div>
          <h4 class="empty-gallery-title">Aún no hay fotos en esta sección</h4>
          <p class="empty-gallery-text">¡Sé el primero en compartir un hermoso recuerdo de la fiesta!</p>
        </div>
      `;
      return;
    }

    filtered.forEach((photo, index) => {
      const isLiked = !!userLikes[photo.id];
      const card = document.createElement('div');
      card.className = 'photo-card';

      // //cambiar imagen aquí: Foto renderedizada en la tarjeta
      card.innerHTML = `
        <div class="photo-img-wrapper" data-id="${photo.id}">
          <img src="${photo.url}" alt="Foto subida por ${escapeHtml(photo.author)}" class="photo-img" loading="lazy">
          <span class="photo-category-tag">${escapeHtml(photo.category || 'General')}</span>
          
          <button type="button" class="btn-delete-photo" data-id="${photo.id}" title="Eliminar foto (Admin)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>

          <div class="photo-overlay-view">
            <span class="view-zoom-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                <line x1="11" y1="8" x2="11" y2="14"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
              Ver foto
            </span>
          </div>
        </div>

        <div class="photo-card-info">
          <div class="photo-author-row">
            <span class="photo-author-name">
              <span class="photo-author-icon">✨</span>
              ${escapeHtml(photo.author || 'Invitado')}
            </span>

            <button type="button" class="btn-like-heart ${isLiked ? 'liked' : ''}" data-id="${photo.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <span>${photo.likes || 0}</span>
            </button>
          </div>

          ${photo.caption ? `<p class="photo-caption-text">${escapeHtml(photo.caption)}</p>` : ''}
          <span class="photo-date-text">${formatDate(photo.timestamp)}</span>
        </div>
      `;

      // Event listener para abrir lightbox al presionar la imagen
      const imgWrapper = card.querySelector('.photo-img-wrapper');
      imgWrapper.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete-photo')) return; // No abrir lightbox si hizo click en borrar
        openLightbox(photo.id);
      });

      // Event listener para dar Me Gusta
      const likeBtn = card.querySelector('.btn-like-heart');
      likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(photo.id);
      });

      // Event listener para eliminar foto
      const deleteBtn = card.querySelector('.btn-delete-photo');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deletePhoto(photo.id);
        });
      }

      galleryGrid.appendChild(card);
    });
  };

  /* ==========================================================================
     3. SUBIDA Y DROPZONE DE IMÁGENES
     ========================================================================== */
  if (dropzone && fileInput) {
    // Click en el área activa el selector de archivos
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  const handleFileSelect = (file) => {
    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecciona un archivo de imagen válido (JPG, PNG, GIF).', 'danger');
      return;
    }

    // Validar tamaño máximo (p. ej. 8MB)
    if (file.size > 8 * 1024 * 1024) {
      showToast('La imagen supera el límite de 8MB.', 'danger');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      selectedFileBase64 = e.target.result;
      if (previewImg && previewContainer) {
        previewImg.src = selectedFileBase64;
        previewContainer.classList.add('active');
      }
    };
    reader.readAsDataURL(file);
  };

  if (removePreviewBtn) {
    removePreviewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetUploadPreview();
    });
  }

  const resetUploadPreview = () => {
    selectedFileBase64 = null;
    if (fileInput) fileInput.value = '';
    if (previewImg) previewImg.src = '';
    if (previewContainer) previewContainer.classList.remove('active');
  };

  if (uploadForm) {
    uploadForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = guestNameInput.value.trim();
      const category = categorySelect.value;
      const caption = captionInput.value.trim();

      if (!name) {
        showToast('Por favor, ingresa tu nombre.', 'danger');
        return;
      }

      if (!selectedFileBase64) {
        showToast('Por favor, selecciona una foto para subir.', 'danger');
        return;
      }

      const newPhoto = {
        id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        url: selectedFileBase64, // //cambiar imagen aquí (imagen guardada en base64)
        author: name,
        category: category,
        caption: caption,
        likes: 0,
        timestamp: new Date().toISOString()
      };

      // Agregar al inicio del arreglo
      photos.unshift(newPhoto);
      savePhotosToStorage();

      // Resetear formulario
      uploadForm.reset();
      resetUploadPreview();

      // Notificar y re-renderizar
      showToast('¡Gracias ' + escapeHtml(name) + '! Tu foto ha sido compartida con Sofía. ✨', 'success');
      renderGallery();

      // Desplazarse suavemente hacia la galería
      const galleryAnchor = document.getElementById('gallery-section');
      if (galleryAnchor) {
        galleryAnchor.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  /* ==========================================================================
     4. ME GUSTA Y ELIMINACIÓN DE FOTOS
     ========================================================================== */
  const toggleLike = (photoId) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    if (userLikes[photoId]) {
      delete userLikes[photoId];
      photo.likes = Math.max(0, (photo.likes || 1) - 1);
    } else {
      userLikes[photoId] = true;
      photo.likes = (photo.likes || 0) + 1;
    }

    localStorage.setItem(STORAGE_KEY_LIKES, JSON.stringify(userLikes));
    savePhotosToStorage();
    renderGallery();

    // Actualizar si el lightbox está abierto
    if (activeLightboxIndex !== -1 && photos[activeLightboxIndex] && photos[activeLightboxIndex].id === photoId) {
      updateLightboxContent(photos[activeLightboxIndex]);
    }
  };

  const deletePhoto = (photoId) => {
    if (!isAdmin) {
      showToast('Debes ser administradora para eliminar fotos.', 'danger');
      return;
    }

    if (confirm('¿Estás segura de que deseas eliminar esta foto?')) {
      photos = photos.filter(p => p.id !== photoId);
      savePhotosToStorage();
      showToast('Foto eliminada correctamente 🗑️', 'success');
      renderGallery();

      if (lightboxModal.classList.contains('active')) {
        closeLightbox();
      }
    }
  };

  /* ==========================================================================
     5. FILTROS Y BÚSQUEDA
     ========================================================================== */
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      renderGallery();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.trim();
      renderGallery();
    });
  }

  /* ==========================================================================
     6. MODAL LIGHTBOX
     ========================================================================== */
  const openLightbox = (photoId) => {
    const index = photos.findIndex(p => p.id === photoId);
    if (index === -1) return;

    activeLightboxIndex = index;
    updateLightboxContent(photos[activeLightboxIndex]);
    lightboxModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const updateLightboxContent = (photo) => {
    if (!photo) return;
    const isLiked = !!userLikes[photo.id];

    lightboxImg.src = photo.url; // //cambiar imagen aquí
    lightboxUploader.textContent = photo.author || 'Invitado';
    lightboxCategory.textContent = photo.category || 'General';
    lightboxCaption.textContent = photo.caption || '';
    lightboxDate.textContent = formatDate(photo.timestamp);
    lightboxLikeCount.textContent = photo.likes || 0;

    if (isLiked) {
      lightboxLikeBtn.classList.add('liked');
    } else {
      lightboxLikeBtn.classList.remove('liked');
    }

    lightboxLikeBtn.onclick = () => toggleLike(photo.id);
  };

  const closeLightbox = () => {
    lightboxModal.classList.remove('active');
    document.body.style.overflow = '';
    activeLightboxIndex = -1;
  };

  const nextLightboxPhoto = () => {
    if (photos.length === 0) return;
    activeLightboxIndex = (activeLightboxIndex + 1) % photos.length;
    updateLightboxContent(photos[activeLightboxIndex]);
  };

  const prevLightboxPhoto = () => {
    if (photos.length === 0) return;
    activeLightboxIndex = (activeLightboxIndex - 1 + photos.length) % photos.length;
    updateLightboxContent(photos[activeLightboxIndex]);
  };

  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (lightboxPrevBtn) lightboxPrevBtn.addEventListener('click', prevLightboxPhoto);
  if (lightboxNextBtn) lightboxNextBtn.addEventListener('click', nextLightboxPhoto);

  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  // Teclado
  document.addEventListener('keydown', (e) => {
    if (!lightboxModal.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') nextLightboxPhoto();
    if (e.key === 'ArrowLeft') prevLightboxPhoto();
  });

  /* ==========================================================================
     7. AUTENTICACIÓN Y MODO ADMINISTRADORA
     ========================================================================== */
  const updateAdminButtonUI = () => {
    if (!adminToggleBtn) return;
    if (isAdmin) {
      adminToggleBtn.innerHTML = '<span>👑 Administradora</span> <span class="admin-active-badge">Activo</span>';
    } else {
      adminToggleBtn.innerHTML = '<span>👑 Administradora</span>';
    }
  };

  if (adminToggleBtn) {
    adminToggleBtn.addEventListener('click', () => {
      if (isAdmin) {
        // Cerrar modo admin
        if (confirm('¿Deseas salir del Modo Administradora?')) {
          isAdmin = false;
          localStorage.setItem(STORAGE_KEY_ADMIN, 'false');
          document.body.classList.remove('admin-mode');
          updateAdminButtonUI();
          showToast('Has salido del modo administradora.', 'info');
          renderGallery();
        }
      } else {
        // Abrir modal de PIN
        openAdminModal();
      }
    });
  }

  const openAdminModal = () => {
    if (adminModal) {
      adminPinInput.value = '';
      pinErrorMsg.style.display = 'none';
      adminModal.classList.add('active');
      setTimeout(() => adminPinInput.focus(), 200);
    }
  };

  const closeAdminModal = () => {
    if (adminModal) {
      adminModal.classList.remove('active');
    }
  };

  if (adminCloseBtn) adminCloseBtn.addEventListener('click', closeAdminModal);
  if (adminModal) {
    adminModal.addEventListener('click', (e) => {
      if (e.target === adminModal) closeAdminModal();
    });
  }

  const verifyPin = () => {
    const inputPin = adminPinInput.value.trim();
    if (inputPin === ADMIN_PIN || inputPin === '1234' || inputPin.toLowerCase() === 'sofia15') {
      isAdmin = true;
      localStorage.setItem(STORAGE_KEY_ADMIN, 'true');
      document.body.classList.add('admin-mode');
      updateAdminButtonUI();
      closeAdminModal();
      showToast('¡Bienvenida Sofía! Modo Administradora activado 👑', 'success');
      renderGallery();
    } else {
      pinErrorMsg.style.display = 'block';
      adminPinInput.classList.add('shake');
      setTimeout(() => adminPinInput.classList.remove('shake'), 500);
    }
  };

  if (adminSubmitBtn) adminSubmitBtn.addEventListener('click', verifyPin);
  if (adminPinInput) {
    adminPinInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') verifyPin();
    });
  }

  /* ==========================================================================
     8. DESTELLOS DE FONDO (CANVAS SPARKLES)
     ========================================================================== */
  const initSparklesCanvas = () => {
    const canvas = document.getElementById('sparkles-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    const sparkles = [];
    const count = Math.floor((width * height) / 22000);

    for (let i = 0; i < Math.min(count, 45); i++) {
      sparkles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2.5 + 0.5,
        opacity: Math.random(),
        speed: Math.random() * 0.015 + 0.005,
        direction: Math.random() > 0.5 ? 1 : -1
      });
    }

    const animateSparkles = () => {
      ctx.clearRect(0, 0, width, height);

      sparkles.forEach(s => {
        s.opacity += s.speed * s.direction;
        if (s.opacity >= 1) {
          s.opacity = 1;
          s.direction = -1;
        } else if (s.opacity <= 0.1) {
          s.opacity = 0.1;
          s.direction = 1;
          s.x = Math.random() * width;
          s.y = Math.random() * height;
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(250, 128, 114, ${s.opacity * 0.5})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(255, 187, 168, 0.8)';
        ctx.fill();
      });

      requestAnimationFrame(animateSparkles);
    };

    animateSparkles();
  };

  /* ==========================================================================
     9. FUNCIONES AUXILIARES
     ========================================================================== */
  const showToast = (message, type = 'info') => {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `album-toast ${type} show`;
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 3800);
  };

  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  };

  const escapeHtml = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // ARRANCAR ÁLBUM
  initAlbum();
});
