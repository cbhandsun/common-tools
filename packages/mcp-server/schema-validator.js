// @ts-check
"use strict";

/** @typedef {Record<string, unknown>} JsonSchema */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @param {JsonSchema} schema @returns {boolean} */
function matchesSchema(value, schema) {
  if (Object.prototype.hasOwnProperty.call(schema, "const") && value !== schema.const) return false;
  if (Array.isArray(schema.oneOf)) {
    if (schema.oneOf.length < 1 || schema.oneOf.filter((candidate) => isObject(candidate) && matchesSchema(value, candidate)).length !== 1) return false;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value)) return false;
    return true;
  }
  if (schema.type === "integer") {
    if (!Number.isSafeInteger(value)) return false;
    if (typeof schema.minimum === "number" && Number(value) < schema.minimum) return false;
    if (typeof schema.maximum === "number" && Number(value) > schema.maximum) return false;
    return true;
  }
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (schema.uniqueItems === true && new Set(value).size !== value.length) return false;
    const itemSchema = schema.items;
    return !isObject(itemSchema) || value.every((item) => matchesSchema(item, itemSchema));
  }
  if (schema.type === "object") {
    if (!isObject(value)) return false;
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (required.some((name) => typeof name !== "string" || !Object.prototype.hasOwnProperty.call(value, name))) return false;
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const [name, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[name];
      if (propertySchema === undefined) {
        if (schema.additionalProperties === false) return false;
      } else if (!isObject(propertySchema) || !matchesSchema(propertyValue, propertySchema)) return false;
    }
    return true;
  }
  return false;
}

/** @param {unknown} schema @returns {(value: unknown) => boolean} */
function compileSchema(schema) {
  if (!isObject(schema) || !["object", "array", "string", "integer", "boolean"].includes(String(schema.type))) throw new TypeError("JSON schema is invalid");
  return (value) => matchesSchema(value, schema);
}

module.exports = { compileSchema, isObject, matchesSchema };
