/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

const NUMBER_FORMAT_REGEXP = /^(\d+)?\.((\d+)(-(\d+))?)?$/;

const NARROW_SYMBOL = 'narrowSymbol';
const SYMBOL = 'symbol';
const CURRENCY = 'currency';

/** Numbers */

// For values >= 1e21 the Intl implementation will return
// a string as scientific notation like the native api does
const scientificNotationLimit = 1e21;

export function formatIntlNumber(
  num: number,
  locale: string,
  digitsInfo?: string,
  asPercent: boolean = false,
): string {
  const {maximumFractionDigits, minimumIntegerDigits, minimumFractionDigits} =
    parseDigitInfo(digitsInfo);
  return Intl.NumberFormat(locale, {
    maximumFractionDigits,
    minimumIntegerDigits,
    minimumFractionDigits,
    style: asPercent ? 'percent' : 'decimal',
    notation: num < scientificNotationLimit ? 'standard' : 'scientific',
  }).format(num);
}

export function formatIntlCurrency(
  num: number,
  locale: string,
  displayOrCurrency: string,
  currencyCode?: string,
  forceCurrencyDisplay = false,
  digitsInfo?: string,
): string {
  const {maximumFractionDigits, minimumIntegerDigits, minimumFractionDigits} =
    parseDigitInfo(digitsInfo);

  if (displayOrCurrency === 'symbol-narrow') {
    displayOrCurrency = NARROW_SYMBOL;
  }

  // TODO: remove `as any` when ts target is updated to at least ES2022
  // Support for supportedValuesOf is M99/Fx93/Safari 15.4
  const isCurrencySupported =
    (Intl as any).supportedValuesOf?.(CURRENCY).includes(currencyCode) ?? true;
  const isValidDisplay = ['name', 'code', SYMBOL, NARROW_SYMBOL].includes(displayOrCurrency);

  const formatter = Intl.NumberFormat(locale, {
    maximumFractionDigits: isCurrencySupported
      ? maximumFractionDigits
      : Math.max(maximumFractionDigits ?? 0, 2),
    minimumIntegerDigits,
    minimumFractionDigits,
    style: CURRENCY,
    currencyDisplay: isValidDisplay ? displayOrCurrency : undefined,
    currency: isCurrencySupported ? currencyCode : 'USD', // USD is a placeholder, it will replaced
  });

  if (isValidDisplay && isCurrencySupported && !forceCurrencyDisplay) {
    return formatter.format(num);
  }

  // Fallback formatting where the currency is replaced
  const parts = formatter.formatToParts(num);
  return parts
    .map((part) => {
      if (part.type === CURRENCY) {
        // if isValidDisplay is false, displayOrCurrency is actually a currency label
        // if it's a valid display, we fallback to displayed the currency code
        part.value = isValidDisplay ? currencyCode ?? '' : displayOrCurrency;
      }
      return part.value;
    })
    .join('')
    .trim();
}

function parseIntAutoRadix(text: string): number {
  const result: number = parseInt(text);
  if (isNaN(result)) {
    // TODO: create a runtime error
    throw new Error(`Invalid integer literal when parsing ${text}`);
  }
  return result;
}

function parseDigitInfo(digitsInfo?: string) {
  let minimumIntegerDigits: undefined | number,
    minimumFractionDigits: undefined | number,
    maximumFractionDigits: undefined | number;
  if (digitsInfo) {
    const parts = digitsInfo.match(NUMBER_FORMAT_REGEXP);
    if (parts === null) {
      // TODO: create a runtime error
      throw new Error(`${digitsInfo} is not a valid digit info`);
    }
    const [, minIntPart, , minFractionPart, , maxFractionPart] = parts; // yes we want indices 1,3,5
    if (minIntPart != null) {
      minimumIntegerDigits = parseIntAutoRadix(minIntPart);
    }
    if (minFractionPart != null) {
      minimumFractionDigits = parseIntAutoRadix(minFractionPart);
    }
    if (maxFractionPart != null) {
      maximumFractionDigits = parseIntAutoRadix(maxFractionPart);
    } else if (
      minFractionPart != null &&
      minimumFractionDigits != null &&
      maximumFractionDigits != null &&
      minimumFractionDigits > maximumFractionDigits
    ) {
      maximumFractionDigits = minimumFractionDigits;
    }
  }

  return {
    // Intl minimumIntegerDigits bounds are 1...21, the angular DigitsInfo allows 0
    minimumIntegerDigits: minimumIntegerDigits === 0 ? 1 : minimumIntegerDigits,
    minimumFractionDigits: minimumFractionDigits,
    maximumFractionDigits: maximumFractionDigits,
  };
}