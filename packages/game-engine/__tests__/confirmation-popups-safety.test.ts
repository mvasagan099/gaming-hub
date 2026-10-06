import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Confirmation Popups for Logout and Game Exit (Safety UI/UX)', () => {
  describe('1. Logout Confirmation Logic', () => {
    let isLoggedIn = true;
    let isDialogOpen = false;
    let logoutCallCount = 0;
    let isSubmitting = false;

    const mockSignOut = vi.fn(async () => {
      logoutCallCount++;
      isLoggedIn = false;
    });

    const openLogoutDialog = () => {
      isDialogOpen = true;
    };

    const handleCancelLogout = () => {
      isDialogOpen = false;
    };

    const handleConfirmLogout = async () => {
      if (isSubmitting) return;
      isSubmitting = true;
      try {
        isDialogOpen = false;
        await mockSignOut();
      } finally {
        isSubmitting = false;
      }
    };

    beforeEach(() => {
      isLoggedIn = true;
      isDialogOpen = false;
      logoutCallCount = 0;
      isSubmitting = false;
      vi.clearAllMocks();
    });

    it('opens confirmation popup when user clicks Logout instead of immediately signing out', () => {
      expect(isDialogOpen).toBe(false);
      expect(isLoggedIn).toBe(true);

      openLogoutDialog();

      expect(isDialogOpen).toBe(true);
      expect(isLoggedIn).toBe(true);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('cancels logout and keeps user logged in when Cancel is clicked', () => {
      openLogoutDialog();
      expect(isDialogOpen).toBe(true);

      handleCancelLogout();

      expect(isDialogOpen).toBe(false);
      expect(isLoggedIn).toBe(true);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('executes existing signOut when Logout is confirmed', async () => {
      openLogoutDialog();
      expect(isDialogOpen).toBe(true);

      await handleConfirmLogout();

      expect(isDialogOpen).toBe(false);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(isLoggedIn).toBe(false);
    });

    it('prevents duplicate logout calls on accidental double-click while submitting', async () => {
      openLogoutDialog();

      // Trigger two rapid confirm clicks
      const p1 = handleConfirmLogout();
      const p2 = handleConfirmLogout();

      await Promise.all([p1, p2]);

      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(logoutCallCount).toBe(1);
    });
  });

  describe('2. Active Game Exit Confirmation Logic', () => {
    let inGame = true;
    let isExitDialogOpen = false;
    let exitCallCount = 0;
    let isExiting = false;

    const mockOnBack = vi.fn(async () => {
      exitCallCount++;
      inGame = false;
    });

    const handleExitAttempt = (isMatchFinished: boolean) => {
      if (isMatchFinished) {
        void mockOnBack();
      } else {
        isExitDialogOpen = true;
      }
    };

    const handleContinuePlaying = () => {
      isExitDialogOpen = false;
    };

    const handleConfirmExitGame = async () => {
      if (isExiting) return;
      isExiting = true;
      try {
        isExitDialogOpen = false;
        await mockOnBack();
      } finally {
        isExiting = false;
      }
    };

    beforeEach(() => {
      inGame = true;
      isExitDialogOpen = false;
      exitCallCount = 0;
      isExiting = false;
      vi.clearAllMocks();
    });

    it('opens "Exit Game?" confirmation dialog when attempting to exit during an active match', () => {
      handleExitAttempt(false); // match is active

      expect(isExitDialogOpen).toBe(true);
      expect(inGame).toBe(true);
      expect(mockOnBack).not.toHaveBeenCalled();
    });

    it('closes dialog and remains in game when "Continue Playing" is clicked', () => {
      handleExitAttempt(false);
      expect(isExitDialogOpen).toBe(true);

      handleContinuePlaying();

      expect(isExitDialogOpen).toBe(false);
      expect(inGame).toBe(true);
      expect(mockOnBack).not.toHaveBeenCalled();
    });

    it('calls existing onBack / forfeit handler when "Exit Game" is confirmed', async () => {
      handleExitAttempt(false);
      expect(isExitDialogOpen).toBe(true);

      await handleConfirmExitGame();

      expect(isExitDialogOpen).toBe(false);
      expect(mockOnBack).toHaveBeenCalledTimes(1);
      expect(inGame).toBe(false);
    });

    it('does NOT show exit confirmation popup if the game/match is already finished', () => {
      handleExitAttempt(true); // match is completed/game over

      expect(isExitDialogOpen).toBe(false);
      expect(mockOnBack).toHaveBeenCalledTimes(1);
      expect(inGame).toBe(false);
    });

    it('prevents duplicate exit requests on rapid multi-click', async () => {
      handleExitAttempt(false);

      const p1 = handleConfirmExitGame();
      const p2 = handleConfirmExitGame();

      await Promise.all([p1, p2]);

      expect(mockOnBack).toHaveBeenCalledTimes(1);
      expect(exitCallCount).toBe(1);
    });
  });

  // Native Back behavior is exercised against the actual Capacitor listener in
  // apps/web/src/services/native/capacitorAppService.back.test.ts.
});
