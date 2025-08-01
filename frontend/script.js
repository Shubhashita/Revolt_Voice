class RevoltVoiceChat {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.isConnected = false;
        this.isProcessing = false;
        this.currentAudio = null;
        this.speechSynthesis = window.speechSynthesis;

        this.initializeElements();
        this.initializeEventListeners();
        this.connectWebSocket();

        // Hide loading overlay after initialization
        setTimeout(() => {
            document.getElementById('loadingOverlay').classList.add('hidden');
        }, 1500);
    }

    initializeElements() {
        this.elements = {
            micButton: document.getElementById('micButton'),
            stopButton: document.getElementById('stopButton'),
            textInput: document.getElementById('textInput'),
            sendButton: document.getElementById('sendButton'),
            messages: document.getElementById('messages'),
            connectionStatus: document.getElementById('connectionStatus'),
            voiceStatus: document.getElementById('voiceStatus'),
            audioVisualizer: document.getElementById('audioVisualizer')
        };
    }

    initializeEventListeners() {
        // Microphone button
        this.elements.micButton.addEventListener('click', () => {
            if (this.isRecording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });

        // Stop button
        this.elements.stopButton.addEventListener('click', () => {
            this.stopAIResponse();
        });

        // Text input
        this.elements.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendTextMessage();
            }
        });

        // Send button
        this.elements.sendButton.addEventListener('click', () => {
            this.sendTextMessage();
        });

        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.ctrlKey) {
                e.preventDefault();
                if (this.isRecording) {
                    this.stopRecording();
                } else {
                    this.startRecording();
                }
            }

            if (e.code === 'Escape') {
                this.stopAIResponse();
            }
        });

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRecording) {
                this.stopRecording();
            }
        });
    }

    connectWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}`;

        console.log('Connecting to WebSocket:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.isConnected = true;
            this.updateConnectionStatus('connected', 'Connected to Rev');
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.isConnected = false;
            this.updateConnectionStatus('disconnected', 'Disconnected');

            // Attempt to reconnect after 3 seconds
            setTimeout(() => {
                if (!this.isConnected) {
                    this.connectWebSocket();
                }
            }, 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('disconnected', 'Connection Error');
        };
    }

    handleWebSocketMessage(message) {
        console.log('Received message:', message);

        switch (message.type) {
            case 'session_ready':
                this.updateVoiceStatus('Ready to chat! Click the microphone or type below.');
                break;

            case 'ai_response':
                this.handleAIResponse(message);
                break;

            case 'processing':
                this.updateVoiceStatus(message.message);
                this.isProcessing = true;
                break;

            case 'interruption_acknowledged':
                this.updateVoiceStatus(message.message);
                break;

            case 'error':
                this.handleError(message.message);
                break;

            case 'pong':
                // Keep-alive response
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    async startRecording() {
        if (!this.isConnected) {
            this.showNotification('Please wait for connection to establish', 'warning');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });

            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processAudioData();
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;

            this.updateUI('recording');
            this.updateVoiceStatus('Listening... (Click to stop or just start speaking)');
            this.elements.audioVisualizer.classList.add('active');

        } catch (error) {
            console.error('Error starting recording:', error);
            this.showNotification('Microphone access denied. Please allow microphone access.', 'error');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.updateUI('idle');
            this.elements.audioVisualizer.classList.remove('active');
            this.updateVoiceStatus('Processing your message...');
        }
    }

    async processAudioData() {
        if (this.audioChunks.length === 0) return;

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });

        // Convert to base64 for transmission
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];

            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'audio_data',
                    audio: base64Audio
                }));
            }
        };
        reader.readAsDataURL(audioBlob);
    }

    sendTextMessage() {
        const text = this.elements.textInput.value.trim();
        if (!text || !this.isConnected) return;

        // Add user message to chat
        this.addMessage('user', text);

        // Send to server
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'text_input',
                text: text
            }));
        }

        // Clear input
        this.elements.textInput.value = '';
        this.updateVoiceStatus('Processing your message...');
        this.isProcessing = true;
    }

    handleAIResponse(message) {
        this.isProcessing = false;

        // Add AI message to chat
        this.addMessage('ai', message.text);

        // Handle text-to-speech if needed
        if (message.needsTTS) {
            this.speakText(message.text);
        }

        this.updateVoiceStatus('Ready for your next message');
        this.updateUI('idle');
    }

    speakText(text) {
        // Stop any current speech
        this.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;

        // Find a suitable voice (prefer English or Indian English)
        const voices = this.speechSynthesis.getVoices();
        const preferredVoice = voices.find(voice =>
            voice.lang.includes('en') && (voice.name.includes('English') || voice.name.includes('Indian'))
        ) || voices.find(voice => voice.lang.includes('en'));

        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }

        utterance.onstart = () => {
            this.updateVoiceStatus('Rev is speaking... (You can interrupt anytime)');
            this.elements.stopButton.style.display = 'block';
            this.elements.micButton.style.display = 'none';
        };

        utterance.onend = () => {
            this.updateVoiceStatus('Ready for your next message');
            this.elements.stopButton.style.display = 'none';
            this.elements.micButton.style.display = 'block';
        };

        utterance.onerror = (error) => {
            console.error('Speech synthesis error:', error);
            this.updateVoiceStatus('Ready for your next message');
            this.elements.stopButton.style.display = 'none';
            this.elements.micButton.style.display = 'block';
        };

        this.speechSynthesis.speak(utterance);
    }

    stopAIResponse() {
        // Stop speech synthesis
        this.speechSynthesis.cancel();

        // Send interruption signal
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'interruption'
            }));
        }

        this.updateUI('idle');
        this.updateVoiceStatus('Interrupted. Ready for your message.');
    }

    addMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = sender === 'ai' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';

        const content = document.createElement('div');
        content.className = 'message-content';
        content.innerHTML = `<p>${this.escapeHtml(text)}</p>`;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        this.elements.messages.appendChild(messageDiv);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    updateConnectionStatus(status, text) {
        const indicator = this.elements.connectionStatus.querySelector('.status-indicator');
        const statusText = this.elements.connectionStatus.querySelector('.status-text');

        indicator.className = `status-indicator ${status}`;
        statusText.textContent = text;
    }

    updateVoiceStatus(text) {
        this.elements.voiceStatus.innerHTML = `<p>${text}</p>`;

        // Add appropriate CSS class based on status
        this.elements.voiceStatus.className = 'voice-status';
        if (text.includes('Listening')) {
            this.elements.voiceStatus.classList.add('listening');
        } else if (text.includes('Processing')) {
            this.elements.voiceStatus.classList.add('processing');
        }
    }

    updateUI(state) {
        const micButton = this.elements.micButton;
        const stopButton = this.elements.stopButton;

        switch (state) {
            case 'recording':
                micButton.classList.add('recording');
                micButton.querySelector('i').className = 'fas fa-stop';
                break;

            case 'idle':
                micButton.classList.remove('recording');
                micButton.querySelector('i').className = 'fas fa-microphone';
                stopButton.style.display = 'none';
                this.elements.micButton.style.display = 'block';
                break;
        }
    }

    handleError(message) {
        this.isProcessing = false;
        this.showNotification(message, 'error');
        this.updateVoiceStatus('Error occurred. Please try again.');
        this.updateUI('idle');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // Add styles
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 10px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideInRight 0.3s ease-out;
            background: ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'};
        `;

        document.body.appendChild(notification);

        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 4000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Keep-alive ping
    startKeepAlive() {
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000); // Ping every 30 seconds
    }
}

// Global functions for modal
function showHelp() {
    document.getElementById('helpModal').style.display = 'block';
}

function closeHelp() {
    document.getElementById('helpModal').style.display = 'none';
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        
        .notification {
            max-width: 350px;
            word-wrap: break-word;
        }
    `;
    document.head.appendChild(style);

    // Initialize the voice chat application
    const app = new RevoltVoiceChat();
    app.startKeepAlive();

    // Handle speech synthesis voices loading
    if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
            console.log('Speech synthesis voices loaded');
        };
    }

    console.log('Revolt Motors Voice Chat initialized');
});

// Handle modal clicks
window.onclick = function (event) {
    const modal = document.getElementById('helpModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};