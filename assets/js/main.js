document.addEventListener('DOMContentLoaded', () => {
  /* ========================================================================
     1. LÓGICA DEL SOBRE DE INICIO (ABRIR INVITACIÓN)
     ======================================================================== */
  const envelopeScreen = document.getElementById('envelope-screen');
  const envelopeWrapper = document.getElementById('envelope-wrapper');
  const waxSealBtn = document.getElementById('wax-seal-btn');
  const bgAudio = document.getElementById('bg-audio');
  
  // Referencias para el botón de música
  const musicBtn = document.getElementById('floating-music-btn');
  const musicDisk = document.getElementById('music-disk');
  const musicStatusText = document.getElementById('music-status-text');
  
  let isMusicPlaying = false;
  
  // Función para abrir la invitación
  const openInvitation = () => {
    // Evitar múltiples clicks
    if (envelopeScreen.classList.contains('opening')) return;
    
    // 1. Agregar clase para iniciar animaciones CSS del sobre
    envelopeScreen.classList.add('opening');
    
    // 2. Intentar reproducir música automáticamente
    playMusic();
    
    // 3. Remover el sobre del DOM después de la animación para no bloquear scroll
    setTimeout(() => {
      envelopeScreen.style.display = 'none';
      document.body.style.overflowY = 'auto'; // Habilitar scroll global
      
      // Activar revelado inicial
      triggerScrollReveal();
    }, 1500); // Coincide con la duración de las animaciones CSS
  };
  
  // Event Listeners para abrir (Clic en el sello o en cualquier parte del sobre)
  if (waxSealBtn) waxSealBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Evitar doble disparo
    openInvitation();
  });
  if (envelopeWrapper) envelopeWrapper.addEventListener('click', openInvitation);
  
  // Prevenir scroll mientras el sobre esté activo
  document.body.style.overflowY = 'hidden';
  
  /* ========================================================================
     2. LÓGICA DEL REPRODUCTOR DE MÚSICA FLOTANTE
     ======================================================================== */
  
  const playMusic = () => {
    bgAudio.play().then(() => {
      isMusicPlaying = true;
      updateMusicUI();
    }).catch(err => {
      console.log("Auto-play bloqueado por el navegador", err);
      isMusicPlaying = false;
      updateMusicUI();
    });
  };
  
  const pauseMusic = () => {
    bgAudio.pause();
    isMusicPlaying = false;
    updateMusicUI();
  };
  
  const toggleMusic = () => {
    if (isMusicPlaying) {
      pauseMusic();
    } else {
      playMusic();
    }
  };
  
  const updateMusicUI = () => {
    if (isMusicPlaying) {
      musicDisk.classList.add('playing');
      musicBtn.classList.add('is-playing');
      musicStatusText.textContent = 'Música';
    } else {
      musicDisk.classList.remove('playing');
      musicBtn.classList.remove('is-playing');
      musicStatusText.textContent = 'Pausa';
    }
  };
  
  if (musicBtn) {
    musicBtn.addEventListener('click', toggleMusic);
  }
  
  /* ========================================================================
     3. REVEAL AL HACER SCROLL (INTERSECTION OBSERVER)
     ======================================================================== */
  const revealElements = document.querySelectorAll('.reveal');
  
  const revealCallback = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        // Opcional: Descomentar la siguiente línea si se quiere que la animación ocurra solo 1 vez
        // observer.unobserve(entry.target); 
      }
    });
  };
  
  const revealOptions = {
    threshold: 0.15,
    rootMargin: "0px 0px -50px 0px"
  };
  
  const revealObserver = new IntersectionObserver(revealCallback, revealOptions);
  
  revealElements.forEach(el => {
    revealObserver.observe(el);
  });
  
  // Función para forzar chequeo inmediato
  const triggerScrollReveal = () => {
    revealElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      if(rect.top < window.innerHeight) {
        el.classList.add('active');
      }
    });
  };
  
  /* ========================================================================
     4. MODAL DATOS DE REGALO (PREX) Y COPIAR AL PORTAPAPELES
     ======================================================================== */
  const openModalBtn = document.getElementById('open-gift-modal-btn');
  const closeModalBtn = document.getElementById('close-gift-modal-btn');
  const giftModal = document.getElementById('gift-modal');
  const copyPrexBtn = document.getElementById('copy-prex-btn');
  const prexNumberVal = document.getElementById('prex-number-val');
  const copyToast = document.getElementById('copy-toast');
  
  if(openModalBtn && giftModal) {
    openModalBtn.addEventListener('click', () => {
      giftModal.classList.add('active');
      document.body.style.overflow = 'hidden'; // Evitar scroll de fondo
    });
  }
  
  const closeGiftModal = () => {
    giftModal.classList.remove('active');
    document.body.style.overflow = 'auto';
  };
  
  if(closeModalBtn) closeModalBtn.addEventListener('click', closeGiftModal);
  
  // Cerrar al clickear fuera de la tarjeta
  if(giftModal) {
    giftModal.addEventListener('click', (e) => {
      if(e.target === giftModal) {
        closeGiftModal();
      }
    });
  }
  
  // Copiar datos
  if(copyPrexBtn && prexNumberVal) {
    copyPrexBtn.addEventListener('click', () => {
      const textToCopy = prexNumberVal.innerText;
      
      navigator.clipboard.writeText(textToCopy).then(() => {
        // Mostrar Toast
        copyToast.classList.add('show');
        
        setTimeout(() => {
          copyToast.classList.remove('show');
        }, 3000);
      }).catch(err => {
        console.error('Error al copiar: ', err);
      });
    });
  }
  
  /* ========================================================================
     5. EFECTO PARTÍCULAS / DESTELLOS DE FONDO (CANVAS HTML5)
     ======================================================================== */
  const canvas = document.getElementById('sparkles-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    let particles = [];
    
    // Manejo resize
    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });
    
    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 2 + 0.5;
        this.speedY = Math.random() * -0.5 - 0.1;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.opacity = Math.random();
        this.fadeDir = Math.random() > 0.5 ? 0.01 : -0.01;
      }
      
      update() {
        this.y += this.speedY;
        this.x += this.speedX;
        
        // Pulso de opacidad
        this.opacity += this.fadeDir;
        if(this.opacity >= 1 || this.opacity <= 0) {
          this.fadeDir *= -1;
        }
        
        // Reposicionar al salir arriba
        if(this.y < 0) {
          this.y = height;
          this.x = Math.random() * width;
        }
      }
      
      draw() {
        ctx.fillStyle = `rgba(250, 128, 114, ${this.opacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    // Crear partículas (menos cantidad para móviles, más para desktop)
    const particleCount = width > 768 ? 40 : 20;
    for(let i=0; i<particleCount; i++) {
      particles.push(new Particle());
    }
    
    const animateParticles = () => {
      ctx.clearRect(0, 0, width, height);
      
      particles.forEach(p => {
        p.update();
        p.draw();
      });
      
      requestAnimationFrame(animateParticles);
    }
    
    animateParticles();
  }
});
