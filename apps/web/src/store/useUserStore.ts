import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserState {
  username: string;
  avatar: string;
  coins: number;
  gems: number;
  level: number;
  setAuthUser: (name: string) => void;
  addCoins: (amount: number) => void;
  deductCoins: (amount: number) => boolean;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      username: 'ProGamerX',
      avatar: '⚡',
      coins: 2500,
      gems: 45,
      level: 12,
      setAuthUser: (name: string) => set(() => ({ username: name })),
      addCoins: (amount: number) => set((state: UserState) => ({ coins: state.coins + amount })),
      deductCoins: (amount: number) => {
        if (get().coins >= amount) {
          set((state: UserState) => ({ coins: state.coins - amount }));
          return true;
        }
        return false;
      },
    }),
    {
      name: 'user-storage',
    }
  )
);
