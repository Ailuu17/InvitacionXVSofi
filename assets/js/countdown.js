document.addEventListener('DOMContentLoaded', () => {
  // Fecha objetivo: 20 de Noviembre de 2026 a las 21:00 hs
  const targetDate = new Date("2026-11-20T21:00:00").getTime();
  
  const elDays = document.getElementById('cd-days');
  const elHours = document.getElementById('cd-hours');
  const elMins = document.getElementById('cd-minutes');
  const elSecs = document.getElementById('cd-seconds');
  
  const updateCountdown = () => {
    const now = new Date().getTime();
    const distance = targetDate - now;
    
    // Cálculos de tiempo
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    
    // Renderizado con ceros a la izquierda
    if(elDays) elDays.innerText = days < 10 ? '0' + days : days;
    if(elHours) elHours.innerText = hours < 10 ? '0' + hours : hours;
    if(elMins) elMins.innerText = minutes < 10 ? '0' + minutes : minutes;
    if(elSecs) elSecs.innerText = seconds < 10 ? '0' + seconds : seconds;
    
    // Si la cuenta regresiva terminó
    if (distance < 0) {
      clearInterval(interval);
      if(elDays) elDays.innerText = "00";
      if(elHours) elHours.innerText = "00";
      if(elMins) elMins.innerText = "00";
      if(elSecs) elSecs.innerText = "00";
    }
  };
  
  // Ejecutar inmediatamente una vez
  updateCountdown();
  
  // Actualizar cada segundo
  const interval = setInterval(updateCountdown, 1000);
});
