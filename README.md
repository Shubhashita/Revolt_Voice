
# Revolt Motors Gemini Live Chatbot

This project is a real-time, conversational voice interface that replicates the functionality of the Revolt Motors chatbot using the Gemini Live API. It features a Node.js/Express backend that acts as a proxy for the API and a simple HTML/JavaScript frontend.

## Features

- **Real-time Conversation:** Uses WebSockets to stream audio to and from the Gemini Live API, providing a low-latency, conversational experience.
- **Interruptions:** The AI's response can be interrupted by the user speaking again, allowing for natural, fluid conversation.
- **System Instructions:** The AI is instructed to act as an assistant for Revolt Motors, focusing on topics like the RV400 and its features.
- **Clean UI:** A simple, functional interface built with Tailwind CSS for an optimal user experience.

## Prerequisites

- Node.js installed on your machine.
- A Gemini API key. You can get one from [Google AI Studio](https://aistudio.google.com/).

## Setup Instructions

1.  **Clone the repository:**
    ```bash
    git clone [your-github-repo-url]
    cd revolt-gemini-chatbot
    ```
    *If you don't have a repo, you can create the folder structure and files manually.*

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set your Gemini API key:**
    * Set the `GEMINI_API_KEY` environment variable with your key.
    * **macOS/Linux:**
        ```bash
        export GEMINI_API_KEY="YOUR_API_KEY_HERE"
        ```
    * **Windows (Command Prompt):**
        ```bash
        set GEMINI_API_KEY="YOUR_API_KEY_HERE"
        ```
    * **Windows (PowerShell):**
        ```powershell
        $env:GEMINI_API_KEY="YOUR_API_KEY_HERE"
        ```

4.  **Run the server:**
    ```bash
    npm start
    ```
    The server will start on `http://localhost:3001`.

5.  **Open the application:**
    * Open your web browser and navigate to `http://localhost:3001`.
    * Click the microphone button to start speaking and interact with the AI assistant.

Enjoy the conversation!
