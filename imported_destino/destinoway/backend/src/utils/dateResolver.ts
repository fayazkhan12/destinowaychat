/**
 * Destinoway Date Intelligence
 *
 * Responsibility:
 * - Resolve relative date expressions into YYYY-MM-DD
 * - Use Asia/Kolkata as the business timezone
 * - Keep date interpretation deterministic
 *
 * This file does NOT validate booking/search eligibility yet.
 * Validation will be added separately in dateRules.ts.
 */

const BUSINESS_TIME_ZONE = 'Asia/Kolkata';

export interface ResolvedDate {
  date: string;
  source: 'absolute' | 'relative';
  expression: string;
}

type WeekdayIndex =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6;

/**
 * Get today's calendar date in the Destinoway
 * business timezone.
 *
 * Returns:
 * YYYY-MM-DD
 */
export function getTodayInIndia(): string {
  const formatter = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }
  );

  return formatter.format(new Date());
}

/**
 * Parse YYYY-MM-DD into a UTC Date.
 *
 * We use UTC internally for calendar arithmetic so
 * timezone offsets cannot accidentally change the date.
 */
function parseDate(date: string): Date {
  const parts = date.split('-');

  if (parts.length !== 3) {
    throw new Error(
      `Invalid date format: ${date}. Expected YYYY-MM-DD.`
    );
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new Error(
      `Invalid date: ${date}`
    );
  }

  const result = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  /*
   * Prevent JavaScript Date from silently normalizing
   * invalid dates such as:
   *
   * 2026-02-31 → 2026-03-03
   */
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new Error(
      `Invalid calendar date: ${date}`
    );
  }

  return result;
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function formatDate(date: Date): string {
  return date
    .toISOString()
    .slice(0, 10);
}

/**
 * Add calendar days to a YYYY-MM-DD date.
 */
export function addDays(
  date: string,
  days: number
): string {
  const result = parseDate(date);

  result.setUTCDate(
    result.getUTCDate() + days
  );

  return formatDate(result);
}

/**
 * Convert weekday name into JavaScript weekday index.
 *
 * Sunday = 0
 * Monday = 1
 * Tuesday = 2
 * Wednesday = 3
 * Thursday = 4
 * Friday = 5
 * Saturday = 6
 */
function getWeekdayIndex(
  name: string
): WeekdayIndex | null {
  const normalized = name
    .trim()
    .toLowerCase();

  const weekdays: Record<
    string,
    WeekdayIndex
  > = {
    // English
    sunday: 0,
    sun: 0,

    monday: 1,
    mon: 1,

    tuesday: 2,
    tue: 2,

    wednesday: 3,
    wed: 3,

    thursday: 4,
    thu: 4,

    friday: 5,
    fri: 5,

    saturday: 6,
    sat: 6,

    // Hindi / Hinglish
    ravivaar: 0,
    ravivar: 0,

    somvaar: 1,
    somvar: 1,

    mangalvaar: 2,
    mangalvar: 2,

    budhvaar: 3,
    budhvar: 3,

    guruvaar: 4,
    guruvar: 4,

    shukravaar: 5,
    shukravar: 5,

    shanivaar: 6,
    shanivar: 6,
  };

  return weekdays[normalized] ?? null;
}

/**
 * Return weekday for a YYYY-MM-DD date.
 */
function getWeekday(
  date: string
): WeekdayIndex {
  return parseDate(date)
    .getUTCDay() as WeekdayIndex;
}

/**
 * Find the next occurrence of a weekday.
 *
 * Example:
 *
 * Today = Thursday
 * next Friday = tomorrow
 *
 * Today = Friday
 * next Friday = 7 days later
 *
 * This intentionally treats "next Friday" as
 * the following week's Friday when today itself
 * is Friday.
 */
function nextWeekday(
  today: string,
  target: WeekdayIndex
): string {
  const current = getWeekday(today);

  let diff =
    (target - current + 7) % 7;

  if (diff === 0) {
    diff = 7;
  }

  return addDays(
    today,
    diff
  );
}

/**
 * Find the nearest upcoming occurrence of a weekday
 * within the current week.
 *
 * Example:
 *
 * Today = Thursday
 * this Friday = tomorrow
 *
 * Today = Friday
 * this Friday = today
 */
function thisWeekday(
  today: string,
  target: WeekdayIndex
): string {
  const current = getWeekday(today);

  const diff =
    (target - current + 7) % 7;

  return addDays(
    today,
    diff
  );
}

