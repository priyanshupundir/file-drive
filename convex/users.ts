import { ConvexError, v } from "convex/values";
import {
  MutationCtx,
  QueryCtx,
  internalMutation,
  query,
} from "./_generated/server";
import { roles } from "./schema";

export async function getUser(
  ctx: QueryCtx | MutationCtx,
  tokenIdentifier: string
) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_tokenIdentifier", (q) =>
      q.eq("tokenIdentifier", tokenIdentifier)
    )
    .first();

  if (!user) throw new ConvexError("expected user to be defined");
  return user;
}

/**
 * When a user logs in for the first time, create a Convex user
 */
export const createUser = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    name: v.string(),
    image: v.string(),
  },
  async handler(ctx, args) {
    await ctx.db.insert("users", {
      tokenIdentifier: args.tokenIdentifier,
      name: args.name,
      image: args.image,
      orgIds: [],
    });
  },
});

/**
 * Add an organization to a user's orgIds when they join an org
 */
export const addOrgIdToUser = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    orgId: v.string(),
    role: roles,
  },
  async handler(ctx, args) {
    const user = await getUser(ctx, args.tokenIdentifier);

    // Check if user already has this org
    const hasOrg = user.orgIds.some((item) => item.orgId === args.orgId);

    if (!hasOrg) {
      await ctx.db.patch(user._id, {
        orgIds: [
          ...user.orgIds,
          {
            orgId: args.orgId,
            role: args.role,
          },
        ],
      });
    }
  },
});

/**
 * Update a user's role in a specific organization
 */
export const updateRoleInOrgForUser = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    orgId: v.string(),
    role: roles,
  },
  async handler(ctx, args) {
    const user = await getUser(ctx, args.tokenIdentifier);

    const updatedOrgIds = user.orgIds.map((item) => {
      if (item.orgId === args.orgId) {
        return {
          ...item,
          role: args.role,
        };
      }
      return item;
    });

    await ctx.db.patch(user._id, {
      orgIds: updatedOrgIds,
    });
  },
});

/**
 * Sync all Clerk organization memberships to Convex (legacy, kept for compatibility)
 */
export const syncUserOrgs = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    orgIds: v.array(
      v.object({
        orgId: v.string(),
        role: roles,
      })
    ),
  },
  async handler(ctx, args) {
    const user = await getUser(ctx, args.tokenIdentifier);

    await ctx.db.patch(user._id, {
      orgIds: args.orgIds,
    });
  },
});

/**
 * Update profile
 */
export const updateUser = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    name: v.string(),
    image: v.string(),
  },
  async handler(ctx, args) {
    const user = await getUser(ctx, args.tokenIdentifier);
    await ctx.db.patch(user._id, {
      name: args.name,
      image: args.image,
    });
  },
});

/**
 * Who am I
 */
export const getMe = query({
  args: {},
  async handler(ctx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await getUser(ctx, identity.tokenIdentifier);
    return user;
  },
});

/**
 * Get user profile by ID
 */
export const getUserProfile = query({
  args: {
    userId: v.id("users"),
  },
  async handler(ctx, args) {
    const user = await ctx.db.get(args.userId);
    return user;
  },
});