import React, { useState, useRef, useEffect } from 'react';
import './App.css';

// --- 1. WEBHOOK FIXO (BACKEND DKW) ---
const FIXED_WEBHOOK_URL = "https://n8n.dkwsystem.com/webhook/163b7e46-3de0-45c5-8bec-f381e8ea311c";

const App = () => {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  
  // --- 2. CONFIGURAÇÕES DO USUÁRIO ---
  const [userEmail, setUserEmail] = useState('');
  const [userWebhook, setUserWebhook] = useState('');
  
  // Estados de UI
  const [showNameModal, setShowNameModal] = useState(false);
  const [fileName, setFileName] = useState('');
  const [notification, setNotification] = useState({ type: null, message: '' });

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // --- CARREGAR DADOS ---
  useEffect(() => {
    const savedEmail = localStorage.getItem('dkw_user_email');
    const savedWebhook = localStorage.getItem('dkw_user_webhook');
    if (savedEmail) setUserEmail(savedEmail);
    if (savedWebhook) setUserWebhook(savedWebhook);
  }, []);

  // --- TIMER ---
  useEffect(() => {
    if (recording && !paused) {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [recording, paused]);

  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const showDkwNotification = (type, message, autoClose = true) => {
    setNotification({ type, message });
    if (autoClose) {
      setTimeout(() => {
        setNotification({ type: null, message: '' });
      }, 4000);
    }
  };

  // --- NOVO: OTIMIZAÇÃO DE COMPRESSÃO ---
  const getOptimalOptions = () => {
    // Tenta usar codecs modernos (VP9) que comprimem melhor
    const mimeTypes = [
      'video/webm; codecs=vp9', // Melhor compressão
      'video/webm; codecs=vp8', // Padrão
      'video/webm'              // Fallback
    ];

    let selectedMime = mimeTypes.find(mime => MediaRecorder.isTypeSupported(mime)) || 'video/webm';

    return {
      mimeType: selectedMime,
      // A MÁGICA ACONTECE AQUI:
      // 1 Mbps (1.000.000 bits/s) é excelente para tela HD, mas gera arquivos leves.
      // O padrão costuma ser 2.5Mbps+, gerando arquivos 2.5x maiores sem necessidade.
      videoBitsPerSecond: 1000000 
    };
  };

  const startRecording = async () => {
    if (!userEmail) {
      showDkwNotification('error', "⚠️ Preencha seu E-mail antes de gravar.");
      return;
    }

    localStorage.setItem('dkw_user_email', userEmail);
    if (userWebhook) localStorage.setItem('dkw_user_webhook', userWebhook);
    else localStorage.removeItem('dkw_user_webhook');

    try {
      chunksRef.current = [];
      setTimerSeconds(0);

      const displayStream = await navigator.mediaDevices.getDisplayMedia({ 
        video: {
          // Pede resolução Full HD ideal, o navegador ajusta se precisar
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 } // 30 FPS é suficiente para screencast e economiza espaço
        }, 
        audio: true 
      });

      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      
      const audioContext = new AudioContext();
      const dest = audioContext.createMediaStreamDestination();

      if (micStream.getAudioTracks().length > 0) {
        const micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(dest);
      }
      if (displayStream.getAudioTracks().length > 0) {
        const sysSource = audioContext.createMediaStreamSource(displayStream);
        sysSource.connect(dest);
      }

      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      streamRef.current = combinedStream;
      streamRef.current.getTracks().forEach(track => {
          track.onended = () => { if (recording) stopRecording(); };
      });

      // Aplica as configurações otimizadas de compressão
      const options = getOptimalOptions();
      const mediaRecorder = new MediaRecorder(combinedStream, options);
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = prepareSave;
      mediaRecorder.start(1000); // Fatia o vídeo a cada 1s para garantir fluidez
      setRecording(true);
    } catch (err) {
      console.error("Erro ao iniciar:", err);
      showDkwNotification('error', "Não foi possível iniciar a captura.");
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    paused ? mediaRecorderRef.current.resume() : mediaRecorderRef.current.pause();
    setPaused(!paused);
  };

  const stopRecording = () => {
    clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    setRecording(false);
    setPaused(false);
  };

  const prepareSave = () => {
    // Cria o BLOB final usando o mimeType correto
    const options = getOptimalOptions();
    const blob = new Blob(chunksRef.current, { type: options.mimeType });
    blobRef.current = blob;
    chunksRef.current = [];
    setFileName(`video_${Date.now()}`);
    setShowNameModal(true);
  };

  const handleUpload = async () => {
    setShowNameModal(false);
    showDkwNotification('loading', `Compactando e enviando "${fileName}"...`, false);

    const formData = new FormData();
    // Adiciona a extensão correta baseada no codec
    formData.append('file', blobRef.current, `${fileName}.webm`);
    formData.append('filename', fileName);
    formData.append('email', userEmail);

    const uploadPromises = [];

    uploadPromises.push(
      fetch(FIXED_WEBHOOK_URL, { method: 'POST', body: formData })
        .then(res => ({ target: 'DKW System', status: res.ok ? 'OK' : 'ERRO' }))
        .catch(() => ({ target: 'DKW System', status: 'ERRO DE REDE' }))
    );

    if (userWebhook && userWebhook.startsWith('http')) {
      uploadPromises.push(
        fetch(userWebhook, { method: 'POST', body: formData })
          .then(res => ({ target: 'Seu Webhook', status: res.ok ? 'OK' : 'ERRO' }))
          .catch(() => ({ target: 'Seu Webhook', status: 'ERRO DE REDE' }))
      );
    }

    try {
      const results = await Promise.all(uploadPromises);
      const errors = results.filter(r => r.status !== 'OK');

      if (errors.length === 0) {
        showDkwNotification('success', "✅ Gravação enviada com sucesso!");
      } else {
        showDkwNotification('error', `⚠️ Erro no envio. Verifique conexões.`);
        console.error(results);
      }
    } catch (error) {
      console.error(error);
      showDkwNotification('error', "❌ Falha crítica na conexão.");
    }
  };

  return (
    <div className="container">
      {notification.type && (
        <div className={`dkw-notification notification-${notification.type}`}>
          <div className="notification-content">
            <span>{notification.message}</span>
            {notification.type === 'loading' && (
              <div className="dkw-progress-bar"><div className="dkw-progress-fill"></div></div>
            )}
          </div>
        </div>
      )}

      {showNameModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Finalizar Gravação</h3>
            <p>Identificação: <strong>{userEmail}</strong></p>
            <input 
              type="text" 
              value={fileName} 
              onChange={(e) => setFileName(e.target.value)} 
              placeholder="Nome do arquivo"
              className="modal-input"
            />
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleUpload}>🚀 Enviar Gravação</button>
              <button className="btn-secondary" onClick={() => setShowNameModal(false)}>Descartar</button>
            </div>
          </div>
        </div>
      )}

      <div className="main-controls">
        {!recording ? (
          <div className="start-screen">
            <button className="btn-record" onClick={startRecording}><div className="inner-red"></div></button>
            <div className="inputs-container">
              <div className="input-group">
                <label>Seu E-mail (Obrigatório):</label>
                <input type="email" placeholder="seu.nome@dkw.group" value={userEmail} onChange={(e) => setUserEmail(e.target.value)}/>
              </div>
              <div className="input-group">
                <label>Seu Webhook (Opcional):</label>
                <input type="text" placeholder="https://webhook..." value={userWebhook} onChange={(e) => setUserWebhook(e.target.value)}/>
              </div>
            </div>
          </div>
        ) : (
          <div className="active-wrapper">
            <div className={`timer-display ${paused ? 'paused' : ''}`}>
               <span className="rec-dot">●</span> {formatTime(timerSeconds)}
               {paused && <span className="pause-label"> (PAUSADO)</span>}
            </div>
            <div className="active-actions">
              <button className="btn-pause" onClick={togglePause}>{paused ? "▶ RETOMAR" : "⏸ PAUSAR"}</button>
              <button className="btn-stop" onClick={stopRecording}>⬛ FINALIZAR</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;