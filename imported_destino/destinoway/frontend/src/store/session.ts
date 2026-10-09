import { create } from 'zustand';
import type { ChatMessage, ProgressStep, TripState, User } from '@/types';

interface S {
  user: User | null; setUser: (u: User | null) => void;
  tripId?: string; setTripId: (id?: string) => void;
  trip?: TripState; setTrip: (t?: TripState) => void;
  messages: ChatMessage[]; setMessages: (m: ChatMessage[]) => void;
  pushMessage: (m: ChatMessage) => void; appendToken: (id: string, t: string) => void; finishMessage: (id: string, full: string) => void;
  progress: ProgressStep[]; setProgress: (p: ProgressStep[]) => void; busy: boolean; setBusy: (b: boolean) => void;
}
export const useSession = create<S>((set) => ({
  user: null, setUser: (user) => set({ user }),
  setTripId: (tripId) => set({ tripId }), setTrip: (trip) => set({ trip }),
  messages: [], setMessages: (messages) => set({ messages }),
  pushMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  appendToken: (id, t) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, content: m.content + t } : m)) })),
  finishMessage: (id, full) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, content: full, streaming: false } : m)) })),
  progress: [], setProgress: (progress) => set({ progress }), busy: false, setBusy: (busy) => set({ busy }),
}));
