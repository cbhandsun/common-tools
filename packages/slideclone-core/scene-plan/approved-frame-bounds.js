// @ts-check
"use strict";

/** Internal reads from parsed arrays or normalized byte views. Out-of-range
 * geometry must fail instead of propagating undefined colours or coordinates.
 * @template T @param {ArrayLike<T>} values @param {number} index @returns {T} */
function required(values, index) {
  const value = values[index];
  if (value === undefined) throw new RangeError("approx-frame-array-boundary");
  return value;
}

module.exports = { required };
