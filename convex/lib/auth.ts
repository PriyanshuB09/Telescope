import { getAuthUserId } from '@convex-dev/auth/server'
import { ConvexError } from 'convex/values'
import type { Doc } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

type UserContext = QueryCtx | MutationCtx

export async function requireUser(ctx: UserContext): Promise<Doc<'users'>> {
  const userId = await getAuthUserId(ctx)
  if (!userId) throw new ConvexError('Sign in to continue.')
  const user = await ctx.db.get(userId)
  if (!user) throw new ConvexError('Your account is not available.')
  return user
}

export async function requireAdmin(ctx: UserContext): Promise<Doc<'users'>> {
  const user = await requireUser(ctx)
  if (user.role !== 'admin') throw new ConvexError('Administrator access is required.')
  return user
}