/**
 * Resolve relative date expressions.
 *
 * Supported:
 *
 * today
 * aaj
 *
 * tomorrow
 * kal
 *
 * day after tomorrow
 * parso
 *
 * in N days
 * N days later
 *
 * next Friday
 * next Monday
 * coming Friday
 * coming Monday
 *
 * this Friday
 * this Monday
 * is Sunday
 *
 * agle Friday
 * agle Monday
 *
 * this weekend
 * next weekend
 * ye weekend
 * iss weekend
 * agle weekend
 */
export function resolveRelativeDate(
  expression: string,
  today = getTodayInIndia()
): ResolvedDate | null {
  const normalized = expression
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!normalized) {
    return null;
  }

  // --------------------------------------------------------
  // TODAY
  // --------------------------------------------------------

  if (
    normalized === 'today' ||
    normalized === 'aaj'
  ) {
    return {
      date: today,
      source: 'relative',
      expression,
    };
  }

  // --------------------------------------------------------
  // TOMORROW
  // --------------------------------------------------------

  if (
    normalized === 'tomorrow' ||
    normalized === 'kal'
  ) {
    return {
      date: addDays(
        today,
        1
      ),
      source: 'relative',
      expression,
    };
  }

  // --------------------------------------------------------
  // DAY AFTER TOMORROW
  // --------------------------------------------------------

  if (
    normalized === 'day after tomorrow' ||
    normalized === 'parso'
  ) {
    return {
      date: addDays(
        today,
        2
      ),
      source: 'relative',
      expression,
    };
  }

  // --------------------------------------------------------
  // "IN N DAYS"
  // --------------------------------------------------------

  const inDaysMatch =
    normalized.match(
      /^in\s+(\d+)\s+days?$/
    );

  if (inDaysMatch) {
    const daysText =
      inDaysMatch[1];

    if (!daysText) {
      return null;
    }

    const days =
      Number(daysText);

    if (
      !Number.isInteger(days) ||
      days < 0
    ) {
      return null;
    }

    return {
      date: addDays(
        today,
        days
      ),
      source: 'relative',
      expression,
    };
  }

  // --------------------------------------------------------
  // "N DAYS LATER"
  // --------------------------------------------------------

  const daysLaterMatch =
    normalized.match(
      /^(\d+)\s+days?\s+later$/
    );

  if (daysLaterMatch) {
    const daysText =
      daysLaterMatch[1];

    if (!daysText) {
      return null;
    }

    const days =
      Number(daysText);

    if (
      !Number.isInteger(days) ||
      days < 0
    ) {
      return null;
    }

    return {
      date: addDays(
        today,
        days
      ),
      source: 'relative',
      expression,
    };
  }

  // --------------------------------------------------------
  // NEXT / COMING / AGLE WEEKDAY
  // --------------------------------------------------------

  const nextWeekdayMatch =
    normalized.match(
      /^(?:next|coming|agle)\s+(.+)$/
    );

  if (nextWeekdayMatch) {
    const weekdayName =
      nextWeekdayMatch[1];

    if (!weekdayName) {
      return null;
    }

    const target =
      getWeekdayIndex(
        weekdayName
      );

    if (target !== null) {
      return {
        date: nextWeekday(
          today,
          target
        ),
        source: 'relative',
        expression,
      };
    }
  }

  // --------------------------------------------------------
  // THIS / IS WEEKDAY
  // --------------------------------------------------------

  const thisWeekdayMatch =
    normalized.match(
      /^(?:this|is)\s+(.+)$/
    );

  if (thisWeekdayMatch) {
    const weekdayName =
      thisWeekdayMatch[1];

    if (!weekdayName) {
      return null;
    }

    const target =
      getWeekdayIndex(
        weekdayName
      );

    if (target !== null) {
      return {
        date: thisWeekday(
          today,
          target
        ),
        source: 'relative',
        expression,
      };
    }
  }

  // --------------------------------------------------------
  // THIS WEEKEND
  // --------------------------------------------------------

  if (
    normalized === 'this weekend' ||
    normalized === 'is weekend' ||
    normalized === 'ye weekend' ||
    normalized === 'iss weekend'
  ) {
    return {
      date: thisWeekday(
        today,
        6
      ),
      source: 'relative',
      expression,
    };
  }

  // --------------------------------------------------------
  // NEXT WEEKEND
  // --------------------------------------------------------

  if (
    normalized === 'next weekend' ||
    normalized === 'agle weekend'
  ) {
    return {
      date: nextWeekday(
        today,
        6
      ),
      source: 'relative',
      expression,
    };
  }

  // --------------------------------------------------------
  // NOT RESOLVED
  // --------------------------------------------------------

  return null;
}