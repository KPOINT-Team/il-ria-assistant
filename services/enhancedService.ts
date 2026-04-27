import { PRODUCT_MASTER_DATA } from "../knowledge/productMaster.ts";
import { MAYANK_POLICY_DATA } from "../knowledge/mayankPolicy.ts";
import { PUNE_NETWORK_HOSPITALS, HOSPITAL_SEARCH_INSTRUCTIONS } from "../knowledge/networkHospitals.ts";
import { tryWithFallbackModel } from "../utils/retryLogic.ts";
import { proxyGenerate } from "./authService.ts";

function extractText(response: any): string {
  try {
    return response.candidates?.[0]?.content?.parts?.[0]?.text || response.text || '';
  } catch {
    return '';
  }
}

const MASTER_KNOWLEDGE_BASE = `
--- PRODUCT MASTER: ICICI LOMBARD ELEVATE HEALTH ---
${PRODUCT_MASTER_DATA}

--- CUSTOMER POLICY: MAYANK PRADIP MUNDHRA ---
${MAYANK_POLICY_DATA}

--- NETWORK HOSPITALS ---
${PUNE_NETWORK_HOSPITALS}
${HOSPITAL_SEARCH_INSTRUCTIONS}
`;

export interface EnhancedChatResult {
  answer: string;
  suggestions: string[];
  followUpQuestions?: string[];
  contextActions?: ContextAction[];
  requiresFeedback?: boolean;
}

export interface ContextAction {
  type: 'download' | 'navigate' | 'external_link';
  label: string;
  action: string;
  icon?: string;
}

export interface FeedbackData {
  sessionId: string;
  messageId: string;
  rating: number; // 1-5
  comment?: string;
  timestamp: Date;
  queryType: string;
}

// Categorize query types for anticipatory responses
export const categorizeQuery = (message: string): string => {
  const lowerMessage = message.toLowerCase();

  // Check for document/download requests first (higher priority)
  if (
    lowerMessage.includes('document') ||
    lowerMessage.includes('download') ||
    lowerMessage.includes('policy copy') ||
    lowerMessage.includes('my policy') ||
    lowerMessage.includes('show policy') ||
    lowerMessage.includes('get policy') ||
    lowerMessage.includes('policy schedule') ||
    lowerMessage.includes('e-card') ||
    lowerMessage.includes('ecard') ||
    lowerMessage.includes('id card') ||
    lowerMessage.includes('insurance card')
  ) {
    return 'documents';
  } else if (lowerMessage.includes('claim') || lowerMessage.includes('cashless')) {
    return 'claims';
  } else if (lowerMessage.includes('coverage') || lowerMessage.includes('covered') || lowerMessage.includes('benefit')) {
    return 'coverage';
  } else if (lowerMessage.includes('hospital') || lowerMessage.includes('network')) {
    return 'hospitals';
  } else if (lowerMessage.includes('premium') || lowerMessage.includes('payment')) {
    return 'payment';
  } else if (lowerMessage.includes('sum insured') || lowerMessage.includes('coverage amount')) {
    return 'policy_details';
  }

  return 'general';
};

// Generate anticipatory follow-up questions based on query category
export const getAnticipatedFollowUps = (category: string, context: string): string[] => {
  const followUps: { [key: string]: string[] } = {
    claims: [
      "How do I track my claim status?",
      "What documents are needed for claims?",
      "Can I get pre-authorization for planned surgery?"
    ],
    coverage: [
      "Are there any waiting periods for this treatment?",
      "What is the claim procedure for this benefit?",
      "Can I see my full policy benefits?"
    ],
    hospitals: [
      "How do I get cashless treatment?",
      "Can I use any hospital or only network hospitals?",
      "What if the hospital is not in the network?"
    ],
    payment: [
      "How can I pay my premium online?",
      "What are the tax benefits on health insurance?",
      "Can I change my payment mode?"
    ],
    documents: [
      "How do I download my policy document?",
      "Can I get my ID card digitally?",
      "Where can I find my claim forms?"
    ],
    policy_details: [
      "What add-on benefits do I have?",
      "How does the reset benefit work?",
      "Tell me about Infinite Care"
    ]
  };

  return followUps[category] || [
    "What is my Base Sum Insured?",
    "How to file a cashless claim?",
    "Show me Pune network hospitals"
  ];
};

