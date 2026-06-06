/** Runtime-checked non-null assertion — the call form of the postfix `!`
 *  operator, used so `lint/style/noNonNullAssertion` stays clean while keeping
 *  the same "this value is definitely present" contract. Throws on
 *  null/undefined (in correct code the throw is unreachable, exactly like `!`
 *  promised); the happy path is a single comparison V8 inlines away.
 *
 *  `x!.y`  →  `nn(x).y`
 *  `arr![0]`  →  `nn(arr)[0]`
 *  `(await page.boundingBox())!`  →  `nn(await page.boundingBox())`
 */
export function nn<T>(value: T, message?: string): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message ?? "nn(): unexpected null or undefined");
  }
  return value as NonNullable<T>;
}
