/*!
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

export type Transform<T> = (input: T) => T | Promise<T>;

export type ComposableTransform<T, U> = (input: T) => U | Promise<U>;

export async function applyTransforms<T, U>(
  initial: T,
  transforms: [
    ComposableTransform<T, any>,
    ...ComposableTransform<any, any>[],
    ComposableTransform<any, U>,
  ],
): Promise<U> {
  let current: any = initial;
  for (const transform of transforms) {
    current = await transform(current);
  }
  return current;
}
