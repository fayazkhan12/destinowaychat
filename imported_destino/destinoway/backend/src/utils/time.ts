// Single source of truth for date math lives in dateResolver.ts (Asia/Kolkata business timezone).
import { addDays, getTodayInIndia } from './dateResolver';
export { addDays };
/** Today's date (YYYY-MM-DD) in India time - the product's primary market. */
export const todayIST = (_now?: Date): string => getTodayInIndia();
export const isPast = (iso: string, today = getTodayInIndia()) => iso < today;
