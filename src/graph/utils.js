export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function firstValue(object, keys) {
  for (const key of keys) {
    const parts = key.split('.');
    let current = object;
    let valid = true;
    for (const part of parts) {
      if (!isObject(current) && !Array.isArray(current)) {
        valid = false;
        break;
      }
      current = current?.[part];
    }
    if (valid && current !== undefined && current !== null && current !== '') return current;
  }
  return undefined;
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (isObject(value)) {
    return Object.entries(value).map(([key, item]) =>
      isObject(item) && item.id === undefined ? { ...item, id: key } : item,
    );
  }
  return [];
}

export function flattenEntity(entity) {
  if (!isObject(entity)) return entity;
  const nested = [entity.data, entity.properties, entity.attributes].filter(isObject);
  return Object.assign({}, entity, ...nested);
}

export function endpointId(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isObject(value)) {
    return String(
      firstValue(value, ['id', 'elementId', 'identity', 'key', 'data.id', 'properties.id', 'label']) || '',
    );
  }
  return String(value);
}

export function toSearchText(...parts) {
  return parts
    .flat()
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map((part) => String(part).toLocaleLowerCase('es'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sampleList(items, limit = 8) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items.slice(0, limit);
}

export function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
