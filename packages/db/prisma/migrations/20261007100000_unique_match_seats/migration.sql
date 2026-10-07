-- Existing duplicate seats must be reconciled before production rollout.
CREATE UNIQUE INDEX "MatchPlayer_matchId_seat_key" ON "MatchPlayer"("matchId", "seat");