// Generate context-aware actions
export const getContextActions = (category: string, message: string): ContextAction[] => {
  const actions: ContextAction[] = [];
  const lowerMessage = message.toLowerCase();

  // Always show download buttons for document-related queries
  if (
    category === 'documents' ||
    lowerMessage.includes('download') ||
    lowerMessage.includes('policy document') ||
    lowerMessage.includes('policy copy') ||
    lowerMessage.includes('my policy') ||
    lowerMessage.includes('show policy') ||
    lowerMessage.includes('get policy') ||
    lowerMessage.includes('see policy') ||
    lowerMessage.includes('view policy') ||
    lowerMessage.includes('policy benefits') ||
    lowerMessage.includes('full policy') ||
    lowerMessage.includes('complete policy') ||
    lowerMessage.includes('policy details') ||
    lowerMessage.includes('policy schedule') ||
    lowerMessage.includes('e-card') ||
    lowerMessage.includes('ecard') ||
    lowerMessage.includes('id card')
  ) {
    actions.push({
      type: 'download',
      label: 'Download Policy Document',
      action: 'download_policy',
      icon: '📄'
    });
  }

  if (category === 'claims') {
    actions.push({
      type: 'navigate',
      label: 'Go to Claims Portal',
      action: '/claims',
      icon: '🏥'
    });

    actions.push({
      type: 'download',
      label: 'Download Claim Form',
      action: 'download_claim_form',
      icon: '📋'
    });
  }

  if (category === 'hospitals') {
    actions.push({
      type: 'navigate',
      label: 'Search Network Hospitals',
      action: '/hospitals',
      icon: '🔍'
    });
  }

  if (category === 'payment') {
    actions.push({
      type: 'external_link',
      label: 'Pay Premium Now',
      action: 'https://www.icicilombard.com/pay-premium',
      icon: '💰'
    });
  }

  return actions;
};

export const generateEnhancedChatResponse = async (
  userMessage: string,
  history: {role: string, content: string}[],
  sessionId: string
): Promise<EnhancedChatResult> => {
  const conversationContext = history.map(h => `${h.role}: ${h.content}`).join('\n');
  const category = categorizeQuery(userMessage);

  const systemInstruction = `
    You are "RIA", a high-precision Insurance AI Concierge for ICICI Lombard.

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

    6. ANTICIPATORY GUIDANCE:
       - For coverage queries, proactively mention claim procedures
       - For claim queries, mention required documents
       - For hospital queries, explain cashless process

    7. DOCUMENT DOWNLOADS - CRITICAL RULE:
       - NEVER say "I cannot download" or "I cannot initiate downloads"
       - NEVER provide manual instructions like "visit website" or "check email"
       - ALWAYS acknowledge that download buttons will be provided automatically
       - Example responses:
         ✅ "I can help you download your policy document. You'll see a download button below."
         ✅ "Your policy document is ready. Click the download button that appears below."
         ❌ "I cannot directly initiate downloads..." (NEVER say this)
         ❌ "Visit www.icicilombard.com to download..." (NEVER say this)

    8. TONE:
       - Professional, authoritative, and concise.
       - Multilingual (English, Hindi, Hinglish).
       - Use bold text (**text**) for key figures, names, and status.

    9. POLICY VERIFICATION:
       - Always verify information against the knowledge base
       - If unsure, say "Let me verify this with your policy details" rather than guessing
       - For complex queries, break down the answer into clear points
  `;

  const contents = `
    KNOWLEDGE BASE:
    ${MASTER_KNOWLEDGE_BASE}

    CONVERSATION HISTORY:
    ${conversationContext}

    USER QUESTION:
    ${userMessage}

    QUERY CATEGORY: ${category}
  `;

  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: {
      type: "OBJECT",
      properties: {
        answer: { type: "STRING" },
        suggestions: { type: "ARRAY", items: { type: "STRING" } },
        keyEntities: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Extract key entities like policy numbers, hospital names, treatment types mentioned"
        }
      },
      required: ["answer", "suggestions"]
    }
  };

  const baseRequest = {
    contents: [{ role: 'user', parts: [{ text: contents }] }],
    systemInstruction,
    generationConfig
  };

  // Try with Pro model first, fallback to Flash model if overloaded
  const response = await tryWithFallbackModel(
    async () => proxyGenerate({ ...baseRequest, model: 'gemini-3-pro-preview' }),
    async () => proxyGenerate({ ...baseRequest, model: 'gemini-3-flash-preview' })
  );

  try {
    const result = JSON.parse(extractText(response) || '{}');
    const followUpQuestions = getAnticipatedFollowUps(category, result.answer);
    const contextActions = getContextActions(category, userMessage);

    // Determine if feedback should be requested (for substantive queries)
    const requiresFeedback = category !== 'general' && result.answer.length > 50;

    return {
      answer: result.answer,
      suggestions: (result.suggestions || []).map((s: string) => s.replace(/^Your/i, "My")),
      followUpQuestions,
      contextActions: contextActions.length > 0 ? contextActions : undefined,
      requiresFeedback
    };
  } catch (e) {
    console.error('Enhanced chat error:', e);
    return {
      answer: "I apologize, I'm unable to provide that information at the moment. Please try rephrasing your question.",
      suggestions: ["What is my sum insured?", "How to file a cashless claim?", "Show Pune network hospitals"],
      followUpQuestions: getAnticipatedFollowUps('general', ''),
      requiresFeedback: false
    };
  }
};

