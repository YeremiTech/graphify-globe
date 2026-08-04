import { hashString } from './utils.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function wrapLongitude(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function centerOutSlots(count) {
  const center = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b,
  );
}

/**
 * Spherical layout balanced by community/group bands.
 * Mutates lat/lon on the provided node objects (visible subset copies).
 */
export function applySphericalLayout(nodes) {
  if (!nodes.length) return nodes;

  const groupCounts = new Map();
  for (const node of nodes) {
    const group = node.group || node.communityName || 'Sin grupo';
    groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
  }

  const groups = [...groupCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([group]) => group);

  const membersByGroup = new Map(groups.map((group) => [group, []]));
  for (const node of nodes) {
    const group = node.group || node.communityName || 'Sin grupo';
    membersByGroup.get(group).push(node);
  }

  const total = Math.max(1, nodes.length);
  const yLimit = 0.985;
  let consumed = 0;

  groups.forEach((group, groupOrder) => {
    const members = membersByGroup.get(group) || [];
    const count = members.length;
    if (!count) return;

    members.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
    const top = yLimit - (consumed / total) * yLimit * 2;
    consumed += count;
    const bottom = yLimit - (consumed / total) * yLimit * 2;
    const bandHeight = top - bottom;
    const padding = groups.length > 1 ? Math.min(0.012, bandHeight * 0.08) : 0;
    const usableTop = top - padding * 0.5;
    const usableBottom = bottom + padding * 0.5;
    const usableHeight = Math.max(0.0001, usableTop - usableBottom);
    const phase = (hashString(group) / 4294967295) * Math.PI * 2 + groupOrder * 0.73;
    const slots = centerOutSlots(count);

    members.forEach((item, rank) => {
      const slot = slots[rank];
      const fraction = (slot + 0.5) / count;
      const y = usableTop - fraction * usableHeight;
      const theta = phase + slot * GOLDEN_ANGLE + fraction * 0.55;
      item.lat = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
      item.lon = wrapLongitude(theta * 180 / Math.PI);
    });
  });

  return nodes;
}
