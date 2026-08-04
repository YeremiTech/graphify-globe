const KIND_ORDER = [
  "class",
  "interface",
  "method",
  "function",
  "file",
  "package",
  "module",
  "table",
  "config",
  "endpoint",
  "project",
  "workspace",
  "folder",
  "group",
  "default"
];
const KIND_COLORS = {
  class: "#39e97e",
  interface: "#35dcff",
  method: "#f02ba6",
  function: "#f02ba6",
  file: "#2d8cff",
  package: "#9c68ff",
  module: "#9c68ff",
  table: "#e8f12f",
  config: "#ff7a33",
  endpoint: "#ffca4b",
  project: "#5ad4a0",
  workspace: "#5ad4a0",
  folder: "#3ca88a",
  group: "#63b993",
  default: "#b7dfcf"
};
const KIND_TO_CODE = new Map(KIND_ORDER.map((kind, index) => [kind, index]));
function kindToCode(kind) {
  return KIND_TO_CODE.get(kind) ?? KIND_TO_CODE.get("default");
}
function codeToKind(code) {
  return KIND_ORDER[code] || "default";
}
function kindColor(kind) {
  return KIND_COLORS[kind] || KIND_COLORS.default;
}
export {
  KIND_COLORS,
  KIND_ORDER,
  codeToKind,
  kindColor,
  kindToCode
};
