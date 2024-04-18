/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {formatIntlCurrency, formatIntlNumber} from './intl_helpers';

/**
 * @ngModule CommonModule
 * @description
 *
 * Formats a number as currency using locale rules.
 *
 * @param value The number to format.
 * @param locale A locale code for the locale format rules to use.
 * @param currency A string containing the currency symbol or its name,
 * such as "$" or "Canadian Dollar". Used in output string, but does not affect the operation
 * of the function.
 * @param currencyCode The [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217)
 * currency code, such as `USD` for the US dollar and `EUR` for the euro.
 * Used to determine the number of digits in the decimal part.
 * @param digitsInfo Decimal representation options, specified by a string in the following format:
 * `{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`. See `DecimalPipe` for more details.
 *
 * @returns The formatted currency value.
 *
 * @see {@link formatNumber}
 * @see {@link DecimalPipe}
 * @see [Internationalization (i18n) Guide](guide/i18n)
 *
 * @publicApi
 */
export function formatCurrency(
  value: number,
  locale: string,
  display: 'code' | 'symbol' | 'symbol-narrow' | string,
  currencyCode?: string,
  digitsInfo?: string,
): string {
  const forceCurrencyDisplay = !['code', 'symbol', 'symbol-narrow'].includes(display);
  return formatIntlCurrency(value, locale, display, currencyCode, forceCurrencyDisplay, digitsInfo);
}

/**
 * @ngModule CommonModule
 * @description
 *
 * Formats a number as a percentage according to locale rules.
 *
 * @param value The number to format.
 * @param locale A locale code for the locale format rules to use.
 * @param digitsInfo Decimal representation options, specified by a string in the following format:
 * `{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`. See `DecimalPipe` for more details.
 *
 * @returns The formatted percentage value.
 *
 * @see {@link formatNumber}
 * @see {@link DecimalPipe}
 * @see [Internationalization (i18n) Guide](guide/i18n)
 * @publicApi
 *
 */
export function formatPercent(value: number, locale: string, digitsInfo?: string): string {
  return formatIntlNumber(value, locale, digitsInfo, /* asPercent*/ true);
}

/**
 * @ngModule CommonModule
 * @description
 *
 * Formats a number as text, with group sizing, separator, and other
 * parameters based on the locale.
 *
 * @param value The number to format.
 * @param locale A locale code for the locale format rules to use.
 * @param digitsInfo Decimal representation options, specified by a string in the following format:
 * `{minIntegerDigits}.{minFractionDigits}-{maxFractionDigits}`. See `DecimalPipe` for more details.
 *
 * @returns The formatted text string.
 * @see [Internationalization (i18n) Guide](guide/i18n)
 *
 * @publicApi
 */
export function formatNumber(value: number, locale: string, digitsInfo?: string): string {
  return formatIntlNumber(value, locale, digitsInfo);
}
