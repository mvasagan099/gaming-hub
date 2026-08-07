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
  const walletCategoryId = categoryMap.get("wallet")!;
  const gamesCategoryId = categoryMap.get("games")!;
  const accountCategoryId = categoryMap.get("account")!;
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
