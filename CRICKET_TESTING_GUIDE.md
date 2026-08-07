# Cricket Multiplayer Testing Guide

## Quick Start

### 1. Start the Servers
```bash
# Terminal 1: Socket Server
cd apps/socket-server
npm run dev

# Terminal 2: Web App
cd apps/web
npm run dev
```

### 2. Open Two Browser Windows
- Window 1: http://localhost:3000/cricket
- Window 2: http://localhost:3000/cricket

### 3. Create Match Flow

**Window 1 (Host):**
1. Click "Play Multiplayer"
2. Set stake (e.g., 100 coins)
3. Click "Create Room"
4. Copy room code
5. Click "Ready"
6. **Wait for opponent**

**Window 2 (Oppponent):**
1. Click "Play Multiplayer"
2. Set same stake (100 coins)
3. Click "Join Room"
4. Paste room code from Window 1
5. Click "Join"
6. Click "Ready"
7. **Match starts automatically**

---

## Testing Points

### Toss Phase Testing

**Expected Behavior:**
- Window 1 (seat 0) sees toss UI with "Heads" and "Tails" buttons
- Window 2 (seat 1) sees "Waiting for opponent to call the toss..."

**Test Steps:**
1. Check Window 1 console: `[CricketMultiplayerDriver] Toss phase detected`
2. Check Window 1 console: `[CricketMultiplayerDriver] My turn to call toss!`
3. Click "Heads" or "Tails" in Window 1
4. Check console: `[CricketMultiplayerDriver] sendTossCall: heads`
5. Check console: `[CricketMultiplayerDriver] toss-call result: { ok: true }`

**Result:**
- Both windows show toss winner message
- Message: "You won the toss! You chose to bat/bowl first" OR
- Message: "Opponent won the toss and chose to bat/bowl first"
- Toss UI dismisses after 3 seconds
- Gameplay controls enable

### Gameplay Testing

**Bowling Phase (if bowling first):**
1. Controls for bowling should be enabled (Fast/Slow/Spin buttons)
2. Check console: `[CricketScene] updateTurnStatus - Your turn to bowl!`
3. Click a bowling type
4. Check console: `[CricketMultiplayerDriver] sendBowlAction: fast power: 0.65`

**Batting Phase (if batting first):**
1. Controls for batting should be enabled (Defend/Slog buttons)
2. Check console: `[CricketScene] updateTurnStatus - Ready for the ball!`
3. Wait for opponent to bowl
4. Click a shot direction
5. Check console: `[CricketMultiplayerDriver] sendBatAction: straight timing: good`

**Ball Result:**
1. Both windows sync result instantly
2. Runs/wicket displays
3. Scoreboard updates
4. Next ball cycle repeats

---

## Debug Console Messages

### Toss Phase
```
[CricketMultiplayerDriver] Starting driver, mySeat: 0
[CricketMultiplayerDriver] State changed, applying new state
[CricketMultiplayerDriver] Applying state: { currentActor: 'toss', ... }
[CricketMultiplayerDriver] handleTossPhase, mySeat: 0 currentSeat: 0
[CricketMultiplayerDriver] My turn to call toss! Requesting toss call from UI
[CricketScene] Toss phase detected
[CricketScene] Toss phase - not applying game state yet
```

### After Toss Call
```
[CricketMultiplayerDriver] sendTossCall: heads mySeat: 0
[CricketMultiplayerDriver] applyState called, state exists: true
[CricketMultiplayerDriver] Applying state: { currentActor: 'bowler', tossWinner: 0, battingFirst: 0 }
[CricketMultiplayerDriver] Toss completed, tossWinner: 0
[CricketScene] Toss completed: Player 1 won, batting first: Player 1
[CricketScene] updateTurnStatus - bowler turn
```

### Gameplay
```
[CricketScene] updateTurnStatus - currentActor: bowler mySeat: 0 bowlingTeam: 1
[CricketMultiplayerDriver] canBowl: true (my turn)
[CricketMultiplayerDriver] sendBowlAction: fast power: 0.65
[CricketScene] Waiting for result...
[CricketScene] applyRemoteState called, currentActor: batsman
[CricketMultiplayerDriver] canBat: true
[CricketMultiplayerDriver] sendBatAction: straight timing: good
```

### Match Complete
```
[CricketMultiplayerDriver] Match finished
[CricketScene] handleMatchComplete - winner: 0 mySeat: 0
[CricketScene] YOU WIN THE MATCH!
```

---

## Common Issues & Fixes

### Issue: Toss UI not showing
**Check:**
- Browser console for errors
- `useMultiplayerStore` has `gameState` loaded
- `currentActor === 'toss'`
- `mySeat === currentSeat`

**Fix:**
- Ensure both players joined and ready
- Check socket connection
- Verify match launched (room status = "playing")

### Issue: Controls disabled when should be enabled
**Check:**
- `state.currentActor` matches your role
- `state.currentSeat === mySeat`
- Driver's `canBowl()` / `canBat()` returns true

**Fix:**
- Check turn status console message
- Verify role assignment after toss
- Ensure not in spectator mode

### Issue: Opponent doesn't see toss result
**Check:**
- Both clients connected to same room
- Socket events broadcasting
- Server logs show game:state broadcast

**Fix:**
- Check socket server logs
- Verify both players subscribed to room
- Check network tab for WebSocket messages

---

## Performance Verification

### Network
- [ ] State updates arrive < 50ms
- [ ] No duplicate state broadcasts
- [ ] No action rejections (unless invalid)

### Memory
- [ ] Driver properly cleans up on shutdown
- [ ] No event listener leaks
- [ ] No state subscription leaks

### UI
- [ ] Toss UI animates smoothly
- [ ] No flickering controls
- [ ] Scoreboard updates instantly
- [ ] Result overlays display correctly

---

## Test Scenarios

### Scenario 1: Normal Flow
1. Create room → Join → Ready → Toss → Play → Complete
2. Verify all phases work smoothly
3. Check console logs at each phase

### Scenario 2: Toss Winner Bats First
1. Complete toss
2. Verify toss winner can choose to bat or bowl
3. Check correct role assignment
4. Verify controls match roles

### Scenario 3: Innings Swap
1. Play first innings until over/wicket
2. Verify roles swap correctly
3. Check target score updates
4. Continue second innings

### Scenario 4: Match End
1. Play until match ends
2. Verify winner announcement
3. Check rematch/exit buttons
4. Verify stats saved

### Scenario 5: Network Interruption
1. Disconnect one player during toss
2. Reconnect
3. Verify state syncs
4. Continue match

---

## Success Criteria

✅ Toss UI shows for correct player
✅ Toss call sends to server
✅ Both clients receive toss result
✅ Correct batting/bowling assignment
✅ Controls enable based on role
✅ Gameplay syncs perfectly
✅ Match completes with winner
✅ No page refreshes needed
✅ No duplicate matches

---

**Testing Date**: 2026-08-07  
**Status**: Ready for QA
