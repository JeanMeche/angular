/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {FormStyle, TranslationType, TranslationWidth} from './format_date_interface';
import {
  getLocaleDayNames,
  getLocaleDayPeriods,
  getLocaleEraNames,
  getLocaleExtraDayPeriodRules,
  getLocaleExtraDayPeriods,
  getLocaleMonthNames,
} from './locale_data_api';

/**
 * Returns the locale translation of a date for a given form, type and width
 */
export function getDateTranslation(
  date: Date,
  locale: string,
  name: TranslationType,
  width: TranslationWidth,
  form: FormStyle,
  extended: boolean,
): string {
  switch (name) {
    case TranslationType.Months:
      return getLocaleMonthNames(locale, form, width)[date.getMonth()];
    case TranslationType.Days:
      return getLocaleDayNames(locale, form, width)[date.getDay()];
    case TranslationType.DayPeriods:
      const currentHours = date.getHours();
      const currentMinutes = date.getMinutes();
      if (extended) {
        const rules = getLocaleExtraDayPeriodRules(locale);
        const dayPeriods = getLocaleExtraDayPeriods(locale, form, width);
        const index = rules.findIndex((rule) => {
          if (Array.isArray(rule)) {
            // morning, afternoon, evening, night
            const [from, to] = rule;
            const afterFrom = currentHours >= from.hours && currentMinutes >= from.minutes;
            const beforeTo =
              currentHours < to.hours || (currentHours === to.hours && currentMinutes < to.minutes);
            // We must account for normal rules that span a period during the day (e.g. 6am-9am)
            // where `from` is less (earlier) than `to`. But also rules that span midnight (e.g.
            // 10pm - 5am) where `from` is greater (later!) than `to`.
            //
            // In the first case the current time must be BOTH after `from` AND before `to`
            // (e.g. 8am is after 6am AND before 10am).
            //
            // In the second case the current time must be EITHER after `from` OR before `to`
            // (e.g. 4am is before 5am but not after 10pm; and 11pm is not before 5am but it is
            // after 10pm).
            if (from.hours < to.hours) {
              if (afterFrom && beforeTo) {
                return true;
              }
            } else if (afterFrom || beforeTo) {
              return true;
            }
          } else {
            // noon or midnight
            if (rule.hours === currentHours && rule.minutes === currentMinutes) {
              return true;
            }
          }
          return false;
        });
        if (index !== -1) {
          return dayPeriods[index];
        }
      }
      // if no rules for the day periods, we use am/pm by default
      return getLocaleDayPeriods(locale, form, <TranslationWidth>width)[currentHours < 12 ? 0 : 1];
    case TranslationType.Eras:
      return getLocaleEraNames(locale, <TranslationWidth>width)[date.getFullYear() <= 0 ? 0 : 1];
    default:
      // This default case is not needed by TypeScript compiler, as the switch is exhaustive.
      // However Closure Compiler does not understand that and reports an error in typed mode.
      // The `throw new Error` below works around the problem, and the unexpected: never variable
      // makes sure tsc still checks this code is unreachable.
      const unexpected: never = name;
      throw new Error(`unexpected translation type ${unexpected}`);
  }
}
