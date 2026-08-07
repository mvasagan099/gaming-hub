import { prisma } from "@gaming-hub/db";

async function seedSupportContent() {
  console.log("Seeding support content...");

  // Create default categories
  const categories = await Promise.all([
    prisma.supportCategory.upsert({
      where: { slug: "getting-started" },
      update: {},
      create: {
        name: "Getting Started",
        slug: "getting-started",
        description: "Learn the basics of using the platform",
        icon: "Rocket",
        sortOrder: 1,
      },
    }),
    prisma.supportCategory.upsert({
      where: { slug: "wallet" },
      update: {},
      create: {
        name: "Wallet & Payments",
        slug: "wallet",
        description: "Manage your coins, deposits, and withdrawals",
        icon: "Wallet",
        sortOrder: 2,
      },
    }),
    prisma.supportCategory.upsert({
      where: { slug: "games" },
      update: {},
      create: {
        name: "Games",
        slug: "games",
        description: "Game-specific help and guides",
        icon: "Gamepad2",
        sortOrder: 3,
      },
    }),
    prisma.supportCategory.upsert({
      where: { slug: "account" },
      update: {},
      create: {
        name: "Account & Profile",
        slug: "account",
        description: "Manage your account settings and profile",
        icon: "User",
        sortOrder: 4,
      },
    }),
    prisma.supportCategory.upsert({
      where: { slug: "troubleshooting" },
      update: {},
      create: {
        name: "Troubleshooting",
        slug: "troubleshooting",
        description: "Common issues and how to fix them",
        icon: "Wrench",
        sortOrder: 5,
      },
    }),
    prisma.supportCategory.upsert({
      where: { slug: "admin" },
      update: {},
      create: {
        name: "Administration",
        slug: "admin",
        description: "Admin panel help and documentation",
        icon: "Shield",
        sortOrder: 6,
        isActive: true,
      },
    }),
  ]);

  const categoryMap = new Map(categories.map((c) => [c.slug, c.id]));

  // Create default articles
  const gettingStartedCategoryId = categoryMap.get("getting-started")!;
  const walletCategoryId = categoryMap.get("wallet")!;
  const gamesCategoryId = categoryMap.get("games")!;
  const accountCategoryId = categoryMap.get("account")!;
  const troubleshootingCategoryId = categoryMap.get("troubleshooting")!;
  const adminCategoryId = categoryMap.get("admin")!;

  // Wallet FAQs
  await createArticleIfNotExists({
    categoryId: walletCategoryId,
    title: "How do I deposit coins?",
    content: `
      <p>To deposit coins into your wallet:</p>
      <ol>
        <li>Navigate to the <strong>Wallet</strong> page from the sidebar</li>
        <li>Click on the <strong>Deposit</strong> tab</li>
        <li>Enter your coupon code or choose a payment method</li>
        <li>Confirm the transaction</li>
        <li>Your coins will be added instantly!</li>
      </ol>
      <p><strong>Note:</strong> Make sure to use valid coupon codes from official sources.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["wallet", "deposit", "coins", "coupon"],
    keywords: ["deposit", "add coins", "wallet", "payment"],
    pageRoutes: ["/wallet", "/wallet/deposit"],
  });

  await createArticleIfNotExists({
    categoryId: walletCategoryId,
    title: "How do I withdraw funds?",
    content: `
      <p>To withdraw your winnings:</p>
      <ol>
        <li>Go to the <strong>Wallet</strong> page</li>
        <li>Click on the <strong>Withdraw</strong> tab</li>
        <li>Verify your account (KYC) if not already done</li>
        <li>Enter the amount you want to withdraw</li>
        <li>Complete OTP verification</li>
        <li>Submit your request</li>
      </ol>
      <p><strong>Important:</strong> Withdrawals may require admin approval and KYC verification.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["wallet", "withdraw", "funds", "payment"],
    keywords: ["withdraw", "cash out", "wallet", "funds"],
    pageRoutes: ["/wallet", "/wallet/withdraw"],
  });

  await createArticleIfNotExists({
    categoryId: walletCategoryId,
    title: "Why is my withdrawal pending?",
    content: `
      <p>Your withdrawal may be pending for several reasons:</p>
      <ul>
        <li><strong>Admin Approval:</strong> Withdrawals require manual approval from our admin team</li>
        <li><strong>KYC Verification:</strong> You may need to complete identity verification</li>
        <li><strong>Security Checks:</strong> Additional security verification may be required</li>
        <li><strong>Weekend/Holiday:</strong> Processing may be delayed during non-business days</li>
      </ul>
      <p>Contact support if your withdrawal has been pending for more than 24 hours.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["wallet", "withdraw", "pending", "help"],
    keywords: ["pending", "withdrawal", "delay", "status"],
    pageRoutes: ["/wallet", "/wallet/withdraw", "/tickets"],
  });

  await createArticleIfNotExists({
    categoryId: walletCategoryId,
    title: "Why didn't my coupon work?",
    content: `
      <p>Your coupon may not work for the following reasons:</p>
      <ul>
        <li><strong>Expired:</strong> The coupon has passed its expiration date</li>
        <li><strong>Already Redeemed:</strong> Coupons can only be used once per account</li>
        <li><strong>Inactive:</strong> The coupon campaign may not be active yet</li>
        <li><strong>Restrictions:</strong> Some coupons are limited to specific games or user types</li>
        <li><strong>Case Sensitive:</strong> Make sure you enter the code exactly as shown</li>
      </ul>
      <p>If you believe your coupon should work, please contact support.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["wallet", "coupon", "error", "help"],
    keywords: ["coupon", "code", "redeem", "error"],
    pageRoutes: ["/wallet", "/coupons"],
  });

  // Chess Support
  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I invite a friend to play chess?",
    content: `
      <p>To invite a friend to play chess:</p>
      <ol>
        <li>Go to the Chess game page</li>
        <li>Create a private room</li>
        <li>Share the room code with your friend</li>
        <li>Your friend can join using the room code</li>
      </ol>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["chess", "invite", "friend", "multiplayer"],
    keywords: ["invite", "friend", "chess", "room"],
    pageRoutes: ["/games/chess"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "Why isn't my move visible?",
    content: `
      <p>If your move isn't visible:</p>
      <ul>
        <li>Check your internet connection</li>
        <li>Wait for the move to synchronize (usually instant)</li>
        <li>Do not refresh the page - this may cause disconnections</li>
        <li>If the issue persists, try reconnecting to the room</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["chess", "move", "sync", "bug"],
    keywords: ["move", "visible", "sync", "chess"],
    pageRoutes: ["/games/chess", "/lobby"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I offer a draw in chess?",
    content: `
      <p>To offer a draw:</p>
      <ol>
        <li>Look for the <strong>Draw</strong> button during your match</li>
        <li>Click the button to offer a draw</li>
        <li>Your opponent will receive the offer</li>
        <li>If they accept, the match ends in a draw</li>
      </ol>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["chess", "draw", "rules"],
    keywords: ["draw", "offer", "chess"],
    pageRoutes: ["/games/chess"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I resign from a chess match?",
    content: `
      <p>If you need to resign:</p>
      <ol>
        <li>Click the <strong>Resign</strong> button</li>
        <li>Confirm your decision in the dialog</li>
        <li>The match will end with your opponent as the winner</li>
      </ol>
      <p><strong>Note:</strong> Frequent resigns may affect your reputation score.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["chess", "resign", "rules"],
    keywords: ["resign", "quit", "chess"],
    pageRoutes: ["/games/chess"],
  });

  // Ludo Support
  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "Why can't I move a token in Ludo?",
    content: `
      <p>You need to roll the required number before you can move your tokens. The game follows these rules:</p>
      <ul>
        <li>You need a <strong>6</strong> to move a token out of the starting area</li>
        <li>Each token must move according to the dice roll</li>
        <li>Only eligible tokens can be moved based on the roll</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["ludo", "move", "rules", "token"],
    keywords: ["move", "token", "ludo", "dice"],
    pageRoutes: ["/games/ludo"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "What happens after rolling three sixes?",
    content: `
      <p>After rolling three consecutive sixes:</p>
      <ul>
        <li>The game follows the configured three-sixes rule</li>
        <li>Your turn may be skipped or you may need to roll again</li>
        <li>The specific behavior depends on the room settings</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["ludo", "dice", "six", "rules"],
    keywords: ["three sixes", "dice", "ludo", "rules"],
    pageRoutes: ["/games/ludo"],
  });

  // Cricket Support
  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How does multiplayer cricket work?",
    content: `
      <p>In multiplayer cricket:</p>
      <ul>
        <li>One player bats while the opponent bowls</li>
        <li>Both players share the same live match view</li>
        <li>The match progresses in real-time as players take turns</li>
        <li>After the first innings, batting and bowling roles swap automatically</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["cricket", "multiplayer", "rules"],
    keywords: ["cricket", "multiplayer", "bat", "bowl"],
    pageRoutes: ["/games/cricket"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "Why hasn't the cricket match started?",
    content: `
      <p>A match won't start until:</p>
      <ul>
        <li>Both players have joined the same room</li>
        <li>Both players are marked as <strong>Ready</strong></li>
        <li>The server has verified both players are connected</li>
      </ul>
      <p>Make sure both players click the Ready button before the countdown.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["cricket", "start", "match", "ready"],
    keywords: ["start", "match", "cricket", "ready"],
    pageRoutes: ["/games/cricket", "/lobby"],
  });

  // Admin Support
  await createArticleIfNotExists({
    categoryId: adminCategoryId,
    title: "How do I approve withdrawals?",
    content: `
      <p>To approve pending withdrawals:</p>
      <ol>
        <li>Navigate to <strong>Wallet → Withdrawal Requests</strong></li>
        <li>Review the pending requests</li>
        <li>Verify user KYC status</li>
        <li>Approve or reject each request</li>
        <li>Approved withdrawals will be processed automatically</li>
      </ol>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["admin", "withdrawal", "approve", "wallet"],
    keywords: ["withdrawal", "approve", "admin"],
    pageRoutes: ["/admin"],
  });

  await createArticleIfNotExists({
    categoryId: adminCategoryId,
    title: "How do I create coupons?",
    content: `
      <p>To create new coupons:</p>
      <ol>
        <li>Go to <strong>Coupons</strong> in the admin panel</li>
        <li>Click <strong>Create Coupon</strong></li>
        <li>Fill in the coupon code, discount value, and limits</li>
        <li>Set validity dates</li>
        <li>Choose which games the coupon applies to (optional)</li>
        <li>Save the coupon</li>
      </ol>
      <p>You can also generate bulk coupons for marketing campaigns.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["admin", "coupon", "create", "marketing"],
    keywords: ["coupon", "create", "discount", "admin"],
    pageRoutes: ["/admin", "/admin/coupons"],
  });

  // Quick Actions
  await createArticleIfNotExists({
    categoryId: walletCategoryId,
    title: "Quick Deposit",
    content: "Click below to quickly navigate to the deposit page",
    contentType: "QUICK_ACTION",
    status: "PUBLISHED",
    quickAction: {
      label: "Go to Deposit",
      action: "navigate",
      link: "/wallet",
    },
    tags: ["wallet", "deposit", "quick"],
    keywords: ["deposit", "quick"],
    pageRoutes: ["/wallet", "/", "/dashboard"],
  });

  await createArticleIfNotExists({
    categoryId: walletCategoryId,
    title: "Quick Withdraw",
    content: "Click below to quickly navigate to the withdraw page",
    contentType: "QUICK_ACTION",
    status: "PUBLISHED",
    quickAction: {
      label: "Go to Withdraw",
      action: "navigate",
      link: "/wallet",
    },
    tags: ["wallet", "withdraw", "quick"],
    keywords: ["withdraw", "quick"],
    pageRoutes: ["/wallet", "/dashboard"],
  });

  await createArticleIfNotExists({
    categoryId: walletCategoryId,
    title: "Redeem Coupon",
    content: "Click below to redeem a coupon code",
    contentType: "QUICK_ACTION",
    status: "PUBLISHED",
    quickAction: {
      label: "Redeem Coupon",
      action: "navigate",
      link: "/coupons",
    },
    tags: ["wallet", "coupon", "redeem"],
    keywords: ["coupon", "redeem"],
    pageRoutes: ["/wallet", "/coupons", "/dashboard"],
  });

  // Account Support
  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "How do I change my password?",
    content: `
      <p>To change your password:</p>
      <ol>
        <li>Go to <strong>Settings</strong> from the sidebar</li>
        <li>Select the <strong>Security</strong> tab</li>
        <li>Click <strong>Change Password</strong></li>
        <li>Enter your current password</li>
        <li>Enter and confirm your new password</li>
        <li>Save the changes</li>
      </ol>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["account", "password", "security"],
    keywords: ["password", "change", "settings"],
    pageRoutes: ["/settings", "/profile"],
  });

  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "How do I update my profile?",
    content: `
      <p>To update your profile:</p>
      <ol>
        <li>Navigate to your <strong>Profile</strong> page</li>
        <li>Click the <strong>Edit</strong> button</li>
        <li>Update your display name, bio, or avatar</li>
        <li>Save your changes</li>
      </ol>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["account", "profile", "settings"],
    keywords: ["profile", "update", "edit"],
    pageRoutes: ["/profile"],
  });

  // Home / Getting Started
  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "How do I start playing a game?",
    content: `
      <p>To start playing a game:</p>
      <ol>
        <li>Go to the <strong>Games</strong> section from the home page or sidebar</li>
        <li>Choose any game (Chess, Ludo, Cricket, etc.)</li>
        <li>Click <strong>Play Now</strong> to start a quick match or <strong>Create Room</strong> to play with friends</li>
        <li>Wait for the match to load and follow the on-screen instructions</li>
      </ol>
      <p>Most games are free to play. Some may require an entry fee or coins to join.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["home", "getting-started", "play", "games"],
    keywords: ["start", "play", "game", "how to play"],
    pageRoutes: ["/", "/dashboard", "/games"],
  });

  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "Where can I see my coin balance?",
    content: `
      <p>Your coin balance is always visible in the top navigation bar.</p>
      <ul>
        <li>Click on the balance badge to go straight to the <strong>Wallet</strong> page</li>
        <li>Your balance updates instantly after deposits, withdrawals, and match results</li>
        <li>Transaction history is available on the <strong>Wallet</strong> page under the <strong>Transactions</strong> tab</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["home", "balance", "coins", "wallet"],
    keywords: ["balance", "coins", "wallet", "where"],
    pageRoutes: ["/", "/dashboard", "/wallet"],
  });

  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "Is the platform free to use?",
    content: `
      <p>Yes, the platform is free to join and explore.</p>
      <ul>
        <li>Creating an account is completely free</li>
        <li>Most games can be played for free in casual mode</li>
        <li>Some games and tournaments may require coins or an entry fee to join</li>
        <li>You can earn coins through coupons, referrals, achievements, and winning matches</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["home", "free", "pricing", "getting-started"],
    keywords: ["free", "cost", "price", "pay"],
    pageRoutes: ["/", "/dashboard"],
  });

  // Tournaments
  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "How do I join a tournament?",
    content: `
      <p>To join a tournament:</p>
      <ol>
        <li>Navigate to the <strong>Tournaments</strong> page</li>
        <li>Find a tournament that is currently <strong>UPCOMING</strong></li>
        <li>Check the entry fee, prize pool, and schedule</li>
        <li>Click <strong>Join Tournament</strong> and confirm the entry</li>
        <li>You will be notified when the tournament starts</li>
      </ol>
      <p><strong>Note:</strong> Your entry fee is deducted from your wallet when you join. Make sure your balance covers the entry fee.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["tournaments", "join", "entry", "prize"],
    keywords: ["tournament", "join", "enter", "register"],
    pageRoutes: ["/tournaments"],
  });

  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "How are tournament formats and brackets decided?",
    content: `
      <p>Tournaments can use different formats:</p>
      <ul>
        <li><strong>Bracket:</strong> Single or double elimination - lose once and you are out</li>
        <li><strong>Round Robin:</strong> Every player plays everyone else once</li>
        <li><strong>Knockout:</strong> Lose a match and you are eliminated immediately</li>
        <li><strong>Swiss:</strong> Players are paired with opponents of similar standing each round</li>
      </ul>
      <p>The format is shown on each tournament's details page before you join.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["tournaments", "format", "bracket", "rules"],
    keywords: ["bracket", "format", "knockout", "round robin"],
    pageRoutes: ["/tournaments"],
  });

  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "When do I receive tournament prizes?",
    content: `
      <p>Tournament prizes are distributed after the tournament ends:</p>
      <ul>
        <li>Prizes are credited directly to your wallet</li>
        <li>Crediting usually happens within minutes of the tournament ending</li>
        <li>If you are in the top rankings, check the prize distribution rules for your position</li>
        <li>Some prizes may require KYC verification before withdrawal</li>
      </ul>
      <p>Contact support if your prize has not been credited within 24 hours.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["tournaments", "prize", "winnings", "reward"],
    keywords: ["prize", "win", "reward", "tournament"],
    pageRoutes: ["/tournaments", "/wallet", "/tickets"],
  });

  // Friends
  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "How do I add a friend?",
    content: `
      <p>To add a friend:</p>
      <ol>
        <li>Navigate to the <strong>Friends</strong> page</li>
        <li>Use the search bar to find a player by username</li>
        <li>Click <strong>Add Friend</strong> on their profile card</li>
        <li>They will receive a friend request notification</li>
        <li>Once they accept, they appear in your friends list</li>
      </ol>
      <p>You can also send a friend request from a player's public profile.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["friends", "add", "invite", "social"],
    keywords: ["friend", "add", "request", "invite"],
    pageRoutes: ["/friends"],
  });

  await createArticleIfNotExists({
    categoryId: troubleshootingCategoryId,
    title: "Why can't I send a friend request?",
    content: `
      <p>You may not be able to send a friend request if:</p>
      <ul>
        <li>You are already friends with that player</li>
        <li>A request is already pending between you</li>
        <li>The player has blocked you</li>
        <li>You have reached the maximum number of pending requests</li>
        <li>The player's settings restrict friend requests</li>
      </ul>
      <p>Try refreshing the page. If the issue persists, contact support.</p>
    `,
    contentType: "TROUBLESHOOTING",
    status: "PUBLISHED",
    tags: ["friends", "request", "error", "blocked"],
    keywords: ["friend request", "failed", "error", "blocked"],
    pageRoutes: ["/friends", "/tickets"],
  });

  // Referrals
  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "How does the referral program work?",
    content: `
      <p>Invite your friends and earn rewards:</p>
      <ol>
        <li>Go to the <strong>Referrals</strong> page</li>
        <li>Copy your unique referral link or code</li>
        <li>Share it with friends - they sign up using your link</li>
        <li>You earn a bonus when they create an account and complete the required actions</li>
        <li>Track your referrals and earnings on the same page</li>
      </ol>
      <p>Referral rewards are credited to your wallet automatically.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["referrals", "invite", "bonus", "share"],
    keywords: ["referral", "invite", "bonus", "link"],
    pageRoutes: ["/referrals"],
  });

  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "When do I receive referral bonuses?",
    content: `
      <p>Referral bonuses are typically credited when your invitee:</p>
      <ul>
        <li>Completes email verification</li>
        <li>Makes their first deposit (if required)</li>
        <li>Plays their first match</li>
      </ul>
      <p>Each referral reward has its own conditions, which are shown on the <strong>Referrals</strong> page. Bonuses may take a few minutes to appear in your wallet.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["referrals", "bonus", "reward", "payout"],
    keywords: ["referral bonus", "reward", "when", "payout"],
    pageRoutes: ["/referrals", "/wallet"],
  });

  // Achievements
  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "How do I earn achievements?",
    content: `
      <p>Achievements are earned automatically as you play:</p>
      <ul>
        <li>Win matches to earn competitive achievements</li>
        <li>Play different games to unlock game-specific badges</li>
        <li>Complete streaks (e.g., win 5 in a row)</li>
        <li>Reach milestones like total matches or tournaments played</li>
      </ul>
      <p>You can view your progress and all available achievements on the <strong>Achievements</strong> page.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["achievements", "badges", "rewards", "progress"],
    keywords: ["achievement", "badge", "unlock", "earn"],
    pageRoutes: ["/achievements"],
  });

  await createArticleIfNotExists({
    categoryId: troubleshootingCategoryId,
    title: "Why isn't my achievement progress updating?",
    content: `
      <p>Achievement progress may lag for the following reasons:</p>
      <ul>
        <li>Progress updates after the match is fully recorded by the server</li>
        <li>Disconnecting mid-match may void that match's progress</li>
        <li>Some achievements only count sanctioned/ranked matches</li>
        <li>Refresh the page to see the latest progress</li>
      </ul>
      <p>If progress is still not updating after a complete match, contact support.</p>
    `,
    contentType: "TROUBLESHOOTING",
    status: "PUBLISHED",
    tags: ["achievements", "progress", "bug", "not updating"],
    keywords: ["achievement", "not updating", "progress", "stuck"],
    pageRoutes: ["/achievements", "/tickets"],
  });

  // Notifications
  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "How do I manage my notifications?",
    content: `
      <p>To manage notifications:</p>
      <ol>
        <li>Open the <strong>Notifications</strong> page from the bell icon</li>
        <li>Mark individual notifications as read by clicking them</li>
        <li>Use <strong>Mark all as read</strong> to clear the unread badge</li>
        <li>Adjust which events notify you from <strong>Settings → Notifications</strong></li>
      </ol>
      <p>You can choose to receive notifications for messages, friend requests, match results, and promotions.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["notifications", "settings", "preferences", "bell"],
    keywords: ["notification", "settings", "preferences", "bell"],
    pageRoutes: ["/notifications", "/settings"],
  });

  await createArticleIfNotExists({
    categoryId: troubleshootingCategoryId,
    title: "Why am I not receiving notifications?",
    content: `
      <p>If you are not receiving notifications:</p>
      <ul>
        <li>Check that notifications are enabled in <strong>Settings → Notifications</strong></li>
        <li>Make sure you have not muted the specific notification type</li>
        <li>Verify your device/browser allows notifications</li>
        <li>Refresh the page to re-establish the real-time connection</li>
      </ul>
      <p>Messages and invites are still saved - they will appear when you open the page.</p>
    `,
    contentType: "TROUBLESHOOTING",
    status: "PUBLISHED",
    tags: ["notifications", "missing", "alerts", "not working"],
    keywords: ["notification", "not working", "missing", "alerts"],
    pageRoutes: ["/notifications", "/settings", "/tickets"],
  });

  // Leaderboard
  await createArticleIfNotExists({
    categoryId: gettingStartedCategoryId,
    title: "How is the leaderboard ranked?",
    content: `
      <p>The leaderboard ranks players by their performance:</p>
      <ul>
        <li>Switch scopes to view <strong>Global</strong>, <strong>Country</strong>, <strong>Region</strong>, <strong>Friends</strong>, or <strong>Game</strong> rankings</li>
        <li>Ranking is based on points earned from wins, skill, and tournament performance</li>
        <li>Higher ranks are better - the top players appear at the top of the list</li>
        <li>Your position updates after every completed match</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["leaderboard", "ranking", "points", "competitive"],
    keywords: ["leaderboard", "rank", "points", "top"],
    pageRoutes: ["/leaderboard"],
  });

  await createArticleIfNotExists({
    categoryId: troubleshootingCategoryId,
    title: "Why is my leaderboard ranking not updating?",
    content: `
      <p>Your ranking updates after matches are fully recorded:</p>
      <ul>
        <li>Abandoned or disconnected matches do not count</li>
        <li>Rankings refresh periodically, not in real-time</li>
        <li>If you just finished a match, wait a few minutes and refresh</li>
        <li>Ensure you are viewing the same scope (Global/Country/etc.)</li>
      </ul>
    `,
    contentType: "TROUBLESHOOTING",
    status: "PUBLISHED",
    tags: ["leaderboard", "rank", "stale", "not updating"],
    keywords: ["leaderboard", "not updating", "rank", "stale"],
    pageRoutes: ["/leaderboard"],
  });

  // Support Tickets
  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "How do I create a support ticket?",
    content: `
      <p>To create a support ticket:</p>
      <ol>
        <li>Go to the <strong>Tickets</strong> page</li>
        <li>Click <strong>Create Ticket</strong></li>
        <li>Choose a category (Wallet, Account, Game issue, etc.)</li>
        <li>Write a clear subject and description of your issue</li>
        <li>Add any relevant details like match IDs or transaction IDs</li>
        <li>Submit - you will receive a reply here when the team responds</li>
      </ol>
      <p>You can attach details about errors you encountered to speed up resolution.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["tickets", "support", "create", "help"],
    keywords: ["ticket", "support", "create", "submit"],
    pageRoutes: ["/tickets"],
  });

  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "How long does it take to get a reply on my ticket?",
    content: `
      <p>Typical response times:</p>
      <ul>
        <li>Most tickets get an initial response within <strong>24 hours</strong></li>
        <li>Wallet and KYC queries are usually prioritized</li>
        <li>Check the <strong>Tickets</strong> page for status updates - you will also get a notification</li>
        <li>Do not create duplicate tickets for the same issue - this may slow down resolution</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["tickets", "support", "response", "wait"],
    keywords: ["ticket", "reply", "how long", "wait"],
    pageRoutes: ["/tickets", "/notifications"],
  });

  // Snake & Ladder
  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I play Snake and Ladder?",
    content: `
      <p>Rules of the game:</p>
      <ul>
        <li>Roll the dice and move your token by the number shown</li>
        <li>Land on a <strong>ladder</strong> to climb up to a higher square</li>
        <li>Land on a <strong>snake</strong> to slide down to a lower square</li>
        <li>Roll a <strong>6</strong> to roll again (subject to room settings)</li>
        <li>The first player to reach the final square wins</li>
      </ul>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["snake-ladder", "rules", "how to play", "guide"],
    keywords: ["snake ladder", "play", "rules", "dice"],
    pageRoutes: ["/games/snake-ladder"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "Why can't I roll the dice in Snake and Ladder?",
    content: `
      <p>The dice may be locked when:</p>
      <ul>
        <li>It is not your turn - wait for the current player to finish</li>
        <li>The room is still waiting for players to be ready</li>
        <li>Your connection to the room has dropped - try reconnecting</li>
        <li>An animation is still playing - wait a second and retry</li>
      </ul>
    `,
    contentType: "TROUBLESHOOTING",
    status: "PUBLISHED",
    tags: ["snake-ladder", "dice", "locked", "turn"],
    keywords: ["dice", "roll", "locked", "not working"],
    pageRoutes: ["/games/snake-ladder"],
  });

  // Other casual games
  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I score points in Bubble Shooter?",
    content: `
      <p>Tips for scoring in Bubble Shooter:</p>
      <ul>
        <li>Aim and shoot bubbles to match 3 or more of the same color</li>
        <li>Matching bubbles pop and add points to your score</li>
        <li>Bigger chain reactions earn bonus points</li>
        <li>Clear the board before the bubbles reach the bottom line</li>
        <li>Higher scores improve your standing on the game leaderboard</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["bubble-shooter", "score", "tips", "how to play"],
    keywords: ["bubble shooter", "score", "points", "play"],
    pageRoutes: ["/games/bubble-shooter"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I play Fruit Ninja?",
    content: `
      <p>To play Fruit Ninja:</p>
      <ul>
        <li>Slice fruits that appear on the screen to earn points</li>
        <li>Do not slice <strong>bombs</strong> - hitting one ends your run</li>
        <li>Combo streaks of multiple fruits at once give bonus points</li>
        <li>Use special fruits for extra effects when available</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["fruit-ninja", "how to play", "score"],
    keywords: ["fruit ninja", "play", "slice", "score"],
    pageRoutes: ["/games/fruit-ninja"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I play Table Tennis?",
    content: `
      <p>To play Table Tennis:</p>
      <ul>
        <li>Move your paddle to hit the ball back to your opponent</li>
        <li>Score a point when your opponent fails to return the ball</li>
        <li>The first player to reach the target score wins the set</li>
        <li>Use angle and timing to place shots that are hard to return</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["table-tennis", "how to play", "rules"],
    keywords: ["table tennis", "play", "rules", "paddle"],
    pageRoutes: ["/games/table-tennis"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I play Snake vs Worms?",
    content: `
      <p>To play Snake vs Worms:</p>
      <ul>
        <li>Control your snake to collect food and grow longer</li>
        <li>Avoid your own tail, other snakes, and worms</li>
        <li>Cause opponents to crash into your body to eliminate them</li>
        <li>The last snake standing or the one with the highest length wins</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["snake-vs-worms", "how to play", "rules"],
    keywords: ["snake vs worms", "play", "rules", "snake"],
    pageRoutes: ["/games/snake-vs-worms"],
  });

  await createArticleIfNotExists({
    categoryId: gamesCategoryId,
    title: "How do I play Carrom?",
    content: `
      <p>To play Carrom:</p>
      <ul>
        <li>Flick your striker to pocket coins into the corner pockets</li>
        <li>Pocket all of your assigned coins to win</li>
        <li>Pocketing the <strong>queen</strong> earns bonus points but must be covered</li>
        <li>Avoid pocketing your opponent's coins</li>
      </ul>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["carrom", "how to play", "rules"],
    keywords: ["carrom", "play", "rules", "queen"],
    pageRoutes: ["/games/carrom"],
  });

  // Messages
  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "How do I message another player?",
    content: `
      <p>To send a message:</p>
      <ol>
        <li>Open the <strong>Messages</strong> page</li>
        <li>Click <strong>New Message</strong> or open a conversation</li>
        <li>Select a friend or search for a player by username</li>
        <li>Type your message and press <strong>Send</strong></li>
      </ol>
      <p>You will be notified of new replies through the bell icon and the messages page.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["messages", "chat", "social", "dm"],
    keywords: ["message", "chat", "dm", "send"],
    pageRoutes: ["/messages"],
  });

  // KYC
  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "Why do I need to verify my identity (KYC)?",
    content: `
      <p>Identity verification (KYC) is required to:</p>
      <ul>
        <li>Withdraw funds from your wallet</li>
        <li>Participate in tournaments with prize pools</li>
        <li>Comply with legal and anti-fraud regulations</li>
        <li>Protect your account from unauthorized use</li>
      </ul>
      <p>You can still play games and deposit coins without KYC - verification is only needed for withdrawals and prize events.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["kyc", "verification", "identity", "withdraw"],
    keywords: ["kyc", "verify", "identity", "why"],
    pageRoutes: ["/kyc", "/kyc/verify", "/wallet/withdraw"],
  });

  await createArticleIfNotExists({
    categoryId: accountCategoryId,
    title: "What documents are accepted for KYC verification?",
    content: `
      <p>You can verify your identity using:</p>
      <ul>
        <li><strong>Government ID:</strong> Passport, Driver's License, or National ID card</li>
        <li><strong>Proof of address:</strong> Utility bill or bank statement (if required)</li>
        <li><strong>Selfie:</strong> A clear photo of your face for comparison</li>
      </ul>
      <p>Make sure all documents are clear, in focus, and not expired. Verification usually completes within a few hours.</p>
    `,
    contentType: "FAQ",
    status: "PUBLISHED",
    tags: ["kyc", "documents", "id", "verification"],
    keywords: ["kyc", "documents", "id", "accepted"],
    pageRoutes: ["/kyc", "/kyc/verify"],
  });

  // Admin - users & matches
  await createArticleIfNotExists({
    categoryId: adminCategoryId,
    title: "How do I manage users?",
    content: `
      <p>To manage users:</p>
      <ol>
        <li>Navigate to <strong>Users</strong> in the admin panel</li>
        <li>Search for a user by username, email, or ID</li>
        <li>Review their profile, wallet, and activity</li>
        <li>Suspend or restrict accounts when necessary</li>
        <li>Use the audit log to track any changes you make</li>
      </ol>
      <p>All user management actions are logged for accountability.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["admin", "users", "manage", "moderation"],
    keywords: ["user", "manage", "suspend", "admin"],
    pageRoutes: ["/admin", "/admin/users"],
  });

  await createArticleIfNotExists({
    categoryId: adminCategoryId,
    title: "How do I review matches and rooms?",
    content: `
      <p>To review matches and rooms:</p>
      <ol>
        <li>Open <strong>Matches</strong> or <strong>Rooms</strong> from the admin panel</li>
        <li>Filter by status, game, date, or player</li>
        <li>Open a match/room to view its details and participants</li>
        <li>Investigate reported or suspicious activity</li>
        <li>Close or void invalid rooms if needed</li>
      </ol>
      <p>Use the monitoring page to watch live rooms in real-time.</p>
    `,
    contentType: "GUIDE",
    status: "PUBLISHED",
    tags: ["admin", "matches", "rooms", "monitoring"],
    keywords: ["match", "room", "review", "admin"],
    pageRoutes: ["/admin", "/admin/matches", "/admin/rooms"],
  });

  console.log("Support content seeded successfully!");
}

async function createArticleIfNotExists(data: {
  categoryId: string;
  title: string;
  content: string;
  contentType: "FAQ" | "QUICK_ACTION" | "GUIDE" | "TROUBLESHOOTING" | "NOTE" | "LINK" | "TUTORIAL";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  tags?: string[];
  keywords?: string[];
  quickAction?: { label: string; action: string; link?: string; icon?: string } | null;
  pageRoutes: string[];
}) {
  const existing = await prisma.supportArticle.findFirst({
    where: {
      title: data.title,
      categoryId: data.categoryId,
    },
  });

  if (existing) {
    console.log(`Article "${data.title}" already exists, skipping...`);
    return;
  }

  const slug = `${data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;

  const article = await prisma.supportArticle.create({
    data: {
      categoryId: data.categoryId,
      title: data.title,
      slug,
      content: data.content,
      contentType: data.contentType,
      status: data.status,
      tags: data.tags || [],
      keywords: data.keywords || [],
      quickAction: data.quickAction || null,
      sortOrder: 0,
    },
  });

  // Create page mappings
  if (data.pageRoutes.length > 0) {
    await prisma.supportPageMapping.createMany({
      data: data.pageRoutes.map((route) => ({
        articleId: article.id,
        pageRoute: route,
        isActive: true,
        priority: 0,
      })),
    });
  }

  console.log(`Created article: "${data.title}"`);
}

seedSupportContent()
  .then(() => {
    console.log("Seeding completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exit(1);
  });
