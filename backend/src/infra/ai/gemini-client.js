// Ficheiro: backend/src/infra/ai/gemini-client.js

const axios = require('axios');
const { logger } = require('../logger');

class GeminiClient {
  /**
   * Comunica com o LLM Gemini utilizando Retry com Backoff Exponencial
   */
  async generateContent(userPrompt, systemPrompt) {
    const apiKey = ""; // A chave é fornecida nativamente pelo ambiente de execução
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    let retries = 5;
    let delay = 1000;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          headers: { 'Content-Type': 'application/json' }
        });

        return response.data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta do assistente fiscal.";
      } catch (error) {
        if (attempt === retries) {
          logger.error(`[GeminiClient] Falha final na comunicação com LLM após ${retries} tentativas: ${error.message}`);
          return "Erro Crítico: Não foi possível comunicar com a inteligência artificial. Tente novamente mais tarde.";
        }
        logger.warn(`[GeminiClient] Falha ao contactar Gemini (Tentativa ${attempt}/${retries}). A aguardar ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2; // Backoff Exponencial (1s, 2s, 4s, 8s, 16s)
      }
    }
  }
}

module.exports = new GeminiClient();