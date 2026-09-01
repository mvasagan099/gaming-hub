/**
 * Monetization Module
 * 
 * Manages in-app purchases, subscriptions, store items, gifts,
 * and the complete virtual economy.
 */

import { EventEmitter } from "events";
import { prisma } from "@gaming-hub/db";
import type {
  StoreItem,
  UserInventoryItem,
  SubscriptionPlan,
  UserSubscription,
  Coupon,
  Gift,
  EventReward,
} from "../types";

export interface MonetizationConfig {
  paymentGateways?: {
    stripe?: { secretKey: string };
    paypal?: { clientId: string; secret: string };
    razorpay?: { keyId: string; keySecret: string };
  };
  enableSubscriptions?: boolean;
}

export class MonetizationManager extends EventEmitter {
  private config: MonetizationConfig;
  private storeItems = new Map<string, StoreItem>();
  private subscriptionPlans = new Map<string, SubscriptionPlan>();
  private coupons = new Map<string, Coupon>();

  constructor(config: MonetizationConfig = {}) {
    super();
    this.config = {
      enableSubscriptions: true,
      ...config,
    };
    this.initializeDefaultStore();
  }

  private initializeDefaultStore(): void {
    // Default store items will be loaded from database
  }

  // ============================================================================
  // Store Management
  // ============================================================================

  /**
   * Get store items for a user
   */
  async getStoreItems(userId?: string): Promise<StoreItem[]> {
    const items = await prisma.storeItem.findMany({
      where: {
        isActive: true,
        OR: [
          { availableUntil: null },
          { availableUntil: { gte: new Date() } },
        ],
      },
      orderBy: { createdAt: "desc" },
    }) as unknown as StoreItem[];

    if (userId) {
      // Filter by target audience if specified
      const filtered: StoreItem[] = [];
      for (const item of items) {
        if (await this.matchesAudience(item.targetAudience, userId)) {
          filtered.push(item);
        }
      }
      return filtered;
    }

    return items;
  }

  /**
   * Purchase a store item
   */
  async purchaseItem(
    userId: string,
    itemId: string,
    couponCode?: string
  ): Promise<{
    success: boolean;
    item?: StoreItem;
    inventoryItem?: UserInventoryItem;
    error?: string;
  }> {
    const item = await prisma.storeItem.findUnique({
      where: { id: itemId },
    }) as unknown as StoreItem | null;

    if (!item || !item.isActive) {
      return { success: false, error: "Item not found" };
    }

    // Check availability
    if (item.availableUntil && new Date(item.availableUntil) < new Date()) {
      return { success: false, error: "Item no longer available" };
    }

    if (item.isLimited && item.quantity !== undefined && item.quantity <= 0) {
      return { success: false, error: "Item out of stock" };
    }

    // Get user profile
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return { success: false, error: "User not found" };
    }

    // Calculate price with coupon
    let finalPrice = item.price;
    if (couponCode) {
      const discount = await this.applyCoupon(couponCode, userId, itemId, item.price);
      if (discount > 0) {
        finalPrice -= discount;
      }
    }

    // Check currency
    if (item.currency === "coins" && profile.coins < finalPrice) {
      return { success: false, error: "Insufficient coins" };
    }

    if (item.currency === "gems" && profile.gems < finalPrice) {
      return { success: false, error: "Insufficient gems" };
    }

    // Deduct currency
    if (item.currency === "coins") {
      await prisma.profile.update({
        where: { userId },
        data: { coins: { decrement: finalPrice } },
      });
    } else if (item.currency === "gems") {
      await prisma.profile.update({
        where: { userId },
        data: { gems: { decrement: finalPrice } },
      });
    } else if (item.currency === "usd") {
      // Handle real money purchase
      // This would integrate with payment gateway
    }

    // Add to inventory
    const inventoryItem = await prisma.userInventoryItem.create({
      data: {
        userId,
        itemId: item.id,
        type: item.type,
        quantity: 1,
        acquiredAt: new Date(),
        isEquipped: false,
      },
    }) as unknown as UserInventoryItem;

    // Decrement quantity if limited
    if (item.isLimited && item.quantity !== undefined) {
      await prisma.storeItem.update({
        where: { id: itemId },
        data: { quantity: { decrement: 1 } },
      });
    }

    this.emit("itemPurchased", { userId, item, price: finalPrice });

