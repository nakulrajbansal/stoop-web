/**
 * What a plan looks like to the public.
 *
 * The product tells people the public host card is "first name, photo,
 * neighborhood". Rendering the first name is only half of keeping that promise:
 * a server component that passes a whole database row into a client component
 * ships the surname in the serialized props, where anyone can read it in the
 * page source. So the row is narrowed once, at the boundary, and the surfaces
 * render from the narrowed copy.
 *
 * Nothing else about a plan is private. The activity, time, meeting point and
 * cost are the whole point of a public noticeboard.
 */
import { firstNameOf } from '@/lib/participants';

type PosterShape = { name?: string | null };

export function toPublicPoster<T extends PosterShape>(poster: T | null | undefined): T | null {
  if (!poster) return null;
  return { ...poster, name: firstNameOf(poster.name) };
}

export function toPublicPlan<T extends { poster?: PosterShape | null }>(plan: T): T {
  if (!plan) return plan;
  return { ...plan, poster: toPublicPoster(plan.poster) } as T;
}

export function toPublicPlans<T extends { poster?: PosterShape | null }>(plans: readonly T[]): T[] {
  return plans.map(toPublicPlan);
}

type OgPlanRow = {
  text?: string | null;
  when_day?: string | null;
  when_time?: string | null;
  when_time_specific?: string | null;
  neighborhood?: { name?: string | null } | null;
  city?: { name?: string | null } | null;
  poster?: PosterShape | null;
} | null | undefined;

export type OgPlanFields = { text: string; when: string; where: string; poster: string };

/**
 * The fields the link preview image draws.
 *
 * Every shared link unfurls through this, and crawlers fetch it without a
 * session, so it is as public as the plan page and gets the same first-name
 * rule. It lives here rather than in the image route so the rule is one
 * function with one test, instead of a name being split by hand in a place
 * nobody looks at twice.
 */
export function ogPlanFields(plan: OgPlanRow): OgPlanFields {
  const time = plan?.when_time_specific || plan?.when_time || '';
  const day = plan?.when_day ?? '';
  return {
    text: plan?.text ?? 'A plan in your neighborhood',
    when: [day, time].filter(Boolean).join(' · '),
    where: [plan?.neighborhood?.name, plan?.city?.name].filter(Boolean).join(', '),
    poster: plan?.poster ? firstNameOf(plan.poster.name) : ''
  };
}
