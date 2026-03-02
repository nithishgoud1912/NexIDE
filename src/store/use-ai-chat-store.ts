import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AIProvider = "gemini" | "groq" | "copilot";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number; // unix ms, serializable
  provider: AIProvider;
}

interface ProjectChat {
  messages: ChatMessage[];
  provider: AIProvider;
}

interface AIChatState {
  // Map of projectId -> chat data
  chats: Record<string, ProjectChat>;

  // Global default provider (used when a project has no chat yet)
  defaultProvider: AIProvider;

  // Actions
  getChat: (projectId: string) => ProjectChat;
  getMessages: (projectId: string) => ChatMessage[];
  getProvider: (projectId: string) => AIProvider;

  addMessage: (projectId: string, message: ChatMessage) => void;
  updateMessage: (
    projectId: string,
    messageId: string,
    content: string,
  ) => void;
  clearChat: (projectId: string) => void;
  setProvider: (projectId: string, provider: AIProvider) => void;
  setDefaultProvider: (provider: AIProvider) => void;
}

export const useAIChatStore = create<AIChatState>()(
  persist(
    (set, get) => ({
      chats: {},
      defaultProvider: "gemini",

      getChat: (projectId: string) => {
        const state = get();
        return (
          state.chats[projectId] || {
            messages: [],
            provider: state.defaultProvider,
          }
        );
      },

      getMessages: (projectId: string) => {
        const state = get();
        return state.chats[projectId]?.messages || [];
      },

      getProvider: (projectId: string) => {
        const state = get();
        return state.chats[projectId]?.provider || state.defaultProvider;
      },

      addMessage: (projectId: string, message: ChatMessage) =>
        set((state) => {
          const existing = state.chats[projectId] || {
            messages: [],
            provider: state.defaultProvider,
          };
          return {
            chats: {
              ...state.chats,
              [projectId]: {
                ...existing,
                messages: [...existing.messages, message],
              },
            },
          };
        }),

      updateMessage: (projectId: string, messageId: string, content: string) =>
        set((state) => {
          const existing = state.chats[projectId];
          if (!existing) return state;
          return {
            chats: {
              ...state.chats,
              [projectId]: {
                ...existing,
                messages: existing.messages.map((m) =>
                  m.id === messageId ? { ...m, content } : m,
                ),
              },
            },
          };
        }),

      clearChat: (projectId: string) =>
        set((state) => {
          const existing = state.chats[projectId];
          return {
            chats: {
              ...state.chats,
              [projectId]: {
                provider: existing?.provider || state.defaultProvider,
                messages: [],
              },
            },
          };
        }),

      setProvider: (projectId: string, provider: AIProvider) =>
        set((state) => {
          const existing = state.chats[projectId] || {
            messages: [],
            provider: state.defaultProvider,
          };
          return {
            chats: {
              ...state.chats,
              [projectId]: {
                ...existing,
                provider,
              },
            },
          };
        }),

      setDefaultProvider: (provider: AIProvider) =>
        set({ defaultProvider: provider }),
    }),
    {
      name: "nexide-ai-chat",
      storage: createJSONStorage(() => localStorage),
      // Only keep last 50 messages per project to avoid bloating localStorage
      partialize: (state) => ({
        chats: Object.fromEntries(
          Object.entries(state.chats).map(([projectId, chat]) => [
            projectId,
            {
              ...chat,
              messages: chat.messages.slice(-50),
            },
          ]),
        ),
        defaultProvider: state.defaultProvider,
      }),
    },
  ),
);