// Feedback storage (in production, this would go to a database)
const feedbackStore: FeedbackData[] = [];

export const submitFeedback = async (feedback: FeedbackData): Promise<boolean> => {
  try {
    // Store feedback
    feedbackStore.push(feedback);

    // In production, send to analytics/database
    console.log('Feedback received:', feedback);

    // Analyze feedback for improvements
    if (feedback.rating <= 2) {
      console.warn('Low rating detected, flagging for review:', feedback);
    }

    return true;
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return false;
  }
};

export const getFeedbackStats = (): { avgRating: number; totalCount: number } => {
  if (feedbackStore.length === 0) {
    return { avgRating: 0, totalCount: 0 };
  }

  const totalRating = feedbackStore.reduce((sum, f) => sum + f.rating, 0);
  return {
    avgRating: totalRating / feedbackStore.length,
    totalCount: feedbackStore.length
  };
};

// Policy document generation - supports multiple sources
export const generatePolicyDocument = async (policyNumber: string): Promise<Blob> => {
  // Try to fetch from public folder first
  try {
    const response = await fetch('/public/Mayank_Policy_Document.pdf');
    if (response.ok) {
      return await response.blob();
    }
  } catch (error) {
    console.log('PDF not found in public folder, trying alternative sources...');
  }

  // Alternative: Fetch from a URL (if you have a hosted PDF)
  // try {
  //   const response = await fetch('https://your-domain.com/policy-documents/5301-6503-00-00005645.pdf');
  //   if (response.ok) {
  //     return await response.blob();
  //   }
  // } catch (error) {
  //   console.log('PDF not found at URL');
  // }

  // Fallback: Generate a mock PDF-like document
  const policyContent = `
ICICI LOMBARD GENERAL INSURANCE COMPANY LIMITED
ELEVATE HEALTH INSURANCE POLICY

Policy Number: ${policyNumber}
Policyholder: MAYANK PRADIP MUNDHRA
Base Sum Insured: ₹10,00,000
Policy Period: 01-APR-2024 to 31-MAR-2025

[This is a sample policy document. Please place your actual PDF at: /public/Mayank_Policy_Document.pdf]
`;

  return new Blob([policyContent], { type: 'application/pdf' });
};

// Download any document (PDF, image, text, etc.)
export const downloadDocument = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

// Download PDF from URL directly (alternative method)
export const downloadPDFFromURL = async (url: string, filename: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('PDF not found');

    const blob = await response.blob();
    downloadDocument(blob, filename);
    return true;
  } catch (error) {
    console.error('Error downloading PDF:', error);
    return false;
  }
};
