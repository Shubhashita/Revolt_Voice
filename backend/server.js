const express = require('express');
const WebSocket = require('ws');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// System instructions for Revolt Motors chatbot
const SYSTEM_INSTRUCTIONS = `
You are Rev, the official AI assistant for Revolt Motors, India's leading electric motorcycle company. Your role is to help customers learn about Revolt's electric bikes and assist with their inquiries.

Key Information about Revolt Motors:
- Revolt Motors manufactures premium electric motorcycles in India
- Main models: RV1, RV400, and RV BlazeX
- RV400: Top speed 85 kmph, 150km range, 4.5 hour charging, AI-enabled features
- RV1: Entry-level model starting from ₹94,983
- RV BlazeX: High-performance variant
- All bikes feature mobile app integration, GPS tracking, and smart connectivity
- Booking available for ₹499 on the website
- AI-enabled features include voice commands, smart diagnostics, and predictive maintenance
- Eco-friendly electric propulsion with zero emissions
- Advanced battery technology with fast charging capabilities

Your personality:
- Enthusiastic about electric mobility and sustainable transportation
- Knowledgeable about technical specifications
- Helpful in guiding customers through the buying process
- Speak naturally and conversationally
- Support both English and Hindi languages
- Be concise but informative
- Always stay focused on Revolt Motors and electric mobility topics

If asked about topics outside of Revolt Motors, electric bikes, or related automotive topics, politely redirect the conversation back to how you can help with Revolt Motors products and services.
`;

// Create HTTP server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store active sessions
const activeSessions = new Map();

class GeminiLiveSession {
    constructor(ws) {
        this.ws = ws;
        this.sessionId = Math.random().toString(36).substring(7);
        this.model = null;
        this.chatSession = null;
        this.isConnected = false;
        this.audioBuffer = [];
        this.isProcessing = false;

        this.initializeGeminiSession();
    }

    async initializeGeminiSession() {
        try {
            // Use development model for testing, switch to native-audio-dialog for production
            const modelName = 'gemini-1.5-flash';

            this.model = genAI.getGenerativeModel({
                model: modelName,
                systemInstruction: SYSTEM_INSTRUCTIONS
            });

            this.chatSession = this.model.startChat({
                generationConfig: {
                    maxOutputTokens: 512,
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40,
                },
            });

            this.isConnected = true;
            this.sendMessage({ type: 'session_ready', sessionId: this.sessionId });
            console.log(`Gemini session initialized: ${this.sessionId}`);

        } catch (error) {
            console.error('Failed to initialize Gemini session:', error);
            this.sendMessage({
                type: 'error',
                message: 'Failed to initialize AI session'
            });
        }
    }

    async processAudioInput(audioData) {
        if (!this.isConnected || this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        try {
            // Convert audio data to base64 if needed
            let audioBase64 = audioData;
            if (typeof audioData !== 'string') {
                audioBase64 = Buffer.from(audioData).toString('base64');
            }

            // For models that support native audio, send audio directly
            if (this.model.model.includes('native-audio-dialog')) {
                const result = await this.chatSession.sendMessage({
                    inlineData: {
                        mimeType: 'audio/wav',
                        data: audioBase64
                    }
                });

                const response = await result.response;
                const text = response.text();

                this.sendMessage({
                    type: 'ai_response',
                    text: text,
                    audio: null // The API should return audio directly
                });
            } else {
                // For text-only models, convert speech to text first
                // This is a simplified approach - in production, you'd use speech-to-text
                this.sendMessage({
                    type: 'processing',
                    message: 'Processing your voice input...'
                });

                // Simulate speech-to-text conversion (replace with actual STT)
                const simulatedText = "Tell me about Revolt Motors bikes";

                const result = await this.chatSession.sendMessage(simulatedText);
                const response = await result.response;
                const text = response.text();

                this.sendMessage({
                    type: 'ai_response',
                    text: text,
                    needsTTS: true // Indicates client should convert to speech
                });
            }

        } catch (error) {
            console.error('Error processing audio:', error);
            this.sendMessage({
                type: 'error',
                message: 'Error processing your request. Please try again.'
            });
        } finally {
            this.isProcessing = false;
        }
    }

    async processTextInput(text) {
        if (!this.isConnected) {
            return;
        }

        try {
            const result = await this.chatSession.sendMessage(text);
            const response = await result.response;
            const responseText = response.text();

            this.sendMessage({
                type: 'ai_response',
                text: responseText,
                needsTTS: true
            });

        } catch (error) {
            console.error('Error processing text:', error);
            this.sendMessage({
                type: 'error',
                message: 'Error processing your request. Please try again.'
            });
        }
    }

    handleInterruption() {
        // Stop current processing and clear audio buffer
        this.isProcessing = false;
        this.audioBuffer = [];

        this.sendMessage({
            type: 'interruption_acknowledged',
            message: 'I\'m listening...'
        });
    }

    sendMessage(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    cleanup() {
        this.isConnected = false;
        this.chatSession = null;
        this.model = null;
        console.log(`Session cleaned up: ${this.sessionId}`);
    }
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection established');

    const session = new GeminiLiveSession(ws);
    activeSessions.set(ws, session);

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
                case 'audio_data':
                    await session.processAudioInput(message.audio);
                    break;

                case 'text_input':
                    await session.processTextInput(message.text);
                    break;

                case 'interruption':
                    session.handleInterruption();
                    break;

                case 'ping':
                    session.sendMessage({ type: 'pong' });
                    break;

                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            session.sendMessage({
                type: 'error',
                message: 'Invalid message format'
            });
        }
    });

    ws.on('close', () => {
        console.log('WebSocket connection closed');
        const session = activeSessions.get(ws);
        if (session) {
            session.cleanup();
            activeSessions.delete(ws);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        const session = activeSessions.get(ws);
        if (session) {
            session.cleanup();
            activeSessions.delete(ws);
        }
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        activeSessions: activeSessions.size,
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');

    // Close all active sessions
    for (const [ws, session] of activeSessions) {
        session.cleanup();
        ws.close();
    }

    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

console.log(`Revolt Motors Voice Chat Server started on port ${PORT}`);
console.log('WebSocket endpoint: ws://localhost:' + PORT);