    return {
      success: true,
      item,
      inventoryItem,
    };
  }

  /**
   * Equip an inventory item
   */
  async equipItem(userId: string, inventoryItemId: string): Promise<boolean> {
    const item = await prisma.userInventoryItem.findUnique({
      where: { id: inventoryItemId },
    });

    if (!item || item.userId !== userId) {
      return false;
    }

    // Unequip other items of same type
    await prisma.userInventoryItem.updateMany({
      where: {
        userId,
        type: item.type,
        isEquipped: true,
      },
      data: { isEquipped: false },
    });

    // Equip selected item
    await prisma.userInventoryItem.update({
      where: { id: inventoryItemId },
      data: { isEquipped: true },
    });

    this.emit("itemEquipped", { userId, item });
    return true;
  }

  /**
   * Get user inventory
   */
  async getUserInventory(userId: string): Promise<UserInventoryItem[]> {
    return prisma.userInventoryItem.findMany({
      where: { userId },
      orderBy: { acquiredAt: "desc" },
    }) as unknown as UserInventoryItem[];
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  /**
   * Create subscription plan
   */
  async createSubscriptionPlan(plan: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const created = await prisma.subscriptionPlan.create({
      data: {
        name: plan.name!,
        description: plan.description,
        tier: plan.tier!,
        price: plan.price!,
        currency: plan.currency ?? "USD",
        interval: plan.interval!,
        features: plan.features as object[],
        rewards: plan.rewards as object[],
        isActive: plan.isActive ?? true,
      },
    }) as unknown as SubscriptionPlan;

    this.subscriptionPlans.set(created.id, created);
    return created;
  }

  /**
   * Subscribe user to plan
   */
  async subscribe(userId: string, planId: string, paymentMethod: string): Promise<{
    success: boolean;
    subscription?: UserSubscription;
    error?: string;
  }> {
    const plan = this.subscriptionPlans.get(planId);
    if (!plan || !plan.isActive) {
      return { success: false, error: "Plan not found" };
    }

    // Check if already subscribed
    const existing = await prisma.userSubscription.findFirst({
      where: {
        userId,
        planId,
        status: "active",
      },
    });

    if (existing) {
      return { success: false, error: "Already subscribed" };
    }

    // Calculate expiration
    const expiresAt = new Date();
    if (plan.interval === "monthly") {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Create subscription
    const subscription = await prisma.userSubscription.create({
      data: {
        userId,
        planId,
        status: "active",
        startedAt: new Date(),
        expiresAt,
        autoRenew: true,
        paymentMethod,
      },
    }) as unknown as UserSubscription;

    // Apply subscription benefits
    await this.applySubscriptionBenefits(userId, plan);

    this.emit("subscriptionCreated", { userId, plan, subscription });

    return { success: true, subscription };
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    const subscription = await prisma.userSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        autoRenew: false,
      },
    }) as unknown as UserSubscription;

    this.emit("subscriptionCancelled", subscription);
    return true;
  }

  /**
   * Get user subscriptions
   */
  async getUserSubscriptions(userId: string): Promise<UserSubscription[]> {
    return prisma.userSubscription.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
    }) as unknown as UserSubscription[];
  }

  private async applySubscriptionBenefits(
    userId: string,
    plan: SubscriptionPlan
  ): Promise<void> {
    // Apply instant rewards
    for (const reward of plan.rewards) {
      if (reward.type === "coins") {
        await prisma.profile.update({
          where: { userId },
          data: { coins: { increment: reward.amount ?? 0 } },
        });
      } else if (reward.type === "gems") {
        await prisma.profile.update({
          where: { userId },
          data: { gems: { increment: reward.amount ?? 0 } },
        });
      }
    }
  }

  // ============================================================================
  // Coupons
  // ============================================================================

  /**
   * Create coupon
   */
  async createCoupon(coupon: Partial<Coupon>): Promise<Coupon> {
    const created = await prisma.coupon.create({
      data: {
        code: coupon.code!,
        title: coupon.name!,
        description: coupon.description,
        discountType: coupon.discountType === "fixed" ? "FIXED" : "PERCENT",
        discountValue: coupon.discountValue!,
        maxUses: coupon.maxUses ?? 1,
        usedCount: 0,
        minWager: coupon.minPurchase ?? 0,
        maxRedeemValue: coupon.maxDiscount ?? null,
        validFrom: coupon.validFrom!,
        validUntil: coupon.validUntil!,
        createdBy: coupon.createdBy,
      },
    }) as unknown as Coupon;

    this.coupons.set(created.code, created);
    return created;
  }

  /**
   * Validate and apply coupon
   */
  async validateCoupon(
    code: string,
    userId: string,
    itemId?: string,
    purchaseAmount?: number
  ): Promise<{
    valid: boolean;
    discount?: number;
    error?: string;
  }> {
    const coupon = await prisma.coupon.findUnique({
      where: { code },
    }) as unknown as Coupon | null;

    if (!coupon) {
      return { valid: false, error: "Invalid coupon" };
    }

    // Check dates
    const now = new Date();
    if (now < coupon.validFrom) {
      return { valid: false, error: "Coupon not yet valid" };
    }
    if (now > coupon.validUntil) {
      return { valid: false, error: "Coupon expired" };
    }

    // Check usage limit
    if (coupon.usedCount >= coupon.maxUses) {
      return { valid: false, error: "Coupon fully redeemed" };
    }

    // Check if user already used
    const existing = await prisma.couponRedemption.findUnique({
      where: {
        couponId_userId: { couponId: coupon.id, userId },
      },
    });

    if (existing) {
      return { valid: false, error: "Coupon already used" };
    }
    
    // Check applies to
    if (itemId && coupon.appliesTo.length > 0 && !coupon.appliesTo.includes(itemId)) {
      return { valid: false, error: "Coupon not valid for this item" };
    }

    // Check minimum purchase
    if (coupon.minPurchase && (purchaseAmount ?? 0) < coupon.minPurchase) {
      return { valid: false, error: `Minimum purchase of ${coupon.minPurchase} required` };
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === "percent") {
      discount = ((purchaseAmount ?? 0) * coupon.discountValue) / 100;
    } else {
      discount = coupon.discountValue;
    }

    // Apply max discount
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }

    return { valid: true, discount };
  }

  /**
   * Apply coupon
   */
  async applyCoupon(
    code: string,
    userId: string,
    itemId: string,
    purchaseAmount: number
  ): Promise<number> {
    const validation = await this.validateCoupon(code, userId, itemId, purchaseAmount);
    if (!validation.valid || !validation.discount) {
      return 0;
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code },
    });

    if (!coupon) return 0;

    // Increment usage
    await prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });

    // Record redemption
    await prisma.couponRedemption.create({
      data: {
        couponId: coupon.id,
        userId,
        value: validation.discount,
      },
    });

    return validation.discount;
  }

  // ============================================================================
  // Gift System
  // ============================================================================

  /**
   * Send a gift
   */
  async sendGift(
    senderId: string,
    recipientId: string,
    itemId: string,
    message?: string
  ): Promise<{
    success: boolean;
    gift?: Gift;
    error?: string;
  }> {
    // Check sender has item
    const inventoryItem = await prisma.userInventoryItem.findFirst({
      where: {
        userId: senderId,
        itemId,
      },
    });

    if (!inventoryItem || inventoryItem.quantity < 1) {
      return { success: false, error: "Item not found in inventory" };
    }

    // Check if recipient exists
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
    });

    if (!recipient) {
      return { success: false, error: "Recipient not found" };
    }

    // Create gift
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days to accept

    const gift = await prisma.gift.create({
      data: {
        senderId,
        recipientId,
        itemId,
        itemType: inventoryItem.type,
        quantity: 1,
        message,
        status: "pending",
        sentAt: new Date(),
        expiresAt,
      },
    }) as unknown as Gift;

    // Remove from sender inventory
    if (inventoryItem.quantity <= 1) {
      await prisma.userInventoryItem.delete({
        where: { id: inventoryItem.id },
      });
    } else {
      await prisma.userInventoryItem.update({
        where: { id: inventoryItem.id },
        data: { quantity: { decrement: 1 } },
      });
    }

    this.emit("giftSent", gift);

    return { success: true, gift };
  }

  /**
   * Accept a gift
   */
  async acceptGift(giftId: string, userId: string): Promise<boolean> {
    const gift = await prisma.gift.findUnique({
      where: { id: giftId },
    });

    if (!gift || gift.recipientId !== userId || gift.status !== "pending") {
      return false;
    }

    // Add to recipient inventory
    await prisma.userInventoryItem.create({
      data: {
        userId,
        itemId: gift.itemId,
        type: gift.itemType,
        quantity: gift.quantity,
        acquiredAt: new Date(),
        isEquipped: false,
      },
    });

    // Update gift status
    await prisma.gift.update({
      where: { id: giftId },
      data: {
        status: "accepted",
        respondedAt: new Date(),
      },
    });

    this.emit("giftAccepted", gift);
    return true;
  }

  /**
   * Decline a gift
   */
  async declineGift(giftId: string, userId: string): Promise<boolean> {
    const gift = await prisma.gift.findUnique({
      where: { id: giftId },
    });

    if (!gift || gift.recipientId !== userId || gift.status !== "pending") {
      return false;
    }

    // Return to sender
    await prisma.userInventoryItem.create({
      data: {
        userId: gift.senderId,
        itemId: gift.itemId,
        type: gift.itemType,
        quantity: gift.quantity,
        acquiredAt: new Date(),
        isEquipped: false,
      },
    });

    // Update gift status
    await prisma.gift.update({
      where: { id: giftId },
      data: {
        status: "declined",
        respondedAt: new Date(),
      },
    });

    this.emit("giftDeclined", gift);
    return true;
  }

  /**
   * Get pending gifts for user
   */
  async getPendingGifts(userId: string): Promise<Gift[]> {
    return prisma.gift.findMany({
      where: {
        recipientId: userId,
        status: "pending",
        expiresAt: { gte: new Date() },
      },
      orderBy: { sentAt: "desc" },
    }) as unknown as Gift[];
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async matchesAudience(
    audience: unknown,
    userId: string
  ): Promise<boolean> {
    if (!audience) return true;
    // Simplified audience check
    return true;
  }
}
