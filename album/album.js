/* ==========================================================================
   LÓGICA DEL ÁLBUM COMPARTIDO DE FOTOS - MIS XV SOFÍA
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // CLAVES DE ALMACENAMIENTO PERSISTENTE
  const STORAGE_KEY_PHOTOS = 'XV_SOFIA_ALBUM_PHOTOS';
  const STORAGE_KEY_LIKES = 'XV_SOFIA_ALBUM_LIKES';
  const STORAGE_KEY_DELETED = 'XV_SOFIA_ALBUM_DELETED_IDS';
  const STORAGE_KEY_INITIALIZED = 'XV_SOFIA_ALBUM_INIT_V2';

  // ESTADO DE LA APLICACIÓN
  let photos = [];
  let deletedPhotoIds = [];
  let userLikes = JSON.parse(localStorage.getItem(STORAGE_KEY_LIKES) || '{}');
  let isAdmin = false;
  let adminStatusFilter = 'all'; // 'active' | 'archived' | 'all'
  let currentFilter = 'ALL';
  let currentSearch = '';
  let activeLightboxIndex = -1;
  let selectedFileBase64 = null;
  let selectedFile = null;
  let isUploading = false;
  let dbHelper = null;
  let supabase = null;
  let supabaseInitializationError = null;
  const albumConfig = window.XV_SOFIA_ALBUM_CONFIG || {};
  const storageBucket = albumConfig.bucket || 'album-photos';

  // REFERENCIAS DOM
  const galleryGrid = document.getElementById('gallery-grid');
  const uploadSection = document.getElementById('upload-section');
  const uploadToggleBtn = document.getElementById('btn-toggle-upload') || document.querySelector('a[href="#upload-section"]');
  const uploadCloseBtn = document.getElementById('upload-close-btn');
  const uploadForm = document.getElementById('photo-upload-form');
  const guestNameInput = document.getElementById('guest-name');
  const categorySelect = document.getElementById('photo-category');
  const captionInput = document.getElementById('photo-caption');
  const fileInput = document.getElementById('photo-file');
  const dropzone = document.getElementById('dropzone');
  const previewContainer = document.getElementById('preview-container');
  const previewImg = document.getElementById('preview-img');
  const removePreviewBtn = document.getElementById('remove-preview-btn');
  const changePreviewBtn = document.getElementById('change-preview-btn');

  // Filtros y Búsqueda
  const filterTabs = document.querySelectorAll('.filter-tab-btn');
  const adminFilterBar = document.getElementById('admin-filter-bar');
  const adminStatusTabs = document.querySelectorAll('.admin-status-tab-btn');
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
  const adminLoginForm = document.getElementById('admin-login-form');
  const adminPinInput = document.getElementById('admin-pin-input');
  const adminSubmitBtn = document.getElementById('admin-submit-btn');
  const adminCloseBtn = document.getElementById('admin-close-btn');
  const adminAuthError = document.getElementById('admin-auth-error');

  // Admin Exit Modal DOM
  const adminExitModal = document.getElementById('admin-exit-modal');
  const adminExitCloseBtn = document.getElementById('admin-exit-close-btn');
  const adminExitCancelBtn = document.getElementById('admin-exit-cancel-btn');
  const adminExitConfirmBtn = document.getElementById('admin-exit-confirm-btn');

  // Delete Photo Modal DOM
  const deletePhotoModal = document.getElementById('delete-photo-modal');
  const deleteCloseBtn = document.getElementById('delete-close-btn');
  const deleteCancelBtn = document.getElementById('delete-cancel-btn');
  const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
  let photoToDeleteId = null;

  // Toast
  const toastEl = document.getElementById('album-toast');

  /* ==========================================================================
     0. CAPA DE PERSISTENCIA ROBUSTA (IndexedDB + LocalStorage)
     ========================================================================== */
  const initIndexedDB = () => new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = window.indexedDB.open('XV_SOFIA_ALBUM_DB', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });

  const idbGetAllPhotos = (db) => new Promise((resolve) => {
    if (!db) { resolve([]); return; }
    try {
      const tx = db.transaction('photos', 'readonly');
      const store = tx.objectStore('photos');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });

  const idbSaveAllPhotos = (db, photosList) => new Promise((resolve) => {
    if (!db) { resolve(false); return; }
    try {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      store.clear();
      photosList.forEach(p => store.put(p));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });

  const idbDeletePhoto = (db, photoId) => new Promise((resolve) => {
    if (!db) { resolve(false); return; }
    try {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      store.delete(photoId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });

  const idbSetMeta = (db, key, val) => new Promise((resolve) => {
    if (!db) { resolve(false); return; }
    try {
      const tx = db.transaction('meta', 'readwrite');
      const store = tx.objectStore('meta');
      store.put({ key, val });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });

  const idbGetMeta = (db, key) => new Promise((resolve) => {
    if (!db) { resolve(null); return; }
    try {
      const tx = db.transaction('meta', 'readonly');
      const store = tx.objectStore('meta');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.val : null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });

  // Gestión de IDs de fotos eliminadas (persistencia anti-reaparición)
  const loadDeletedIdsFromStorage = async () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DELETED);
      if (stored) {
        deletedPhotoIds = JSON.parse(stored);
      }
    } catch (e) {
      deletedPhotoIds = [];
    }

    if (dbHelper) {
      const idbDeleted = await idbGetMeta(dbHelper, 'deleted_ids');
      if (Array.isArray(idbDeleted)) {
        const merged = Array.from(new Set([...deletedPhotoIds, ...idbDeleted]));
        deletedPhotoIds = merged;
      }
    }
    if (!Array.isArray(deletedPhotoIds)) {
      deletedPhotoIds = [];
    }
  };

  const saveDeletedIdsToStorage = async () => {
    try {
      localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify(deletedPhotoIds));
    } catch (e) {
      console.warn('No se pudo guardar la lista de eliminados en localStorage', e);
    }
    if (dbHelper) {
      await idbSetMeta(dbHelper, 'deleted_ids', deletedPhotoIds);
    }
  };

  const savePhotosToStorage = async () => {
    // Normalizar status en todas las fotos
    photos.forEach(p => {
      if (p.status !== 'archived') {
        p.status = 'active';
      }
    });

    try {
      localStorage.setItem(STORAGE_KEY_PHOTOS, JSON.stringify(photos));
      localStorage.setItem(STORAGE_KEY_INITIALIZED, 'true');
    } catch (e) {
      console.warn('Límite de cuota en LocalStorage alcanzado, guardando en base de datos IndexedDB', e);
    }

    if (dbHelper) {
      await idbSaveAllPhotos(dbHelper, photos);
      await idbSetMeta(dbHelper, 'initialized', true);
    }
  };

  // Recarga directa de almacenamiento para confirmar persistencia
  const refreshAlbumFromStorage = async () => {
    await loadDeletedIdsFromStorage();

    let loadedPhotos = [];
    const stored = localStorage.getItem(STORAGE_KEY_PHOTOS);
    if (stored) {
      try {
        loadedPhotos = JSON.parse(stored);
      } catch (e) {
        loadedPhotos = [];
      }
    }

    if ((!loadedPhotos || loadedPhotos.length === 0) && dbHelper) {
      loadedPhotos = await idbGetAllPhotos(dbHelper);
    }

    if (Array.isArray(loadedPhotos)) {
      // Filtrar fotos eliminadas y asegurar status válido
      photos = loadedPhotos
        .filter(p => !deletedPhotoIds.includes(p.id))
        .map(p => ({
          ...p,
          status: p.status === 'archived' ? 'archived' : 'active'
        }));
    }
  };

  /* ==========================================================================
     1. INICIALIZACIÓN Y CARGA DE FOTOS
     ========================================================================== */
  const initAlbum = async () => {
    initSparklesCanvas();

    // Inicializar IndexedDB
    dbHelper = await initIndexedDB();

    if (albumConfig.supabaseUrl && albumConfig.supabaseAnonKey) {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        supabase = createClient(albumConfig.supabaseUrl, albumConfig.supabaseAnonKey, {
          global: {
            fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' })
          }
        });
      } catch (error) {
        supabaseInitializationError = error;
        console.error('No se pudo inicializar Supabase', error);
        showToast('No se pudo iniciar la conexión con el álbum compartido.', 'danger');
      }
    }

    if (supabase) {
      supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          setAdminMode(false);
          renderGallery();
        }
      });

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session && await isSupabaseAdmin(data.session)) {
          setAdminMode(true);
        }
      } catch (error) {
        console.error('No se pudo verificar la sesión administradora', error);
        showToast('No se pudieron verificar los permisos de administración.', 'danger');
      }
    }

    // Cargar IDs eliminados
    await loadDeletedIdsFromStorage();

    // Comprobar si el álbum ya fue inicializado alguna vez
    const isInitLocalStorage = localStorage.getItem(STORAGE_KEY_INITIALIZED) === 'true';
    let isInitIdb = false;
    if (dbHelper) {
      isInitIdb = (await idbGetMeta(dbHelper, 'initialized')) === true;
    }
    const isInitialized = isInitLocalStorage || isInitIdb;

    // Cargar fotos desde LocalStorage
    const storedPhotos = localStorage.getItem(STORAGE_KEY_PHOTOS);
    if (storedPhotos) {
      try {
        photos = JSON.parse(storedPhotos);
      } catch (e) {
        console.error('Error leyendo fotos de localStorage', e);
        photos = [];
      }
    }

    // Si LocalStorage está vacío, intentar recuperar desde IndexedDB
    if ((!photos || photos.length === 0) && dbHelper) {
      photos = await idbGetAllPhotos(dbHelper);
    }

    // Limpiar cualquier foto que figure en la lista negra de eliminadas
    if (Array.isArray(photos)) {
      photos = photos
        .filter(p => !deletedPhotoIds.includes(p.id))
        .map(p => ({
          ...p,
          status: p.status === 'archived' ? 'archived' : 'active'
        }));
    } else {
      photos = [];
    }

    // Solo cargar fotos por defecto si el álbum NUNCA se inicializó antes
    // (si ya se inicializó y está vacío, significa que el admin eliminó todas las fotos deliberadamente)
    if (!isInitialized && photos.length === 0) {
      await loadDefaultPhotos();
    }

    if (supabase) {
      try {
        await refreshSharedPhotos();
        subscribeToSharedPhotos();
      } catch (error) {
        console.error('No se pudieron cargar las fotos compartidas', error);
        showToast('No se pudieron cargar las fotos compartidas. Revisá la conexión y la configuración.', 'danger');
      }
    }

    renderGallery();
  };

  const loadDefaultPhotos = async () => {
    let rawPhotos = [];
    try {
      const response = await fetch('photos.json');
      if (response.ok) {
        rawPhotos = await response.json();
      } else {
        rawPhotos = getFallbackPhotos();
      }
    } catch (err) {
      console.warn('Usando fotos por defecto locales', err);
      rawPhotos = getFallbackPhotos();
    }

    // NUNCA cargar una foto por defecto si fue previamente eliminada por el admin
    photos = rawPhotos
      .filter(p => !deletedPhotoIds.includes(p.id))
      .map(p => ({
        ...p,
        status: p.status === 'archived' ? 'archived' : 'active'
      }));

    await savePhotosToStorage();
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
      timestamp: new Date().toISOString(),
      status: 'active'
    },
    {
      id: 'photo-default-2',
      url: '../assets/img/salon-el-recreo.jpg', // //cambiar imagen por defecto 2 aquí
      author: 'Familia',
      category: 'Fiesta & Baile',
      caption: 'El salón EL RECREO listo para festejar 💖',
      likes: 18,
      timestamp: new Date().toISOString(),
      status: 'active'
    },
    {
      id: 'photo-default-3',
      url: '../assets/img/sofia-2.jpg', // //cambiar imagen por defecto 3 aquí
      author: 'Sofía',
      category: 'Momentos Inolvidables',
      caption: 'Un recuerdo lleno de amor y alegría 🌹',
      likes: 31,
      timestamp: new Date().toISOString(),
      status: 'active'
    },
    {
      id: 'photo-default-4',
      url: '../assets/img/album-icon.jpg', // //cambiar imagen por defecto 4 aquí
      author: 'Amigos',
      category: 'Con Sofía',
      caption: '¡Con la cumpleañera más linda! 🎉',
      likes: 15,
      timestamp: new Date().toISOString(),
      status: 'active'
    }
  ];

  const mapSharedPhoto = (photo) => ({
    ...photo,
    url: supabase.storage.from(storageBucket).getPublicUrl(photo.storage_path).data.publicUrl,
    status: photo.status === 'archived' ? 'archived' : 'active'
  });

  const refreshSharedPhotos = async () => {
    const { data, error } = await supabase
      .from('album_photos')
      .select('id, storage_path, author, category, caption, likes, timestamp, status')
      .order('timestamp', { ascending: false });

    if (error) throw error;

    const defaultPhotos = photos.filter(photo => photo.id.startsWith('photo-default-'));
    photos = [...(data || []).map(mapSharedPhoto), ...defaultPhotos];
    await savePhotosToStorage();
  };

  const subscribeToSharedPhotos = () => {
    supabase
      .channel('shared-album-photos')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'album_photos'
      }, async () => {
        try {
          await refreshSharedPhotos();
          renderGallery();
        } catch (error) {
          console.error('No se pudo actualizar la galería compartida', error);
          showToast('No se pudo actualizar la galería. Intentá recargar la página.', 'danger');
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Falló la suscripción en tiempo real del álbum:', status);
          showToast('La actualización en tiempo real no está disponible.', 'danger');
        }
      });
  };

  const uploadSharedPhoto = async (photo) => {
    const extensionByType = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    const storagePath = `${photo.id}.${extensionByType[selectedFile.type]}`;
    const { error: uploadError } = await supabase.storage
      .from(storageBucket)
      .upload(storagePath, selectedFile, {
        cacheControl: '3600',
        contentType: selectedFile.type,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data, error: insertError } = await supabase
      .from('album_photos')
      .insert({
        id: photo.id,
        storage_path: storagePath,
        author: photo.author,
        category: photo.category,
        caption: photo.caption,
        status: 'active'
      })
      .select('id, storage_path, author, category, caption, likes, timestamp, status')
      .single();

    if (insertError) {
      console.error('La imagen quedó en Storage sin registro de álbum:', storagePath);
      throw insertError;
    }

    return mapSharedPhoto(data);
  };

  /* ==========================================================================
     2. LÓGICA DE VISIBILIDAD Y RENDERIZADO DE LA GALERÍA
     ========================================================================== */
  // Obtener la lista de fotos visibles según el rol y filtros activos
  const getVisiblePhotos = () => {
    return photos.filter(photo => {
      // 1. Regla de visibilidad por Estado (Active / Archived)
      if (!isAdmin) {
        // Invitados públicos: SOLO ven fotos con status="active"
        if (photo.status !== 'active') return false;
      } else {
        // Administradora: filtros Active / Archived / All
        if (adminStatusFilter === 'active' && photo.status !== 'active') return false;
        if (adminStatusFilter === 'archived' && photo.status !== 'archived') return false;
        // Si adminStatusFilter === 'all', se muestran tanto 'active' como 'archived'
      }

      // 2. Filtro de Categoría
      const matchCategory = (currentFilter === 'ALL') || (photo.category === currentFilter);

      // 3. Filtro de Búsqueda
      const searchLower = currentSearch.toLowerCase();
      const matchSearch = !currentSearch ||
        (photo.author && photo.author.toLowerCase().includes(searchLower)) ||
        (photo.caption && photo.caption.toLowerCase().includes(searchLower)) ||
        (photo.category && photo.category.toLowerCase().includes(searchLower));

      return matchCategory && matchSearch;
    });
  };

  const renderGallery = () => {
    if (!galleryGrid) return;
    galleryGrid.innerHTML = '';

    const visiblePhotos = getVisiblePhotos();

    if (visiblePhotos.length === 0) {
      let emptyMsg = 'Aún no hay fotos en esta sección';
      let emptySub = '¡Sé el primero en compartir un hermoso recuerdo de la fiesta!';
      if (isAdmin && adminStatusFilter === 'archived') {
        emptyMsg = 'No hay fotos archivadas';
        emptySub = 'Las fotos que archives desde el modo administradora aparecerán aquí.';
      } else if (currentSearch) {
        emptyMsg = 'No se encontraron resultados';
        emptySub = 'Probá con otro nombre de invitado o palabra clave.';
      }

      galleryGrid.innerHTML = `
        <div class="empty-gallery-box">
          <div class="empty-gallery-icon">📷</div>
          <h4 class="empty-gallery-title">${escapeHtml(emptyMsg)}</h4>
          <p class="empty-gallery-text">${escapeHtml(emptySub)}</p>
        </div>
      `;
      return;
    }

    visiblePhotos.forEach((photo) => {
      const isLiked = !!userLikes[photo.id];
      const isArchived = photo.status === 'archived';
      const card = document.createElement('div');
      card.className = `photo-card ${isArchived ? 'is-archived' : ''}`;

      // Renderizado de tarjeta con badges y botones de admin
      card.innerHTML = `
        <div class="photo-img-wrapper" data-id="${photo.id}">
          <img src="${photo.url}" alt="Foto subida por ${escapeHtml(photo.author)}" class="photo-img" loading="lazy">
          
          <div class="photo-tags-container">
            <span class="photo-category-tag">${escapeHtml(photo.category || 'General')}</span>
            ${isArchived ? `<span class="photo-archived-badge" title="Foto archivada (Solo visible en Modo Administradora)">📦 Archived</span>` : ''}
          </div>

          <!-- Acciones de Administradora (Archivar y Eliminar) -->
          <div class="admin-photo-actions">
            <button type="button" class="btn-admin-action btn-archive-photo ${isArchived ? 'is-archived' : ''}" data-id="${photo.id}" title="${isArchived ? 'Desarchivar foto (Hacer pública)' : 'Archivar foto (Ocultar del público)'}">
              ${isArchived ? `
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                </svg>
              ` : `
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="21 8 21 21 3 21 3 8"></polyline>
                  <rect x="1" y="3" width="22" height="5"></rect>
                  <line x1="10" y1="12" x2="14" y2="12"></line>
                </svg>
              `}
            </button>
            <button type="button" class="btn-admin-action btn-delete-photo" data-id="${photo.id}" title="Eliminar foto permanentemente (Admin)">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>

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

      // Click en imagen abre el lightbox
      const imgWrapper = card.querySelector('.photo-img-wrapper');
      imgWrapper.addEventListener('click', (e) => {
        if (e.target.closest('.admin-photo-actions')) return;
        openLightbox(photo.id);
      });

      // Evento Me Gusta
      const likeBtn = card.querySelector('.btn-like-heart');
      likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(photo.id);
      });

      // Evento Archivar / Desarchivar (Solo Admin)
      const archiveBtn = card.querySelector('.btn-archive-photo');
      if (archiveBtn) {
        archiveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleArchivePhoto(photo.id);
        });
      }

      // Evento Eliminar Foto (Solo Admin)
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
    dropzone.addEventListener('click', (e) => {
      if (e.target !== fileInput) fileInput.click();
    });

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
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      resetUploadPreview();
      showToast('Seleccioná una imagen JPG, PNG, WEBP o GIF.', 'danger');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      resetUploadPreview();
      showToast('La imagen supera el límite de 8MB.', 'danger');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      selectedFile = file;
      selectedFileBase64 = e.target.result;
      if (previewImg && previewContainer) {
        previewImg.src = selectedFileBase64;
        previewContainer.classList.add('active');
        if (dropzone) dropzone.hidden = true;
      }
    };
    reader.onerror = () => {
      resetUploadPreview();
      showToast('No se pudo leer la imagen seleccionada.', 'danger');
    };
    reader.readAsDataURL(file);
  };

  if (removePreviewBtn) {
    removePreviewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetUploadPreview();
    });
  }

  if (changePreviewBtn && fileInput) {
    changePreviewBtn.addEventListener('click', () => fileInput.click());
  }

  const resetUploadPreview = () => {
    selectedFileBase64 = null;
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    if (previewImg) previewImg.src = '';
    if (previewContainer) previewContainer.classList.remove('active');
    if (dropzone) dropzone.hidden = false;
  };

  /* ==========================================================================
     CONTROL DE VISIBILIDAD DE SECCIÓN DE SUBIDA DE FOTOS
     ========================================================================== */
  const openUploadSection = (shouldScroll = true) => {
    if (!uploadSection) return;
    uploadSection.style.display = 'block';
    void uploadSection.offsetWidth;
    uploadSection.classList.add('active');

    if (shouldScroll) {
      setTimeout(() => {
        uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  };

  const closeUploadSection = () => {
    if (!uploadSection) return;
    uploadSection.classList.remove('active');
    uploadSection.style.display = 'none';
  };

  const toggleUploadSection = () => {
    if (!uploadSection) return;
    const isVisible = uploadSection.classList.contains('active') || window.getComputedStyle(uploadSection).display !== 'none';
    if (isVisible) {
      closeUploadSection();
    } else {
      openUploadSection(true);
    }
  };

  if (uploadToggleBtn) {
    uploadToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleUploadSection();
    });
  }

  if (uploadCloseBtn) {
    uploadCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeUploadSection();
    });
  }

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
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

      if (!supabase) {
        showToast(supabaseInitializationError
          ? 'No se pudo iniciar la conexión con el álbum compartido.'
          : 'El álbum compartido todavía no está configurado.', 'danger');
        return;
      }

      if (isUploading) return;
      isUploading = true;
      const submitButton = uploadForm.querySelector('[type="submit"]');
      if (submitButton) submitButton.disabled = true;

      // Las fotos nuevas siempre nacen con status='active' (visibles para todos)
      const newPhoto = {
        id: 'photo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        author: name,
        category: category,
        caption: caption,
        likes: 0,
        timestamp: new Date().toISOString(),
        status: 'active'
      };

      try {
        const sharedPhoto = await uploadSharedPhoto(newPhoto);
        photos.unshift(sharedPhoto);
        await savePhotosToStorage();

        uploadForm.reset();
        resetUploadPreview();

        showToast('¡Gracias ' + escapeHtml(name) + '! Tu foto ha sido compartida con Sofía. ✨', 'success');
        renderGallery();
        closeUploadSection();

        const galleryAnchor = document.getElementById('gallery-section');
        if (galleryAnchor) {
          galleryAnchor.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (error) {
        console.error('No se pudo publicar la foto en el álbum compartido', error);
        showToast('No se pudo publicar la foto: ' + (error.message || 'error de conexión o permisos.'), 'danger');
      } finally {
        isUploading = false;
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  /* ==========================================================================
     4. ACCIONES DE ADMINISTRADORA: ARCHIVAR Y ELIMINAR FOTOS
     ========================================================================== */
  const toggleLike = async (photoId) => {
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
    await savePhotosToStorage();
    renderGallery();

    const visiblePhotos = getVisiblePhotos();
    if (activeLightboxIndex !== -1 && visiblePhotos[activeLightboxIndex] && visiblePhotos[activeLightboxIndex].id === photoId) {
      updateLightboxContent(visiblePhotos[activeLightboxIndex]);
    }
  };

  // Archivar o Desarchivar una foto
  const toggleArchivePhoto = async (photoId) => {
    if (!isAdmin) {
      showToast('Debes ser administradora para archivar fotos.', 'danger');
      return;
    }

    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    const isCurrentlyArchived = photo.status === 'archived';
    const nextStatus = isCurrentlyArchived ? 'active' : 'archived';

    try {
      if (photo.storage_path) {
        const { data, error } = await supabase
          .from('album_photos')
          .update({ status: nextStatus })
          .eq('id', photoId)
          .select('id, status')
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error('Supabase no autorizó el cambio de estado de esta foto.');
        photo.status = data.status;
        await refreshSharedPhotos();
      } else {
        photo.status = nextStatus;
        await savePhotosToStorage();
        await refreshAlbumFromStorage();
      }
    } catch (error) {
      console.error('No se pudo cambiar el estado de la foto', error);
      showToast('No se pudo archivar o desarchivar la foto. Verificá la conexión y los permisos de Supabase.', 'danger');
      return;
    }

    const toastMsg = photo.status === 'archived'
      ? 'Foto archivada 📦 Ahora solo es visible en modo administradora.'
      : 'Foto desarchivada ✨ Ahora es visible públicamente para todos.';
    showToast(toastMsg, 'success');

    renderGallery();

    // Si el lightbox estaba abierto mostrando esta foto, actualizar visor
    const visiblePhotos = getVisiblePhotos();
    if (activeLightboxIndex !== -1 && visiblePhotos[activeLightboxIndex]) {
      updateLightboxContent(visiblePhotos[activeLightboxIndex]);
    }
  };

  // Apertura de modal de eliminación permanente
  const openDeletePhotoModal = (photoId) => {
    photoToDeleteId = photoId;
    if (deletePhotoModal) {
      deletePhotoModal.classList.add('active');
    }
  };

  const closeDeletePhotoModal = () => {
    photoToDeleteId = null;
    if (deletePhotoModal) {
      deletePhotoModal.classList.remove('active');
    }
  };

  if (deleteCloseBtn) deleteCloseBtn.addEventListener('click', closeDeletePhotoModal);
  if (deleteCancelBtn) deleteCancelBtn.addEventListener('click', closeDeletePhotoModal);
  if (deletePhotoModal) {
    deletePhotoModal.addEventListener('click', (e) => {
      if (e.target === deletePhotoModal) closeDeletePhotoModal();
    });
  }

  // Confirmar eliminación permanente de la foto
  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', async () => {
      if (!photoToDeleteId || !isAdmin) {
        closeDeletePhotoModal();
        return;
      }

      const idToDelete = photoToDeleteId;
      const photo = photos.find(item => item.id === idToDelete);
      if (!photo) {
        closeDeletePhotoModal();
        return;
      }

      deleteConfirmBtn.disabled = true;
      try {
        if (photo.storage_path) {
          const { data, error } = await supabase
            .from('album_photos')
            .delete()
            .eq('id', idToDelete)
            .select('id, storage_path')
            .maybeSingle();

          if (error) throw error;
          if (!data) throw new Error('Supabase no autorizó la eliminación de esta foto.');

          const { error: storageError } = await supabase.storage
            .from(storageBucket)
            .remove([data.storage_path]);
          if (storageError) {
            console.error('No se pudo eliminar el archivo de Storage', storageError);
            showToast('La foto se quitó del álbum, pero no se pudo borrar su archivo de Storage.', 'danger');
          } else {
            showToast('Foto eliminada permanentemente del álbum 🗑️', 'success');
          }

          await refreshSharedPhotos();
        } else {
          if (!deletedPhotoIds.includes(idToDelete)) {
            deletedPhotoIds.push(idToDelete);
          }
          await saveDeletedIdsToStorage();
          photos = photos.filter(item => item.id !== idToDelete);
          await savePhotosToStorage();
          if (dbHelper) await idbDeletePhoto(dbHelper, idToDelete);
          await refreshAlbumFromStorage();
          showToast('Foto eliminada permanentemente del álbum 🗑️', 'success');
        }

        if (userLikes[idToDelete]) {
          delete userLikes[idToDelete];
          localStorage.setItem(STORAGE_KEY_LIKES, JSON.stringify(userLikes));
        }

        renderGallery();
        if (lightboxModal && lightboxModal.classList.contains('active')) {
          closeLightbox();
        }
        closeDeletePhotoModal();
      } catch (error) {
        console.error('No se pudo eliminar la foto', error);
        showToast('No se pudo eliminar la foto. Verificá la conexión y los permisos de Supabase.', 'danger');
      } finally {
        deleteConfirmBtn.disabled = false;
      }
    });
  }

  const deletePhoto = (photoId) => {
    if (!isAdmin) {
      showToast('Debes ser administradora para eliminar fotos.', 'danger');
      return;
    }
    openDeletePhotoModal(photoId);
  };

  /* ==========================================================================
     5. FILTROS Y BÚSQUEDA
     ========================================================================== */
  // Pestañas de categoría de invitados
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      renderGallery();
    });
  });

  // Pestañas de estado exclusivas de Administradora: [Active] [Archived] [All]
  adminStatusTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      adminStatusTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      adminStatusFilter = tab.getAttribute('data-status') || 'all';
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
    const visiblePhotos = getVisiblePhotos();
    const index = visiblePhotos.findIndex(p => p.id === photoId);
    if (index === -1) return;

    activeLightboxIndex = index;
    updateLightboxContent(visiblePhotos[activeLightboxIndex]);
    lightboxModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const updateLightboxContent = (photo) => {
    if (!photo) return;
    const isLiked = !!userLikes[photo.id];
    const isArchived = photo.status === 'archived';

    lightboxImg.src = photo.url;
    lightboxUploader.textContent = photo.author || 'Invitado';

    let categoryText = photo.category || 'General';
    if (isAdmin && isArchived) {
      categoryText += ' • 📦 ARCHIVADA';
    }
    lightboxCategory.textContent = categoryText;

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
    const visiblePhotos = getVisiblePhotos();
    if (visiblePhotos.length === 0) return;
    activeLightboxIndex = (activeLightboxIndex + 1) % visiblePhotos.length;
    updateLightboxContent(visiblePhotos[activeLightboxIndex]);
  };

  const prevLightboxPhoto = () => {
    const visiblePhotos = getVisiblePhotos();
    if (visiblePhotos.length === 0) return;
    activeLightboxIndex = (activeLightboxIndex - 1 + visiblePhotos.length) % visiblePhotos.length;
    updateLightboxContent(visiblePhotos[activeLightboxIndex]);
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

  const setAdminMode = (enabled) => {
    isAdmin = enabled;
    document.body.classList.toggle('admin-mode', enabled);
    updateAdminButtonUI();
  };

  const isSupabaseAdmin = async (session) => {
    const { data, error } = await supabase
      .from('album_admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data);
  };

  const openAdminExitModal = () => {
    if (adminExitModal) {
      adminExitModal.classList.add('active');
    }
  };

  const closeAdminExitModal = () => {
    if (adminExitModal) {
      adminExitModal.classList.remove('active');
    }
  };

  if (adminExitCloseBtn) adminExitCloseBtn.addEventListener('click', closeAdminExitModal);
  if (adminExitCancelBtn) adminExitCancelBtn.addEventListener('click', closeAdminExitModal);
  if (adminExitModal) {
    adminExitModal.addEventListener('click', (e) => {
      if (e.target === adminExitModal) closeAdminExitModal();
    });
  }

  if (adminExitConfirmBtn) {
    adminExitConfirmBtn.addEventListener('click', async () => {
      closeAdminExitModal();
      adminStatusFilter = 'all';
      if (supabase) {
        let error;
        try {
          ({ error } = await supabase.auth.signOut());
        } catch (signOutError) {
          error = signOutError;
        }
        if (error) {
          console.error('No se pudo cerrar la sesión administradora en Supabase', error);
          setAdminMode(false);
          showToast('Se cerró el modo administradora en esta página, pero Supabase no confirmó el cierre de sesión.', 'danger');
          renderGallery();
          return;
        }
      }
      setAdminMode(false);
      showToast('Has salido del modo administradora.', 'info');
      renderGallery();
    });
  }

  if (adminToggleBtn) {
    adminToggleBtn.addEventListener('click', () => {
      if (isAdmin) {
        openAdminExitModal();
      } else {
        openAdminModal();
      }
    });
  }

  const openAdminModal = () => {
    if (adminModal) {
      adminPinInput.value = '';
      adminAuthError.style.display = 'none';
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

  const signInAdmin = async (event) => {
    event.preventDefault();
    adminAuthError.style.display = 'none';
    if (!supabase) {
      adminAuthError.textContent = 'No está disponible la conexión con Supabase. Revisá la configuración del álbum.';
      adminAuthError.style.display = 'block';
      return;
    }

    adminSubmitBtn.disabled = true;
    adminSubmitBtn.textContent = 'Verificando acceso...';
    try {
      const { data, error } = await supabase.functions.invoke('admin-pin-login', {
        body: { pin: adminPinInput.value }
      });
      if (error) throw error;
      if (!data.access_token || !data.refresh_token) {
        throw new Error('El servicio de autenticación no devolvió una sesión válida.');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      });
      if (sessionError) throw sessionError;
      if (!sessionData.session || !await isSupabaseAdmin(sessionData.session)) {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.error('No se pudo cerrar la sesión de una cuenta sin permisos de administración', signOutError);
        }
        adminAuthError.textContent = 'La cuenta vinculada al PIN no está habilitada como administradora del álbum.';
        adminAuthError.style.display = 'block';
        return;
      }

      setAdminMode(true);
      adminPinInput.value = '';
      closeAdminModal();
      adminStatusFilter = 'all';
      adminStatusTabs.forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-status') === 'all');
      });
      showToast('¡Bienvenida! Modo administradora activado 👑', 'success');
      renderGallery();
    } catch (error) {
      console.error('No se pudo iniciar sesión administradora', error);
      adminAuthError.textContent = 'No se pudo validar el PIN. Revisá que sea correcto y que el acceso seguro esté configurado en Supabase.';
      adminAuthError.style.display = 'block';
    } finally {
      adminSubmitBtn.disabled = false;
      adminSubmitBtn.textContent = 'Ingresar como Administradora';
    }
  };

  if (adminLoginForm) adminLoginForm.addEventListener('submit', signInAdmin);

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
