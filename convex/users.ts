import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError, v } from 'convex/values'
import { env, mutation, query } from './_generated/server'

export const currentUser = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id('users'),
      username: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      role: v.union(v.literal('admin'), v.literal('scout')),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const user = await ctx.db.get(userId)
    if (!user) return null
    return {
      id: user._id,
      username: user.username ?? null,
      name: user.name ?? null,
      role: user.role ?? 'scout',
    }
  },
})

export const canBootstrapAdmin = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return false
    const user = await ctx.db.get(userId)
    const configuredUsername = env.ADMIN_BOOTSTRAP_USERNAME?.trim().toLowerCase()
    if (!user?.username || !configuredUsername || user.username.toLowerCase() !== configuredUsername) return false
    const existingAdmin = await ctx.db.query('users').withIndex('by_role', (q) => q.eq('role', 'admin')).first()
    return existingAdmin === null
  },
})

export const bootstrapFirstAdmin = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError('Sign in before setting up the administrator account.')
    const user = await ctx.db.get(userId)
    const configuredUsername = env.ADMIN_BOOTSTRAP_USERNAME?.trim().toLowerCase()
    if (!user?.username || !configuredUsername || user.username.toLowerCase() !== configuredUsername) {
      throw new ConvexError('This account is not configured for administrator setup.')
    }
    const existingAdmin = await ctx.db.query('users').withIndex('by_role', (q) => q.eq('role', 'admin')).first()
    if (existingAdmin) throw new ConvexError('An administrator has already been set up.')
    await ctx.db.patch(userId, { role: 'admin' })
    return null
  },
})
