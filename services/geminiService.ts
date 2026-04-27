import { GoogleGenAI, Modality, LiveServerMessage, Type } from "@google/genai";
import { PRODUCT_MASTER_DATA } from "../knowledge/productMaster.ts";
import { MAYANK_POLICY_DATA } from "../knowledge/mayankPolicy.ts";
import { PUNE_NETWORK_HOSPITALS, HOSPITAL_SEARCH_INSTRUCTIONS } from "../knowledge/networkHospitals.ts";
import { tryWithFallbackModel } from "../utils/retryLogic.ts";
import { proxyGenerate, getLiveToken } from "./authService.ts";

const PRIMARY_MODEL = 'gemini-3-pro-preview';
const FALLBACK_MODEL = 'gemini-3-flash-preview';
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

const MASTER_KNOWLEDGE_BASE = `
--- PRODUCT MASTER: ICICI LOMBARD ELEVATE HEALTH ---
${PRODUCT_MASTER_DATA}

--- CUSTOMER POLICY: MAYANK PRADIP MUNDHRA ---
${MAYANK_POLICY_DATA}

--- NETWORK HOSPITALS ---
${PUNE_NETWORK_HOSPITALS}
${HOSPITAL_SEARCH_INSTRUCTIONS}
`;

export interface ChatResult {
  answer: string;
  suggestions: string[];
}

function extractText(response: any): string {
  try {
    return response.candidates?.[0]?.content?.parts?.[0]?.text || response.text || '';
  } catch {
    return '';
  }
}

export const generateChatResponse = async (userMessage: string, history: {role: string, content: string}[]): Promise<ChatResult> => {
  const conversationContext = history.map(h => `${h.role}: ${h.content}`).join('\n');

  const prompt = `
    KNOWLEDGE BASE:
    ${MASTER_KNOWLEDGE_BASE}

    CONVERSATION HISTORY:
    ${conversationContext}

    USER QUESTION:
    ${userMessage}
  `;

  const systemInstruction = `
    You are "RIA", a high-precision Insurance AI Concierge for ICICI Lombard.

    STRICT COMMUNICATION RULES:
    1. NO SOURCE REFERENCING: Never mention "the document," "policy schedule," "Section 3," "knowledge base," "Document 1," or "the text."
       - DO NOT say: "According to the document..." or "It is not listed in the sections..."
       - DO say: "No, dental treatment is not covered."

    2. DEFINITIVE AUTHORITY: Speak like an expert who simply knows the facts.
       - If a benefit is not in the knowledge base, state firmly that it is NOT covered.
       - Example: "No, dental treatment is not covered under the Elevate Health Policy."

    3. NO HALLUCINATIONS: Use the provided Knowledge Base to find facts, but present them as your own expert knowledge.

    4. SPECIFIC IDENTITIES:
       - This is HEALTH insurance. Correct any mention of Life insurance directly: "This is a Health Insurance policy, not a Life Insurance policy."
       - User is Mayank Mundhra.
       - Base Sum Insured: ₹10,00,000.
       - Infinite Care: Unlimited coverage for ONE claim in a lifetime.

    5. TONE:
       - Professional, authoritative, and concise.
       - Multilingual (English, Hindi, Hinglish).
       - Use bold text for key figures, names, and status.

    6. REASONING:
       - If a treatment is usually covered only during hospitalization (like dental in accidents), you may add that nuance, but do not mention that you found it in a specific clause.
  `;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        answer: { type: "STRING" },
        suggestions: { type: "ARRAY", items: { type: "STRING" } }
      },
      required: ["answer", "suggestions"]
    }
  };

  const baseRequest = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction,
    generationConfig
  };

  const response = await tryWithFallbackModel(
    async () => proxyGenerate({ ...baseRequest, model: PRIMARY_MODEL }),
    async () => proxyGenerate({ ...baseRequest, model: FALLBACK_MODEL })
  );

  const text = extractText(response);
  try {
    const result = JSON.parse(text || '{}');
    return {
      answer: result.answer,
      suggestions: (result.suggestions || []).map((s: string) => s.replace(/^Your/i, "My"))
    };
  } catch (e) {
    return {
      answer: text || "I apologize, I'm unable to provide that information at the moment.",
      suggestions: ["What is my sum insured?", "Is dental covered?"]
    };
  }
};

export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function createPcmBlob(data: Float32Array): any {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encodeBase64(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export interface LiveSessionCallbacks {
  onMessage: (message: LiveServerMessage) => void;
  onError: (e: any) => void;
  onClose: () => void;
  onOpen?: () => void;
}

export const connectLive = async (callbacks: LiveSessionCallbacks) => {
  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
    },
    systemInstruction: `
      You are "RIA", a high-precision Insurance AI Concierge for ICICI Lombard.

      KNOWLEDGE BASE:
      ${MASTER_KNOWLEDGE_BASE}

      STRICT COMMUNICATION RULES:
      1. NO SOURCE REFERENCING: Never mention "the document," "policy schedule," "Section 3," "knowledge base," "Document 1," or "the text."
         - DO NOT say: "According to the document..." or "It is not listed in the sections..."
         - DO say: "No, dental treatment is not covered."

      2. DEFINITIVE AUTHORITY: Speak like an expert who simply knows the facts.
         - If a benefit is not in the knowledge base, state firmly that it is NOT covered.
         - Example: "No, dental treatment is not covered under the Elevate Health Policy."

      3. NO HALLUCINATIONS: Use ONLY the provided Knowledge Base. If information is not present, clearly state "This information is not available in your current policy."

      4. SPECIFIC IDENTITIES:
         - This is HEALTH insurance. Correct any mention of Life insurance directly: "This is a Health Insurance policy, not a Life Insurance policy."
         - User is Mayank Mundhra.
         - Policy Number: 5301/6503/00/00005645
         - Base Sum Insured: ₹10,00,000
         - Infinite Care: Unlimited coverage for ONE claim in a lifetime.

      5. HOSPITAL INFORMATION:
         - When asked about network hospitals in Pune, provide the complete list with addresses and contact numbers
         - Always mention cashless facility availability
         - Remind users to verify network status at admission time
         - Use the hospital data from the knowledge base

      6. TONE:
         - Professional, authoritative, and concise.
         - Conversational for voice responses
         - Use natural speech patterns
         - Multilingual (English, Hindi, Hinglish).

      7. POLICY VERIFICATION:
         - Always verify information against the knowledge base
         - If unsure, say "Let me verify this with your policy details" rather than guessing
         - For complex queries, break down the answer into clear points
    `,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };

  const { token: ephemeralToken } = await getLiveToken(LIVE_MODEL, liveConfig);

  const ai = new GoogleGenAI({
    apiKey: ephemeralToken,
    httpOptions: { apiVersion: 'v1alpha' },
  });

  return ai.live.connect({
    model: LIVE_MODEL,
    callbacks: {
      onopen: callbacks.onOpen || (() => {}),
      onmessage: callbacks.onMessage,
      onerror: callbacks.onError,
      onclose: callbacks.onClose,
    },
    // No config — all constraints baked into the ephemeral token
  });
};
